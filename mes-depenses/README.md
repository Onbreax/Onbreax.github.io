# Mes dépenses 1.1.0

Application personnelle Android et HTML de suivi des dépenses et des avoirs. Périmètre : La Banque Postale, Revolut, BoursoBank, Crypto.com, Esalia et Fédéral Finance. Aucun appel à un modèle d’IA, aucune fonction de paiement ni de négociation.


## Nouveautés 1.1.0

- **Mon mois** : budget global et limites par catégorie, propres au mois sélectionné. Pas de report automatique. Les dépenses nettes sont plafonnées à zéro pour mesurer la consommation du budget ; les remboursements restent détaillés dans les dépenses.
- **Mes avoirs** : dernier solde comptable connu des comptes courants, cryptoactifs et épargne salariale. Chaque valeur porte sa date et sa source. Les valeurs manquantes ne deviennent jamais zéro. Une valeur de plus de 30 jours est signalée. Les crédits ne sont pas intégrés : ce total n’est pas un patrimoine net.
- **Historique** par compte : une valorisation par date, détail des supports, correction et suppression explicite. Les variations comprennent les apports/retraits ; aucune performance financière n’est déduite.
- **Actualiser** en haut : banques connectées et Crypto.com. Une connexion en échec n’empêche pas les suivantes et ne remplace pas les dernières données du fournisseur en erreur.
- Migration du schéma local 1 vers 2 à l’ouverture, conservation des opérations existantes et du coffre chiffré. Les sauvegardes incluent les valorisations et les budgets, sans clés Enable Banking/Crypto.com ni autorisations bancaires.

## Crypto.com App

Dans **Mes avoirs**, ajouter Crypto.com puis ouvrir **Connexion Crypto.com**. Utiliser les clés **App / Agent Key**, pas les clés Exchange. Dans Crypto.com App, ouvrir **Plus > Agent Key**, désactiver **Execute trades**, puis saisir la clé API et la clé secrète uniquement dans Mes dépenses. Configurer la devise d’affichage EUR dans Crypto.com.

Le client utilise le protocole HMAC-SHA256 publié par Crypto.com et ne demande que `/v1/portfolio`. Les couches JavaScript, Android et serveur local n’autorisent que les trois lectures de soldes `/v1/portfolio`, `/v1/crypto-account`, `/v1/fiat-account`. Aucun endpoint d’achat, vente, transfert, retrait ou révocation n’est autorisé. La clé secrète reste dans le coffre local ; seul l’en-tête signé part vers le fournisseur. Les clés doivent être renseignées de nouveau après restauration d’une sauvegarde.

Les valorisations des produits publiées par l’API sont additionnées une seule fois, sans ajouter en plus les sous-portefeuilles. Une devise native autre que EUR, une réponse incomplète ou un refus d’accès conserve la dernière valorisation. Les centimes sont arrondis par produit à partir des décimales reçues. La disponibilité des fonds n’est pas déduite du montant du portefeuille. Ce connecteur ne récupère pas les dépenses de carte et ne garantit pas un périmètre plus large que celui fourni par l’API. Tests avec réponses simulées : activation et connexion réelle restent à valider sur l’appareil.

## Esalia, Fédéral Finance et relevés de valorisation

Aucune connexion automatique à ces deux espaces n’est intégrée : aucune API publique adaptée n’a été identifiée dans les sources consultées. Depuis **Mes avoirs**, ajouter le compte, puis saisir son total en euros à la date du relevé. Le montant disponible est facultatif : champ vide = inconnu, zéro = aucun montant déclaré disponible. Un PEE et un PER peuvent être saisis comme deux comptes distincts sans saisir également leur total agrégé.

L’import **CSV de valorisations** est un format générique avec association des colonnes, pas un parseur garanti des relevés natifs Esalia/Fédéral Finance. Colonnes : Date, Support, Valeur EUR, Disponible EUR (facultatif), Devise (facultatif). Le fichier doit couvrir tout le compte pour chaque date, sans ajouter une ligne de total aux supports. Les totaux et dates à remplacer sont affichés avant enregistrement. Les autres dates sont conservées. Un fichier partiellement invalide est refusé en entier.

Un historique de transactions Crypto.com n’est pas une valorisation : il ne permet pas à lui seul de connaître le solde actuel du portefeuille. Les relevés PDF ne sont pas importés ; leur total peut être recopié dans le formulaire daté. Le modèle CSV fourni ne contient aucune donnée personnelle ni valeur inventée.

## Sources techniques consultées le 31 octobre 2026

