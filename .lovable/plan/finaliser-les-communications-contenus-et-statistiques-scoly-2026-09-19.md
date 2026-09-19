# Finaliser les communications, contenus et statistiques Scoly

## Objectif
Terminer les correctifs déjà identifiés sans reconstruire les parcours existants : aucun média cassé, un seul message par événement, des règles de commande exactes, un trafic réellement alimenté et une gestion unifiée des actualités/publicités.

## Logo et médias
- Remplacer le logo du popup par le logo officiel fourni, servi de façon fiable en production, et mettre à jour sa version carrée pour l’icône du site.
- Conserver des replis visuels propres pour les images de contenus afin qu’aucune image cassée ne soit affichée.

## Notifications de commande
- Ajouter une réservation atomique par commande, événement, destinataire et canal avant chaque SMS/e-mail, afin que les doubles clics, relances et appels concurrents ne puissent jamais doubler un envoi.
- Supprimer le déclencheur de notification interne redondant et dédupliquer aussi les notifications déjà lues à l’écran.
- À la création de toute commande, envoyer une seule alerte SMS à l’équipe avec le numéro et le mode de paiement.
- Paiement en ligne encaissé : notifier une seule fois le client par SMS et e-mail, puis à chaque changement réel de statut jusqu’à la livraison.
- Paiement à la livraison : ne pas notifier le client à la création ; démarrer SMS et e-mail uniquement après validation par l’administration ou la modération.
- Centraliser les changements de statut afin qu’un seul chemin déclenche les messages.

## Actualités et publicités
- Fusionner les deux entrées d’administration en une seule page « Actualités & publicités » avec un choix obligatoire du type de contenu.
- Proposer deux modes sur cette même page : formulaire manuel complet et assistance IA.
- Limiter l’IA à structurer, corriger et organiser le texte fourni, sans inventer d’informations, analyser hors contexte ou allonger inutilement le contenu.
- Conserver l’affichage des actualités dans la zone « À la une » ; afficher également les publicités actives dans cette zone.
- Pour les publicités actives, ajouter un flash moderne et animé, avec rotation automatique lorsqu’il y en a plusieurs, sans bloquer ni déplacer le défilement de la page.

## Trafic et tableau de bord
- Brancher l’enregistrement des visites et la lecture administrateur sur les données réelles existantes.
- Corriger la fonction de synthèse et afficher les erreurs explicitement au lieu d’un écran vide.
- Rendre les périodes 7 jours, 30 jours, 3 mois et année effectives.
- Afficher pages vues, visiteurs uniques, sources, pages consultées, pays avec drapeaux, villes et appareils.
- Finaliser les indicateurs déjà prévus : chiffre d’affaires encaissé, commandes par mode de paiement, produits les plus vendus et évolution par période.

## Vérifications
- Tester les règles paiement en ligne/paiement à la livraison et confirmer qu’un événement ne crée qu’un SMS, un e-mail et une notification interne au maximum.
- Vérifier l’affichage public du popup, du logo, des actualités, des publicités et du flash sur ordinateur et mobile.
- Vérifier l’administration unifiée et les statistiques avec les données disponibles, puis publier uniquement les fonctions serveur modifiées.

## Limite connue
Les e-mails applicatifs dépendront du domaine d’envoi `scoly.ci` déjà signalé ; tout le mécanisme sera prêt et actif dès que ce domaine sera configuré.
