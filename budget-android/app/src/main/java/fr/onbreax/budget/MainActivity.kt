@file:OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)

package fr.onbreax.budget

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import android.provider.Settings
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.app.NotificationManagerCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import java.nio.charset.Charset
import java.time.Instant
import java.time.YearMonth
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import java.util.UUID

private val Bleu = Color(0xFF1F5FBF)
private val Rouge = Color(0xFFC0392B)
private val VertRevenu = Color(0xFF1E8449)

private val COULEURS_CATEGORIES = mapOf(
    "Abonnements" to Color(0xFF8E44AD), "Courses" to Color(0xFF27AE60), "Restaurants" to Color(0xFFE67E22),
    "Transport" to Color(0xFF2980B9), "Shopping" to Color(0xFFD35400), "Logement et factures" to Color(0xFF7F8C8D),
    "Santé" to Color(0xFFC0392B), "Loisirs" to Color(0xFF16A085), "Retraits" to Color(0xFF95A5A6),
    "Revenus" to VertRevenu, TRANSFERTS to Color(0xFFB0B7BF), "Autre" to Color(0xFF5D6D7E),
)

private fun couleur(categorie: String) = COULEURS_CATEGORIES[categorie] ?: Color(0xFF5D6D7E)

private val FORMAT_JOUR = DateTimeFormatter.ofPattern("EEE d MMM, HH:mm", Locale.FRENCH)
private val FORMAT_MOIS = DateTimeFormatter.ofPattern("MMMM yyyy", Locale.FRENCH)

private fun dateLisible(ms: Long) = Instant.ofEpochMilli(ms).atZone(ZoneId.systemDefault()).format(FORMAT_JOUR)

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Depot.ouvrir(this)
        enableEdgeToEdge()
        setContent {
            val couleurs = if (isSystemInDarkTheme()) darkColorScheme(primary = Color(0xFF8AB4F8))
            else lightColorScheme(primary = Bleu)
            MaterialTheme(colorScheme = couleurs) { Application() }
        }
    }
}

private fun accesNotificationsActif(context: Context) =
    NotificationManagerCompat.getEnabledListenerPackages(context).contains(context.packageName)

@Composable
private fun Application() {
    val context = LocalContext.current
    val donnees by Depot.donnees.collectAsStateWithLifecycle()
    var onglet by remember { mutableStateOf(0) }
    var acces by remember { mutableStateOf(accesNotificationsActif(context)) }
    var ajout by remember { mutableStateOf(false) }
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) { acces = accesNotificationsActif(context) }

    Scaffold(
        bottomBar = {
            NavigationBar {
                listOf("Ce mois", "Abonnements", "Réglages").forEachIndexed { i, nom ->
                    NavigationBarItem(
                        selected = onglet == i,
                        onClick = { onglet = i },
                        icon = { Text(listOf("€", "↻", "⚙")[i], fontSize = 20.sp) },
                        label = { Text(nom) },
                    )
                }
            }
        },
        floatingActionButton = {
            if (onglet == 0) FloatingActionButton(onClick = { ajout = true }) { Text("+", fontSize = 26.sp) }
        },
    ) { marges ->
        Box(Modifier.padding(marges).fillMaxSize()) {
            when (onglet) {
                0 -> EcranMois(donnees, acces) { onglet = 2 }
                1 -> EcranAbonnements(donnees)
                else -> EcranReglages(donnees, acces)
            }
        }
    }
    if (ajout) DialogueAjout { ajout = false }
}

// ---------- Ce mois ----------

