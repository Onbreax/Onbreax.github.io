package fr.onbreax.matchwork;

import android.app.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.*;
import android.print.PrintManager;
import android.view.*;
import android.webkit.*;
import android.widget.*;
import org.json.JSONObject;
import java.io.*;
import java.nio.charset.StandardCharsets;

public class MainActivity extends Activity {
 private MatchworkRuntime runtime;
 private LinearLayout root;
 private WebView web, printWeb;
 private ValueCallback<Uri[]> picker;
 private String pendingExport;
 private boolean choosingExport, visible;
 private final Handler handler = new Handler(Looper.getMainLooper());
 @Override public void onCreate(Bundle state) {
  super.onCreate(state); runtime = MatchworkRuntime.get(this);
  root = new LinearLayout(this); root.setOrientation(LinearLayout.VERTICAL); root.setBackgroundColor(0xffe9edf2);
  root.setOnApplyWindowInsetsListener((view, insets) -> applySafeInsets(view, insets));
  setContentView(root); configureWindow(); restoreEngine();
 }
 void restoreEngine() {
  web = runtime.view(this);
  if (web.getParent() instanceof ViewGroup) ((ViewGroup) web.getParent()).removeView(web);
  root.addView(web, new LinearLayout.LayoutParams(-1, -1)); web.onResume();
  root.requestApplyInsets();
 }
 boolean isVisible() { return visible; }
 @Override protected void onResume() { super.onResume(); visible = true; runtime.attach(this); if (web != null) web.onResume(); root.requestApplyInsets(); }
 private void configureWindow() {
  Window window = getWindow();
  window.setBackgroundDrawable(new android.graphics.drawable.ColorDrawable(0xffe9edf2));
  window.setStatusBarColor(android.graphics.Color.TRANSPARENT);
  window.setNavigationBarColor(android.graphics.Color.TRANSPARENT);
  if (Build.VERSION.SDK_INT >= 29) { window.setNavigationBarContrastEnforced(false); window.setStatusBarContrastEnforced(false); }
  if (Build.VERSION.SDK_INT >= 30) {
   window.setDecorFitsSystemWindows(false);
   // The native container sizes for IME exactly once; WebView receives zeroed IME insets.
   window.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_NOTHING);
   WindowInsetsController controller = window.getInsetsController();
   if (controller != null) {
    int light = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
    controller.setSystemBarsAppearance(light, light);
   }
  } else {
   window.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
   window.getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
  }
 }
 private WindowInsets applySafeInsets(View view, WindowInsets insets) {
  if (Build.VERSION.SDK_INT >= 30) {
   int safeTypes = WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout();
   android.graphics.Insets safe = insets.getInsets(safeTypes);
   android.graphics.Insets ime = insets.getInsets(WindowInsets.Type.ime());
   view.setPadding(safe.left, safe.top, safe.right, InsetsPolicy.bottom(safe.bottom, ime.bottom, insets.isVisible(WindowInsets.Type.ime())));
   // Do not consume: zero the dimensions handled here, and deliver subsequent hide updates.
   return new WindowInsets.Builder(insets)
    .setInsets(safeTypes | WindowInsets.Type.ime(), android.graphics.Insets.NONE)
    .setInsetsIgnoringVisibility(safeTypes, android.graphics.Insets.NONE)
    .setDisplayCutout(null).setSystemWindowInsets(android.graphics.Insets.NONE).build();
  }
  int left = insets.getStableInsetLeft(), top = insets.getStableInsetTop(), right = insets.getStableInsetRight();
  if (Build.VERSION.SDK_INT >= 28 && insets.getDisplayCutout() != null) {
   DisplayCutout cutout = insets.getDisplayCutout();
   left = Math.max(left, cutout.getSafeInsetLeft()); top = Math.max(top, cutout.getSafeInsetTop()); right = Math.max(right, cutout.getSafeInsetRight());
  }
  // Older Android already resizes the window for IME; only reserve its stable bars here.
  view.setPadding(left, top, right, insets.getStableInsetBottom());
  return insets.replaceSystemWindowInsets(0, 0, 0, 0);
 }
 @Override protected void onPause() {
  visible = false;
  // Keep active JS alive; the service owns network calls and a bounded CPU wake lock.
  if (web != null && !runtime.state.isRunning()) web.onPause();
  super.onPause();
 }
 void requestNotificationsIfNeeded() {
  if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission("android.permission.POST_NOTIFICATIONS") != PackageManager.PERMISSION_GRANTED
   && !getPreferences(MODE_PRIVATE).getBoolean("notificationsAsked", false)) {
   getPreferences(MODE_PRIVATE).edit().putBoolean("notificationsAsked", true).apply();
   requestPermissions(new String[]{"android.permission.POST_NOTIFICATIONS"}, 12);
  }
 }
 boolean chooseFile(ValueCallback<Uri[]> callback, WebChromeClient.FileChooserParams params) {
  if (picker != null) picker.onReceiveValue(null); picker = callback;
  Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*");
  intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, params.getMode() == WebChromeClient.FileChooserParams.MODE_OPEN_MULTIPLE);
  try { startActivityForResult(intent, 10); } catch (ActivityNotFoundException error) { picker.onReceiveValue(null); picker = null; error("Sélecteur de fichiers indisponible."); }
  return true;
 }
 void save(JSONObject data) throws Exception {
  if (choosingExport) { error("Un enregistrement est déjà en cours."); return; }
  String name = data.getString("name").replaceAll("[^a-zA-Z0-9._-]", "_");
  String type = data.optString("type", "application/octet-stream");
  if (!type.equals("application/json") && !type.equals("text/csv")) type = "text/plain";
  pendingExport = data.getString("text"); choosingExport = true;
  Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType(type).putExtra(Intent.EXTRA_TITLE, name);
  try { startActivityForResult(intent, 11); } catch (ActivityNotFoundException error) { pendingExport = null; choosingExport = false; error("Enregistrement indisponible."); }
 }
 void print(String html) {
  if (printWeb != null) printWeb.destroy(); printWeb = new WebView(this);
  printWeb.getSettings().setJavaScriptEnabled(false); printWeb.getSettings().setAllowFileAccess(false); printWeb.getSettings().setBlockNetworkLoads(true);
  printWeb.setWebViewClient(new WebViewClient() { @Override public void onPageFinished(WebView view, String url) {
   ((PrintManager) getSystemService(PRINT_SERVICE)).print("Matchwork", view.createPrintDocumentAdapter("Matchwork"), null);
  }});
  printWeb.loadDataWithBaseURL(MatchworkRuntime.ORIGIN, html, "text/html", "UTF-8", null);
 }
 @Override protected void onActivityResult(int request, int result, Intent data) {
  super.onActivityResult(request, result, data);
  if (request == 10 && picker != null) { picker.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result, data)); picker = null; }
  if (request == 11) {
   String text = pendingExport; pendingExport = null; choosingExport = false;
   if (result == RESULT_OK && data != null && data.getData() != null && text != null) {
    Uri uri = data.getData();
    new Thread(() -> {
     try (OutputStream output = getContentResolver().openOutputStream(uri, "wt")) {
      if (output == null) throw new IOException(); output.write(text.getBytes(StandardCharsets.UTF_8));
      handler.post(() -> Toast.makeText(this, "Fichier enregistré", Toast.LENGTH_SHORT).show());
     } catch (Exception error) { handler.post(() -> error("Le fichier n’a pas pu être enregistré.")); }
    }).start();
   }
  }
 }
 @Override public void onBackPressed() {
  if (web == null) { finish(); return; }
  web.evaluateJavascript("(function(){var d=document.querySelector('.drawer.open');if(d){d.classList.remove('open');return true;}return false;})()", result -> {
   if (!"true".equals(result)) {
    if (runtime.state.isRunning()) moveTaskToBack(true);
    else new AlertDialog.Builder(this).setMessage("Quitter Matchwork ?").setNegativeButton("Rester", null).setPositiveButton("Quitter", (dialog, which) -> finish()).show();
   }
  });
 }
 void error(String message) { if (!isFinishing() && !isDestroyed()) new AlertDialog.Builder(this).setMessage(message).setPositiveButton("OK", null).show(); }
 @Override protected void onDestroy() {
  visible = false; if (picker != null) picker.onReceiveValue(null);
  if (web != null && web.getParent() == root) root.removeView(web);
  if (printWeb != null) printWeb.destroy(); runtime.detach(this);
  // The shared engine survives the loss of its Activity.
  super.onDestroy();
 }
}
