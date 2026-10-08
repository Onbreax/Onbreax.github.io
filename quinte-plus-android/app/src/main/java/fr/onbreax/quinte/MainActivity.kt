package fr.onbreax.quinte

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.OutlinedTextField
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel

private val Vert = Color(0xFF0B6E3B)

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            val couleurs = if (isSystemInDarkTheme()) darkColorScheme(primary = Color(0xFF6BD69A))
            else lightColorScheme(primary = Vert)
            MaterialTheme(colorScheme = couleurs) { Ecran() }
        }
    }
}

@Composable
fun Ecran(vm: QuinteViewModel = viewModel()) {
    val etat by vm.etat.collectAsStateWithLifecycle()
    val afficherHistorique by vm.afficherHistorique.collectAsStateWithLifecycle()
    val historique by vm.historique.collectAsStateWithLifecycle()
    BackHandler(enabled = afficherHistorique) { vm.afficherHistorique(false) }
    Scaffold { padding ->
        Box(Modifier.fillMaxSize().padding(padding)) {
            if (afficherHistorique) {
                EcranHistorique(historique) { vm.afficherHistorique(false) }
                return@Box
            }
            when (val e = etat) {
                Etat.Chargement -> CircularProgressIndicator(Modifier.align(Alignment.Center))
                is Etat.Erreur -> Column(
                    Modifier.align(Alignment.Center).padding(24.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Text(e.message, textAlign = TextAlign.Center)
                    Spacer(Modifier.size(16.dp))
                    Button(onClick = vm::rafraichir) { Text("Réessayer") }
                    TextButton(onClick = { vm.afficherHistorique(true) }) { Text("Historique") }
                }
                is Etat.Pret -> {
                    val monTicket by vm.monTicket.collectAsStateWithLifecycle()
                    Contenu(e.quinte, vm::rafraichir, { vm.afficherHistorique(true) }, monTicket) {
                        vm.enregistrerMonTicket(e.quinte.cle, it)
                    }
                }
            }
        }
    }
}

@Composable
private fun Contenu(
    q: QuinteDuJour,
    onRafraichir: () -> Unit,
    onHistorique: () -> Unit,
    monTicket: List<Int>?,
    onMonTicket: (List<Int>?) -> Unit,
) {
    val numerosTicket = q.ticket.map { it.numero }.toSet()
    LazyColumn(
        Modifier.fillMaxSize(),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item { EnTete(q, onRafraichir, onHistorique) }
        item { Ticket(q) }
        if (q.courseCourue || q.arrivee.isNotEmpty()) item { Resultat(q, numerosTicket) }
        item { MonTicket(q, monTicket, onMonTicket) }
        q.prochain?.let { prochain ->
            item {
                Text(
                    "Prochain Quinté+ : $prochain",
                    style = MaterialTheme.typography.titleSmall,
                    color = MaterialTheme.colorScheme.primary,
                )
            }
        }
        item {
            Text(
                "Partants (${q.chevaux.count { it.partant }})",
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier.padding(top = 8.dp),
            )
        }
        items(q.chevaux, key = { it.numero }) { cheval ->
            LigneCheval(cheval, favori = cheval.numero in numerosTicket)
            HorizontalDivider()
        }
    }
}

@Composable
private fun EnTete(q: QuinteDuJour, onRafraichir: () -> Unit, onHistorique: () -> Unit) {
    Column {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("Quinté+ du jour", style = MaterialTheme.typography.headlineSmall, modifier = Modifier.weight(1f))
            TextButton(onClick = onHistorique) { Text("Historique") }
            TextButton(onClick = onRafraichir) { Text("Actualiser") }
        }
        Text(q.date, style = MaterialTheme.typography.titleMedium)
        Text("Départ à ${q.heure}", fontSize = 36.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
        Text(q.nomCourse, style = MaterialTheme.typography.titleMedium)
        val details = listOfNotNull(
            q.hippodrome.ifBlank { null },
            "R${q.reunion}C${q.course}",
            q.distance?.let { "$it m" },
        )
        Text(details.joinToString(" · "), style = MaterialTheme.typography.bodyMedium)
    }
}

@Composable
private fun Ticket(q: QuinteDuJour) {
    val ticket = q.ticket
    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(Modifier.padding(16.dp)) {
            Text("Ticket des favoris", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            if (ticket.size < 5) {
                Text("Les cotes ne sont pas encore disponibles. Reviens un peu plus tard.")
                return@Column
            }
            Spacer(Modifier.size(12.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                ticket.forEach { Pastille(it.numero, plein = true) }
            }
            Spacer(Modifier.size(8.dp))
            Text(
                ticket.joinToString(" - ") { it.numero.toString() },
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold,
            )
            Text("Les 5 plus petites cotes, de la plus jouée à la moins jouée.", style = MaterialTheme.typography.bodySmall)
            if (q.arrivee.isNotEmpty()) {
                Text(
                    if (q.ticketFige) "Ticket enregistré avant le départ."
                    else "Calculé avec les cotes finales : l'app n'était pas ouverte avant le départ.",
                    style = MaterialTheme.typography.bodySmall,
                )
            }
        }
    }
}

@Composable
private fun LigneCheval(c: Cheval, favori: Boolean) {
    Row(
        Modifier.fillMaxWidth().padding(vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Pastille(c.numero, plein = favori)
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(
                c.nom,
                fontWeight = if (favori) FontWeight.Bold else FontWeight.Normal,
                color = if (c.partant) Color.Unspecified else MaterialTheme.colorScheme.outline,
            )
            val sousTitre = if (c.partant) c.jockey.orEmpty() else "Non partant"
            if (sousTitre.isNotBlank()) Text(sousTitre, style = MaterialTheme.typography.bodySmall)
        }
        Text(
            c.cote?.let { "%.1f".format(it) } ?: "-",
            style = MaterialTheme.typography.titleMedium,
            fontWeight = if (favori) FontWeight.Bold else FontWeight.Normal,
        )
    }
}

@Composable
private fun Pastille(numero: Int, plein: Boolean) {
    val fond = if (plein) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant
    val texte = if (plein) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant
    Box(
        Modifier.size(40.dp).background(fond, CircleShape),
        contentAlignment = Alignment.Center,
    ) {
        Text(numero.toString(), color = texte, fontWeight = FontWeight.Bold)
    }
}

@Composable
private fun Resultat(q: QuinteDuJour, numerosTicket: Set<Int>) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp)) {
            Text("Arrivée officielle", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            if (!q.arriveeDefinitive) {
                Text("Pas encore disponible. L'arrivée officielle et les gains s'afficheront dès que le PMU les publie.")
                return@Column
            }
            Spacer(Modifier.size(12.dp))
            // Les 5 premières places ; un ex æquo donne plusieurs numéros sur une place.
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                q.arrivee.take(5).forEach { place ->
                    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        place.forEach { Pastille(it, plein = it in numerosTicket) }
                    }
                }
            }
            Spacer(Modifier.size(8.dp))
            Text(
                q.arrivee.take(5).joinToString(" - ") { it.joinToString("/") },
                style = MaterialTheme.typography.headlineSmall,
                fontWeight = FontWeight.Bold,
            )
            val bons = q.arrivee.take(5).flatten().count { it in numerosTicket }
            Text("$bons de tes chevaux dans les 5 premiers (en vert).", style = MaterialTheme.typography.bodySmall)
            Spacer(Modifier.size(12.dp))
            val gain = q.gain
            when {
                gain == null -> Text("Les gains s'afficheront dès que le PMU publie les rapports.")
                gain.libelle == null -> Text(
                    "Ticket perdant (mise de ${euros(gain.mise)}).",
                    fontWeight = FontWeight.Bold,
                )
                else -> {
                    Text(
                        "Gagné : ${euros(gain.montant)}",
                        fontSize = 28.sp,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.primary,
                    )
                    Text("${gain.libelle}, pour ${euros(gain.mise)} joués au tabac.", style = MaterialTheme.typography.bodyMedium)
                }
            }
        }
    }
}

