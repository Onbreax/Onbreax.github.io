# Rapport d’audit Polylog AI

Dans le menu **Exporter → Rapport d’audit**, télécharger le JSON après le débat. La collecte commence automatiquement sur les nouveaux appels, sans demande additionnelle aux modèles ni changement des prompts. L’export pendant une exécution est un instantané partiel.

Le rapport contient les options par appel, le modèle demandé et celui déclaré dans la réponse, le rôle, la position dans le débat, les tentatives, leurs motifs de reprise, durées, volumes, tokens d’entrée/sortie/cache/réflexion et coûts USD déclarés par l’API. Les sommes indiquent combien de tentatives ont fourni chaque mesure. `null` signifie non renseigné ; zéro n’est utilisé que lorsque rapporté. Les coûts inconnus après interruption ne sont jamais inventés. Les frais de recharge et taxes ne sont pas inclus. La ventilation historique de l’interface reste distincte de ces mesures déclarées.

Le ratio de cache utilise uniquement les tentatives où entrée et lecture du cache sont toutes deux renseignées. Les tokens de réflexion et de cache sont des sous-catégories. Les écritures du cache peuvent avoir un coût ; ce rapport ne prétend pas calculer une économie théorique.

`duplicateOfCall` repère une requête identique observée dans la même session, en comparant localement une empreinte SHA-256 du corps et du fournisseur, hors clés. Une répétition peut être intentionnelle. Les empreintes ne sont pas exportées. Les basculements internes à OpenRouter restent hors de portée : seuls les appels HTTP de l’application sont comptés. La reformulation préalable de la question est exclue du débat. Les requêtes aux sources documentaires gratuites ne sont pas des appels LLM et ne sont pas suivies ici.

Questions, réponses, instructions libres, noms de fichiers, pièces jointes et clés ne figurent pas dans l’export. Le JSON n’est jamais envoyé automatiquement. L’historique et la sauvegarde portable conservent les mesures. Les anciens débats sans audit restent lisibles mais ne peuvent pas être mesurés rétroactivement.

Tests : `node tests/polylog-audit.cjs`, `node tests/polylog-ai.cjs` et, après `python3 polylog-ai-android/prepare.py`, `node tests/polylog-ai-android.cjs`. Playwright et Chromium nécessaires ; `CHROME_EXECUTABLE` permet de préciser le navigateur. Aucun appel payant n’est utilisé par ces tests.

## Cache — version 1.0.4

- Session OpenRouter stable par débat, rôle et intervenant ; le modèle reste celui choisi. Aucun texte supprimé, résumé ou compressé. Les recherches web restent identiques.
- Claude : cache de cinq minutes par défaut, une heure uniquement pour la réflexion explicitement poussée. La recherche web seule ne déclenche plus la durée longue.
- GPT 5.6 et versions suivantes : repères explicites sur les blocs déjà identifiés comme réutilisables, sans désactiver le cache automatique. En cas de refus HTTP 400, reprise sans repères et mémorisation du refus pour ce modèle pendant la session.
- Gemini : cache implicite conservé, session stabilisée. L'absence de lectures en cache dans l'audit précédent ne permet pas de conclure à une cause unique ; aucune économie n'est garantie.
- L'audit ajoute la stratégie de cache, sa durée demandée, la présence d'une session stable et la taille du préfixe textuel commun au précédent appel du même modèle/rôle/intervenant. Cette dernière mesure est en caractères JSON et exclut les ajouts web en amont ; elle ne remplace pas les tokens facturés. Aucun texte n'est exporté.
- L'ordre du jour conserve son modèle et sa réflexion par défaut. Sa limite de sortie passe de 1 500 à 6 000 tokens lorsque l'effort est laissé par défaut. Une réponse tronquée ou moins de quatre points est signalée, jamais présentée comme un ordre du jour complet. Cela peut augmenter le coût de cette étape ; ce correctif concerne sa complétude.

Vérification dédiée : `node tests/polylog-cache.cjs`. Référence technique consultée le 9 octobre 2026 : https://openrouter.ai/docs/guides/best-practices/prompt-caching
