import { useCallback, useEffect, useState } from "react";
import { Loader2, CreditCard, CheckCircle, Truck, PackageCheck, RefreshCw, Eye } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { usePaymentTracking } from "@/hooks/usePaymentTracking";
import PaymentStatusTracker from "@/components/PaymentStatusTracker";
import ReceiptDownloadButton from "@/components/ReceiptDownloadButton";
import { AddPaymentDialog } from "@/components/payments/AddPaymentDialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/**
 * Suivi des encaissements : seuls les paiements réussis existent côté
 * administration. Le bouton « Actualiser » relance aussi le rattrapage
 * automatique des transactions payées mais non encore enregistrées.
 */
const PaymentsTab = () => {
  const { payments, loading, fetchAllPayments } = usePaymentTracking({
    enableRealtime: true,
    enablePolling: false,
  });

  const [searchQuery, setSearchQuery] = useState("");
  const [orderStats, setOrderStats] = useState({ shipped: 0, delivered: 0 });
  const [reconciling, setReconciling] = useState(false);

  const loadOrderStats = useCallback(async () => {
    const { data } = await supabase.from("orders").select("status");
    const rows = data ?? [];
    setOrderStats({
      shipped: rows.filter((o: { status: string }) => o.status === "shipped").length,
      delivered: rows.filter((o: { status: string }) => o.status === "delivered").length,
    });
  }, []);

  useEffect(() => {
    const synchronize = async () => {
      try {
        await supabase.functions.invoke("reconcile-payments", { body: {} });
      } catch {
        // La liste reste utilisable si le fournisseur est momentanément indisponible.
      }
      await Promise.all([fetchAllPayments(200), loadOrderStats()]);
    };
    void synchronize();
  }, [fetchAllPayments, loadOrderStats]);

  const refreshAll = async () => {
    setReconciling(true);
    try {
      const { data, error } = await supabase.functions.invoke("reconcile-payments", { body: {} });
      if (error) throw error;
      const recovered = Number(data?.recovered ?? 0);
      toast.success(
        recovered > 0
          ? `${recovered} paiement(s) encaissé(s) récupéré(s)`
          : "Aucun paiement en retard à récupérer",
      );
    } catch {
      toast.error("Rattrapage indisponible pour le moment");
    } finally {
      setReconciling(false);
      await fetchAllPayments(200);
      await loadOrderStats();
    }
  };

  const filteredPayments = payments.filter((payment) => {
    const q = searchQuery.toLowerCase();
    return (
      payment.id.toLowerCase().includes(q) ||
      (payment.transaction_id ?? "").toLowerCase().includes(q) ||
      (payment.order_id ?? "").toLowerCase().includes(q)
    );
  });

  const formatPrice = (amount: number) =>
    new Intl.NumberFormat("fr-FR").format(amount) + " FCFA";

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleString("fr-FR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  const stats = {
    total: payments.length,
    completed: payments.length,
    shipped: orderStats.shipped,
    delivered: orderStats.delivered,
    totalAmount: payments.reduce((acc, p) => acc + Number(p.amount ?? 0), 0),
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const cards = [
    { label: "Total", value: stats.total, icon: CreditCard, tone: "bg-primary/10 text-primary" },
    { label: "Réussis", value: stats.completed, icon: CheckCircle, tone: "bg-green-100 text-green-600 dark:bg-green-900/20" },
    { label: "Expédiées", value: stats.shipped, icon: Truck, tone: "bg-purple-100 text-purple-600 dark:bg-purple-900/20" },
    { label: "Livrés", value: stats.delivered, icon: PackageCheck, tone: "bg-blue-100 text-blue-600 dark:bg-blue-900/20" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-display font-bold text-foreground">Paiements</h2>
          <p className="text-muted-foreground">Encaissements confirmés en temps réel</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <AddPaymentDialog onRecorded={() => { void refreshAll(); }} />
          <Button variant="outline" onClick={refreshAll} disabled={reconciling}>
            {reconciling ? <Loader2 size={18} className="animate-spin" /> : <RefreshCw size={18} />}
            Actualiser
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {cards.map(({ label, value, icon: Icon, tone }) => (
          <Card key={label}>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${tone}`}>
                  <Icon size={20} />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="text-xl font-bold">{value}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-accent/20">
                <CreditCard size={20} className="text-accent-foreground" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Montant total</p>
                <p className="text-lg font-bold">{formatPrice(stats.totalAmount)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Input
        placeholder="Rechercher par ID, transaction, commande…"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
      />

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Montant</TableHead>
                <TableHead>Méthode</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredPayments.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    Aucun paiement encaissé
                  </TableCell>
                </TableRow>
              ) : (
                filteredPayments.map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell className="font-mono text-xs">{payment.id.slice(0, 8)}…</TableCell>
                    <TableCell className="font-semibold">{formatPrice(payment.amount)}</TableCell>
                    <TableCell className="capitalize">{payment.payment_method}</TableCell>
                    <TableCell>
                      <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                        Réussi
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(payment.created_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {payment.order_id && (
                          <ReceiptDownloadButton orderId={payment.order_id} variant="ghost" iconOnly withEmail />
                        )}
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <Eye size={16} />
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Détails du paiement</DialogTitle>
                            </DialogHeader>
                            <PaymentStatusTracker paymentId={payment.id} showLogs />
                          </DialogContent>
                        </Dialog>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default PaymentsTab;
