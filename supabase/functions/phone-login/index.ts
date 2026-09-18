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

/** Variantes acceptées d'un numéro ivoirien : +2250759…, 2250759…, 0759…, 759… */
function phoneVariants(raw: string): string[] {
  const digits = String(raw).replace(/\D/g, '');
  if (!digits) return [];
  let national = digits;
  if (national.startsWith('225')) national = national.slice(3);
  const withZero = national.startsWith('0') ? national : `0${national}`;
  const withoutZero = national.replace(/^0+/, '');
  const set = new Set<string>([
    `+225${withZero}`,
    `+225${withoutZero}`,
    `225${withZero}`,
    `225${withoutZero}`,
    withZero,
    withoutZero,
    digits,
    `+${digits}`,
  ]);
  return [...set].filter(Boolean);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { identifier, password } = await req.json();
    if (!identifier || !password || String(password).length < 6) {
      return json({ error: 'Identifiant ou mot de passe manquant' }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const raw = String(identifier).trim();
    let email: string | null = raw.includes('@') ? raw : null;

    if (!email) {
      const variants = phoneVariants(raw);
      if (variants.length) {
        const wanted = new Set(variants.map((v) => v.replace(/\D/g, '').replace(/^225/, '').replace(/^0+/, '')));
        // Les numéros peuvent être stockés avec des espaces : comparaison sur les chiffres seuls.
        const { data: rows } = await admin
          .from('profiles')
          .select('email, phone')
          .not('phone', 'is', null)
          .limit(5000);
        const hit = (rows ?? []).find((r) => {
          const d = String(r.phone || '').replace(/\D/g, '').replace(/^225/, '').replace(/^0+/, '');
          return d && wanted.has(d);
        });
        email = (hit?.email as string | undefined) ?? null;


        // Repli : l'e-mail peut n'exister que côté authentification.
        if (!email) {
          const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
          const match = list?.users?.find((u) => {
            const p = String(u.phone || '').replace(/\D/g, '');
            return p && variants.some((v) => v.replace(/\D/g, '') === p);
          });
          email = match?.email ?? null;
        }
      }
      if (!email) {
        const { data: byUsername } = await admin
          .from('profiles')
          .select('email')
          .eq('username', raw)
          .maybeSingle();
        email = byUsername?.email ?? null;
      }
    }

    if (!email) return json({ error: 'Aucun compte ne correspond à cet identifiant' }, 404);

    const anon = createClient(SUPABASE_URL, ANON_KEY);
    const { data, error } = await anon.auth.signInWithPassword({ email, password });
    if (error || !data.session) {
      return json({ error: 'Identifiants incorrects' }, 401);
    }

    return json({
      ok: true,
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    });
  } catch (e) {
    console.error('[phone-login]', e);
    return json({ error: 'Connexion impossible pour le moment' }, 500);
  }
});
