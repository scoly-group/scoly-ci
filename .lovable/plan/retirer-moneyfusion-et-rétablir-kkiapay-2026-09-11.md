# Retirer MoneyFusion et rétablir KKiaPay

## Résultat attendu
- Le bouton « Procéder au paiement » ouvre KKiaPay sur le site public.
- MoneyFusion n'est plus proposé, appelé ou chargé par l'application.
- Les anciennes commandes et écritures comptables restent conservées pour l'historique.

## Travaux
1. Remplacer MoneyFusion par le parcours KKiaPay existant dans la commande, y compris le premier clic, la confirmation et les messages d'erreur.
2. Retirer MoneyFusion de l'achat des ressources payantes ; laisser cet achat indisponible si le parcours KKiaPay actuel ne sait pas encore le gérer sans risque.
3. Supprimer le hook, les calculs de frais et tous les textes MoneyFusion devenus inutiles.
4. Supprimer les fonctions serveur MoneyFusion et leurs fichiers partagés, puis retirer les références de configuration et les secrets exclusivement liés à MoneyFusion.
5. Retirer la fonction de calcul MoneyFusion de la base si elle n'est utilisée nulle part ailleurs, sans supprimer les paiements historiques.
6. Mettre à jour la feuille de route, vérifier la compilation, tester le bouton de paiement sur mobile et contrôler les erreurs du site.

## Détails techniques
- Réutiliser `useKkiaPay`, `process-payment`, `verify-kkiapay-payment`, `kkiapay-webhook` et `kkiapay-config`.
- Conserver les colonnes génériques des commandes et paiements (`payment_method`, montants et métadonnées), car elles servent aussi à KKiaPay et à l'historique.
- Ne jamais considérer le retour du navigateur comme une preuve de paiement : seule la vérification serveur KKiaPay confirme la commande.
