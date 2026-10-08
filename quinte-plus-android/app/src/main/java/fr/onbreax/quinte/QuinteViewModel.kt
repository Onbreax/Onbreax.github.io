package fr.onbreax.quinte

import androidx.lifecycle.ViewModel
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

class QuinteViewModel : ViewModel() {
    private val _etat = MutableStateFlow<Etat>(Etat.Chargement)
    val etat: StateFlow<Etat> = _etat

    init {
        rafraichir()
    }

    fun rafraichir() {
        _etat.value = Etat.Chargement
        viewModelScope.launch {
            _etat.value = try {
                Etat.Pret(withContext(Dispatchers.IO) { QuinteRepository.chargerQuinteDuJour() })
            } catch (e: PasDeQuinteException) {
                Etat.Erreur(e.message!!)
            } catch (e: Exception) {
                Etat.Erreur("Impossible de joindre le PMU. Vérifie ta connexion.\n(${e.message})")
            }
        }
    }
}
