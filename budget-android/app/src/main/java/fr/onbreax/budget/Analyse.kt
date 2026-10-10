package fr.onbreax.budget

import java.text.Normalizer
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.YearMonth
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import kotlin.math.abs

/** Catégorie dont les montants ne comptent ni comme dépense ni comme revenu (argent qui passe d'un compte à l'autre). */
const val TRANSFERTS = "Transferts entre comptes"

val CATEGORIES = listOf(
    "Abonnements", "Courses", "Restaurants", "Transport", "Shopping", "Logement et factures",
    "Santé", "Loisirs", "Retraits", "Revenus", TRANSFERTS, "Autre",
)

/** Applis Android dont on lit les notifications de paiement. */
val APPLIS_CONNUES = mapOf(
    "fr.labanquepostale.android" to Banque.BANQUE_POSTALE,
    "com.fullsix.android.labanquepostale.accountaccess" to Banque.BANQUE_POSTALE,
    "com.boursorama.android.clients" to Banque.BOURSORAMA,
    "com.revolut.revolut" to Banque.REVOLUT,
    "com.google.android.apps.walletnfcrel" to Banque.GOOGLE_WALLET,
    "com.paypal.android.p2pmobile" to Banque.PAYPAL,
)

private val REGLES_DE_BASE: List<Pair<String, String>> = listOf(
    // Mouvements entre tes propres comptes : à mettre avant le reste.
    "revolut" to TRANSFERTS, "boursorama" to TRANSFERTS, "banque postale" to TRANSFERTS,
    "virement interne" to TRANSFERTS, "top-up" to TRANSFERTS, "rechargement" to TRANSFERTS,
    "netflix" to "Abonnements", "spotify" to "Abonnements", "deezer" to "Abonnements",
    "disney" to "Abonnements", "canal+" to "Abonnements", "prime video" to "Abonnements",
    "amazon prime" to "Abonnements", "youtube" to "Abonnements", "google play" to "Abonnements",
    "google *" to "Abonnements", "apple.com" to "Abonnements", "icloud" to "Abonnements",
    "openai" to "Abonnements", "chatgpt" to "Abonnements", "anthropic" to "Abonnements",
    "claude.ai" to "Abonnements", "microsoft" to "Abonnements", "playstation" to "Abonnements",
    "xbox" to "Abonnements", "dazn" to "Abonnements", "molotov" to "Abonnements",
    "basic fit" to "Abonnements", "fitness park" to "Abonnements",
    "carrefour" to "Courses", "leclerc" to "Courses", "lidl" to "Courses", "aldi" to "Courses",
    "auchan" to "Courses", "intermarche" to "Courses", "monoprix" to "Courses", "franprix" to "Courses",
    "super u" to "Courses", "hyper u" to "Courses", "casino" to "Courses", "picard" to "Courses",
    "grand frais" to "Courses", "netto" to "Courses", "biocoop" to "Courses",
    "mcdo" to "Restaurants", "mcdonald" to "Restaurants", "burger king" to "Restaurants",
    "kfc" to "Restaurants", "uber eats" to "Restaurants", "ubereats" to "Restaurants",
    "deliveroo" to "Restaurants", "just eat" to "Restaurants", "starbucks" to "Restaurants",
    "restaurant" to "Restaurants", "boulangerie" to "Restaurants", "pizza" to "Restaurants",
    "sushi" to "Restaurants", "o'tacos" to "Restaurants", "five guys" to "Restaurants",
    "totalenergies" to "Logement et factures",
    "sncf" to "Transport", "ratp" to "Transport", "navigo" to "Transport", "uber" to "Transport",
    "bolt" to "Transport", "heetch" to "Transport", "blablacar" to "Transport", "total" to "Transport",
    "esso" to "Transport", "shell" to "Transport", "avia" to "Transport", "peage" to "Transport",
    "vinci" to "Transport", "sanef" to "Transport", "parking" to "Transport", "lime" to "Transport",
    "amazon" to "Shopping", "amzn" to "Shopping", "cdiscount" to "Shopping", "fnac" to "Shopping",
    "darty" to "Shopping", "zara" to "Shopping", "h&m" to "Shopping", "decathlon" to "Shopping",
    "aliexpress" to "Shopping", "temu" to "Shopping", "shein" to "Shopping", "vinted" to "Shopping",
    "action" to "Shopping", "ikea" to "Shopping", "leroy merlin" to "Shopping", "boulanger" to "Shopping",
    "edf" to "Logement et factures", "engie" to "Logement et factures",
    "free mobile" to "Logement et factures", "free telecom" to "Logement et factures",
    "orange" to "Logement et factures", "sfr" to "Logement et factures", "bouygues" to "Logement et factures",
    "sosh" to "Logement et factures", "loyer" to "Logement et factures", "assurance" to "Logement et factures",
    "veolia" to "Logement et factures", "impots" to "Logement et factures", "dgfip" to "Logement et factures",
    "pharmacie" to "Santé", "doctolib" to "Santé", "docteur" to "Santé", "dentiste" to "Santé",
    "mutuelle" to "Santé", "cpam" to "Santé",
    "steam" to "Loisirs", "cinema" to "Loisirs", "pathe" to "Loisirs", "ugc" to "Loisirs",
    "fdj" to "Loisirs", "pmu" to "Loisirs", "betclic" to "Loisirs", "winamax" to "Loisirs",
    "ticketmaster" to "Loisirs", "airbnb" to "Loisirs", "booking" to "Loisirs",
    "retrait" to "Retraits", "dab" to "Retraits", "withdrawal" to "Retraits",
    "salaire" to "Revenus", "caf" to "Revenus", "france travail" to "Revenus",
)