@Composable
private fun EcranMois(donnees: Donnees, acces: Boolean, versReglages: () -> Unit) {
    var mois by remember { mutableStateOf(YearMonth.now()) }
    var choisie by remember { mutableStateOf<Operation?>(null) }
    var filtre by remember { mutableStateOf<String?>(null) }
    val resume = remember(donnees.operations, mois) { resumer(donnees.operations, mois) }
    val liste = resume.operations.filter { filtre == null || it.categorie == filtre }

    LazyColumn(contentPadding = PaddingValues(16.dp, 12.dp, 16.dp, 96.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        if (!acces) item {
            Carte(fond = MaterialTheme.colorScheme.errorContainer) {
                Text("La lecture des paiements n'est pas activée", fontWeight = FontWeight.Bold)
                Text("Sans elle, l'appli ne voit pas tes achats en direct. Va dans Réglages pour l'activer.", fontSize = 14.sp)
                TextButton(onClick = versReglages) { Text("Activer") }
            }
        }
        item {
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                TextButton(onClick = { mois = mois.minusMonths(1) }) { Text("‹", fontSize = 26.sp) }
                Text(
                    mois.format(FORMAT_MOIS).replaceFirstChar { it.uppercase() },
                    fontSize = 20.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f),
                    textAlign = androidx.compose.ui.text.style.TextAlign.Center,
                )
                TextButton(onClick = { mois = mois.plusMonths(1) }, enabled = mois < YearMonth.now()) { Text("›", fontSize = 26.sp) }
            }
        }
        item {
            Carte {
                Text("Dépensé ce mois", fontSize = 14.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(euros(resume.depenses), fontSize = 34.sp, fontWeight = FontWeight.Bold)
                if (resume.revenus > 0) Text("Rentré : ${euros(resume.revenus)}", color = VertRevenu, fontSize = 14.sp)
                if (mois == YearMonth.now()) {
                    val jour = java.time.LocalDate.now().dayOfMonth
                    val projection = resume.depenses * mois.lengthOfMonth() / jour
                    Text("À ce rythme : ${euros(projection)} sur le mois", fontSize = 14.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
        if (resume.parCategorie.isNotEmpty()) item {
            Carte {
                Text("Par catégorie", fontWeight = FontWeight.Bold)
                Spacer(Modifier.height(6.dp))
                val max = resume.parCategorie.first().second.coerceAtLeast(1)
                resume.parCategorie.forEach { (cat, montant) ->
                    Column(
                        Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp))
                            .clickable { filtre = if (filtre == cat) null else cat }
                            .background(if (filtre == cat) MaterialTheme.colorScheme.secondaryContainer else Color.Transparent)
                            .padding(vertical = 5.dp, horizontal = 4.dp),
                    ) {
                        Row {
                            Text(cat, modifier = Modifier.weight(1f), fontSize = 15.sp)
                            Text(euros(montant), fontWeight = FontWeight.SemiBold, fontSize = 15.sp)
                        }
                        Box(Modifier.fillMaxWidth().height(6.dp).clip(RoundedCornerShape(3.dp)).background(MaterialTheme.colorScheme.surfaceVariant)) {
                            Box(Modifier.fillMaxWidth(montant.toFloat() / max).fillMaxHeight().background(couleur(cat)))
                        }
                    }
                }
                if (filtre != null) TextButton(onClick = { filtre = null }) { Text("Tout afficher") }
            }
        }
        item {
            Text(
                if (filtre == null) "Opérations (${liste.size})" else "$filtre (${liste.size})",
                fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 4.dp),
            )
        }
        if (liste.isEmpty()) item {
            Text(
                "Rien pour ce mois. Les paiements apparaîtront ici dès que tes applis bancaires enverront une notification, " +
                    "ou après l'import d'un relevé (Réglages).",
                color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 14.sp,
            )
        }
        items(liste, key = { it.id }) { op -> LigneOperation(op) { choisie = op } }
    }
    choisie?.let { op -> DialogueOperation(op) { choisie = null } }
}

@Composable
private fun LigneOperation(op: Operation, clic: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).clickable(onClick = clic)
            .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)).padding(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(12.dp).clip(CircleShape).background(couleur(op.categorie)))
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(op.libelle, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(
                "${op.categorie} · ${op.banque.nom} · ${dateLisible(op.date)}",
                fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis,
            )
        }
        Spacer(Modifier.width(8.dp))
        Text(
            (if (op.centimes > 0) "+" else "") + euros(op.centimes),
            fontWeight = FontWeight.Bold,
            color = when {
                op.categorie == TRANSFERTS -> MaterialTheme.colorScheme.onSurfaceVariant
                op.centimes > 0 -> VertRevenu
                else -> MaterialTheme.colorScheme.onSurface
            },
        )
    }
}

