# Lottery Metrics : moteur 1.2.0

Révision du 31 octobre 2026. Moteur partagé par `lottery-metrics.html` et les builds Android préparés avec `lottery-metrics-android/prepare.py`.

## Révision 1.2.0 du 31 octobre 2026

Cette révision conserve les corrections statistiques 1.1.0 décrites ci-dessous et ajoute :

- Jackpots Loto : `rapport rang 1 × nombre de gagnants` si le rang est gagné, sinon montant du rapport annoncé. Cas de régression : 16 février 2026, 2 × 1,5 M€ = 3 M€.
- EuroMillions–My Million : ajout d'un My Million ordinaire de 1 M€ à l'espérance. Le dénominateur est la participation **française estimée**, à partir des comptes français/européens. Une archive sans ces informations ne produit pas un retour complet. Les promotions ne sont pas extrapolées.
- Moyennes des rangs inférieurs : même ensemble de tirages complets pour le total et la ventilation par rang ; les rapports nuls avec zéro gagnant sont traités identiquement. Une moyenne historique n'est pas un rapport prévu pour le prochain tirage.
- Tranches : espérance `K × largeur réelle de la tranche / P`, notamment 9 numéros pour 41–49 et 6 pour 51–56.
- Absences : le compteur courant, les moyennes/maxima historiques et la référence `P/K − 1` comptent tous les tirages sans apparition. Les deux apparitions qui bornent un intervalle ne sont pas comptées comme des absences.
- EuroDreams : calcul nominal des deux plafonds ordinaires de 3 et 12 gagnants. La fonction de partage utilise une expression finie de l'espérance sous Poisson, sans troncature arbitraire à 12 co-gagnants. Les rentes sont exclues du classement comparatif des gains immédiats. Les promotions restent hors modèle.
- Formulations : scénarios conditionnels au modèle ; suppression des prescriptions de jeu et de la promesse qu'un seuil de jackpot plus élevé améliore toujours le rendement.

### Historique prospectif des quatre grilles

Les quatre propositions **affichées** pour un jeu sont enregistrées localement avec leur date de tirage cible, leurs numéros et secondaires, la date de génération, le moteur, les réglages, le dernier résultat connu et la taille de l'échantillon. Un ensemble identique n'est pas dupliqué. Les ensembles différents pour un même tirage restent disponibles dans un sélecteur de lots. Aucun ensemble n'est reconstruit après connaissance du résultat.

La date cible respecte le calendrier et l'heure limite de prise de jeu à Paris (20 h Keno ; 20 h 15 Loto, EuroMillions, EuroDreams). Une proposition après clôture vise le prochain jour de jeu. L'horloge utilisée est celle de l'appareil ; cet historique personnel n'est pas une preuve horodatée par un tiers. Les propositions doivent être sauvegardées avant l'application d'une nouvelle archive. Si l'écriture échoue, l'erreur est visible et l'actualisation ne remplace pas les résultats avant une sauvegarde réussie.

La base IndexedDB `grilles-lab` migre de v1 à v2 en conservant `archives` et ajoutant `proposals`. Export JSON v2 : résultats et propositions, sans clé OpenRouter. Import v1 toujours accepté ; import v2 validé et fusionné dans une transaction couvrant les deux magasins. Retirer une archive de résultats ne supprime pas ses propositions ; elles redeviennent consultables après réimport du jeu.

### Gains de l'historique

- **Loto / EuroMillions** : rang déterminé par les numéros et secondaires trouvés, puis rapport **par grille** de la date. Gain brut indicatif et solde après les quatre mises. Hors codes Loto/My Million et options ; ces codes sont attribués lors de l'achat, pas par le générateur. Les rapports ne sont pas recalculés en ajoutant quatre joueurs hypothétiques aux masses et aux co-gagnants.
- **EuroDreams** : rangs 3–6 aux rapports publiés ; rentes ordinaires 20 000 €/mois pendant 30 ans et 2 000 €/mois pendant 5 ans affichées séparément des gains immédiats. Dépassement du plafond : rapport en capital publié. Un rapport de rente exceptionnelle non interprétable reste « gain à confirmer », sans inventer de durée.
- **Keno** : barème cash FDJ applicable depuis le 3 novembre 2025, art. 8. Toutes les tailles 4–10, mises 1/2/3/5/10 €, et option Multiplicateur (mise doublée, coefficient du tirage). Gain à zéro numéro pour 8/9/10 traités. Hors plafonnement exceptionnel et jeux complémentaires. Le barème et les options sont conservés avec le lot.
- Résultat absent/ancien complément IA : en attente. Rang gagnant sans rapport exploitable : gain à confirmer, pas zéro. Aucun rang gagnant : zéro. Un résultat corrigé lors d'une actualisation recalcule le bilan des mêmes grilles enregistrées.

