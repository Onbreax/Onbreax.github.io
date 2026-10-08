package fr.onbreax.quinte

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class QuinteLogicTest {

    // Extrait réduit du programme du 08/10/2026 (Quinté+ à Saint-Cloud, R1C1).
    private val programme = """
        {"programme":{"date":1791410400000,"reunions":[
          {"numOfficiel":1,"hippodrome":{"libelleCourt":"ST-CLOUD","libelleLong":"SAINT-CLOUD"},"courses":[
            {"numReunion":1,"numOrdre":1,"heureDepart":1791460500000,"libelle":"PRIX DE VERSAILLES","distance":1600,
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
        val q = QuinteLogic.assembler(reunion, course, QuinteLogic.lireChevaux(participants))
        assertEquals("R1C1", "R${q.reunion}C${q.course}")
        assertEquals("13h55", q.heure)
        assertEquals("SAINT-CLOUD", q.hippodrome)
        assertEquals(listOf(8, 15, 1, 3, 5), q.ticket.map { it.numero })
        assertEquals(listOf(1, 2, 3, 4, 5, 7, 8, 15, 16), q.chevaux.map { it.numero })
    }

    @Test
    fun pasDeQuinte() {
        assertNull(QuinteLogic.trouverQuinte("""{"programme":{"reunions":[]}}"""))
    }
}
