package fr.onbreax.budget

import kotlinx.serialization.Serializable

/** Banque ou canal d'où vient une opération. */
@Serializable
enum class Banque(val nom: String) {
    BANQUE_POSTALE("La Banque Postale"),
    BOURSORAMA("Boursorama"),
    REVOLUT("Revolut"),
    GOOGLE_WALLET("Google Wallet"),
    PAYPAL("PayPal"),
    AUTRE("Autre"),
}

@Serializable
enum class Origine { NOTIFICATION, CSV, MANUEL }

/**
 * Une opération. [centimes] est négatif pour une dépense, positif pour une rentrée d'argent.
 */
@Serializable
data class Operation(
    val id: String,
    val date: Long,
    val centimes: Long,
    val libelle: String,
    val banque: Banque,
    val categorie: String,
    val origine: Origine,
)

/** Règle de l'utilisateur : tout libellé contenant [motCle] va dans [categorie]. */
@Serializable
data class Regle(val motCle: String, val categorie: String)

/** Notification contenant un montant, gardée pour aider à comprendre ce qui n'a pas été reconnu. */
@Serializable
data class NotificationVue(
    val date: Long,
    val appli: String,
    val texte: String,
    val retenue: Boolean,
)

@Serializable
data class Donnees(
    val operations: List<Operation> = emptyList(),
    val regles: List<Regle> = emptyList(),
    /** Applis ajoutées à la main par l'utilisateur, en plus des applis bancaires connues. */
    val applisEnPlus: List<String> = emptyList(),
    val journal: List<NotificationVue> = emptyList(),
)
