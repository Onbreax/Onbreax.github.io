# Lottery Metrics : moteur 1.1.0

Révision du 11 octobre 2026. Moteur partagé par `lottery-metrics.html` et les builds Android préparés avec `lottery-metrics-android/prepare.py`.

## Corrections

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
python3 lottery-metrics-android/prepare.py
node tests/lottery-mobile.cjs
```

Les fixtures sont les archives FDJ téléchargées lors de la vérification, pas les historiques personnels de l'utilisateur. Le test statistique vérifie l'indépendance aux données futures par perturbation du suffixe, les remplacements locaux admissibles, la diversité des grilles, les sept tailles Keno, les queues binomiales, Holm et la convolution contre une énumération indépendante sur un petit jeu. Le test navigateur vérifie imports, stockage, mise à jour, sauvegardes, Excel, backtest et largeur mobile, sans clé API ni appel IA réel. Les tests navigateur ne remplacent pas un essai sur téléphone Android.

Vérification de cette révision : tests du moteur et tests statistiques réussis sur 2 431 tirages publics (Loto 1 085, EuroMillions 698, EuroDreams 306, Keno 342), ainsi que les backtests par défaut des quatre jeux et la syntaxe du script complet. Soixante queues binomiales ont été comparées à SciPy, jusqu'à 50 000 tirages ; la convolution a été contrôlée sur sa masse, sa moyenne et sa variance, jusqu'à 1 000 évaluations. Le test de régression détecte la fuite temporelle dans la version précédente. Le test navigateur n'a pas pu être terminé : Chromium ne démarre pas dans l'environnement de cette vérification. Aucun APK n'est produit par cette révision.

## Références

- Genest, C., Lockhart, R. A., Stephens, M. A. (2002), « χ² and the lottery », *The Statistician*, 51(2), 243–257 : https://www.sfu.ca/~lockhart/Research/Papers/GenestLockhartStephensJRSSD02.pdf . Correction du χ² pour les tirages sans remise.
- FDJ, archives officielles utilisées pour les fixtures, consultées le 11 octobre 2026 :
  - https://www.fdj.fr/jeux-de-tirage/loto/historique
  - https://www.fdj.fr/jeux-de-tirage/euromillions-my-million/historique
  - https://www.fdj.fr/jeux-de-tirage/eurodreams/historique
  - https://www.fdj.fr/jeux-de-tirage/keno/historique
- FDJ, barème et conditions Keno, consultés le 11 octobre 2026 : https://www.fdj.fr/jeux-de-tirage/keno/gains .
- Valeurs de référence des queues binomiales vérifiées indépendamment avec `scipy.stats.binom.sf` (SciPy 1.17.0 dans l'environnement d'audit).
