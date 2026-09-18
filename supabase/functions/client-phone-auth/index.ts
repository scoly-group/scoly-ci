import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { z } from 'npm:zod@3.23.8';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const INTERNAL_ROLES = ['super_admin', 'moderator', 'commercial', 'delivery', 'comptable', 'referent', 'vendor'];

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});

function normalize(raw: string): { digits: string; e164: string } | null {
  const digits = String(raw ?? '').replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15) return null;
  if (digits.startsWith('225')) {
    const national = digits.slice(3).replace(/^0+/, '');
    return { digits: national, e164: `+225${national.length === 9 ? `0${national}` : national}` };
  }
  if (digits.length === 10 && digits.startsWith('0')) {
    return { digits: digits.slice(1), e164: `+225${digits}` };
  }
  return { digits: digits.replace(/^0+/, ''), e164: `+${digits}` };
}

const syntheticEmail = (digits: string) => `client.${digits}@clients.scoly.ci`;
const legacySyntheticEmail = (digits: string) => `client${digits}@clients.scoly.ci`;

type Admin = ReturnType<typeof createClient>;

async function rolesFor(admin: Admin, userId: string) {
  const { data } = await admin.from('user_roles').select('role').eq('user_id', userId);
  return (data ?? []).map((row: { role: string }) => row.role);
}

async function profileMatches(admin: Admin, phone: { digits: string; e164: string }) {
  const variants = [phone.e164, phone.e164.replace('+225', '0'), phone.digits];
  const { data } = await admin.from('profiles').select('id,phone,email,first_name,last_name').in('phone', variants).limit(20);
  return data ?? [];
}

