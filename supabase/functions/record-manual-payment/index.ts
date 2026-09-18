// Encaissement d'une commande par l'équipe (livreur, modérateur, admin…).
// Actions : lookup (rechercher la commande), cash (espèces), online (montant net
// à encaisser via KkiaPay), online-verify (validation de la transaction).
import { createClient } from 'npm:@supabase/supabase-js@2';
import { adminClient, corsHeaders, json, settleTransaction, verifyTransaction } from '../_shared/kkiapay.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

/** Frais KkiaPay estimés (défaut 2 %). */
const FEE_RATE = Number(Deno.env.get('KKIAPAY_FEE_RATE') ?? '0.02') || 0.02;

const STAFF_ROLES = ['super_admin', 'admin', 'moderator', 'commercial', 'delivery', 'comptable'];

type Admin = ReturnType<typeof adminClient>;

const digitsOf = (raw: string) => String(raw ?? '').replace(/\D/g, '').replace(/^225/, '').replace(/^0+/, '');

/** Montant à débiter pour que, frais KkiaPay inclus, le total officiel soit couvert. */
export function netChargeFor(total: number, rate = FEE_RATE) {
  const net = Math.round(total / (1 + rate));
  return { net, fee: Math.max(0, total - net) };
}

async function loadOrders(admin: Admin, query: string) {
  const raw = String(query ?? '').trim();
  if (!raw) return [];

  const select =
    'id, user_id, total_amount, status, phone, shipping_address, payment_option, created_at, payment_reference';

  const byPhone = digitsOf(raw);
  let orders: any[] = [];

  if (/^[0-9a-f]{4,}$/i.test(raw.replace(/-/g, '')) && !/^\d+$/.test(raw)) {
    const { data } = await admin.from('orders').select(select).ilike('id', `${raw.replace(/-/g, '')}%`).limit(10);
    orders = data ?? [];
  }

  if (!orders.length && raw.length >= 6) {
    const { data } = await admin
      .from('orders')
      .select(select)
      .order('created_at', { ascending: false })
      .limit(400);
    orders = (data ?? []).filter((o: any) =>
      String(o.id).replace(/-/g, '').startsWith(raw.replace(/-/g, '').toLowerCase()) ||
      (byPhone && digitsOf(o.phone) === byPhone)
    );
  }

  if (!orders.length) return [];

  const ids = orders.map((o: any) => o.id);
  const { data: paid } = await admin
    .from('payments')
    .select('order_id, status, amount')
    .in('order_id', ids)
    .eq('status', 'completed');
  const paidSet = new Set((paid ?? []).map((p: any) => p.order_id));

  return orders.slice(0, 10).map((o: any) => {
    const total = Number(o.total_amount ?? 0);
    const { net, fee } = netChargeFor(total);
    return {
      id: o.id,
      number: String(o.id).slice(0, 8).toUpperCase(),
      total,
      status: o.status,
      phone: o.phone,
      address: o.shipping_address,
      payment_option: o.payment_option,
      created_at: o.created_at,
      is_paid: paidSet.has(o.id),
      online_charge: net,
      online_fee: fee,
    };
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.replace('Bearer ', '').trim();
    if (!token) return json({ error: 'Unauthorized' }, 401);

    const authed = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: claims } = await authed.auth.getClaims(token);
    const staffId = (claims?.claims?.sub as string) ?? null;
    if (!staffId) return json({ error: 'Unauthorized' }, 401);

    const admin = adminClient();
    const { data: roleRows } = await admin.from('user_roles').select('role').eq('user_id', staffId);
    const roles = (roleRows ?? []).map((r: { role: string }) => r.role);
    if (!roles.some((r) => STAFF_ROLES.includes(r))) return json({ error: 'Forbidden' }, 403);

    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? 'lookup');

    if (action === 'lookup') {
      const orders = await loadOrders(admin, body.query ?? '');
      return json({ ok: true, orders });
    }

    const orderId = String(body.order_id ?? '').trim();
    if (!orderId) return json({ error: 'order_id requis' }, 400);

    const { data: order } = await admin
      .from('orders')
      .select('id, user_id, total_amount, status, phone, payment_option')
      .eq('id', orderId)
      .maybeSingle();
    if (!order) return json({ error: 'Commande introuvable' }, 404);

    const total = Number(order.total_amount ?? 0);
    const { net, fee } = netChargeFor(total);

    const { data: already } = await admin
      .from('payments')
      .select('id')
      .eq('order_id', orderId)
      .eq('status', 'completed')
      .maybeSingle();
    if (already) return json({ error: 'Cette commande est déjà payée' }, 409);

    if (action === 'online') {
      await admin.from('orders').update({ payment_fee_amount: fee, amount_charged: net }).eq('id', orderId);
      return json({ ok: true, amount_to_charge: net, fee, total, order_id: orderId });
    }

    if (action === 'online-verify') {
      const transactionId = String(body.transaction_id ?? '').trim();
      if (!transactionId) return json({ error: 'transaction_id requis' }, 400);

      const verification = await verifyTransaction(transactionId);
      await admin.from('kkiapay_events').upsert({
        transaction_id: transactionId,
        event_type: 'staff.verification',
        provider_status: verification.status,
        amount: verification.amount,
        order_id: orderId,
        payload: verification.raw,
        reconciliation_status: verification.ok ? 'pending' : 'failed',
        reconciliation_error: verification.ok ? null : 'payment_not_successful',
      }, { onConflict: 'transaction_id' });

      const settled = await settleTransaction(admin, {
        transactionId,
        orderId,
        verification,
        expectedAmount: net,
        collectedBy: staffId,
      });
      if (!settled.ok) return json({ success: false, error: settled.error }, 400);

      await admin.from('kkiapay_events').update({
        reconciliation_status: 'settled',
        reconciliation_error: null,
      }).eq('transaction_id', transactionId);

      return json({ ok: true, success: true, order_id: orderId, amount: net, fee });
    }

    if (action === 'cash') {
      const { data: payment, error: paymentError } = await admin
        .from('payments')
        .insert({
          order_id: orderId,
          user_id: order.user_id,
          amount: total,
          subtotal_amount: total,
          fee_amount: 0,
          payment_method: 'Espèces',
          status: 'pending',
          transaction_id: `CASH-${String(orderId).slice(0, 8).toUpperCase()}-${Date.now()}`,
          phone_number: order.phone,
          metadata: { provider: 'cash', collected_by: staffId, channel: 'manual' },
        })
        .select('id')
        .single();
      if (paymentError) return json({ error: paymentError.message }, 400);

      const { error: rpcError } = await admin.rpc('finalize_payment_atomic', {
        _payment_id: payment.id,
        _transaction_id: null,
        _status: 'completed',
        _metadata: { provider: 'cash', collected_by: staffId, order_total: total },
      });
      if (rpcError) return json({ error: rpcError.message }, 400);

      const nowIso = new Date().toISOString();
      await admin
        .from('orders')
        .update({
          payment_method: 'Espèces',
          payment_fee_amount: 0,
          amount_charged: total,
          delivery_delivered_at: nowIso,
          customer_confirmed_at: nowIso,
          status: 'delivered',
        })
        .eq('id', orderId);

      try {
        await admin.functions.invoke('notify-order', {
          body: { order_id: orderId, event: 'payment_confirmed' },
        });
      } catch (e) {
        console.error('[record-manual-payment] notify-order', e);
      }
      try {
        await admin.functions.invoke('generate-receipt-pdf', { body: { order_id: orderId, email: true } });
      } catch (e) {
        console.error('[record-manual-payment] reçu', e);
      }

      return json({ ok: true, success: true, order_id: orderId, amount: total, method: 'cash' });
    }

    return json({ error: 'Action inconnue' }, 400);
  } catch (e) {
    console.error('[record-manual-payment]', e);
    return json({ error: (e as Error).message }, 500);
  }
});
