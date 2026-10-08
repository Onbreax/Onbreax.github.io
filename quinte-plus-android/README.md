# Quinté+ du jour

Application Android simple (Kotlin + Jetpack Compose) qui affiche le Quinté+ du jour :
l'heure de départ, l'hippodrome, la liste des partants avec leur cote, et un **ticket des favoris**
(les 5 partants avec la plus petite cote).

Données : API publique non officielle du PMU (`online.turfinfo.api.pmu.fr`), sans compte.

## Récupérer l'APK
À chaque modification de ce dossier sur `main`, GitHub Actions compile l'application : onglet **Actions**, dernier run,
artefact **quinte-plus-apk**. Installe `app-debug.apk` sur ton téléphone (autoriser les sources inconnues).

## Compiler soi-même
Ouvrir le dossier dans Android Studio, ou `./gradlew assembleDebug`.
