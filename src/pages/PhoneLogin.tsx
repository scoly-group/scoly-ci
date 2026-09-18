import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Loader2, Phone } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import PhoneInput from "@/components/common/PhoneInput";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { signInClientByPhone } from "@/lib/clientAuth";

const PhoneLogin = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { user, loading, rolesLoading } = useAuth();
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && !rolesLoading && user) navigate("/client", { replace: true });
  }, [user, loading, rolesLoading, navigate]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      await signInClientByPhone({ phone, create: false });
      navigate(params.get("redirect") || "/client", { replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Connexion impossible.");
    } finally { setBusy(false); }
  };

  return (
    <main className="min-h-screen bg-background">
      <Helmet><title>Espace client | Scoly</title><meta name="description" content="Retrouvez vos commandes Scoly avec votre numéro de téléphone." /></Helmet>
      <Navbar />
      <section className="pt-24 pb-16"><div className="container mx-auto max-w-md px-4">
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground"><Phone /></div>
          <h1 className="mt-4 text-center text-2xl font-bold">Espace client</h1>
          <p className="mt-2 text-center text-sm text-muted-foreground">Entrez uniquement le numéro utilisé lors de votre première commande.</p>
          <form onSubmit={submit} className="mt-6 space-y-4">
            <div><Label htmlFor="client-phone">Numéro de téléphone</Label><PhoneInput id="client-phone" value={phone} onChange={setPhone} required className="mt-1" /></div>
            <Button type="submit" variant="hero" className="w-full" disabled={busy}>{busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Connexion…</> : "Retrouver mon espace"}</Button>
          </form>
        </div>
      </div></section>
      <Footer />
    </main>
  );
};

export default PhoneLogin;