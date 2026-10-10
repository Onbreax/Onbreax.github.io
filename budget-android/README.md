# Mon budget

Appli Android privée (Kotlin + Jetpack Compose) qui suit tes dépenses du mois sur La Banque Postale, Boursorama et Revolut,
classées par catégorie, avec la liste de tes abonnements.

## D'où viennent les opérations
- **En direct** : l'appli lit les notifications de paiement de tes applis bancaires (et de Google Wallet / PayPal).
  Il faut lui donner l'accès aux notifications, et activer les notifications de paiement par carte dans chaque appli bancaire.
- **Relevés CSV** : pour les prélèvements et l'historique, importe un export CSV de ta banque (Réglages → Importer un relevé).
  Une opération déjà vue par notification n'est pas comptée deux fois.
- **À la main** : bouton « + » sur l'écran du mois.

Les virements entre tes propres comptes (recharge Revolut, etc.) vont dans « Transferts entre comptes » et ne comptent pas comme dépense.
Touche une opération pour changer sa catégorie ; coche « Toujours » pour créer une règle.

## Confidentialité
Pas de permission Internet. Les données restent dans un fichier privé du téléphone. Aucun identifiant bancaire n'est demandé.
Pour une appli non bancaire, seul son nom est noté dans la liste de contrôle, jamais le contenu du message.

## Installer
À chaque modification de ce dossier, GitHub Actions compile l'APK (onglet **Actions**, artefact **mon-budget-apk**,
et sur `main` une release « Mon budget »). Installe `app-debug.apk` (autoriser les sources inconnues).

Sur Android 13 et plus, l'accès aux notifications d'une appli installée hors Play Store est « restreint » :
Infos de l'appli → menu ⋮ → **Autoriser les paramètres restreints**, puis active l'accès dans l'appli.
