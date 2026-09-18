# Rattrapage des ventes et parcours de livraison

## Objectif
Rétablir les deux ventes KkiaPay manquantes, fiabiliser leur enregistrement automatique, et corriger le parcours commande-livraison sans permettre à l’administrateur de déclarer une livraison terminée.

## Travail prévu
- Retrouver les commandes de **3 224 FCFA** (Super Admin) et **26 000 FCFA** (INZA OUATTARA) à partir des traces encore présentes, puis vérifier leurs transactions auprès de KkiaPay avant de recréer les commandes et paiements réussis.
- Faire apparaître les ventes récupérées dans le compte client, les paiements, les commandes, les tableaux de bord et les reçus officiels.
- Corriger le webhook et le rattrapage KkiaPay afin qu’une transaction puisse être rapprochée même si le retour du navigateur n’a pas enregistré sa référence.
- Ajouter un rattrapage automatique borné et protégé contre les doublons, puis conserver le bouton d’actualisation administrateur.
- Utiliser le même générateur de reçu officiel dans Paiements et Commandes, côté client comme côté administration.
- Réparer le bouton de détail de « Gestion des Livraisons » et afficher commande, client, adresse, téléphone, articles, montant, commercial et reçu.
- Retirer « Marquer livrée » de l’administration : l’administrateur valide et expédie, le commercial confirme la prise en charge puis la remise au client, et seul le client confirme la réception finale.
- Envoyer automatiquement les messages à chaque étape ; une erreur d’envoi sera visible au lieu d’afficher un faux succès.

## Règles de sécurité et de fiabilité
- Aucun paiement ne sera ajouté sans confirmation vérifiable du fournisseur.
- Les écritures seront idempotentes : une transaction ou une commande ne pourra pas être comptée deux fois.
- Les tâches automatiques auront une limite par exécution, un verrou unique et un état de progression persistant.
- Les données personnelles et preuves de livraison resteront limitées aux personnes autorisées.

## Vérification
- Contrôler que les quatre ventes et leurs montants apparaissent partout avec leurs reçus.
- Tester le webhook KkiaPay et le rattrapage avec les réponses réelles du fournisseur.
- Tester les détails de livraison et le parcours complet administrateur → commercial → client.
- Vérifier les SMS enregistrés, les reçus PDF et les affichages ordinateur/mobile.
