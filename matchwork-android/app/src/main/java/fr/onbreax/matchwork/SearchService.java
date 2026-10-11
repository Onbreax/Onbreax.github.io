package fr.onbreax.matchwork;

import android.app.*;
import android.content.*;
import android.content.pm.ServiceInfo;
import android.os.*;

/** Lives only during a user operation. No automatic restart of paid work. */
public final class SearchService extends Service {
 static final String START = "fr.onbreax.matchwork.START";
 static final String STOP = "fr.onbreax.matchwork.STOP_AFTER_STEP";
 private static final String CHANNEL = "matchwork_search";
 private static final int RUNNING_NOTIFICATION = 701, FINISHED_NOTIFICATION = 702;
 static SearchService current;
 private MatchworkRuntime runtime;
 private PowerManager.WakeLock wakeLock;
 private final Handler main = new Handler(Looper.getMainLooper());
 private String token;
 private boolean complete;
 private long lastUpdate;
 private final Runnable deadline = () -> runtime.interrupt("Durée maximale de la recherche atteinte. Les résultats enregistrés sont conservés ; aucun appel relancé.");
 @Override public void onCreate() {
  super.onCreate(); current = this; runtime = MatchworkRuntime.get(this);
  NotificationManager manager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
  NotificationChannel channel = new NotificationChannel(CHANNEL, "Recherches Matchwork", NotificationManager.IMPORTANCE_LOW);
  channel.setDescription("Avancement et arrêt des recherches en cours"); manager.createNotificationChannel(channel);
 }
 @Override public int onStartCommand(Intent intent, int flags, int startId) {
  if (intent == null) { stopSelf(); return START_NOT_STICKY; }
  String requestedToken = intent.getStringExtra("token");
  if (STOP.equals(intent.getAction())) {
   runtime.requestStop(requestedToken);
   if (!runtime.state.isRunning()) stopSelf();
   return START_NOT_STICKY;
  }
  if (!START.equals(intent.getAction()) || !runtime.state.isCurrent(requestedToken)) {
   if (!runtime.state.isRunning()) stopSelf();
   return START_NOT_STICKY;
  }
  token = requestedToken;
  complete = false; release();
  ((NotificationManager) getSystemService(NOTIFICATION_SERVICE)).cancel(FINISHED_NOTIFICATION);
  try {
   Notification notification = notification("Recherche en cours", "Préparation…", true, 0, 0);
   if (Build.VERSION.SDK_INT >= 29) startForeground(RUNNING_NOTIFICATION, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
   else startForeground(RUNNING_NOTIFICATION, notification);
   PowerManager power = (PowerManager) getSystemService(POWER_SERVICE);
   wakeLock = power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Matchwork:search");
   wakeLock.setReferenceCounted(false); wakeLock.acquire(2 * 60 * 60 * 1000L);
   main.postDelayed(deadline, 2 * 60 * 60 * 1000L);
   runtime.started(token);
  } catch (Exception error) { runtime.interrupt("Android n’a pas permis de démarrer la recherche en arrière-plan. Aucun appel IA lancé."); }
  return START_NOT_STICKY;
 }
 private Notification notification(String title, String text, boolean running, int done, int total) {
  Intent open = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
  PendingIntent content = PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
  Notification.Builder builder = new Notification.Builder(this, CHANNEL).setSmallIcon(android.R.drawable.ic_menu_search)
   .setContentTitle(title).setContentText(text).setContentIntent(content).setOnlyAlertOnce(true)
   .setOngoing(running).setAutoCancel(!running).setVisibility(Notification.VISIBILITY_PRIVATE).setCategory(Notification.CATEGORY_PROGRESS);
  if (running) {
   PendingIntent stop = PendingIntent.getService(this, 1, new Intent(this, SearchService.class).setAction(STOP).putExtra("token", token), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
   builder.addAction(new Notification.Action.Builder(android.R.drawable.ic_media_pause, "Arrêter après cette étape", stop).build());
   builder.setProgress(Math.max(0, total), Math.max(0, Math.min(done, total)), total <= 0);
  }
  return builder.build();
 }
 void progress(String phase, int done, int total) {
  if (complete || !runtime.state.isCurrent(token)) return;
  long now = SystemClock.elapsedRealtime(); if (now - lastUpdate < 500) return; lastUpdate = now;
  String label = phase == null || phase.isEmpty() ? "Traitement en cours" : phase.substring(0, Math.min(phase.length(), 60));
  String text = total > 0 ? label + " : " + Math.max(0, Math.min(done, total)) + "/" + total : label;
  try { ((NotificationManager) getSystemService(NOTIFICATION_SERVICE)).notify(RUNNING_NOTIFICATION, notification("Recherche en cours", text, true, done, total)); } catch (Exception ignored) { }
 }
 void complete(String status) {
  if (complete) return; complete = true; release(); stopForeground(STOP_FOREGROUND_REMOVE);
  String title = "interrupted".equals(status) ? "Recherche interrompue" : "stopped".equals(status) ? "Recherche arrêtée" : "error".equals(status) ? "Recherche terminée avec erreurs" : "Recherche terminée";
  try { ((NotificationManager) getSystemService(NOTIFICATION_SERVICE)).notify(FINISHED_NOTIFICATION, notification(title, "Les résultats enregistrés sont disponibles dans Matchwork.", false, 0, 0)); } catch (Exception ignored) { }
  main.postDelayed(() -> { if (complete && !runtime.state.isRunning()) stopSelf(); }, 100);
 }
 private void release() { main.removeCallbacks(deadline); if (wakeLock != null && wakeLock.isHeld()) wakeLock.release(); wakeLock = null; }
 @Override public void onTimeout(int startId, int foregroundServiceType) {
  runtime.interrupt("Android a arrêté le service de recherche. Les résultats enregistrés sont conservés ; aucun appel relancé.");
  release(); stopSelf();
 }
 @Override public void onDestroy() {
  release(); if (current == this) current = null;
  if (!complete && runtime != null && runtime.state.isCurrent(token)) runtime.interrupt("Le service de recherche a été arrêté. Les résultats enregistrés sont conservés.");
  super.onDestroy();
 }
 @Override public IBinder onBind(Intent intent) { return null; }
}
