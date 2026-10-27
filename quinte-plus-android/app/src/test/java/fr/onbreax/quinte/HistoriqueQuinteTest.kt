package fr.onbreax.quinte

import android.content.SharedPreferences
import java.lang.reflect.Proxy
import java.time.LocalDate
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.delay
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.withContext
import org.junit.Assert.*
import org.junit.Test

private class TicketsMemoire : TicketsParDate {
    val valeurs = mutableMapOf<String, List<Int>>()
    override fun lire(cle: String) = valeurs[cle]
    override fun ecrire(cle: String, numeros: List<Int>?) {
        if (numeros == null) valeurs.remove(cle) else valeurs[cle] = numeros.toList()
    }
}

@OptIn(ExperimentalCoroutinesApi::class)
class HistoriqueQuinteTest {
    private val aujourdHui = LocalDate.of(2026, 10, 27)
    private val unTicket = listOf(1, 2, 3, 4, 5)
    private val autreTicket = listOf(6, 7, 8, 9, 10)
    private fun course(date: LocalDate) = QuinteLogic.assembler(
        date, Reunion(), Course(1, 2, 0, ordreArrivee = unTicket.map { listOf(it) }, arriveeDefinitive = true),
        (1..16).map { Cheval(it, "Cheval $it", null, it.toDouble(), true) }, null,
        listOf(RapportPari("QUINTE_PLUS", 200, listOf(RapportLigne("Quinté+ Ordre", "1-2-3-4-5", 50000)))),
    )

    @Test fun septDatesSansFutureEtPassageDeMois() {
        assertEquals((0L..6L).map { aujourdHui.minusDays(it) }, QuinteLogic.septDerniersJours(aujourdHui))
        val jours = QuinteLogic.septDerniersJours(LocalDate.of(2024, 3, 2))
        assertEquals(LocalDate.of(2024, 2, 25), jours.last())
        assertTrue(LocalDate.of(2024, 2, 29) in jours)
        assertEquals(7, jours.distinct().size)
    }

    @Test fun ticketHistoriqueConserveEtEffacementLimiteALaDate() = runTest {
        val tickets = TicketsMemoire()
        val historique = HistoriqueQuinte(this, { course(it) }, tickets, { aujourdHui })
        advanceUntilIdle()
        historique.enregistrerMonTicket("27102026", unTicket)
        historique.choisirJour(aujourdHui.minusDays(1))
        advanceUntilIdle()
        assertNull(historique.ecran.value.monTicket)
        historique.enregistrerMonTicket("26102026", autreTicket)
        assertEquals(Gain(null, 0, 200), QuinteLogic.gainTicket(historique.ecran.value.monTicket!!, (historique.ecran.value.etat as Etat.Pret).quinte.rapports!!))
        historique.choisirJour(aujourdHui)
        advanceUntilIdle()
        assertEquals(unTicket, historique.ecran.value.monTicket)
        historique.enregistrerMonTicket("27102026", null)
        assertEquals(autreTicket, tickets.lire("26102026"))
        assertNull(tickets.lire("27102026"))
        val relance = HistoriqueQuinte(this, { course(it) }, tickets, { aujourdHui })
        relance.choisirJour(aujourdHui.minusDays(1))
        advanceUntilIdle()
        assertEquals(autreTicket, relance.ecran.value.monTicket)
    }

    @Test fun uneReponseLenteNeRemplacePasLaDateDemandee() = runTest {
        val historique = HistoriqueQuinte(this, { date ->
            withContext(NonCancellable) { delay(if (date == aujourdHui) 500 else 20) }
            course(date)
        }, TicketsMemoire(), { aujourdHui })
        runCurrent()
        historique.choisirJour(aujourdHui.minusDays(1))
        advanceTimeBy(30)
        runCurrent()
        assertEquals("26102026", (historique.ecran.value.etat as Etat.Pret).quinte.cle)
        advanceUntilIdle()
        assertEquals(aujourdHui.minusDays(1), historique.ecran.value.jour)
        assertEquals("26102026", (historique.ecran.value.etat as Etat.Pret).quinte.cle)
    }

    @Test fun actualiserConserveLaDateEtUneErreurNeReutilisePasLeTicketPrecedent() = runTest {
        var erreur = false
        val appels = mutableListOf<LocalDate>()
        val tickets = TicketsMemoire()
        val historique = HistoriqueQuinte(this, { date ->
            appels += date
            if (erreur) error("Réseau") else course(date)
        }, tickets, { aujourdHui })
        advanceUntilIdle()
        historique.enregistrerMonTicket("27102026", unTicket)
        erreur = true
        historique.choisirJour(aujourdHui.minusDays(2))
        advanceUntilIdle()
        assertTrue(historique.ecran.value.etat is Etat.Erreur)
        assertNull(historique.ecran.value.monTicket)
        erreur = false
        historique.rafraichir()
        advanceUntilIdle()
        assertEquals(aujourdHui.minusDays(2), appels.last())
        assertEquals("25102026", (historique.ecran.value.etat as Etat.Pret).quinte.cle)
        historique.enregistrerMonTicket("27102026", autreTicket)
        assertEquals(unTicket, tickets.lire("27102026"))
        assertNull(tickets.lire("25102026"))
        historique.enregistrerMonTicket("25102026", listOf(1, 2, 3, 4, 30))
        assertNull(tickets.lire("25102026"))
    }

