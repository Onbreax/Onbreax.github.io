package fr.onbreax.lotterymetrics;

import android.app.*;
import android.os.*;
import android.content.*;
import android.net.Uri;
import android.view.*;
import android.webkit.*;
import android.widget.*;
import androidx.webkit.*;
import org.json.JSONObject;
import java.io.*;
import java.net.*;
import java.nio.charset.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.regex.*;
import java.util.zip.*;

public class MainActivity extends Activity {
 private static final String ORIGIN="https://appassets.androidplatform.net";
 private WebView web;
 private ValueCallback<Uri[]> picker;
 private String pendingExport;
 private final ExecutorService network=Executors.newSingleThreadExecutor();
 private boolean fetching=false;
 private final Handler handler=new Handler(Looper.getMainLooper());
 private static final Map<String,String> PAGES=new HashMap<>(), DOCS=new HashMap<>();
 static {
  PAGES.put("loto","loto");PAGES.put("euromillions","euromillions-my-million");PAGES.put("eurodreams","eurodreams");PAGES.put("keno","keno");
  DOCS.put("loto","1a2b3c4d-9876-4562-b3fc-2c963f66afp6");DOCS.put("euromillions","1a2b3c4d-9876-4562-b3fc-2c963f66afe6");DOCS.put("eurodreams","1a2b3c4d-9876-4562-b3fc-2c963f66afa5");DOCS.put("keno","1a2b3c4d-9876-4562-b3fc-2c963f66bft6");
 }
 @Override public void onCreate(Bundle state){
  super.onCreate(state);
  LinearLayout root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);root.setBackgroundColor(0xfff8f6f2);
  root.setOnApplyWindowInsetsListener((v,i)->{v.setPadding(i.getSystemWindowInsetLeft(),i.getSystemWindowInsetTop(),i.getSystemWindowInsetRight(),i.getSystemWindowInsetBottom());return i.consumeSystemWindowInsets();});
  web=new WebView(this);root.addView(web,new LinearLayout.LayoutParams(-1,-1));setContentView(root);
  WebSettings s=web.getSettings();s.setJavaScriptEnabled(true);s.setDomStorageEnabled(true);s.setAllowFileAccess(false);s.setAllowContentAccess(true);s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
  WebViewAssetLoader loader=new WebViewAssetLoader.Builder().addPathHandler("/assets/",new WebViewAssetLoader.AssetsPathHandler(this)).build();
  web.setWebViewClient(new WebViewClient(){
   @Override public WebResourceResponse shouldInterceptRequest(WebView v,WebResourceRequest r){return loader.shouldInterceptRequest(r.getUrl());}
   @Override public boolean shouldOverrideUrlLoading(WebView v,WebResourceRequest r){
    Uri u=r.getUrl();if(u.toString().startsWith(ORIGIN+"/assets/"))return false;
    if(r.isForMainFrame()&&("https".equals(u.getScheme())||"http".equals(u.getScheme())))try{startActivity(new Intent(Intent.ACTION_VIEW,u).addCategory(Intent.CATEGORY_BROWSABLE));}catch(ActivityNotFoundException e){error("Aucun navigateur disponible.");}return true;
   }
  });
  web.setWebChromeClient(new WebChromeClient(){
   @Override public boolean onShowFileChooser(WebView v,ValueCallback<Uri[]> cb,FileChooserParams p){
    if(picker!=null)picker.onReceiveValue(null);picker=cb;
    Intent i=new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*");i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE,p.getMode()==FileChooserParams.MODE_OPEN_MULTIPLE);
    try{startActivityForResult(i,10);}catch(ActivityNotFoundException e){picker.onReceiveValue(null);picker=null;error("Sélecteur de fichiers indisponible.");}return true;
   }
   @Override public boolean onJsConfirm(WebView v,String url,String message,JsResult result){new AlertDialog.Builder(MainActivity.this).setMessage(message).setPositiveButton("Confirmer",(d,w)->result.confirm()).setNegativeButton("Annuler",(d,w)->result.cancel()).setOnCancelListener(d->result.cancel()).show();return true;}
   @Override public boolean onJsAlert(WebView v,String url,String message,JsResult result){new AlertDialog.Builder(MainActivity.this).setMessage(message).setPositiveButton("OK",(d,w)->result.confirm()).setOnCancelListener(d->result.confirm()).show();return true;}
  });
  if(!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)){new AlertDialog.Builder(this).setMessage("Mets à jour Android System WebView pour utiliser Lottery Metrics.").setPositiveButton("Fermer",(d,w)->finish()).setCancelable(false).show();return;}
  WebViewCompat.addWebMessageListener(web,"LotteryNative",Collections.singleton(ORIGIN),(v,m,o,main,reply)->{
   if(!main||!"https".equals(o.getScheme())||!"appassets.androidplatform.net".equals(o.getHost())||(o.getPort()!=-1&&o.getPort()!=443))return;
   try{JSONObject j=new JSONObject(m.getData());String action=j.optString("action");
    if("save".equals(action))save(j);
    else if("archive".equals(action))archive(j);
   }catch(Exception e){error("Cette opération n’a pas pu être effectuée.");}
  });
  web.loadUrl(ORIGIN+"/assets/index.html");
 }
 private byte[] download(String address,int limit)throws Exception{
  for(int redirects=0;redirects<4;redirects++){
   URL u=new URL(address);String host=u.getHost();
   if(!"https".equals(u.getProtocol())||!("www.fdj.fr".equals(host)||"www.sto.api.fdj.fr".equals(host))||(u.getPort()!=-1&&u.getPort()!=443))throw new IOException("Adresse FDJ non autorisée.");
   HttpURLConnection c=(HttpURLConnection)u.openConnection();c.setInstanceFollowRedirects(false);c.setConnectTimeout(15000);c.setReadTimeout(25000);c.setRequestProperty("User-Agent","LotteryMetrics/1.0 Android");
   try{int status=c.getResponseCode();if(status>=300&&status<400){address=new URL(u,c.getHeaderField("Location")).toString();continue;}if(status!=200)throw new IOException("FDJ HTTP "+status);if(c.getContentLengthLong()>limit)throw new IOException("Archive trop volumineuse.");try(InputStream in=c.getInputStream()){return readLimited(in,limit);}}
   finally{c.disconnect();}
  }throw new IOException("Trop de redirections FDJ.");
 }
 private byte[] readLimited(InputStream in,int max)throws IOException{
  ByteArrayOutputStream out=new ByteArrayOutputStream();byte[] buf=new byte[8192];int n;
  while((n=in.read(buf))!=-1){if(out.size()+n>max)throw new IOException("Archive trop volumineuse.");out.write(buf,0,n);}return out.toByteArray();
 }
 private void archive(JSONObject j)throws Exception{
  String game=j.getString("game"),request=j.getString("request");if(!PAGES.containsKey(game)||request.length()>80)return;
  if(fetching){dispatch(new JSONObject().put("request",request).put("error","Une mise à jour est déjà en cours."));return;}
  fetching=true;getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
  network.execute(()->{JSONObject result=new JSONObject();
   try{result.put("request",request);String source="https://www.sto.api.fdj.fr/anonymous/service-draw-info/v3/documentations/"+DOCS.get(game);
    // The history page supplies the current archive URL; retained endpoint is a fallback if that page is unavailable.
    try{String page=new String(download("https://www.fdj.fr/jeux-de-tirage/"+PAGES.get(game)+"/historique",5*1024*1024),StandardCharsets.UTF_8);
     Matcher match=Pattern.compile("href=\"(https://www\\.sto\\.api\\.fdj\\.fr/anonymous/service-draw-info/v3/documentations/[^\"]+)\"").matcher(page);if(match.find())source=match.group(1);
    }catch(Exception ignored){}
    byte[] bytes=download(source,10*1024*1024),csv=null;
    try(ZipInputStream zip=new ZipInputStream(new ByteArrayInputStream(bytes))){ZipEntry entry;int count=0;while((entry=zip.getNextEntry())!=null){if(++count>30)throw new IOException("Archive inattendue.");if(!entry.isDirectory()&&entry.getName().toLowerCase(Locale.ROOT).endsWith(".csv")){if(csv!=null)throw new IOException("Plusieurs fichiers CSV : import manuel nécessaire.");csv=readLimited(zip,32*1024*1024);}}}
    if(csv==null)throw new IOException("Aucun fichier CSV dans l’archive FDJ.");
    String text;try{text=StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT).decode(java.nio.ByteBuffer.wrap(csv)).toString();}catch(CharacterCodingException e){text=new String(csv,Charset.forName("windows-1252"));}
    result.put("text",text).put("source",source);
   }catch(Exception e){try{result.put("error",e.getMessage()==null?"Connexion FDJ indisponible.":e.getMessage());}catch(Exception ignored){}}
   JSONObject response=result;handler.post(()->{fetching=false;getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);dispatch(response);});
  });
 }
 private void dispatch(JSONObject j){if(!isDestroyed())web.evaluateJavascript("window.dispatchEvent(new CustomEvent('lottery-archive',{detail:"+j.toString()+"}));",null);}
 private void save(JSONObject j)throws Exception{
  if(pendingExport!=null){error("Un enregistrement est déjà en cours.");return;}
  String text=j.getString("text");if(text.length()>32*1024*1024)throw new IOException("Sauvegarde trop volumineuse.");pendingExport=text;
  Intent i=new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("application/json").putExtra(Intent.EXTRA_TITLE,j.getString("name").replaceAll("[^a-zA-Z0-9._-]","_"));
  try{startActivityForResult(i,11);}catch(ActivityNotFoundException e){pendingExport=null;error("Enregistrement indisponible.");}
 }
 @Override protected void onActivityResult(int request,int result,Intent data){
  super.onActivityResult(request,result,data);
  if(request==10&&picker!=null){picker.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result,data));picker=null;}
  if(request==11){String text=pendingExport;pendingExport=null;if(result==RESULT_OK&&data!=null&&data.getData()!=null&&text!=null){Uri uri=data.getData();network.execute(()->{try(OutputStream out=getContentResolver().openOutputStream(uri,"wt")){if(out==null)throw new IOException();out.write(text.getBytes(StandardCharsets.UTF_8));handler.post(()->Toast.makeText(this,"Sauvegarde enregistrée",Toast.LENGTH_SHORT).show());}catch(Exception e){handler.post(()->error("Sauvegarde non enregistrée."));}});}}
 }
 @Override public void onBackPressed(){new AlertDialog.Builder(this).setMessage("Quitter Lottery Metrics ? Les imports et mises à jour déjà enregistrés sont conservés. Une opération encore en cours peut être interrompue.").setNegativeButton("Rester",null).setPositiveButton("Quitter",(d,w)->finish()).show();}
 private void error(String message){if(!isDestroyed())new AlertDialog.Builder(this).setMessage(message).setPositiveButton("OK",null).show();}
 @Override protected void onDestroy(){network.shutdownNow();if(picker!=null)picker.onReceiveValue(null);if(web!=null)web.destroy();super.onDestroy();}
}
