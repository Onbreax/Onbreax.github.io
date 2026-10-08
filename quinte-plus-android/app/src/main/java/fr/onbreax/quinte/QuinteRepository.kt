package fr.onbreax.quinte

import java.net.HttpURLConnection
import java.net.URL
import java.time.LocalDate

class PasDeQuinteException : Exception("Pas de Quinté+ au programme aujourd'hui.")

object QuinteRepository {

    /** Appel bloquant : à lancer hors du thread principal. */
    fun chargerQuinteDuJour(date: LocalDate = LocalDate.now(PARIS)): QuinteDuJour {
        val (reunion, course) = QuinteLogic.trouverQuinte(get(QuinteLogic.urlProgramme(date)))
            ?: throw PasDeQuinteException()
        val chevaux = QuinteLogic.lireChevaux(
            get(QuinteLogic.urlParticipants(date, course.numReunion, course.numOrdre))
        )
        return QuinteLogic.assembler(reunion, course, chevaux)
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
