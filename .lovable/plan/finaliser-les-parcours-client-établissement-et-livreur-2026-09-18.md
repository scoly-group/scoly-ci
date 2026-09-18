# Finaliser les parcours client, établissement et livreur

## Résultat attendu

- Remplacer entièrement l’ancienne fenêtre d’accueil par la maquette Scoly et uniquement les textes fournis, avec suivi par numéro de téléphone.
- Faire de l’espace client un accès par numéro uniquement, sans mot de passe ni création de compte visible, tout en conservant `/me` pour les gérants et `/team` pour l’équipe.
- Permettre à un numéro appartenant aussi à un gérant ou membre de l’équipe de commander sans modifier son mot de passe, son e-mail professionnel ou ses rôles.
- Préremplir le formulaire de livraison à partir du nom ou du téléphone, avec « Ville, village ou quartier » comme texte du lieu de livraison.
- Permettre au client de remplacer son adresse e-mail automatique et de recevoir ses reçus existants.
- Relier la demande d’accès établissement à une liste d’approbation administrateur, puis envoyer l’e-mail et le SMS après validation.
- Conserver et compléter la page livreur avec commandes reçues, en cours et livrées, dates et statuts propres à chaque livreur.

## Mise en œuvre

1. Créer une identité client distincte et sécurisée par téléphone, associable à une identité interne sans mélanger les sessions ni les rôles.
2. Adapter les fonctions de connexion, recherche client, mise à jour e-mail et envoi des reçus, avec validation serveur.
3. Simplifier les chemins et écrans client, puis adapter la commande et le compte client.
4. Refaire la fenêtre d’accueil selon la référence fournie et tester sa lisibilité sur mobile et ordinateur.
5. Ajouter l’approbation des demandes établissement dans l’administration et corriger l’association directe d’un gérant.
6. Vérifier le tableau livreur et les données filtrées par livreur.
7. Déployer les fonctions concernées, tester les parcours et contrôler les erreurs de compilation et d’exécution.

## Détails techniques

- Les rôles restent exclusivement dans `user_roles`.
- L’identité client liée au téléphone est séparée de l’utilisateur interne afin qu’une connexion client n’accorde jamais les droits `/me` ou `/team`.
- Les recherches par téléphone/nom ne renvoient que les informations du client concerné et sont limitées aux usages de commande.
- Les reçus sont renvoyés uniquement pour les commandes payées ou déjà traitées appartenant au client authentifié.
