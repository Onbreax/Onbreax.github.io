# Mon anglais 1.1.0

Application personnelle pour réviser l'anglais une heure par jour, à l'écrit comme à l'oral, à partir d'un bilan de niveau sur les 4 compétences. Page HTML autonome : `mon-anglais.html` (https://onbreax.github.io/mon-anglais.html).

## Démarrer

1. Ouvrir **Réglages** et choisir le mode d'IA :
   - **OpenRouter** : coller sa clé (openrouter.ai/keys), garder le modèle économique proposé et fixer un budget mensuel (3 $ par défaut). « Voir le prix » affiche le tarif réel du modèle et une estimation pour 1 h par jour.
   - **Abonnement ChatGPT ou Claude** : aucune clé. L'app prépare la consigne, on la colle dans ChatGPT ou Claude, puis on recolle la réponse dans l'app.
2. Faire le **bilan de niveau** (environ 1 h 15, interruptible entre les étapes) :
   1. **EF SET** (efset.org, gratuit, ~50 min) pour la compréhension écrite et orale : saisir les deux scores sur 100. Barème appliqué : 1-30 A1, 31-40 A2, 41-50 B1, 51-60 B2, 61-70 C1, 71-100 C2.
   2. **Grammaire et vocabulaire** : 30 questions adaptatives réservées au bilan (A2 à C1). Résultat indicatif : ces questions ne sont pas calibrées sur de vrais candidats.
   3. **Écrit** : rédaction de 180 à 250 mots, notée par l'IA selon les critères du CECRL (consigne, cohérence, richesse, correction).
   4. **Oral** : 6 questions au micro sur le modèle de l'IELTS (questions courtes, exposé de 2 minutes avec 1 minute de préparation, discussion). La transcription vient de la reconnaissance vocale du navigateur : la prononciation n'est pas évaluée.
3. Suivre le **plan du jour** : vocabulaire, grammaire, dictées, écrit, oral. Les minutes se répartissent selon les compétences les plus faibles du bilan. Refaire le bilan chaque mois.

## Modules

- **Vocabulaire** : 122 mots et expressions B1-C1 (faux amis, verbes à particule, connecteurs), plus les mots ajoutés depuis les corrections. Répétition espacée FSRS-4.5 (paramètres par défaut, rétention visée 90 %). Raccourcis : Espace pour retourner, 1 à 4 pour noter.
- **Grammaire** : 51 questions sur 10 thèmes, avec la règle expliquée en français. En mode OpenRouter, « +8 avec l'IA » crée de nouvelles questions sur un thème.
- **Écoute** : dictées lues par une voix anglaise du navigateur, comparées mot à mot.
- **Écrit** : sujet du jour ou sujet libre ; correction détaillée, version améliorée, vocabulaire à ajouter aux cartes.
- **Oral** : 12 jeux de rôle (entretien, restaurant, médecin, réunion…). Le partenaire IA répond à voix haute ; le bilan de fin liste les erreurs et la formulation naturelle. En mode abonnement, la consigne est prévue pour le mode vocal de ChatGPT : dire « feedback please » à la fin, puis coller la réponse dans l'app.

## Discussion en direct

Conversation libre à voix haute, comme au téléphone, avec Emma (accent britannique) ou Jake (accent américain, selon l'accent choisi dans Réglages). Accès : « Parler maintenant » sur l'écran du jour, Pratiquer ou Oral.

- Pas de bouton à presser : l'app écoute, envoie après un silence (1,5 s par défaut, réglable de 1 à 4 s), lit la réponse phrase par phrase dès qu'elle arrive, puis réécoute.
- Toucher le cercle : répondre tout de suite pendant l'écoute, couper la parole pendant la réponse, reprendre après une pause. « Répète plus simplement » demande une reformulation plus facile ; « Masquer le texte » entraîne la compréhension orale.
- Le partenaire parle un peu au-dessus du niveau mesuré à l'oral, reste en anglais et ne corrige pas pendant la discussion. Le micro est coupé pendant qu'il parle pour éviter l'écho ; des écouteurs avec micro restent conseillés.
- En fin de discussion (3 réponses minimum) : bilan détaillé et mise à jour de ce que le partenaire retient de toi (prénom, travail, centres d'intérêt), réutilisé aux discussions suivantes et effaçable.
- L'écran reste allumé pendant la discussion quand le navigateur le permet.
- Nécessite le mode OpenRouter. En mode abonnement, l'app fournit la consigne équivalente pour le mode vocal de ChatGPT, mémoire comprise.

Les erreurs relevées à l'écrit et à l'oral sont classées (temps, articles, prépositions…) et orientent le point de grammaire et les conversations des jours suivants.

## Coût

Le vocabulaire, la grammaire intégrée, les dictées et le suivi n'utilisent pas d'IA. L'IA ne sert qu'à l'écrit, à l'oral et aux questions générées. L'app enregistre le coût réel renvoyé par OpenRouter et bloque les appels une fois le budget mensuel atteint, avec un passage au copier-coller. Conseil : fixer aussi une limite de crédits sur la clé OpenRouter.

## Navigateurs

Chrome ou Edge (ordinateur ou Android) pour l'oral : la reconnaissance vocale n'existe pas dans Firefox. Sans micro, les réponses orales peuvent être tapées, mais l'évaluation est moins représentative. La qualité de la voix dépend des voix anglaises installées sur l'appareil (choix dans Réglages).

## Données

Tout reste dans le stockage local du navigateur : progression, cartes, erreurs et clé OpenRouter. Les textes et transcriptions sont envoyés à OpenRouter seulement pour les corrections et les conversations. La sauvegarde exportée (Réglages) exclut la clé. Effacer les données du navigateur efface la progression : exporter régulièrement.

## Développement et vérifications

Sources dans `mon-anglais/web/` : `content.js` (questions, mots, dictées, sujets, scénarios), `core.js` (niveaux, FSRS, test adaptatif, plan, consignes pour l'IA), `ui.js` (interface), `style.css`, `template.html`. Générer le HTML avec `python3 mon-anglais/build-web.py` depuis la racine du dépôt.

Tests :

- `node tests/mon-anglais-core.cjs` : consignes de la discussion en direct et découpage en phrases, contenu (identifiants, options), niveaux et barème EF SET, FSRS, file de vocabulaire, test adaptatif (candidats A1, B1, B2, C1), plan du jour, série, dictée, lecture des réponses de l'IA.
- `node tests/mon-anglais-ui.cjs` (Playwright et Chromium) : bilan complet, plan, vocabulaire, grammaire et questions générées, dictée, écrit, conversation et bilan oral, discussion en direct (réponse en continu lue par phrase, réécoute automatique, reformulation, mémoire), budget atteint, mode abonnement, export sans clé, échappement du texte de l'IA, affichage mobile à 390 px. OpenRouter, le micro et la voix sont simulés : aucun appel payant. Variables : `CHROME_EXECUTABLE`, `PLAYWRIGHT_MODULE`, `MON_ANGLAIS_SCREENSHOT_DIR`.

Non vérifié : les appels réels à OpenRouter (dont la réponse en continu), la reconnaissance vocale réelle sur Android, le délai de réponse réel et la calibration des niveaux sur de vrais apprenants.
