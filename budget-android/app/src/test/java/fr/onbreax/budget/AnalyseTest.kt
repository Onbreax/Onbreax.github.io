package fr.onbreax.budget

import java.time.LocalDate
import java.time.YearMonth
import java.time.ZoneId
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class AnalyseTest {
    private val paris = ZoneId.of("Europe/Paris")

    private fun jour(a: Int, m: Int, j: Int) =
        LocalDate.of(a, m, j).atTime(12, 0).atZone(paris).toInstant().toEpochMilli()

    private fun op(centimes: Long, libelle: String, date: Long, cat: String = categoriser(libelle, centimes, emptyList())) =
        Operation("$libelle-$date-$centimes", date, centimes, libelle, Banque.AUTRE, cat, Origine.MANUEL)

    @Test
    fun montants() {
        assertEquals(1250L, lireCentimes("12,50"))
        assertEquals(-1250L, lireCentimes("-12.50"))
        assertEquals(123456L, lireCentimes("1 234,56"))
        assertEquals(123456L, lireCentimes("1,234.56"))
        assertEquals(500L, lireCentimes("5"))
        assertEquals(1250L, trouverMontant("Paid €12.50 at Lidl"))
        assertEquals(1250L, trouverMontant("Vous avez payé 12,50 € chez Lidl"))
        assertEquals(1250L, trouverMontant("Carte x1234 : 12,50 EUR"))
        assertEquals(123456L, trouverMontant("Achat de 1 234,56 €"))
        assertEquals(12500L, trouverMontant("Carte x1234 125,00 €"))
    }

    @Test
    fun notifications() {
        val revolut = lireNotification("Lidl", "Vous avez dépensé 12,50 €")!!
        assertEquals(-1250L, revolut.centimes)
        assertEquals("Lidl", revolut.libelle)

        val anglais = lireNotification("Revolut", "Paid €9.99 at Netflix")!!
        assertEquals(-999L, anglais.centimes)
        assertEquals("Netflix", anglais.libelle)

        val bourso = lireNotification("Paiement par carte", "Paiement de 23,40 € chez CARREFOUR CITY le 10/10")!!
        assertEquals(-2340L, bourso.centimes)
        assertEquals("CARREFOUR CITY", bourso.libelle)

        val recu = lireNotification("Revolut", "Vous avez reçu 50,00 € de la part de Jean")!!
        assertEquals(5000L, recu.centimes)

        assertNull(lireNotification("Revolut", "Paiement refusé de 12,00 € chez Amazon"))
        assertNull(lireNotification("Boursorama", "Confirmez votre paiement de 30 € sur votre appli"))
        assertNull(lireNotification("Revolut", "Gagnez 10 € en parrainant un ami"))
        assertNull(lireNotification("La Banque Postale", "Votre solde est de 120,00 €"))
    }

    @Test
    fun categories() {
        assertEquals("Abonnements", categoriser("PRLV SEPA NETFLIX.COM", -1399, emptyList()))
        assertEquals("Abonnements", categoriser("GOOGLE *YouTube Premium", -1299, emptyList()))
        assertEquals("Courses", categoriser("CB LIDL 0923 PARIS", -2500, emptyList()))
        assertEquals(TRANSFERTS, categoriser("CB REVOLUT**1234*", -10000, emptyList()))
        assertEquals("Autre", categoriser("Truc inconnu", -100, emptyList()))
        assertEquals("Revenus", categoriser("Truc inconnu", 100, emptyList()))
        assertEquals("Loisirs", categoriser("CB LIDL", -100, listOf(Regle("lidl", "Loisirs"))))
    }

    @Test
    fun csvBanquePostale() {
        val csv = """
            Numéro Compte;0123456X020
            Type;CCP
            Solde (EUROS);1234,56

            Date;Libellé;Montant(EUROS)
            09/10/2026;"CB LIDL 08/10";-12,50
            09/10/2026;"CB LIDL 08/10";-12,50
            05/10/2026;PRLV SEPA NETFLIX;-13,99
            01/10/2026;VIREMENT DE EMPLOYEUR SALAIRE;1800,00
        """.trimIndent()
        val r = lireCsv(csv, emptyList(), Banque.BANQUE_POSTALE, paris)
        assertEquals(4, r.operations.size)
        assertEquals(4, r.operations.map { it.id }.toSet().size)
        assertEquals(-1250L, r.operations[0].centimes)
        assertEquals("Revenus", r.operations[3].categorie)
        // Même relevé importé deux fois : mêmes identifiants.
        assertEquals(r.operations.map { it.id }, lireCsv(csv, emptyList(), Banque.BANQUE_POSTALE, paris).operations.map { it.id })
    }

    @Test
    fun csvRevolutEtBoursorama() {
        val revolut = """
            Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance
            CARD_PAYMENT,Current,2026-10-03 14:02:11,2026-10-04 09:00:00,Spotify,-10.99,0.00,EUR,COMPLETED,100.00
            CARD_PAYMENT,Current,2026-10-04 10:00:00,,Amazon,-25.00,0.00,EUR,PENDING,75.00
            TOPUP,Current,2026-10-01 08:00:00,2026-10-01 08:00:00,Top-Up by *1234,200.00,0.00,EUR,COMPLETED,300.00
        """.trimIndent()
        val r = lireCsv(revolut, emptyList(), zone = paris)
        assertEquals(2, r.operations.size)
        assertEquals(1, r.ignorees)
        assertEquals(Banque.REVOLUT, r.operations[0].banque)
        assertEquals("Abonnements", r.operations[0].categorie)
        assertEquals(TRANSFERTS, r.operations[1].categorie)

        val bourso = """
            dateOp;dateVal;label;category;categoryParent;supplierFound;amount;comment;accountNum;accountLabel;accountbalance
            2026-10-02;2026-10-02;"CARTE 01/10/26 UBER EATS";"Restaurants";"Loisirs";"uber eats";"-18,90";;"0001";"BoursoBank";"500,00"
        """.trimIndent()
        val b = lireCsv(bourso, emptyList(), zone = paris)
        assertEquals(1, b.operations.size)
        assertEquals(Banque.BOURSORAMA, b.operations[0].banque)
        assertEquals(-1890L, b.operations[0].centimes)
        assertEquals("Restaurants", b.operations[0].categorie)
    }

    @Test
    fun resumeEtAbonnements() {
        val ops = listOf(
            op(-1399, "PRLV NETFLIX", jour(2026, 8, 5)),
            op(-1399, "PRLV NETFLIX", jour(2026, 9, 5)),
            op(-1399, "PRLV NETFLIX", jour(2026, 10, 5)),
            op(-2500, "CB LIDL", jour(2026, 10, 2)),
            op(-3100, "CB LIDL", jour(2026, 10, 9)),
            op(-10000, "CB REVOLUT", jour(2026, 10, 3)),
            op(180000, "SALAIRE", jour(2026, 10, 1)),
        )
        val r = resumer(ops, YearMonth.of(2026, 10), paris)
        assertEquals(1399L + 2500 + 3100, r.depenses)
        assertEquals(180000L, r.revenus)
        assertEquals("Courses", r.parCategorie.first().first)
        val abos = detecterAbonnements(ops, paris)
        assertEquals(1, abos.size)
        assertEquals(1399L, abos[0].centimesParMois)
        assertTrue(abos[0].nbMois == 3)
    }

    @Test
    fun affichage() {
        assertEquals("1 234,56 €", euros(123456))
        assertEquals("-0,05 €", euros(-5))
    }
}
