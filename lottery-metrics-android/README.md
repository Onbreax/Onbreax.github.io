# Lottery Metrics Android

Version 1.0.0 personnelle, Android 8 minimum (API 26), cible Android 15 (API 35).
Identifiant : `fr.onbreax.lotterymetrics`. Source partagée : `../lottery-metrics.html`.

## Fonctionnement

- Import initial Excel (.xls/.xlsx), CSV ou ZIP FDJ. La première feuille Excel est utilisée ; les dates Excel et les CSV entre guillemets sont reconnus.
- Historique séparé pour EuroDreams, EuroMillions, Loto et Keno. Import et actualisation fusionnent les dates ; un fichier plus court ne supprime pas les anciens tirages.
- IndexedDB conserve les historiques entre ouvertures. Une écriture doit réussir avant de remplacer les données affichées. Les anciens enregistrements du site sont reconnus.
- Actualisation à l’ouverture des jeux déjà importés, désactivable. Bouton d’actualisation du jeu affiché. Aucune tâche en arrière-plan.
- Archives officielles FDJ uniquement : téléchargement ZIP, lecture du CSV, validation du jeu, des numéros, dates et formules. Aucun tirage produit par IA et aucun crédit OpenRouter nécessaire.
- Android consulte la page historique pour retrouver le lien actuel ; le lien connu sert de repli si la page est indisponible. Le site utilise le lien connu, avec CORS autorisé par le serveur lors des vérifications du 7 octobre 2026.
- Les dates encore manquantes sont affichées, y compris à l’intérieur de l’historique. Les résultats du jour sont considérés attendus à partir du lendemain, heure de Paris. Les délais de publication FDJ peuvent laisser un retard visible.
- Mise à jour indisponible : historique antérieur conservé, erreur affichée. La disponibilité permanente des serveurs et liens externes ne peut pas être garantie.
- Sauvegarde JSON exportable et réimportable, sans clé API. Fusion transactionnelle, rejet des conflits entre fichiers personnels. Les résultats officiels peuvent corriger les résultats déjà présents à une date donnée.
- Le lecteur Excel et ZIP est embarqué : imports et analyses disponibles sans connexion.
- Questions facultatives via OpenRouter : le résumé de session est envoyé au fournisseur sélectionné. La clé est locale, absente de l’APK et des sauvegardes.

Les statistiques descriptives et les grilles ne prédisent pas les tirages. La validation du moteur sur les quatre archives n’est pas un audit exhaustif des hypothèses du modèle de marché.

## Construire

Java 17, SDK Android 35 / Build Tools 35.0.0, Gradle 8.11.1 :

```sh
python3 lottery-metrics-android/prepare.py
gradle -p lottery-metrics-android assembleRelease
```

Le script embarque les dépendances dont les versions et SHA-256 figurent dans `dependencies.json`. Signer l’APK avec `apksigner`, en conservant la clé hors du dépôt. Garder le même identifiant et la même clé pour les mises à jour et augmenter `versionCode`.

APK, clé privée, historiques personnels et fichiers compilés ne sont pas publiés dans le dépôt.
Une désinstallation efface les données : exporter une sauvegarde avant.

## Sources et vérifications

FDJ, pages consultées le 7 octobre 2026 :
- https://www.fdj.fr/jeux-de-tirage/loto/historique
- https://www.fdj.fr/jeux-de-tirage/euromillions-my-million/historique
- https://www.fdj.fr/jeux-de-tirage/eurodreams/historique
- https://www.fdj.fr/jeux-de-tirage/keno/historique

Tests : `tests/lottery-metrics.cjs` (parsing, dates, analyse, grilles, fusion) et `tests/lottery-mobile.cjs` (réouverture, mise à jour sans doublons, panne réseau, quota, sauvegarde/restauration, dates Excel et largeur mobile). Les tests navigateur simulent le pont Android et ne remplacent pas un essai sur téléphone.

Pour les fixtures officielles : `python3 tests/lottery-download-fixtures.py`, puis préparer les assets et lancer les deux scripts avec Node.js. Playwright est nécessaire au test mobile ; définir `CHROME_EXECUTABLE` si Chromium n’est pas installé à son emplacement par défaut.
