# Première Auto 1.0.0

Application personnelle Android et HTML pour comparer des annonces de voitures automatiques : plafond ajustable, rayon autour d’une commune, kilométrage maximal, cartes à faire défiler, favoris, notes et comparaison de trois voitures. Aucun compte, paiement ou clé d’IA nécessaire.

## Utilisation

1. Installer l’APK signé `Premiere-Auto-1.0.0.apk` (Android 8 ou ultérieur), ou ouvrir `premiere-auto.html` dans un navigateur récent.
2. Régler le budget, le rayon autour de sa ville et le kilométrage au compteur. Les correspondances changent immédiatement dans le relevé chargé.
3. « Garder » ou glisser la carte vers la droite ajoute la voiture aux favoris. « Passer » ou glisser vers la gauche l’écarte temporairement ; le dernier choix peut être annulé. Les voitures passées peuvent être réaffichées.
4. Dans Ma sélection, cocher deux ou trois voitures puis ouvrir Comparer. Les favoris restent visibles même si les nouveaux filtres les excluent.
5. Ouvrir la fiche pour retrouver la source originale, les incertitudes et ajouter une note personnelle. « Continuer sur La Centrale » ouvre les automatiques ; les autres critères doivent être appliqués sur le site.

## D’où viennent les voitures ?

La version initiale contient **six annonces réelles repérées dans les sources La Centrale**, avec leur lien d’origine et une date de consultation. Ce relevé est documentaire et limité : **ce n’est ni tout le marché, ni un flux en temps réel**. Une annonce peut avoir été modifiée ou vendue. Vérifier son prix et sa disponibilité auprès du vendeur.

« Actualiser le relevé publié » récupère le dernier fichier `premiere-auto-data.json` du projet. Cela ne lance aucune collecte automatique sur La Centrale. Si le fichier publié n’a pas changé, l’application indique que le même relevé reste le plus récent ; la date des annonces n’est pas remplacée par la date du téléchargement. Un échec conserve le relevé local. Un relevé de trois jours ou plus est signalé comme ancien.

La collecte automatique et la couverture plus large nécessitent un accès aux données adapté aux conditions du fournisseur. Cette version ne contourne aucun dispositif d’accès, n’aspire pas le site et ne copie pas ses photographies. Les cartes utilisent des illustrations génériques explicitement identifiées ; les photos sont dans l’annonce d’origine.

## Ce que les filtres garantissent et ce qui reste à vérifier

- Les résultats retiennent seulement les boîtes annoncées automatiques et les vendeurs identifiés comme professionnels de l’automobile, concessionnaires ou négociants. Les particuliers et agences représentant un particulier sont exclus lorsque ce statut est renseigné. Le vendeur signataire réel doit encore être confirmé.
- Les cinq places proviennent des fiches techniques de modèles. Certaines fiches sont indicatives d’une génération/version proche ; vérifier la carte grise de l’exemplaire avant achat.
- Le rayon est calculé à vol d’oiseau entre les centres des communes fournis par l’API publique française. Ce n’est pas une distance routière, ni la position exacte du vendeur. Une distance inconnue est exclue d’un rayon local.
- Les équipements signalés par l’annonce peuvent provenir de la sélection automatique du site. Ils sont marqués « signalé, à confirmer ». Un équipement inconnu ne passe pas un filtre où il est obligatoire ; inconnu ne signifie pas absent.
- « Masquer les sinistres ou expertises signalés » est activé au départ. L’absence d’un signal dans le relevé ne prouve pas l’absence de sinistre. Deux des annonces initiales comportent un signal et restent masquées avec ce réglage.
- Aucun score de fiabilité ou probabilité mécanique n’est inventé. Le tri est explicite : proximité, prix ou kilométrage. Factures, entretien moteur/boîte, rapport d’historique, garantie, assurance et essai restent à examiner.

## Vie privée et sauvegarde

Préférences, favoris et notes sont conservés localement. Ils ne sont pas chiffrés ; l’application n’est pas destinée à stocker des documents d’identité ou des coordonnées bancaires. Le code postal saisi lors d’une recherche de commune est envoyé à `geo.api.gouv.fr`. Aucune permission GPS n’est demandée.

Le téléchargement du relevé utilise le site du projet. Les liens des annonces ouvrent le navigateur et les services du vendeur. Aucune prise de contact ni réservation n’est déclenchée par l’application.

Exporter sa sélection depuis Réglages pour obtenir un fichier JSON lisible. L’import d’une sélection remplace favoris, notes et critères après confirmation. L’import d’un relevé seul remplace le relevé, en conservant les favoris. Les fichiers invalides sont refusés sans import partiel. Android et les navigateurs ont des espaces séparés : un export/import permet de transférer la sélection. L’effacement du stockage ou la désinstallation peuvent supprimer les données locales.

## Sources du premier relevé

- Nissan Note II Acenta CVT, HARBOT AUTOMOBILES : https://www.lacentrale.fr/auto-occasion-annonce-69119809697.html
- Suzuki SX4 S-Cross 2014, GTR FRANCE : https://www.lacentrale.fr/auto-occasion-annonce-87103564467.html
- Opel Mokka X, COFIA : https://www.lacentrale.fr/auto-occasion-annonce-69120010429.html
- Suzuki SX4 S-Cross 2016, GARAGE SAINT PIERRE : https://www.lacentrale.fr/auto-occasion-annonce-69118675215.html
- Nissan Note II N-Connecta CVT, THOMAS AUTOMOBILES : https://www.lacentrale.fr/auto-occasion-annonce-69117426779.html
- Suzuki SX4 S-Cross 2014, CARPOLE OCCASIONS, page du stock : https://carpole-occasions-ile-de-france.espacevo.fr/cat-auto/marque-SUZUKI

Les liens techniques utiles sont enregistrés par véhicule dans le fichier de données. Documentation géographique : https://geo.api.gouv.fr/decoupage-administratif/communes . Conditions de La Centrale : https://www.lacentrale.fr/informations/mentions-legales .

## Développement

Sources web dans `premiere-auto/web/`. Générer le HTML autonome avec `python3 premiere-auto/build-web.py`. Le dossier Android intègre exactement ce HTML via `prepare.py`.

Tests : `node tests/premiere-auto-core.cjs` ; `NODE_PATH=/chemin/vers/node_modules node tests/premiere-auto-ui.cjs` avec jsdom 26 ; compiler puis exécuter `PublicPolicyTest.java` avec la classe `PublicPolicy.java`.

Construction native : SDK Android 35 et build-tools 35.0.0, Java, variables `ANDROID_HOME`, `AUTO_KEYSTORE`, `AUTO_PASSWORD_FILE`, éventuellement `AUTO_ECJ_JAR` si javac est absent. Alias du certificat : `matchwork`. Les clés privées ne sont jamais incluses dans les sources ni dans l’APK. Package distinct : `fr.onbreax.premiereauto`.

Le transport Android se limite à la lecture du relevé publié et à la recherche publique de communes par code postal. Il refuse les autres hôtes, chemins, redirections et paramètres. L’APK ne demande que la permission Internet. L’affichage est redimensionnable, sans restriction de ratio et avec des marges système gérées une seule fois.

Les tests couvrent les frontières des filtres, les vendeurs intermédiaires, les données inconnues, les favoris, le geste de balayage, le comparatif, les imports, la conservation hors ligne et les liens non autorisés. L’APK devra aussi être essayé sur le téléphone de l’utilisateur.