/** Les mots-clés de base doivent être des mots entiers : « action » ne doit pas trouver « transaction ». */
private val REGLES_COMPILEES: List<Pair<Regex, String>> = REGLES_DE_BASE.map { (mot, cat) ->
    val fin = if (mot.last().isLetter()) "s?(?![a-z])" else ""
    Regex("(?<![a-z0-9])" + Regex.escape(mot) + fin) to cat
}

fun normaliser(texte: String): String =
    Normalizer.normalize(texte.lowercase(), Normalizer.Form.NFD)
        .replace(Regex("\\p{Mn}+"), "")
        .replace(Regex("\\s+"), " ")
        .trim()

/** Range un libellé : d'abord les règles de l'utilisateur, ensuite les règles de base. */
fun categoriser(libelle: String, centimes: Long, regles: List<Regle>): String {
    val texte = normaliser(libelle)
    regles.firstOrNull { it.motCle.isNotBlank() && texte.contains(normaliser(it.motCle)) }?.let { return it.categorie }
    REGLES_COMPILEES.firstOrNull { it.first.containsMatchIn(texte) }?.let { return it.second }
    return if (centimes > 0) "Revenus" else "Autre"
}

/** Clé courte pour regrouper un commerçant : « PRLV SEPA NETFLIX.COM 123 » et « Netflix » donnent un résultat proche. */
fun cleCommercant(libelle: String): String =
    normaliser(libelle)
        .replace(Regex("\\b(cb|carte|prlv|sepa|paiement|achat|facture|du|le|x?\\d{4})\\b"), " ")
        .replace(Regex("[^a-z ]"), " ")
        .replace(Regex("\\s+"), " ")
        .trim()
        .split(" ")
        .filter { it.length > 1 }
        .take(2)
        .joinToString(" ")

// ---------- Montants ----------

private const val NOMBRE =
    """(?<![\d.,])[+\-−]?(?:\d{1,3}(?:[ \u00a0\u202f.,]\d{3})+|\d+)(?:[.,]\d{1,2})?(?![\d])"""

private val MONTANT = Regex(
    """(?:€|\beur)\s?($NOMBRE)|($NOMBRE)\s?(?:€|eur\b|euros?\b)""",
    RegexOption.IGNORE_CASE,
)

