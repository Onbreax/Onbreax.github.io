package fr.onbreax.quinte

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

sealed interface Etat {
    data object Chargement : Etat
    data class Pret(val quinte: QuinteDuJour) : Etat
    data class Erreur(val message: String) : Etat
}

class QuinteViewModel(application: Application) : AndroidViewModel(application) {
    private val store = TicketStore(application)
    private val monTicketStore = MonTicketStore(application)

    private val _monTicket = MutableStateFlow<List<Int>?>(null)
    val monTicket: StateFlow<List<Int>?> = _monTicket

    private val historiqueStore = HistoriqueStore(application)

    private val _historique = MutableStateFlow(historiqueStore.lire())
    val historique: StateFlow<List<JourHistorique>> = _historique

    private val _afficherHistorique = MutableStateFlow(false)
    val afficherHistorique: StateFlow<Boolean> = _afficherHistorique

    fun afficherHistorique(oui: Boolean) {
        _afficherHistorique.value = oui
    }

    fun enregistrerMonTicket(cle: String, numeros: List<Int>?) {
        monTicketStore.ecrire(cle, numeros)
        _monTicket.value = numeros
        (_etat.value as? Etat.Pret)?.let { noterDansHistorique(it.quinte) }
    }

    private fun noterDansHistorique(quinte: QuinteDuJour) {
        if (quinte.ticket.size != 5) return
        val jours = Historique.maj(_historique.value, Historique.depuis(quinte, _monTicket.value))
        historiqueStore.ecrire(jours)
        _historique.value = jours
    }

    private val _etat = MutableStateFlow<Etat>(Etat.Chargement)
    val etat: StateFlow<Etat> = _etat

    init {
        rafraichir()
    }

    fun rafraichir() {
        _etat.value = Etat.Chargement
        viewModelScope.launch {
            _etat.value = try {
                val quinte = withContext(Dispatchers.IO) { QuinteRepository.chargerQuinteDuJour(store) }
                _monTicket.value = monTicketStore.lire(quinte.cle)
                noterDansHistorique(quinte)
                Etat.Pret(quinte)
            } catch (e: PasDeQuinteException) {
                Etat.Erreur(e.message!!)
            } catch (e: Exception) {
                Etat.Erreur("Impossible de joindre le PMU. Vérifie ta connexion.\n(${e.message})")
            }
            val completes = withContext(Dispatchers.IO) { QuinteRepository.completerHistorique(_historique.value) }
            if (completes != _historique.value) {
                historiqueStore.ecrire(completes)
                _historique.value = completes
            }
        }
    }
}
