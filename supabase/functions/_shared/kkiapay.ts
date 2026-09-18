// Vérification serveur-à-serveur des transactions KkiaPay.
import { createClient } from "npm:@supabase/supabase-js@2";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

export const KKIAPAY_PUBLIC_KEY = Deno.env.get("KKIAPAY_PUBLIC_KEY") ?? "";
const KKIAPAY_PRIVATE_KEY = Deno.env.get("KKIAPAY_PRIVATE_KEY") ?? "";
const KKIAPAY_SECRET = Deno.env.get("KKIAPAY_SECRET") ?? Deno.env.get("KKIAPAY_SECRET_KEY") ?? "";

export function adminClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

export interface KkiapayVerification {
  ok: boolean;
  status: string;
  amount: number;
  raw: Record<string, unknown>;
  httpStatus: number;
}

/** Interroge l'API KkiaPay pour connaître le vrai statut d'une transaction. */
export async function verifyTransaction(transactionId: string): Promise<KkiapayVerification> {
  const res = await fetch("https://api.kkiapay.me/api/v1/transactions/status", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": KKIAPAY_PUBLIC_KEY,
      "x-private-key": KKIAPAY_PRIVATE_KEY,
      "x-secret-key": KKIAPAY_SECRET,
    },
    body: JSON.stringify({ transactionId }),
  });

  let raw: Record<string, unknown> = {};
  try {
    raw = await res.json();
  } catch {
    raw = {};
  }

  const status = String(raw.status ?? "").toUpperCase();
  return {
    ok: res.ok && status === "SUCCESS",
    status: status || (res.ok ? "UNKNOWN" : `HTTP_${res.status}`),
    amount: Number(raw.amount ?? 0),
    raw,
    httpStatus: res.status,
  };
}

type Admin = ReturnType<typeof adminClient>;

/**
 * Déduit le moyen de paiement réellement utilisé (Orange, MTN, Moov, Wave,
 * carte bancaire, virement) à partir de la réponse KkiaPay.
 */
export function detectPaymentMethod(raw: Record<string, unknown>): string {
  const source = [
    (raw as any)?.source,
    (raw as any)?.paymentMethod,
    (raw as any)?.payment_method,
    (raw as any)?.network,
    (raw as any)?.provider,
    (raw as any)?.type,
    (raw as any)?.source_common_name,
    (raw as any)?.account?.network,
  ]
    .filter(Boolean)
    .join(' ')
    .toUpperCase();

  if (/WAVE/.test(source)) return 'Wave';
  if (/ORANGE|OM\b/.test(source)) return 'Orange Money';
  if (/MTN|MOMO/.test(source)) return 'MTN Money';
  if (/MOOV|FLOOZ/.test(source)) return 'Moov Money';
  if (/VISA|MASTERCARD|CARD|CARTE|CB\b/.test(source)) return 'Carte bancaire';
  if (/BANK|VIREMENT|TRANSFER/.test(source)) return 'Virement bancaire';
  if (/MOBILE|MOMO|MOBILE_MONEY/.test(source)) return 'Mobile Money';
  return 'Mobile Money';
}

/**
 * Crée (ou retrouve) la ligne de paiement liée à la transaction puis finalise
 * la commande de façon atomique : statut, notifications et commissions.
 */
