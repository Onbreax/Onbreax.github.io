package fr.onbreax.premiereauto;

import android.app.*;
import android.content.*;
import android.graphics.*;
import android.net.Uri;
import android.os.*;
import android.view.*;
import android.webkit.*;
import android.widget.*;
import org.json.JSONObject;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;

public class MainActivity extends Activity {
 private static final String ORIGIN = "https://appassets.androidplatform.net";
 private static final String PAGE = ORIGIN + "/assets/index.html";
 private WebView web;
 private FrameLayout root;
 private WebMessagePort channel;
 private ValueCallback<Uri[]> picker;
 private String exportText;
 private boolean exporting;
 private final Handler main = new Handler(Looper.getMainLooper());
 private final ExecutorService network = Executors.newSingleThreadExecutor();

 @Override public void onCreate(Bundle state) {
  super.onCreate(state);
  root = new FrameLayout(this); root.setBackgroundColor(0xfff6f5f1);
  root.setOnApplyWindowInsetsListener((view, insets) -> applyInsets(view, insets));
  setContentView(root); configureWindow();
  web = new WebView(this); web.setBackgroundColor(0xfff6f5f1);
  WebSettings settings = web.getSettings();
  settings.setJavaScriptEnabled(true); settings.setDomStorageEnabled(true);
  settings.setAllowFileAccess(false); settings.setAllowContentAccess(true);
  settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
  settings.setSupportMultipleWindows(false);
  web.setWebViewClient(new WebViewClient() {
   @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
    Uri uri = request.getUrl();
    if (!"https".equals(uri.getScheme()) || !"appassets.androidplatform.net".equals(uri.getHost())
     || !"/assets/index.html".equals(uri.getPath()) || !"GET".equals(request.getMethod())) return unavailable();
    try {
     Map<String,String> headers = new HashMap<>();
     headers.put("Cache-Control", "no-store");
     headers.put("Content-Security-Policy", "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'");
     return new WebResourceResponse("text/html", "UTF-8", 200, "OK", headers, getAssets().open("index.html"));
    } catch (Exception ignored) { return unavailable(); }
   }
   @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
    Uri uri=request.getUrl();
    if("https".equals(uri.getScheme())&&"appassets.androidplatform.net".equals(uri.getHost())&&"/assets/index.html".equals(uri.getPath())&&uri.getQuery()==null)return false;
    if (request.isForMainFrame()) openExternal(request.getUrl());
    return true;
   }
   @Override public void onPageStarted(WebView view, String url, Bitmap icon) { closePort(); }
   @Override public void onPageFinished(WebView view, String url) {
    if (!PAGE.equals(url) || channel != null) return;
    WebMessagePort[] ports = view.createWebMessageChannel(); channel = ports[0];
    channel.setWebMessageCallback(new WebMessagePort.WebMessageCallback() {
     @Override public void onMessage(WebMessagePort port, WebMessage message) { receive(message.getData()); }
    });
    view.postWebMessage(new WebMessage("premiere-auto:bridge:1", new WebMessagePort[]{ports[1]}), Uri.parse(ORIGIN));
   }
  });
  web.setWebChromeClient(new WebChromeClient() {
   @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> result, FileChooserParams params) {
    if (picker != null) picker.onReceiveValue(null); picker = result;
    Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*");
    try { startActivityForResult(intent, 10); }
    catch (ActivityNotFoundException error) { picker.onReceiveValue(null); picker = null; }
    return true;
   }
   @Override public boolean onJsAlert(WebView view, String url, String message, JsResult result) {
    new AlertDialog.Builder(MainActivity.this).setMessage(message).setPositiveButton("OK", (d,w)->result.confirm()).setOnCancelListener(d->result.confirm()).show();
    return true;
   }
   @Override public boolean onJsConfirm(WebView view, String url, String message, JsResult result) {
    new AlertDialog.Builder(MainActivity.this).setMessage(message).setPositiveButton("Confirmer", (d,w)->result.confirm()).setNegativeButton("Annuler",(d,w)->result.cancel()).setOnCancelListener(d->result.cancel()).show();
    return true;
   }
  });
  root.addView(web, new FrameLayout.LayoutParams(-1,-1));
  web.loadUrl(PAGE); root.requestApplyInsets();
 }
 private void configureWindow() {
  Window window = getWindow();
  window.setBackgroundDrawable(new android.graphics.drawable.ColorDrawable(0xfff6f5f1));
  window.setStatusBarColor(Color.TRANSPARENT); window.setNavigationBarColor(Color.TRANSPARENT);
  if (Build.VERSION.SDK_INT >= 29) { window.setStatusBarContrastEnforced(false); window.setNavigationBarContrastEnforced(false); }
  if (Build.VERSION.SDK_INT >= 30) {
   window.setDecorFitsSystemWindows(false); window.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_NOTHING);
   WindowInsetsController controller = window.getInsetsController();
   if (controller != null) {
    int appearance = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
    controller.setSystemBarsAppearance(appearance, appearance);
   }
  } else {
   window.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
   window.getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
  }
 }
 private WindowInsets applyInsets(View view, WindowInsets insets) {
  if (Build.VERSION.SDK_INT >= 30) {
   int types = WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout();
   android.graphics.Insets safe = insets.getInsets(types), ime = insets.getInsets(WindowInsets.Type.ime());
   int bottom = Math.max(safe.bottom, insets.isVisible(WindowInsets.Type.ime()) ? ime.bottom : 0);
   view.setPadding(safe.left, safe.top, safe.right, bottom);
   return new WindowInsets.Builder(insets).setInsets(types | WindowInsets.Type.ime(), android.graphics.Insets.NONE)
    .setInsetsIgnoringVisibility(types, android.graphics.Insets.NONE).setDisplayCutout(null).setSystemWindowInsets(android.graphics.Insets.NONE).build();
  }
  int top = insets.getStableInsetTop(), left = insets.getStableInsetLeft(), right = insets.getStableInsetRight();
  if (Build.VERSION.SDK_INT >= 28 && insets.getDisplayCutout() != null) {
   DisplayCutout cutout = insets.getDisplayCutout();
   top = Math.max(top,cutout.getSafeInsetTop());left=Math.max(left,cutout.getSafeInsetLeft());right=Math.max(right,cutout.getSafeInsetRight());
  }
  view.setPadding(left,top,right,insets.getStableInsetBottom());
  return insets.replaceSystemWindowInsets(0,0,0,0);
 }
 private WebResourceResponse unavailable() {
  return new WebResourceResponse("text/plain","UTF-8",403,"Forbidden",new HashMap<>(),new ByteArrayInputStream(new byte[0]));
 }
 private void openExternal(Uri uri) {
  if (!"https".equals(uri.getScheme())) return;
  try { startActivity(new Intent(Intent.ACTION_VIEW,uri).addCategory(Intent.CATEGORY_BROWSABLE)); }
  catch (ActivityNotFoundException error) { Toast.makeText(this,"Aucun navigateur disponible.",Toast.LENGTH_LONG).show(); }
 }
 private void receive(String raw) {
  try {
   // A full selection backup can exceed the size of an HTTP request.
   if (raw == null || raw.length()>32*1024*1024) return;
   JSONObject data=new JSONObject(raw);String action=data.optString("action"),id=data.optString("id");
   if (!"save".equals(action) && raw.length()>1024*1024) {reply(id,null,"Requête trop volumineuse.");return;}
   if ("ready".equals(action)) { reply(id,new JSONObject(),null); }
   else if ("get".equals(action)) network.execute(()->request(data,id));
   else if ("save".equals(action)) save(data,id);
  } catch (Exception ignored) { }
 }
 private void request(JSONObject data,String id) {
  HttpURLConnection connection=null;
  try {
   String url=data.getString("url");
   if(url.length()>2000)throw new IOException();
   URI uri=new URI(url);
   if(!PublicPolicy.allowed(uri))throw new IOException();
   connection=(HttpURLConnection)uri.toURL().openConnection();
   connection.setInstanceFollowRedirects(false);connection.setRequestMethod("GET");
   connection.setConnectTimeout(10000);connection.setReadTimeout(25000);
   connection.setRequestProperty("Accept","application/json");
   connection.setRequestProperty("User-Agent","PremiereAuto/1.0.0");
   int status=connection.getResponseCode();InputStream input=status>=400?connection.getErrorStream():connection.getInputStream();
   ByteArrayOutputStream bytes=new ByteArrayOutputStream();long deadline=SystemClock.elapsedRealtime()+30000;
   if(input!=null)try(InputStream stream=input){byte[] buffer=new byte[8192];int n;while((n=stream.read(buffer))!=-1){if(bytes.size()+n>2*1024*1024||SystemClock.elapsedRealtime()>deadline)throw new IOException();bytes.write(buffer,0,n);}}
   reply(id,new JSONObject().put("status",status).put("text",new String(bytes.toByteArray(),StandardCharsets.UTF_8)),null);
  }catch(Exception error){reply(id,null,"Connexion interrompue ou adresse non autorisée. Le relevé local reste disponible.");}
  finally{if(connection!=null)connection.disconnect();}
 }
 private void save(JSONObject data,String id) throws Exception {
  if(exporting){reply(id,null,"Un export est déjà ouvert.");return;}
  String name=data.getString("name").replaceAll("[^a-zA-Z0-9._-]","_"),type=data.getString("type");
  if(name.length()>150 || !"application/json".equals(type)){reply(id,null,"Export invalide.");return;}
  exportText=data.getString("text");if(exportText.length()>20*1024*1024){exportText=null;reply(id,null,"Export trop volumineux.");return;}
  exporting=true;
  Intent intent=new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType(type).putExtra(Intent.EXTRA_TITLE,name);
  try{startActivityForResult(intent,11);reply(id,new JSONObject().put("chooserOpened",true),null);}
  catch(ActivityNotFoundException error){exportText=null;exporting=false;reply(id,null,"Sélecteur d’enregistrement indisponible.");}
 }
 @Override protected void onActivityResult(int request,int result,Intent intent){
  super.onActivityResult(request,result,intent);
  if(request==10 && picker!=null){picker.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result,intent));picker=null;}
  if(request==11){
   String text=exportText;exportText=null;exporting=false;
   if(result==RESULT_OK&&intent!=null&&intent.getData()!=null&&text!=null){
    Uri uri=intent.getData();
    network.execute(()->{try(OutputStream output=getContentResolver().openOutputStream(uri,"wt")){if(output==null)throw new IOException();output.write(text.getBytes(StandardCharsets.UTF_8));main.post(()->Toast.makeText(this,"Fichier enregistré.",Toast.LENGTH_LONG).show());}catch(Exception error){main.post(()->Toast.makeText(this,"Le fichier n’a pas été enregistré.",Toast.LENGTH_LONG).show());}});
   }
  }
 }
 private void send(JSONObject data) {
  main.post(()->{if(channel!=null)try{channel.postMessage(new WebMessage(data.toString()));}catch(Exception ignored){ }});
 }
 private void reply(String id,JSONObject value,String error){
  try{send(new JSONObject().put("id",id).put("ok",error==null).put("value",value==null?JSONObject.NULL:value).put("error",error==null?JSONObject.NULL:error));}catch(Exception ignored){ }
 }
 private void closePort(){if(channel!=null){try{channel.close();}catch(Exception ignored){ }channel=null;}}
 @Override protected void onResume(){super.onResume();if(web!=null){web.onResume();}if(root!=null)root.requestApplyInsets();}
 @Override protected void onPause(){if(web!=null)web.onPause();super.onPause();}
 @Override public void onBackPressed(){
  if(web==null){moveTaskToBack(true);return;}
  web.evaluateJavascript("(function(){var m=document.getElementById('overlay');if(m&&!m.hidden){document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));return true;}return false;})()",result->{if(!"true".equals(result))moveTaskToBack(true);});
 }
 @Override protected void onDestroy(){if(picker!=null)picker.onReceiveValue(null);closePort();network.shutdownNow();if(web!=null)web.destroy();super.onDestroy();}
}
