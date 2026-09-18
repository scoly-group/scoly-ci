// Diagnostic temporaire : interroge KkiaPay pour deux transactions connues.
import { corsHeaders, json, verifyTransaction } from "../_shared/kkiapay.ts";

const ALLOWED = new Set(["637768578903803", "7695733565225355"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  let transactionId = "";
  try {
    const body = await req.json();
    transactionId = String(body?.transactionId ?? "");
  } catch {
    return json({ error: "invalid_body" }, 400);
  }
  if (!ALLOWED.has(transactionId)) return json({ error: "not_allowed" }, 403);

  const verification = await verifyTransaction(transactionId);
  return json({ transactionId, verification });
});
