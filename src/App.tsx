import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { LanguageProvider } from "@/i18n/LanguageContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { CartProvider } from "@/contexts/CartContext";
import ScrollToTop from "@/components/ScrollToTop";
import ErrorBoundary from "@/components/ErrorBoundary";
import PageLoader from "@/components/PageLoader";
import { SessionSecurityProvider } from "@/components/SessionSecurityProvider";
import RoleGuard from "@/components/RoleGuard";
import useVisitTracker from "@/hooks/useVisitTracker";
import { useAuth } from "@/contexts/AuthContext";
import { MANAGER_ROLES, isManager, REFERENT_ROLES, TEAM_ROLES, getDashboardPathForRoles, hasPrivilegedRole, isTeamMember } from "@/lib/rbac";

// Critical path - eager load
import Index from "./pages/Index";

// Lazy-loaded pages for code splitting
const Auth = lazy(() => import("./pages/Auth"));
const Shop = lazy(() => import("./pages/Shop"));
const Cart = lazy(() => import("./pages/Cart"));
const Checkout = lazy(() => import("./pages/Checkout"));

const Contact = lazy(() => import("./pages/Contact"));
const Account = lazy(() => import("./pages/Account"));
const Admin = lazy(() => import("./pages/Admin"));
const ProductDetail = lazy(() => import("./pages/ProductDetail"));
const Actualites = lazy(() => import("./pages/Actualites"));
const ArticleDetail = lazy(() => import("./pages/ArticleDetail"));
const WriteArticle = lazy(() => import("./pages/WriteArticle"));
const TeamDashboard = lazy(() => import("./pages/TeamDashboard"));