    @Test fun refusDesDatesHorsSemaineEtMiseAJourAuChangementDeJour() = runTest {
        var maintenant = aujourdHui
        val historique = HistoriqueQuinte(this, { course(it) }, TicketsMemoire(), { maintenant })
        advanceUntilIdle()
        historique.choisirJour(aujourdHui.plusDays(1))
        historique.choisirJour(aujourdHui.minusDays(7))
        assertEquals(aujourdHui, historique.ecran.value.jour)
        historique.choisirJour(aujourdHui.minusDays(6))
        advanceUntilIdle()
        maintenant = maintenant.plusDays(1)
        historique.rafraichir()
        advanceUntilIdle()
        assertEquals(maintenant, historique.ecran.value.jour)
        assertEquals(maintenant, historique.ecran.value.jours.first())
    }

    @Test fun preferenceHistoriqueCompatibleEtAucunEffacementDesAutresJours() {
        val valeurs = mutableMapOf<String, String>("27102026" to "1,2,3,4,5")
        // Un faux SharedPreferences exécute aussi clear() : ce test détecte la régression de la v1.3.
        val prefs = Proxy.newProxyInstance(SharedPreferences::class.java.classLoader, arrayOf(SharedPreferences::class.java)) { _, methode, args ->
            when (methode.name) {
                "getString" -> valeurs[args!![0]] ?: args[1]
                "edit" -> {
                    val changements = mutableMapOf<String, String?>()
                    var toutEffacer = false
                    Proxy.newProxyInstance(SharedPreferences.Editor::class.java.classLoader, arrayOf(SharedPreferences.Editor::class.java)) { proxy, edit, arguments ->
                        when (edit.name) {
                            "putString" -> { changements[arguments!![0] as String] = arguments[1] as String?; proxy }
                            "remove" -> { changements[arguments!![0] as String] = null; proxy }
                            "clear" -> { toutEffacer = true; proxy }
                            "apply", "commit" -> {
                                if (toutEffacer) valeurs.clear()
                                changements.forEach { (k, v) -> if (v == null) valeurs.remove(k) else valeurs[k] = v }
                                true
                            }
                            else -> error("Méthode inattendue : ${edit.name}")
                        }
                    }
                }
                else -> error("Méthode inattendue : ${methode.name}")
            }
        } as SharedPreferences
        val store = TicketsPreferences(prefs)
        assertEquals(unTicket, store.lire("27102026"))
        store.ecrire("26102026", autreTicket)
        assertEquals(unTicket, store.lire("27102026"))
        assertEquals(autreTicket, TicketsPreferences(prefs).lire("26102026"))
        store.ecrire("27102026", null)
        assertEquals(autreTicket, store.lire("26102026"))
        assertNull(store.lire("27102026"))
    }

    @Test fun uneAncienneCourseNeRecreePasDeTicketAvantDepartEtNeChargePasDeProchainQuinte() {
        val date = aujourdHui.minusDays(1)
        val appels = mutableListOf<String>()
        val store = TicketsMemoire()
        store.ecrire("27102026", autreTicket)
        val programme = """{"programme":{"reunions":[{"numOfficiel":1,"courses":[{"numReunion":1,"numOrdre":2,"heureDepart":0,"paris":[{"typePari":"QUINTE_PLUS"}],"arriveeDefinitive":true,"ordreArrivee":[[1],[2],[3],[4],[5]]}]}]}}"""
        val participants = """{"participants":[${(1..6).joinToString { """{"numPmu":$it,"nom":"Cheval $it","dernierRapportDirect":{"rapport":$it}}""" }}]}"""
        val rapports = """[{"typePari":"QUINTE_PLUS","miseBase":200,"rapports":[{"libelle":"Quinté+ Ordre","combinaison":"1-2-3-4-5","dividendePourUneMiseDeBase":50000}]}]"""
        val q = QuinteRepository.chargerQuinteDuJour(store, date, obtenir = { url ->
            appels += url
            when { url.contains("/participants") -> participants; url.contains("/rapports-definitifs") -> rapports; else -> programme }
        }, aujourdHui = aujourdHui, maintenant = 1)
        assertEquals(3, appels.size)
        assertTrue(appels.all { it.contains("/26102026") })
        assertEquals("26102026", q.cle)
        assertNull(q.prochain)
        assertFalse(q.ticketFige)
        assertEquals(Gain("Quinté+ Ordre", 50000, 200), q.gain)
        assertNull(store.lire("26102026"))
        assertEquals(autreTicket, store.lire("27102026"))
    }

    @Test fun rapportsAbsentsEtSaisieInvalideNeProduisentPasUnFauxResultat() {
        assertNull(QuinteLogic.gainTicket(unTicket, listOf(RapportPari("QUINTE_PLUS", 200))))
        assertNull(QuinteLogic.gainTicket(unTicket, listOf(RapportPari("QUINTE_PLUS", 200, listOf(RapportLigne("Ordre", "1-2-3-4-5"))))))
        assertNull(QuinteLogic.lireTicketSaisi("999999999999999999999 1 2 3 4"))
        assertNull(QuinteLogic.lireTicketSaisi("1 2 3 4 5 abc"))
        assertNull(QuinteLogic.gainTicket(listOf(1, 1, 2, 3, 4), course(aujourdHui).rapports!!))
    }
}
