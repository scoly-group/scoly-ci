# Établissements, remise à zéro et finitions admin

## Déjà fait dans ce message
- Toutes les mentions « KkiaPay » visibles (paiement sécurisé, FAQ, conditions, confidentialité, documentation, reçus) affichent maintenant « Money Fusion ».
- « Référent » retiré de la barre du haut et « Programme parrainage » retiré du pied de page.

## Phase 1 — Établissements (remplace Référent)
- Nouvelle page « Établissements » dans l'administration, à la place de « Référents ».
- Formulaire de création simple et identique pour l'administration, la modération et les commerciaux :
  nom de l'établissement, sous-préfecture (liste déroulante recherchable de toutes les sous-préfectures de Côte d'Ivoire), localité précise (saisie libre), personne à contacter (nom, téléphone, e-mail).
- Création par l'administration ou la modération : validée automatiquement.
  Création par un commercial : reste « en attente » jusqu'à validation par l'administration ou la modération.
- Liste des établissements avec modification, validation, désactivation, réactivation et archivage.
- Un établissement désactivé ou non validé disparaît des pages publiques « Kits scolaires par école » et de la gestion des kits école ; réactivé, il réapparaît.

## Phase 2 — Gérants d'établissement et espace /me
- Dans les utilisateurs, l'administration et la modération peuvent associer un établissement validé à un utilisateur ; cette association donne automatiquement l'accès « établissement » et son tableau de bord.
- L'espace `/me` est repensé pour l'établissement : fiche de l'établissement, kits rattachés, ventes, commissions, retraits, messages. Suppression de tout ce qui relevait du parrainage et du vocabulaire « référent ».

## Phase 3 — Commissions de 2 % et retraits
- Chaque achat d'un kit scolaire rattaché à un établissement génère 2 % du prix du kit en commission pour cet établissement.
- Section « Commissions » dans la page Établissements : commissions par établissement, demandes de retrait, validation, puis marquage du retrait effectué.

## Phase 4 — Remise à zéro complète
- Suppression de toutes les commandes, paiements, transactions échouées, commissions, retraits, achats et statistiques dérivées.
- Tableau de bord, revenus, produits les plus vendus, commandes par statut, dernières commandes et page Paiements repartent tous de zéro.
- Cette étape efface définitivement des données : elle sera lancée avec votre accord explicite au moment de l'exécution.

## Phase 5 — Branchements manquants
- Page des statistiques de trafic reliée aux vraies données, sous « Pilotage ».
- Notifications : brancher les déclencheurs déjà demandés (commande, paiement, validation d'établissement, retrait).
- FAQ : la page publique lit désormais la base ; l'administration permet d'ajouter, modifier, réordonner et désactiver, et tout se propage immédiatement.

## Sécurité — point factuel
Le contrôle automatique de Supabase, relancé à l'instant sur le projet `Scoly`, renvoie encore
« Leaked Password Protection Disabled ». Ce n'est pas une invention de ma part : c'est la réponse du
serveur. Il est probable que le réglage n'ait pas été enregistré, ou l'ait été sur un autre projet.
Je le re-vérifierai après votre contrôle.

## Détails techniques
- Base : nouvelle table de rattachement établissement/utilisateur, statut de validation sur `schools`
  (`pending`/`approved`/`disabled`/`archived`), sous-préfecture et localité, commissions établissement
  liées aux ventes de kits, demandes de retrait établissement, politiques RLS et droits pour chaque rôle,
  déclencheur de commission 2 % à la vente d'un kit.
- Frontend : `EstablishmentsTab` (remplace `ReferentsTab`/`ReferralsManagement`), formulaire partagé
  admin/commercial, association dans `UserManagement`, refonte de `/me`, filtrage public des kits par
  établissement actif, `TrafficTab` et `FAQManagement` reliés aux données réelles.