- Crypto.com, « API Key Management », 27 février 2026 : https://help.crypto.com/en/articles/13843786-api-key-management
- Crypto.com, « Getting Started », 17 mars 2026 : https://help.crypto.com/en/articles/13843782-getting-started
- Crypto.com, code officiel de signature et de lecture des soldes : https://github.com/crypto-com/crypto-agent-trading/tree/main/crypto-com-app/scripts
- Société Générale, « Des nouveautés sur vos espaces digitaux Esalia », 24 février 2026 : https://epargne-entreprise.societegenerale.com/fr/salarie/actualites/details/news/des-nouveautes-vos-espaces-digitaux-esalia-1/
- Fédéral Finance, « Espace privé », date de publication non indiquée : https://www.federal-finance.fr/jcms/int_6708/en/espace-prive
- Enable Banking, activation des comptes personnels : https://enablebanking.com/docs/api/linked-accounts/

## Démarrer

1. Créer un espace avec un mot de passe d’au moins 10 caractères. Ce mot de passe protège les données locales ; il n’est pas récupérable par l’application.
2. Pour découvrir l’interface, utiliser la démonstration. Ses opérations et comptes sont fictifs, en mémoire uniquement.
3. Ajouter ses comptes et importer des opérations CSV/TSV, ou configurer Enable Banking.
4. Observer un mois, consulter les catégories et ouvrir une opération pour corriger son classement.

### Android

Installer l’APK signé Mes-Depenses-1.1.0.apk. Android 8.0 ou ultérieur est requis. L’application a sa propre identité `fr.onbreax.mesdepenses` et conserve les données dans son espace local chiffré. Elle n’a besoin que de l’accès Internet pour les connexions bancaires. Les captures d’écran et l’aperçu dans les applications récentes sont protégés par Android.

### Ordinateur / HTML

Le fichier `mes-depenses.html` est autonome pour la démonstration, les imports et les analyses. La disponibilité du stockage local et du chiffrement dépend du navigateur ; utiliser la version hébergée en HTTPS ou le lanceur local si l’ouverture directe du fichier est limitée.

Pour connecter des banques sur ordinateur, installer Python 3 puis lancer `Lancer-Windows.cmd`. Sur macOS/Linux, exécuter `python3 server.py` dans le dossier contenant le HTML et le serveur. Ouvrir `http://127.0.0.1:8765`. Garder le terminal ouvert pendant les synchronisations.

Le lanceur s’écoute uniquement sur l’ordinateur local. Il transmet les requêtes autorisées vers Enable Banking et les lectures de soldes Crypto.com App sans enregistrer les clés ni les opérations. Un hébergement HTML public seul ne fournit pas ce relais : les connexions bancaires y sont désactivées. Les espaces locaux Android, navigateur HTTPS et navigateur local sont distincts ; une sauvegarde permet de transférer les opérations.

## Connecter Enable Banking

La connexion réelle n’est pas préconfigurée. Les tests de cette version utilisent des réponses simulées ; l’accès aux trois banques et la profondeur d’historique devront être vérifiés avec les comptes personnels.

1. Dans le panneau Enable Banking, créer une application **Production** puis l’activer en liant chacun de ses propres comptes bancaires. Vérifier les conditions du service : l’accès gratuit concerne les comptes personnels liés pour un usage non commercial, avec les limites du fournisseur.
2. Enregistrer exactement cette URL de retour : `https://onbreax.github.io/mes-depenses-retour.html`.
3. Dans Mes dépenses > Réglages, saisir l’identifiant d’application et importer la clé privée RSA PKCS8 `.pem` produite par Enable Banking. Ne pas publier ni partager cette clé.
4. Cliquer « Enregistrer et vérifier », puis « Choisir une banque ». Les identifiants bancaires sont saisis uniquement dans le parcours de la banque.
5. Au retour, ouvrir l’application Android. Sur ordinateur, copier le lien de retour et le coller dans « Terminer avec le lien de retour ». Si Android conserve la page dans le navigateur, son bouton « Ouvrir l’application Android » offre le même retour.
6. Choisir les comptes courants EUR. Si le même compte a déjà été importé par fichier, l’associer au compte existant. Une carte avec son propre relevé n’est pas sélectionnée pour éviter le doublon achats/règlement à débit différé.

La première actualisation réussie fait passer le compte sur la source bancaire. Une erreur conserve la source précédente. Les autorisations peuvent expirer et nécessiter une reconnexion. L’application actualise à la demande, pas en arrière-plan lorsque son écran est fermé.

## Ce que les montants signifient

