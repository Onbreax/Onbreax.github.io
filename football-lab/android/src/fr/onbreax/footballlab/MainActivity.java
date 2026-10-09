package fr.onbreax.footballlab;
import android.app.Activity;
import android.os.Bundle;
import android.content.Intent;
import android.net.Uri;
import android.webkit.*;
import android.view.View;
import android.widget.Toast;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.net.URL;
import javax.net.ssl.HttpsURLConnection;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONObject;

public class MainActivity extends Activity {
 private final ExecutorService network=Executors.newFixedThreadPool(2);
 private WebView web; private String pendingExport; private ValueCallback<Uri[]> chooser;
 private static final String HOME="https://appassets.androidplatform.net/index.html";
 @Override public void onCreate(Bundle state){super.onCreate(state);
  web=new WebView(this); web.setBackgroundColor(0xfff5f6f0);setContentView(web);
  web.setOnApplyWindowInsetsListener((v,insets)->{v.setPadding(insets.getSystemWindowInsetLeft(),insets.getSystemWindowInsetTop(),insets.getSystemWindowInsetRight(),insets.getSystemWindowInsetBottom());return insets;});
  WebSettings s=web.getSettings();s.setJavaScriptEnabled(true);s.setDomStorageEnabled(true);s.setAllowFileAccess(false);s.setAllowContentAccess(true);s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);s.setJavaScriptCanOpenWindowsAutomatically(false);
  web.addJavascriptInterface(new Bridge(),"FootballNative");
  web.setWebViewClient(new WebViewClient(){
   @Override public WebResourceResponse shouldInterceptRequest(WebView view,WebResourceRequest req){Uri u=req.getUrl();if("appassets.androidplatform.net".equals(u.getHost())){try{if(!"/index.html".equals(u.getPath()))return new WebResourceResponse("text/plain","UTF-8",404,"Not found",null,new ByteArrayInputStream(new byte[0]));return new WebResourceResponse("text/html","UTF-8",getAssets().open("index.html"));}catch(IOException e){return new WebResourceResponse("text/plain","UTF-8",new ByteArrayInputStream("Page indisponible".getBytes(StandardCharsets.UTF_8)));}}return null;}
   @Override public boolean shouldOverrideUrlLoading(WebView v,WebResourceRequest r){return external(r.getUrl());}
   @Override public boolean shouldOverrideUrlLoading(WebView v,String u){return external(Uri.parse(u));}
  });
  web.setWebChromeClient(new WebChromeClient(){@Override public boolean onShowFileChooser(WebView v,ValueCallback<Uri[]> cb,FileChooserParams params){if(chooser!=null)chooser.onReceiveValue(null);chooser=cb;Intent i=new Intent(Intent.ACTION_OPEN_DOCUMENT).setType("application/json").addCategory(Intent.CATEGORY_OPENABLE);try{startActivityForResult(i,2);}catch(Exception e){chooser.onReceiveValue(null);chooser=null;}return true;}});
  web.loadUrl(HOME);
 }
 private boolean external(Uri u){if(HOME.equals(u.toString()))return false;if("https".equals(u.getScheme())){try{startActivity(new Intent(Intent.ACTION_VIEW,u));}catch(Exception e){Toast.makeText(this,"Aucun navigateur disponible",Toast.LENGTH_SHORT).show();}}return true;}
 public class Bridge {
  @JavascriptInterface public void openRouter(int requestId,String operation,String key,String body){
   runOnUiThread(()->{
    if(!HOME.equals(web.getUrl())||isFinishing()||isDestroyed())return;
    network.execute(()->{
     JSONObject result=new JSONObject();HttpsURLConnection conn=null;int status=0;
     try{
      String path;
      if("models".equals(operation))path="/models";
      else if("key".equals(operation))path="/key";
      else if("credits".equals(operation))path="/credits";
      else if("chat".equals(operation))path="/chat/completions";
      else throw new IllegalArgumentException();
      if(!"models".equals(operation)&&(key==null||!key.matches("[A-Za-z0-9_-]{10,256}")))throw new IllegalArgumentException();
      if("chat".equals(operation)){
       if(body==null||body.length()>32000)throw new IllegalArgumentException();
       JSONObject payload=new JSONObject(body);
       if(!payload.getString("model").matches("[a-zA-Z0-9][a-zA-Z0-9_.:/-]{1,160}")||payload.optBoolean("stream",true)||payload.has("tools")||payload.has("plugins"))throw new IllegalArgumentException();
       int tokens=payload.has("max_completion_tokens")?payload.getInt("max_completion_tokens"):payload.getInt("max_tokens");
       if(tokens!=700&&tokens!=1000&&tokens!=1400)throw new IllegalArgumentException();
       if(payload.getJSONArray("messages").length()!=2||!"json_schema".equals(payload.getJSONObject("response_format").getString("type")))throw new IllegalArgumentException();
      }
      conn=(HttpsURLConnection)new URL("https://openrouter.ai/api/v1"+path).openConnection();
      conn.setInstanceFollowRedirects(false);conn.setConnectTimeout(12000);conn.setReadTimeout("chat".equals(operation)?75000:20000);
      conn.setRequestProperty("Accept","application/json");
      if(!"models".equals(operation))conn.setRequestProperty("Authorization","Bearer "+key);
      if("chat".equals(operation)){
       conn.setRequestMethod("POST");conn.setDoOutput(true);conn.setRequestProperty("Content-Type","application/json");
       byte[] payload=body.getBytes(StandardCharsets.UTF_8);conn.setFixedLengthStreamingMode(payload.length);
       try(OutputStream output=conn.getOutputStream()){output.write(payload);}
      }
      status=conn.getResponseCode();
      if(status!=200)throw new IOException();
      ByteArrayOutputStream bytes=new ByteArrayOutputStream();
      try(InputStream input=conn.getInputStream()){
       byte[] buf=new byte[8192];int n;
       while((n=input.read(buf))!=-1){if(bytes.size()+n>2500000)throw new IOException();bytes.write(buf,0,n);}
      }
      result.put("ok",true);result.put("data",new JSONObject(new String(bytes.toByteArray(),StandardCharsets.UTF_8)));
     }catch(Exception e){try{result.put("ok",false);result.put("status",e instanceof IllegalArgumentException?400:status>=400?status:0);}catch(Exception ignored){}}
     finally{if(conn!=null)conn.disconnect();}
     String script="window.footballAIResult && window.footballAIResult("+requestId+","+result.toString()+")";
     runOnUiThread(()->{if(!isFinishing()&&!isDestroyed()&&HOME.equals(web.getUrl()))web.evaluateJavascript(script,null);});
    });
   });
  }
  @JavascriptInterface public void fetchMatches(int requestId,String competition,int year,String key){
   if(!("FL1".equals(competition)||"PL".equals(competition)||"PD".equals(competition))||year<2023||year>2100||key==null||!key.matches("[A-Za-z0-9_-]{10,128}"))return;
   runOnUiThread(()->{if(!HOME.equals(web.getUrl())||isFinishing()||isDestroyed())return;
    network.execute(()->{JSONObject result=new JSONObject();HttpsURLConnection conn=null;
     try{conn=(HttpsURLConnection)new URL("https://api.football-data.org/v4/competitions/"+competition+"/matches?season="+year).openConnection();conn.setInstanceFollowRedirects(false);conn.setConnectTimeout(12000);conn.setReadTimeout(15000);conn.setRequestProperty("X-Auth-Token",key);conn.setRequestProperty("Accept","application/json");int code=conn.getResponseCode();
      if(code!=200)throw new IOException(code==401?"HTTP 401 : clé refusée":code==403?"HTTP 403 : accès non inclus ou clé refusée":code==429?"HTTP 429 : quota atteint, réessayer plus tard":"HTTP "+code);
      ByteArrayOutputStream bytes=new ByteArrayOutputStream();try(InputStream input=conn.getInputStream()){byte[] buf=new byte[8192];int n;while((n=input.read(buf))!=-1){if(bytes.size()+n>2000000)throw new IOException("Réponse trop volumineuse");bytes.write(buf,0,n);}}
      result.put("ok",true);result.put("data",new JSONObject(new String(bytes.toByteArray(),StandardCharsets.UTF_8)));
     }catch(Exception e){try{result.put("ok",false);result.put("error",e instanceof IOException?e.getMessage():"Réponse invalide");}catch(Exception ignored){}}
     finally{if(conn!=null)conn.disconnect();}
     String script="window.footballApiResult && window.footballApiResult("+requestId+","+result.toString()+")";
     runOnUiThread(()->{if(!isFinishing()&&!isDestroyed()&&HOME.equals(web.getUrl()))web.evaluateJavascript(script,null);});
    });
   });
  }
  @JavascriptInterface public void exportJson(String text){exportNamed(text,"football-lab-suivi.json");}
  @JavascriptInterface public void exportNamed(String text,String filename){if(text==null||text.length()>15000000||filename==null||!filename.matches("[A-Za-z0-9._-]{1,100}\\.json"))return;runOnUiThread(()->{if(!HOME.equals(web.getUrl())||pendingExport!=null)return;pendingExport=text;Intent i=new Intent(Intent.ACTION_CREATE_DOCUMENT).setType("application/json").addCategory(Intent.CATEGORY_OPENABLE).putExtra(Intent.EXTRA_TITLE,filename);try{startActivityForResult(i,1);}catch(Exception e){pendingExport=null;Toast.makeText(MainActivity.this,"Export indisponible",Toast.LENGTH_SHORT).show();}});}
 }
 @Override protected void onActivityResult(int request,int result,Intent data){super.onActivityResult(request,result,data);if(request==2&&chooser!=null){chooser.onReceiveValue(result==RESULT_OK&&data!=null?new Uri[]{data.getData()}:null);chooser=null;}if(request==1){String text=pendingExport;pendingExport=null;if(result==RESULT_OK&&data!=null&&text!=null){try(OutputStream out=getContentResolver().openOutputStream(data.getData())){out.write(text.getBytes(StandardCharsets.UTF_8));Toast.makeText(this,"Sauvegarde exportée",Toast.LENGTH_SHORT).show();}catch(Exception e){Toast.makeText(this,"Échec de l’export",Toast.LENGTH_LONG).show();}}}}
 @Override public void onBackPressed(){web.evaluateJavascript("(()=>{const d=document.querySelector('dialog[open]');if(d){d.close();return true}return false})()",r->{if(!"true".equals(r))MainActivity.super.onBackPressed();});}
 @Override protected void onDestroy(){network.shutdownNow();web.removeJavascriptInterface("FootballNative");web.destroy();super.onDestroy();}
}
