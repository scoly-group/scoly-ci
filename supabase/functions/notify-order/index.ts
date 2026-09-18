// Envoi automatique des notifications de commande (SMS Côte d'Ivoire / WhatsApp ailleurs).
import { createClient } from "npm:@supabase/supabase-js@2";
import { adminClient, renderTemplate, sendMessage } from "../_shared/messaging.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const EVENT_TEMPLATES: Record<string, string> = {
  order_placed: "order_placed",
  payment_confirmed: "payment_confirmed",
  order_confirmed: "order_confirmed",
  order_shipped: "order_shipped",
  order_in_transit: "order_in_transit",
  order_arrived: "order_arrived",
  order_delivered: "order_delivered",
  order_cancelled: "order_cancelled",
};

/** Numéros de l'équipe SCOLY alertés à chaque paiement encaissé. */
const ADMIN_ALERT_NUMBERS = (Deno.env.get("ADMIN_ALERT_PHONES") ?? "+2250702584457")
  .split(",")
  .map((n) => n.trim())
  .filter(Boolean);

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const orderId = typeof body.order_id === "string" ? body.order_id : null;
    const event = typeof body.event === "string" ? body.event : null;
    if (!orderId || !event || !EVENT_TEMPLATES[event]) {
      return json({ error: "order_id et event valides requis" }, 400);
    }

    const admin = adminClient();

    // Appel interne (service role) ou appel utilisateur (propriétaire / staff).
    let callerId: string | null = null;
    if (token !== SERVICE_KEY) {
      const authed = createClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: `Bearer ${token}` } },
      });
      const { data: claims } = await authed.auth.getClaims(token);
      callerId = (claims?.claims?.sub as string) ?? null;
      if (!callerId) return json({ error: "Unauthorized" }, 401);
    }

    const { data: order } = await admin
      .from("orders")
      .select("id, user_id, phone, shipping_address, total_amount, delivery_user_id")
      .eq("id", orderId)
      .maybeSingle();

    if (!order) return json({ error: "Commande introuvable" }, 404);

    if (callerId) {
      let allowed = order.user_id === callerId || order.delivery_user_id === callerId;
      if (!allowed) {
        const { data: roles } = await admin
          .from("user_roles")
          .select("role")
          .eq("user_id", callerId);
        const list = (roles ?? []).map((r: { role: string }) => r.role);
        allowed = ["super_admin", "moderator", "commercial", "delivery"].some((r) =>
          list.includes(r),
        );
      }
      if (!allowed) return json({ error: "Forbidden" }, 403);
    }

    let nom = "";
    if (order.user_id) {
      const { data: profile } = await admin
        .from("profiles")
        .select("first_name, last_name, phone")
        .eq("id", order.user_id)
        .maybeSingle();
      nom = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ").trim();
      if (!order.phone && profile?.phone) order.phone = profile.phone;
    }

    // Copie automatique à l'équipe SCOLY dès qu'un paiement est encaissé.
    if (event === "payment_confirmed" || event === "order_confirmed") {
      const alertMessage =
        `SCOLY : paiement encaisse. Commande #${String(order.id).slice(0, 8).toUpperCase()} - ` +
        `${Number(order.total_amount ?? 0).toLocaleString("fr-FR")} FCFA` +
        `${nom ? ` - ${nom}` : ""}. A traiter dans l'administration.`;
      for (const raw of ADMIN_ALERT_NUMBERS) {
        try {
          await sendMessage(admin, raw, alertMessage, {
            templateKey: "admin_payment_alert",
            orderId: order.id,
            metadata: { event, audience: "admin" },
          });
        } catch (e) {
          console.error("[notify-order] alerte admin impossible:", e);
        }
      }
    }

    if (!order.phone) return json({ ok: false, skipped: "Aucun numéro de téléphone" });

    const templateKey = EVENT_TEMPLATES[event];
    const { data: tpl } = await admin
      .from("sms_templates")
      .select("body, is_active")
      .eq("key", templateKey)
      .maybeSingle();

    if (!tpl || !tpl.is_active) return json({ ok: false, skipped: `Modèle ${templateKey} inactif` });

    const message = renderTemplate(tpl.body, {
      nom: nom || "cher client",
      numero_commande: String(order.id).slice(0, 8).toUpperCase(),
      montant: Number(order.total_amount ?? 0).toLocaleString("fr-FR"),
      adresse: order.shipping_address ?? "",
    });

    const result = await sendMessage(admin, order.phone, message, {
      templateKey,
      orderId: order.id,
      sentBy: callerId,
      metadata: { event },
    });

    // Repli e-mail : si ni le SMS ni WhatsApp n'aboutissent, le client est
    // prévenu par courriel pour les étapes clés de sa commande.
    let emailFallback: string | null = null;
    if (!result.ok) {
      const emailType =
        event === "order_shipped"
          ? "shipped"
          : event === "order_delivered"
            ? "delivered"
            : "confirmation";
      try {
        const { error: mailError } = await admin.functions.invoke("send-order-email", {
          body: { orderId: order.id, emailType },
        });
        emailFallback = mailError ? "failed" : "sent";
      } catch (e) {
        console.error("[notify-order] repli e-mail impossible:", e);
        emailFallback = "failed";
      }
    }

    return json({ ...result, emailFallback }, result.ok || emailFallback === "sent" ? 200 : 502);
  } catch (e) {
    console.error("[notify-order]", e);
    return json({ error: (e as Error).message }, 500);
  }
});
