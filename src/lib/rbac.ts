/**
 * Rôles finaux de la plateforme.
 * Le rôle "admin" a été supprimé : ses pouvoirs de gestion sont désormais
 * portés par "moderator". Seul "super_admin" gère les comptes, les rôles,
 * les réglages et les demandes de retrait.
 */
export const ADMIN_ROLES = ["super_admin"] as const;
/** Rôles ayant accès au back-office de gestion complet. */
export const MANAGER_ROLES = ["super_admin", "moderator"] as const;
export const TEAM_ROLES = ["moderator", "commercial", "comptable"] as const;
export const REFERENT_ROLES = ["referent"] as const;
export const CLIENT_ROLES = ["user"] as const;

export const FINAL_ROLES = [
  "super_admin",
  "moderator",
  "commercial",
  "comptable",
  "delivery",
  "referent",
  "user",
] as const;

export type AppRole = (typeof FINAL_ROLES)[number];

const hasAny = (roles: string[], allowed: readonly string[]) =>
  roles.some((role) => allowed.includes(role));

export const isPlatformAdmin = (roles: string[]) => hasAny(roles, ADMIN_ROLES);
export const isSuperAdmin = (roles: string[]) => roles.includes("super_admin");
/** Accès au back-office complet (ancien "admin"). */
export const isManager = (roles: string[]) => hasAny(roles, MANAGER_ROLES);
export const isTeamMember = (roles: string[]) => hasAny(roles, TEAM_ROLES);
export const isReferent = (roles: string[]) => hasAny(roles, REFERENT_ROLES);
export const isModerator = (roles: string[]) =>
  roles.includes("moderator") || roles.includes("super_admin");
export const isCommercial = (roles: string[]) => roles.includes("commercial");
export const isComptable = (roles: string[]) => roles.includes("comptable");
export const isDelivery = (roles: string[]) => roles.includes("delivery");

export const hasPrivilegedRole = (roles: string[]) =>
  isManager(roles) || isTeamMember(roles) || isReferent(roles) || isDelivery(roles);

export const getDashboardPathForRoles = (roles: string[]) => {
  if (isManager(roles)) return "/admin";
  if (isTeamMember(roles)) return "/team";
  if (isDelivery(roles)) return "/delivery";
  if (isReferent(roles)) return "/me";
  return "/client";
};

/**
 * ACL stricte de chaque section d'administration (id d'onglet).
 * Toute section non listée est réservée au super administrateur.
 */
export const ADMIN_SECTION_ACL: Record<string, readonly AppRole[]> = {
  dashboard: ["super_admin", "moderator"],
  stats: ["super_admin", "moderator"],
  products: ["super_admin", "moderator"],
  scholar_kits: ["super_admin", "moderator"],
  school_kits: ["super_admin", "moderator"],
  categories: ["super_admin", "moderator"],
  flash_deals: ["super_admin", "moderator"],
  promotions_mgmt: ["super_admin", "moderator"],
  promotions: ["super_admin", "moderator"],
  orders: ["super_admin", "moderator"],
  payments: ["super_admin", "moderator", "comptable"],
  deliveries: ["super_admin", "moderator"],
  zones: ["super_admin", "moderator"],
  establishments: ["super_admin", "moderator"],
  commissions: ["super_admin", "moderator", "comptable"],
  articles: ["super_admin", "moderator"],
  review: ["super_admin", "moderator"],
  advertisements: ["super_admin", "moderator"],
  faq: ["super_admin", "moderator"],
  sms: ["super_admin", "moderator"],
  // Réservé au super administrateur
  users: ["super_admin"],
  roles: ["super_admin"],
  withdrawals: ["super_admin", "comptable"],
  settings: ["super_admin"],
};

export const canAccessAdminSection = (roles: string[], section: string) =>
  hasAny(roles, ADMIN_SECTION_ACL[section] ?? ["super_admin"]);

/** Sections du tableau de bord équipe → rôles autorisés. */
export const TEAM_SECTION_ACL: Record<string, readonly AppRole[]> = {
  moderation: ["super_admin", "moderator"],
  comments: ["super_admin", "moderator"],
  commercial: ["super_admin", "moderator", "commercial"],
  finance: ["super_admin", "comptable"],
  withdrawals: ["super_admin", "comptable"],
};

export const canAccessTeamSection = (roles: string[], section: string) =>
  hasAny(roles, TEAM_SECTION_ACL[section] ?? ["super_admin"]);
