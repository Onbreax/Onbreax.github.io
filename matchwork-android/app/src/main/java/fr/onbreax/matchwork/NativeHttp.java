package fr.onbreax.matchwork;

import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import java.util.concurrent.*;

/** Native network deadlines cover the response body even with the screen off. */
final class NativeHttp {
 private final MatchworkRuntime runtime;
 private final ExecutorService network = Executors.newSingleThreadExecutor();
 private final ScheduledExecutorService deadlines = Executors.newSingleThreadScheduledExecutor();
 private final SharedPreferences receipts;
 private volatile HttpURLConnection active;
 NativeHttp(MatchworkRuntime runtime, Context context) {
  this.runtime = runtime;
  receipts = context.getSharedPreferences("matchwork_pending_costs", Context.MODE_PRIVATE);
 }
 static boolean allowed(URI u) {
  if (!"https".equals(u.getScheme()) || u.getUserInfo() != null || (u.getPort() != -1 && u.getPort() != 443)) return false;
  String host = u.getHost(), path = u.getPath();
  return ("openrouter.ai".equals(host) && "/api/v1/chat/completions".equals(path))
   || ("api.adzuna.com".equals(host) && path != null && path.startsWith("/v1/api/jobs/fr/search/"))
   || ("r.jina.ai".equals(host) && path != null && path.startsWith("/"));
 }
 void fetch(final JSONObject request) {
  final String id = request.optString("id"), token = request.optString("token");
  network.execute(() -> {
   HttpURLConnection connection = null; ScheduledFuture<?> timer = null;
   try {
    if (!runtime.state.canRequest(token)) throw new IllegalStateException("Arrêt demandé ; aucun nouvel appel lancé.");
    URI uri = new URI(request.getString("url"));
    if (!allowed(uri)) throw new IllegalArgumentException("Source réseau non autorisée.");
    String method = request.optString("method", "GET");
    if (!"GET".equals(method) && !"POST".equals(method)) throw new IllegalArgumentException("Méthode réseau non autorisée.");
    if ("openrouter.ai".equals(uri.getHost()) && !"POST".equals(method)) throw new IllegalArgumentException("Méthode IA invalide.");
    if (!"openrouter.ai".equals(uri.getHost()) && !"GET".equals(method)) throw new IllegalArgumentException("Méthode source invalide.");
    String body = request.optString("body", "");
    if (body.length() > 4 * 1024 * 1024) throw new IllegalArgumentException("Requête trop volumineuse.");
    if ("openrouter.ai".equals(uri.getHost()) && receipts.getAll().size() >= 500) throw new IllegalStateException("Journal des coûts à synchroniser avant un nouvel appel IA.");
    int timeout = Math.max(1000, Math.min(180000, request.optInt("timeout", 90000)));
    connection = (HttpURLConnection) uri.toURL().openConnection(); active = connection;
    connection.setRequestMethod(method); connection.setConnectTimeout(timeout); connection.setReadTimeout(timeout);
    connection.setInstanceFollowRedirects(false);
    JSONObject headers = request.optJSONObject("headers");
    String[] permitted = {"Content-Type", "Authorization", "HTTP-Referer", "X-Title", "Accept", "X-Return-Format"};
    if (headers != null) for (String name : permitted) if (headers.has(name)) {
     if ("Authorization".equals(name) && !"openrouter.ai".equals(uri.getHost())) continue;
     String value = headers.getString(name);
     if (value.indexOf('\r') >= 0 || value.indexOf('\n') >= 0) throw new IllegalArgumentException("En-tête invalide.");
     connection.setRequestProperty(name, value);
    }
    final HttpURLConnection timedConnection = connection;
    timer = deadlines.schedule(timedConnection::disconnect, timeout, TimeUnit.MILLISECONDS);
    if ("POST".equals(method)) {
     byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
     connection.setDoOutput(true); connection.setFixedLengthStreamingMode(bytes.length);
     try (java.io.OutputStream output = connection.getOutputStream()) { output.write(bytes); }
    }
    int status = connection.getResponseCode();
    InputStream input = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
    ByteArrayOutputStream output = new ByteArrayOutputStream();
    if (input != null) try (InputStream stream = input) {
     byte[] bytes = new byte[8192]; int n;
     while ((n = stream.read(bytes)) != -1) {
      if (output.size() + n > 6 * 1024 * 1024) throw new IllegalStateException("Réponse réseau trop volumineuse.");
      output.write(bytes, 0, n);
     }
    }
    String text = new String(output.toByteArray(), StandardCharsets.UTF_8), receipt = "";
    if ("openrouter.ai".equals(uri.getHost()) && status >= 200 && status < 300) {
     JSONObject parsed = new JSONObject(text);
     receipt = UUID.randomUUID().toString();
     JSONObject entry = new JSONObject().put("id", receipt).put("usage", parsed.optJSONObject("usage") == null ? JSONObject.NULL : parsed.optJSONObject("usage"));
     if (!receipts.edit().putString(receipt, entry.toString()).commit()) throw new IllegalStateException("Le coût reçu n’a pas pu être enregistré sur l’appareil.");
    }
    runtime.reply(id, new JSONObject().put("status", status).put("body", text).put("receipt", receipt), null);
   } catch (Exception error) {
    // Do not expose credential-bearing URLs or response bodies.
    String message = error instanceof IllegalArgumentException || error instanceof IllegalStateException
     ? error.getMessage() : "Échec ou délai réseau dépassé. L’appel n’a pas été relancé.";
    runtime.reply(id, null, message);
   } finally {
    if (timer != null) timer.cancel(false);
    if (connection != null) connection.disconnect(); active = null;
   }
  });
 }
 JSONArray pendingReceipts() {
  JSONArray list = new JSONArray();
  for (Object value : receipts.getAll().values()) try { list.put(new JSONObject(String.valueOf(value))); } catch (Exception ignored) { }
  return list;
 }
 void acknowledge(String id) { if (id != null && !id.isEmpty()) receipts.edit().remove(id).commit(); }
 void interrupt() { HttpURLConnection connection = active; if (connection != null) connection.disconnect(); }
}
