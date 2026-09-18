import { useState } from "react";
import { Download, Loader2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface ReceiptDownloadButtonProps {
  orderId: string;
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm" | "icon";
  iconOnly?: boolean;
  /** Affiche aussi un bouton « Envoyer par e-mail » (espaces internes). */
  withEmail?: boolean;
}

const ReceiptDownloadButton = ({
  orderId,
  variant = "outline",
  size = "sm",
  iconOnly = false,
  withEmail = false,
}: ReceiptDownloadButtonProps) => {
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const { toast } = useToast();

  const sendByEmail = async () => {
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-receipt-pdf", {
        body: { order_id: orderId, email: true },
      });
      const failure = error?.message || (data as { error?: string } | null)?.error;
      if (failure) throw new Error(failure);
      toast({
        title: "Reçu envoyé",
        description: `Le reçu a été envoyé à ${(data as { recipient?: string })?.recipient ?? "l'adresse du client"}.`,
      });
    } catch (e) {
      toast({
        title: "Envoi impossible",
        description: e instanceof Error ? e.message : "Veuillez réessayer.",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  const download = async () => {
    setLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Session expirée");

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-receipt-pdf`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ order_id: orderId, download: true }),
        },
      );
      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        let message = "Reçu indisponible";
        if (response.status === 401) message = "Session expirée, reconnectez-vous";
        else if (response.status === 403) message = "Reçu réservé au titulaire de la commande";
        else if (response.status === 404) message = "Commande introuvable";
        else if (detail) {
          try {
            message = JSON.parse(detail).error || message;
          } catch { /* réponse non JSON */ }
        }
        throw new Error(message);
      }

      // Le lien doit être dans le document et l'URL libérée après le clic,
      // sinon certains navigateurs annulent le téléchargement.
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `scoly-recu-${orderId.slice(0, 8).toUpperCase()}.pdf`;
      anchor.rel = "noopener";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (error) {
      toast({
        title: "Téléchargement impossible",
        description: error instanceof Error ? error.message : "Veuillez réessayer.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="inline-flex items-center gap-2">
      <Button
        type="button"
        variant={variant}
        size={iconOnly ? "icon" : size}
        onClick={download}
        disabled={loading}
        aria-label="Télécharger le reçu PDF"
        title="Télécharger le reçu PDF"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        {!iconOnly && "Reçu PDF"}
      </Button>
      {withEmail && (
        <Button
          type="button"
          variant={variant}
          size={iconOnly ? "icon" : size}
          onClick={sendByEmail}
          disabled={sending}
          aria-label="Envoyer le reçu par e-mail"
          title="Envoyer le reçu par e-mail"
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
          {!iconOnly && "Envoyer"}
        </Button>
      )}
    </div>
  );
};

export default ReceiptDownloadButton;