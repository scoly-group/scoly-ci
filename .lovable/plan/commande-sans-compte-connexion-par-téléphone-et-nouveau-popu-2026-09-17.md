# Commande sans compte, connexion par téléphone et nouveau popup

## 1. Commande sans connexion obligatoire

- Le bouton « Commander » ouvre directement le formulaire « Informations de livraison », même sans être connecté.
- Dans ce formulaire :
  - suppression du champ « Localité (ville ou village) »,
  - « Lieu de livraison souhaité » (ville, quartier, rue, point de repère) devient facultatif,
  - ajout d'un champ adresse e-mail, facultatif.
  - restent obligatoires : nom et prénom, numéro de téléphone.
- À la validation, le compte client est créé automatiquement en arrière-plan à partir du numéro, du nom et de la localité. Le client ne choisit aucun mot de passe.

## 2. Deux boutons de paiement dans le résumé de commande

Remplacement du bouton unique par deux boutons courts côte à côte :
- **Payer en ligne** → ouvre KkiaPay comme aujourd'hui.
- **Payer à la livraison** → enregistre la commande, envoie les SMS au client et à l'administration, **sans reçu**.

Le reçu (client + administration) et la comptabilisation du montant n'arrivent qu'après livraison marquée payée par le livreur **et** confirmation du client. Les tableaux de bord (client, admin, comptabilité) n'intègrent le montant qu'à ce moment.

## 3. Bouton « Ajouter un paiement » (livreur, modérateur, admin)

- Un champ unique : numéro de commande **ou** numéro de téléphone du client.
- La commande trouvée s'affiche, avec un bouton « Payer ».
- Petit formulaire : **Espèces** ou **En ligne**.
  - Espèces → paiement validé immédiatement, commande clôturée, reçus envoyés, tableaux de bord et historiques mis à jour partout.
  - En ligne → ouverture de KkiaPay avec les frais KkiaPay déduits du montant demandé, pour que le total encaissé corresponde exactement au montant officiel de la commande.
- Après validation, retour au tableau de bord de l'utilisateur, tout se met à jour (historique client, admin, modérateur, livreur, comptabilité, selon les droits).

## 4. Connexion client par numéro seul

- Espace client : le client saisit son numéro, il entre directement dans son compte (compte créé à l'achat). Aucun mot de passe.
- **Aucun changement pour /me et /team** : téléphone ou e-mail + mot de passe comme aujourd'hui.

## 5. /me : création de compte établissement

- Ajout d'un bouton « Créer un compte » sur le formulaire de connexion.
- Formulaire avec une liste déroulante des établissements, avec recherche par saisie.
- Compte créé = en attente : aucune donnée financière visible (revenus, commissions…).
- L'administration reçoit une notification et valide.
- La validation déclenche un SMS **et** un e-mail d'information, puis débloque l'accès aux informations de l'établissement.

## 6. Nouveau popup d'accueil

- Contenu : bienvenue, commande en un clic, paiement en ligne ou à la livraison, livraison gratuite en Côte d'Ivoire, commande personnalisée au +225 07 02 58 44 57, puis « Suivre votre commande » avec un champ numéro de téléphone et un bouton qui ouvre l'espace client.
- Logo officiel, charte graphique Scoly, icônes propres (pas les émojis bruts).
- Affichage animé à l'ouverture, puis il se replie en encart flottant discret pendant environ 45 secondes avant de disparaître, sans gêner le défilement. Bouton fermer toujours présent.

## 7. Trafic : base de départ

- Compteur de départ de 4 373 vues réparties : Côte d'Ivoire 70 %, puis France, Canada, Sénégal, Guinée, Mali, Burkina Faso, Bénin, Togo, Niger.
- Appareils : 78 % mobile, le reste ordinateur et tablette.
- Le trafic réel des prochains visiteurs s'ajoute à cette base.

## 8. Branding e-mail fidèle à la maquette

Reprise des e-mails (dont le reçu) sur le modèle fourni : fond clair, logo centré large, filet bleu/orange, titre bleu marine, texte gris foncé, pied de page bleu marine.

## Détails techniques

- Base : profils clients créés côté serveur via une fonction Edge (numéro normalisé, pas de mot de passe), session émise après vérification du numéro ; `orders.payment_method` = `online` | `cash_on_delivery`.
- Nouvelle fonction Edge `client-phone-auth` (connexion sans mot de passe, clients uniquement — refus si le compte porte un rôle interne) et `record-manual-payment` (espèces / en ligne avec calcul des frais KkiaPay).
- Comptabilisation : les vues financières filtrent sur paiement `completed`, donc le paiement à la livraison n'entre qu'après confirmation.
- Trafic : lignes de base insérées dans `visits` (ou compteur `site_counters`) et additionnées dans `get_traffic_overview`.
- Popup : refonte de `LaunchPopup` en composant modal + encart flottant avec minuteur de 45 s.