/** Transforme « 1 234,56 », « 12.5 » ou « -3,00 » en centimes. */
fun lireCentimes(brut: String): Long? {
    var s = brut.trim().replace("−", "-").replace(Regex("[   €]"), "").replace(Regex("(?i)eur(os?)?"), "")
    if (s.isEmpty()) return null
    val negatif = s.startsWith("-")
    s = s.trimStart('+', '-')
    val virgule = s.lastIndexOf(',')
    val point = s.lastIndexOf('.')
    val sep = maxOf(virgule, point)
    val (entier, decimales) = if (sep >= 0 && s.length - sep - 1 in 1..2) {
        s.substring(0, sep).replace(".", "").replace(",", "") to s.substring(sep + 1).padEnd(2, '0')
    } else {
        s.replace(".", "").replace(",", "") to "00"
    }
    if (entier.isEmpty() && decimales == "00") return null
    val valeur = (entier.ifEmpty { "0" }.toLongOrNull() ?: return null) * 100 + (decimales.toLongOrNull() ?: return null)
    return if (negatif) -valeur else valeur
}

/** Premier montant en euros trouvé dans un texte, toujours positif. */
fun trouverMontant(texte: String): Long? {
    val m = MONTANT.find(texte) ?: return null
    val brut = m.groupValues[1].ifEmpty { m.groupValues[2] }
    return lireCentimes(brut)?.let { abs(it) }?.takeIf { it > 0 }
}

// ---------- Notifications ----------

private val MOTS_IGNORES = listOf(
    "refuse", "declin", "echou", "failed", "annul", "confirmez", "a confirmer", "confirm your", "validez", "a valider",
    "approve", "authentifi", "3d secure", "3ds", "code", "securipass", "certicode", "plafond", "offre", "gagne",
    "parrain", "solde de votre", "votre solde", "balance is",
)
private val MOTS_REVENU = listOf(
    "vous avez recu", "virement recu", "received", "credite", "rembours", "refund", "virement entrant",
    "vous a envoye", "sent you", "added to",
)
private val MOTS_DEPENSE = listOf(
    "paye", "paiement", "achat", "depense", "debit", "prelev", "retrait", "paid", "spent", "payment",
    "purchase", "withdraw", "carte", "card", "envoye a", "sent to", "virement emis", "transaction",
)

data class PaiementLu(val centimes: Long, val libelle: String)

/**
 * Lit une notification bancaire. Renvoie null si ce n'est pas un paiement réalisé
 * (pub, code de sécurité, paiement refusé, simple solde…).
 */
fun lireNotification(titre: String, texte: String): PaiementLu? {
    val complet = "$titre\n$texte"
    val n = normaliser(complet)
    if (MOTS_IGNORES.any { n.contains(it) }) return null
    val montant = trouverMontant(complet) ?: return null
    val revenu = MOTS_REVENU.any { n.contains(it) }
    val depense = MOTS_DEPENSE.any { n.contains(it) }
    if (!revenu && !depense) return null
    val centimes = if (revenu && !n.contains("debit")) montant else -montant
    return PaiementLu(centimes, trouverCommercant(titre, texte))
}

private val NOMS_GENERIQUES = Regex(
    "(?i)^(revolut|boursorama|boursobank|la banque postale|banque postale|google wallet|google pay|paypal|paiement|" +
        "paiement par carte|achat|nouvelle operation|nouvelle opération|operation|opération|transaction|alerte)\\b.*",
)

fun trouverCommercant(titre: String, texte: String): String {
    val complet = "$titre. $texte"
    val apres = Regex(
        """(?i)\b(?:chez|aupr[eè]s de|at|to|from|de la part de|à)\s+([^\n,;:!?()]{2,40}?)(?=\s*(?:[.,;:!?()]|\n|$| le \d| pour | avec | sur | via | de \d|\d+[.,]\d{2}))""",
    ).findAll(complet)
        .map { it.groupValues[1].trim().trimEnd('.') }
        .firstOrNull { trouverMontant(it) == null && !it.first().isDigit() && it.any(Char::isLetter) && normaliser(it) !in setOf("votre compte", "la carte", "votre carte") }
    if (apres != null) return apres.take(40)
    val t = titre.trim()
    if (t.isNotEmpty() && !NOMS_GENERIQUES.matches(t) && trouverMontant(t) == null) return t.take(40)
    return texte.lineSequence().firstOrNull()?.trim()?.take(40)?.ifEmpty { null } ?: "Paiement"
}

/** Vrai si [nouvelle] est sans doute la même dépense qu'une opération déjà connue (ex. Google Wallet + banque). */
fun estDoublon(nouvelle: Operation, existantes: List<Operation>, fenetreMs: Long): Boolean =
    existantes.any { abs(it.date - nouvelle.date) <= fenetreMs && it.centimes == nouvelle.centimes }