### Vérifications 1.2.0

Archives publiques téléchargées le 31 octobre 2026 : 1 093 Loto, 704 EuroMillions, 312 EuroDreams, 362 Keno (2 471 tirages). Suites : `lottery-metrics.cjs`, `lottery-statistics.cjs`, `lottery-history.cjs`, `lottery-mobile.cjs`, `lottery-history-mobile.cjs`.

Le nouveau test de calcul couvre les jackpots partagés, My Million et son périmètre français, la réconciliation des totaux, les absences, les tranches, les deux plafonds de rente contre une somme de Poisson indépendante, les dates/coupures été-hiver, les instantanés immuables, les rangs, les mises et multiplicateurs Keno, les rapports absents et les rentes. Les tests navigateur couvrent migration v1, quatre jeux, réouverture, lots successifs, actualisation, règlement des lots enregistrés, absence de reconstitution rétrospective, sauvegarde/restauration complète, rejet d'import corrompu, panne de stockage et affichages de 360 à 1 280 px. Les réponses réseau y sont simulées avec les fixtures publiques. Aucun essai d'installation sur téléphone physique n'est réalisé dans cet environnement.

Sources FDJ consultées le 31 octobre 2026 :
- Archives des quatre jeux : liens en fin de document.
- My Million : https://www.fdj.fr/jeux-de-tirage/euromillions-my-million/gains
- Barème Keno, applicable au 03/11/2025, article 8 : https://cdn-media.fdj.fr/static/contrib/files/pdf/reglement-keno-2025.pdf
- Keno, clôture à 20 h : https://www.fdj.fr/jeux-de-tirage/keno/comment-jouer
- EuroDreams, règlement 31/03/2025, articles 8.3.2–8.3.3 : https://cdn-media.fdj.fr/static/contrib/files/pdf/2025-03-reglement-eurodreams.pdf
- EuroDreams, clôture : https://www.fdj.fr/jeux-de-tirage/eurodreams/comment-jouer
- Loto et EuroMillions, horaires : https://api.fdj.fr/mag/questions/horaire-jeux-tirages

## Révision précédente 1.1.0

### Corrections 1.1.0

- Backtest chronologique : toutes les statistiques, dont la calibration de popularité, utilisent uniquement `rows.slice(0, t)`. La calibration sur l'archive complète a été supprimée du backtest.
- Paires : bonus de score égal à `0.05 × moyenne[(compte − Nq) / √(Nq(1−q))]`, avec `q = K(K−1)/(P(P−1))`. Les paires sont dépendantes ; cette moyenne est un critère descriptif, pas un test ni une probabilité.
- Recherche : énumération dans le pool initial, puis amélioration par échanges d'un numéro avec tous les numéros du jeu. Les retards forcés restent fixes. Au plus 50 améliorations, avec `localComplete` indiquant si aucun échange admissible ne peut améliorer le résultat. Aucune garantie d'optimum global ou d'avantage prédictif.
- Quatre sélections principales distinctes, y compris dans les replis ; les contraintes de profil peuvent être abandonnées au dernier repli, annoncé « profil non contraint ».
- Synthèse : comparaison lexicographique réelle (votes, puis score cumulé et bonus de paires). Un score secondaire, quelle que soit sa valeur, ne peut compenser un vote de moins.
- Keno : poids effectif de popularité nul, indépendamment du curseur global.
- Maximum des paires : queue binomiale par paire, puis borne de Bonferroni sur toutes les paires. La formule précédente supposait à tort des paires indépendantes et une approximation de Poisson. La dispersion descriptive a pour référence `1−q`.
- Backtest : distribution du total de bons numéros par convolution exacte de la loi hypergéométrique. P-value unilatérale `P(total ≥ observé)` ; p-value bilatérale conservative `min(1, 2 × min(queue basse, queue haute))` ; ajustement de Holm sur les quatre méthodes et le contrôle aléatoire. Le z reste descriptif. Les p-values ne sont pas des probabilités de gain futur.
- Un Ljung-Box non calculable (sommes constantes, retard supérieur à la longueur) reste non calculable ; il n'est plus affiché comme conforme.
- Les textes distinguent statistiques, heuristiques, estimations de popularité, hypothèses de marché et limites de validation.

