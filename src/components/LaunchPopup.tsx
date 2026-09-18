import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, CreditCard, Handshake, Loader2, PackageCheck, Phone, Search, ShoppingCart, Truck, X } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { signInClientByPhone } from "@/lib/clientAuth";
import logoAsset from "@/assets/logo-scoly-officiel.png.asset.json";
import schoolBag from "@/assets/scoly-school-bag.png";

const CAMPAIGN_KEY = "scolyWelcomePopup:2026-09-18";
const FLOATING_DELAY_MS = 45000;

const OrderTracker = () => {
  const navigate = useNavigate();
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const search = async () => {
    if (phone.replace(/\D/g, "").length < 8) {
      setResult("Entrez votre numéro de téléphone complet.");
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      await signInClientByPhone({ phone, create: false });
      navigate("/client", { replace: true });
    } catch (error) {
      setResult(error instanceof Error ? error.message : "Connexion impossible pour le moment.");
      setLoading(false);
    }
  };

  return (
    <div className="rounded-lg bg-primary/5 p-3 sm:p-4">
      <div className="flex items-start gap-3 text-left">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"><Search size={22} /></span>
        <div>
          <h3 className="text-base font-extrabold uppercase text-primary sm:text-lg">Suivre votre commande</h3>
          <p className="text-xs text-foreground sm:text-sm">Entrez votre numéro de téléphone pour suivre votre livraison.</p>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <div className="relative flex-1">
          <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary" />
          <Input value={phone} onChange={(event) => setPhone(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void search(); }} placeholder="Votre numéro de téléphone (ex. 07 02 58 44 57)" aria-label="Votre numéro de téléphone" className="h-11 pl-9 text-sm" />
        </div>
        <Button type="button" onClick={search} disabled={loading} size="icon" className="h-11 w-11 shrink-0" aria-label="Suivre ma commande">
          {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ArrowRight className="h-5 w-5" />}
        </Button>
      </div>
      {result && <p className="mt-2 text-xs font-medium text-foreground">{result}</p>}
    </div>
  );
};

export const LaunchPopup = () => {
  const [visible, setVisible] = useState(false);
  const [floating, setFloating] = useState(false);
  const timer = useRef<number | null>(null);
  const onHome = useLocation().pathname === "/";

  useEffect(() => {
    if (!onHome) { setVisible(false); setFloating(false); return; }
    const alreadySeen = localStorage.getItem(CAMPAIGN_KEY);
    const start = window.setTimeout(() => alreadySeen ? setFloating(true) : setVisible(true), alreadySeen ? FLOATING_DELAY_MS : 700);
    return () => window.clearTimeout(start);
  }, [onHome]);

  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);

  const close = () => {
    setVisible(false);
    localStorage.setItem(CAMPAIGN_KEY, new Date().toISOString());
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setFloating(true), FLOATING_DELAY_MS);
  };

  return (
    <AnimatePresence>
      {visible && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={close} className="fixed inset-0 z-[99999] bg-foreground/70 backdrop-blur-sm" />
          <div className="fixed inset-0 z-[100000] flex items-center justify-center p-3 pointer-events-none">
             <motion.section role="dialog" aria-modal="true" aria-label="Bienvenue sur Scoly" initial={{ opacity: 0, y: 24, scale: .98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 20, scale: .98 }} className="pointer-events-auto relative max-h-[96vh] w-full max-w-[660px] overflow-y-auto rounded-xl border-4 border-primary bg-card p-4 shadow-2xl sm:p-7">
              <Button type="button" variant="ghost" size="icon" onClick={close} className="absolute right-2 top-2 z-10" aria-label="Fermer"><X /></Button>
               <img src={logoAsset.url} alt="Scoly — Fournitures scolaires & bureautiques" className="mx-auto h-20 w-auto max-w-[72%] object-contain sm:h-28" />
              <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground sm:text-base">Bienvenue sur Scoly.</div>

               <div className="mt-4 grid grid-cols-[minmax(0,1fr)_7rem] items-center gap-2 sm:grid-cols-[minmax(0,1fr)_12rem]">
                 <div className="flex items-start gap-3">
                   <ShoppingCart className="mt-1 h-8 w-8 shrink-0 text-accent" />
                   <h2 className="text-xl font-extrabold uppercase leading-tight text-primary sm:text-3xl">Commander vos fournitures scolaires <span className="text-accent">en un clic</span></h2>
                 </div>
                 <img src={schoolBag} alt="Sac et fournitures scolaires" width={912} height={912} className="h-auto w-full object-contain" />
              </div>

              <div className="mt-5 grid gap-px overflow-hidden rounded-lg bg-border sm:grid-cols-2">
                <div className="flex items-center gap-3 bg-primary/5 p-4"><CreditCard className="h-8 w-8 shrink-0 text-primary" /><p className="font-bold text-primary">Paiement en ligne ou à la livraison</p></div>
                <div className="flex items-center gap-3 bg-primary/5 p-4"><Truck className="h-8 w-8 shrink-0 text-accent" /><p className="font-bold text-primary">Livraison gratuite partout en Côte d’Ivoire</p></div>
              </div>

              <div className="my-4 rounded-lg bg-accent/10 p-4 text-center">
                <div className="flex items-center justify-center gap-2"><PackageCheck className="h-7 w-7 text-primary" /><h3 className="font-extrabold text-primary">Vous avez une liste de fournitures particulières ?</h3></div>
                <p className="mt-1 text-sm text-foreground">Contactez nous pour une commande personnalisée.</p>
                <a href="tel:+2250702584457" className="mx-auto mt-3 inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2 font-bold text-accent-foreground"><Phone size={19} /> +225 07 02 58 44 57</a>
              </div>

              <OrderTracker />
              <div className="mt-4 flex items-center justify-center gap-2 text-sm font-semibold text-primary"><Handshake size={20} /> Merci de votre confiance.</div>
            </motion.section>
          </div>
        </>
      )}
      {!visible && floating && onHome && (
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="fixed bottom-4 left-4 z-[99998] flex items-center rounded-full border border-primary/30 bg-card shadow-xl">
          <Button type="button" variant="ghost" onClick={() => { setFloating(false); setVisible(true); }} className="rounded-full gap-2"><Search size={17} className="text-primary" /> Suivre votre commande</Button>
          <Button type="button" variant="ghost" size="icon" onClick={() => setFloating(false)} className="rounded-full" aria-label="Fermer"><X size={16} /></Button>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default LaunchPopup;