// Réinitialisation publique du mot de passe par SMS (code à 6 chiffres, 10 minutes).
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

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

/** Variantes acceptées d'un numéro ivoirien. */
function phoneVariants(raw: string): string[] {
  const digits = String(raw).replace(/\D/g, '');
  if (!digits) return [];
  let national = digits;
  if (national.startsWith('225')) national = national.slice(3);
  const withZero = national.startsWith('0') ? national : `0${national}`;
  const withoutZero = national.replace(/^0+/, '');
  return [...new Set([
    `+225${withZero}`, `+225${withoutZero}`, `225${withZero}`, `225${withoutZero}`,
    withZero, withoutZero, digits, `+${digits}`,
  ])].filter(Boolean);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

async function findUser(admin: Admin, phone: string) {
  const variants = phoneVariants(phone);
  if (!variants.length) return null;
  const wanted = new Set(variants.map((v) => v.replace(/\D/g, '').replace(/^225/, '').replace(/^0+/, '')));
  // Les numéros peuvent être stockés avec des espaces : comparaison sur les chiffres seuls.
  const { data } = await admin
    .from('profiles')
    .select('id, phone')
    .not('phone', 'is', null)
    .limit(5000);
  const row = (data ?? []).find((r: { id: string; phone: string | null }) => {
    const d = String(r.phone || '').replace(/\D/g, '').replace(/^225/, '').replace(/^0+/, '');
    return d && wanted.has(d);
  });
  return row ? { id: row.id as string, phone: (row.phone as string) ?? phone } : null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || '');
    const phone = String(body.phone || '').trim();
    if (!phone) return json({ error: 'Numéro requis' }, 400);

    if (action === 'request') {
      const target = await findUser(admin, phone);
      // Réponse identique qu'un compte existe ou non (pas de fuite d'information).
      if (!target) return json({ ok: true });

      // Limitation : 3 codes maximum par tranche de 15 minutes.
      const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
      const { count } = await admin
        .from('password_reset_codes')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', target.id)
        .gte('created_at', since);
      if ((count ?? 0) >= 3) {
        return json({ error: 'Trop de demandes. Réessayez dans quelques minutes.' }, 429);
      }

      const code = String(Math.floor(100000 + Math.random() * 900000));
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

      await admin
        .from('password_reset_codes')
        .update({ used_at: new Date().toISOString() })
        .eq('user_id', target.id)
        .is('used_at', null);

      const { error: insertErr } = await admin.from('password_reset_codes').insert({
        user_id: target.id,
        phone: target.phone,
        code_hash: await sha256(code),
        expires_at: expiresAt,
      });
      if (insertErr) throw insertErr;

      const smsRes = await fetch(`${SUPABASE_URL}/functions/v1/send-sms`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${SERVICE_KEY}`,
          apikey: SERVICE_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: target.phone,
          body: `Scoly : votre code de reinitialisation est ${code}. Valable 10 minutes.`,
        }),
      });
      if (!smsRes.ok) {
        console.error('[phone-password-reset] SMS échoué', smsRes.status, (await smsRes.text()).slice(0, 300));
        return json({ error: "Le SMS n'a pas pu être envoyé. Réessayez dans un instant." }, 502);
      }

      return json({ ok: true, expires_at: expiresAt });
    }

    if (action === 'reset') {
      const code = String(body.code || '').trim();
      const newPassword = String(body.new_password || '');
      if (!/^\d{6}$/.test(code)) return json({ error: 'Code à 6 chiffres requis' }, 400);
      if (newPassword.length < 8) return json({ error: 'Mot de passe : 8 caractères minimum' }, 400);

      const target = await findUser(admin, phone);
      if (!target) return json({ error: 'Code incorrect' }, 400);

      const { data: row } = await admin
        .from('password_reset_codes')
        .select('*')
        .eq('user_id', target.id)
        .is('used_at', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!row) return json({ error: 'Aucun code actif. Demandez un nouveau code.' }, 404);
      if (new Date(row.expires_at).getTime() < Date.now()) {
        return json({ error: 'Code expiré. Demandez un nouveau code.' }, 410);
      }
      if (row.attempts >= 5) return json({ error: 'Trop de tentatives. Demandez un nouveau code.' }, 429);
      if (row.code_hash !== (await sha256(code))) {
        await admin.from('password_reset_codes').update({ attempts: row.attempts + 1 }).eq('id', row.id);
        return json({ error: 'Code incorrect' }, 400);
      }

      const { error: updErr } = await admin.auth.admin.updateUserById(target.id, {
        password: newPassword,
      });
      if (updErr) return json({ error: 'Mot de passe refusé. Choisissez-en un autre.' }, 400);

      await admin
        .from('password_reset_codes')
        .update({ used_at: new Date().toISOString() })
        .eq('id', row.id);

      return json({ ok: true });
    }

    return json({ error: 'Action inconnue' }, 400);
  } catch (e) {
    console.error('[phone-password-reset]', e);
    return json({ error: 'Service indisponible pour le moment' }, 500);
  }
});
