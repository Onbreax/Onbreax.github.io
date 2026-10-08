package fr.onbreax.quinte

import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

/** Un Quinté+ passé, tel que gardé sur le téléphone. Montants en centimes. */
@Serializable
data class JourHistorique(
    /** Date au format AAAA-MM-JJ (sert aussi à trier). */
    val jour: String,
    val date: String,
    val reunion: Int,
    val course: Int,
    val nomCourse: String,
    val favoris: List<Int>,
    val monTicket: List<Int>? = null,
    val arrivee: List<List<Int>> = emptyList(),
    val definitive: Boolean = false,
    val gainFavoris: Long? = null,
    val gainMonTicket: Long? = null,
    val mise: Long = 200,
) {
    /** Le ticket vraiment joué : « Mon ticket » s'il y en a un, sinon celui des favoris. */
    val joue: List<Int> get() = monTicket ?: favoris
    val gainJoue: Long? get() = if (monTicket != null) gainMonTicket else gainFavoris
    /** Arrivée officielle et gains connus. */
    val termine: Boolean get() = definitive && gainJoue != null
}

data class Bilan(val courses: Int, val mise: Long, val gagne: Long)

object Historique {
    private const val MAX_JOURS = 365
    private val json = Json { ignoreUnknownKeys = true }

    fun lire(texte: String?): List<JourHistorique> =
        texte?.let { runCatching { json.decodeFromString<List<JourHistorique>>(it) }.getOrNull() } ?: emptyList()

    fun ecrire(jours: List<JourHistorique>): String = json.encodeToString(jours)

    /** Remplace (ou ajoute) le jour, du plus récent au plus ancien. */
    fun maj(jours: List<JourHistorique>, jour: JourHistorique): List<JourHistorique> =
        (jours.filter { it.jour != jour.jour } + jour).sortedByDescending { it.jour }.take(MAX_JOURS)

    /** Le jour tel que l'écran le montre, avec « Mon ticket ». */
    fun depuis(q: QuinteDuJour, monTicket: List<Int>?): JourHistorique {
        val favoris = q.ticket.map { it.numero }
        return JourHistorique(
            jour = q.jour,
            date = q.date,
            reunion = q.reunion,
            course = q.course,
            nomCourse = q.nomCourse,
            favoris = favoris,
            monTicket = monTicket,
            arrivee = if (q.arriveeDefinitive) q.arrivee else emptyList(),
            definitive = q.arriveeDefinitive,
            gainFavoris = q.rapports?.let { QuinteLogic.gainTicket(favoris, it)?.montant },
            gainMonTicket = monTicket?.let { t -> q.rapports?.let { QuinteLogic.gainTicket(t, it)?.montant } },
            mise = q.gain?.mise ?: 200,
        )
    }

    /** Complète un jour passé avec son arrivée officielle et ses rapports. */
    fun completer(j: JourHistorique, course: Course, rapports: List<RapportPari>?): JourHistorique {
        if (!course.arriveeDefinitive || rapports == null) return j
        val favoris = QuinteLogic.gainTicket(j.favoris, rapports) ?: return j
        return j.copy(
            arrivee = course.ordreArrivee,
            definitive = true,
            gainFavoris = favoris.montant,
            gainMonTicket = j.monTicket?.let { QuinteLogic.gainTicket(it, rapports)?.montant },
            mise = favoris.mise,
        )
    }

    /** Total des courses terminées : une mise par jour, sur le ticket joué. */
    fun bilan(jours: List<JourHistorique>): Bilan {
        val termines = jours.filter { it.termine }
        return Bilan(termines.size, termines.sumOf { it.mise }, termines.sumOf { it.gainJoue ?: 0 })
    }
}
