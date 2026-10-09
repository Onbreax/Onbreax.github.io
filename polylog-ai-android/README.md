# Polylog AI Android

Application Android 8+ issue de `../polylog-ai.html`, avec ses corrections de coordination, sauvegarde et budget. Identifiant : `fr.onbreax.aicouncil`. Indépendante de Matchwork et de GitHub Pages pour charger son interface.

## Construction

Java 17, Android SDK 35 / Build Tools 35.0.0 et Gradle 8.11.1 :

```
python3 prepare.py
gradle assembleRelease
```

Signer `app/build/outputs/apk/release/app-release-unsigned.apk` avec `apksigner` et une clé privée conservée hors dépôt. Garder la même clé et le même identifiant pour les mises à jour ; augmenter versionCode.

Le script prépare les lecteurs PDF, Word et Excel embarqués, vérifie leurs empreintes SHA-256 et adapte les exports à Android. Il échoue si les points d'intégration du HTML partagé ont changé.

- Historique local IndexedDB ; sauvegarde JSON exportable et réimportable, sans clés API.
- Imports multiples via le sélecteur de documents Android ; aucun accès global aux fichiers.
- JSON et Markdown : sélecteur d'enregistrement Android. PDF : impression Android, destination Enregistrer au format PDF.
- Dictée : service de reconnaissance vocale installé sur Android, dans la langue choisie. En l'absence de service, un message propose le clavier. Le service vocal peut nécessiter Internet.
- Liens externes ouverts dans le navigateur, sans exposer le pont natif aux sites externes.
- Écran maintenu allumé pendant un travail au premier plan. Le fonctionnement en arrière-plan n'est pas garanti. Le bouton Retour ferme d'abord les dialogues, puis propose d'arrêter et sauvegarder avant de quitter.
- API et données des débats envoyées aux fournisseurs selon les réglages de l'application. Aucune clé ni donnée personnelle n'est embarquée. Les sauvegardes automatiques Android sont désactivées.

Conserver l'APK et la clé privée hors du dépôt public. Une désinstallation efface les données locales : utiliser la sauvegarde manuelle pour les conserver.

## Vérifications

Après préparation des assets : `node tests/polylog-ai-android.cjs` depuis la racine, avec Playwright et Chromium (ou CHROME_EXECUTABLE). Vérifie le chargement local des lecteurs, les messages natifs d’export et de dictée, la sauvegarde avant fermeture et la largeur mobile. Ces tests simulent le pont Android ; ils ne remplacent pas un essai sur téléphone. Les régressions communes sont couvertes par `tests/polylog-ai.cjs`.


## Renommage en Polylog AI — version 1.0.1

Le nom affiché, l’aide, les exports et la page d’accueil deviennent Polylog AI. Le logo est inchangé.

L’identifiant Android `fr.onbreax.aicouncil` et la signature de la version 1.0.0 sont conservés pour installer cette version comme une mise à jour. Les identifiants IndexedDB et localStorage restent inchangés afin de retrouver les données locales. Ne pas désinstaller l’ancienne application pour la mettre à jour.

Les sauvegardes nouvelles utilisent `polylog-ai-backup`. Les anciennes sauvegardes `ai-council-backup` restent importables. L’ancienne adresse `ai-council.html` redirige vers `polylog-ai.html` sur la même origine.

## Rapport d’audit — version 1.0.3

Exporter → Rapport d’audit enregistre un JSON via le sélecteur Android, avec les options et les métriques déclarées par les API pour chaque tentative. Les prompts, réponses et clés sont exclus. Les mesures restent dans l’historique. Voir `../tests/POLYLOG-AUDIT.md` pour les limites et les tests.

Cette livraison met à jour les assets HTML et la version du paquet signé 1.0.2 ; le code natif est inchangé. L’identifiant et la clé de signature sont conservés. Le projet Gradle permet également une reconstruction complète.

## Cache — version 1.0.4

Sessions OpenRouter stables, repères de cache GPT compatibles, durée Claude ajustée, audit enrichi et contrôle des ordres du jour tronqués. Mise à jour des assets et du numéro de version, code natif inchangé, même signature. Les économies réelles nécessitent un nouvel audit ; tests API simulés uniquement.


## Lecture à son rythme — version 1.0.5

Les messages, vérifications, indicateurs de réflexion et conclusions ne déclenchent plus de défilement automatique. Le bouton « Derniers messages » permet de rejoindre volontairement le bas du fil. La piste d’audit et les optimisations de cache de la version 1.0.4 sont conservées.

Le comportement en arrière-plan reste inchangé : l’activité ne stoppe pas volontairement le débat au passage à l’accueil, mais aucun service Android ne garantit la poursuite. Le maintien de l’écran allumé ne protège pas le travail en arrière-plan. Un service au premier plan et une gestion du moteur indépendante de l’activité restent nécessaires pour prendre en charge ce cas de manière robuste.

Test de lecture : `node tests/polylog-reading.cjs` (Chromium, 390 et 1280 pixels, réseau externe bloqué).
