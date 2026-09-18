import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

// Cache partagé : la liste de souhaits est chargée une seule fois pour toute la
// page, même si des dizaines de fiches produit utilisent ce hook.
let cacheUserId: string | null = null;
let cacheIds: Set<string> = new Set();
let inFlight: Promise<Set<string>> | null = null;
const listeners = new Set<(ids: Set<string>) => void>();

const publish = (ids: Set<string>) => {
  cacheIds = ids;
  listeners.forEach((l) => l(ids));
};

const loadWishlist = (userId: string): Promise<Set<string>> => {
  if (cacheUserId === userId && !inFlight) return Promise.resolve(cacheIds);
  if (inFlight && cacheUserId === userId) return inFlight;
  cacheUserId = userId;
  inFlight = (async () => {
    try {
      const { data } = await supabase.from("wishlist").select("product_id").eq("user_id", userId);
      const ids = new Set((data || []).map((w) => w.product_id));
      publish(ids);
      return ids;
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
};


export const useWishlist = () => {
  const { user } = useAuth();
  const [wishlistIds, setWishlistIds] = useState<Set<string>>(cacheIds);

  useEffect(() => {
    const listener = (ids: Set<string>) => setWishlistIds(new Set(ids));
    listeners.add(listener);
    if (user) {
      void loadWishlist(user.id).then((ids) => setWishlistIds(new Set(ids)));
    } else {
      cacheUserId = null;
      cacheIds = new Set();
      setWishlistIds(new Set());
    }
    return () => {
      listeners.delete(listener);
    };
  }, [user]);

  const toggleWishlist = useCallback(
    async (productId: string) => {
      if (!user) {
        toast.error("Connectez-vous pour ajouter aux favoris");
        return;
      }

      const next = new Set(cacheIds);
      if (next.has(productId)) {
        await supabase.from("wishlist").delete().eq("user_id", user.id).eq("product_id", productId);
        next.delete(productId);
        publish(next);
        toast.success("Retiré de la liste de souhaits");
      } else {
        await supabase.from("wishlist").insert({ user_id: user.id, product_id: productId });
        next.add(productId);
        publish(next);
        toast.success("Ajouté à la liste de souhaits");
      }
    },
    [user],
  );

  const isInWishlist = useCallback((productId: string) => wishlistIds.has(productId), [wishlistIds]);

  return { toggleWishlist, isInWishlist, wishlistCount: wishlistIds.size };
};