private fun euros(centimes: Long): String =
    String.format(java.util.Locale.FRENCH, "%.2f €", centimes / 100.0)

/** Petit encart discret pour noter le ticket vraiment joué, s'il n'est pas celui des favoris. */
@Composable
private fun MonTicket(q: QuinteDuJour, monTicket: List<Int>?, onMonTicket: (List<Int>?) -> Unit) {
    var edition by remember(q.cle) { mutableStateOf(false) }
    var texte by remember(q.cle) { mutableStateOf("") }
    Column(Modifier.fillMaxWidth()) {
        when {
            edition -> {
                val lu = QuinteLogic.lireTicketSaisi(texte)
                OutlinedTextField(
                    value = texte,
                    onValueChange = { texte = it },
                    label = { Text("Mon ticket : 5 numéros dans l'ordre joué") },
                    placeholder = { Text("ex. 3 7 12 1 9") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    modifier = Modifier.fillMaxWidth(),
                )
                Row {
                    TextButton(enabled = lu != null, onClick = { onMonTicket(lu); edition = false }) { Text("Enregistrer") }
                    TextButton(onClick = { edition = false }) { Text("Annuler") }
                }
            }
            monTicket == null -> TextButton(onClick = { texte = ""; edition = true }) {
                Text("+ J'ai joué un autre ticket")
            }
            else -> {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        "Mon ticket : ${monTicket.joinToString(" - ")}",
                        style = MaterialTheme.typography.titleSmall,
                        modifier = Modifier.weight(1f),
                    )
                    TextButton(onClick = { texte = monTicket.joinToString(" "); edition = true }) { Text("Modifier") }
                    TextButton(onClick = { onMonTicket(null) }) { Text("Effacer") }
                }
                val gain = q.rapports?.let { QuinteLogic.gainTicket(monTicket, it) }
                Text(
                    when {
                        gain == null -> "Gains affichés à l'arrivée officielle."
                        gain.libelle == null -> "Perdant (mise de ${euros(gain.mise)})."
                        else -> "Gagné : ${euros(gain.montant)} (${gain.libelle}, pour ${euros(gain.mise)})"
                    },
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = if (gain?.libelle != null) FontWeight.Bold else FontWeight.Normal,
                    color = if (gain?.libelle != null) MaterialTheme.colorScheme.primary else Color.Unspecified,
                )
            }
        }
    }
}

