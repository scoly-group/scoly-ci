import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { initAppVersionGuard } from "./lib/appVersion";

// Repli SPA de l'hébergement : une URL profonde (ex. le retour de paiement
// /checkout?...) est redirigée vers "/" avec l'URL d'origine mémorisée.
// On la restaure ici pour ne perdre ni la page ni les paramètres.
try {
  const stored = sessionStorage.getItem("redirect");
  if (stored) {
    sessionStorage.removeItem("redirect");
    const target = new URL(stored, window.location.origin);
    if (target.origin === window.location.origin && target.pathname !== window.location.pathname) {
      window.history.replaceState(null, "", target.pathname + target.search + target.hash);
    }
  }
} catch {
  /* stockage indisponible : on ignore */
}

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element not found");
}

createRoot(rootElement).render(<App />);


// Scoly doit toujours afficher la version publiée : le contrôle de version
// purge les anciens service workers et caches techniques toutes les 30 secondes,
// sans jamais toucher la session, le panier ou les préférences de langue.
initAppVersionGuard();