- **Dépenses nettes** : débits externes comptabilisés, diminués des remboursements d’achats identifiés ou confirmés. Les frais bancaires sont inclus.
- **Entrées externes** : crédits extérieurs aux comptes personnels, hors remboursements d’achats et transferts internes/d’épargne.
- **Virements internes** : transferts entre comptes personnels, conservés dans l’historique mais exclus des dépenses et des entrées externes, dans les deux sens. Les IBAN personnels permettent une identification ferme ; un simple rapprochement de montants n’est qu’une proposition à confirmer.
- **Épargne** : versements et retours présentés séparément. Un IBAN d’épargne peut servir de repère sans connexion ni bilan de patrimoine.
- **En attente, annulées, rejetées, autres devises** : conservées si disponibles, mais exclues du total EUR des opérations comptabilisées.

La date de comptabilisation est prioritaire ; la date de valeur ne sert qu’en l’absence de celle-ci. Les retraits d’espèces sont des sorties à classer, sans suivi d’un portefeuille espèces. Des frais inclus dans un transfert peuvent être isolés manuellement ; ne pas les ressaisir si une ligne de frais existe déjà.

Les catégories automatiques sont des règles explicables, modifiables opération par opération. Elles ne sont pas infaillibles. Les historiques bancaires incomplets, libellés ambigus et transferts dont l’autre compte n’est pas renseigné demandent une vérification.

## Importer, actualiser et sauvegarder

CSV/TSV seulement dans cette version. Pour un relevé Excel, l’enregistrer d’abord en CSV. Choisir le compte et associer les colonnes date, libellé, montant signé ou débit/crédit ; vérifier l’aperçu. Un fichier invalide est rejeté sans import partiel. Deux paiements identiques présents deux fois dans le relevé restent deux paiements.

Une seule source est comptée par compte, fichier ou API, afin d’éviter de sommer le même achat deux fois. Les données de l’autre source restent en archive. L’actualisation API remplace sa période seulement après réception de toutes les pages et conserve le reste de l’historique local. Elle demande le mois observé et les cinq précédents, jusqu’à aujourd’hui ; la banque peut fournir moins.

Exporter régulièrement une **sauvegarde chiffrée**. Elle contient les opérations, classements, budgets et valorisations, mais exclut les clés et autorisations : reconnecter les fournisseurs après restauration. Une restauration remplace l’espace local après validation explicite. L’export CSV des opérations est lisible et non chiffré.

Le mot de passe perdu, l’effacement des données de l’application ou du navigateur et la désinstallation peuvent rendre l’espace inaccessible. Le chiffrement au repos n’est pas une protection contre un appareil déjà compromis. L’espace se verrouille après cinq minutes d’inactivité et au retour si ce délai est dépassé.

## Développement et vérifications

Sources du moteur, du coffre, du client bancaire et de l’interface dans `mes-depenses/web/`. Générer le HTML avec `python3 mes-depenses/build-web.py` depuis la racine du dépôt. `mes-depenses-android/prepare.py` intègre ensuite exactement ce HTML à l’APK.

Construction Android : Android SDK 35 / build-tools 35.0.0 et Java 8 ou ultérieur. `build.sh` attend `ANDROID_HOME`, `DEPENSES_KEYSTORE` et `DEPENSES_PASSWORD_FILE`, avec l’alias de signature `matchwork`. Si javac est absent, fournir `DEPENSES_ECJ_JAR`. Les fichiers de signature sont privés et ne sont jamais inclus dans le dépôt ni la distribution.

Tests : `node tests/mes-depenses-core.cjs`, `node tests/mes-depenses-security.cjs`, `python3 tests/mes-depenses-server.py`. Le test d’interface `node tests/mes-depenses-ui.cjs` nécessite jsdom 26. Le test JVM `BankPolicyTest.java` vérifie la restriction du transport Android. `check-package.py` inspecte le manifeste compilé pour éviter les anciens modes de compatibilité Android.

Vérifications réalisées : calculs en centimes ; six directions de transferts entre les trois banques ; remboursements et épargne ; doublons et pagination ; sources isolées ; chiffrement et sauvegarde ; origine, état du retour bancaire et réponses tardives après verrouillage ; interface testée avec des données fictives. L’APK n’a pas encore été testé sur le téléphone de l’utilisateur et aucune banque réelle n’a été connectée pendant ces tests.

Documentation fournisseur : https://enablebanking.com/docs/api/quick-start/ ; https://enablebanking.com/docs/api/linked-accounts ; https://enablebanking.com/docs/api/reference/ ; https://enablebanking.com/terms/ .

Tests additionnels 1.1.0 : `node tests/mes-depenses-wealth.cjs`, `node tests/mes-depenses-wealth-mobile.cjs` (Playwright/Chromium), politique Java `BankPolicyTest.java` et relais Python. Le test mobile utilise uniquement des données fictives et des réponses Crypto.com simulées.
