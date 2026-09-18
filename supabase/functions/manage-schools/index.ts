import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3.23.8";

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

const BodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("list") }),
  z.object({
    action: z.literal("save"),
    school: z.object({
      id: z.string().uuid().optional(),
      name: z.string().trim().min(1).max(255),
      type: z.string().trim().min(1).max(50),
      sub_prefecture: z.string().trim().min(1).max(150),
      region: z.string().trim().max(150).nullable().optional(),
      locality: z.string().trim().max(255).nullable().optional(),
      contact_name: z.string().trim().max(255).nullable().optional(),
      contact_phone: z.string().trim().max(40).nullable().optional(),
      contact_email: z.string().trim().email().max(255).nullable().optional(),
    }),
  }),
  z.object({ action: z.literal("status"), schoolId: z.string().uuid(), status: z.enum(["pending", "approved", "disabled", "archived"]) }),
  z.object({ action: z.literal("managers"), schoolId: z.string().uuid() }),
  z.object({ action: z.literal("manager_candidates") }),
  z.object({ action: z.literal("add_manager"), schoolId: z.string().uuid(), userId: z.string().uuid() }),
  z.object({ action: z.literal("remove_manager"), managerId: z.string().uuid() }),
]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée" }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceKey) return json({ error: "Configuration serveur incomplète" }, 500);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Non autorisé" }, 401);

    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: authData, error: authError } = await admin.auth.getUser(authHeader.slice(7));
    const caller = authData.user;
    if (authError || !caller) return json({ error: "Session invalide" }, 401);

    const { data: roleRows, error: roleError } = await admin.from("user_roles").select("role").eq("user_id", caller.id);
    if (roleError) return json({ error: "Vérification des droits impossible" }, 500);
    const roles = new Set((roleRows ?? []).map((row) => String(row.role)));
    const isStaff = roles.has("super_admin") || roles.has("moderator");
    const isCommercial = roles.has("commercial");
    if (!isStaff && !isCommercial && !roles.has("referent")) return json({ error: "Droits insuffisants" }, 403);

    const parsed = BodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return json({ error: "Demande invalide", details: parsed.error.flatten().fieldErrors }, 400);
    const body = parsed.data;

    if (body.action === "list") {
      let allowedIds: string[] | null = null;
      if (!isStaff) {
        const { data: managed } = await admin.from("school_managers").select("school_id").eq("user_id", caller.id);
        allowedIds = (managed ?? []).map((row) => row.school_id);
      }

      let query = admin.from("schools").select("id,name,code,type,status,is_active,sub_prefecture,locality,city,region,contact_name,contact_phone,contact_email,created_by,created_at").order("created_at", { ascending: false });
      if (!isStaff && isCommercial) query = query.eq("created_by", caller.id);
      else if (!isStaff) {
        if (!allowedIds?.length) return json({ schools: [] });
        query = query.in("id", allowedIds);
      }
      const { data, error } = await query;
      if (error) return json({ error: error.message }, 400);
      return json({ schools: data ?? [] });
    }

    if (body.action === "manager_candidates") {
      if (!isStaff) return json({ error: "Droits insuffisants" }, 403);
      const { data: managerRoles, error } = await admin.from("user_roles").select("user_id").eq("role", "referent");
      if (error) return json({ error: error.message }, 400);
      const ids = [...new Set((managerRoles ?? []).map((row) => row.user_id))];
      if (!ids.length) return json({ candidates: [] });
      const { data: profiles, error: profileError } = await admin.from("profiles").select("id,first_name,last_name,email").in("id", ids);
      if (profileError) return json({ error: profileError.message }, 400);
      return json({ candidates: profiles ?? [] });
    }

    if (body.action === "managers") {
      if (!isStaff) {
        // Non-staff callers may only see managers of schools they own or manage.
        const [{ data: ownedSchool }, { data: membership }] = await Promise.all([
          admin.from("schools").select("id").eq("id", body.schoolId).eq("created_by", caller.id).maybeSingle(),
          admin.from("school_managers").select("id").eq("school_id", body.schoolId).eq("user_id", caller.id).maybeSingle(),
        ]);
        if (!ownedSchool && !membership) return json({ error: "Droits insuffisants" }, 403);
      }

      const { data: rows, error } = await admin.from("school_managers").select("id,user_id,created_at").eq("school_id", body.schoolId);
      if (error) return json({ error: error.message }, 400);
      const ids = (rows ?? []).map((row) => row.user_id);
      const { data: profiles } = ids.length ? await admin.from("profiles").select("id,first_name,last_name,email").in("id", ids) : { data: [] };
      return json({ managers: (rows ?? []).map((row) => {
        const profile = profiles?.find((item) => item.id === row.user_id);
        const name = profile ? `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim() : "";
        return { ...row, label: name || profile?.email || row.user_id };
      }) });
    }


    if (!isStaff) return json({ error: "Droits insuffisants" }, 403);

    if (body.action === "save") {
      const school = body.school;
      const payload = {
        name: school.name,
        type: school.type,
        sub_prefecture: school.sub_prefecture,
        city: school.sub_prefecture,
        region: school.region || null,
        locality: school.locality || null,
        contact_name: school.contact_name || null,
        contact_phone: school.contact_phone || null,
        contact_email: school.contact_email || null,
      };
      const result = school.id
        ? await admin.from("schools").update(payload).eq("id", school.id)
        : await admin.from("schools").insert({ ...payload, status: "approved", is_active: true, is_verified: true, created_by: caller.id, approved_by: caller.id, approved_at: new Date().toISOString() });
      if (result.error) return json({ error: result.error.message }, 400);
      return json({ ok: true });
    }

    if (body.action === "status") {
      const { error } = await admin.from("schools").update({
        status: body.status,
        is_active: body.status === "approved",
        is_verified: body.status === "approved",
        ...(body.status === "approved" ? { approved_by: caller.id, approved_at: new Date().toISOString() } : {}),
      }).eq("id", body.schoolId);
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    if (body.action === "add_manager") {
      const { data: role } = await admin.from("user_roles").select("user_id").eq("user_id", body.userId).eq("role", "referent").maybeSingle();
      if (!role) return json({ error: "Cet utilisateur n’a pas le rôle Gérant ET" }, 400);
      const { error } = await admin.from("school_managers").upsert({ school_id: body.schoolId, user_id: body.userId, assigned_by: caller.id }, { onConflict: "school_id,user_id" });
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    const { error } = await admin.from("school_managers").delete().eq("id", body.managerId);
    if (error) return json({ error: error.message }, 400);
    return json({ ok: true });
  } catch (error) {
    console.error("[manage-schools]", error);
    return json({ error: error instanceof Error ? error.message : "Erreur serveur" }, 500);
  }
});