const FAQ = lazy(() => import("./pages/FAQ"));
const Resources = lazy(() => import("./pages/Resources"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Wishlist = lazy(() => import("./pages/Wishlist"));
const MentionsLegales = lazy(() => import("./pages/MentionsLegales"));
const TermsOfUse = lazy(() => import("./pages/TermsOfUse"));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy"));
const CookiesPolicy = lazy(() => import("./pages/CookiesPolicy"));
const AuthConfirm = lazy(() => import("./pages/AuthConfirm"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const KitsEcole = lazy(() => import("./pages/KitsEcole"));
const KitDetail = lazy(() => import("./pages/KitDetail"));

const EstablishmentSpace = lazy(() => import("./pages/EstablishmentSpace"));
const EstablishmentAuth = lazy(() => import("./pages/EstablishmentAuth"));
const DeliveryReturns = lazy(() => import("./pages/DeliveryReturns"));
const Unsubscribe = lazy(() => import("./pages/Unsubscribe"));
const DeliveryDashboard = lazy(() => import("./pages/DeliveryDashboard"));
const Comptabilite = lazy(() => import("./pages/Comptabilite"));
const PhoneLogin = lazy(() => import("./pages/PhoneLogin"));
const PaymentReturn = lazy(() => import("./pages/PaymentReturn"));

const Forbidden = ({ title = "Accès refusé (403)" }: { title?: string }) => (
  <main className="min-h-screen flex items-center justify-center bg-background p-6">
    <div className="max-w-md text-center space-y-3">
      <p className="text-6xl font-bold text-primary">403</p>
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="text-sm text-muted-foreground">
        Vous n'avez pas les droits nécessaires pour accéder à cette section.
      </p>
    </div>
  </main>
);

const TeamAccess = () => {
  const { user, loading, rolesLoading, roles } = useAuth();
  if (loading || (user && rolesLoading)) return <PageLoader />;
  if (!user) return <Auth />;
  if (isManager(roles)) {
    return <Navigate to="/admin" replace />;
  }
  return isTeamMember(roles)
    ? <TeamDashboard />
    : <Forbidden title="Espace équipe interne réservé" />;
};


/** /me : espace du gérant d'établissement partenaire. */
const EstablishmentAccess = () => {
  const { user, loading } = useAuth();
  if (loading) return <PageLoader />;
  if (!user) return <EstablishmentAuth />;
  return <EstablishmentSpace />;
};

/** Espace client : connexion par numéro de téléphone uniquement. */
const ClientAccess = () => {
  const { user, loading, rolesLoading, roles } = useAuth();
  if (loading || (user && rolesLoading)) return <PageLoader />;
  if (!user) return <Navigate to="/connexion-telephone?redirect=/client" replace />;
  return <Account />;
};

/** Enregistre chaque page consultée pour l'onglet Trafic de l'administration. */
const VisitTracker = () => {
  useVisitTracker();
  return null;
};

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 10,
      gcTime: 1000 * 60 * 60,
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
});

const App = () => (
  <ErrorBoundary>
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <LanguageProvider>
          <AuthProvider>
            <SessionSecurityProvider />
            <CartProvider>
              <TooltipProvider>
                <Toaster />
                <Sonner />
                <BrowserRouter>
                  <ScrollToTop />
                  <VisitTracker />
                  {/* Skip to content - Accessibility */}
                  <a
                    href="#main-content"
                    className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-md focus:outline-none"
                  >
                    Aller au contenu principal
                  </a>
                  <Suspense fallback={<PageLoader />}>
                    <Routes>
                      <Route path="/" element={<Index />} />
                       <Route path="/auth" element={<Navigate to="/connexion-telephone" replace />} />
                      <Route path="/shop" element={<Shop />} />
                      <Route path="/boutique" element={<Shop />} />
                      <Route path="/shop/product/:id" element={<ProductDetail />} />
                      <Route path="/product/:id" element={<ProductDetail />} />
                      <Route path="/cart" element={<Cart />} />
                      <Route path="/panier" element={<Cart />} />
                      <Route path="/checkout" element={<Checkout />} />
                      <Route path="/about" element={<Navigate to="/contact" replace />} />
                      <Route path="/a-propos" element={<Navigate to="/contact" replace />} />
                      <Route path="/contact" element={<Contact />} />
                      <Route path="/account" element={<Navigate to="/client" replace />} />
                      <Route path="/compte" element={<Navigate to="/client" replace />} />
                      <Route path="/admin" element={<RoleGuard allow={[...MANAGER_ROLES]} loginRedirect="/team"><Admin /></RoleGuard>} />
                      <Route path="/actualites" element={<Actualites />} />
                      <Route path="/actualites/write" element={<RoleGuard allow={["super_admin","moderator","user"]}><WriteArticle /></RoleGuard>} />
                      <Route path="/actualites/edit/:id" element={<RoleGuard allow={["super_admin","moderator","user"]}><WriteArticle /></RoleGuard>} />
                      <Route path="/actualites/:id" element={<ArticleDetail />} />
                      <Route path="/team" element={<TeamAccess />} />
                      
                     <Route path="/faq" element={<FAQ />} />
                     <Route path="/ressources" element={<Resources />} />
                     <Route path="/resources" element={<Resources />} />
                      <Route path="/wishlist" element={<RoleGuard><Wishlist /></RoleGuard>} />
                      <Route path="/mentions-legales" element={<MentionsLegales />} />
                      <Route path="/terms" element={<TermsOfUse />} />
                      <Route path="/privacy" element={<PrivacyPolicy />} />
                      <Route path="/cookies" element={<CookiesPolicy />} />
                      <Route path="/auth/confirm" element={<AuthConfirm />} />
                      <Route path="/auth/reset-password" element={<ResetPassword />} />
                      <Route path="/kits-scolaires" element={<KitsEcole />} />
                      <Route path="/kits-scolaires/:id" element={<KitDetail />} />
                      <Route path="/kits-ecole" element={<KitsEcole />} />
                      <Route path="/kits-ecole/:id" element={<KitDetail />} />
                      <Route path="/client" element={<ClientAccess />} />
                      <Route path="/me" element={<EstablishmentAccess />} />
                      <Route path="/etablissement" element={<EstablishmentAccess />} />
                      <Route path="/etablissement/connexion" element={<EstablishmentAuth />} />
                      <Route path="/me/connexion" element={<EstablishmentAuth />} />
                      
                      
                      <Route path="/livraison-retours" element={<DeliveryReturns />} />
                      <Route path="/livraison" element={<DeliveryReturns />} />
                      <Route path="/unsubscribe" element={<Unsubscribe />} />
                      <Route path="/delivery" element={<RoleGuard allow={["delivery","super_admin","moderator"]}><DeliveryDashboard /></RoleGuard>} />
                      <Route path="/livreur" element={<Navigate to="/delivery" replace />} />
                      <Route path="/comptabilite" element={<RoleGuard allow={["comptable","super_admin"]}><Comptabilite /></RoleGuard>} />
                      <Route path="/connexion-telephone" element={<PhoneLogin />} />
                      <Route path="/phone-login" element={<Navigate to="/connexion-telephone" replace />} />
                      <Route path="/paiement/retour" element={<PaymentReturn />} />
                      <Route path="*" element={<NotFound />} />
                    </Routes>
                  </Suspense>
                </BrowserRouter>
              </TooltipProvider>
            </CartProvider>
          </AuthProvider>
        </LanguageProvider>
      </QueryClientProvider>
    </HelmetProvider>
  </ErrorBoundary>
);

export default App;
