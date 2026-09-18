# Connexion téléphone, reçus automatiques et refonte des accès

## 1. Page de connexion par téléphone

- Nouvelle page `/connexion-telephone` (lien depuis la page de connexion actuelle) :
  - champ numéro (format ivoirien avec le zéro) + mot de passe,
  - bouton « Mot de passe oublié ? » bien visible, qui envoie un code à 6 chiffres par SMS et permet de choisir un nouveau mot de passe sur place,
  - même bloc « Mot de passe oublié ? » ajouté sur la page de connexion par e-mail (envoi du lien par e-mail).
- Aucun passage par la liste des comptes en administration.

## 2. Retour après paiement KkiaPay

- Après un paiement réussi, le client revient sur son espace Scoly (`/client`) avec la commande payée mise en avant, jamais sur une page KkiaPay.
- Si la fenêtre de paiement est fermée ou rechargée, une page de retour vérifie la transaction puis redirige vers l'espace client.
- Le panier est vidé et le cache rafraîchi à ce moment-là.

## 3. Reçu et notifications automatiques

- Dès qu'un paiement est validé (widget ou notification bancaire), le serveur :
  - génère le reçu PDF,
  - l'envoie par e-mail au client en pièce jointe,
  - envoie le SMS de confirmation,
  - crée la notification dans l'espace client.
- Envoi une seule fois par commande (verrou anti-doublon), et le reçu reste téléchargeable depuis l'espace client.

## 4. Accès par rôle — finalisation

Pour chaque espace, ce qui est modifiable et ce qui est en lecture seule :

- **Commercial** : ses zones, ses commandes à remettre, preuves de remise (créer/modifier). Lecture seule : catalogue, clients, finances.
- **Livreur** : ses livraisons assignées, prise en charge, preuve de livraison (créer). Lecture seule : détail commande, coordonnées client.
- **Modérateur** : voir §5.
- **Gérant d'établissement** : ses listes de fournitures et kits (créer/modifier/supprimer), demandes de retrait (créer). Lecture seule : commissions, soldes, historique.
- **Comptable** : paiements, retraits, commissions, reçus, exports (valider/rejeter les retraits). Lecture seule : commandes, comptes utilisateurs.

Chaque écran manquant est ajouté, chaque bouton non autorisé est masqué, et les règles sont appliquées aussi côté base de données (pas seulement dans l'écran).

## 5. Suppression du rôle « Administrateur »

- Le rôle « Administrateur » disparaît de la plateforme ; les comptes qui l'ont deviennent **Modérateur**.
- Le modérateur obtient tous les pouvoirs de l'ancien administrateur : produits, kits, catégories, commandes, paiements, livraisons, promotions, ventes flash, coupons, articles, publicités, FAQ, SMS, établissements, statistiques.
- Le modérateur **ne peut pas** : gérer les comptes utilisateurs (création, suppression, e-mail, mot de passe), valider les demandes de retrait, attribuer ou retirer un rôle.
- Seul le **Super administrateur** conserve ces pouvoirs, plus les réglages de la plateforme.

## Détails techniques

- `app_role` : suppression de la valeur `admin` après migration des attributions vers `moderator` ; mise à jour de `has_role`, `has_permission`, `role_permissions`, et de toutes les politiques RLS référençant `admin`.
- `src/lib/rbac.ts` : `ADMIN_ROLES = ["super_admin"]`, `moderator` déplacé vers un niveau « gestion » avec sa propre ACL de sections ; `ADMIN_SECTION_ACL` revu (users/roles/settings/withdrawals → super_admin seul).
- Redirection modérateur vers `/admin` avec sections filtrées, au lieu de `/team`.
- Reçus/SMS : déclenchement centralisé dans `finalize_payment_atomic` / `verify-kkiapay-payment` / `kkiapay-webhook`, appel de `generate-receipt-pdf` (email) + `send-sms` + notification, protégé par un indicateur sur la commande.
- KkiaPay : conservation du `callback` vers `/client` + nouvelle route de retour qui rejoue `verify-kkiapay-payment` à partir du `transactionId` de l'URL.
- Nouvelle page `src/pages/PhoneLogin.tsx` s'appuyant sur les fonctions `phone-login` et `admin-password-reset` (nouvelle action publique de réinitialisation par SMS, avec limitation de débit).
