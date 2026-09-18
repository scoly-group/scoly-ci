# Forcer la dernière version de Scoly chez tous les visiteurs

## Objectif
Publier la version corrigée sur `scoly.ci` et `www.scoly.ci`, puis neutraliser les anciens caches qui peuvent encore afficher les anciens boutons « Kit École » et « Kit Scolaire ».

## Travaux
1. **Remplacer l’ancien cache hors ligne**
   - Publier un fichier de désactivation aux anciens emplacements de cache (`/sw.js` et `/service-worker.js`).
   - Supprimer uniquement les anciens fichiers techniques de Scoly, puis retirer l’ancien système de cache du navigateur.
   - Ne pas effacer la connexion, le panier ou les préférences des clients.

2. **Bloquer toute nouvelle mise en cache obsolète**
   - Empêcher le système de notifications actuel de recréer le cache général à `/sw.js`.
   - Conserver la vérification automatique de la version au démarrage, au retour sur l’onglet et toutes les 30 secondes.
   - Vérifier que la page principale et les fichiers de désactivation sont toujours servis sans cache.

3. **Publier et contrôler**
   - Vérifier la sécurité avant publication.
   - Publier la version corrigée.
   - Contrôler `scoly.ci` et `www.scoly.ci` sur mobile, leurs en-têtes anti-cache et la présence des bons boutons.

## Résultat attendu
Les anciens visiteurs reçoivent automatiquement le fichier qui retire l’ancien cache, puis chargent la version récente. Les nouvelles visites ne peuvent plus réinstaller ce cache obsolète.
