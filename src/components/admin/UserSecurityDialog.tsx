import { useEffect, useState } from "react";
import { KeyRound, Loader2, Mail, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface UserSecurityDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: { id: string; email?: string | null; phone?: string | null; name: string } | null;
  onUpdated?: () => void;
}

/** Écran administrateur : e-mail du compte et réinitialisation du mot de passe par code SMS. */
const UserSecurityDialog = ({ open, onOpenChange, user, onUpdated }: UserSecurityDialogProps) => {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [codeSent, setCodeSent] = useState(false);

  useEffect(() => {
    setEmail(user?.email || "");
    setCode("");
    setNewPassword("");
    setCodeSent(false);
  }, [user?.id, user?.email]);

  const call = async (payload: Record<string, unknown>, tag: string) => {
    setBusy(tag);
    try {
      const { data, error } = await supabase.functions.invoke("admin-password-reset", {
        body: { user_id: user?.id, ...payload },
      });
      const failure = (data as { error?: string } | null)?.error || error?.message;
      if (failure) throw new Error(failure);
      return data as Record<string, unknown>;
    } finally {
      setBusy(null);
    }
  };

  const sendCode = async () => {
    try {
      const data = await call({ action: "send_code" }, "send");
      setCodeSent(true);
      toast.success(`Code envoyé au ${String(data?.phone ?? user?.phone ?? "")}. Valable 10 minutes.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Envoi du code impossible");
    }
  };

  const applyPassword = async () => {
    try {
      await call({ action: "apply", code, new_password: newPassword }, "apply");
      toast.success("Mot de passe mis à jour");
      setCode("");
      setNewPassword("");
      setCodeSent(false);
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Modification impossible");
    }
  };

  const updateEmail = async () => {
    try {
      await call({ action: "update_email", email: email.trim() }, "email");
      toast.success("Adresse e-mail mise à jour");
      onUpdated?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Mise à jour impossible");
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Sécurité du compte</DialogTitle>
          <DialogDescription>
            {user?.name} · {user?.phone || "numéro non renseigné"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <div className="space-y-2">
            <Label>Adresse e-mail</Label>
            <div className="flex gap-2">
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="client@exemple.ci"
              />
              <Button type="button" onClick={updateEmail} disabled={busy === "email" || !email.trim()}>
                {busy === "email" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          <div className="space-y-3 border-t border-border pt-4">
            <Label className="flex items-center gap-2">
              <KeyRound className="h-4 w-4" /> Nouveau mot de passe par code SMS
            </Label>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={sendCode}
              disabled={busy === "send"}
            >
              {busy === "send" ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              {codeSent ? "Renvoyer un code à 6 chiffres" : "Envoyer un code à 6 chiffres"}
            </Button>

            <Input
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              placeholder="Code reçu par SMS"
            />
            <Input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Nouveau mot de passe (8 caractères min.)"
            />
            <Button
              type="button"
              className="w-full"
              onClick={applyPassword}
              disabled={busy === "apply" || code.length !== 6 || newPassword.length < 8}
            >
              {busy === "apply" && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Valider le nouveau mot de passe
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default UserSecurityDialog;
