import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  School,
  Plus,
  Search,
  Pencil,
  CheckCircle2,
  Ban,
  RotateCcw,
  Archive,
  Users,
  Wallet,
  Loader2,
  Trash2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { isManager, isModerator } from "@/lib/rbac";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import SubPrefectureCombobox from "@/components/common/SubPrefectureCombobox";

type Status = "pending" | "approved" | "disabled" | "archived";

interface Establishment {
  id: string;
  name: string;
  code: string | null;
  type: string;
  status: Status;
  is_active: boolean;
  sub_prefecture: string | null;
  locality: string | null;
  city: string | null;
  region: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  created_by: string | null;
  created_at: string | null;
}

const STATUS_LABEL: Record<Status, string> = {
  pending: "En attente",
  approved: "Validé",
  disabled: "Désactivé",
  archived: "Archivé",
};

const STATUS_VARIANT: Record<Status, "default" | "secondary" | "destructive" | "outline"> = {
  pending: "secondary",
  approved: "default",
  disabled: "destructive",
  archived: "outline",
};

const TYPES = [
  { value: "preschool", label: "Maternelle" },
  { value: "primary", label: "Primaire" },
  { value: "secondary", label: "Secondaire" },
  { value: "university", label: "Université / Supérieur" },
  { value: "other", label: "Autre" },
];

const fcfa = (v: number | null | undefined) =>
  `${Number(v || 0).toLocaleString("fr-FR")} FCFA`;

const dt = (v: string | null | undefined) =>
  v ? new Date(v).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }) : "—";

const emptyForm = {
  id: "",
  name: "",
  type: "secondary",
  sub_prefecture: "",
  region: "",
  locality: "",
  contact_name: "",
  contact_phone: "",
  contact_email: "",
};