// ---------- Import CSV ----------

data class ResultatCsv(val operations: List<Operation>, val ignorees: Int)

private fun decouper(ligne: String, sep: Char): List<String> {
    val champs = mutableListOf<String>()
    val courant = StringBuilder()
    var guillemets = false
    var i = 0
    while (i < ligne.length) {
        val c = ligne[i]
        when {
            c == '"' && guillemets && i + 1 < ligne.length && ligne[i + 1] == '"' -> { courant.append('"'); i++ }
            c == '"' -> guillemets = !guillemets
            c == sep && !guillemets -> { champs += courant.toString().trim(); courant.clear() }
            else -> courant.append(c)
        }
        i++
    }
    champs += courant.toString().trim()
    return champs
}

private val FORMATS_DATE = listOf("dd/MM/yyyy", "d/M/yyyy", "yyyy-MM-dd", "dd-MM-yyyy", "dd/MM/yy", "dd.MM.yyyy")

fun lireDate(brut: String, zone: ZoneId): Long? {
    val s = brut.trim()
    runCatching { return LocalDateTime.parse(s.replace(' ', 'T').take(19)).atZone(zone).toInstant().toEpochMilli() }
    val jour = s.take(10).trim()
    for (f in FORMATS_DATE) {
        runCatching {
            return LocalDate.parse(jour, DateTimeFormatter.ofPattern(f)).atTime(12, 0).atZone(zone).toInstant().toEpochMilli()
        }
    }
    return null
}

private fun colonne(entetes: List<String>, vararg mots: String, sauf: List<String> = emptyList()): Int =
    entetes.indexOfFirst { e -> mots.any { e.contains(it) } && sauf.none { e.contains(it) } }

/**
 * Lit un relevé CSV (La Banque Postale, Boursorama, Revolut ou autre).
 * Cherche la ligne d'en-tête toute seule : les lignes d'introduction avant elle sont ignorées.
 */
fun lireCsv(
    contenu: String,
    regles: List<Regle>,
    banqueChoisie: Banque? = null,
    zone: ZoneId = ZoneId.systemDefault(),
): ResultatCsv {
    val lignes = contenu.removePrefix("﻿").lines().filter { it.isNotBlank() }
    for ((index, ligne) in lignes.withIndex()) {
        val sep = listOf(';', ',', '\t').maxBy { s -> ligne.count { it == s } }
        val entetes = decouper(ligne, sep).map { normaliser(it.trim('"')) }
        val cDate = colonne(entetes, "date", sauf = listOf("valeur", "completed", "val"))
            .takeIf { it >= 0 } ?: colonne(entetes, "date")
        val cLibelle = colonne(entetes, "libelle", "label", "description", "detail", "intitule", "nature")
        val cMontant = colonne(entetes, "montant", "amount", sauf = listOf("devise", "currency"))
        val cDebit = colonne(entetes, "debit")
        val cCredit = colonne(entetes, "credit")
        if (cDate < 0 || cLibelle < 0 || (cMontant < 0 && cDebit < 0)) continue
        val cEtat = colonne(entetes, "state", "statut", "etat")
        val cFrais = colonne(entetes, "fee", "frais")
        val texteEntete = entetes.joinToString(" ")
        val banque = banqueChoisie ?: when {
            texteEntete.contains("started date") || texteEntete.contains("product") -> Banque.REVOLUT
            texteEntete.contains("dateop") || texteEntete.contains("categoryparent") -> Banque.BOURSORAMA
            lignes.take(index).any { normaliser(it).contains("banque postale") } || texteEntete.contains("montant(euros)") -> Banque.BANQUE_POSTALE
            else -> Banque.AUTRE
        }
        val ops = mutableListOf<Operation>()
        val vues = mutableMapOf<String, Int>()
        var ignorees = 0
        for (l in lignes.drop(index + 1)) {
            val c = decouper(l, sep).map { it.trim('"') }
            fun champ(i: Int) = c.getOrNull(i).orEmpty()
            if (cEtat >= 0 && champ(cEtat).isNotEmpty() && normaliser(champ(cEtat)) !in setOf("completed", "termine", "effectue")) {
                ignorees++; continue
            }
            val date = lireDate(champ(cDate), zone)
            var centimes = if (cMontant >= 0) lireCentimes(champ(cMontant)) else {
                val d = lireCentimes(champ(cDebit))?.let { -abs(it) } ?: 0L
                val cr = if (cCredit >= 0) lireCentimes(champ(cCredit))?.let { abs(it) } ?: 0L else 0L
                (d + cr).takeIf { it != 0L }
            }
            if (cFrais >= 0 && centimes != null) centimes -= abs(lireCentimes(champ(cFrais)) ?: 0L)
            val libelle = champ(cLibelle).replace(Regex("\\s+"), " ")
            if (date == null || centimes == null || centimes == 0L || libelle.isEmpty()) { ignorees++; continue }
            // Deux lignes identiques (deux cafés le même jour) gardent chacune leur identifiant ;
            // réimporter le même relevé redonne les mêmes identifiants, donc pas de doublon.
            val cle = "csv-${banque.name}-$date-$centimes-${normaliser(libelle).hashCode()}"
            val rang = vues.merge(cle, 1, Int::plus)!!
            ops += Operation(
                id = "$cle-$rang",
                date = date,
                centimes = centimes,
                libelle = libelle,
                banque = banque,
                categorie = categoriser(libelle, centimes, regles),
                origine = Origine.CSV,
            )
        }
        return ResultatCsv(ops, ignorees)
    }
    return ResultatCsv(emptyList(), lignes.size)
}

