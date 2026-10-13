# Mes dépenses 1.0.0

Application personnelle Android et HTML de suivi mensuel des dépenses de comptes courants. Banques visées : BoursoBank, Revolut et La Banque Postale. Aucun appel à un modèle d’IA, aucune fonction de paiement.

## Démarrer

1. Créer un espace avec un mot de passe d’au moins 10 caractères. Ce mot de passe protège les données locales ; il n’est pas récupérable par l’application.
2. Pour découvrir l’interface, utiliser la démonstration. Ses opérations et comptes sont fictifs, en mémoire uniquement.
3. Ajouter ses comptes et importer des opérations CSV/TSV, ou configurer Enable Banking.
4. Observer un mois, consulter les catégories et ouvrir une opération pour corriger son classement.

### Android

Installer l’APK signé Mes-Depenses-1.0.0.apk. Android 8.0 ou ultérieur est requis. L’application a sa propre identité `fr.onbreax.mesdepenses` et conserve les données dans son espace local chiffré. Elle n’a besoin que de l’accès Internet pour les connexions bancaires. Les captures d’écran et l’aperçu dans les applications récentes sont protégés par Android.

### Ordinateur / HTML

Le fichier `mes-depenses.html` est autonome pour la démonstration, les imports et les analyses. La disponibilité du stockage local et du chiffrement dépend du navigateur ; utiliser la version hébergée en HTTPS ou le lanceur local si l’ouverture directe du fichier est limitée.

Pour connecter des banques sur ordinateur, installer Python 3 puis lancer `Lancer-Windows.cmd`. Sur macOS/Linux, exécuter `python3 server.py` dans le dossier contenant le HTML et le serveur. Ouvrir `http://127.0.0.1:8765`. Garder le terminal ouvert pendant les synchronisations.

Le lanceur s’écoute uniquement sur l’ordinateur local. Il transmet les requêtes autorisées vers Enable Banking sans enregistrer la clé privée ni les opérations. Un hébergement HTML public seul ne fournit pas ce relais : les connexions bancaires y sont désactivées. Les espaces locaux Android, navigateur HTTPS et navigateur local sont distincts ; une sauvegarde permet de transférer les opérations.

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

Exporter régulièrement une **sauvegarde chiffrée**. Elle contient les opérations et classements, mais exclut la clé privée et les autorisations bancaires : reconnecter les banques après restauration. Une restauration remplace l’espace local après validation explicite. L’export CSV des opérations est lisible et non chiffré.

Le mot de passe perdu, l’effacement des données de l’application ou du navigateur et la désinstallation peuvent rendre l’espace inaccessible. Le chiffrement au repos n’est pas une protection contre un appareil déjà compromis. L’espace se verrouille après cinq minutes d’inactivité et au retour si ce délai est dépassé.

## Développement et vérifications

Sources du moteur, du coffre, du client bancaire et de l’interface dans `mes-depenses/web/`. Générer le HTML avec `python3 mes-depenses/build-web.py` depuis la racine du dépôt. `mes-depenses-android/prepare.py` intègre ensuite exactement ce HTML à l’APK.

Construction Android : Android SDK 35 / build-tools 35.0.0 et Java 8 ou ultérieur. `build.sh` attend `ANDROID_HOME`, `DEPENSES_KEYSTORE` et `DEPENSES_PASSWORD_FILE`, avec l’alias de signature `matchwork`. Si javac est absent, fournir `DEPENSES_ECJ_JAR`. Les fichiers de signature sont privés et ne sont jamais inclus dans le dépôt ni la distribution.

Tests : `node tests/mes-depenses-core.cjs`, `node tests/mes-depenses-security.cjs`, `python3 tests/mes-depenses-server.py`. Le test d’interface `node tests/mes-depenses-ui.cjs` nécessite jsdom 26. Le test JVM `BankPolicyTest.java` vérifie la restriction du transport Android. `check-package.py` inspecte le manifeste compilé pour éviter les anciens modes de compatibilité Android.

Vérifications réalisées : calculs en centimes ; six directions de transferts entre les trois banques ; remboursements et épargne ; doublons et pagination ; sources isolées ; chiffrement et sauvegarde ; origine, état du retour bancaire et réponses tardives après verrouillage ; interface testée avec des données fictives. L’APK n’a pas encore été testé sur le téléphone de l’utilisateur et aucune banque réelle n’a été connectée pendant ces tests.

Documentation fournisseur : https://enablebanking.com/docs/api/quick-start/ ; https://enablebanking.com/docs/api/linked-accounts ; https://enablebanking.com/docs/api/reference/ ; https://enablebanking.com/terms/ .
