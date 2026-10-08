package fr.onbreax.quinte

import kotlinx.serialization.json.Json
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

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

/** Ce que rapporte le ticket : [montant] et [mise] en centimes ; [libelle] null si perdant. */
data class Gain(val libelle: String?, val montant: Long, val mise: Long)

/** Tout ce que l'écran affiche. */
data class QuinteDuJour(
    val date: String,
    val reunion: Int,
    val course: Int,
    val nomCourse: String,
    val hippodrome: String,
    val heure: String,
    val distance: Int?,
    val chevaux: List<Cheval>,
    val ticket: List<Cheval>,
    /** Vrai quand le ticket est celui enregistré avant le départ. */
    val ticketFige: Boolean,
    /** Vide tant que la course n'est pas courue. */
    val arrivee: List<List<Int>>,
    val arriveeDefinitive: Boolean,
    /** Null tant que les rapports ne sont pas publiés. */
    val gain: Gain?,
)

object QuinteLogic {
    private const val BASE = "https://online.turfinfo.api.pmu.fr/rest/client/61/programme"
    private val dateApi = DateTimeFormatter.ofPattern("ddMMyyyy")
    private val heureFr = DateTimeFormatter.ofPattern("HH'h'mm")
    private val dateFr = DateTimeFormatter.ofPattern("EEEE d MMMM yyyy", Locale.FRENCH)

    fun cleDate(date: LocalDate): String = date.format(dateApi)

    fun urlProgramme(date: LocalDate) = "$BASE/${date.format(dateApi)}"

    fun urlParticipants(date: LocalDate, reunion: Int, course: Int) =
        "$BASE/${date.format(dateApi)}/R$reunion/C$course/participants?specialisation=INTERNET"

    fun urlRapports(date: LocalDate, reunion: Int, course: Int) =
        "$BASE/${date.format(dateApi)}/R$reunion/C$course/rapports-definitifs?specialisation=INTERNET"

    fun dateEnFrancais(date: LocalDate): String =
        date.format(dateFr).replaceFirstChar { it.titlecase(Locale.FRENCH) }

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

    fun lireRapports(rapportsJson: String): List<RapportPari> =
        json.decodeFromString<List<RapportPari>>(rapportsJson)

    /** Ticket des favoris : les 5 partants avec la plus petite cote, du plus joué au moins joué. */
    fun ticketFavoris(chevaux: List<Cheval>): List<Cheval> =
        chevaux.filter { it.partant && it.cote != null }
            .sortedBy { it.cote }
            .take(5)

    /**
     * Ce que rapporte un ticket Quinté+ de 5 chevaux (dans l'ordre joué) pour la mise de base.
     * Le PMU paie une seule combinaison par ticket : on garde la mieux payée de celles gagnées.
     * Un « Ordre » demande l'ordre exact ; les autres (Désordre, Bonus) seulement les chevaux.
     * Null si les rapports du Quinté+ ne sont pas encore là.
     */
    fun gainTicket(ticket: List<Int>, rapports: List<RapportPari>): Gain? {
        val quinte = rapports.firstOrNull { it.typePari == "E_QUINTE_PLUS" || it.typePari == "QUINTE_PLUS" }
            ?: return null
        val mise = quinte.miseBase ?: 200
        val meilleur = quinte.rapports
            .filter { ligne ->
                val combinaison = ligne.combinaison.split("-").mapNotNull { it.trim().toIntOrNull() }
                if (combinaison.isEmpty()) return@filter false
                val ordre = ligne.libelle.contains("Ordre") && !ligne.libelle.contains("sordre", ignoreCase = true)
                if (ordre) ticket == combinaison else ticket.containsAll(combinaison)
            }
            .maxByOrNull { it.dividendePourUneMiseDeBase ?: 0 }
        return if (meilleur == null) Gain(null, 0, mise)
        else Gain(meilleur.libelle, meilleur.dividendePourUneMiseDeBase ?: 0, mise)
    }

    fun heureDepart(course: Course): String =
        Instant.ofEpochMilli(course.heureDepart).atZone(PARIS).format(heureFr)

    fun assembler(
        date: LocalDate,
        reunion: Reunion,
        course: Course,
        chevaux: List<Cheval>,
        ticketNumeros: List<Int>?,
        rapports: List<RapportPari>?,
    ): QuinteDuJour {
        val ticket = ticketNumeros?.mapNotNull { n -> chevaux.firstOrNull { it.numero == n } }
            ?.takeIf { it.size == 5 }
            ?: ticketFavoris(chevaux)
        return QuinteDuJour(
            date = dateEnFrancais(date),
            reunion = course.numReunion,
            course = course.numOrdre,
            nomCourse = course.libelle,
            hippodrome = reunion.hippodrome?.libelleLong ?: reunion.hippodrome?.libelleCourt ?: "",
            heure = heureDepart(course),
            distance = course.distance,
            chevaux = chevaux,
            ticket = ticket,
            ticketFige = ticketNumeros != null && ticket.map { it.numero } == ticketNumeros,
            arrivee = course.ordreArrivee,
            arriveeDefinitive = course.arriveeDefinitive,
            gain = if (ticket.size == 5 && rapports != null) gainTicket(ticket.map { it.numero }, rapports) else null,
        )
    }
}
