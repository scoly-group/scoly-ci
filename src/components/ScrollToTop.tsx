import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

const ScrollToTop = () => {
  const { pathname, hash } = useLocation();
  const prevPathname = useRef(pathname);

  // Le navigateur ne doit jamais restaurer une ancienne position de défilement :
  // chaque page s'ouvre en haut, jamais au milieu ou en bas.
  useEffect(() => {
    if ("scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual";
    }
  }, []);

  useEffect(() => {
    // Handle hash navigation (scroll to element)
    if (hash) {
      // Small delay to ensure DOM is ready
      setTimeout(() => {
        const element = document.querySelector(hash);
        if (element) {
          const headerOffset = 96; // Account for fixed navbar
          const elementPosition = element.getBoundingClientRect().top;
          const offsetPosition = Math.max(0, elementPosition + window.scrollY - headerOffset);

          window.scrollTo({ top: offsetPosition, behavior: "smooth" });
        } else {
          window.scrollTo({ top: 0, behavior: "instant" });
        }
      }, 120);
      prevPathname.current = pathname;
      return;
    }

    // Toute navigation (même vers la page courante) revient en haut.
    const scrollTop = () => window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    scrollTop();
    // Second passage après le rendu du contenu paresseux, sinon la page peut
    // rester positionnée sur l'ancienne hauteur.
    const raf = requestAnimationFrame(scrollTop);
    const timer = window.setTimeout(scrollTop, 60);
    prevPathname.current = pathname;

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(timer);
    };
  }, [pathname, hash]);

  return null;
};

export default ScrollToTop;
