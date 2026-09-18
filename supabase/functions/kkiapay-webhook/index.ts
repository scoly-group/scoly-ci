// Webhook KkiaPay : notification serveur après un paiement.
// La transaction est toujours revérifiée auprès de l'API KkiaPay avant validation.
import { adminClient, corsHeaders, json, settleTransaction, verifyTransaction } from "../_shared/kkiapay.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    console.log("[kkiapay-webhook] payload:", JSON.stringify(body));

    const transactionId = String(
      (body as any).transactionId ?? (body as any).transaction_id ?? (body as any).id ?? "",
    ).trim();
    if (!transactionId) return json({ error: "transactionId manquant" }, 400);

    const stateData = (body as any).state ?? (body as any).data ?? {};
    const orderId =
      typeof stateData?.order_id === "string" ? stateData.order_id : null;

    const verification = await verifyTransaction(transactionId);
    console.log("[kkiapay-webhook] vérification:", transactionId, verification.status);

    const admin = adminClient();
    const amount = Number(verification.amount || (body as any).amount || 0);
    const performedAt = String((verification.raw as any).performedAt ?? (body as any).performedAt ?? "").trim() || null;
    await admin.from("kkiapay_events").upsert({
      transaction_id: transactionId,
      event_type: String((body as any).event ?? "transaction.received"),
      provider_status: verification.status,
      amount,
      performed_at: performedAt,
      account: String((body as any).account ?? "") || null,
      order_id: orderId,
      payload: body,
      reconciliation_status: "pending",
      reconciliation_error: null,
    }, { onConflict: "transaction_id" });

    const settled = await settleTransaction(admin, { transactionId, orderId, verification });

    if (!settled.ok) {
      console.error("[kkiapay-webhook] échec:", settled.error);
      await admin.from("kkiapay_events").update({
        reconciliation_status: "unmatched",
        reconciliation_error: settled.error,
      }).eq("transaction_id", transactionId);
      // 200 pour éviter les renvois infinis quand la commande est inconnue.
      return json({ received: true, handled: false, reason: settled.error });
    }

    await admin.from("kkiapay_events").update({
      order_id: settled.orderId,
      reconciliation_status: "settled",
      reconciliation_error: null,
    }).eq("transaction_id", transactionId);

    return json({ received: true, verified: verification.ok, order_id: settled.orderId });
  } catch (e) {
    console.error("[kkiapay-webhook]", e);
    return json({ error: (e as Error).message }, 500);
  }
});
