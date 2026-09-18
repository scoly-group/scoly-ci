// Expose la clé publique KkiaPay au widget de paiement (clé publique = non sensible).
import { corsHeaders, json, KKIAPAY_PUBLIC_KEY } from "../_shared/kkiapay.ts";

Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (!KKIAPAY_PUBLIC_KEY) return json({ error: "KkiaPay non configuré" }, 500);
  return json({ publicKey: KKIAPAY_PUBLIC_KEY, sandbox: false });
});
