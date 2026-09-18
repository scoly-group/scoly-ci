import { useState } from "react";
import { Helmet } from "react-helmet-async";
import { Loader2, Lock, Mail, Phone, School, Send } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import SchoolCombobox, { type SchoolOption } from "@/components/kits/SchoolCombobox";

type Mode = "login" | "signup";

/** Connexion et création de compte pour les gérants d'établissement (/me). */
const EstablishmentAuth = () => {
  const [mode, setMode] = useState<Mode>("login");
  const [busy, setBusy] = useState(false);

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [school, setSchool] = useState<SchoolOption | null>(null);

  const login = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("phone-login", {
        body: { identifier: identifier.trim(), password },
      });
      if (error || !data?.access_token) {
        throw new Error("Identifiant ou mot de passe incorrect.");
      }
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
      });
      if (sessionError) throw new Error("Connexion impossible pour le moment.");
      toast.success("Connexion réussie !");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Connexion impossible.");
    } finally {
      setBusy(false);
    }
  };

  const signup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!school) {
      toast.error("Sélectionnez votre établissement.");
      return;
    }
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("school-manager-access", {
        body: {
          action: "request",
          school_id: school.id,
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          email: email.trim().toLowerCase(),
          phone: phone.trim(),
        },
      });
      if (error || data?.error) throw new Error(data?.error || "La demande n'a pas pu être envoyée.");
      toast.success("Demande envoyée. Votre compte sera créé après validation par l'administration.");
      setMode("login");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Création impossible.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen bg-background">
      <Helmet>
        <title>Espace établissement | Scoly</title>
        <meta
          name="description"
          content="Connectez-vous à l'espace établissement Scoly ou demandez la création de votre compte gérant."
        />
      </Helmet>
      <Navbar />

      <section className="pt-24 pb-16">
        <div className="container mx-auto px-4 max-w-md">
          <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
            <div className="flex items-center gap-2 text-primary">
              <School size={20} />
              <span className="text-xs font-bold uppercase tracking-widest">Espace établissement</span>
            </div>
            <h1 className="text-2xl font-display font-bold text-foreground mt-2">
              {mode === "login" ? "Connexion gérant" : "Demander un accès gérant"}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {mode === "login"
                ? "Numéro de téléphone ou e-mail, puis votre mot de passe."
                : "Votre compte sera créé uniquement après validation par l'administration."}
            </p>

            {mode === "login" ? (
              <form onSubmit={login} className="space-y-4 mt-6">
                <div>
                  <Label htmlFor="identifier">Téléphone ou e-mail</Label>
                  <div className="relative mt-1">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
                    <Input
                      id="identifier"
                      className="pl-10"
                      placeholder="07 00 00 00 00 ou vous@exemple.ci"
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      required
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="password">Mot de passe</Label>
                  <div className="relative mt-1">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
                    <Input
                      id="password"
                      type="password"
                      autoComplete="current-password"
                      className="pl-10"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                  </div>
                </div>
                <Button type="submit" variant="hero" className="w-full" disabled={busy}>
                  {busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Connexion…</> : "Se connecter"}
                </Button>
                <Button type="button" variant="outline" className="w-full gap-2" onClick={() => setMode("signup")}>
                  <Send size={16} /> Demander un accès
                </Button>
              </form>
            ) : (
              <form onSubmit={signup} className="space-y-4 mt-6">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="firstName">Prénom</Label>
                    <Input id="firstName" className="mt-1" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
                  </div>
                  <div>
                    <Label htmlFor="lastName">Nom</Label>
                    <Input id="lastName" className="mt-1" value={lastName} onChange={(e) => setLastName(e.target.value)} required />
                  </div>
                </div>
                <div>
                  <Label htmlFor="signup-email">Adresse e-mail</Label>
                  <div className="relative mt-1">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
                    <Input
                      id="signup-email"
                      type="email"
                      className="pl-10"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="signup-phone">Numéro de téléphone</Label>
                  <Input
                    id="signup-phone"
                    type="tel"
                    inputMode="tel"
                    className="mt-1"
                    placeholder="07 00 00 00 00"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <Label>Votre établissement</Label>
                  <div className="mt-1">
                    <SchoolCombobox value={school?.id ?? null} onChange={setSchool} />
                  </div>
                </div>
                <Button type="submit" variant="hero" className="w-full" disabled={busy}>
                  {busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Envoi…</> : "Envoyer ma demande"}
                </Button>
                <button type="button" className="w-full text-sm text-primary hover:underline" onClick={() => setMode("login")}>
                  J'ai déjà un compte
                </button>
              </form>
            )}
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
};

export default EstablishmentAuth;
