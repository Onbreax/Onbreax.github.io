# Rapport d’audit Polylog AI

Dans le menu **Exporter → Rapport d’audit**, télécharger le JSON après le débat. La collecte commence automatiquement sur les nouveaux appels, sans demande additionnelle aux modèles ni changement des prompts. L’export pendant une exécution est un instantané partiel.

Le rapport contient les options par appel, le modèle demandé et celui déclaré dans la réponse, le rôle, la position dans le débat, les tentatives, leurs motifs de reprise, durées, volumes, tokens d’entrée/sortie/cache/réflexion et coûts USD déclarés par l’API. Les sommes indiquent combien de tentatives ont fourni chaque mesure. `null` signifie non renseigné ; zéro n’est utilisé que lorsque rapporté. Les coûts inconnus après interruption ne sont jamais inventés. Les frais de recharge et taxes ne sont pas inclus. La ventilation historique de l’interface reste distincte de ces mesures déclarées.

Le ratio de cache utilise uniquement les tentatives où entrée et lecture du cache sont toutes deux renseignées. Les tokens de réflexion et de cache sont des sous-catégories. Les écritures du cache peuvent avoir un coût ; ce rapport ne prétend pas calculer une économie théorique.

`duplicateOfCall` repère une requête identique observée dans la même session, en comparant localement une empreinte SHA-256 du corps et du fournisseur, hors clés. Une répétition peut être intentionnelle. Les empreintes ne sont pas exportées. Les basculements internes à OpenRouter restent hors de portée : seuls les appels HTTP de l’application sont comptés. La reformulation préalable de la question est exclue du débat. Les requêtes aux sources documentaires gratuites ne sont pas des appels LLM et ne sont pas suivies ici.

Questions, réponses, instructions libres, noms de fichiers, pièces jointes et clés ne figurent pas dans l’export. Le JSON n’est jamais envoyé automatiquement. L’historique et la sauvegarde portable conservent les mesures. Les anciens débats sans audit restent lisibles mais ne peuvent pas être mesurés rétroactivement.

Tests : `node tests/polylog-audit.cjs`, `node tests/polylog-ai.cjs` et, après `python3 polylog-ai-android/prepare.py`, `node tests/polylog-ai-android.cjs`. Playwright et Chromium nécessaires ; `CHROME_EXECUTABLE` permet de préciser le navigateur. Aucun appel payant n’est utilisé par ces tests.
