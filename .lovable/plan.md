# Finaliser les notifications de commande et le pilotage administrateur

## Objectif
Garantir un seul envoi par événement, appliquer exactement les règles SMS/e-mail selon le paiement, et rendre les indicateurs administrateur fiables sur la période choisie.

## Notifications de commande
- Centraliser les envois dans le traitement serveur existant afin qu’un changement de statut ne déclenche plus plusieurs appels concurrents depuis les pages administrateur, modérateur, client ou livreur.
- Ajouter une clé d’unicité par commande, événement, canal et destinataire avant tout envoi. Un nouvel essai technique ne pourra donc pas créer un doublon.
- À la création de toute commande, envoyer une seule alerte SMS à l’administration avec le numéro de commande et le mode de paiement.
- Pour un paiement en ligne réussi, notifier une seule fois le client par SMS et e-mail, puis poursuivre à chaque changement réel de statut jusqu’à la livraison.
- Pour un paiement à la livraison, ne rien envoyer au client à la création ; commencer les SMS et e-mails après validation par l’administration ou la modération.
- Couvrir confirmation, expédition/en cours de livraison, arrivée/remise et livraison finale, sans renvoyer un message lorsque le statut ne change pas.
- Conserver les notifications internes existantes, mais supprimer à l’affichage les répétitions d’un même événement déjà enregistrées.

## Tableau de bord administrateur
- Consolider les données déjà présentes plutôt que créer un second tableau de bord.
- Calculer le chiffre d’affaires à partir des paiements réellement encaissés, y compris les paiements à la livraison enregistrés.
- Ajouter la répartition des commandes par mode de paiement.
- Calculer les produits les plus vendus uniquement à partir des commandes encaissées.
- Rendre le sélecteur de période effectif pour les indicateurs et graphiques : 7 jours, 30 jours, 3 mois et année.
- Afficher des états explicites lorsqu’une donnée est absente ou qu’une lecture échoue, au lieu de blocs silencieusement vides.

## Vérifications
- Vérifier les appels existants et les journaux récents pour confirmer la cause des triples envois.
- Tester les scénarios paiement en ligne, paiement à la livraison validé, expédition et livraison.
- Vérifier l’administration sur ordinateur et mobile avec les données réelles disponibles.
- Déployer uniquement les fonctions serveur modifiées et contrôler leurs réponses.

## Limite actuelle
L’envoi d’e-mails applicatifs via le système géré nécessite la configuration du domaine d’envoi `scoly.ci`. Le code et les déclencheurs peuvent être finalisés immédiatement ; les e-mails gérés commenceront à partir après cette configuration.
