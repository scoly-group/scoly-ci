import { useState } from "react";
import { Banknote, CreditCard, Loader2, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { openKkiapayPayment } from "@/lib/kkiapay";
import { toast } from "sonner";

interface FoundOrder {
  id: string;
  number: string;
  total: number;
  status: string;
  phone: string | null;
  address: string | null;
  payment_option: string | null;
  is_paid: boolean;
  online_charge: number;
  online_fee: number;
}

const fcfa = (v: number) => `${Number(v || 0).toLocaleString("fr-FR")} FCFA`;

/** Encaissement d'une commande par l'équipe : espèces ou paiement en ligne. */
export const AddPaymentDialog = ({
  onRecorded,
  triggerLabel = "Ajouter un paiement",
  variant = "default",
}: {
  onRecorded?: () => void;
  triggerLabel?: string;
  variant?: "default" | "outline" | "secondary";
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [orders, setOrders] = useState<FoundOrder[]>([]);
  const [selected, setSelected] = useState<FoundOrder | null>(null);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setQuery("");
    setOrders([]);
    setSelected(null);
  };

  const call = async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke("record-manual-payment", { body });
    if (error) throw new Error("Opération impossible pour le moment.");
    if (data?.error) throw new Error(String(data.error));
    return data as Record<string, any>;
  };

  const search = async () => {
    if (query.trim().length < 4) {
      toast.error("Saisissez un numéro de commande ou un numéro de téléphone.");
      return;
    }
    setSearching(true);
    setSelected(null);
    try {
      const data = await call({ action: "lookup", query: query.trim() });
      const found = (data.orders ?? []) as FoundOrder[];
      setOrders(found);
      if (!found.length) toast.error("Aucune commande trouvée pour cette recherche.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Recherche impossible.");
    } finally {
      setSearching(false);
    }
  };

  const payCash = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      await call({ action: "cash", order_id: selected.id });
      toast.success(`Commande ${selected.number} encaissée en espèces. Reçu envoyé.`);
      setOpen(false);
      reset();
      onRecorded?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Encaissement impossible.");
    } finally {
      setBusy(false);
    }
  };

  const payOnline = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      const init = await call({ action: "online", order_id: selected.id });
      const amount = Number(init.amount_to_charge ?? selected.online_charge);
      await openKkiapayPayment({
        amount,
        orderId: selected.id,
        phone: selected.phone ?? "",
        onFailed: () => {
          setBusy(false);
          toast.error("Le paiement n'a pas abouti.");
        },
        onSuccess: async (transactionId) => {
          try {
            await call({ action: "online-verify", order_id: selected.id, transaction_id: transactionId });
            toast.success(`Commande ${selected.number} payée en ligne. Reçu envoyé.`);
            setOpen(false);
            reset();
            onRecorded?.();
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Paiement non confirmé.");
          } finally {
            setBusy(false);
          }
        },
      });
    } catch (e) {
      setBusy(false);
      toast.error(e instanceof Error ? e.message : "Paiement indisponible.");
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant={variant} className="gap-2">
          <Plus className="h-4 w-4" /> {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Ajouter un paiement</DialogTitle>
          <DialogDescription>
            Numéro de commande ou numéro de téléphone du client.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="payment-query">Recherche</Label>
            <div className="flex gap-2">
              <Input
                id="payment-query"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="A1B2C3D4 ou 07 02 58 44 57"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void search();
                  }
                }}
              />
              <Button type="button" variant="outline" onClick={search} disabled={searching}>
                {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          {orders.length > 0 && !selected && (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {orders.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => !o.is_paid && setSelected(o)}
                  disabled={o.is_paid}
                  className="w-full text-left rounded-lg border border-border p-3 hover:border-primary disabled:opacity-60"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">#{o.number}</span>
                    <span className="font-bold text-primary">{fcfa(o.total)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {o.phone || "—"} · {o.address || "—"}
                  </p>
                  {o.is_paid && (
                    <Badge variant="secondary" className="mt-1">
                      Déjà payée
                    </Badge>
                  )}
                </button>
              ))}
            </div>
          )}

          {selected && (
            <div className="space-y-3 rounded-lg border border-border p-4">
              <div className="flex items-center justify-between">
                <span className="font-semibold">#{selected.number}</span>
                <span className="font-bold text-primary">{fcfa(selected.total)}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                En ligne : {fcfa(selected.online_charge)} débités (frais {fcfa(selected.online_fee)} déjà déduits).
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" onClick={payCash} disabled={busy} className="gap-2">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Banknote className="h-4 w-4" />}
                  Espèces
                </Button>
                <Button type="button" variant="outline" onClick={payOnline} disabled={busy} className="gap-2">
                  <CreditCard className="h-4 w-4" /> En ligne
                </Button>
              </div>
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground"
                onClick={() => setSelected(null)}
              >
                Choisir une autre commande
              </button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AddPaymentDialog;
