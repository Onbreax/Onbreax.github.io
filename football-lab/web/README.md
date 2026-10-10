# Version navigateur connectée

Le HTML téléchargé et GitHub Pages restent statiques. Football-data.org a répondu
le 9 octobre 2026 aux prérequêtes pour `null` et `https://onbreax.github.io` avec
`Access-Control-Allow-Origin: http://localhost` : ces origines sont bloquées.

La version privée hébergée utilise la même application avec une route serveur
`POST /api/football`. Elle accepte seulement FL1, PL, PD et une saison entière.
La clé arrive dans le corps de la requête HTTPS, puis dans l’en-tête `X-Auth-Token`
envoyé à Football-data.org. Elle n’est jamais placée dans l’URL, un fichier, une
base, le cache ou les journaux de l’application. Le code ne conserve aucun état
par utilisateur sur le serveur. Il exige une identité ChatGPT et une origine
identique, limite la taille des requêtes/réponses et interdit les redirections.
Le site conserve son accès privé, réservé au propriétaire.

Les données, les prévisions et les analyses restent dans le navigateur utilisé.
L’ancien fichier HTML, le site et l’APK ont des espaces locaux distincts : exporter
puis importer pour transférer les données et prévisions. Les clés restent limitées
à la session et doivent être renseignées dans chaque version.

Le checkout Sites enregistré utilise le starter Vinext et son intégration `sites()`.
Après `python3 football-lab/build.py`, préparer ce checkout avec :

```sh
python3 football-lab/web/prepare.py /chemin/du/checkout-sites
```

Le manifeste Sites et ses identifiants sont conservés dans son dépôt dédié ; aucune
information d’authentification Sites ne doit être ajoutée au dépôt public GitHub.
L’APK conserve son accès HTTPS natif et n’utilise pas le relais.

Version 1.4 ajoute un relais privé `/api/odds` vers The Odds API. La clé
est transmise par POST depuis la session du propriétaire, ne reste qu’en
mémoire de requête et n’est ni enregistrée ni journalisée. Le serveur fixe
les trois championnats, la région Europe, les marchés autorisés et les bornes
des requêtes/réponses ; il refuse les origines tierces et les redirections.
Les requêtes de cotes restent manuelles ; aucun endpoint historique payant
n’est appelé. Le fournisseur communique les crédits utilisés/restants.
