// Notifications de commande SCOLY : un seul message par événement, destinataire et canal.
// Règles :
//  - À la création de toute commande : une seule alerte SMS à l'équipe (numéro + mode de paiement).
//  - Paiement en ligne encaissé : le client est notifié (SMS + e-mail), puis à chaque changement de statut.
//  - Paiement à la livraison : le client n'est notifié qu'après validation par l'administration.
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

/** Événements déclenchés avant toute validation d'équipe. */
const CREATION_EVENTS = new Set(["order_placed"]);
/** Événements considérés comme « paiement en ligne encaissé ». */
const PAID_EVENTS = new Set(["payment_confirmed"]);

/** Numéros de l'équipe SCOLY alertés à chaque nouvelle commande. */
const ADMIN_ALERT_NUMBERS = (Deno.env.get("ADMIN_ALERT_PHONES") ?? "+2250702584457")
  .split(",")
  .map((n) => n.trim())
  .filter(Boolean);

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/** Réservation atomique : renvoie true une seule fois par (commande, événement, canal, destinataire). */
async function claim(
  admin: ReturnType<typeof adminClient>,
  orderId: string,
  event: string,
  channel: string,
  recipient: string,
) {
  const { data, error } = await admin.rpc("claim_notification", {
    _order_id: orderId,
    _event: event,
    _channel: channel,
    _recipient: recipient,
  });
  if (error) {
    console.error("[notify-order] claim_notification:", error);
    return true; // ne jamais bloquer un envoi à cause du registre
  }
  return data === true;
}

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
      .select(
        "id, user_id, phone, shipping_address, total_amount, delivery_user_id, payment_option, payment_method, status",
      )
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

    const reference = String(order.id).slice(0, 8).toUpperCase();
    const onDelivery = String(order.payment_option ?? "") === "on_delivery";
    const paymentLabel = onDelivery ? "paiement à la livraison" : "paiement en ligne";
    const montant = Number(order.total_amount ?? 0).toLocaleString("fr-FR");

    // ---- 1. Alerte équipe : une seule fois, à la création ou à l'encaissement.
    const adminResults: Array<{ to: string; ok: boolean; skipped?: boolean }> = [];
    if (CREATION_EVENTS.has(event) || PAID_EVENTS.has(event)) {
      const alertMessage = CREATION_EVENTS.has(event)
        ? `SCOLY : nouvelle commande #${reference} - ${montant} FCFA - ${paymentLabel}` +
          `${nom ? ` - ${nom}` : ""}. A traiter dans l'administration.`
        : `SCOLY : paiement encaisse. Commande #${reference} - ${montant} FCFA` +
          `${nom ? ` - ${nom}` : ""}. A traiter dans l'administration.`;

      for (const raw of ADMIN_ALERT_NUMBERS) {
        const fresh = await claim(admin, order.id, `${event}:admin`, "sms", raw);
        if (!fresh) {
          adminResults.push({ to: raw, ok: true, skipped: true });
          continue;
        }
        try {
          const r = await sendMessage(admin, raw, alertMessage, {
            templateKey: "admin_order_alert",
            orderId: order.id,
            metadata: { event, audience: "admin", payment_option: order.payment_option },
          });
          adminResults.push({ to: raw, ok: r.ok });
        } catch (e) {
          console.error("[notify-order] alerte admin impossible:", e);
          adminResults.push({ to: raw, ok: false });
        }
      }
    }

    // ---- 2. Client : règles selon le mode de paiement.
    // Paiement à la livraison : aucun message client avant la validation de l'équipe.
    if (onDelivery && CREATION_EVENTS.has(event)) {
      return json({ ok: true, admin: adminResults, client: "differe_jusqu_a_validation" });
    }
    // Paiement en ligne : pas de message client tant que le paiement n'est pas encaissé.
    if (!onDelivery && CREATION_EVENTS.has(event)) {
      return json({ ok: true, admin: adminResults, client: "en_attente_de_paiement" });
    }

    if (!order.phone) return json({ ok: true, admin: adminResults, skipped: "Aucun numéro de téléphone" });

    const templateKey = EVENT_TEMPLATES[event];
    const { data: tpl } = await admin
      .from("sms_templates")
      .select("body, is_active")
      .eq("key", templateKey)
      .maybeSingle();

    let smsResult: Record<string, unknown> = { ok: true, skipped: true };
    if (tpl?.is_active) {
      const fresh = await claim(admin, order.id, event, "sms", order.phone);
      if (fresh) {
        const message = renderTemplate(tpl.body, {
          nom: nom || "cher client",
          numero_commande: reference,
          montant,
          adresse: order.shipping_address ?? "",
        });
        smsResult = await sendMessage(admin, order.phone, message, {
          templateKey,
          orderId: order.id,
          sentBy: callerId,
          metadata: { event },
        });
      } else {
        smsResult = { ok: true, deduplicated: true };
      }
    }

    // ---- 3. E-mail client pour les étapes clés (une seule fois par étape).
    let emailResult: string | null = null;
    const emailType =
      event === "order_shipped"
        ? "shipped"
        : event === "order_delivered"
          ? "delivered"
          : event === "payment_confirmed" || event === "order_confirmed"
            ? "confirmation"
            : null;
    if (emailType) {
      const fresh = await claim(admin, order.id, event, "email", order.user_id ?? reference);
      if (!fresh) {
        emailResult = "deduplicated";
      } else {
        try {
          const { error: mailError } = await admin.functions.invoke("send-order-email", {
            body: { orderId: order.id, emailType },
          });
          emailResult = mailError ? "failed" : "sent";
        } catch (e) {
          console.error("[notify-order] e-mail impossible:", e);
          emailResult = "failed";
        }
      }
    }

    return json({ ok: true, admin: adminResults, sms: smsResult, email: emailResult });
  } catch (e) {
    console.error("[notify-order]", e);
    return json({ error: (e as Error).message }, 500);
  }
});
