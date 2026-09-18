import { useCallback, useEffect, useState } from "react";
import { CheckCircle, CreditCard, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import ReceiptDownloadButton from "@/components/ReceiptDownloadButton";

interface PaidPayment {
  id: string;
  amount: number;
  payment_method: string | null;
  transaction_id: string | null;
  order_id: string | null;
  created_at: string;
}

/** Historique des paiements encaissés du client, avec reçu officiel téléchargeable. */
const PaymentHistoryList = ({ userId }: { userId?: string | null }) => {
  const [payments, setPayments] = useState<PaidPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) {
      setPayments([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data, error: queryError } = await supabase
        .from("payments")
        .select("id, amount, payment_method, transaction_id, order_id, created_at")
        .eq("user_id", userId)
        .eq("status", "completed")
        .order("created_at", { ascending: false })
        .limit(50);
      if (queryError) throw queryError;
      setPayments((data ?? []) as PaidPayment[]);
    } catch (e) {
      console.error("[PaymentHistoryList]", e);
      setError("Impossible de charger vos paiements pour le moment.");
      setPayments([]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`payments-history-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "payments", filter: `user_id=eq.${userId}` },
        () => void load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, load]);

  const money = (amount: number) => `${new Intl.NumberFormat("fr-FR").format(amount)} FCFA`;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center">
        <p className="mb-3 text-sm text-destructive">{error}</p>
        <Button variant="outline" size="sm" onClick={() => void load()}>
          <RefreshCw className="h-4 w-4" />
          Réessayer
        </Button>
      </div>
    );
  }

  if (payments.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border py-10 text-center">
        <CreditCard className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
        <p className="text-muted-foreground">Aucun paiement pour le moment.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button variant="ghost" size="sm" onClick={() => void load()}>
          <RefreshCw className="h-4 w-4" />
          Actualiser
        </Button>
      </div>
      {payments.map((payment) => (
        <div
          key={payment.id}
          className="flex flex-col gap-3 rounded-lg border border-border p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <span className="font-semibold">{money(Number(payment.amount ?? 0))}</span>
              <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                Payé
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {payment.order_id ? `Commande ${payment.order_id.slice(0, 8).toUpperCase()} · ` : ""}
              {new Date(payment.created_at).toLocaleString("fr-FR")}
            </p>
          </div>
          {payment.order_id && <ReceiptDownloadButton orderId={payment.order_id} />}
        </div>
      ))}
    </div>
  );
};

export default PaymentHistoryList;
