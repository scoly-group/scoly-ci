# Roadmap

- [ ] Vérifier le rétablissement du catalogue après restauration des autorisations nécessaires.
- [x] Remplacer les mentions de règlement à la livraison par le paiement sécurisé KkiaPay.
- [x] Supprimer « Payer plus tard depuis mon compte » et conserver la relance des paiements échoués.
- [ ] Vider uniquement les paiements échoués visibles chez l’administrateur.
- [ ] Mettre à jour les pages légales : SCOLY GROUP, Korhogo, suppression de la section hébergement, septembre 2026.
- [ ] Mettre à jour livraison et retours : vérification avec le livreur, aucun retour après validation conforme.
- [x] Corriger la suppression des comptes sauf super administrateurs.
- [x] Afficher les adresses email dans les pages administrateur concernées.
- [x] Rendre le téléphone obligatoire, l’email facultatif, et permettre la connexion par téléphone ou email.
- [x] Préremplir la commande avec les informations de livraison enregistrées du client.
- [ ] Récupérer et vérifier les ventes KkiaPay de 3 224 FCFA et 26 000 FCFA, puis les rétablir partout.
- [x] Fiabiliser le webhook KkiaPay et le rattrapage automatique sans dépendre des commandes provisoires supprimées.
- [x] Uniformiser le reçu officiel côté client, paiements admin et commandes admin.
- [x] Réparer les détails de Gestion des Livraisons.
- [x] Réserver la remise au commercial et la confirmation finale au client, avec notifications automatiques.

## Reprise du 13/09/2026
- [x] Restaurer les 2 ventes KkiaPay (26 000 FCFA INZA, 3 224 FCFA Super Admin) + paiements réussis
- [x] Rétablir le zéro des numéros ivoiriens (base + envoi SMS/WhatsApp)
- [x] Historique de paiement client : plus de chargement infini, erreur affichée + bouton Réessayer
- [x] Reçus PDF strictement conformes à la maquette fournie (admin, modérateur, client, paiements)
- [x] Admin : gestion complète des comptes (emails visibles, modification email, réinitialisation mot de passe)
- [ ] Client : modification des adresses de livraison (actuellement suppression seulement)
- [ ] Commandes : boutons d'action verrouillés/verts une fois l'étape effectuée
- [ ] Livraisons : assignation/réassignation + notifications push ancien/nouveau commercial
- [ ] Articles réellement commandés par INZA et Super Admin à confirmer (données perdues)

## Demande du 13/09/2026 (14h40)
- [x] Commission établissement : 500 FCFA par kit au lieu de 2 %
- [x] Commandes admin : boutons Valider/Expédier verrouillés et verts une fois faits
- [x] Livraisons : bouton Assigné toujours cliquable + notification ancien/nouveau livreur
- [x] Bouton Déconnexion dans l'espace admin (menu + mobile)
- [x] Notifications client : bouton « Tout marquer comme lu »
- [x] Plus de SMS à la confirmation de commande : uniquement après paiement réussi
- [ ] Supprimer les secrets inutiles (MoneyFusion, etc.) dans Supabase
- [ ] Coupons : CRUD complet + réduction réellement appliquée au montant débité
- [ ] Promotions & Ventes Flash : effet visible sur le site public, CRUD, tout supprimer, remise modifiable
- [ ] IA : proposition automatique de ventes flash sur les kits les moins vendus
- [ ] Messages d'erreur techniques remplacés par des messages clairs partout
- [x] Reçu PDF conforme à la maquette partout + envoi par e-mail (bouton admin et paiements)
- [x] Admin : voir/modifier e-mails, définir un mot de passe, code SMS à 6 chiffres valable 10 min
- [x] Connexion par téléphone ou e-mail, suppression du champ « Nom d'utilisateur »
- [ ] Panier vidé après paiement + correction du panier vide au checkout (cache)
- [ ] Purge automatique du cache navigateur toutes les 30 secondes en production

## 2026-09-14
- [x] Page dédiée de connexion par téléphone (/connexion-telephone) + mot de passe oublié par SMS
- [x] Retour KkiaPay vers /paiement/retour puis espace client (plus de page tierce)
- [x] Reçu PDF + e-mail + SMS déclenchés automatiquement après validation du paiement
- [x] Rôle « Administrateur » supprimé : comptes migrés vers Modérateur
- [x] Modérateur = gestion complète sauf comptes, rôles, retraits et réglages (super admin seul)
- [x] Espaces livreur (/delivery) et comptable (/comptabilite) désormais accessibles

## 2026-09-17
- [x] Corriger l’adresse et la taille 180 × 117 px du logo officiel dans les gabarits d’e-mail
- [x] Envoyer et vérifier un reçu de test avec le logo officiel (envoyé à scoly.ci@gmail.com via Brevo)
- [~] Vérifier le retour KkiaPay : widget, webhook et rattrapage contrôlés côté serveur ; un vrai paiement mobile money reste à faire par l’équipe
- [x] Corriger l’enregistrement des e-mails envoyés dans l’historique
- [x] Vérifier visuellement la page Trafic et ses libellés français (pays affichés en français)
- [x] Formulaire de commande : localité retirée, lieu de livraison et e-mail facultatifs, commande sans connexion, boutons « Payer en ligne » / « Payer à la livraison »
- [x] Popup d'accueil : nouveau contenu, suivi de commande, encart flottant après 45 secondes
- [x] Espace client par numéro (/client) et espace établissement (/me, /etablissement + pages de connexion)
- [x] Bouton « Ajouter un paiement » dans les espaces livreur, modérateur et administration
- [x] Revenus de l'établissement masqués tant que le compte gérant n'est pas validé
- [x] Fonctions serveur déployées (suivi de commande, connexion par numéro, encaissement, accès établissement)

## Finalisation du 18/09/2026
- [x] Autoriser l’accès client par téléphone dès l’enregistrement d’une commande, même non confirmée
- [x] Réparer le logo et reproduire fidèlement la nouvelle fenêtre d’accueil sans ancien texte
- [x] Rendre visibles et confirmables les commandes payées à la livraison pour l’administration et la modération
- [x] Finaliser le préremplissage client par téléphone ou nom et la mise à jour de l’e-mail avec renvoi des reçus
- [x] Vérifier et terminer la demande d’accès établissement, sa validation, puis les notifications e-mail et SMS
- [x] Vérifier et terminer le suivi par livreur avec commandes reçues, en cours et livrées
- [x] Retirer les anciens accès et formulaires client devenus obsolètes sans toucher à /me et /team
