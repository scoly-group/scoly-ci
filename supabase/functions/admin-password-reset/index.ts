import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);
    const token = authHeader.replace('Bearer ', '');

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const anon = createClient(SUPABASE_URL, ANON_KEY);
    const { data: userData, error: userErr } = await anon.auth.getUser(token);
    if (userErr || !userData.user) return json({ error: 'Unauthorized' }, 401);

    const { data: roles } = await admin.from('user_roles').select('role').eq('user_id', userData.user.id);
    const isAdmin = (roles || []).some((r: any) => ['super_admin'].includes(r.role));
    if (!isAdmin) return json({ error: 'Forbidden' }, 403);

    const body = await req.json();
    const action = String(body.action || '');
    const targetUserId = String(body.user_id || '');
    if (!targetUserId) return json({ error: 'user_id requis' }, 400);

    if (action === 'send_code') {
      const { data: profile } = await admin
        .from('profiles')
        .select('phone, first_name, last_name')
        .eq('id', targetUserId)
        .maybeSingle();
      const phone = body.phone || profile?.phone;
      if (!phone) return json({ error: "Aucun numéro de téléphone pour cet utilisateur" }, 400);

      const code = String(Math.floor(100000 + Math.random() * 900000));
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

      // Un seul code actif à la fois.
      await admin
        .from('password_reset_codes')
        .update({ used_at: new Date().toISOString() })
        .eq('user_id', targetUserId)
        .is('used_at', null);

      const { error: insertErr } = await admin.from('password_reset_codes').insert({
        user_id: targetUserId,
        phone,
        code_hash: await sha256(code),
        expires_at: expiresAt,
        requested_by: userData.user.id,
      });
      if (insertErr) throw insertErr;

      // send-sms attend le texte dans `body` et un jeton d'administrateur valide.
      const smsRes = await fetch(`${SUPABASE_URL}/functions/v1/send-sms`, {
        method: 'POST',
        headers: {
          Authorization: authHeader,
          apikey: ANON_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: phone,
          body: `Scoly : votre code de reinitialisation est ${code}. Valable 10 minutes.`,
        }),
      });
      const smsBody = await smsRes.text();
      if (!smsRes.ok) {
        console.error('[admin-password-reset] SMS échoué', smsRes.status, smsBody);
        return json({ error: "Le SMS n'a pas pu être envoyé", details: smsBody.slice(0, 300) }, 502);
      }

      return json({ ok: true, expires_at: expiresAt, phone });
    }

    if (action === 'apply') {
      const code = String(body.code || '').trim();
      const newPassword = String(body.new_password || '');
      if (!/^\d{6}$/.test(code)) return json({ error: 'Code à 6 chiffres requis' }, 400);
      if (newPassword.length < 8) return json({ error: 'Mot de passe : 8 caractères minimum' }, 400);

      const { data: row } = await admin
        .from('password_reset_codes')
        .select('*')
        .eq('user_id', targetUserId)
        .is('used_at', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!row) return json({ error: 'Aucun code actif. Envoyez un nouveau code.' }, 404);
      if (new Date(row.expires_at).getTime() < Date.now()) {
        return json({ error: 'Code expiré. Envoyez un nouveau code.' }, 410);
      }
      if (row.attempts >= 5) return json({ error: 'Trop de tentatives. Envoyez un nouveau code.' }, 429);

      if (row.code_hash !== (await sha256(code))) {
        await admin
          .from('password_reset_codes')
          .update({ attempts: row.attempts + 1 })
          .eq('id', row.id);
        return json({ error: 'Code incorrect' }, 400);
      }

      const { error: updErr } = await admin.auth.admin.updateUserById(targetUserId, {
        password: newPassword,
      });
      if (updErr) return json({ error: updErr.message }, 400);

      await admin
        .from('password_reset_codes')
        .update({ used_at: new Date().toISOString() })
        .eq('id', row.id);

      if (row.phone) {
        await fetch(`${SUPABASE_URL}/functions/v1/send-sms`, {
          method: 'POST',
          headers: {
            Authorization: authHeader,
            apikey: ANON_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            to: row.phone,
            body: 'Scoly : votre mot de passe a bien ete modifie.',
          }),
        }).catch(() => null);
      }

      return json({ ok: true });
    }

    if (action === 'update_email') {
      const email = String(body.email || '').trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: 'E-mail invalide' }, 400);
      const { error: updErr } = await admin.auth.admin.updateUserById(targetUserId, {
        email,
        email_confirm: true,
      });
      if (updErr) return json({ error: updErr.message }, 400);
      await admin.from('profiles').update({ email }).eq('id', targetUserId);
      return json({ ok: true });
    }

    return json({ error: 'Action inconnue' }, 400);
  } catch (e) {
    console.error('[admin-password-reset]', e);
    return json({ error: (e as Error).message }, 500);
  }
});
