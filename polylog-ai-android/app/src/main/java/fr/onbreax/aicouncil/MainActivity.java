package fr.onbreax.aicouncil;

import android.app.*;
import android.os.*;
import android.content.*;
import android.net.Uri;
import android.print.PrintManager;
import android.speech.RecognizerIntent;
import java.util.ArrayList;
import android.view.*;
import android.webkit.*;
import android.widget.*;
import androidx.webkit.*;
import org.json.JSONObject;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.Collections;

public class MainActivity extends Activity {
 private static final String ORIGIN="https://appassets.androidplatform.net";
 private WebView web, printWeb;
 private ValueCallback<Uri[]> picker;
 private String pendingExport;
 private boolean choosingExport;
 private String voiceTarget;
 private boolean closing;
 private final Handler handler=new Handler(Looper.getMainLooper());
 @Override public void onCreate(Bundle state) {
  super.onCreate(state);
  LinearLayout root=new LinearLayout(this); root.setOrientation(LinearLayout.VERTICAL);
  root.setBackgroundColor(0xfff4f6f9);
  root.setOnApplyWindowInsetsListener((v,insets)->{
   v.setPadding(insets.getSystemWindowInsetLeft(),insets.getSystemWindowInsetTop(),insets.getSystemWindowInsetRight(),insets.getSystemWindowInsetBottom());
   return insets.consumeSystemWindowInsets();
  });
  web=new WebView(this); root.addView(web,new LinearLayout.LayoutParams(-1,-1));setContentView(root);
  WebSettings s=web.getSettings(); s.setJavaScriptEnabled(true);s.setDomStorageEnabled(true);
  s.setAllowFileAccess(false);s.setAllowContentAccess(true);s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
  s.setSupportMultipleWindows(false);
  WebViewAssetLoader loader=new WebViewAssetLoader.Builder().addPathHandler("/assets/",new WebViewAssetLoader.AssetsPathHandler(this)).build();
  web.setWebViewClient(new WebViewClient(){
   @Override public WebResourceResponse shouldInterceptRequest(WebView v,WebResourceRequest r){return loader.shouldInterceptRequest(r.getUrl());}
   @Override public boolean shouldOverrideUrlLoading(WebView v,WebResourceRequest r){
    Uri u=r.getUrl();
    if(u.toString().startsWith(ORIGIN+"/assets/"))return false;
    if(r.isForMainFrame())openExternal(u);
    return true;
   }
  });
  web.setWebChromeClient(new WebChromeClient(){
   @Override public boolean onShowFileChooser(WebView v,ValueCallback<Uri[]> cb,FileChooserParams params){
    if(picker!=null)picker.onReceiveValue(null);picker=cb;
    Intent i=new Intent(Intent.ACTION_OPEN_DOCUMENT);i.addCategory(Intent.CATEGORY_OPENABLE);i.setType("*/*");
    i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE,params.getMode()==FileChooserParams.MODE_OPEN_MULTIPLE);
    try{startActivityForResult(i,10);}catch(ActivityNotFoundException e){picker.onReceiveValue(null);picker=null;error("Sélecteur de fichiers indisponible.");}return true;
   }
  });
  if(!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)){
   new AlertDialog.Builder(this).setMessage("Mets à jour Android System WebView pour utiliser Polylog AI.").setPositiveButton("Fermer",(d,w)->finish()).setCancelable(false).show();return;
  }
  WebViewCompat.addWebMessageListener(web,"PolylogNative",Collections.singleton(ORIGIN),(v,m,o,main,reply)->{
   if(!main||!("https".equals(o.getScheme())&&"appassets.androidplatform.net".equals(o.getHost())&&(o.getPort()==-1||o.getPort()==443)))return;
   try{JSONObject j=new JSONObject(m.getData());
    if("save".equals(j.optString("action")))save(j);
    else if("print".equals(j.optString("action")))print(j.getString("html"));
    else if("dictate".equals(j.optString("action")))dictate(j);
    else if("running".equals(j.optString("action"))){if(j.optBoolean("value"))getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);}
    else if("exit-ready".equals(j.optString("action"))&&closing)finish();
    else if("exit-error".equals(j.optString("action"))&&closing){closing=false;new AlertDialog.Builder(this).setMessage("La dernière sauvegarde a échoué. Tu peux revenir et exporter une sauvegarde, ou quitter malgré tout.").setNegativeButton("Revenir",null).setPositiveButton("Quitter",(d,w)->finish()).show();}
   }catch(Exception e){error("Cette opération n’a pas pu être effectuée.");}
  });
  web.loadUrl(ORIGIN+"/assets/index.html");
 }
 private void openExternal(Uri u){
  if(!"https".equals(u.getScheme())&&!"http".equals(u.getScheme()))return;
  try{startActivity(new Intent(Intent.ACTION_VIEW,u).addCategory(Intent.CATEGORY_BROWSABLE));}
  catch(ActivityNotFoundException e){error("Aucun navigateur disponible.");}
 }
 private void save(JSONObject j)throws Exception{
  if(choosingExport){error("Un enregistrement est déjà en cours.");return;}
  String name=j.getString("name").replaceAll("[^a-zA-Z0-9._-]","_");
  String type=j.optString("type","application/octet-stream");
  if(!type.equals("application/json")&&!type.equals("text/csv")&&!type.equals("text/markdown"))type="text/plain";
  pendingExport=j.getString("text");choosingExport=true;
  Intent i=new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType(type).putExtra(Intent.EXTRA_TITLE,name);
  try{startActivityForResult(i,11);}catch(ActivityNotFoundException e){pendingExport=null;choosingExport=false;error("Enregistrement indisponible.");}
 }
 private void print(String html){
  if(printWeb!=null)printWeb.destroy();
  printWeb=new WebView(this);
  printWeb.getSettings().setJavaScriptEnabled(false);
  printWeb.getSettings().setAllowFileAccess(false);
  printWeb.getSettings().setBlockNetworkLoads(true);
  printWeb.setWebViewClient(new WebViewClient(){@Override public void onPageFinished(WebView v,String url){
   PrintManager pm=(PrintManager)getSystemService(PRINT_SERVICE);
   pm.print("Polylog AI",v.createPrintDocumentAdapter("Polylog AI"),null);
  }});
  printWeb.loadDataWithBaseURL(ORIGIN,html,"text/html","UTF-8",null);
 }
 @Override protected void onActivityResult(int request,int result,Intent data){
  super.onActivityResult(request,result,data);
  if(request==10&&picker!=null){picker.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result,data));picker=null;}
  if(request==12){
   String target=voiceTarget;voiceTarget=null;
   if(result==RESULT_OK&&data!=null&&target!=null){
    ArrayList<String> words=data.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS);
    if(words!=null&&!words.isEmpty())try{
     JSONObject payload=new JSONObject().put("target",target).put("text",words.get(0));
     web.evaluateJavascript("window.dispatchEvent(new CustomEvent('polylog-dictation',{detail:"+payload.toString()+"}));",null);
    }catch(Exception e){error("Impossible d’insérer le texte dicté.");}
   }
  }
  if(request==11){
   String text=pendingExport; pendingExport=null;choosingExport=false;
   if(result==RESULT_OK&&data!=null&&data.getData()!=null&&text!=null){
    Uri uri=data.getData();
    new Thread(()->{try(OutputStream out=getContentResolver().openOutputStream(uri,"wt")){
     if(out==null)throw new IOException();out.write(text.getBytes(StandardCharsets.UTF_8));
     handler.post(()->Toast.makeText(this,"Fichier enregistré",Toast.LENGTH_SHORT).show());
    }catch(Exception e){handler.post(()->error("Le fichier n'a pas pu être enregistré."));}}).start();
   }
  }
 }
 private void dictate(JSONObject j){
  if(voiceTarget!=null)return;
  String target=j.optString("target");if(!"question".equals(target)&&!"userMsg".equals(target))return;
  String lang=j.optString("lang","fr");String locale="en".equals(lang)?"en-US":"es".equals(lang)?"es-ES":"fr-FR";
  Intent i=new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
  i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL,RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
  i.putExtra(RecognizerIntent.EXTRA_LANGUAGE,locale);i.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS,1);
  i.putExtra(RecognizerIntent.EXTRA_PROMPT,"Polylog AI — dicter un message");voiceTarget=target;
  try{startActivityForResult(i,12);}catch(ActivityNotFoundException e){voiceTarget=null;error("La reconnaissance vocale Android n’est pas disponible. Tu peux utiliser le micro de ton clavier ou écrire ton message.");}
 }
 @Override protected void onPause(){
  if(web!=null)web.evaluateJavascript("window.PolylogApp?.flush().catch(()=>{});",null);
  super.onPause();
 }
 @Override public void onBackPressed(){
  if(closing)return;
  web.evaluateJavascript("(function(){var d=document.querySelector('dialog[open]');if(d){d.close();return true;}var m=document.querySelector('.menu:not([hidden])');if(m){m.hidden=true;return true;}return false;})()",result->{
   if(!"true".equals(result))new AlertDialog.Builder(this).setMessage("Quitter Polylog AI ? Le débat sera arrêté et l’historique enregistré.").setNegativeButton("Rester",null).setPositiveButton("Quitter",(d,w)->{
    closing=true;web.evaluateJavascript("if(window.PolylogApp){window.PolylogApp.exit();}else{PolylogNative.postMessage(JSON.stringify({action:'exit-ready'}));}",null);
   }).show();
  });
 }
 private void error(String msg){new AlertDialog.Builder(this).setMessage(msg).setPositiveButton("OK",null).show();}
 @Override protected void onDestroy(){if(picker!=null)picker.onReceiveValue(null);if(web!=null)web.destroy();if(printWeb!=null)printWeb.destroy();super.onDestroy();}
}