@Composable
private fun DialogueOperation(op: Operation, fermer: () -> Unit) {
    var categorie by remember { mutableStateOf(op.categorie) }
    var toujours by remember { mutableStateOf(true) }
    var motCle by remember { mutableStateOf(cleCommercant(op.libelle).ifEmpty { op.libelle }) }
    AlertDialog(
        onDismissRequest = fermer,
        title = { Text(op.libelle, maxLines = 2, overflow = TextOverflow.Ellipsis) },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState())) {
                Text("${euros(op.centimes)} · ${op.banque.nom} · ${dateLisible(op.date)}", fontSize = 14.sp)
                Spacer(Modifier.height(8.dp))
                Text("Catégorie", fontWeight = FontWeight.Bold)
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    CATEGORIES.forEach { c ->
                        FilterChip(selected = categorie == c, onClick = { categorie = c }, label = { Text(c, fontSize = 13.sp) })
                    }
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Checkbox(checked = toujours, onCheckedChange = { toujours = it })
                    Text("Toujours classer pareil quand le libellé contient :", fontSize = 14.sp)
                }
                if (toujours) OutlinedTextField(value = motCle, onValueChange = { motCle = it }, singleLine = true)
            }
        },
        confirmButton = {
            TextButton(onClick = {
                Depot.changerCategorie(op.id, categorie, if (toujours) motCle else null)
                fermer()
            }) { Text("Enregistrer") }
        },
        dismissButton = {
            TextButton(onClick = { Depot.supprimer(op.id); fermer() }) { Text("Supprimer", color = Rouge) }
        },
    )
}

@Composable
private fun DialogueAjout(fermer: () -> Unit) {
    var montant by remember { mutableStateOf("") }
    var libelle by remember { mutableStateOf("") }
    var categorie by remember { mutableStateOf("Autre") }
    var revenu by remember { mutableStateOf(false) }
    val centimes = lireCentimes(montant)?.let { kotlin.math.abs(it) }?.takeIf { it > 0 }
    AlertDialog(
        onDismissRequest = fermer,
        title = { Text("Ajouter une opération") },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState())) {
                OutlinedTextField(
                    value = montant, onValueChange = { montant = it }, label = { Text("Montant en €") }, singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                )
                OutlinedTextField(
                    value = libelle,
                    onValueChange = { libelle = it; categorie = categoriser(it, -1, Depot.donnees.value.regles) },
                    label = { Text("Libellé (ex. Boulangerie)") }, singleLine = true,
                )
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Switch(checked = revenu, onCheckedChange = { revenu = it })
                    Spacer(Modifier.width(8.dp))
                    Text(if (revenu) "Argent reçu" else "Dépense")
                }
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    CATEGORIES.forEach { c ->
                        FilterChip(selected = categorie == c, onClick = { categorie = c }, label = { Text(c, fontSize = 13.sp) })
                    }
                }
            }
        },
        confirmButton = {
            TextButton(enabled = centimes != null && libelle.isNotBlank(), onClick = {
                val valeur = if (revenu) centimes!! else -centimes!!
                Depot.ajouter(
                    Operation(
                        "manuel-${UUID.randomUUID()}", System.currentTimeMillis(), valeur, libelle.trim(),
                        Banque.AUTRE, categorie, Origine.MANUEL,
                    ),
                )
                fermer()
            }) { Text("Ajouter") }
        },
        dismissButton = { TextButton(onClick = fermer) { Text("Annuler") } },
    )
}

// ---------- Abonnements ----------

