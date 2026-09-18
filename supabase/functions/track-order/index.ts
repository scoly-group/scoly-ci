import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3.23.8';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const parsed = z.object({ phone: z.string().min(8).max(30) }).safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return json({ error: 'invalid_phone' }, 400);
    const digits = parsed.data.phone.replace(/\D/g, '');
    const national = digits.replace(/^225/, '').replace(/^0+/, '');
    const variants = [`+2250${national}`, `+225${national}`, `0${national}`, national];
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data, error } = await admin.from('orders')
      .select('id,status,payment_option,total_amount,created_at,updated_at')
      .in('phone', variants).order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (error) return json({ error: 'lookup_failed' }, 500);
    if (!data) return json({ found: false });
    return json({ found: true, order: { ...data, number: data.id.slice(0, 8).toUpperCase() } });
  } catch (error) {
    console.error('[track-order]', error);
    return json({ error: 'unexpected_error' }, 500);
  }
});