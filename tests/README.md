# Tests AI Council

Tests de non-régression dans Chromium avec Playwright. Toutes les connexions externes sont bloquées ; les réponses des modèles sont simulées. Aucune clé réelle ni aucun appel payant.

Depuis la racine du dépôt, avec Node.js et le paquet `playwright` installés :

```sh
npx playwright install chromium
node tests/ai-council.cjs
```

`CHROME_EXECUTABLE` permet d’utiliser un Chromium déjà installé. `COUNCIL_SCREENSHOT` permet de choisir un chemin de capture de l’interface mobile.

Cas couverts : annulation puis conclusion, blocage du double lancement, sauvegarde des débats successifs, export/import sans clés API, fusion sans écrasement, rejet des liens et données invalides, retour aux réglages précédents si l’import échoue, récupération des écritures en attente si le stockage est plein, budget par rôle et réservations simultanées, débat complet et conclusion automatique, sauvegarde du brouillon courant.
