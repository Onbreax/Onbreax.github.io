package fr.onbreax.quinte

import android.os.Bundle
import androidx.activity.ComponentActivity
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
import androidx.compose.runtime.key
import androidx.compose.runtime.saveable.rememberSaveable
import java.time.LocalDate
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.OutlinedButton
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
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
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
    val ecran by vm.ecran.collectAsStateWithLifecycle()
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) { vm.actualiserCalendrier() }
    Scaffold { padding ->
        Column(Modifier.fillMaxSize().padding(padding)) {
            ChoixDuJour(ecran, vm::choisirJour)
            HorizontalDivider()
            Box(Modifier.weight(1f).fillMaxWidth()) {
                when (val e = ecran.etat) {
                    Etat.Chargement -> Column(Modifier.align(Alignment.Center), horizontalAlignment = Alignment.CenterHorizontally) {
                        CircularProgressIndicator()
                        Text("Chargement de la course…", modifier = Modifier.padding(16.dp))
                    }
                    is Etat.Erreur -> Column(
                        Modifier.align(Alignment.Center).padding(24.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                    ) {
                        Text(e.message, textAlign = TextAlign.Center)
                        Spacer(Modifier.size(16.dp))
                        Button(onClick = vm::rafraichir) { Text("Réessayer cette date") }
                    }
                    is Etat.Pret -> key(e.quinte.cle) {
                        Contenu(e.quinte, vm::rafraichir, ecran.monTicket, ecran.jour != ecran.jours.first()) {
                            vm.enregistrerMonTicket(e.quinte.cle, it)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun ChoixDuJour(ecran: EcranQuinte, onChoisir: (LocalDate) -> Unit) {
    var ouvert by remember { mutableStateOf(false) }
    val position = ecran.jours.indexOf(ecran.jour)
    Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp)) {
        Text("Quinté+ · historique sur 7 jours", style = MaterialTheme.typography.titleMedium)
        Box {
            OutlinedButton(onClick = { ouvert = true }, modifier = Modifier.fillMaxWidth()) {
                Text(QuinteLogic.dateEnFrancais(ecran.jour), modifier = Modifier.weight(1f), textAlign = TextAlign.Start)
                Text("Choisir", modifier = Modifier.padding(start = 8.dp))
            }
            DropdownMenu(expanded = ouvert, onDismissRequest = { ouvert = false }) {
                ecran.jours.forEachIndexed { index, jour ->
                    DropdownMenuItem(
                        text = {
                            Column {
                                Text(QuinteLogic.dateEnFrancais(jour), fontWeight = if (jour == ecran.jour) FontWeight.Bold else FontWeight.Normal)
                                if (index <= 1) Text(if (index == 0) "Aujourd’hui" else "Hier", style = MaterialTheme.typography.bodySmall)
                            }
                        },
                        onClick = { ouvert = false; onChoisir(jour) },
                    )
                }
            }
        }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            TextButton(enabled = position in 0 until ecran.jours.lastIndex, onClick = { onChoisir(ecran.jours[position + 1]) }) { Text("Précédent") }
            TextButton(enabled = position > 0, onClick = { onChoisir(ecran.jours.first()) }) { Text("Aujourd’hui") }
            TextButton(enabled = position > 0, onClick = { onChoisir(ecran.jours[position - 1]) }) { Text("Suivant") }
        }
    }
}

@Composable
private fun Contenu(
    q: QuinteDuJour,
    onRafraichir: () -> Unit,
    monTicket: List<Int>?,
    historique: Boolean,
    onMonTicket: (List<Int>?) -> Unit,
) {
    val numerosFavoris = q.ticket.map { it.numero }.toSet()
    val numerosTicket = monTicket?.toSet().orEmpty()
    LazyColumn(
        Modifier.fillMaxSize(),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item { EnTete(q, onRafraichir, historique) }
        if (!historique) item { Ticket(q) }
        if (q.courseCourue || q.arrivee.isNotEmpty()) item { Resultat(q, numerosTicket) }
        item { MonTicket(q, monTicket, onMonTicket) }
        if (historique) item { Ticket(q) }
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
            LigneCheval(cheval, favori = cheval.numero in numerosFavoris)
            HorizontalDivider()
        }
    }
}

@Composable
private fun EnTete(q: QuinteDuJour, onRafraichir: () -> Unit, historique: Boolean) {
    Column {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(if (historique) "Course du jour choisi" else "Quinté+ du jour", style = MaterialTheme.typography.titleLarge, modifier = Modifier.weight(1f))
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
            if (q.arriveeDefinitive && q.ticket.none { !it.partant }) q.gain?.let { gain ->
                Text(
                    if (gain.libelle == null) "Résultat de cette sélection : aucun gain."
                    else "Résultat de cette sélection : ${euros(gain.montant)} (${gain.libelle}, mise de ${euros(gain.mise)}).",
                    style = MaterialTheme.typography.bodySmall,
                )
            }
            if (q.arrivee.isNotEmpty()) {
                Text(
                    if (q.ticketFige) "Ticket enregistré avant le départ."
                    else "Reconstitué avec les cotes disponibles après la course : ce n’est pas ton ticket joué.",
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
            if (numerosTicket.isNotEmpty()) {
                val bons = q.arrivee.take(5).flatten().count { it in numerosTicket }
                Text("$bons numéros de ton ticket parmi les premières places (en vert).", style = MaterialTheme.typography.bodySmall)
            } else {
                Text("Renseigne ton ticket ci-dessous pour vérifier le résultat.", style = MaterialTheme.typography.bodySmall)
            }
        }
    }
}

private fun euros(centimes: Long): String =
    String.format(java.util.Locale.FRENCH, "%.2f €", centimes / 100.0)

/** Le ticket personnel est toujours celui de la date affichée. */
@Composable
private fun MonTicket(q: QuinteDuJour, monTicket: List<Int>?, onMonTicket: (List<Int>?) -> Unit) {
    var edition by rememberSaveable(q.cle) { mutableStateOf(false) }
    var texte by rememberSaveable(q.cle) { mutableStateOf("") }
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("Mon ticket joué", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            Text(q.date, style = MaterialTheme.typography.bodySmall)
            when {
                edition -> {
                    val lu = QuinteLogic.lireTicketSaisi(texte)
                    val presentDansLaCourse = lu != null && lu.all { n -> q.chevaux.any { it.numero == n } }
                    OutlinedTextField(
                        value = texte,
                        onValueChange = { texte = it.take(100) },
                        label = { Text("5 numéros dans l’ordre joué") },
                        placeholder = { Text("ex. 3 7 12 1 9") },
                        supportingText = { Text("Cinq numéros différents figurant dans cette course.") },
                        isError = texte.isNotBlank() && !presentDansLaCourse,
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Text),
                        modifier = Modifier.fillMaxWidth(),
                    )
                    Row {
                        Button(enabled = presentDansLaCourse, onClick = { onMonTicket(lu); edition = false }) { Text("Vérifier le ticket") }
                        TextButton(onClick = { edition = false }) { Text("Annuler") }
                    }
                }
                monTicket == null -> {
                    Text("Tu peux saisir le ticket réellement joué, même après la course.")
                    Button(onClick = { texte = ""; edition = true }) { Text("Saisir mon ticket") }
                }
                else -> {
                    Text(monTicket.joinToString(" - "), style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                    val nonPartant = monTicket.any { n -> q.chevaux.any { it.numero == n && !it.partant } }
                    val gain = if (q.arriveeDefinitive && !nonPartant) q.rapports?.let { QuinteLogic.gainTicket(monTicket, it) } else null
                    Text(
                        when {
                            !q.arriveeDefinitive -> "Arrivée définitive non disponible : résultat du ticket en attente."
                            nonPartant -> "Ticket avec non-partant : gain ou remboursement à vérifier auprès du PMU."
                            gain == null -> "Rapports du Quinté+ indisponibles pour cette date. Actualise pour réessayer."
                            gain.libelle == null -> "Aucun gain pour cette combinaison (mise de référence : ${euros(gain.mise)})."
                            else -> "Gain : ${euros(gain.montant)} · ${gain.libelle}"
                        },
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        color = if (gain?.libelle != null) MaterialTheme.colorScheme.primary else Color.Unspecified,
                    )
                    if (gain?.libelle != null) Text("Pour une mise de ${euros(gain.mise)}, mise incluse.", style = MaterialTheme.typography.bodySmall)
                    Row {
                        TextButton(onClick = { texte = monTicket.joinToString(" "); edition = true }) { Text("Modifier") }
                        TextButton(onClick = { onMonTicket(null) }) { Text("Effacer ce ticket") }
                    }
                }
            }
            Text("Ticket simple de 5 chevaux · rapports PMU points de vente. Hors Flexi, combiné, options et promotions.", style = MaterialTheme.typography.bodySmall)
            Text("Les tickets sont conservés sur ce téléphone, séparément pour chaque date.", style = MaterialTheme.typography.bodySmall)
        }
    }
}
