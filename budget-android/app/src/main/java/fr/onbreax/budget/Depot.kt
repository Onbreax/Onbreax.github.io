package fr.onbreax.budget

import android.content.Context
import java.io.File
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.json.Json

/**
 * Toutes les données de l'appli, dans un seul fichier JSON privé sur le téléphone.
 * Partagé entre l'écran et le service qui lit les notifications (même processus).
 */
object Depot {
    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }
    private val verrou = Mutex()
    private val portee = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val _donnees = MutableStateFlow(Donnees())
    val donnees: StateFlow<Donnees> = _donnees
    private var fichier: File? = null

    @Synchronized
    fun ouvrir(context: Context) {
        if (fichier != null) return
        val f = File(context.applicationContext.filesDir, "budget.json")
        fichier = f
        if (f.exists()) {
            runCatching { _donnees.value = json.decodeFromString(Donnees.serializer(), f.readText()) }
        }
    }

    private fun modifier(changement: (Donnees) -> Donnees) {
        portee.launch {
            verrou.withLock {
                val nouvelles = changement(_donnees.value)
                _donnees.value = nouvelles
                val f = fichier ?: return@withLock
                val tmp = File(f.parentFile, "budget.json.tmp")
                tmp.writeText(json.encodeToString(Donnees.serializer(), nouvelles))
                tmp.renameTo(f)
            }
        }
    }

    fun banqueDe(appli: String, d: Donnees = _donnees.value): Banque? =
        APPLIS_CONNUES[appli] ?: if (appli in d.applisEnPlus) Banque.AUTRE else null

    /** Appelé par le service à chaque notification qui contient un montant en euros. */
    fun notificationRecue(appli: String, titre: String, texte: String, quand: Long) = modifier { d ->
        val banque = banqueDe(appli, d)
        val lu = if (banque != null) lireNotification(titre, texte) else null
        // Pour une appli non suivie (messagerie…), on ne garde que son nom, jamais le contenu du message.
        val vue = NotificationVue(quand, appli, if (banque != null) "$titre — $texte".take(300) else "", lu != null)
        val journal = (listOf(vue) + d.journal.filterNot {
            it.appli == appli && (banque == null || it.texte == vue.texte)
        }).take(60)
        if (banque == null || lu == null) return@modifier d.copy(journal = journal)
        val op = Operation(
            id = "notif-$appli-$quand-${lu.centimes}",
            date = quand,
            centimes = lu.centimes,
            libelle = lu.libelle,
            banque = banque,
            categorie = categoriser(lu.libelle, lu.centimes, d.regles),
            origine = Origine.NOTIFICATION,
        )
        // Même paiement vu deux fois (notification mise à jour, ou Google Wallet + la banque) : on garde le premier.
        val recentes = d.operations.filter { it.origine == Origine.NOTIFICATION }
        if (estDoublon(op, recentes, fenetreMs = 10 * 60 * 1000L)) return@modifier d.copy(journal = journal)
        d.copy(operations = d.operations + op, journal = journal)
    }

    /** Ajoute les lignes d'un relevé. Une ligne déjà notifiée quelques jours plus tôt ne compte pas deux fois. */
    fun importer(ops: List<Operation>, fini: (ajoutees: Int) -> Unit) = modifier { d ->
        val ids = d.operations.map { it.id }.toMutableSet()
        val notifs = d.operations.filter { it.origine == Origine.NOTIFICATION }.toMutableList()
        val ajout = mutableListOf<Operation>()
        for (op in ops) {
            if (op.id in ids) continue
            val deja = notifs.firstOrNull {
                it.centimes == op.centimes && (it.banque == op.banque || it.banque == Banque.GOOGLE_WALLET || it.banque == Banque.AUTRE) &&
                    kotlin.math.abs(it.date - op.date) <= 4 * 24 * 3600 * 1000L
            }
            if (deja != null) { notifs.remove(deja); continue }
            ids += op.id
            ajout += op
        }
        fini(ajout.size)
        d.copy(operations = d.operations + ajout)
    }

    fun ajouter(op: Operation) = modifier { it.copy(operations = it.operations + op) }

    fun supprimer(id: String) = modifier { d -> d.copy(operations = d.operations.filterNot { it.id == id }) }

    /** Change la catégorie d'une opération ; avec [motCle], crée une règle et reclasse les opérations qui la contiennent. */
    fun changerCategorie(id: String, categorie: String, motCle: String?) = modifier { d ->
        val regles = if (motCle.isNullOrBlank()) d.regles
        else listOf(Regle(motCle.trim(), categorie)) + d.regles.filterNot { normaliser(it.motCle) == normaliser(motCle) }
        val cle = motCle?.let { normaliser(it) }?.takeIf { it.isNotBlank() }
        d.copy(
            regles = regles,
            operations = d.operations.map {
                when {
                    it.id == id -> it.copy(categorie = categorie)
                    cle != null && normaliser(it.libelle).contains(cle) -> it.copy(categorie = categorie)
                    else -> it
                }
            },
        )
    }

    fun supprimerRegle(regle: Regle) = modifier { d -> d.copy(regles = d.regles - regle) }

    fun suivreAppli(appli: String, suivre: Boolean) = modifier { d ->
        d.copy(applisEnPlus = if (suivre) (d.applisEnPlus + appli).distinct() else d.applisEnPlus - appli)
    }

    fun viderJournal() = modifier { it.copy(journal = emptyList()) }

    fun toutEffacer() = modifier { Donnees() }
}
