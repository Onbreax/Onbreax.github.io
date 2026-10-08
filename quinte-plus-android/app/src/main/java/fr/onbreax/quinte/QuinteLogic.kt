package fr.onbreax.quinte

import kotlinx.serialization.json.Json
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter

val PARIS: ZoneId = ZoneId.of("Europe/Paris")

private val json = Json { ignoreUnknownKeys = true }

/** Un cheval prêt à afficher. */
data class Cheval(
    val numero: Int,
    val nom: String,
    val jockey: String?,
    val cote: Double?,
    val partant: Boolean,
)

/** Tout ce que l'écran affiche. */
data class QuinteDuJour(
    val reunion: Int,
    val course: Int,
    val nomCourse: String,
    val hippodrome: String,
    val heure: String,
    val distance: Int?,
    val chevaux: List<Cheval>,
    val ticket: List<Cheval>,
)

object QuinteLogic {
    private const val BASE = "https://online.turfinfo.api.pmu.fr/rest/client/61/programme"
    private val dateApi = DateTimeFormatter.ofPattern("ddMMyyyy")
    private val heureFr = DateTimeFormatter.ofPattern("HH'h'mm")

    fun urlProgramme(date: LocalDate) = "$BASE/${date.format(dateApi)}"

    fun urlParticipants(date: LocalDate, reunion: Int, course: Int) =
        "$BASE/${date.format(dateApi)}/R$reunion/C$course/participants?specialisation=INTERNET"

    /** Trouve la course Quinté+ dans le programme du jour (null s'il n'y en a pas). */
    fun trouverQuinte(programmeJson: String): Pair<Reunion, Course>? {
        val programme = json.decodeFromString<ProgrammeResponse>(programmeJson).programme
        for (reunion in programme.reunions) {
            for (course in reunion.courses) {
                if (course.paris.any { it.typePari == "QUINTE_PLUS" || it.codePari == "QUINTE_PLUS" }) {
                    return reunion to course
                }
            }
        }
        return null
    }

    fun lireChevaux(participantsJson: String): List<Cheval> =
        json.decodeFromString<ParticipantsResponse>(participantsJson).participants
            .map {
                Cheval(
                    numero = it.numPmu,
                    nom = it.nom,
                    jockey = it.driver,
                    cote = it.dernierRapportDirect?.rapport ?: it.dernierRapportReference?.rapport,
                    partant = it.statut == null || it.statut == "PARTANT",
                )
            }
            .sortedBy { it.numero }

    /** Ticket des favoris : les 5 partants avec la plus petite cote, du plus joué au moins joué. */
    fun ticketFavoris(chevaux: List<Cheval>): List<Cheval> =
        chevaux.filter { it.partant && it.cote != null }
            .sortedBy { it.cote }
            .take(5)

    fun assembler(reunion: Reunion, course: Course, chevaux: List<Cheval>) = QuinteDuJour(
        reunion = course.numReunion,
        course = course.numOrdre,
        nomCourse = course.libelle,
        hippodrome = reunion.hippodrome?.libelleLong ?: reunion.hippodrome?.libelleCourt ?: "",
        heure = Instant.ofEpochMilli(course.heureDepart).atZone(PARIS).format(heureFr),
        distance = course.distance,
        chevaux = chevaux,
        ticket = ticketFavoris(chevaux),
    )
}
