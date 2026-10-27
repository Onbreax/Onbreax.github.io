package fr.onbreax.quinte

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.time.LocalDate

class QuinteViewModel(application: Application) : AndroidViewModel(application) {
    private val favoris = TicketStore(application)
    private val historique = HistoriqueQuinte(
        scope = viewModelScope,
        charger = { date -> withContext(Dispatchers.IO) { QuinteRepository.chargerQuinteDuJour(favoris, date) } },
        tickets = MonTicketStore(application),
    )
    val ecran = historique.ecran
    fun choisirJour(jour: LocalDate) = historique.choisirJour(jour)
    fun rafraichir() = historique.rafraichir()
    fun actualiserCalendrier() = historique.actualiserCalendrier()
    fun enregistrerMonTicket(cle: String, numeros: List<Int>?) = historique.enregistrerMonTicket(cle, numeros)
}
