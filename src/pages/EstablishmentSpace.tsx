import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { School, Wallet, Package, Send, Loader2, MapPin, Phone } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import SEOHead from "@/components/SEOHead";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import InternalMessaging from "@/components/messaging/InternalMessaging";

const fcfa = (v: number | null | undefined) =>
  `${Number(v || 0).toLocaleString("fr-FR")} FCFA`;

const dt = (v: string | null | undefined) =>
  v ? new Date(v).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }) : "—";

/** Espace du gérant d'établissement partenaire (/me). */
const EstablishmentSpace = () => {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("");

  const { data: membershipRow } = useQuery({
    queryKey: ["my-establishment-membership", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("school_managers")
        .select("school_id, is_approved")
        .eq("user_id", user!.id)
        .limit(1)
        .maybeSingle();
      return data ?? null;
    },
  });

  /** Les informations financières restent masquées tant que la demande n'est pas validée. */
  const isApproved = membershipRow?.is_approved === true;

  const { data: school, isLoading } = useQuery({
    queryKey: ["my-establishment", membershipRow?.school_id],
    enabled: !!membershipRow?.school_id,
    queryFn: async () => {
      const schoolId = membershipRow!.school_id;

      // Fonction sécurisée : seul le staff, le propriétaire ou le gérant
      // de l'établissement peut lire les coordonnées de contact.
      const { data } = await (supabase.rpc as any)("list_manageable_schools");
      const rows = (data || []) as Array<{ id: string }>;
      return (rows.find((s) => s.id === schoolId) ?? null) as any;
    },
  });

  const schoolId = school?.id;

  const { data: balance } = useQuery({
    queryKey: ["establishment-balance", schoolId],
    enabled: !!schoolId && isApproved,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_school_balance", { _school_id: schoolId! });
      if (error) throw error;
      return data as unknown as {
        earned: number;
        withdrawn: number;
        pending: number;
        available: number;
      };
    },
  });

  const { data: kits = [] } = useQuery({
    queryKey: ["establishment-kits", schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data } = await supabase
        .from("smart_kits")
        .select("id,name,grade_level,total_price,status,is_active")
        .eq("school_id", schoolId!)
        .order("name");
      return data || [];
    },
  });

  const { data: commissions = [] } = useQuery({
    queryKey: ["establishment-commissions", schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data } = await supabase
        .from("school_commissions")
        .select("id,sale_amount,commission_amount,status,created_at")
        .eq("school_id", schoolId!)
        .order("created_at", { ascending: false })
        .limit(100);
      return data || [];
    },
  });

  const { data: withdrawals = [] } = useQuery({
    queryKey: ["establishment-withdrawals", schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data } = await supabase
        .from("school_withdrawals")
        .select("id,amount,status,payment_method,created_at,paid_at")
        .eq("school_id", schoolId!)
        .order("created_at", { ascending: false })
        .limit(50);
      return data || [];
    },
  });

  const available = balance?.available ?? 0;

  const requestWithdrawal = useMutation({
    mutationFn: async () => {
      const value = Number(amount);
      if (!value || value <= 0) throw new Error("Indiquez un montant valide");
      if (value > available) throw new Error("Montant supérieur au solde disponible");
      const { error } = await supabase.from("school_withdrawals").insert({
        school_id: schoolId!,
        requested_by: user!.id,
        amount: value,
        payment_method: method || null,
        status: "pending",
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Demande de retrait envoyée");
      setAmount("");
      setMethod("");
      qc.invalidateQueries({ queryKey: ["establishment-withdrawals", schoolId] });
      qc.invalidateQueries({ queryKey: ["establishment-balance", schoolId] });
    },
    onError: (e: Error) => toast.error(e.message || "Demande impossible"),
  });

  const totals = useMemo(
    () => ({
      sales: commissions.reduce((s, c) => s + Number(c.sale_amount || 0), 0),
      count: commissions.length,
    }),
    [commissions],
  );

  return (
    <div className="min-h-screen bg-background">
      <SEOHead
        title="Espace établissement partenaire | Scoly"
        description="Suivez vos kits scolaires, vos commissions de 500 FCFA par kit et vos retraits en tant qu'établissement partenaire Scoly."
      />
      <Navbar />

      <main className="container mx-auto px-4 py-8 space-y-6">
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : !school ? (
          <Card>
            <CardContent className="p-10 text-center space-y-2">
              <School className="h-10 w-10 mx-auto text-muted-foreground" />
              <h1 className="text-xl font-bold text-foreground">Aucun établissement associé</h1>
              <p className="text-muted-foreground">
                Votre compte n'est encore rattaché à aucun établissement partenaire. Contactez l'équipe
                Scoly pour l'association.
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            <Card>
              <CardContent className="p-6 flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h1 className="text-2xl font-bold text-foreground truncate">{school.name}</h1>
                    <Badge variant={school.status === "approved" ? "default" : "secondary"}>
                      {school.status === "approved" ? "Validé" : "En attente"}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                    <MapPin className="h-3.5 w-3.5" />
                    {[school.sub_prefecture, school.locality].filter(Boolean).join(" · ") || "Localisation non renseignée"}
                  </p>
                  {school.contact_phone && (
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      <Phone className="h-3.5 w-3.5" /> {school.contact_phone}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            {!isApproved && (
              <Card className="border-amber-500/40 bg-amber-500/10">
                <CardContent className="p-4">
                  <p className="text-sm font-semibold text-foreground">
                    Votre accès est en cours de validation
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Les commissions, le solde et les retraits s'afficheront dès que l'équipe Scoly
                    aura validé votre rattachement à l'établissement.
                  </p>
                </CardContent>
              </Card>
            )}

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {(isApproved
                ? [
                    { label: "Commissions gagnées", value: fcfa(balance?.earned) },
                    { label: "Solde disponible", value: fcfa(available) },
                    { label: "Retraits payés", value: fcfa(balance?.withdrawn) },
                    { label: "Ventes de kits", value: `${totals.count}` },
                  ]
                : [{ label: "Ventes de kits", value: `${totals.count}` }]
              ).map((s) => (
                <Card key={s.label}>
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">{s.label}</p>
                    <p className="text-xl font-bold text-foreground">{s.value}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Tabs defaultValue="kits">
              <TabsList>
                <TabsTrigger value="kits">Mes kits</TabsTrigger>
                {isApproved && <TabsTrigger value="commissions">Commissions</TabsTrigger>}
                {isApproved && <TabsTrigger value="withdrawals">Retraits</TabsTrigger>}
                <TabsTrigger value="messages">Messages</TabsTrigger>
              </TabsList>

              <TabsContent value="kits" className="pt-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Package className="h-4 w-4 text-primary" /> Kits rattachés à l'établissement
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {kits.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Aucun kit rattaché pour le moment.</p>
                    ) : (
                      kits.map((k) => (
                        <div key={k.id} className="flex items-center justify-between border-b border-border pb-2 last:border-0">
                          <div className="min-w-0">
                            <p className="font-medium text-foreground truncate">{k.name}</p>
                            <p className="text-xs text-muted-foreground">{k.grade_level}</p>
                          </div>
                          <span className="text-sm text-muted-foreground">{fcfa(k.total_price)}</span>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="commissions" className="pt-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Wallet className="h-4 w-4 text-primary" /> 500 FCFA sur chaque kit vendu
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {commissions.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Aucune commission pour le moment.</p>
                    ) : (
                      commissions.map((c) => (
                        <div key={c.id} className="flex items-center justify-between text-sm border-b border-border pb-2 last:border-0">
                          <span>{dt(c.created_at)}</span>
                          <span className="text-muted-foreground">
                            Vente {fcfa(c.sale_amount)} → <strong className="text-foreground">{fcfa(c.commission_amount)}</strong>
                          </span>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="withdrawals" className="pt-4 space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Demander un retrait</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label>Montant (FCFA)</Label>
                        <Input
                          type="number"
                          value={amount}
                          onChange={(e) => setAmount(e.target.value)}
                          placeholder={`Maximum ${available}`}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Moyen de réception</Label>
                        <Input
                          value={method}
                          onChange={(e) => setMethod(e.target.value)}
                          placeholder="Orange Money, Wave, virement…"
                        />
                      </div>
                    </div>
                    <Button
                      onClick={() => requestWithdrawal.mutate()}
                      disabled={requestWithdrawal.isPending || available <= 0}
                      className="gap-2"
                    >
                      {requestWithdrawal.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                      Envoyer la demande
                    </Button>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Historique</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {withdrawals.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Aucune demande enregistrée.</p>
                    ) : (
                      withdrawals.map((w) => (
                        <div key={w.id} className="flex items-center justify-between text-sm border-b border-border pb-2 last:border-0">
                          <span>{dt(w.created_at)} · {fcfa(w.amount)}</span>
                          <Badge variant={w.status === "paid" ? "default" : w.status === "rejected" ? "destructive" : "secondary"}>
                            {w.status === "pending"
                              ? "En attente"
                              : w.status === "validated"
                                ? "Validée"
                                : w.status === "paid"
                                  ? "Payée"
                                  : "Rejetée"}
                          </Badge>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="messages" className="pt-4">
                <InternalMessaging />
              </TabsContent>
            </Tabs>
          </>
        )}
      </main>

      <Footer />
    </div>
  );
};

export default EstablishmentSpace;
