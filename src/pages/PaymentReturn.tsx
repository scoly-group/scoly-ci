import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCart } from "@/contexts/CartContext";
import { toast } from "sonner";

/**
 * Page de retour après paiement KkiaPay : vérifie la transaction puis
 * ramène toujours le client dans son espace Scoly.
 */
const PaymentReturn = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { clearCart } = useCart();
  const [message, setMessage] = useState("Vérification de votre paiement…");
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;

    const transactionId =
      params.get("transactionId") || params.get("transaction_id") || params.get("transaction") || "";
    const orderId = params.get("orderId") || params.get("order_id") || "";

    const run = async () => {
      if (transactionId && orderId) {
        try {
          const { data, error } = await supabase.functions.invoke("verify-kkiapay-payment", {
            body: { transactionId, orderId },
          });
          if (!error && data?.success) {
            await clearCart().catch(() => null);
            toast.success("Paiement confirmé. Votre reçu vous a été envoyé par e-mail.");
          } else {
            toast.error("Paiement non confirmé. Consultez vos commandes ou contactez-nous.");
          }
        } catch {
          toast.error("Vérification impossible pour le moment.");
        }
      }
      setMessage("Redirection vers votre espace…");
      navigate("/client?paiement=retour", { replace: true });
    };

    run();
  }, [params, navigate, clearCart]);

  return (
    <main className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="text-center space-y-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>
    </main>
  );
};

export default PaymentReturn;
