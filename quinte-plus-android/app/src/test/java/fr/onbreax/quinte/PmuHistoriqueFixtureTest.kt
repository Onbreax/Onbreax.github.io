package fr.onbreax.quinte

import java.time.LocalDate
import org.junit.Assert.*
import org.junit.Test

class PmuHistoriqueFixtureTest {
    private fun lire(nom: String) = javaClass.getResource("/pmu-2026-10-26/$nom")!!.readText()

    @Test fun arriveeEtRapportsDeLaDateHistoriqueReelle() {
        val (reunion, course) = QuinteLogic.trouverQuinte(lire("programme.json"))!!
        val rapports = QuinteLogic.lireRapports(lire("rapports.json"))
        val q = QuinteLogic.assembler(LocalDate.of(2026, 10, 26), reunion, course,
            QuinteLogic.lireChevaux(lire("participants.json")), null, rapports)
        assertEquals("26102026", q.cle)
        assertEquals(4, q.course)
        assertEquals(listOf(12, 3, 10, 13, 9), q.arrivee.take(5).flatten())
        assertTrue(q.arriveeDefinitive)
        assertEquals(Gain("Quinté+ Ordre", 360920, 200), QuinteLogic.gainTicket(listOf(12, 3, 10, 13, 9), rapports))
        assertEquals(Gain("Quinté+ Désordre", 3760, 200), QuinteLogic.gainTicket(listOf(9, 13, 10, 3, 12), rapports))
        assertEquals(Gain("Bonus 4sur5", 380, 200), QuinteLogic.gainTicket(listOf(12, 3, 10, 13, 1), rapports))
        assertEquals(Gain("Bonus 3", 340, 200), QuinteLogic.gainTicket(listOf(12, 3, 10, 1, 2), rapports))
        assertEquals(Gain(null, 0, 200), QuinteLogic.gainTicket(listOf(1, 2, 4, 5, 6), rapports))
    }
}
