package fr.onbreax.quinte

import java.time.LocalDate
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

sealed interface Etat {
    data object Chargement : Etat
    data class Pret(val quinte: QuinteDuJour) : Etat
    data class Erreur(val message: String) : Etat
}

data class EcranQuinte(
    val jours: List<LocalDate>,
    val jour: LocalDate,
    val etat: Etat = Etat.Chargement,
    val monTicket: List<Int>? = null,
)

/** Une seule date active : une réponse tardive ne peut pas remplacer la course consultée. */
class HistoriqueQuinte(
    private val scope: CoroutineScope,
    private val charger: suspend (LocalDate) -> QuinteDuJour,
    private val tickets: TicketsParDate,
    private val aujourdhui: () -> LocalDate = { LocalDate.now(PARIS) },
) {
    private val premierJour = aujourdhui()
    private val _ecran = MutableStateFlow(EcranQuinte(QuinteLogic.septDerniersJours(premierJour), premierJour))
    val ecran: StateFlow<EcranQuinte> = _ecran
    private var chargement: Job? = null
    private var generation = 0L

    init { rafraichir() }

    fun choisirJour(jour: LocalDate) {
        if (jour !in QuinteLogic.septDerniersJours(aujourdhui())) return
        if (jour != _ecran.value.jour || _ecran.value.etat is Etat.Erreur) chargerJour(jour)
    }

    fun rafraichir() {
        val jours = QuinteLogic.septDerniersJours(aujourdhui())
        chargerJour(_ecran.value.jour.takeIf { it in jours } ?: jours.first())
    }

    fun actualiserCalendrier() {
        if (_ecran.value.jours != QuinteLogic.septDerniersJours(aujourdhui())) rafraichir()
    }

    private fun chargerJour(jour: LocalDate) {
        val requete = ++generation
        chargement?.cancel()
        _ecran.value = EcranQuinte(QuinteLogic.septDerniersJours(aujourdhui()), jour)
        chargement = scope.launch {
            val etat = try {
                val course = charger(jour)
                check(course.cle == QuinteLogic.cleDate(jour)) { "La course reçue ne correspond pas à la date choisie." }
                Etat.Pret(course)
            } catch (e: CancellationException) {
                throw e
            } catch (e: PasDeQuinteException) {
                Etat.Erreur("Aucun Quinté+ au programme du ${QuinteLogic.dateEnFrancais(jour).lowercase()}.")
            } catch (e: Exception) {
                Etat.Erreur("Résultats indisponibles pour le ${QuinteLogic.dateEnFrancais(jour).lowercase()}. Vérifie ta connexion puis réessaie.")
            }
            if (requete == generation) {
                _ecran.value = _ecran.value.copy(
                    etat = etat,
                    monTicket = if (etat is Etat.Pret) tickets.lire(etat.quinte.cle) else null,
                )
            }
        }
    }

    fun enregistrerMonTicket(cle: String, numeros: List<Int>?) {
        val actuel = _ecran.value
        val course = (actuel.etat as? Etat.Pret)?.quinte ?: return
        if (cle != course.cle || cle != QuinteLogic.cleDate(actuel.jour)) return
        if (numeros != null && (!QuinteLogic.ticketValide(numeros) || numeros.any { n -> course.chevaux.none { it.numero == n } })) return
        tickets.ecrire(cle, numeros)
        _ecran.value = actuel.copy(monTicket = numeros?.toList())
    }
}