export async function settleTransaction(
  admin: Admin,
  params: {
    transactionId: string;
    orderId?: string | null;
    verification: KkiapayVerification;
    /** Montant réellement attendu (encaissement équipe : total moins frais KkiaPay). */
    expectedAmount?: number;
    /** Membre de l'équipe qui a encaissé, le cas échéant. */
    collectedBy?: string | null;
  },
) {
  const { transactionId, verification } = params;

  // Paiement déjà enregistré pour cette transaction ?
  const { data: existing } = await admin
    .from("payments")
    .select("id, order_id, status")
    .eq("transaction_id", transactionId)
    .maybeSingle();

  let paymentId = existing?.id as string | undefined;
  // Une transaction déjà liée à une commande ne peut pas être réaffectée à une autre.
  let orderId = existing?.order_id ?? params.orderId ?? null;

  if (!orderId) {
    // Repli : la commande référence la transaction.
    const { data: refOrder } = await admin
      .from("orders")
      .select("id")
      .eq("payment_reference", transactionId)
      .maybeSingle();
    orderId = refOrder?.id ?? null;
  }
  if (!orderId) return { ok: false, error: "order_not_found" as const };

  const { data: order } = await admin
    .from("orders")
    .select("id, user_id, total_amount, phone")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return { ok: false, error: "order_not_found" as const };

  // Contrôle du montant réellement encaissé : une transaction valide mais
  // inférieure au montant attendu ne peut jamais confirmer la commande.
  const orderTotal = Number(order.total_amount ?? 0);
  const expected = Number(params.expectedAmount ?? orderTotal);
  const paidAmount = Number(verification.amount ?? 0);
  const amountOk = paidAmount + 1 >= expected;
  const settlementOk = verification.ok && amountOk;
  if (verification.ok && !amountOk) {
    console.error(
      `[kkiapay] montant insuffisant: transaction ${transactionId} = ${paidAmount}, attendu ${expected} (commande ${orderId} = ${orderTotal})`,
    );
  }

  // Scoly ne conserve aucun paiement échoué ou en attente : si la transaction
  // n'est pas réellement encaissée, aucune ligne n'est créée (et une éventuelle
  // ligne provisoire est supprimée).
  if (!settlementOk) {
    if (paymentId) await admin.from("payments").delete().eq("id", paymentId);
    return {
      ok: false,
      error: verification.ok ? "amount_mismatch" : "payment_not_successful",
      orderId,
    };
  }

  const method = detectPaymentMethod(verification.raw);

  if (!paymentId) {
    // Encaissement par l'équipe : le montant comptabilisé reste le total officiel,
    // les frais KkiaPay absorbés sont isolés dans fee_amount.
    const staffCollected = Boolean(params.collectedBy) && expected < orderTotal;
    const recorded = staffCollected ? orderTotal : (paidAmount || orderTotal);
    const { data: created, error } = await admin
      .from("payments")
      .insert({
        order_id: order.id,
        user_id: order.user_id,
        amount: recorded,
        subtotal_amount: paidAmount || recorded,
        fee_amount: staffCollected ? Math.max(0, orderTotal - paidAmount) : 0,
        payment_method: method,
        status: "pending",
        transaction_id: transactionId,
        payment_reference: transactionId,
        phone_number: order.phone,
        metadata: {
          provider: "kkiapay",
          method,
          ...(params.collectedBy ? { collected_by: params.collectedBy, channel: "manual" } : {}),
        },
      })
      .select("id")
      .single();
    if (error) return { ok: false, error: error.message };
    paymentId = created.id;
  } else if (existing?.status === "completed") {
    return { ok: true, alreadyProcessed: true, paymentId, orderId };
  } else {
    await admin.from("payments").update({ payment_method: method }).eq("id", paymentId);
  }

  // Le moyen de paiement détecté est aussi porté par la commande (affichage reçu).
  await admin.from("orders").update({ payment_method: method }).eq("id", order.id);

  const { data: result, error: rpcError } = await admin.rpc("finalize_payment_atomic", {
    _payment_id: paymentId,
    _transaction_id: transactionId,
    _status: "completed",
    _metadata: {
      provider: "kkiapay",
      kkiapay_status: verification.status,
      verified_amount: paidAmount,
      order_total: orderTotal,
      method,
    },
  });
  if (rpcError) return { ok: false, error: rpcError.message };

  const row = Array.isArray(result) ? result[0] : result;

  // Notification client + équipe (SMS/WhatsApp/e-mail) — non bloquante.
  try {
    await admin.functions.invoke("notify-order", {
      body: { order_id: orderId, event: "payment_confirmed" },
    });
  } catch (e) {
    console.error("[kkiapay] notify-order:", e);
  }

  // Reçu officiel envoyé automatiquement par e-mail au client — non bloquant.
  try {
    await admin.functions.invoke("generate-receipt-pdf", {
      body: { order_id: orderId, email: true },
    });
  } catch (e) {
    console.error("[kkiapay] envoi automatique du reçu:", e);
  }

  return { ok: true, paymentId, orderId, confirmed: Boolean(row?.order_confirmed) };
}
