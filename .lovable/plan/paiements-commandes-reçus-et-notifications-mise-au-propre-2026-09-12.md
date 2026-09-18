# Paiements, commandes, reçus et notifications : mise au propre

## 1. Établissements : affichage public limité
Dans la liste déroulante de la page publique « Kit scolaire par école », n'afficher que le nom et la localité de l'établissement (plus aucun code ni autre information). Les écrans d'administration gardent l'accès complet.

## 2. Numéros de téléphone : ne plus perdre le « 0 »
Partout (formulaires, commandes, reçus, SMS), un numéro saisi « 0759566087 » reste affiché « 0759566087 ». Correction du composant de saisie et de l'affichage des numéros déjà enregistrés.

## 3. Paiements : seuls les paiements réussis existent
- Rattrapage : reprise de tous les paiements KkiaPay (et anciens MoneyFusion) réellement encaissés mais restés « en attente » — vérification auprès du fournisseur, puis mise à jour de la commande, du tableau de bord client, admin et équipe.
- Suppression des lignes de paiement échouées / en attente / annulées côté administration et des commandes correspondantes non payées.
- Désormais, seul un encaissement vérifié crée une ligne de paiement : les échecs ne sont plus enregistrés, donc plus jamais affichés.
- L'historique de paiement du client se charge correctement (plus de chargement infini) et affiche les paiements réussis.

## 4. Page Commandes (admin)
- Les compteurs deviennent : Total · Réussis · Expédiées · Livrés · Montant total.
- Plus aucun filtre ni statut « en attente », « en cours » ou « échoué ».
- Le bouton « Voir détail » ouvre la fiche complète de la commande (client, adresse, articles, paiement, reçu) avec les actions de suivi : confirmer, expédier, marquer livrée, réassigner.
- Le reçu client est téléchargeable depuis l'administration.

## 5. Reçu officiel Scoly
Le modèle fourni (logo, en-tête « REÇU DE COMMANDE », identification entreprise, siège social, mode de paiement, client, détail des articles, montant payé, pied de page légal) devient le seul modèle utilisé : reçu envoyé automatiquement au client, reçu téléchargé depuis le compte client et depuis l'administration.

## 6. Notifications automatiques
Déclenchement automatique à chaque étape, sans intervention :
- Paiement encaissé : message de félicitations au client (n° de commande, montant) **et** message à l'administration au +225 07 02 58 44 57.
- Commande expédiée, réception validée par le commercial de la zone du client, livraison effectuée : message au client à chaque étape.
Canal : SMS pour la zone CEDEAO, WhatsApp hors CEDEAO, et e-mail en secours si le message n'aboutit pas.

## 7. Redirection de paiement
Quel que soit le moyen de paiement choisi, le retour après paiement pointe vers `scoly.ci/client`.

## 8. Données à jour chez tous les visiteurs
Un mécanisme d'arrière-plan rafraîchit automatiquement l'application et purge les anciens caches au chargement, au retour sur l'onglet et périodiquement, sans déconnecter le client ni vider son panier.

## Détails techniques
- Vue publique `public_schools` réduite à `id, name, city` ; `SchoolCombobox` n'affiche plus `code`.
- `PhoneInput` / `toE164` : conservation du zéro national dans l'affichage, normalisation E.164 conservée pour l'envoi (`+225` + numéro sans zéro seulement pour les pays où c'est requis) et helper d'affichage partagé utilisé par le reçu PDF et les SMS.
- Fonction de rattrapage `reconcile-payments` : parcours borné des `payments`/`orders` non finalisés, appel `verifyTransaction`, puis `finalize_payment_atomic`.
- `_shared/kkiapay.ts` : ne crée plus de ligne `payments` pour un échec ; nettoyage SQL des lignes `failed`/`pending` existantes.
- `notify-order` : ajout des événements manquants et repli e-mail après échec SMS/WhatsApp ; appels ajoutés sur expédition, réception commerciale et livraison.
- Reçu : `generate-receipt-pdf` devient la source unique, `src/utils/pdfGenerators.ts` réutilise le même gabarit.
- `PaymentsTab` et la gestion des commandes : nouveaux compteurs, suppression des statuts non payés, tiroir de détail commande.
