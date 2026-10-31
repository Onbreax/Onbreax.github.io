# Lottery Metrics Android

Version 1.2.0 personnelle (`versionCode 3`), Android 8 minimum (API 26), cible Android 15 (API 35).
Identifiant : `fr.onbreax.lotterymetrics`. Source partagée : `../lottery-metrics.html`.

## Nouveautés 1.2.0

- Bouton Actualiser en haut à droite, même opération que le bouton détaillé du jeu affiché ; état et erreurs visibles en haut.
- Historique des quatre grilles proposées, par jeu/date/lot, avec comparaison au résultat, gains indicatifs et solde après mise. Les anciennes dates sans propositions enregistrées sont explicitement indisponibles.
- Options Keno enregistrées avec le lot (mise, Multiplicateur). Rentes EuroDreams séparées du paiement immédiat. Codes Loto/My Million et options non calculables à partir des seuls numéros exclus du bilan historique.
- Corrections des jackpots Loto partagés, de My Million dans le modèle de retour, des ventilations par rang, des tranches et des compteurs d'absence. Comparaisons financières reformulées comme estimations.
- Migration IndexedDB v1 → v2, ancien magasin de résultats conservé. Les sauvegardes JSON v2 contiennent aussi les propositions ; les anciennes sauvegardes v1 restent importables.

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

Le moteur partagé 1.1.0 (11 octobre 2026) corrige le backtest chronologique, normalise le bonus de paires, étend la recherche par échanges locaux et désactive la popularité au Keno. Les p-values du backtest utilisent une convolution hypergéométrique exacte et Holm. Les explications et limites figurent dans [`../lottery-metrics-statistics.md`](../lottery-metrics-statistics.md).

L’APK 1.2.0 intègre ce moteur 1.2.0 dans ses assets locaux. Pour cette livraison, le composant Android compilé de l’APK 1.1.0 est conservé, avec ses ressources et dépendances ; seuls le moteur HTML et le numéro de version du manifeste sont remplacés, puis le paquet est réaligné et signé à nouveau. Le certificat de signature, l’identifiant et l’origine WebView sont identiques à ceux de la version 1.0.0. La base IndexedDB conserve le même nom ; la migration v2 crée seulement le magasin des propositions. Installer la mise à jour par-dessus l’application existante.

Pour une reconstruction complète depuis les sources, régénérer les assets avec le script ci-dessous ; un changement du fichier HTML sur GitHub ne met pas à jour une APK installée.

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

`node tests/lottery-statistics.cjs` vérifie les corrections statistiques : absence de fuite depuis les tirages futurs, recherche locale sur tous les numéros, diversité, sept tailles Keno, p-values exactes et correction des comparaisons multiples.

Livraison Android 1.2.0 : signature v2/v3 vérifiée, certificat comparé à l’APK 1.1.0, manifeste et alignement vérifiés, assets comparés au moteur 1.2.0 et aux dépendances avec SHA-256. Tous les autres fichiers compilés de l’APK initiale sont inchangés. Ces vérifications ne remplacent pas un essai d’installation et d’utilisation sur téléphone, non réalisé dans cet environnement.

Pour les fixtures officielles : `python3 tests/lottery-download-fixtures.py`, puis préparer les assets et lancer les deux scripts avec Node.js. Playwright est nécessaire au test mobile ; définir `CHROME_EXECUTABLE` si Chromium n’est pas installé à son emplacement par défaut.

Le paquet livré est préparé par `repack.py BASE.apk UNSIGNED.apk`, puis aligné et signé avec la même clé hors dépôt. Ce script vérifie que les fichiers compilés autres que le manifeste et les assets restent identiques ; il refuse une modification de longueur du nom de version, qui nécessite une reconstruction Android complète. Les clés et mots de passe ne sont jamais intégrés aux sources ou à l’APK.

Tests supplémentaires : `node tests/lottery-history.cjs` et `node tests/lottery-history-mobile.cjs`. `FDJ_FIXTURES` peut désigner le répertoire des quatre CSV publics. Méthodes, limites et sources : [`../lottery-metrics-statistics.md`](../lottery-metrics-statistics.md).
