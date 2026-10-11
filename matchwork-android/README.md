# Matchwork Android

Application personnelle Android 8+ contenant le code de `../matchwork.html`.
Pas de chargement de l'interface depuis GitHub Pages. Internet reste nécessaire pour OpenRouter, Adzuna et Jina. Le lecteur PDF est embarqué.

## Version 1.1.3

- Recherche poursuivie lorsque l’Activity passe en arrière-plan : le moteur partagé appartient au contexte application et reste conservé quand son écran est détruit. Le service Android `dataSync`, lancé depuis une action visible, accompagne uniquement l’opération en cours.
- Notification d’avancement, arrêt après l’étape en cours et notification de fin. Un verrou CPU partiel permet de travailler écran éteint ; il est libéré à la fin et limité à deux heures par opération. Les limites Android 15+ sont également traitées par `onTimeout`.
- Appels réseau et temporisations entre recherches traités côté Android, avec délai couvrant le corps des réponses. Les requêtes natives sont limitées aux endpoints utilisés pour OpenRouter, Adzuna et Jina. Aucune redirection automatique d’une clé vers un autre hôte.
- Offres, coûts reçus et avancement sauvegardés progressivement. Une interruption du processus ou du moteur est signalée au retour. Aucun appel IA n’est rejoué automatiquement.
- Les coûts reçus par le transport natif sont conservés jusqu’à leur enregistrement dans le compteur de Matchwork. Les identifiants de reçus évitent un double comptage après une interruption. Un coût non communiqué reste inconnu.
- Le HTML partagé affiche l’état du mode Android ou navigateur. Un navigateur peut suspendre un onglet ; le HTML seul ne promet pas une exécution continue écran éteint.
- La version Android demande l’autorisation de notification lors de la première opération accompagnée. La recherche ne dépend pas de l’acceptation de cette permission. En mode Doze ou avec une gestion batterie restrictive, le réseau peut être retardé ; le bouton des réglages ouvre la configuration Android sans la modifier.

Les appels de test sont simulés et les sources Android sont compilées. L’exécution écran verrouillé, les notifications, la conservation des données lors d’une mise à jour et les sélecteurs d’import/export restent à valider sur un téléphone. Forcer l’arrêt de l’application ou éteindre le téléphone interrompt la recherche.

## Version 1.1.2

- Les crédits réellement disponibles du compte OpenRouter sont le montant principal dans l’en-tête et les réglages : `total_credits - total_usage`. Les crédits cumulés et la consommation du compte sont affichés séparément des coûts enregistrés par Matchwork.
- Le plafond de dépenses, les dépenses encore autorisées et la consommation de la clé IA sont regroupés dans des détails repliables. Le budget de la clé ne remplace jamais les crédits du compte, même si ceux-ci sont inaccessibles.
- Sans clé de gestion, les crédits affichent « À connecter » ; en cas d’erreur, « Indisponible ». La configuration des crédits est ouverte lorsque cette clé manque. Les crédits zéro sont affichés comme zéro, et les réponses invalides restent indisponibles.
- La lecture des crédits et la vérification de la clé IA démarrent indépendamment : une clé IA lente ou refusée n’empêche pas l’affichage de crédits valides. Les réponses tardives des anciennes clés restent ignorées.

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

L’identifiant d’application, l’origine WebView et les clés de stockage sont conservés. Installer l’APK signée avec la même clé par-dessus une version précédente permet de conserver les données Android ; ne pas désinstaller avant la mise à jour. Les anciens statuts sans date restent affichés sans inventer d’historique.

La version 1.1.3 recompile les composants Android et embarque le HTML partagé. L’origine WebView reste `https://appassets.androidplatform.net/assets/index.html` et l’identifiant d’application reste identique. Le canal natif utilise les ports de messages de la plateforme Android, remis uniquement à cette page, avec les frames externes bloquées.

## Construire

Java 17, Android SDK 35, Build Tools 35.0.0, Gradle 8.11.1.

```
python3 prepare.py
gradle assembleRelease
```

Signer `app/build/outputs/apk/release/app-release-unsigned.apk` avec `apksigner` et une clé privée conservée hors dépôt. Les mises à jour doivent conserver le même applicationId et la même clé, et augmenter versionCode. Ne jamais publier la clé de signature ni des données personnelles.

Le script `build.sh` offre aussi une construction avec les seuls outils du SDK et Java. Définir `ANDROID_HOME`, `MATCHWORK_KEYSTORE` et `MATCHWORK_PASSWORD_FILE`, puis lancer `bash build.sh`. Sans `javac`, définir `MATCHWORK_ECJ_JAR`. Les secrets restent hors du dépôt.

Les CV, offres, clés API et données établissements restent dans le stockage privé de l'application, distinct du navigateur. La sauvegarde Android automatique est désactivée. Les sauvegardes manuelles existantes excluent les clés API et le tableau établissements. Désinstaller efface les données de l'application.

Les exports JSON/CSV utilisent le sélecteur d'enregistrement Android. Le PDF utilise l'impression Android (choisir Enregistrer au format PDF). Les annonces externes s'ouvrent dans le navigateur. Les imports utilisent le sélecteur de documents Android, sans permission d'accès global aux fichiers.

Pendant une recherche Android, on peut réduire l’application ou éteindre l’écran. L’arrêt forcé, un crash, la perte réseau, le mode Doze et les restrictions du constructeur peuvent interrompre ou retarder le travail. Les résultats déjà enregistrés restent disponibles ; aucune relance payante automatique.

## Vérifier le HTML partagé

Depuis la racine du dépôt, avec Node.js 20+ :

```
npm install --no-save jsdom@26.1.0
node tests/matchwork-ui.cjs
node tests/matchwork-background.cjs
```

Les tests couvrent la migration des anciennes données, la navigation, les filtres, la pagination, le suivi et les sauvegardes, le nettoyage au retour Android, les erreurs et réponses tardives du solde, l’absence d’appel IA lors d’une analyse locale, l’isolation des résultats asynchrones et l’arrêt des recherches. Aucune clé réelle ni aucun appel facturé n’est utilisé.