## Hypothèses et limites

Les distributions théoriques supposent des tirages uniformes, indépendants et une même formule de jeu. Dans ces conditions, une sélection adaptée au seul passé conserve la loi hypergéométrique conditionnelle des bons numéros. Les p-values du backtest concernent ce nombre, sans mesurer les gains ni le partage.

Choisir les paramètres après observation de l'archive peut surajuster les résultats. La correction de Holm ne corrige pas l'exploration de multiples réglages ou périodes. Une validation prospective demande des paramètres fixés avant une période distincte.

La popularité est inférée à partir des gagnants par rang ; les combinaisons effectivement jouées ne sont pas disponibles. Son indice multiplicatif ne constitue pas une réduction mesurée du partage. Les estimations financières restent dépendantes de ce modèle, de jackpots parfois reconstruits et de rentes non actualisées ; tous les tirages exceptionnels et plafonds ne sont pas modélisés.

## Vérification reproductible

```sh
python3 tests/lottery-download-fixtures.py
node tests/lottery-metrics.cjs
node tests/lottery-statistics.cjs
node tests/lottery-history.cjs
python3 lottery-metrics-android/prepare.py
node tests/lottery-mobile.cjs
node tests/lottery-history-mobile.cjs
```

Les fixtures sont les archives FDJ téléchargées lors de la vérification, pas les historiques personnels de l'utilisateur. Le test statistique vérifie l'indépendance aux données futures par perturbation du suffixe, les remplacements locaux admissibles, la diversité des grilles, les sept tailles Keno, les queues binomiales, Holm et la convolution contre une énumération indépendante sur un petit jeu. Le test navigateur vérifie imports, stockage, mise à jour, sauvegardes, Excel, backtest et largeur mobile, sans clé API ni appel IA réel. Les tests navigateur ne remplacent pas un essai sur téléphone Android.

Vérification historique du 11 octobre (1.1.0) : tests du moteur et tests statistiques réussis sur 2 431 tirages publics (Loto 1 085, EuroMillions 698, EuroDreams 306, Keno 342), ainsi que les backtests par défaut des quatre jeux et la syntaxe du script complet. Soixante queues binomiales ont été comparées à SciPy, jusqu'à 50 000 tirages ; la convolution a été contrôlée sur sa masse, sa moyenne et sa variance, jusqu'à 1 000 évaluations. Le test de régression détecte la fuite temporelle dans la version précédente. Le test navigateur n'a pas pu être terminé : Chromium ne démarre pas dans l'environnement de cette vérification. Aucun APK n'est produit par cette révision.

## Références

- Genest, C., Lockhart, R. A., Stephens, M. A. (2002), « χ² and the lottery », *The Statistician*, 51(2), 243–257 : https://www.sfu.ca/~lockhart/Research/Papers/GenestLockhartStephensJRSSD02.pdf . Correction du χ² pour les tirages sans remise.
- FDJ, archives officielles utilisées pour les fixtures, consultées le 11 octobre 2026 :
  - https://www.fdj.fr/jeux-de-tirage/loto/historique
  - https://www.fdj.fr/jeux-de-tirage/euromillions-my-million/historique
  - https://www.fdj.fr/jeux-de-tirage/eurodreams/historique
  - https://www.fdj.fr/jeux-de-tirage/keno/historique
- FDJ, barème et conditions Keno, consultés le 11 octobre 2026 : https://www.fdj.fr/jeux-de-tirage/keno/gains .
- Valeurs de référence des queues binomiales vérifiées indépendamment avec `scipy.stats.binom.sf` (SciPy 1.17.0 dans l'environnement d'audit).
