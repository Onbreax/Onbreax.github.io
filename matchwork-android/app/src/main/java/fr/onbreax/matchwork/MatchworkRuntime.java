package fr.onbreax.matchwork;

import android.content.*;
import android.net.Uri;
import android.os.*;
import android.view.ViewGroup;
import android.webkit.*;
import org.json.JSONObject;
import java.io.ByteArrayInputStream;
import java.util.HashMap;
import java.util.Map;

/** Application-owned engine: the Activity only hosts its view and pickers. */
final class MatchworkRuntime {
 static final String ORIGIN = "https://appassets.androidplatform.net";
 static final String PAGE = ORIGIN + "/assets/index.html";
 private static MatchworkRuntime instance;
 static synchronized MatchworkRuntime get(Context context) {
  if (instance == null) instance = new MatchworkRuntime(context.getApplicationContext());
  return instance;
 }
 final Context context;
 final Handler main = new Handler(Looper.getMainLooper());
 final OperationState state = new OperationState();
 final NativeHttp http;
 WebView web;
 private MutableContextWrapper viewContext;
 MainActivity host;
 private WebMessagePort channel;
 private String startRequest;
 private boolean sent;
 private MatchworkRuntime(Context context) { this.context = context; http = new NativeHttp(this, context); }
 boolean trusted(Uri uri) {
  return "https".equals(uri.getScheme()) && "appassets.androidplatform.net".equals(uri.getHost())
   && (uri.getPort() == -1 || uri.getPort() == 443) && uri.getUserInfo() == null && "/assets/index.html".equals(uri.getPath());
 }
 WebView view(MainActivity activity) {
  attach(activity);
  if (web != null) return web;
  viewContext = new MutableContextWrapper(activity);
  web = new WebView(viewContext);
  WebSettings settings = web.getSettings();
  settings.setJavaScriptEnabled(true); settings.setDomStorageEnabled(true);
  settings.setAllowFileAccess(false); settings.setAllowContentAccess(true);
  settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW); settings.setSupportMultipleWindows(false);
  web.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, false);
  web.setWebViewClient(new WebViewClient() {
   @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
    Uri uri = request.getUrl();
    if (!"appassets.androidplatform.net".equals(uri.getHost())) return null;
    String path = uri.getPath();
    if (!"https".equals(uri.getScheme()) || (uri.getPort() != -1 && uri.getPort() != 443) || path == null || !path.startsWith("/assets/") || path.contains("..") || !"GET".equals(request.getMethod())) return unavailable();
    String name = path.substring(8);
    if (!name.equals("index.html") && !name.equals("pdf.min.js") && !name.equals("pdf.worker.min.js")) return unavailable();
    try {
     Map<String, String> headers = new HashMap<>();
     headers.put("Cache-Control", "no-store");
     headers.put("Content-Security-Policy", "frame-src 'none'; object-src 'none'; base-uri 'self'");
     return new WebResourceResponse(name.endsWith(".html") ? "text/html" : "application/javascript", "UTF-8", 200, "OK", headers, context.getAssets().open(name));
    } catch (Exception ignored) { return unavailable(); }
   }
   @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
    if (request.isForMainFrame() && trusted(request.getUrl()) && !state.isRunning()) return false;
    if (request.isForMainFrame()) openExternal(request.getUrl());
    return true;
   }
   @Override public void onPageStarted(WebView view, String url, android.graphics.Bitmap icon) {
    sent = false; closeChannel();
   }
   @Override public void onPageFinished(WebView view, String url) {
    if (sent || !trusted(Uri.parse(url))) return;
    sent = true; WebMessagePort[] ports = view.createWebMessageChannel(); channel = ports[0];
    channel.setWebMessageCallback(new WebMessagePort.WebMessageCallback() {
     @Override public void onMessage(WebMessagePort port, WebMessage message) { receive(message.getData()); }
    });
    view.postWebMessage(new WebMessage("matchwork:bridge:1", new WebMessagePort[]{ports[1]}), Uri.parse(ORIGIN));
   }
   @Override public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
    interrupt("Le moteur de recherche a été interrompu par Android. Les résultats enregistrés sont conservés.");
    closeChannel(); if (view.getParent() instanceof ViewGroup) ((ViewGroup) view.getParent()).removeView(view);
    view.destroy(); web = null;
    if (host != null) host.restoreEngine();
    return true;
   }
  });
  web.setWebChromeClient(new WebChromeClient() {
   @Override public boolean onJsAlert(WebView view, String url, String message, JsResult result) {
    if (host != null && host.isVisible()) new android.app.AlertDialog.Builder(host).setMessage(message).setPositiveButton("OK", (dialog, which) -> result.confirm()).setOnCancelListener(dialog -> result.confirm()).show();
    else result.confirm();
    return true;
   }
   @Override public boolean onJsConfirm(WebView view, String url, String message, JsResult result) {
    if (host != null && host.isVisible()) new android.app.AlertDialog.Builder(host).setMessage(message).setPositiveButton("Continuer", (dialog, which) -> result.confirm()).setNegativeButton("Annuler", (dialog, which) -> result.cancel()).setOnCancelListener(dialog -> result.cancel()).show();
    else result.cancel();
    return true;
   }
   @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
    if (host == null) { callback.onReceiveValue(null); return false; }
    return host.chooseFile(callback, params);
   }
  });
  web.loadUrl(PAGE); return web;
 }
 private WebResourceResponse unavailable() {
  return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found", new HashMap<>(), new ByteArrayInputStream(new byte[0]));
 }
 void attach(MainActivity activity) { host = activity; if (viewContext != null) viewContext.setBaseContext(activity); }
 void detach(MainActivity activity) { if (host == activity) { host = null; if (viewContext != null) viewContext.setBaseContext(context); } }
 private void closeChannel() { if (channel != null) { try { channel.close(); } catch (Exception ignored) { } channel = null; } }
 void openExternal(Uri uri) {
  if (!"https".equals(uri.getScheme()) && !"http".equals(uri.getScheme())) return;
  try { context.startActivity(new Intent(Intent.ACTION_VIEW, uri).addCategory(Intent.CATEGORY_BROWSABLE).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); }
  catch (ActivityNotFoundException ignored) { if (host != null) host.error("Aucun navigateur disponible."); }
 }
 private void receive(String text) {
  try {
   if (text == null || text.length() > 5 * 1024 * 1024) return;
   JSONObject data = new JSONObject(text); String action = data.optString("action"), id = data.optString("id"), token = data.optString("token");
   if ("ready".equals(action)) {
    PowerManager power = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
    send(new JSONObject().put("type", "ready").put("batteryExempt", power.isIgnoringBatteryOptimizations(context.getPackageName())).put("receipts", http.pendingReceipts()));
   } else if ("begin".equals(action)) {
    if (host == null || !host.isVisible() || !state.begin(token)) { reply(id, null, "Une opération est déjà active ou Matchwork n’est pas visible."); return; }
    startRequest = id;
    try {
     host.requestNotificationsIfNeeded();
     context.startForegroundService(new Intent(context, SearchService.class).setAction(SearchService.START).putExtra("token", token));
    } catch (Exception error) {
     state.end(token); startRequest = null;
     reply(id, null, "Android n’a pas autorisé le démarrage de la recherche en arrière-plan. Aucun appel IA lancé.");
    }
   } else if ("fetch".equals(action)) {
    if (!state.canRequest(token)) { reply(id, null, "Arrêt demandé ; aucun nouvel appel lancé."); return; }
    http.fetch(data);
   } else if ("wait".equals(action)) {
    if (!state.canRequest(token)) { reply(id, null, "Arrêt demandé ; aucun nouvel appel lancé."); return; }
    main.postDelayed(() -> {
     if (state.canRequest(token)) reply(id, new JSONObject(), null);
     else reply(id, null, "Arrêt demandé ; aucun nouvel appel lancé.");
    }, Math.max(0, Math.min(5000, data.optInt("delay", 400))));
   } else if ("cost-ack".equals(action)) {
    http.acknowledge(data.optString("receipt"));
   } else if ("progress".equals(action) && state.isCurrent(token)) {
    SearchService service = SearchService.current;
    if (service != null) service.progress(data.optString("phase"), data.optInt("done"), data.optInt("total"));
   } else if ("end".equals(action) && state.isCurrent(token)) {
    finish(token, data.optString("status", "complete"));
   } else if ("battery-settings".equals(action) && host != null) {
    try { host.startActivity(new Intent(android.provider.Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)); }
    catch (ActivityNotFoundException ignored) { host.error("Les réglages batterie ne sont pas disponibles sur cet appareil."); }
   } else if ("save".equals(action) && host != null) {
    host.save(data);
   } else if ("print".equals(action) && host != null) {
    host.print(data.getString("html"));
   }
  } catch (Exception error) { if (host != null) host.error("Impossible de traiter cette action."); }
 }
 void started(String token) {
  if (!state.isCurrent(token)) return;
  try { reply(startRequest, new JSONObject().put("active", true), null); } catch (Exception ignored) { }
  startRequest = null;
 }
 void requestStop(String token) {
  if (!state.requestStop(token)) return;
  try { send(new JSONObject().put("type", "stop").put("token", token)); } catch (Exception ignored) { }
 }
 void finish(String token, String status) {
  if (!state.end(token)) return;
  startRequest = null;
  SearchService service = SearchService.current;
  if (service != null) service.complete(status);
  else context.stopService(new Intent(context, SearchService.class));
 }
 void interrupt(String message) {
  String token = state.token(); if (token == null) return;
  state.requestStop(token); http.interrupt();
  try { send(new JSONObject().put("type", "interrupted").put("token", token).put("message", message)); } catch (Exception ignored) { }
  if (startRequest != null) reply(startRequest, null, message);
  finish(token, "interrupted");
 }
 void send(JSONObject data) {
  main.post(() -> { if (channel != null) try { channel.postMessage(new WebMessage(data.toString())); } catch (Exception ignored) { } });
 }
 void reply(String id, JSONObject value, String error) {
  if (id == null || id.isEmpty()) return;
  try { send(new JSONObject().put("type", "reply").put("id", id).put("ok", error == null).put("value", value == null ? JSONObject.NULL : value).put("error", error == null ? JSONObject.NULL : error)); } catch (Exception ignored) { }
 }
}