async function resolveClient(admin: Admin, phone: { digits: string; e164: string }, create: boolean, fullName: string, email: string) {
  const { data: mapped } = await admin.from('client_phone_accounts')
    .select('client_user_id,linked_internal_user_id').eq('phone_normalized', phone.digits).maybeSingle();
  if (mapped?.client_user_id) return { userId: mapped.client_user_id as string, created: false };

  const matches = await profileMatches(admin, phone);
  let existingClient: string | null = null;
  let internalUser: string | null = null;
  for (const match of matches) {
    const roles = await rolesFor(admin, match.id);
    if (roles.some((role: string) => INTERNAL_ROLES.includes(role))) internalUser ??= match.id;
    else existingClient ??= match.id;
  }

  if (existingClient) {
    await admin.from('client_phone_accounts').upsert({
      phone_normalized: phone.digits,
      client_user_id: existingClient,
      linked_internal_user_id: internalUser,
    });
    return { userId: existingClient, created: false };
  }
  if (!create) return null;

  const [firstName, ...rest] = fullName.split(/\s+/).filter(Boolean);
  const authEmail = syntheticEmail(phone.digits);
  const { data: createdUser, error } = await admin.auth.admin.createUser({
    email: authEmail,
    email_confirm: true,
    password: `${crypto.randomUUID()}${crypto.randomUUID()}`,
    user_metadata: { first_name: firstName ?? '', last_name: rest.join(' '), phone: phone.e164, client_phone_account: true },
  });
  if (error || !createdUser.user) throw new Error('Création du compte client impossible');

  const userId = createdUser.user.id;
  await admin.from('profiles').upsert({
    id: userId,
    first_name: firstName ?? '',
    last_name: rest.join(' '),
    phone: phone.e164,
    email: email || (internalUser ? matches.find((row: { id: string }) => row.id === internalUser)?.email : null),
  });
  await admin.from('user_roles').upsert({ user_id: userId, role: 'user' }, { onConflict: 'user_id,role' });
  await admin.from('client_phone_accounts').insert({
    phone_normalized: phone.digits,
    client_user_id: userId,
    linked_internal_user_id: internalUser,
  });
  return { userId, created: true };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Méthode non autorisée' }, 405);

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? 'login');

    if (action === 'update_email') {
      const authHeader = req.headers.get('Authorization');
      if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Non autorisé' }, 401);
      const token = authHeader.slice(7);
      const verifier = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
      const { data: claimsData, error: claimsError } = await verifier.auth.getClaims(token);
      const userId = claimsData?.claims?.sub as string | undefined;
      if (claimsError || !userId) return json({ error: 'Session invalide' }, 401);
      const parsed = z.object({ email: z.string().trim().email().max(255) }).safeParse(body);
      if (!parsed.success) return json({ error: 'Adresse e-mail invalide' }, 400);
      const roles = await rolesFor(admin, userId);
      if (roles.some((role: string) => INTERNAL_ROLES.includes(role))) return json({ error: 'Accès client requis' }, 403);

      const email = parsed.data.email.toLowerCase();
      const { error: authError } = await admin.auth.admin.updateUserById(userId, { email, email_confirm: true });
      if (authError) return json({ error: authError.message }, 400);
      await admin.from('profiles').update({ email }).eq('id', userId);

      const { data: orders } = await admin.from('orders').select('id,status').eq('user_id', userId);
      let receiptsSent = 0;
      for (const order of orders ?? []) {
        if (!['confirmed', 'shipped', 'delivered'].includes(String(order.status))) continue;
        const response = await fetch(`${SUPABASE_URL}/functions/v1/generate-receipt-pdf`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ order_id: order.id, email }),
        });
        if (response.ok) receiptsSent += 1;
      }
      return json({ ok: true, email, receipts_sent: receiptsSent });
    }

    const parsed = z.object({
      phone: z.string().min(8).max(30),
      full_name: z.string().trim().max(200).optional().default(''),
      email: z.union([z.literal(''), z.string().trim().email().max(255)]).optional().default(''),
      create: z.boolean().optional().default(true),
      action: z.string().optional(),
    }).safeParse(body);
    if (!parsed.success) return json({ error: 'Informations invalides' }, 400);
    const phone = normalize(parsed.data.phone);
    if (!phone) return json({ error: 'Numéro de téléphone invalide' }, 400);

    const resolved = await resolveClient(admin, phone, parsed.data.create, parsed.data.full_name, parsed.data.email.toLowerCase());
    if (!resolved) return json({ error: 'not_found' }, 404);
    const { userId, created } = resolved;

    const [firstName, ...rest] = parsed.data.full_name.split(/\s+/).filter(Boolean);
    const patch: Record<string, unknown> = { phone: phone.e164 };
    if (firstName) patch.first_name = firstName;
    if (rest.length) patch.last_name = rest.join(' ');
    if (parsed.data.email) patch.email = parsed.data.email.toLowerCase();
    await admin.from('profiles').update(patch).eq('id', userId);

    if (action === 'profile') {
      const { data: profile } = await admin.from('profiles').select('first_name,last_name,email,phone').eq('id', userId).maybeSingle();
      const { data: address } = await admin.from('user_addresses').select('address').eq('user_id', userId).order('is_default', { ascending: false }).order('created_at', { ascending: false }).limit(1).maybeSingle();
      return json({ found: true, profile: { ...profile, delivery_place: address?.address ?? '' } });
    }

    const tempPassword = `${crypto.randomUUID()}${crypto.randomUUID()}`;
    const { error: updateError } = await admin.auth.admin.updateUserById(userId, { password: tempPassword });
    if (updateError) return json({ error: 'Connexion impossible pour le moment' }, 500);
    const { data: userInfo } = await admin.auth.admin.getUserById(userId);
    const loginEmail = userInfo.user?.email ?? legacySyntheticEmail(phone.digits);
    const anon = createClient(SUPABASE_URL, ANON_KEY);
    const { data: signed } = await anon.auth.signInWithPassword({ email: loginEmail, password: tempPassword });
    if (!signed.session) return json({ error: 'Connexion impossible pour le moment' }, 500);

    return json({
      ok: true, created, user_id: userId, phone: phone.e164,
      access_token: signed.session.access_token, refresh_token: signed.session.refresh_token,
    });
  } catch (error) {
    console.error('[client-phone-auth]', error);
    return json({ error: error instanceof Error ? error.message : 'Connexion impossible pour le moment' }, 500);
  }
});