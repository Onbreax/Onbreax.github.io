package fr.onbreax.quinte

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assert.assertNull
import org.junit.Test
import java.time.LocalDate

class QuinteLogicTest {

    // Extrait réduit du programme du 08/10/2026 (Quinté+ à Saint-Cloud, R1C1).
    private val programme = """
        {"programme":{"date":1791410400000,"reunions":[
          {"numOfficiel":1,"hippodrome":{"libelleCourt":"ST-CLOUD","libelleLong":"SAINT-CLOUD"},"courses":[
            {"numReunion":1,"numOrdre":1,"heureDepart":1791460680000,"libelle":"PRIX DE VERSAILLES","distance":1600,
             "ordreArrivee":[[1],[5],[8],[4],[15,16],[10]],"arriveeDefinitive":true,
             "paris":[{"typePari":"SIMPLE_GAGNANT","codePari":"SIMPLE_GAGNANT"},{"typePari":"QUINTE_PLUS","codePari":"QUINTE_PLUS"}]},
            {"numReunion":1,"numOrdre":2,"heureDepart":1791462300000,"libelle":"PRIX X","paris":[{"typePari":"TRIO"}]}
          ]}
        ]}}
    """.trimIndent()

    private fun participant(num: Int, nom: String, cote: Double?, statut: String = "PARTANT") =
        """{"numPmu":$num,"nom":"$nom","driver":"J$num","statut":"$statut","inconnu":true""" +
            (cote?.let { ""","dernierRapportDirect":{"typePari":"E_SIMPLE_GAGNANT","rapport":$it,"favoris":false}""" } ?: "") +
            "}"

    private val participants = """{"participants":[
        ${participant(1, "DARZAKIR", 9.9)},
        ${participant(2, "CHILL Y FLAMA", 42.0)},
        ${participant(3, "LAPENTY", 10.0)},
        ${participant(5, "VICTORY PACE", 10.0)},
        ${participant(8, "MISTER BLACK", 4.8)},
        ${participant(15, "ENTLEBUCH", 8.4)},
        ${participant(16, "STAN LE GRAND", 10.0)},
        ${participant(4, "NON PARTANT", 2.0, "NON_PARTANT")},
        ${participant(7, "SANS COTE", null)}
    ]}"""

    @Test
    fun trouveLeQuinteEtSonHeure() {
        val (reunion, course) = QuinteLogic.trouverQuinte(programme)!!
        val q = QuinteLogic.assembler(
            LocalDate.of(2026, 10, 8), reunion, course, QuinteLogic.lireChevaux(participants),
            ticketNumeros = null, rapports = QuinteLogic.lireRapports(rapports),
        )
        assertEquals("R1C1", "R${q.reunion}C${q.course}")
        assertEquals("Jeudi 8 octobre 2026", q.date)
        assertEquals("13h58", q.heure)
        assertEquals(listOf(listOf(1), listOf(5), listOf(8), listOf(4), listOf(15, 16), listOf(10)), q.arrivee)
        // 1, 5, 8 et 15 sont dans les 5 premiers : Bonus 4sur5.
        assertEquals(Gain("e-Bonus 4sur5", 300, 200), q.gain)
        assertFalse(q.ticketFige)
        assertEquals("SAINT-CLOUD", q.hippodrome)
        assertEquals(listOf(8, 15, 1, 3, 5), q.ticket.map { it.numero })
        assertEquals(listOf(1, 2, 3, 4, 5, 7, 8, 15, 16), q.chevaux.map { it.numero })
    }

    // Extrait des rapports définitifs du 08/10/2026 (montants en centimes pour 2 €).
    private val rapports = """[
        {"typePari":"E_SIMPLE_GAGNANT","miseBase":100,"rapports":[{"libelle":"Simple","combinaison":"1","dividendePourUneMiseDeBase":990}]},
        {"typePari":"E_QUINTE_PLUS","miseBase":200,"rapports":[
          {"libelle":"e-Quinté+ Ordre","combinaison":"1-5-8-4-15","dividendePourUneMiseDeBase":614580},
          {"libelle":"e-Quinté+ Ordre","combinaison":"1-5-8-4-16","dividendePourUneMiseDeBase":322780},
          {"libelle":"e-Quinté+ Désordre","combinaison":"1-5-8-4-15","dividendePourUneMiseDeBase":7220},
          {"libelle":"e-Quinté+ Désordre","combinaison":"1-5-8-4-16","dividendePourUneMiseDeBase":3920},
          {"libelle":"e-Bonus 4sur5","combinaison":"1-5-8-4","dividendePourUneMiseDeBase":300},
          {"libelle":"e-Bonus 4sur5","combinaison":"1-5-8-15","dividendePourUneMiseDeBase":300},
          {"libelle":"e-Bonus 3","combinaison":"1-5-8","dividendePourUneMiseDeBase":260}
        ]}
    ]"""

    @Test
    fun gainsSelonLeTicket() {
        val r = QuinteLogic.lireRapports(rapports)
        assertEquals(Gain("e-Quinté+ Ordre", 614580, 200), QuinteLogic.gainTicket(listOf(1, 5, 8, 4, 15), r))
        assertEquals(Gain("e-Quinté+ Désordre", 7220, 200), QuinteLogic.gainTicket(listOf(15, 4, 8, 5, 1), r))
        assertEquals(Gain("e-Bonus 3", 260, 200), QuinteLogic.gainTicket(listOf(1, 5, 8, 2, 3), r))
        assertEquals(Gain(null, 0, 200), QuinteLogic.gainTicket(listOf(2, 3, 6, 7, 9), r))
        assertNull(QuinteLogic.gainTicket(listOf(1, 5, 8, 4, 15), emptyList()))
    }

    @Test
    fun ticketEnregistreAvantLeDepart() {
        val (reunion, course) = QuinteLogic.trouverQuinte(programme)!!
        val q = QuinteLogic.assembler(
            LocalDate.of(2026, 10, 8), reunion, course, QuinteLogic.lireChevaux(participants),
            ticketNumeros = listOf(1, 5, 8, 16, 2), rapports = null,
        )
        assertEquals(listOf(1, 5, 8, 16, 2), q.ticket.map { it.numero })
        assertTrue(q.ticketFige)
        assertNull(q.gain)
    }

    @Test
    fun pasDeQuinte() {
        assertNull(QuinteLogic.trouverQuinte("""{"programme":{"reunions":[]}}"""))
    }
}
