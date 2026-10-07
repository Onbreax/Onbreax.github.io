# Matchwork Android

Application personnelle Android 8+ contenant le code de `../matchwork.html`.
Pas de chargement de l'interface depuis GitHub Pages. Internet reste nécessaire pour OpenRouter, Adzuna et Jina. Le lecteur PDF est embarqué.

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
