# Matchwork Android

Application personnelle Android 8+ contenant le code de `../matchwork.html`.
Pas de chargement de l'interface depuis GitHub Pages. Internet reste nécessaire pour OpenRouter, Adzuna et Jina. Le lecteur PDF est embarqué.

## Version 1.1.1

- Vérification de la clé IA via `GET /api/v1/key`, indépendante de la lecture du solde : une clé IA valide reste reconnue quand le solde du compte est inaccessible.
- Bouton « Enregistrer et vérifier » près de la clé. « Actualiser » enregistre également les clés OpenRouter saisies, sans modifier les autres réglages en cours de saisie.
- Budget restant et utilisation de la clé affichés séparément du solde global. Sans plafond, le budget affiche « Sans plafond défini » ; cela ne signifie pas que le compte dispose de crédits illimités.
- Clé de gestion facultative, conservée uniquement sur l’appareil, pour lire le solde global via `GET /api/v1/credits`. Elle n’est jamais utilisée pour les appels IA ni intégrée aux sauvegardes. Les erreurs de ce solde ne changent pas l’état de la clé IA.
- La vérification ne lance aucun appel IA facturé. Les erreurs d’authentification, de réseau et de réponse invalide sont explicites ; les réponses tardives de clés remplacées sont ignorées.

## Version 1.1.0

- Accueil avec le profil actif, les offres prioritaires et le bilan de la dernière recherche.
- Trois vues principales : Accueil, Offres, Candidatures. Les outils, clés et réglages sont regroupés dans le menu secondaire ; sur téléphone, la navigation principale reste en bas.
- Offres en liste compacte ou détaillée, tri, filtres avancés repliables, pagination de 30 lignes et message explicite lorsqu’aucune offre ne correspond aux filtres. Le PDF exporte toutes les offres filtrées.
- Fiches en quatre onglets : Résumé, Analyse du CV, Employeur, Suivi. Historique daté des changements de statut, compatible avec les imports et sauvegardes existants. Aucune candidature n’est envoyée par l’application.
- Consultation et navigation possibles pendant les opérations ; modification du profil et lancement d’une autre analyse bloqués pour éviter de mélanger les résultats. Une recherche peut être arrêtée après l’étape en cours : sa réponse et son coût restent enregistrés.
- État des clés explicite, erreurs de solde affichées comme indisponibles, réponses tardives d’une ancienne clé ignorées. Les appels sans coût communiqué sont signalés ; l’estimation exclut les frais de navigation et de vérification.
- Extraction du CV et analyse locale du texte sans appel IA automatique. La proposition de profil et la lecture IA du CV se lancent séparément.

L’identifiant d’application, l’origine WebView et les clés de stockage sont conservés. Installer l’APK signée avec la même clé par-dessus la version 1.0.0 ou 1.1.0 permet de conserver les données Android ; ne pas désinstaller avant la mise à jour. Les anciens statuts sans date restent affichés sans inventer d’historique.

Le composant Android natif n’a pas changé dans cette révision. L’APK 1.1.1 conserve ses classes et ressources compilées et remplace le HTML embarqué ainsi que le numéro de version du manifeste, avant alignement et signature avec la clé existante. Le nettoyage de la fiche lors du retour Android est géré dans le HTML partagé. Les parcours ont été vérifiés avec des appels simulés ; un essai sur téléphone reste nécessaire pour valider le sélecteur de fichiers, l’impression et le confort tactile.

## Construire

Java 17, Android SDK 35, Build Tools 35.0.0, Gradle 8.11.1.

```
python3 prepare.py
gradle assembleRelease
```

Signer `app/build/outputs/apk/release/app-release-unsigned.apk` avec `apksigner` et une clé privée conservée hors dépôt. Les mises à jour doivent conserver le même applicationId et la même clé, et augmenter versionCode. Ne jamais publier la clé de signature ni des données personnelles.

Les CV, offres, clés API et données établissements restent dans le stockage privé de l'application, distinct du navigateur. La sauvegarde Android automatique est désactivée. Les sauvegardes manuelles existantes excluent les clés API et le tableau établissements. Désinstaller efface les données de l'application.

Les exports JSON/CSV utilisent le sélecteur d'enregistrement Android. Le PDF utilise l'impression Android (choisir Enregistrer au format PDF). Les annonces externes s'ouvrent dans le navigateur. Les imports utilisent le sélecteur de documents Android, sans permission d'accès global aux fichiers.

Garder l'application au premier plan pendant les recherches : l'exécution en arrière-plan n'est pas garantie.

## Vérifier le HTML partagé

Depuis la racine du dépôt, avec Node.js 20+ :

```
npm install --no-save jsdom@26.1.0
node tests/matchwork-ui.cjs
```

Les tests couvrent la migration des anciennes données, la navigation, les filtres, la pagination, le suivi et les sauvegardes, le nettoyage au retour Android, les erreurs et réponses tardives du solde, l’absence d’appel IA lors d’une analyse locale, l’isolation des résultats asynchrones et l’arrêt des recherches. Aucune clé réelle ni aucun appel facturé n’est utilisé.
