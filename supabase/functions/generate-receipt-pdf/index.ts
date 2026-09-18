import { createClient } from 'npm:@supabase/supabase-js@2';
import { jsPDF } from 'npm:jspdf@2.5.1';
import { SCOLY_LOGO_BASE64 } from '../_shared/logo-base64.ts';
import { sendBrevoEmail } from '../_shared/brevo.ts';
import { brandedEmail } from '../_shared/email-branding.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

/** Charte du reçu officiel Scoly (maquette validée). */
const BLUE: [number, number, number] = [29, 78, 216];
const ORANGE: [number, number, number] = [243, 112, 33];
const INK: [number, number, number] = [31, 41, 55];
const MUTED: [number, number, number] = [107, 114, 128];
const SOFT: [number, number, number] = [239, 244, 253];
const CREAM: [number, number, number] = [255, 247, 237];
const LINE: [number, number, number] = [219, 228, 242];

const COMPANY = {
  name: 'SCOLY GROUP SARL',
  tagline: 'Fournitures scolaires & bureautiques',
  capital: 'Capital social : 1 000 000 FCFA',
  rccm: 'RCCM : CI-KGO-01-2026-B12-00111',
  phone: '+225 0702584457',
  email: 'scoly.ci@gmail.com',
  site: 'scoly.ci',
};

