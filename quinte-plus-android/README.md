# Quinté+ — version 1.4

Application Android en Kotlin et Jetpack Compose : Quinté+ du jour et historique des sept derniers jours (aujourd’hui et les six jours précédents, calendrier de Paris).

## Consulter une ancienne course

Choisir la date en haut de l’écran, ou utiliser « Précédent » et « Suivant ». La course, l’arrivée définitive et les rapports PMU sont chargés pour cette date. « Actualiser » conserve la date choisie. La navigation reste disponible pendant un chargement ou une erreur réseau.

Sous l’arrivée, « Saisir mon ticket » accepte cinq numéros différents dans l’ordre joué, présents dans cette course. Le ticket personnel est mémorisé sur le téléphone, séparément pour chaque date. Modifier ou effacer un ticket ne touche pas les autres jours. Les clés de stockage de la version 1.3 restent compatibles ; les tickets que cette ancienne version a déjà effacés ne peuvent pas être reconstitués.

Les gains affichés concernent une combinaison simple de cinq chevaux, à la mise de base du rapport, avec les rapports PMU points de vente (OFFLINE). Ils incluent la mise. Flexi, combinés, options et promotions ne sont pas calculés. Un ticket avec non-partant demande une vérification auprès du PMU. Un rapport indisponible ou incomplet ne donne pas lieu à un résultat « perdant ».

Le ticket des favoris reste séparé du ticket personnel. Pour une ancienne course sans ticket des favoris enregistré avant le départ, il est explicitement reconstitué avec les cotes disponibles après la course.

Données : flux public PMU `online.turfinfo.api.pmu.fr`, sans compte. Une connexion est nécessaire pour charger les courses. Les résultats historiques sont chargés à la demande, sans enregistrement de pari.

## Compilation et validation

JDK 17, Android SDK 35 et Gradle Wrapper fourni :

```sh
./gradlew testDebugUnitTest assembleDebug
```

Identifiant Android `fr.onbreax.quinte`, versionCode 5, versionName 1.4. Le certificat de debug fixe du projet est conservé pour les mises à jour.

Les tests couvrent les bornes de la semaine, le changement de mois et de jour, la conservation des tickets par date, les réponses réseau tardives, les erreurs, la validation des numéros et les gains ordre/désordre/bonus. Un extrait des données PMU du 26 octobre 2026 sert de cas de régression, avec sa provenance dans `app/src/test/resources/pmu-2026-10-26/SOURCE.txt`.

Le workflow GitHub Actions existant compile les demandes de modification et publie une APK lors des modifications sur `main`.