// ---------- Résumés ----------

fun moisDe(date: Long, zone: ZoneId = ZoneId.systemDefault()): YearMonth =
    YearMonth.from(Instant.ofEpochMilli(date).atZone(zone))

data class ResumeMois(
    val depenses: Long,
    val revenus: Long,
    val parCategorie: List<Pair<String, Long>>,
    val operations: List<Operation>,
)

fun resumer(ops: List<Operation>, mois: YearMonth, zone: ZoneId = ZoneId.systemDefault()): ResumeMois {
    val duMois = ops.filter { moisDe(it.date, zone) == mois }.sortedByDescending { it.date }
    val comptees = duMois.filter { it.categorie != TRANSFERTS }
    val depenses = comptees.filter { it.centimes < 0 }
    return ResumeMois(
        depenses = -depenses.sumOf { it.centimes },
        revenus = comptees.filter { it.centimes > 0 }.sumOf { it.centimes },
        parCategorie = depenses.groupBy { it.categorie }
            .map { (cat, l) -> cat to -l.sumOf { it.centimes } }
            .sortedByDescending { it.second },
        operations = duMois,
    )
}

data class Abonnement(val nom: String, val centimesParMois: Long, val dernier: Long, val nbMois: Int)

/**
 * Repère les dépenses qui reviennent : même commerçant, montant proche, au moins deux mois différents.
 * Tout ce qui est rangé dans « Abonnements » compte aussi, même vu une seule fois.
 */
fun detecterAbonnements(ops: List<Operation>, zone: ZoneId = ZoneId.systemDefault()): List<Abonnement> =
    ops.filter { it.centimes < 0 && it.categorie != TRANSFERTS }
        .groupBy { cleCommercant(it.libelle) }
        .filterKeys { it.isNotEmpty() }
        .mapNotNull { (_, groupe) ->
            val dernier = groupe.maxBy { it.date }
            val proches = groupe.filter { abs(it.centimes - dernier.centimes) <= abs(dernier.centimes) / 10 }
            val mois = proches.map { moisDe(it.date, zone) }.toSet()
            // Un abonnement passe environ une fois par mois ; des courses au même magasin passent bien plus souvent.
            val regulier = mois.size >= 2 && proches.size <= mois.size + 1 && groupe.size <= mois.size * 2
            val estAbonnement = regulier || dernier.categorie == "Abonnements"
            if (!estAbonnement) null
            else Abonnement(dernier.libelle, -dernier.centimes, dernier.date, mois.size)
        }
        .sortedByDescending { it.centimesParMois }

fun euros(centimes: Long): String {
    val signe = if (centimes < 0) "-" else ""
    val a = abs(centimes)
    val entier = (a / 100).toString().reversed().chunked(3).joinToString(" ").reversed()
    return "$signe$entier,${(a % 100).toString().padStart(2, '0')} €"
}