@Composable
private fun EcranAbonnements(donnees: Donnees) {
    val abonnements = remember(donnees.operations) { detecterAbonnements(donnees.operations) }
    LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item {
            Carte {
                Text("Abonnements et dépenses qui reviennent", fontSize = 14.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text("${euros(abonnements.sumOf { it.centimesParMois })} / mois", fontSize = 30.sp, fontWeight = FontWeight.Bold)
                Text("Soit environ ${euros(abonnements.sumOf { it.centimesParMois } * 12)} par an.", fontSize = 14.sp)
            }
        }
        if (abonnements.isEmpty()) item {
            Text(
                "Aucun pour l'instant. Un abonnement apparaît ici quand il est rangé dans « Abonnements » ou qu'il revient deux mois de suite.",
                color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 14.sp,
            )
        }
        items(abonnements) { a ->
            Row(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp))
                    .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)).padding(12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(Modifier.weight(1f)) {
                    Text(a.nom, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(
                        "Dernier : ${dateLisible(a.dernier)}" + if (a.nbMois > 1) " · vu sur ${a.nbMois} mois" else "",
                        fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Text(euros(a.centimesParMois), fontWeight = FontWeight.Bold)
            }
        }
    }
}

// ---------- Réglages ----------

@Suppress("DEPRECATION")
private fun nomAppli(context: Context, paquet: String): String = runCatching {
    val pm = context.packageManager
    pm.getApplicationLabel(pm.getApplicationInfo(paquet, 0)).toString()
}.getOrDefault(paquet)

private fun lireTexte(context: Context, uri: Uri): String {
    val octets = context.contentResolver.openInputStream(uri)?.use { it.readBytes() } ?: return ""
    val utf8 = octets.toString(Charsets.UTF_8)
    // Les relevés de La Banque Postale sont souvent en ISO-8859-1.
    return if (utf8.contains('�')) octets.toString(Charset.forName("ISO-8859-1")) else utf8
}

