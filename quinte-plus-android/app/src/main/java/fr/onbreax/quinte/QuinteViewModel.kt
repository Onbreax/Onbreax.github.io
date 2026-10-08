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

    fun enregistrerMonTicket(cle: String, numeros: List<Int>?) {
        monTicketStore.ecrire(cle, numeros)
        _monTicket.value = numeros
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
                Etat.Pret(quinte)
            } catch (e: PasDeQuinteException) {
                Etat.Erreur(e.message!!)
            } catch (e: Exception) {
                Etat.Erreur("Impossible de joindre le PMU. Vérifie ta connexion.\n(${e.message})")
            }
        }
    }
}
