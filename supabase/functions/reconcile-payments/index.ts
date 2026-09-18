// Rattrapage des paiements : vérifie auprès de KkiaPay les commandes qui
// référencent une transaction sans être confirmées, puis nettoie toute trace
// de paiement non encaissé. Réservé à l'équipe (admin / comptable).
import { createClient } from "npm:@supabase/supabase-js@2";
import { adminClient, corsHeaders, json, settleTransaction, verifyTransaction } from "../_shared/kkiapay.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

/** Nombre maximum de commandes analysées par exécution. */
const BATCH_SIZE = 40;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "").trim();
    if (!token) return json({ error: "Unauthorized" }, 401);

    const admin = adminClient();

    if (token !== SERVICE_KEY) {
      const authed = createClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${token}` } },
      });
      const { data: claims } = await authed.auth.getClaims(token);
      const userId = (claims?.claims?.sub as string) ?? null;
      if (!userId) return json({ error: "Unauthorized" }, 401);

      const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", userId);
      const list = (roles ?? []).map((r: { role: string }) => r.role);
      const allowed = ["super_admin", "moderator", "comptable"].some((r) => list.includes(r));
      if (!allowed) return json({ error: "Forbidden" }, 403);
    }

    // 1) Commandes qui référencent une transaction mais ne sont pas confirmées.
    const { data: orders } = await admin
      .from("orders")
      .select("id, payment_reference, status")
      .not("payment_reference", "is", null)
      .in("status", ["pending", "cancelled"])
      .order("created_at", { ascending: false })
      .limit(BATCH_SIZE);

    let recovered = 0;
    const checked: string[] = [];

    // 1) Événements reçus par webhook mais pas encore rapprochés.
    const { data: pendingEvents } = await admin
      .from("kkiapay_events")
      .select("transaction_id, order_id")
      .in("reconciliation_status", ["pending", "unmatched"])
      .order("received_at", { ascending: true })
      .limit(BATCH_SIZE);

    for (const event of pendingEvents ?? []) {
      try {
        const verification = await verifyTransaction(event.transaction_id);
        const settled = await settleTransaction(admin, {
          transactionId: event.transaction_id,
          orderId: event.order_id,
          verification,
        });
        await admin.from("kkiapay_events").update({
          order_id: settled.orderId ?? event.order_id,
          provider_status: verification.status,
          amount: verification.amount,
          reconciliation_status: settled.ok ? "settled" : "unmatched",
          reconciliation_error: settled.ok ? null : settled.error,
        }).eq("transaction_id", event.transaction_id);
        if (settled.ok) recovered += 1;
      } catch (e) {
        await admin.from("kkiapay_events").update({
          reconciliation_status: "error",
          reconciliation_error: (e as Error).message,
        }).eq("transaction_id", event.transaction_id);
      }
    }

    // 2) Anciennes commandes qui contiennent déjà une référence de transaction.
    for (const order of orders ?? []) {
      const transactionId = String(order.payment_reference ?? "").trim();
      if (!transactionId) continue;
      checked.push(order.id);
      try {
        const verification = await verifyTransaction(transactionId);
        if (!verification.ok) continue;
        const settled = await settleTransaction(admin, {
          transactionId,
          orderId: order.id,
          verification,
        });
        if (settled.ok) recovered += 1;
      } catch (e) {
        console.error("[reconcile-payments]", order.id, e);
      }
    }

    // 3) Aucun paiement non encaissé ne reste visible.
    const { data: removed } = await admin
      .from("payments")
      .delete()
      .neq("status", "completed")
      .select("id");

    return json({
      ok: true,
      checked: checked.length,
      webhook_events_checked: (pendingEvents ?? []).length,
      recovered,
      purged: (removed ?? []).length,
    });
  } catch (e) {
    console.error("[reconcile-payments]", e);
    return json({ error: (e as Error).message }, 500);
  }
});
