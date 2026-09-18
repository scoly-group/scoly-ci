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
    const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '').trim();
    if (!token) return json({ error: 'Unauthorized' }, 401);

    const authed = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: claims } = await authed.auth.getClaims(token);
    const userId = (claims?.claims?.sub as string) ?? null;
    if (!userId) return json({ error: 'Unauthorized' }, 401);

    const admin = adminClient();
    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? 'request');

    if (action === 'request') {
      const schoolId = String(body.school_id ?? '').trim();
      if (!schoolId) return json({ error: 'Sélectionnez votre établissement' }, 400);

      const { data: school } = await admin.from('schools').select('id, name').eq('id', schoolId).maybeSingle();
      if (!school) return json({ error: 'Établissement introuvable' }, 404);

      const { data: existing } = await admin
        .from('school_managers')
        .select('id, is_approved')
        .eq('user_id', userId)
        .eq('school_id', schoolId)
        .maybeSingle();

      if (!existing) {
        const { error } = await admin
          .from('school_managers')
          .insert({ school_id: schoolId, user_id: userId, is_approved: false });
        if (error) return json({ error: error.message }, 400);
      }

      const { data: profile } = await admin
        .from('profiles')
        .select('first_name, last_name, phone, email')
        .eq('id', userId)
        .maybeSingle();
      const who = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || 'Un gérant';

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
        data: { school_id: schoolId, user_id: userId, requires_approval: true },
      }));
      if (rows.length) await admin.from('notifications').insert(rows);

      return json({ ok: true, pending: !existing?.is_approved, school: school.name });
    }

    if (action === 'list_pending') {
      const { data: roleRows } = await admin.from('user_roles').select('role').eq('user_id', userId);
      const roles = (roleRows ?? []).map((r: { role: string }) => r.role);
      if (!roles.some((r) => ['super_admin', 'moderator'].includes(r))) return json({ error: 'Forbidden' }, 403);

      const { data: memberships, error } = await admin.from('school_managers')
        .select('id,user_id,school_id,created_at')
        .eq('is_approved', false)
        .order('created_at', { ascending: false });
      if (error) return json({ error: error.message }, 400);
      const userIds = [...new Set((memberships ?? []).map((row) => row.user_id))];
      const schoolIds = [...new Set((memberships ?? []).map((row) => row.school_id))];
      const [{ data: profiles }, { data: schools }] = await Promise.all([
        userIds.length ? admin.from('profiles').select('id,first_name,last_name,email,phone').in('id', userIds) : Promise.resolve({ data: [] }),
        schoolIds.length ? admin.from('schools').select('id,name').in('id', schoolIds) : Promise.resolve({ data: [] }),
      ]);
      return json({ requests: (memberships ?? []).map((row) => ({
        ...row,
        profile: (profiles ?? []).find((profile) => profile.id === row.user_id) ?? null,
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

      const { data: membership } = await admin
        .from('school_managers')
        .select('id, user_id, school_id')
        .eq('id', membershipId)
        .maybeSingle();
      if (!membership) return json({ error: 'Demande introuvable' }, 404);

      if (!approve) {
        await admin.from('school_managers').delete().eq('id', membershipId);
      } else {
        await admin
          .from('school_managers')
          .update({ is_approved: true, approved_by: userId, approved_at: new Date().toISOString() })
          .eq('id', membershipId);
      }

      const [{ data: school }, { data: profile }] = await Promise.all([
        admin.from('schools').select('name').eq('id', membership.school_id).maybeSingle(),
        admin.from('profiles').select('first_name, last_name, phone, email').eq('id', membership.user_id).maybeSingle(),
      ]);
      const schoolName = school?.name ?? 'votre établissement';
      const firstName = profile?.first_name ?? '';

      await admin.from('notifications').insert({
        user_id: membership.user_id,
        type: 'establishment',
        title: approve ? 'Accès établissement validé' : "Demande d'accès refusée",
        message: approve
          ? `Message généré automatiquement, ne pas répondre. Votre accès à l'espace de ${schoolName} est validé.`
          : `Message généré automatiquement, ne pas répondre. Votre demande d'accès à ${schoolName} n'a pas été retenue.`,
        data: { school_id: membership.school_id, approved: approve },
      });

      if (approve && profile?.phone) {
        try {
          await sendMessage(
            admin,
            profile.phone,
            `Scoly : votre acces a l'espace ${schoolName} est valide. Connectez-vous sur ${SITE_URL}/me pour suivre vos revenus et commissions.`,
            { templateKey: 'establishment_approved' },
          );
        } catch (e) {
          console.error('[school-manager-access] sms', e);
        }
      }

      if (approve && profile?.email) {
        try {
          await sendBrevoEmail({
            to: profile.email,
            subject: `Votre espace ${schoolName} est activé`,
            category: 'establishment_approved',
            html: brandedEmail({
              title: 'Votre espace établissement est activé',
              preheader: `Accès validé pour ${schoolName}`,
              bodyHtml: `<p>Bonjour ${firstName || ''},</p>
                <p>Votre demande d'accès à l'espace <strong>${schoolName}</strong> vient d'être validée par l'équipe Scoly.</p>
                <p>Vous pouvez désormais consulter vos revenus, vos commissions et vos demandes de retrait.</p>`,
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
