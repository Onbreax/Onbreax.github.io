# Matchwork Android 1.1.6 — alertes Gmail par profil

La version HTML partagée et l’APK ajoutent une connexion Gmail facultative à chaque profil. La recherche habituelle inclut les alertes de `jobalerts-noreply@linkedin.com`. Antériorité par défaut : 30 jours ; choix 7/30/90/180/365 jours. Rythme : chaque recherche, une fois par jour lors d’une recherche, ou manuel. Aucun polling lorsque l’application est fermée.

Le guide utilisateur est dans [`../matchwork/gmail-setup.html`](../matchwork/gmail-setup.html) et dans la configuration du profil. Un projet Google OAuth doit être configuré avant le premier accès réel : Gmail API, consentement `gmail.readonly`, comptes de test si nécessaire, clients Web et Android. Aucun secret client n’est embarqué. Android utilise Google Identity Services ; le navigateur utilise Google Identity Services Web et des GET vers l’API Gmail.

L’email associé, la période et le bilan sont stockés avec le profil. Les jetons Web restent en mémoire JS ; les jetons Android restent dans la mémoire du pont natif, indexés par profil et boîte vérifiée. Ils ne figurent pas dans les sauvegardes. Le filtre d’expéditeur est appliqué par l’application ; la permission Google de lecture couvre techniquement toute la boîte. Dissocier localement un profil n’effectue pas une révocation globale susceptible de toucher un autre profil.

Le parseur MIME/UTF-8 extrait les offres sans IA. Les emails HTML sont lus dans un template inerte, sans être affichés. Les liens LinkedIn sont réduits à l’identifiant d’offre ; les paramètres de suivi ne sont pas conservés. Les doublons gardent notes et statut. La date reçue n’est pas une date de publication. L’indication de texte partiel est conservée ; la vérification automatique de ces fiches reste indéterminée et n’essaie pas de contourner LinkedIn. Les analyses IA restent explicites ou soumises aux options existantes et sont marquées provisoires sur une alerte partielle.

Les lots sont limités à deux pages de 100 emails. La page et les messages déjà enregistrés sont sauvegardés progressivement. Une erreur ou un arrêt ne confirme pas le lot complet. Une reprise garde la requête d’origine et les doublons sont fusionnés. Les emails sans offre reconnue sont comptés dans le bilan.

## Compilation

`prepare.py` réintègre `matchwork/gmail-core.js` et `gmail-integration.js` dans le HTML autonome, puis génère l’asset Android. Le build Gradle utilise `com.google.android.gms:play-services-auth:21.6.0`. Le build SDK avec `build.sh` résout les mêmes bibliothèques à partir de Maven Google/Central avec les SHA-256 de `google-dependencies.lock.json` ; leurs ressources et manifestes sont fusionnés avant compilation. Aucun binaire Maven n’est versionné.

```bash
ANDROID_HOME=/chemin/sdk MATCHWORK_KEYSTORE=/chemin/prive/matchwork.jks MATCHWORK_PASSWORD_FILE=/chemin/prive/password.txt MATCHWORK_ECJ_JAR=/chemin/ecj.jar bash build.sh
```

Le package reste `fr.onbreax.matchwork`, versionCode 8, même certificat utilisateur que 1.1.5. Le contrôle binaire conserve `uses-sdk` avant `application` et vérifie la fenêtre redimensionnable de MainActivity pour préserver la correction de l’espace noir sur Android. L’ajout des activités internes Google n’altère pas les insets de la fenêtre Matchwork.

## Vérifications de cette version

- Suites UI, suivi et arrière-plan existantes conservées.
- `tests/matchwork-gmail.cjs` : extraction, liens, profils, recherche habituelle sans clé IA, périodes, dédoublonnage, reprise, absence de jetons dans les sauvegardes, indices d’annonce partielle.
- `tests/GmailPolicyTest.java` : liste exacte de GET Gmail, requête d’expéditeur imposée, absence d’envoi, d’édition, de pièces jointes et de redirection vers un autre hôte.
- Compilation/signature/alignement et contenu de l’APK vérifiés. L’extracteur a aussi reconnu les deux offres d’une alerte de référence, hors des fixtures publiques.

