# AI Council Android

Application Android 8+ issue de `../ai-council.html`, avec ses corrections de coordination, sauvegarde et budget. Identifiant : `fr.onbreax.aicouncil`. Indépendante de Matchwork et de GitHub Pages pour charger son interface.

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

Après préparation des assets : `node tests/ai-council-android.cjs` depuis la racine, avec Playwright et Chromium (ou CHROME_EXECUTABLE). Vérifie le chargement local des lecteurs, les messages natifs d’export et de dictée, la sauvegarde avant fermeture et la largeur mobile. Ces tests simulent le pont Android ; ils ne remplacent pas un essai sur téléphone. Les régressions communes sont couvertes par `tests/ai-council.cjs`.
