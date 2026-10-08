package fr.onbreax.quinte

import kotlinx.serialization.Serializable

// Sous-ensemble des réponses JSON de l'API publique du PMU (turfinfo).

@Serializable
data class ProgrammeResponse(val programme: Programme)

@Serializable
data class Programme(val reunions: List<Reunion> = emptyList())

@Serializable
data class Reunion(
    val numOfficiel: Int = 0,
    val hippodrome: Hippodrome? = null,
    val courses: List<Course> = emptyList(),
)

@Serializable
data class Hippodrome(
    val libelleCourt: String? = null,
    val libelleLong: String? = null,
)

@Serializable
data class Course(
    val numReunion: Int,
    val numOrdre: Int,
    val heureDepart: Long,
    val libelle: String = "",
    val distance: Int? = null,
    val discipline: String? = null,
    val paris: List<Pari> = emptyList(),
    // Arrivée : une liste par place ; plusieurs numéros sur une place = ex æquo.
    val ordreArrivee: List<List<Int>> = emptyList(),
    val arriveeDefinitive: Boolean = false,
)

@Serializable
data class Pari(
    val typePari: String? = null,
    val codePari: String? = null,
)

@Serializable
data class ParticipantsResponse(val participants: List<Participant> = emptyList())

@Serializable
data class Participant(
    val numPmu: Int,
    val nom: String,
    val driver: String? = null,
    val entraineur: String? = null,
    val statut: String? = null,
    val dernierRapportDirect: Rapport? = null,
    val dernierRapportReference: Rapport? = null,
)

@Serializable
data class Rapport(
    val rapport: Double? = null,
    val favoris: Boolean = false,
)

/** Rapports définitifs d'une course : un élément par type de pari. */
@Serializable
data class RapportPari(
    val typePari: String? = null,
    val miseBase: Long? = null,
    val rapports: List<RapportLigne> = emptyList(),
)

@Serializable
data class RapportLigne(
    val libelle: String = "",
    val combinaison: String = "",
    // En centimes, pour la mise de base (2 € au Quinté+).
    val dividendePourUneMiseDeBase: Long? = null,
)
