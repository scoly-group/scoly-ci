import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle, Loader2, AlertCircle, Tag, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useLanguage } from "@/i18n/LanguageContext";
import { useCart } from "@/contexts/CartContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { MIN_ORDER_AMOUNT, isOrderAmountValid, formatMinOrderMessage } from "@/lib/orderRules";
import PhoneInput from "@/components/common/PhoneInput";
import { signInClientByPhone, ClientAuthError } from "@/lib/clientAuth";

import { openKkiapayPayment } from "@/lib/kkiapay";

type CheckoutStep = 'form' | 'payment' | 'success';
/** Règlement immédiat en ligne ou règlement au moment de la livraison. */
type PaymentOption = 'online' | 'on_delivery';

const Checkout = () => {
  const { language, t } = useLanguage();
  const { items, kits, total, clearCart, loading: cartLoading, refreshCart } = useCart();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [step, setStep] = useState<CheckoutStep>('form');
  const [loading, setLoading] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [orderNumber, setOrderNumber] = useState("");
  const [paying, setPaying] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [paymentOption, setPaymentOption] = useState<PaymentOption>('online');
  
  // Coupon state
  const [couponCode, setCouponCode] = useState("");
  const [couponLoading, setCouponLoading] = useState(false);
  const [appliedCoupon, setAppliedCoupon] = useState<{
    id: string;
    code: string;
    discount: number;
  } | null>(null);
  
  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    phone: "",
    deliveryPlace: "",
    notes: "",
  });
  const [lookupBusy, setLookupBusy] = useState(false);

  // Calculate final total with discount
  const discountAmount = appliedCoupon?.discount || 0;
  const finalTotal = Math.max(0, total - discountAmount);


  // Load user profile data and check for loyalty coupons
  useEffect(() => {
    if (user) {
      const loadProfile = async () => {
        const [{ data }, { data: address }] = await Promise.all([supabase
          .from('profiles')
          .select('first_name, last_name, phone')
          .eq('id', user.id)
          .single(), supabase
          .from('user_addresses')
          .select('address,city,region,phone')
          .eq('user_id', user.id)
          .order('is_default', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()]);

        if (data) {
          setFormData(prev => ({
            ...prev,
            fullName: [data.first_name, data.last_name].filter(Boolean).join(' '),
            phone: address?.phone || data.phone || '',
            email: user.email || '',
            deliveryPlace: address?.address || prev.deliveryPlace,
          }));
        }
      };
      loadProfile();
    }
  }, [user]);

  // Rafraîchit le panier une seule fois à l'ouverture de la page.
  // (dépendance vide : refreshCart change de référence à chaque rendu)
  useEffect(() => {
    void refreshCart();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  // Auto-apply loyalty coupon if available
  useEffect(() => {
    if (!user || appliedCoupon || total <= 0) return;

    const checkLoyaltyCoupons = async () => {
      try {
        // Get unused loyalty rewards with coupon codes
        const { data: rewards, error } = await supabase
          .from('loyalty_rewards')
          .select('*')
          .eq('user_id', user.id)
          .eq('is_used', false)
          .not('coupon_code', 'is', null)
          .order('created_at', { ascending: false })
          .limit(1);

        if (error || !rewards || rewards.length === 0) return;

        const reward = rewards[0];
        
        // Check if expired
        if (reward.expires_at && new Date(reward.expires_at) < new Date()) {
          return;
        }

        // Try to validate and apply the loyalty coupon
        const { data: couponData, error: couponError } = await supabase.rpc('validate_coupon', {
          _code: reward.coupon_code,
          _order_total: total
        });

        if (couponError || !couponData || couponData.length === 0) {
          console.log('[Checkout] Loyalty coupon not valid for this order');
          return;
        }

        const validCoupon = couponData[0];
        setAppliedCoupon({
          id: validCoupon.coupon_id,
          code: reward.coupon_code,
          discount: validCoupon.discount_value
        });
        
        toast({
          title: "Coupon fidélité appliqué !",
          description: `Votre récompense de ${validCoupon.discount_value.toLocaleString()} FCFA a été automatiquement appliquée.`,
        });
      } catch (error) {
        console.error('[Checkout] Error checking loyalty coupons:', error);
      }
    };

    checkLoyaltyCoupons();
  }, [user, total, appliedCoupon, toast]);

  const getLocalizedName = (product: any) => {
    if (!product) return '';
    switch (language) {
      case 'en': return product.name_en;
      case 'de': return product.name_de;
      case 'es': return product.name_es;
      default: return product.name_fr;
    }
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('fr-FR').format(price) + ' ' + t.common.currency;
  };

  // Apply coupon code
  const handleApplyCoupon = async () => {
    if (!couponCode.trim()) return;
    
    setCouponLoading(true);
    try {
      const { data, error } = await supabase.rpc('validate_coupon', {
        _code: couponCode.toUpperCase().trim(),
        _order_total: total
      });

      if (error) {
        toast({
          title: "Code invalide",
          description: error.message || "Ce code promo n'est pas valide",
          variant: "destructive",
        });
        return;
      }

      if (data && data.length > 0) {
        const couponData = data[0];
        setAppliedCoupon({
          id: couponData.coupon_id,
          code: couponCode.toUpperCase().trim(),
          discount: couponData.discount_value
        });
        toast({
          title: "Code appliqué !",
          description: `Vous économisez ${couponData.discount_value.toLocaleString()} FCFA`,
        });
        setCouponCode("");
      }
    } catch (error) {
      console.error('Coupon error:', error);
      toast({
        title: "Erreur",
        description: "Impossible de valider le code promo",
        variant: "destructive",
      });
    } finally {
      setCouponLoading(false);
    }
  };

  const removeCoupon = () => {
    setAppliedCoupon(null);
  };

  const validateForm = () => {
    // Seuls le nom et le numéro de téléphone sont obligatoires.
    if (!formData.fullName.trim() || !formData.phone.trim()) {
      toast({
        title: t.common.error,
        description: "Indiquez votre nom et votre numéro de téléphone",
        variant: "destructive",
      });
      return false;
    }
    const mail = formData.email.trim();
    if (mail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) {
      toast({
        title: t.common.error,
        description: "Adresse e-mail invalide",
        variant: "destructive",
      });
      return false;
    }
    // Numéro international normalisé (E.164) : indicatif + 6 à 15 chiffres
    const phoneRegex = /^\+[1-9]\d{6,14}$/;
    if (!phoneRegex.test(formData.phone.replace(/[\s.-]/g, ''))) {

      toast({
        title: t.common.error,
        description: "Numéro de téléphone invalide",
        variant: "destructive",
      });
      return false;
    }
    return true;
  };

  const autofillClient = async () => {
    if (user || formData.phone.replace(/\D/g, '').length < 8) return;
    setLookupBusy(true);
    try {
      const { data } = await supabase.functions.invoke('client-phone-auth', {
        body: { action: 'profile', phone: formData.phone, create: false },
      });
      const found = data?.profile as { first_name?: string; last_name?: string; email?: string; delivery_place?: string } | undefined;
      if (found) setFormData((current) => ({
        ...current,
        fullName: [found.first_name, found.last_name].filter(Boolean).join(' ') || current.fullName,
        email: found.email || current.email,
        deliveryPlace: found.delivery_place || current.deliveryPlace,
      }));
    } finally { setLookupBusy(false); }
  };

  /**
   * Enregistre la commande.
   * Aucune connexion préalable n'est demandée : le compte client est créé
   * automatiquement à partir du numéro de téléphone.
   */
  const handleSubmit = async (e: React.FormEvent | null, option: PaymentOption = 'online') => {
    e?.preventDefault();

    if (items.length === 0 && kits.length === 0) {
      toast({ title: "Panier vide", description: "Ajoutez un article avant de payer.", variant: "destructive" });
      return;
    }
    if (!isOrderAmountValid(finalTotal)) {
      toast({ title: "Montant trop bas", description: formatMinOrderMessage(), variant: "destructive" });
      return;
    }
    if (!validateForm()) return;

    setLoading(true);
    setPaymentOption(option);

    try {
      // Compte client : session ouverte automatiquement avec le numéro saisi.
      let buyerId = user?.id ?? null;
      if (!buyerId) {
        try {
          const account = await signInClientByPhone({
            phone: formData.phone,
            fullName: formData.fullName,
            email: formData.email,
          });
          buyerId = account.userId;
        } catch (authError) {
          const message =
            authError instanceof ClientAuthError
              ? authError.message
              : "Impossible d'ouvrir votre espace client.";
          toast({ title: "Commande impossible", description: message, variant: "destructive" });
          setLoading(false);
          return;
        }
      }

      const fullAddress = formData.deliveryPlace.trim();

      // Create order with coupon info
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert({
          user_id: buyerId,
          total_amount: finalTotal,
          discount_amount: discountAmount,
          coupon_code: appliedCoupon?.code || null,
          shipping_address: fullAddress || null,
          phone: formData.phone,
          notes: formData.notes,
          payment_method: option === 'online' ? 'kkiapay' : 'Paiement à la livraison',
          payment_option: option,
          status: 'pending',
        })
        .select()
        .single();

      if (orderError) throw orderError;

      // Record coupon redemption if applicable
      if (appliedCoupon) {
        await supabase.from('coupon_redemptions').insert({
          coupon_id: appliedCoupon.id,
          user_id: buyerId,
          order_id: order.id,
          discount_amount: discountAmount
        });
        
        // Increment coupon used_count server-side (coupon table is not readable by clients)
        await supabase.rpc('increment_coupon_usage', { _coupon_id: appliedCoupon.id });

        
        // Mark loyalty reward as used if it's a loyalty coupon
        if (appliedCoupon.code.startsWith('LOYALTY-')) {
          await supabase
            .from('loyalty_rewards')
            .update({ is_used: true, used_at: new Date().toISOString() })
            .eq('coupon_code', appliedCoupon.code)
            .eq('user_id', buyerId);
        }
      }

      // Create order items — products + kits (kits reified with product_id NULL)
      const productLines = items.map(item => ({
        order_id: order.id,
        product_id: item.product_id,
        product_name: getLocalizedName(item.product),
        quantity: item.quantity,
        unit_price: item.product?.price || 0,
        total_price: (item.product?.price || 0) * item.quantity,
      }));

      const kitLines = kits.map(kit => ({
        order_id: order.id,
        product_id: null as string | null,
        kit_id: kit.kit_id,
        product_name: `Kit: ${kit.name}${kit.school_name ? ` — ${kit.school_name}` : ''} (${kit.grade_level || ''})`,
        quantity: kit.quantity,
        // Price is authoritative server-side (enforced by trigger from smart_kits)
        unit_price: kit.price,
        total_price: kit.price * kit.quantity,
      }));


      const orderItems = [...productLines, ...kitLines];

      if (orderItems.length > 0) {
        const { error: itemsError } = await supabase
          .from('order_items')
          .insert(orderItems);
        if (itemsError) throw itemsError;
      }

      // Persist kit composition into order notes so the team sees full detail
      if (kits.length > 0) {
        const kitNotes = kits.map(k =>
          `— Kit ${k.name} (${k.grade_level || ''}${k.school_name ? ' · ' + k.school_name : ''}) × ${k.quantity}\n` +
          k.composition.map(c => `   • ${c.name} ×${c.quantity}${c.is_optional ? ' (option)' : ''}`).join('\n')
        ).join('\n\n');
        const combinedNotes = [formData.notes, '', '=== Composition des kits ===', kitNotes]
          .filter(Boolean).join('\n');
        await supabase.from('orders').update({ notes: combinedNotes }).eq('id', order.id);
      }


      setOrderId(order.id);
      setOrderNumber(order.id.slice(0, 8).toUpperCase());

      // Aucun SMS à cette étape : les messages partent uniquement après
      // confirmation du paiement par l'opérateur (retour webhook KkiaPay).

      if (option === 'on_delivery') {
        // Paiement à la livraison : la commande part telle quelle, l'équipe
        // encaisse au moment de la remise.
        await clearCart();
        await refreshCart();
        setStep('success');
        window.scrollTo({ top: 0, behavior: 'instant' });
        toast({
          title: "Commande enregistrée",
          description: "Vous réglerez au moment de la livraison.",
        });
        return;
      }

      // Commande enregistrée : passage à l'étape de règlement en ligne.
      setStep('payment');
      window.scrollTo({ top: 0, behavior: 'instant' });
      startPayment(order.id, finalTotal);
    } catch (error) {
      console.error('Error creating order:', error);
      toast({
        title: t.common.error,
        description: error instanceof Error ? error.message : t.common.tryAgain,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Ouvre le module de paiement puis vérifie la transaction côté serveur.
  const startPayment = async (id: string, amount: number) => {
    setPaymentError(null);
    setPaying(true);
    try {
      await openKkiapayPayment({
        amount,
        orderId: id,
        phone: formData.phone,
        email: formData.email,
        fullname: formData.fullName,
        onFailed: () => {
          setPaying(false);
          setPaymentError("Le paiement n'a pas abouti. Vous pouvez réessayer.");
        },
        onSuccess: async (transactionId) => {
          try {
            const { data, error } = await supabase.functions.invoke('verify-kkiapay-payment', {
              body: { transactionId, orderId: id },
            });
            if (error || !data?.success) {
              throw new Error("Paiement non confirmé par l'opérateur.");
            }
            await clearCart();
            await refreshCart();
            setPaying(false);
            setStep('success');
            window.scrollTo({ top: 0, behavior: 'instant' });
            toast({
              title: t.checkout.orderSuccess,
              description: t.checkout.orderSuccessMessage,
            });
          } catch (err) {
            setPaying(false);
            setPaymentError(
              err instanceof Error ? err.message : "Paiement non confirmé. Contactez-nous si le montant a été débité.",
            );
          }
        },
      });
    } catch (err) {
      setPaying(false);
      setPaymentError(err instanceof Error ? err.message : "Paiement indisponible pour le moment.");
    }
  };



  // Payment screen
  if (step === 'payment') {
    return (
      <main className="min-h-screen bg-background">
        <Navbar />
        <div className="pt-24 pb-12">
          <div className="container mx-auto px-4 max-w-lg text-center py-20">
            <h1 className="text-3xl font-display font-bold text-foreground mb-4">
              Règlement de votre commande
            </h1>
            <div className="bg-card rounded-xl border border-border p-6 mb-6">
              <p className="text-sm text-muted-foreground">Commande n° {orderNumber}</p>
              <p className="text-3xl font-bold text-primary mt-2">{formatPrice(finalTotal)}</p>
              <p className="text-sm text-muted-foreground mt-2">
                Orange Money, MTN, Moov, Wave, carte bancaire ou virement.
              </p>
            </div>

            {paymentError && (
              <p className="text-sm text-destructive mb-4">{paymentError}</p>
            )}

            <div className="flex flex-col gap-3">
              <Button
                variant="hero"
                disabled={paying}
                onClick={() => orderId && startPayment(orderId, finalTotal)}
              >
                {paying ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Paiement en cours…</>
                ) : (
                  paymentError ? "Réessayer le paiement" : "Payer maintenant"
                )}
              </Button>
            </div>
          </div>
        </div>
        <Footer />
      </main>
    );
  }

  // Success screen
  if (step === 'success') {
    return (
      <main className="min-h-screen bg-background">
        <Navbar />
        <div className="pt-24 pb-12">
          <div className="container mx-auto px-4 max-w-lg text-center py-20">
            <div className="w-20 h-20 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle size={48} className="text-green-500" />
            </div>
            <h1 className="text-3xl font-display font-bold text-foreground mb-4">
              {t.checkout.orderSuccess}
            </h1>
            <p className="text-muted-foreground mb-6">
              {t.checkout.orderSuccessMessage}
            </p>
            <div className="bg-card rounded-xl border border-border p-6 mb-6">
              <p className="text-sm text-muted-foreground">{t.checkout.orderNumber}</p>
              <p className="text-2xl font-bold text-primary">{orderNumber}</p>
            </div>
            <div className="flex flex-col gap-3">
              <Button variant="hero" onClick={() => navigate("/account")}>
                {t.checkout.trackOrder}
              </Button>
              <Button variant="outline" onClick={() => navigate("/shop")}>
                Continuer mes achats
              </Button>
            </div>
          </div>
        </div>
        <Footer />
      </main>
    );
  }

  // Form screen
  return (
    <main className="min-h-screen bg-background">
      <Navbar />
      
      <div className="pt-24 pb-12">
        <div className="container mx-auto px-4">
          <h1 className="text-3xl font-display font-bold text-foreground mb-8">
            {t.checkout.title}
          </h1>

          {cartLoading && items.length === 0 && kits.length === 0 ? (
            <div className="flex items-center justify-center py-20 text-muted-foreground">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Chargement du panier…
            </div>
          ) : items.length === 0 && kits.length === 0 ? (
            <div className="text-center py-12">
              <AlertCircle className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
              <p className="text-lg text-muted-foreground mb-4">Votre panier est vide</p>
              <Button variant="hero" onClick={() => navigate('/shop')}>
                Découvrir nos produits
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Form */}
                <div className="lg:col-span-2 space-y-8">
                  {/* Delivery contact */}
                  <div className="bg-card rounded-xl border border-border p-6">
                    <h2 className="text-xl font-display font-bold text-foreground mb-6">
                      Informations de livraison
                    </h2>
                    <div className="grid grid-cols-1 gap-4">
                      <div>
                        <Label htmlFor="fullName">Nom et prénoms *</Label>
                        <Input
                          id="fullName"
                          value={formData.fullName}
                          onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                          required
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label htmlFor="phone">Numéro de téléphone *</Label>
                        <PhoneInput
                          id="phone"
                          value={formData.phone}
                          onChange={(phone) => setFormData({ ...formData, phone })}
                          onBlur={() => void autofillClient()}
                          required
                          className="mt-1"
                        />
                        <p className="mt-1 text-xs text-muted-foreground">
                          Votre espace client est créé automatiquement avec ce numéro : aucun mot de passe à retenir.
                        </p>
                      </div>

                      <div>
                        <Label htmlFor="email">Adresse e-mail (facultatif)</Label>
                        <Input
                          id="email"
                          type="email"
                          value={formData.email}
                          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                          className="mt-1"
                          placeholder="Pour recevoir le reçu par e-mail"
                        />
                      </div>

                      <div>
                        <Label htmlFor="deliveryPlace">Lieu de livraison (facultatif)</Label>
                        <Input
                          id="deliveryPlace"
                          value={formData.deliveryPlace}
                          onChange={(e) => setFormData({ ...formData, deliveryPlace: e.target.value })}
                          className="mt-1"
                          placeholder="Ville, village ou quartier"
                        />
                        {lookupBusy && <p className="mt-1 text-xs text-muted-foreground">Recherche de vos informations…</p>}
                      </div>
                      <div>
                        <Label htmlFor="deliveryInstructions">Instructions de livraison (facultatif)</Label>
                        <Textarea
                          id="deliveryInstructions"
                          value={formData.notes}
                          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                          className="mt-1"
                          placeholder="Disponibilités, personne à contacter, précision utile…"
                          rows={3}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Order Summary */}
                <div>
                  <div className="bg-card rounded-xl border border-border p-6 sticky top-24">
                    <h2 className="text-xl font-display font-bold text-foreground mb-6">
                      {t.checkout.orderSummary}
                    </h2>
                    
                    <div className="space-y-4 mb-6">
                      {items.map((item) => (
                        <div key={item.id} className="flex gap-4">
                          <div className="w-16 h-16 bg-muted rounded-lg overflow-hidden flex-shrink-0">
                            <img
                              src={item.product?.image_url || "/placeholder.svg"}
                              alt={getLocalizedName(item.product)}
                              className="w-full h-full object-cover"
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm truncate">{getLocalizedName(item.product)}</p>
                            <p className="text-sm text-muted-foreground">x{item.quantity}</p>
                            <p className="text-sm font-medium text-primary">
                              {formatPrice((item.product?.price || 0) * item.quantity)}
                            </p>
                          </div>
                        </div>
                      ))}
                      {kits.map((kit) => (
                        <div key={kit.kit_id} className="flex gap-4">
                          <div className="w-16 h-16 bg-muted rounded-lg overflow-hidden flex-shrink-0">
                            <img
                              src={kit.image_url || "/placeholder.svg"}
                              alt={kit.name}
                              className="w-full h-full object-cover"
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm truncate">{kit.name}</p>
                            <p className="text-sm text-muted-foreground">Kit · x{kit.quantity}</p>
                            <p className="text-sm font-medium text-primary">
                              {formatPrice(kit.price * kit.quantity)}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>


                    {/* Coupon Code Input */}
                    <div className="border-t border-border pt-4 mb-4">
                      <Label className="flex items-center gap-2 mb-2">
                        <Tag size={16} className="text-primary" />
                        Code promo
                      </Label>
                      {appliedCoupon ? (
                        <div className="flex items-center justify-between bg-green-500/10 border border-green-500/20 rounded-lg px-3 py-2">
                          <div>
                            <p className="font-medium text-green-600">{appliedCoupon.code}</p>
                            <p className="text-sm text-green-600">-{formatPrice(appliedCoupon.discount)}</p>
                          </div>
                          <Button variant="ghost" size="icon" onClick={removeCoupon}>
                            <X size={16} />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <Input
                            value={couponCode}
                            onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                            placeholder="PROMO2024"
                            className="uppercase"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            onClick={handleApplyCoupon}
                            disabled={couponLoading || !couponCode.trim()}
                          >
                            {couponLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Appliquer"}
                          </Button>
                        </div>
                      )}
                    </div>

                    <div className="border-t border-border pt-4 space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Sous-total</span>
                        <span>{formatPrice(total)}</span>
                      </div>
                      {appliedCoupon && (
                        <div className="flex justify-between text-sm text-green-600">
                          <span>Réduction ({appliedCoupon.code})</span>
                          <span>-{formatPrice(discountAmount)}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Livraison</span>
                        <span className="text-green-600 font-medium">Gratuite</span>
                      </div>
                      <div className="flex justify-between font-bold text-lg pt-2 border-t border-border">
                        <span>Total</span>
                        <span className="text-primary">{formatPrice(finalTotal)}</span>
                      </div>
                    </div>

                    <div className="mt-6 space-y-2">
                      <Button
                        type="submit"
                        variant="hero"
                        className="w-full"
                        disabled={loading}
                      >
                        {loading && paymentOption === 'online' ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            {t.common.loading}
                          </>
                        ) : (
                          "Payer en ligne"
                        )}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full"
                        disabled={loading}
                        onClick={() => handleSubmit(null, 'on_delivery')}
                      >
                        {loading && paymentOption === 'on_delivery' ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            {t.common.loading}
                          </>
                        ) : (
                          "Payer à la livraison"
                        )}
                      </Button>
                    </div>

                    <p className="text-xs text-muted-foreground text-center mt-4">
                      Paiement en ligne sécurisé par KkiaPay · Aucun compte à créer, votre numéro suffit.
                    </p>
                  </div>
                </div>
              </div>
            </form>
          )}
        </div>
      </div>

      <Footer />
    </main>
  );
};

export default Checkout;