const EstablishmentsTab = () => {
  const { user, roles } = useAuth();
  const qc = useQueryClient();
  const canValidate = isManager(roles) || isModerator(roles);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | Status>("all");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [managersFor, setManagersFor] = useState<Establishment | null>(null);
  const [managerQuery, setManagerQuery] = useState("");

  const invokeSchools = async <T,>(body: Record<string, unknown>): Promise<T> => {
    const { data, error } = await supabase.functions.invoke("manage-schools", { body });
    const message = (data as { error?: string } | null)?.error;
    if (error || message) throw new Error(message || error?.message || "Opération impossible");
    return data as T;
  };

  // ---- Établissements -----------------------------------------------------
  const { data: schools = [], isLoading, error: schoolsError } = useQuery({
    queryKey: ["admin-establishments"],
    queryFn: async () => {
      const data = await invokeSchools<{ schools: Establishment[] }>({ action: "list" });
      return data.schools || [];
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return schools.filter((s) => {
      if (statusFilter !== "all" && s.status !== statusFilter) return false;
      if (!q) return true;
      return [s.name, s.sub_prefecture, s.locality, s.contact_name, s.contact_phone]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [schools, search, statusFilter]);

  const counts = useMemo(
    () => ({
      pending: schools.filter((s) => s.status === "pending").length,
      approved: schools.filter((s) => s.status === "approved").length,
      disabled: schools.filter((s) => s.status === "disabled").length,
    }),
    [schools],
  );

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["admin-establishments"] });
    qc.invalidateQueries({ queryKey: ["public-schools"] });
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) throw new Error("Le nom de l'établissement est obligatoire");
      if (!form.sub_prefecture) throw new Error("Choisissez la sous-préfecture");

      const payload = {
        name: form.name.trim(),
        type: form.type,
        sub_prefecture: form.sub_prefecture,
        region: form.region || null,
        city: form.sub_prefecture,
        locality: form.locality.trim() || null,
        contact_name: form.contact_name.trim() || null,
        contact_phone: form.contact_phone.trim() || null,
        contact_email: form.contact_email.trim() || null,
      };

      await invokeSchools({
        action: "save",
        school: { ...payload, ...(form.id ? { id: form.id } : {}) },
      });
    },
    onSuccess: () => {
      toast.success(
        form.id
          ? "Établissement mis à jour"
          : canValidate
            ? "Établissement créé et validé"
            : "Établissement soumis, en attente de validation",
      );
      setOpen(false);
      setForm({ ...emptyForm });
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || "Enregistrement impossible"),
  });

  const changeStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: Status }) => {
      await invokeSchools({ action: "status", schoolId: id, status });
    },
    onSuccess: () => {
      toast.success("Statut mis à jour");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || "Modification impossible"),
  });

  // ---- Gérants ------------------------------------------------------------
  const { data: managers = [] } = useQuery({
    queryKey: ["school-managers", managersFor?.id],
    enabled: !!managersFor,
    queryFn: async () => {
      const data = await invokeSchools<{ managers: Array<{ id: string; user_id: string; label: string }> }>({
        action: "managers",
        schoolId: managersFor?.id,
      });
      return data.managers || [];
    },
  });

  /**
   * Gérants disponibles : uniquement les utilisateurs à qui l'administration ou
   * la modération a accordé le rôle « Gérant ET » dans Rôles & permissions.
   */
  const { data: candidates = [] } = useQuery({
    queryKey: ["manager-candidates"],
    enabled: !!managersFor,
    queryFn: async () => {
      const data = await invokeSchools<{
        candidates: Array<{ id: string; first_name: string | null; last_name: string | null; email: string | null }>;
      }>({ action: "manager_candidates" });
      return data.candidates || [];
    },
  });

  const addManager = useMutation({
    mutationFn: async (userId: string) => {
      await invokeSchools({ action: "add_manager", schoolId: managersFor?.id, userId });
    },
    onSuccess: () => {
      toast.success("Gérant associé — accès établissement activé");
      setManagerQuery("");
      qc.invalidateQueries({ queryKey: ["school-managers"] });
    },
    onError: (e: Error) => toast.error(e.message || "Association impossible"),
  });

  const removeManager = useMutation({
    mutationFn: async (id: string) => {
      await invokeSchools({ action: "remove_manager", managerId: id });
    },
    onSuccess: () => {
      toast.success("Gérant retiré");
      qc.invalidateQueries({ queryKey: ["school-managers"] });
    },
    onError: (e: Error) => toast.error(e.message || "Retrait impossible"),
  });

  // ---- Commissions & retraits --------------------------------------------
  const { data: commissions = [] } = useQuery({
    queryKey: ["school-commissions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("school_commissions")
        .select("id,school_id,order_id,sale_amount,commission_amount,status,created_at,schools(name)")
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return (data || []) as unknown as Array<{
        id: string;
        school_id: string;
        order_id: string | null;
        sale_amount: number;
        commission_amount: number;
        status: string;
        created_at: string;
        schools: { name: string } | null;
      }>;
    },
  });

  const { data: withdrawals = [] } = useQuery({
    queryKey: ["school-withdrawals"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("school_withdrawals")
        .select("id,school_id,amount,status,payment_method,created_at,schools(name)")
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return (data || []) as unknown as Array<{
        id: string;
        school_id: string;
        amount: number;
        status: string;
        payment_method: string | null;
        created_at: string;
        schools: { name: string } | null;
      }>;
    },
  });

  const setWithdrawalStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from("school_withdrawals")
        .update({
          status,
          ...(status === "validated"
            ? { validated_by: user?.id ?? null, validated_at: new Date().toISOString() }
            : {}),
          ...(status === "paid" ? { paid_at: new Date().toISOString() } : {}),
        } as never)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Demande de retrait mise à jour");
      qc.invalidateQueries({ queryKey: ["school-withdrawals"] });
    },
    onError: (e: Error) => toast.error(e.message || "Mise à jour impossible"),
  });

  const commissionBySchool = useMemo(() => {
    const map = new Map<string, { name: string; total: number; pending: number }>();
    commissions.forEach((c) => {
      const key = c.school_id;
      const cur = map.get(key) || { name: c.schools?.name || "—", total: 0, pending: 0 };
      cur.total += Number(c.commission_amount || 0);
      if (c.status === "pending") cur.pending += Number(c.commission_amount || 0);
      map.set(key, cur);
    });
    return Array.from(map.entries()).map(([id, v]) => ({ id, ...v }));
  }, [commissions]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
            <School className="h-5 w-5 text-primary" /> Établissements partenaires
          </h2>
          <p className="text-sm text-muted-foreground">
            Création, validation, activation et commissions des établissements.
          </p>
        </div>
        <Button
          onClick={() => {
            setForm({ ...emptyForm });
            setOpen(true);
          }}
          className="gap-2"
        >
          <Plus className="h-4 w-4" /> Nouvel établissement
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total", value: schools.length },
          { label: "En attente", value: counts.pending },
          { label: "Validés", value: counts.approved },
          { label: "Désactivés", value: counts.disabled },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className="text-2xl font-bold text-foreground">{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="list">
        <TabsList>
          <TabsTrigger value="list">Établissements</TabsTrigger>
          <TabsTrigger value="commissions">Commissions (500 F/kit)</TabsTrigger>
          <TabsTrigger value="withdrawals">Retraits</TabsTrigger>
        </TabsList>

        {/* ---------- Liste ---------- */}
        <TabsContent value="list" className="space-y-4 pt-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Nom, sous-préfecture, contact…"
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
              <SelectTrigger className="w-full sm:w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les statuts</SelectItem>
                <SelectItem value="pending">En attente</SelectItem>
                <SelectItem value="approved">Validés</SelectItem>
                <SelectItem value="disabled">Désactivés</SelectItem>
                <SelectItem value="archived">Archivés</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : schoolsError ? (
            <Card>
              <CardContent className="p-8 text-center text-destructive">
                Chargement impossible : {schoolsError instanceof Error ? schoolsError.message : "réessayez dans un instant"}.
              </CardContent>
            </Card>
          ) : filtered.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                Aucun établissement pour ce filtre.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {filtered.map((s) => (
                <Card key={s.id}>
                  <CardContent className="p-4 flex flex-col lg:flex-row lg:items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-foreground truncate">{s.name}</p>
                        <Badge variant={STATUS_VARIANT[s.status]}>{STATUS_LABEL[s.status]}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground truncate">
                        {[s.sub_prefecture, s.locality].filter(Boolean).join(" · ") || "Localisation non renseignée"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Contact : {s.contact_name || "—"} {s.contact_phone ? `· ${s.contact_phone}` : ""} · créé le {dt(s.created_at)}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1"
                        onClick={() => {
                          setForm({
                            id: s.id,
                            name: s.name,
                            type: s.type || "secondary",
                            sub_prefecture: s.sub_prefecture || "",
                            region: s.region || "",
                            locality: s.locality || "",
                            contact_name: s.contact_name || "",
                            contact_phone: s.contact_phone || "",
                            contact_email: s.contact_email || "",
                          });
                          setOpen(true);
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" /> Modifier
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1"
                        onClick={() => {
                          setManagersFor(s);
                          setManagerQuery("");
                        }}
                      >
                        <Users className="h-3.5 w-3.5" /> Gérants
                      </Button>
                      {canValidate && s.status === "pending" && (
                        <Button
                          size="sm"
                          className="gap-1"
                          onClick={() => changeStatus.mutate({ id: s.id, status: "approved" })}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" /> Valider
                        </Button>
                      )}
                      {canValidate && s.status === "approved" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1"
                          onClick={() => changeStatus.mutate({ id: s.id, status: "disabled" })}
                        >
                          <Ban className="h-3.5 w-3.5" /> Désactiver
                        </Button>
                      )}
                      {canValidate && (s.status === "disabled" || s.status === "archived") && (
                        <Button
                          size="sm"
                          className="gap-1"
                          onClick={() => changeStatus.mutate({ id: s.id, status: "approved" })}
                        >
                          <RotateCcw className="h-3.5 w-3.5" /> Réactiver
                        </Button>
                      )}
                      {canValidate && s.status !== "archived" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1"
                          onClick={() => changeStatus.mutate({ id: s.id, status: "archived" })}
                        >
                          <Archive className="h-3.5 w-3.5" /> Archiver
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ---------- Commissions ---------- */}
        <TabsContent value="commissions" className="space-y-4 pt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Wallet className="h-4 w-4 text-primary" /> Commissions par établissement
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {commissionBySchool.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucune commission enregistrée.</p>
              ) : (
                commissionBySchool.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between border-b border-border pb-2 last:border-0"
                  >
                    <span className="font-medium text-foreground">{c.name}</span>
                    <span className="text-sm text-muted-foreground">
                      {fcfa(c.total)} · dont {fcfa(c.pending)} à payer
                    </span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Dernières commissions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {commissions.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucune vente de kit rattachée à un établissement.</p>
              ) : (
                commissions.slice(0, 50).map((c) => (
                  <div key={c.id} className="flex items-center justify-between text-sm border-b border-border pb-2 last:border-0">
                    <span className="truncate">{c.schools?.name || "—"}</span>
                    <span className="text-muted-foreground">
                      Vente {fcfa(c.sale_amount)} → {fcfa(c.commission_amount)} · {dt(c.created_at)}
                    </span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------- Retraits ---------- */}
        <TabsContent value="withdrawals" className="space-y-3 pt-4">
          {withdrawals.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                Aucune demande de retrait.
              </CardContent>
            </Card>
          ) : (
            withdrawals.map((w) => (
              <Card key={w.id}>
                <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-foreground truncate">{w.schools?.name || "—"}</p>
                    <p className="text-sm text-muted-foreground">
                      {fcfa(w.amount)} · {w.payment_method || "moyen non précisé"} · {dt(w.created_at)}
                    </p>
                  </div>
                  <Badge variant={w.status === "paid" ? "default" : w.status === "rejected" ? "destructive" : "secondary"}>
                    {w.status === "pending"
                      ? "En attente"
                      : w.status === "validated"
                        ? "Validée"
                        : w.status === "paid"
                          ? "Payée"
                          : "Rejetée"}
                  </Badge>
                  <div className="flex gap-2">
                    {w.status === "pending" && (
                      <>
                        <Button size="sm" onClick={() => setWithdrawalStatus.mutate({ id: w.id, status: "validated" })}>
                          Valider
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setWithdrawalStatus.mutate({ id: w.id, status: "rejected" })}
                        >
                          Rejeter
                        </Button>
                      </>
                    )}
                    {w.status === "validated" && (
                      <Button size="sm" onClick={() => setWithdrawalStatus.mutate({ id: w.id, status: "paid" })}>
                        Retrait effectué
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>

      {/* ---------- Formulaire ---------- */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{form.id ? "Modifier l'établissement" : "Nouvel établissement"}</DialogTitle>
            <DialogDescription>
              {canValidate
                ? "Validé automatiquement dès l'enregistrement."
                : "Votre soumission sera validée par l'administration ou la modération."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nom de l'établissement *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Lycée Moderne de…"
              />
            </div>

            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Sous-préfecture *</Label>
              <SubPrefectureCombobox
                value={form.sub_prefecture}
                onChange={(name, region) => setForm({ ...form, sub_prefecture: name, region })}
              />
              {form.region && <p className="text-xs text-muted-foreground">Région : {form.region}</p>}
            </div>

            <div className="space-y-2">
              <Label>Localité précise</Label>
              <Input
                value={form.locality}
                onChange={(e) => setForm({ ...form, locality: e.target.value })}
                placeholder="Quartier, repère, rue…"
              />
            </div>

            <div className="space-y-2">
              <Label>Personne à contacter</Label>
              <Input
                value={form.contact_name}
                onChange={(e) => setForm({ ...form, contact_name: e.target.value })}
                placeholder="Nom et prénoms"
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Input
                  value={form.contact_phone}
                  onChange={(e) => setForm({ ...form, contact_phone: e.target.value })}
                  placeholder="Téléphone"
                />
                <Input
                  value={form.contact_email}
                  onChange={(e) => setForm({ ...form, contact_email: e.target.value })}
                  placeholder="E-mail (facultatif)"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending} className="gap-2">
              {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------- Gérants ---------- */}
      <Dialog open={!!managersFor} onOpenChange={(v) => !v && setManagersFor(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Gérants de {managersFor?.name}</DialogTitle>
            <DialogDescription>
              Associer un gérant lui donne immédiatement l'accès à l'espace établissement.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              {managers.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucun gérant associé.</p>
              ) : (
                managers.map((m) => (
                  <div key={m.id} className="flex items-center justify-between rounded-md border border-border p-2">
                    <span className="text-sm text-foreground truncate">{m.label}</span>
                    <Button size="sm" variant="ghost" onClick={() => removeManager.mutate(m.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ))
              )}
            </div>

            <div className="space-y-2">
              <Label>Associer un gérant</Label>
              <Select
                value={managerQuery}
                onValueChange={(v) => {
                  setManagerQuery(v);
                  addManager.mutate(v);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choisir un gérant ET" />
                </SelectTrigger>
                <SelectContent>
                  {candidates.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-muted-foreground">
                      Aucun utilisateur n'a le rôle « Gérant ET ».
                    </div>
                  ) : (
                    candidates.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {`${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || "—"}
                        {c.email ? ` · ${c.email}` : ""}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                La liste provient des utilisateurs ayant le rôle « Gérant ET » dans
                Rôles &amp; permissions.
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default EstablishmentsTab;
