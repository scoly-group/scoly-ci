/**
 * Connexion client par numéro de téléphone seul.
 * Le compte est créé automatiquement en arrière-plan lors du premier achat.
 * Les comptes internes (/me, /team) gardent le mot de passe.
 */
import { supabase } from "@/integrations/supabase/client";

export interface ClientPhoneAuthInput {
  phone: string;
  fullName?: string;
  email?: string;
  city?: string;
  /** false : ne pas créer de compte si le numéro est inconnu. */
  create?: boolean;
}

export interface ClientPhoneAuthResult {
  userId: string;
  created: boolean;
  phone: string;
}

export class ClientAuthError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.code = code;
  }
}

/** Connecte (ou crée) le compte client lié à ce numéro et ouvre la session. */
export async function signInClientByPhone(input: ClientPhoneAuthInput): Promise<ClientPhoneAuthResult> {
  const { data, error } = await supabase.functions.invoke("client-phone-auth", {
    body: {
      phone: input.phone,
      full_name: input.fullName ?? "",
      email: input.email ?? "",
      city: input.city ?? "",
      create: input.create !== false,
    },
  });

  let payload = (data ?? {}) as Record<string, unknown>;

  // En cas de réponse 4xx/5xx, le corps JSON n'est disponible que via l'erreur.
  if (error) {
    const response = (error as { context?: Response }).context;
    if (response && typeof response.json === "function") {
      try {
        payload = { ...payload, ...(await response.clone().json()) };
      } catch {
        /* corps non JSON : on garde le message générique */
      }
    }
  }

  if (payload.error === "internal_account") {
    throw new ClientAuthError(
      "Ce numéro correspond à un compte de l'équipe : connectez-vous avec votre mot de passe.",
      "internal_account",
    );
  }
  if (payload.error === "not_found") {
    throw new ClientAuthError("Aucune commande n'est encore liée à ce numéro.", "not_found");
  }
  if (error || !payload.access_token || !payload.refresh_token) {
    throw new ClientAuthError(
      typeof payload.error === "string" && !payload.error.startsWith("Edge function")
        ? payload.error
        : "Connexion impossible pour le moment.",
    );
  }


  const { error: sessionError } = await supabase.auth.setSession({
    access_token: payload.access_token as string,
    refresh_token: payload.refresh_token as string,
  });
  if (sessionError) throw new ClientAuthError("Connexion impossible pour le moment.");

  return {
    userId: payload.user_id as string,
    created: Boolean(payload.created),
    phone: (payload.phone as string) ?? input.phone,
  };
}
