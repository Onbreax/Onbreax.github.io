package fr.onbreax.budget

import android.app.Notification
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification

/**
 * Reçoit les notifications du téléphone. Seules celles qui contiennent un montant en euros sont regardées ;
 * celles des applis bancaires suivies deviennent des opérations. Rien n'est envoyé hors du téléphone.
 */
class EcouteurPaiements : NotificationListenerService() {

    override fun onListenerConnected() {
        Depot.ouvrir(this)
    }

    override fun onNotificationPosted(sbn: StatusBarNotification) {
        if (sbn.packageName == packageName) return
        val n = sbn.notification ?: return
        if (n.flags and Notification.FLAG_GROUP_SUMMARY != 0) return
        val extras = n.extras ?: return
        val titre = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString().orEmpty()
        val texte = (extras.getCharSequence(Notification.EXTRA_BIG_TEXT) ?: extras.getCharSequence(Notification.EXTRA_TEXT))
            ?.toString().orEmpty()
        if (trouverMontant("$titre $texte") == null) return
        Depot.ouvrir(this)
        Depot.notificationRecue(sbn.packageName, titre, texte, sbn.postTime)
    }
}
