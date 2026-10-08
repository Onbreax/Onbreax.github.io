package fr.onbreax.quinte

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class HistoriqueTest {

    private fun jour(j: String, favoris: List<Int> = listOf(8, 1, 5, 3, 9)) =
        JourHistorique(j, "le $j", 1, 1, "PRIX", favoris)

    // Arrivée et rapports tabac du 08/10/2026.
    private val course = Course(
        numReunion = 1, numOrdre = 1, heureDepart = 0,
        ordreArrivee = listOf(listOf(1), listOf(5), listOf(8), listOf(4), listOf(15, 16)),
        arriveeDefinitive = true,
    )
    private val rapports = listOf(
        RapportPari(
            "QUINTE_PLUS", 200,
            listOf(
                RapportLigne("Quinté+ Ordre", "1-5-8-4-15", 492540),
                RapportLigne("Bonus 4sur5", "1-5-8-4", 320),
                RapportLigne("Bonus 3", "1-5-8", 280),
            ),
        ),
    )

    @Test
    fun majRemplaceLeJourEtTrieDuPlusRecent() {
        var jours = Historique.maj(emptyList(), jour("2026-10-07"))
        jours = Historique.maj(jours, jour("2026-10-09"))
        jours = Historique.maj(jours, jour("2026-10-08"))
        jours = Historique.maj(jours, jour("2026-10-08", listOf(1, 2, 3, 4, 5)))
        assertEquals(listOf("2026-10-09", "2026-10-08", "2026-10-07"), jours.map { it.jour })
        assertEquals(listOf(1, 2, 3, 4, 5), jours[1].favoris)
    }

    @Test
    fun completerPuisBilanSurLeTicketJoue() {
        val favorisSeuls = Historique.completer(jour("2026-10-08"), course, rapports)
        assertTrue(favorisSeuls.termine)
        assertEquals(280L, favorisSeuls.gainFavoris)

        // Avec « Mon ticket », c'est lui qui compte dans le bilan.
        val avecMonTicket = Historique.completer(
            jour("2026-10-07").copy(monTicket = listOf(1, 5, 8, 4, 2)), course, rapports,
        )
        assertEquals(320L, avecMonTicket.gainJoue)

        val perdant = Historique.completer(jour("2026-10-06", listOf(2, 3, 6, 7, 9)), course, rapports)
        assertEquals(0L, perdant.gainJoue)

        val enAttente = jour("2026-10-09")
        assertFalse(enAttente.termine)

        val bilan = Historique.bilan(listOf(enAttente, favorisSeuls, avecMonTicket, perdant))
        assertEquals(Bilan(courses = 3, mise = 600, gagne = 600), bilan)
    }

    @Test
    fun relireCeQuiAEteEcrit() {
        val jours = listOf(Historique.completer(jour("2026-10-08"), course, rapports))
        assertEquals(jours, Historique.lire(Historique.ecrire(jours)))
        assertEquals(emptyList<JourHistorique>(), Historique.lire("pas du json"))
    }
}
