// Suppression réelle d'un compte utilisateur (auth + profil + données liées).
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const SUPER_ADMIN_PROTECTED = new Set<string>([]);

// Données strictement personnelles : supprimées avec le compte.
const DELETE_TABLES: Array<[string, string]> = [
  ["user_roles", "user_id"],
  ["cart_items", "user_id"],
  ["wishlist", "user_id"],
  ["wishlist_items", "user_id"],
  ["push_subscriptions", "user_id"],
  ["login_sessions", "user_id"],
  ["notifications", "user_id"],
  ["user_addresses", "user_id"],
  ["user_tasks", "user_id"],
  ["article_likes", "user_id"],
  ["article_reactions", "user_id"],
  ["article_comments", "user_id"],
  ["school_managers", "user_id"],
  ["commercial_zones", "user_id"],
  ["commercial_availability", "user_id"],
  ["vendor_settings", "user_id"],
  ["loyalty_rewards", "user_id"],
  ["referral_rewards", "user_id"],
  ["referrals", "referrer_id"],
];

// Données de gestion conservées : on détache seulement l'utilisateur.
const DETACH_TABLES: Array<[string, string]> = [
  ["orders", "user_id"],
  ["orders", "delivery_user_id"],
  ["payments", "user_id"],
  ["reviews", "user_id"],
  ["articles", "author_id"],
  ["resources", "author_id"],
  ["educational_content", "author_id"],
  ["email_campaigns", "created_by"],
  ["smart_kits", "created_by"],
  ["school_supply_lists", "created_by"],
  ["schools", "created_by"],
  ["schools", "approved_by"],
  ["products", "vendor_id"],
  ["commissions", "vendor_id"],
  ["moderator_notes", "moderator_id"],
  ["referent_applications", "reviewed_by"],
  ["internal_messages", "sender_id"],
  ["internal_messages", "recipient_id"],
  ["delivery_proofs", "delivery_user_id"],
  ["withdrawal_requests", "user_id"],
  ["audit_logs", "user_id"],
  ["security_access_log", "actor_id"],
  ["visits", "user_id"],
  ["article_purchases", "user_id"],
  ["educational_content_purchases", "user_id"],
  ["coupon_redemptions", "user_id"],
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    if (!SERVICE_KEY) return json({ error: "Configuration serveur incomplète" }, 500);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Non autorisé" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const token = authHeader.replace("Bearer ", "").trim();
    const { data: caller, error: authError } = await admin.auth.getUser(token);
    if (authError || !caller?.user) return json({ error: "Non autorisé" }, 401);

    // Vérification directe avec la clé serveur : elle ne dépend pas des droits
    // d'exécution publics de la fonction SQL has_role.
    const { data: callerRoles, error: callerRolesError } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.user.id)
      .in("role", ["super_admin"]);
    if (callerRolesError) return json({ error: "Vérification des droits impossible" }, 500);
    if (!callerRoles?.length) return json({ error: "Droits insuffisants" }, 403);

    const body = await req.json().catch(() => ({}));
    const userId = typeof body.userId === "string" ? body.userId : "";
    if (!/^[0-9a-f-]{36}$/i.test(userId)) return json({ error: "userId invalide" }, 400);
    if (userId === caller.user.id) {
      return json({ error: "Vous ne pouvez pas supprimer votre propre compte" }, 400);
    }
    if (SUPER_ADMIN_PROTECTED.has(userId)) {
      return json({ error: "Ce compte est protégé" }, 400);
    }

    // La cible ne doit pas être un super administrateur.
    const { data: targetSuperRole, error: targetRoleError } = await admin
      .from("user_roles")
      .select("user_id")
      .eq("user_id", userId)
      .eq("role", "super_admin")
      .maybeSingle();
    if (targetRoleError) return json({ error: "Vérification du compte cible impossible" }, 500);
    if (targetSuperRole) return json({ error: "Impossible de supprimer un super admin" }, 400);

    const warnings: string[] = [];

    // 1) Détacher l'historique de gestion (commandes, paiements, contenus...).
    for (const [table, column] of DETACH_TABLES) {
      const { error } = await admin.from(table).update({ [column]: null }).eq(column, userId);
      if (error) warnings.push(`${table}.${column}: ${error.message}`);
    }

    // 2) Supprimer les données strictement personnelles.
    for (const [table, column] of DELETE_TABLES) {
      const { error } = await admin.from(table).delete().eq(column, userId);
      if (error) warnings.push(`${table}.${column}: ${error.message}`);
    }

    // 3) Supprimer le profil public.
    const { error: profileError } = await admin.from("profiles").delete().eq("id", userId);
    if (profileError) warnings.push(`profiles: ${profileError.message}`);

    // 4) Supprimer le compte de connexion.
    const { error: delError } = await admin.auth.admin.deleteUser(userId);
    if (delError) {
      console.error("[delete-user] auth delete failed", delError, warnings);
      return json(
        {
          error: `Suppression du compte impossible : ${delError.message}`,
          details: warnings,
        },
        400,
      );
    }

    if (warnings.length) console.warn("[delete-user] warnings", warnings);
    return json({ ok: true, warnings });
  } catch (e) {
    console.error("[delete-user]", e);
    return json({ error: (e as Error).message }, 500);
  }
});