@Composable
private fun EcranHistorique(jours: List<JourHistorique>, onRetour: () -> Unit) {
    val bilan = Historique.bilan(jours)
    LazyColumn(
        Modifier.fillMaxSize(),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            Row(verticalAlignment = Alignment.CenterVertically) {
                TextButton(onClick = onRetour) { Text("‹ Retour") }
                Text("Historique", style = MaterialTheme.typography.headlineSmall)
            }
        }
        item {
            Card(
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer),
                modifier = Modifier.fillMaxWidth(),
            ) {
                Column(Modifier.padding(16.dp)) {
                    Text("Depuis le début", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
                    Text("${bilan.courses} Quinté+ joués · misé ${euros(bilan.mise)} · gagné ${euros(bilan.gagne)}")
                    val solde = bilan.gagne - bilan.mise
                    Text(
                        "Bilan : ${if (solde >= 0) "+" else "−"}${euros(kotlin.math.abs(solde))}",
                        fontSize = 24.sp,
                        fontWeight = FontWeight.Bold,
                        color = if (solde >= 0) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error,
                    )
                    Text("Compte le ticket joué chaque jour : « Mon ticket » s'il y en a un, sinon les favoris.", style = MaterialTheme.typography.bodySmall)
                }
            }
        }
        if (jours.isEmpty()) {
            item { Text("Rien pour l'instant. Chaque Quinté+ consulté dans l'app s'ajoutera ici.") }
        }
        items(jours, key = { it.jour }) { j ->
            Column(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                Text(j.date, fontWeight = FontWeight.Bold)
                Text(j.nomCourse, style = MaterialTheme.typography.bodySmall)
                Text("Favoris : ${j.favoris.joinToString(" - ")}${resultat(j.gainFavoris, j.termine)}")
                j.monTicket?.let { Text("Mon ticket : ${it.joinToString(" - ")}${resultat(j.gainMonTicket, j.termine)}") }
                Text(
                    if (j.definitive) "Arrivée : ${j.arrivee.take(5).joinToString(" - ") { it.joinToString("/") }}"
                    else "Arrivée officielle pas encore connue",
                    style = MaterialTheme.typography.bodySmall,
                )
            }
            HorizontalDivider()
        }
    }
}

private fun resultat(gain: Long?, termine: Boolean): String = when {
    !termine || gain == null -> ""
    gain > 0 -> " → gagné ${euros(gain)}"
    else -> " → perdant"
}
