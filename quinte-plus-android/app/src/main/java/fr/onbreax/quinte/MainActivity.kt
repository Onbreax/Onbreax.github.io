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
    Scaffold { padding ->
        Box(Modifier.fillMaxSize().padding(padding)) {
            when (val e = etat) {
                Etat.Chargement -> CircularProgressIndicator(Modifier.align(Alignment.Center))
                is Etat.Erreur -> Column(
                    Modifier.align(Alignment.Center).padding(24.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Text(e.message, textAlign = TextAlign.Center)
                    Spacer(Modifier.size(16.dp))
                    Button(onClick = vm::rafraichir) { Text("Réessayer") }
                }
                is Etat.Pret -> Contenu(e.quinte, vm::rafraichir)
            }
        }
    }
}

@Composable
private fun Contenu(q: QuinteDuJour, onRafraichir: () -> Unit) {
    val numerosTicket = q.ticket.map { it.numero }.toSet()
    LazyColumn(
        Modifier.fillMaxSize(),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item { EnTete(q, onRafraichir) }
        item { Ticket(q.ticket) }
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
private fun EnTete(q: QuinteDuJour, onRafraichir: () -> Unit) {
    Column {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("Quinté+ du jour", style = MaterialTheme.typography.headlineSmall, modifier = Modifier.weight(1f))
            TextButton(onClick = onRafraichir) { Text("Actualiser") }
        }
        Text(q.heure, fontSize = 44.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
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
private fun Ticket(ticket: List<Cheval>) {
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
