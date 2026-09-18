/**
 * Chargement et pilotage du widget de paiement KkiaPay.
 */
import { supabase } from "@/integrations/supabase/client";

const SDK_URL = "https://cdn.kkiapay.me/k.js";

declare global {
  interface Window {
    openKkiapayWidget?: (options: Record<string, unknown>) => void;
    addSuccessListener?: (cb: (response: { transactionId?: string }) => void) => void;
    addFailedListener?: (cb: (response: unknown) => void) => void;
    addKkiapayCloseListener?: (cb: () => void) => void;
  }
}

let sdkPromise: Promise<void> | null = null;

export const loadKkiapaySdk = (): Promise<void> => {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.openKkiapayWidget) return Promise.resolve();
  if (sdkPromise) return sdkPromise;

  sdkPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SDK_URL}"]`);
    const script = existing ?? document.createElement("script");
    script.src = SDK_URL;
    script.async = true;
    script.addEventListener("load", () => resolve());
    script.addEventListener("error", () => {
      sdkPromise = null;
      reject(new Error("Impossible de charger le module de paiement."));
    });
    if (!existing) document.head.appendChild(script);
  });

  return sdkPromise;
};

let cachedPublicKey: string | null = null;

export const getKkiapayPublicKey = async (): Promise<string> => {
  if (cachedPublicKey) return cachedPublicKey;
  const { data, error } = await supabase.functions.invoke("kkiapay-config");
  if (error || !data?.publicKey) {
    throw new Error("Le paiement en ligne est momentanément indisponible.");
  }
  cachedPublicKey = data.publicKey as string;
  return cachedPublicKey;
};

export interface KkiapayPaymentOptions {
  amount: number;
  orderId: string;
  phone?: string;
  email?: string;
  fullname?: string;
  onSuccess: (transactionId: string) => void;
  onFailed?: (reason?: unknown) => void;
}

/** Ouvre le widget de paiement pour une commande donnée. */
export const openKkiapayPayment = async (options: KkiapayPaymentOptions) => {
  const [publicKey] = await Promise.all([getKkiapayPublicKey(), loadKkiapaySdk()]);

  window.addSuccessListener?.((response) => {
    if (response?.transactionId) options.onSuccess(response.transactionId);
  });
  window.addFailedListener?.((reason) => options.onFailed?.(reason));

  window.openKkiapayWidget?.({
    key: publicKey,
    amount: Math.round(options.amount),
    position: "center",
    sandbox: false,
    theme: "#0f766e",
    phone: options.phone ?? "",
    email: options.email ?? "",
    fullname: options.fullname ?? "",
    name: options.fullname ?? "",
    countries: ["CI"],
    // Après le paiement, le client revient toujours sur son espace Scoly.
    callback: `${window.location.origin}/paiement/retour?orderId=${encodeURIComponent(options.orderId)}`,
    data: JSON.stringify({ order_id: options.orderId }),
  });
};
