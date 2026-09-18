// Vérifie une transaction KkiaPay après paiement côté client, puis valide la commande.
import { createClient } from "npm:@supabase/supabase-js@2";
import { adminClient, corsHeaders, json, settleTransaction, verifyTransaction } from "../_shared/kkiapay.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "").trim();
    if (!token) return json({ error: "Unauthorized" }, 401);

    const authed = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: claims } = await authed.auth.getClaims(token);
    const userId = (claims?.claims?.sub as string) ?? null;
    if (!userId) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const transactionId = typeof body.transactionId === "string" ? body.transactionId.trim() : "";
    const orderId = typeof body.orderId === "string" ? body.orderId.trim() : "";
    if (!transactionId || !orderId) return json({ error: "transactionId et orderId requis" }, 400);

    const admin = adminClient();

    const { data: order } = await admin
      .from("orders")
      .select("id, user_id, total_amount, status")
      .eq("id", orderId)
      .maybeSingle();
    if (!order) return json({ error: "Commande introuvable" }, 404);
    if (order.user_id !== userId) return json({ error: "Forbidden" }, 403);

    const verification = await verifyTransaction(transactionId);
    console.log("[verify-kkiapay-payment]", transactionId, verification.status, verification.amount);

    await admin.from("kkiapay_events").upsert({
      transaction_id: transactionId,
      event_type: "client.verification",
      provider_status: verification.status,
      amount: verification.amount,
      order_id: orderId,
      payload: verification.raw,
      reconciliation_status: verification.ok ? "pending" : "failed",
      reconciliation_error: verification.ok ? null : "payment_not_successful",
    }, { onConflict: "transaction_id" });

    if (verification.ok && verification.amount + 1 < Number(order.total_amount ?? 0)) {
      return json({ success: false, status: "amount_mismatch" }, 400);
    }

    const settled = await settleTransaction(admin, { transactionId, orderId, verification });
    if (!settled.ok) return json({ success: false, error: settled.error }, 400);

    await admin.from("kkiapay_events").update({
      reconciliation_status: "settled",
      reconciliation_error: null,
    }).eq("transaction_id", transactionId);

    return json({
      success: verification.ok,
      status: verification.ok ? "completed" : "failed",
      kkiapay_status: verification.status,
      order_id: orderId,
    });
  } catch (e) {
    console.error("[verify-kkiapay-payment]", e);
    return json({ error: (e as Error).message }, 500);
  }
});
