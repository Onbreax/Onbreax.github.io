package fr.onbreax.quinte

import android.content.Context
import android.content.SharedPreferences
import java.net.HttpURLConnection
import java.net.URL
import java.time.LocalDate

class PasDeQuinteException : Exception("Pas de Quinté+ pour cette date.")

interface TicketsParDate {
    fun lire(cle: String): List<Int>?
    fun ecrire(cle: String, numeros: List<Int>?)
}

/** Les clés historiques restent compatibles avec la version précédente. */
open class TicketsPreferences(private val prefs: SharedPreferences) : TicketsParDate {
    override fun lire(cle: String): List<Int>? = prefs.getString(cle, null)?.let(QuinteLogic::lireTicketSaisi)

    override fun ecrire(cle: String, numeros: List<Int>?) {
        require(numeros == null || QuinteLogic.ticketValide(numeros))
        val edition = prefs.edit()
        if (numeros == null) edition.remove(cle) else edition.putString(cle, numeros.joinToString(","))
        edition.apply()
    }
}

/**
 * Garde le ticket du jour tel qu'il était avant le départ :
 * après la course les cotes changent, mais le ticket joué, lui, ne change plus.
 */
class TicketStore(context: Context) : TicketsPreferences(context.getSharedPreferences("tickets", Context.MODE_PRIVATE))

/** Un ticket personnel indépendant par date, conservé après fermeture de l'application. */
class MonTicketStore(context: Context) : TicketsPreferences(context.getSharedPreferences("mon_ticket", Context.MODE_PRIVATE))

object QuinteRepository {

    /** Appel bloquant : à lancer hors du thread principal. */
    fun chargerQuinteDuJour(
        store: TicketsParDate,
        date: LocalDate = LocalDate.now(PARIS),
        obtenir: (String) -> String = ::get,
        aujourdHui: LocalDate = LocalDate.now(PARIS),
        maintenant: Long = System.currentTimeMillis(),
    ): QuinteDuJour {
        val (reunion, course) = QuinteLogic.trouverQuinte(obtenir(QuinteLogic.urlProgramme(date)))
            ?: throw PasDeQuinteException()
        val chevaux = QuinteLogic.lireChevaux(
            obtenir(QuinteLogic.urlParticipants(date, course.numReunion, course.numOrdre))
        )

        // Avant le départ, on enregistre le ticket des favoris ; ensuite, on réutilise l'enregistré.
        val cle = QuinteLogic.cleDate(date)
        val favoris = QuinteLogic.ticketFavoris(chevaux).map { it.numero }
        val ticket = if (date == aujourdHui && maintenant < course.heureDepart && favoris.size == 5) {
            store.ecrire(cle, favoris)
            favoris
        } else {
            store.lire(cle)
        }

        val rapports = if (course.arriveeDefinitive) {
            runCatching {
                QuinteLogic.lireRapports(obtenir(QuinteLogic.urlRapports(date, course.numReunion, course.numOrdre)))
            }.getOrNull()
        } else null

        val quinte = QuinteLogic.assembler(date, reunion, course, chevaux, ticket, rapports, maintenant)
        return if (date == aujourdHui && quinte.courseCourue) quinte.copy(prochain = prochainQuinte(date, obtenir)) else quinte
    }

    /** Le prochain Quinté+ (demain, sinon après-demain), ou null si le programme n'est pas encore là. */
    private fun prochainQuinte(date: LocalDate, obtenir: (String) -> String): String? {
        for (jours in 1L..2L) {
            val jour = date.plusDays(jours)
            val trouve = runCatching { QuinteLogic.trouverQuinte(obtenir(QuinteLogic.urlProgramme(jour))) }.getOrNull()
            if (trouve != null) return "${QuinteLogic.dateEnFrancais(jour)} à ${QuinteLogic.heureDepart(trouve.second)}"
        }
        return null
    }

    private fun get(url: String): String {
        val conn = URL(url).openConnection() as HttpURLConnection
        conn.connectTimeout = 15_000
        conn.readTimeout = 15_000
        conn.setRequestProperty("Accept", "application/json")
        try {
            if (conn.responseCode !in 200..299) {
                throw Exception("Le PMU a répondu ${conn.responseCode}.")
            }
            return conn.inputStream.bufferedReader().use { it.readText() }
        } finally {
            conn.disconnect()
        }
    }
}