@Composable
private fun EcranReglages(donnees: Donnees, acces: Boolean) {
    val context = LocalContext.current
    var banqueImport by remember { mutableStateOf(Banque.BANQUE_POSTALE) }
    var message by remember { mutableStateOf<String?>(null) }
    var confirmerEffacement by remember { mutableStateOf(false) }
    val choixFichier = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        val resultat = runCatching { lireCsv(lireTexte(context, uri), donnees.regles, banqueImport) }.getOrNull()
        if (resultat == null || resultat.operations.isEmpty()) {
            message = "Aucune opération reconnue dans ce fichier. Il faut un export CSV avec une date, un libellé et un montant."
        } else {
            message = "Import en cours…"
            Depot.importer(resultat.operations) { n ->
                message = "$n opération(s) ajoutée(s) depuis ${banqueImport.nom}" +
                    (if (resultat.operations.size > n) " (${resultat.operations.size - n} déjà connues)" else "") + "."
            }
        }
    }

    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Carte {
            Text("Lecture des paiements en direct", fontWeight = FontWeight.Bold)
            Text(
                if (acces) "Activée. Chaque notification de paiement de tes applis bancaires est ajoutée automatiquement."
                else "Désactivée. Autorise « Mon budget » à lire les notifications : seules celles des applis bancaires sont gardées, et rien ne quitte ton téléphone.",
                fontSize = 14.sp,
            )
            Spacer(Modifier.height(6.dp))
            Button(onClick = { context.startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)) }) {
                Text(if (acces) "Ouvrir le réglage" else "Activer")
            }
            if (!acces) {
                Text(
                    "Si Android dit « paramètre restreint » : ouvre les infos de l'appli, menu ⋮ en haut à droite, " +
                        "« Autoriser les paramètres restreints », puis reviens ici.",
                    fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                TextButton(onClick = {
                    context.startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${context.packageName}")))
                }) { Text("Infos de l'appli") }
            }
            Text(
                "Pense aussi à activer les notifications de paiement par carte dans La Banque Postale, Boursorama et Revolut.",
                fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }

        Carte {
            Text("Importer un relevé (CSV)", fontWeight = FontWeight.Bold)
            Text(
                "Pour récupérer les prélèvements et l'historique : exporte un relevé CSV depuis le site ou l'appli de ta banque, puis choisis-le ici.",
                fontSize = 14.sp,
            )
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                listOf(Banque.BANQUE_POSTALE, Banque.BOURSORAMA, Banque.REVOLUT).forEach { b ->
                    FilterChip(selected = banqueImport == b, onClick = { banqueImport = b }, label = { Text(b.nom, fontSize = 12.sp) })
                }
            }
            Button(onClick = { choixFichier.launch(arrayOf("*/*")) }) { Text("Choisir le fichier") }
            message?.let { Text(it, fontSize = 14.sp, color = MaterialTheme.colorScheme.primary) }
        }

        Carte {
            Text("Applis suivies", fontWeight = FontWeight.Bold)
            @Suppress("DEPRECATION")
            val installees = APPLIS_CONNUES.keys.filter { runCatching { context.packageManager.getPackageInfo(it, 0) }.isSuccess }
            if (installees.isEmpty()) Text("Aucune appli bancaire connue trouvée sur ce téléphone.", fontSize = 14.sp)
            installees.forEach { Text("✓ ${nomAppli(context, it)}", fontSize = 14.sp) }
            donnees.applisEnPlus.forEach { p ->
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("✓ ${nomAppli(context, p)}", fontSize = 14.sp, modifier = Modifier.weight(1f))
                    TextButton(onClick = { Depot.suivreAppli(p, false) }) { Text("Retirer") }
                }
            }
        }

        if (donnees.journal.isNotEmpty()) Carte {
            Text("Dernières notifications avec un montant", fontWeight = FontWeight.Bold)
            Text(
                "Pour vérifier ce que l'appli a compris. Pour une appli non suivie, seul son nom est gardé.",
                fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            donnees.journal.take(25).forEach { v ->
                HorizontalDivider(Modifier.padding(vertical = 6.dp))
                val suivie = Depot.banqueDe(v.appli, donnees) != null
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(
                            "${nomAppli(context, v.appli)} · ${dateLisible(v.date)}",
                            fontSize = 12.sp, fontWeight = FontWeight.SemiBold,
                        )
                        if (v.texte.isNotEmpty()) Text(v.texte, fontSize = 12.sp, maxLines = 3, overflow = TextOverflow.Ellipsis)
                        Text(
                            when {
                                v.retenue -> "Ajoutée au budget"
                                suivie -> "Pas reconnue comme un paiement"
                                else -> "Appli non suivie"
                            },
                            fontSize = 12.sp,
                            color = if (v.retenue) VertRevenu else MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    if (!suivie) OutlinedButton(onClick = { Depot.suivreAppli(v.appli, true) }) { Text("Suivre", fontSize = 12.sp) }
                }
            }
            TextButton(onClick = { Depot.viderJournal() }) { Text("Vider la liste") }
        }

        if (donnees.regles.isNotEmpty()) Carte {
            Text("Mes règles de classement", fontWeight = FontWeight.Bold)
            donnees.regles.forEach { r ->
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("« ${r.motCle} » → ${r.categorie}", fontSize = 14.sp, modifier = Modifier.weight(1f))
                    TextButton(onClick = { Depot.supprimerRegle(r) }) { Text("Retirer") }
                }
            }
        }

        Carte {
            Text("Confidentialité", fontWeight = FontWeight.Bold)
            Text(
                "L'appli n'a pas accès à Internet. Tes opérations restent dans un fichier privé sur ce téléphone, " +
                    "et elle ne demande jamais tes identifiants bancaires.",
                fontSize = 14.sp,
            )
            TextButton(onClick = { confirmerEffacement = true }) { Text("Tout effacer", color = Rouge) }
        }
        Spacer(Modifier.height(24.dp))
    }

    if (confirmerEffacement) AlertDialog(
        onDismissRequest = { confirmerEffacement = false },
        title = { Text("Tout effacer ?") },
        text = { Text("Toutes les opérations et règles seront supprimées de ce téléphone.") },
        confirmButton = { TextButton(onClick = { Depot.toutEffacer(); confirmerEffacement = false }) { Text("Effacer", color = Rouge) } },
        dismissButton = { TextButton(onClick = { confirmerEffacement = false }) { Text("Annuler") } },
    )
}

@Composable
private fun Carte(fond: Color = MaterialTheme.colorScheme.surface, contenu: @Composable () -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = fond),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
    ) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) { contenu() }
    }
}