/** Séparateur de milliers en espace simple : les polices PDF ne rendent pas l'espace fine. */
function fmt(n: number) {
  const value = String(Math.abs(Math.round(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${n < 0 ? '-' : ''}${value} FCFA`;
}

/** Affichage du téléphone sans jamais retirer le zéro national. */
function phoneDisplay(raw: unknown) {
  const value = String(raw ?? '').trim();
  if (!value) return '—';
  const digits = value.replace(/[^\d]/g, '');
  if (digits.startsWith('225')) return `+225 ${digits.slice(3)}`;
  return value.startsWith('+') ? value : `+225 ${digits}`;
}

/** Libellé lisible du moyen de paiement (Orange, MTN, Moov, Wave, carte…). */
function methodLabel(raw: unknown) {
  const value = String(raw ?? '').toUpperCase();
  if (/WAVE/.test(value)) return 'Wave';
  if (/ORANGE/.test(value)) return 'Orange Money';
  if (/MTN|MOMO/.test(value)) return 'MTN Money';
  if (/MOOV|FLOOZ/.test(value)) return 'Moov Money';
  if (/VISA|MASTERCARD|CARD|CARTE|CB\b/.test(value)) return 'Carte bancaire';
  if (/BANK|VIREMENT|TRANSFER/.test(value)) return 'Virement bancaire';
  if (!value || value === 'KKIAPAY') return 'Mobile Money';
  return String(raw);
}

/** Reçu officiel Scoly, strictement aligné sur la maquette. */
function buildPdf(order: any, items: any[], customer: { name: string; phone: string; address: string }) {
  const doc = new jsPDF();
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  const M = 14;
  const right = w - M;
  const orderNo = String(order.id).slice(0, 8).toUpperCase();
  const created = new Date(order.created_at);
  const longDate = created.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  const timeStr = created.toLocaleTimeString('fr-FR');
  const shortDate = created.toLocaleDateString('fr-FR');

  // ---- En-tête : logo + titre
  try {
    doc.addImage(SCOLY_LOGO_BASE64, 'PNG', M, 12, 48, 26);
  } catch {
    doc.setTextColor(...BLUE);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(22);
    doc.text('SCOLY', M, 30);
  }
  doc.setTextColor(...INK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(19);
  doc.text('REÇU DE COMMANDE', right, 24, { align: 'right' });
  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...MUTED);
  doc.text(`Commande n° `, right - doc.getTextWidth(orderNo) - 1, 31, { align: 'right' });
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...INK);
  doc.text(orderNo, right, 31, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...MUTED);
  doc.text(`${longDate} · ${timeStr}`, right, 36.5, { align: 'right' });

  // ---- Filet orange
  doc.setFillColor(...ORANGE);
  doc.rect(M, 43, w - 2 * M, 1.6, 'F');

  // ---- Bandeau société
  let y = 48;
  doc.setFillColor(...SOFT);
  doc.rect(M, y, w - 2 * M, 12, 'F');
  doc.setTextColor(...INK);
  doc.setFontSize(9.5);
  doc.text(`${COMPANY.name} · ${COMPANY.tagline}`, M + 4, y + 7.6);
  doc.setTextColor(...BLUE);
  doc.text(COMPANY.site, right - 4, y + 7.6, { align: 'right' });

  // ---- Identification / contact
  y += 16;
  const halfW = (w - 2 * M) / 2;
  doc.setFillColor(...SOFT);
  doc.rect(M, y, halfW, 34, 'F');
  doc.setFillColor(...CREAM);
  doc.rect(M + halfW, y, halfW, 34, 'F');
  doc.setTextColor(...BLUE);
  doc.setFontSize(9.5);
  doc.text("IDENTIFICATION DE L'ENTREPRISE", M + 4, y + 8);
  doc.text('CONTACT', M + halfW + 4, y + 8);
  doc.setTextColor(...INK);
  doc.setFontSize(9);
  doc.text(COMPANY.name, M + 4, y + 16);
  doc.text(COMPANY.capital, M + 4, y + 22);
  doc.text(COMPANY.rccm, M + 4, y + 28);
  doc.text(COMPANY.phone, M + halfW + 4, y + 16);
  doc.text(COMPANY.email, M + halfW + 4, y + 22);

  // ---- Moyen de paiement / statut / date
  y += 40;
  const third = (w - 2 * M) / 3;
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.3);
  doc.rect(M, y, w - 2 * M, 20);
  doc.line(M + third, y, M + third, y + 20);
  doc.line(M + 2 * third, y, M + 2 * third, y + 20);
  doc.setFontSize(8.5);
  doc.setTextColor(...MUTED);
  doc.text('MOYEN DE PAIEMENT', M + 4, y + 7);
  doc.setTextColor(...INK);
  doc.setFont('helvetica', 'bold');
  doc.text('PAIEMENT', M + third + 4, y + 7);
  doc.text('DATE', M + 2 * third + 4, y + 7);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...INK);
  doc.text(methodLabel(order.payment_method), M + 4, y + 15);
  doc.setTextColor(...ORANGE);
  doc.setFont('helvetica', 'bold');
  doc.text(String(order.payment_status_label || 'PAYÉ'), M + third + 4, y + 15);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...INK);
  doc.text(shortDate, M + 2 * third + 4, y + 15);

  // ---- Client
  y += 26;
  const addressLines = doc.splitTextToSize(customer.address || 'Adresse non renseignée', w - 2 * M - 54);
  const clientH = Math.max(24, 16 + addressLines.length * 5);
  doc.setFillColor(...SOFT);
  doc.rect(M, y, 44, clientH, 'F');
  doc.setDrawColor(...LINE);
  doc.rect(M, y, w - 2 * M, clientH);
  doc.setTextColor(...BLUE);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('CLIENT', M + 4, y + 9);
  doc.setTextColor(...INK);
  doc.setFontSize(9.5);
  doc.text(customer.name || 'Client Scoly', M + 50, y + 8);
  doc.setFont('helvetica', 'normal');
  doc.text(`Tél. : ${phoneDisplay(customer.phone)}`, M + 50, y + 14);
  doc.text(addressLines, M + 50, y + 20);

  // ---- Détail de la commande
  y += clientH + 12;
  doc.setTextColor(...INK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('DÉTAIL DE LA COMMANDE', M, y);

  y += 6;
  doc.setFillColor(...BLUE);
  doc.rect(M, y, w - 2 * M, 10, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  const colQty = M + 82;
  const colUnit = M + 114;
  doc.text('Produit', M + 4, y + 6.5);
  doc.text('Qté', colQty + 14, y + 6.5, { align: 'right' });
  doc.text('Prix unitaire', colUnit + 30, y + 6.5, { align: 'right' });
  doc.text('Total', right - 4, y + 6.5, { align: 'right' });
  y += 10;

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...INK);
  let subtotal = 0;
  for (const it of items) {
    if (y > h - 70) {
      doc.addPage();
      y = 20;
    }
    const name = it.product_name || it.products?.name_fr || 'Produit';
    const nameLines = doc.splitTextToSize(String(name), 74);
    const rowH = Math.max(11, 6 + nameLines.length * 5);
    doc.setDrawColor(...LINE);
    doc.rect(M, y, w - 2 * M, rowH);
    doc.line(colQty, y, colQty, y + rowH);
    doc.line(colUnit - 4, y, colUnit - 4, y + rowH);
    doc.line(colUnit + 34, y, colUnit + 34, y + rowH);
    doc.setFontSize(9);
    doc.text(nameLines, M + 4, y + 7);
    doc.text(String(it.quantity), colQty + 14, y + 7, { align: 'right' });
    doc.text(fmt(Number(it.unit_price)), colUnit + 30, y + 7, { align: 'right' });
    // Total de ligne : valeur enregistrée, sinon calcul quantité × prix unitaire.
    const lineTotal = Number(it.total_price ?? 0) ||
      Number(it.quantity ?? 0) * Number(it.unit_price ?? 0);
    doc.text(fmt(lineTotal), right - 4, y + 7, { align: 'right' });
    subtotal += lineTotal;
    y += rowH;
  }

  // ---- Sous-total et montant payé
  const total = Number(order.total_amount ?? subtotal);
  y += 8;
  doc.setDrawColor(...LINE);
  doc.line(M, y, right, y);
  y += 7;
  doc.setFontSize(10);
  doc.setTextColor(...INK);
  doc.text('Sous-total', M + 2, y);
  doc.text(fmt(subtotal || total), right - 2, y, { align: 'right' });
  y += 5;
  doc.line(M, y, right, y);
  y += 9;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('MONTANT PAYÉ', M + 2, y);
  doc.setTextColor(...BLUE);
  doc.text(fmt(total), right - 2, y, { align: 'right' });

  // ---- Pied de page société
  y += 8;
  doc.setFillColor(...SOFT);
  doc.rect(M, y, w - 2 * M, 24, 'F');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...INK);
  doc.text(COMPANY.name, M + 4, y + 9);
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text(`${COMPANY.site} · ${COMPANY.email} · ${COMPANY.phone}`, M + 4, y + 16);
  doc.setFontSize(8);
  doc.text(`RCCM · CI-KGO-01-2026-B12-00111`, M + halfW + 4, y + 9);
  doc.text(`Capital · 1 000 000 FCFA`, M + halfW + 4, y + 16);

  // ---- Mention légale bas de page
  doc.setFillColor(...BLUE);
  doc.rect(M, h - 22, halfW + 20, 1, 'F');
  doc.setFillColor(...ORANGE);
  doc.rect(M + halfW + 20, h - 22, 8, 1, 'F');
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text('Document commercial · Reçu de commande', M, h - 16);
  doc.text(`${COMPANY.site} · ${COMPANY.phone}`, right, h - 16, { align: 'right' });

  return doc.output('arraybuffer');
}

function toBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return btoa(binary);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const token = authHeader.replace('Bearer ', '');
    const sb = createClient(SUPABASE_URL, SERVICE_KEY);
    const isInternalCall = token === SERVICE_KEY;

    let userId = '';
    if (!isInternalCall) {
      const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
      const authed = createClient(SUPABASE_URL, anonKey, { global: { headers: { Authorization: authHeader } } });
      const { data: claimsData, error: claimsErr } = await authed.auth.getClaims(token);
      if (claimsErr || !claimsData?.claims) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      userId = claimsData.claims.sub as string;
    }

    const { order_id, download, email } = await req.json();
    if (!order_id) return new Response(JSON.stringify({ error: 'order_id requis' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const { data: order, error: oErr } = await sb.from('orders').select('*').eq('id', order_id).maybeSingle();
    if (oErr || !order) return new Response(JSON.stringify({ error: 'Commande introuvable' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    if (!isInternalCall) {
      const { data: roles } = await sb.from('user_roles').select('role').eq('user_id', userId);
      const roleList = (roles || []).map((r: any) => r.role);
      const isStaff = roleList.some((role: string) =>
        ['super_admin', 'moderator', 'commercial', 'comptable', 'delivery'].includes(role)
      );
      const isOwner = order.user_id === userId;
      const isDelivery = order.delivery_user_id === userId;
      if (!isStaff && !isOwner && !isDelivery) {
        return new Response(JSON.stringify({ error: 'Forbidden' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    }

    const { data: payment } = await sb.from('payments')
      .select('amount, payment_method, payment_reference, transaction_id, status')
      .eq('order_id', order_id)
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // Un reçu reste disponible pour une commande déjà traitée (expédiée/livrée)
    // même si la ligne de paiement n'a pas encore été rapprochée.
    const advanced = ['confirmed', 'shipped', 'delivered'].includes(String(order.status));
    if (!payment && !advanced) {
      return new Response(JSON.stringify({ error: 'Aucun paiement confirmé pour cette commande' }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    order.payment_method = payment?.payment_method || order.payment_method;
    order.payment_reference = payment?.payment_reference || payment?.transaction_id || order.payment_reference;
    order.total_amount = Number(payment?.amount ?? order.total_amount ?? 0);
    order.payment_status_label = payment ? 'PAYÉ' : 'EN COURS';

    const { data: items } = await sb.from('order_items')
      .select('*, products(name_fr)').eq('order_id', order_id);
    const { data: profile } = order.user_id
      ? await sb.from('profiles').select('first_name, last_name, phone, email').eq('id', order.user_id).maybeSingle()
      : { data: null as any };

    const customerName = profile
      ? [profile.last_name, profile.first_name].filter(Boolean).join(' ') || 'Client Scoly'
      : 'Client Scoly';

    const buffer = buildPdf(order, items || [], {
      name: customerName,
      phone: order.phone || profile?.phone || '',
      address: order.shipping_address || '',
    });
    const orderNumber = String(order.id).slice(0, 8).toUpperCase();

    if (download) {
      return new Response(buffer, {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="SCOLY_Recu_commande_${orderNumber}.pdf"`,
        },
      });
    }

    const base64 = toBase64(buffer as ArrayBuffer);

    // Envoi du reçu par e-mail en pièce jointe.
    if (email) {
      let recipient = typeof email === 'string' ? email : (profile?.email as string | undefined);
      if (!recipient && order.user_id) {
        const { data: authUser } = await sb.auth.admin.getUserById(order.user_id);
        recipient = authUser?.user?.email ?? undefined;
      }
      if (!recipient) {
        return new Response(JSON.stringify({ error: 'Aucune adresse e-mail pour ce client' }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const sent = await sendBrevoEmail({
        from: { name: 'Scoly', email: 'noreply@scoly.ci' },
        to: recipient,
        subject: `Votre reçu de commande n° ${orderNumber} — Scoly`,
        html: brandedEmail({
          title: 'Votre reçu de commande',
          preheader: `Le reçu de votre commande n° ${orderNumber} est disponible.`,
          bodyHtml: `<p style="margin:0 0 16px;">Bonjour ${customerName},</p>
<p style="margin:0 0 16px;">Veuillez trouver en pièce jointe le reçu de votre commande n° <strong>${orderNumber}</strong> d'un montant de <strong>${fmt(Number(order.total_amount))}</strong>.</p>
<p style="margin:0;">Merci pour votre confiance.</p>`,
        }),
        category: 'receipt',
        emailType: 'receipt',
        dedupeKey: `receipt-${order_id}`,
        orderId: order_id,
        attachments: [{
          name: `SCOLY_Recu_commande_${orderNumber}.pdf`,
          content: base64,
          type: 'application/pdf',
        }],
      });

      if (!sent.ok) {
        return new Response(JSON.stringify({ error: "Le reçu n'a pas pu être envoyé par e-mail" }),
          { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      return new Response(JSON.stringify({ ok: true, emailed: true, recipient, order_number: orderNumber }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ ok: true, pdf_base64: base64, order_number: orderNumber }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('[generate-receipt-pdf]', e);
    return new Response(JSON.stringify({ error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
