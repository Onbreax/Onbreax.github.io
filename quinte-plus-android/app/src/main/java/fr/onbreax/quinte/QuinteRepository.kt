package fr.onbreax.quinte

import android.content.Context
import java.net.HttpURLConnection
import java.net.URL
import java.time.LocalDate

class PasDeQuinteException : Exception("Pas de Quinté+ au programme aujourd'hui.")

/**
 * Garde le ticket du jour tel qu'il était avant le départ :
 * après la course les cotes changent, mais le ticket joué, lui, ne change plus.
 */
class TicketStore(context: Context) {
    private val prefs = context.getSharedPreferences("tickets", Context.MODE_PRIVATE)

    fun lire(cle: String): List<Int>? =
        prefs.getString(cle, null)?.split(",")?.mapNotNull { it.toIntOrNull() }?.takeIf { it.size == 5 }

    fun ecrire(cle: String, numeros: List<Int>) {
        prefs.edit().clear().putString(cle, numeros.joinToString(",")).apply()
    }
}

/** « Mon ticket » : le ticket que l'on a vraiment joué, s'il diffère des favoris. Un seul jour gardé. */
class MonTicketStore(context: Context) {
    private val prefs = context.getSharedPreferences("mon_ticket", Context.MODE_PRIVATE)

    fun lire(cle: String): List<Int>? =
        prefs.getString(cle, null)?.split(",")?.mapNotNull { it.toIntOrNull() }?.takeIf { it.size == 5 }

    fun ecrire(cle: String, numeros: List<Int>?) {
        val edition = prefs.edit().clear()
        if (numeros != null) edition.putString(cle, numeros.joinToString(","))
        edition.apply()
    }
}

object QuinteRepository {

    /** Appel bloquant : à lancer hors du thread principal. */
    fun chargerQuinteDuJour(store: TicketStore, date: LocalDate = LocalDate.now(PARIS)): QuinteDuJour {
        val (reunion, course) = QuinteLogic.trouverQuinte(get(QuinteLogic.urlProgramme(date)))
            ?: throw PasDeQuinteException()
        val chevaux = QuinteLogic.lireChevaux(
            get(QuinteLogic.urlParticipants(date, course.numReunion, course.numOrdre))
        )

        // Avant le départ, on enregistre le ticket des favoris ; ensuite, on réutilise l'enregistré.
        val cle = QuinteLogic.cleDate(date)
        val favoris = QuinteLogic.ticketFavoris(chevaux).map { it.numero }
        val ticket = if (System.currentTimeMillis() < course.heureDepart && favoris.size == 5) {
            store.ecrire(cle, favoris)
            favoris
        } else {
            store.lire(cle)
        }

        val rapports = if (course.arriveeDefinitive) {
            runCatching {
                QuinteLogic.lireRapports(get(QuinteLogic.urlRapports(date, course.numReunion, course.numOrdre)))
            }.getOrNull()
        } else null

        val quinte = QuinteLogic.assembler(date, reunion, course, chevaux, ticket, rapports)
        return if (quinte.courseCourue) quinte.copy(prochain = prochainQuinte(date)) else quinte
    }

    /** Le prochain Quinté+ (demain, sinon après-demain), ou null si le programme n'est pas encore là. */
    private fun prochainQuinte(date: LocalDate): String? {
        for (jours in 1L..2L) {
            val jour = date.plusDays(jours)
            val trouve = runCatching { QuinteLogic.trouverQuinte(get(QuinteLogic.urlProgramme(jour))) }.getOrNull()
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
