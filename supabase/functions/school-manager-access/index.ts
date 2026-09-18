// Demandes et validations d'accès à l'espace établissement (/me).
// action=request : le gérant demande le rattachement à un établissement.
// action=approve : l'administration valide (ou refuse) et prévient par SMS + e-mail.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { adminClient, sendMessage, SITE_URL } from '../_shared/messaging.ts';
import { sendBrevoEmail } from '../_shared/brevo.ts';
import { brandedEmail } from '../_shared/email-branding.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const admin = adminClient();
    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? 'request');

    if (action === 'request') {
      const schoolId = String(body.school_id ?? '').trim();
      const firstName = String(body.first_name ?? '').trim();
      const lastName = String(body.last_name ?? '').trim();
      const email = String(body.email ?? '').trim().toLowerCase();
      const phone = String(body.phone ?? '').trim();
      if (!schoolId || !firstName || !lastName || !email || !phone) return json({ error: 'Tous les champs sont obligatoires' }, 400);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'Adresse e-mail invalide' }, 400);
      if (phone.replace(/\D/g, '').length < 8) return json({ error: 'Numéro de téléphone invalide' }, 400);

      const { data: school } = await admin.from('schools').select('id, name').eq('id', schoolId).maybeSingle();
      if (!school) return json({ error: 'Établissement introuvable' }, 404);

      const { data: existing } = await admin.from('establishment_access_requests')
        .select('id,status').eq('email', email).eq('status', 'pending')
        .maybeSingle();
      if (existing) return json({ error: 'Une demande est déjà en attente pour cette adresse e-mail' }, 409);

      const { data: request, error: insertError } = await admin.from('establishment_access_requests').insert({
        school_id: schoolId, first_name: firstName, last_name: lastName, email, phone, status: 'pending',
      }).select('id').single();
      if (insertError) return json({ error: insertError.message }, 400);
      const who = `${firstName} ${lastName}`;

      // Notification interne aux administrateurs et modérateurs.
      const { data: managers } = await admin
        .from('user_roles')
        .select('user_id, role')
        .in('role', ['super_admin', 'moderator']);
      const rows = (managers ?? []).map((m: { user_id: string }) => ({
        user_id: m.user_id,
        type: 'establishment',
        title: "Nouvelle demande d'accès établissement",
        message: `Message généré automatiquement, ne pas répondre. ${who} demande l'accès à l'espace de ${school.name}.`,
        data: { school_id: schoolId, request_id: request.id, requires_approval: true },
      }));
      if (rows.length) await admin.from('notifications').insert(rows);

      return json({ ok: true, pending: true, school: school.name });
    }

    const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '').trim();
    if (!token) return json({ error: 'Unauthorized' }, 401);
    const authed = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: claims } = await authed.auth.getClaims(token);
    const userId = (claims?.claims?.sub as string) ?? null;
    if (!userId) return json({ error: 'Unauthorized' }, 401);

    if (action === 'list_pending') {
      const { data: roleRows } = await admin.from('user_roles').select('role').eq('user_id', userId);
      const roles = (roleRows ?? []).map((r: { role: string }) => r.role);
      if (!roles.some((r) => ['super_admin', 'moderator'].includes(r))) return json({ error: 'Forbidden' }, 403);

      const { data: requests, error } = await admin.from('establishment_access_requests')
        .select('id,school_id,first_name,last_name,email,phone,created_at')
        .eq('status', 'pending')
        .order('created_at', { ascending: false });
      if (error) return json({ error: error.message }, 400);
      const schoolIds = [...new Set((requests ?? []).map((row) => row.school_id))];
      const { data: schools } = schoolIds.length ? await admin.from('schools').select('id,name').in('id', schoolIds) : { data: [] };
      return json({ requests: (requests ?? []).map((row) => ({
        ...row, profile: { first_name: row.first_name, last_name: row.last_name, email: row.email, phone: row.phone },
        school: (schools ?? []).find((school) => school.id === row.school_id) ?? null,
      })) });
    }

    if (action === 'approve') {
      const { data: roleRows } = await admin.from('user_roles').select('role').eq('user_id', userId);
      const roles = (roleRows ?? []).map((r: { role: string }) => r.role);
      if (!roles.some((r) => ['super_admin', 'moderator'].includes(r))) {
        return json({ error: 'Forbidden' }, 403);
      }

      const membershipId = String(body.membership_id ?? '').trim();
      const approve = body.approve !== false;
      if (!membershipId) return json({ error: 'membership_id requis' }, 400);

      const { data: request } = await admin
        .from('establishment_access_requests')
        .select('id,school_id,first_name,last_name,email,phone,status')
        .eq('id', membershipId)
        .maybeSingle();
      if (!request || request.status !== 'pending') return json({ error: 'Demande introuvable' }, 404);

      if (!approve) {
        await admin.from('establishment_access_requests').update({ status: 'rejected', reviewed_by: userId, reviewed_at: new Date().toISOString() }).eq('id', membershipId);
      } else {
        const temporaryPassword = `Sc${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}!`;
        const { data: created, error: createError } = await admin.auth.admin.createUser({
          email: request.email, password: temporaryPassword, email_confirm: true,
          user_metadata: { first_name: request.first_name, last_name: request.last_name, phone: request.phone },
        });
        if (createError || !created.user) return json({ error: createError?.message || 'Création du compte impossible' }, 400);
        await admin.from('profiles').upsert({ id: created.user.id, first_name: request.first_name, last_name: request.last_name, email: request.email, phone: request.phone });
        const { error: managerError } = await admin.from('school_managers').insert({ school_id: request.school_id, user_id: created.user.id, assigned_by: userId, is_approved: true, approved_by: userId, approved_at: new Date().toISOString() });
        if (managerError) return json({ error: managerError.message }, 400);
        await admin.from('establishment_access_requests').update({ status: 'approved', reviewed_by: userId, reviewed_at: new Date().toISOString(), created_user_id: created.user.id }).eq('id', membershipId);
        (request as typeof request & { created_user_id?: string; temporary_password?: string }).created_user_id = created.user.id;
        (request as typeof request & { temporary_password?: string }).temporary_password = temporaryPassword;
      }

      const { data: school } = await admin.from('schools').select('name').eq('id', request.school_id).maybeSingle();
      const schoolName = school?.name ?? 'votre établissement';
      const firstName = request.first_name;

      if (approve && request.phone) {
        try {
          await sendMessage(
            admin,
            request.phone,
            `Scoly : votre acces a l'espace ${schoolName} est valide. Connectez-vous sur ${SITE_URL}/me pour suivre vos revenus et commissions.`,
            { templateKey: 'establishment_approved' },
          );
        } catch (e) {
          console.error('[school-manager-access] sms', e);
        }
      }

      if (approve && request.email) {
        try {
          await sendBrevoEmail({
            to: request.email,
            subject: `Votre espace ${schoolName} est activé`,
            category: 'establishment_approved',
            html: brandedEmail({
              title: 'Votre espace établissement est activé',
              preheader: `Accès validé pour ${schoolName}`,
              bodyHtml: `<p>Bonjour ${firstName || ''},</p>
                <p>Votre demande d'accès à l'espace <strong>${schoolName}</strong> vient d'être validée par l'équipe Scoly.</p>
                <p>Votre compte gérant vient d'être créé. Votre mot de passe temporaire est <strong>${(request as typeof request & { temporary_password?: string }).temporary_password ?? ''}</strong>.</p>
                <p>Connectez-vous puis remplacez ce mot de passe dès que possible.</p>`,
              ctaText: 'Ouvrir mon espace',
              ctaUrl: `${SITE_URL}/me`,
            }),
          });
        } catch (e) {
          console.error('[school-manager-access] email', e);
        }
      }

      return json({ ok: true, approved: approve });
    }

    return json({ error: 'Action inconnue' }, 400);
  } catch (e) {
    console.error('[school-manager-access]', e);
    return json({ error: (e as Error).message }, 500);
  }
});