Pas de validation sur téléphone physique ni d’autorisation Google réelle tant que le projet OAuth n’est pas configuré.

---

## Notes des versions précédentes

# Matchwork Android

Application personnelle Android 8+ contenant le code de `../matchwork.html`.
Pas de chargement de l'interface depuis GitHub Pages. Internet reste nécessaire pour OpenRouter, Adzuna et Jina. Le lecteur PDF est embarqué.

## Version 1.1.5

- Correction de la construction manuelle : la déclaration SDK est placée avant l’application dans le manifeste compilé. Android calcule certains paramètres de compatibilité pendant la lecture de l’application ; les anciennes APK plaçaient cette déclaration après. Le ratio 1,86 observé sur la capture correspond à la limite historique d’Android.
- L’application et son Activity déclarent explicitement une fenêtre redimensionnable, sans restriction d’orientation ou de ratio. Le rendu matériel est également déclaré explicitement.
- Les marges verticales du menu mobile passent de 6 à 2 pixels CSS, en conservant des boutons d’au moins 48 pixels. L’espace sous la page suit la hauteur mesurée du menu, qui inclut déjà la zone de sécurité.
- Le script de construction contrôle le manifeste binaire de l’APK avant de la signer : ordre du SDK, versions, redimensionnement et rendu matériel. Le même contrôle détecte le défaut dans la version 1.1.4.

La signature, l’identifiant d’application, l’origine WebView et les données locales restent conservés. Le rendu réel sur le téléphone reste à confirmer après installation.

## Version 1.1.4

- Android 11+ : le conteneur réserve une seule fois les barres système, l’encoche et le clavier. Les insets traités sont remis à zéro et transmis à la WebView, au lieu de bloquer les mises à jour par consommation. Quand le clavier devient invisible, son ancienne hauteur est ignorée. Les anciennes versions gardent le redimensionnement système.
- Le moteur WebView conserve la recherche en arrière-plan, avec un contexte d’Activity lorsqu’il est affiché et un contexte application lorsqu’il est détaché. Le fond est clair et les icônes des barres système sont sombres.
- Les dialogues de création et de renommage de profil sont affichés explicitement par l’Activity, comme les confirmations, sans dépendre du contexte intermédiaire de la WebView.
- La fiche s’ouvre directement dans l’onglet demandé. Les données IA, employeur et établissement sont rendues séparément ; une ancienne analyse invalide n’empêche pas l’ouverture du suivi.
- Le verdict IA ne modifie plus le statut personnel. Le bouton « Retenir cette offre » ajoute explicitement une offre au suivi local, sans appel API ni envoi de candidature.
- Les anciens changements automatiques « À creuser » / « Écartée » sont corrigés uniquement lorsque la dernière entrée d’historique porte l’origine IA, sans notes personnelles. L’historique et les verdicts restent conservés. Les choix manuels, les états d’origine inconnue et les offres annotées ne sont pas modifiés.
- La fiche reste consultable pendant une recherche ; un message explique que le statut et les notes sont modifiables à sa fin. La marge sous les pages mobiles suit la hauteur réelle de la navigation.

Les tests DOM couvrent l’ouverture directe du suivi, le retour à la liste, les données partielles, les choix manuels et les sauvegardes. Les tests JVM couvrent le calcul des marges à l’apparition et à la disparition du clavier. L’affichage réel Android et les interactions clavier restent à vérifier sur téléphone.

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

La version 1.1.5 recompile les composants Android et embarque le HTML partagé. L’origine WebView reste `https://appassets.androidplatform.net/assets/index.html` et l’identifiant d’application reste identique. Le canal natif utilise les ports de messages de la plateforme Android, remis uniquement à cette page, avec les frames externes bloquées.

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
node tests/matchwork-follow.cjs
```

Les tests couvrent la migration des anciennes données, la navigation, les filtres, la pagination, le suivi et les sauvegardes, le nettoyage au retour Android, les erreurs et réponses tardives du solde, l’absence d’appel IA lors d’une analyse locale, l’isolation des résultats asynchrones et l’arrêt des recherches. Aucune clé réelle ni aucun appel facturé n’est utilisé.
