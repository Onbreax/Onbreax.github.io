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
