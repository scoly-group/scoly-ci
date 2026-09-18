// Analyse les produits/kits les moins vendus et propose des ventes flash.
// L'IA choisit le pourcentage de remise ; une règle de repli s'applique si l'IA échoue.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const authed = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData, error: authError } = await authed.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    if (authError || !userData?.user) return json({ error: "Invalid token" }, 401);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: roleRow } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .in("role", ["moderator", "super_admin"])
      .maybeSingle();
    if (!roleRow) return json({ error: "Forbidden" }, 403);

    const body = await req.json().catch(() => ({}));
    const limit = Math.min(Math.max(Number(body?.limit) || 5, 1), 10);

    // 1) Catalogue actif sans vente flash en cours
    const { data: products, error: prodErr } = await admin
      .from("products")
      .select("id, name_fr, price, original_price, discount_percent, stock, views, is_active")
      .eq("is_active", true)
      .or("discount_percent.is.null,discount_percent.eq.0")
      .limit(300);
    if (prodErr) return json({ error: prodErr.message }, 500);
    if (!products?.length) return json({ suggestions: [] });

    // 2) Ventes des 90 derniers jours
    const since = new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString();
    const { data: soldItems } = await admin
      .from("order_items")
      .select("product_id, quantity, created_at")
      .gte("created_at", since)
      .limit(5000);

    const sold = new Map<string, number>();
    for (const it of soldItems || []) {
      if (!it.product_id) continue;
      sold.set(it.product_id, (sold.get(it.product_id) || 0) + Number(it.quantity || 0));
    }

    // 3) Les moins vendus d'abord, en gardant du stock disponible
    const ranked = products
      .filter((p) => Number(p.stock || 0) > 0)
      .map((p) => ({
        id: p.id,
        name: p.name_fr,
        price: Number(p.price || 0),
        stock: Number(p.stock || 0),
        views: Number(p.views || 0),
        sold: sold.get(p.id) || 0,
      }))
      .sort((a, b) => a.sold - b.sold || b.stock - a.stock)
      .slice(0, limit);

    if (!ranked.length) return json({ suggestions: [] });

    // Règle de repli : plus le stock dort, plus la remise est forte.
    const fallback = (p: typeof ranked[number]) => {
      if (p.sold === 0 && p.stock > 20) return 30;
      if (p.sold === 0) return 25;
      if (p.sold <= 2) return 20;
      return 15;
    };

    let suggestions = ranked.map((p) => ({
      product_id: p.id,
      name: p.name,
      price: p.price,
      stock: p.stock,
      sold_90d: p.sold,
      discount_percent: fallback(p),
      reason: p.sold === 0
        ? "Aucune vente sur 90 jours et du stock disponible."
        : `Seulement ${p.sold} vente(s) sur 90 jours.`,
      duration_days: 7,
      ai: false,
    }));

    // 4) Affinage par l'IA (non bloquant)
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (LOVABLE_API_KEY) {
      try {
        const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
          },
          body: JSON.stringify({
            model: "google/gemini-3.8-flash",
            messages: [
              {
                role: "system",
                content:
                  "Tu es responsable merchandising de Scoly (fournitures scolaires, Côte d'Ivoire). " +
                  "Pour chaque produit qui se vend mal, propose une remise flash réaliste entre 10 et 40 %, " +
                  "une durée en jours entre 2 et 14, et une raison courte en français. " +
                  'Réponds uniquement en JSON : {"suggestions":[{"product_id":"...","discount_percent":20,"duration_days":7,"reason":"..."}]}',
              },
              { role: "user", content: JSON.stringify(ranked) },
            ],
            response_format: { type: "json_object" },
          }),
        });

        if (res.status === 429) return json({ error: "Trop de demandes IA, réessayez dans une minute." }, 429);
        if (res.status === 402) {
          return json({ error: "Crédits IA épuisés : rechargez votre espace Lovable." }, 402);
        }
        if (res.ok) {
          const payload = await res.json();
          const raw = payload?.choices?.[0]?.message?.content || "{}";
          const parsed = JSON.parse(raw);
          const byId = new Map<string, any>(
            (parsed?.suggestions || []).map((s: any) => [String(s.product_id), s]),
          );
          suggestions = suggestions.map((s) => {
            const ai = byId.get(s.product_id);
            if (!ai) return s;
            const pct = Math.min(Math.max(Number(ai.discount_percent) || s.discount_percent, 5), 50);
            const days = Math.min(Math.max(Number(ai.duration_days) || 7, 1), 30);
            return {
              ...s,
              discount_percent: Math.round(pct),
              duration_days: Math.round(days),
              reason: typeof ai.reason === "string" && ai.reason.trim() ? ai.reason.trim() : s.reason,
              ai: true,
            };
          });
        } else {
          console.error("[suggest-flash-deals] IA", res.status, await res.text());
        }
      } catch (e) {
        console.error("[suggest-flash-deals] IA indisponible", e);
      }
    }

    return json({ suggestions });
  } catch (e) {
    console.error("[suggest-flash-deals]", e);
    return json({ error: (e as Error).message }, 500);
  }
});
