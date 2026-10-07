package fr.onbreax.matchwork;

import android.app.*;
import android.os.*;
import android.content.*;
import android.net.Uri;
import android.print.PrintManager;
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
   new AlertDialog.Builder(this).setMessage("Mets à jour Android System WebView pour utiliser Matchwork.").setPositiveButton("Fermer",(d,w)->finish()).setCancelable(false).show();return;
  }
  WebViewCompat.addWebMessageListener(web,"MatchworkNative",Collections.singleton(ORIGIN),(v,m,o,main,reply)->{
   if(!main||!("https".equals(o.getScheme())&&"appassets.androidplatform.net".equals(o.getHost())&&(o.getPort()==-1||o.getPort()==443)))return;
   try{JSONObject j=new JSONObject(m.getData());
    if("save".equals(j.optString("action")))save(j);
    else if("print".equals(j.optString("action")))print(j.getString("html"));
   }catch(Exception e){error("Impossible de préparer l'export.");}
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
  if(!type.equals("application/json")&&!type.equals("text/csv"))type="text/plain";
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
   pm.print("Matchwork",v.createPrintDocumentAdapter("Matchwork"),null);
  }});
  printWeb.loadDataWithBaseURL(ORIGIN,html,"text/html","UTF-8",null);
 }
 @Override protected void onActivityResult(int request,int result,Intent data){
  super.onActivityResult(request,result,data);
  if(request==10&&picker!=null){picker.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result,data));picker=null;}
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
 @Override public void onBackPressed(){
  web.evaluateJavascript("(function(){var d=document.querySelector('.drawer.open');if(d){d.classList.remove('open');return true;}return false;})()",result->{
   if(!"true".equals(result))new AlertDialog.Builder(this).setMessage("Quitter Matchwork ? Une recherche en cours pourrait être interrompue.").setNegativeButton("Rester",null).setPositiveButton("Quitter",(d,w)->finish()).show();
  });
 }
 private void error(String msg){new AlertDialog.Builder(this).setMessage(msg).setPositiveButton("OK",null).show();}
 @Override protected void onDestroy(){if(picker!=null)picker.onReceiveValue(null);if(web!=null)web.destroy();if(printWeb!=null)printWeb.destroy();super.onDestroy();}
}
