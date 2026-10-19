package fr.onbreax.matchwork;

import android.text.InputType;
import android.widget.*;
import org.json.*;
import java.io.*;
import java.net.URLDecoder;
import java.util.*;
import java.util.concurrent.*;

/** Native password entry and Gmail-only IMAP; no secret crosses the WebView bridge. */
final class GmailBridge {
 private final MatchworkRuntime runtime;
 private final GmailVault vault;
 private final ExecutorService network=Executors.newSingleThreadExecutor();
 private final ScheduledExecutorService deadlines=Executors.newSingleThreadScheduledExecutor();
 private final Map<String,Session> sessions=new ConcurrentHashMap<>();
 private final Map<String,Integer> epochs=new ConcurrentHashMap<>();
 private boolean prompting;
 private static final class Session {
  final String email;final GmailImap client;
  Session(String email,GmailImap client){this.email=email;this.client=client;}
 }
 GmailBridge(MatchworkRuntime runtime){this.runtime=runtime;vault=new GmailVault(runtime.context);}
 synchronized void forget(String profile){
  if(!GmailPolicy.profileId(profile))return;
  epochs.put(profile,epochs.getOrDefault(profile,0)+1);Session previous=sessions.remove(profile);if(previous!=null)previous.client.close();vault.forget(profile);
 }
 void authorize(JSONObject request){
  final String id=request.optString("id"),profile=request.optString("profileId"),expected=request.optString("email").trim().toLowerCase(Locale.ROOT);
  final int epoch=epochs.getOrDefault(profile,0);
  if(!GmailPolicy.profileId(profile)){runtime.reply(id,null,"Profil Gmail invalide.");return;}
  if(!request.optBoolean("selectAccount",false)){
   Session session=sessions.get(profile);
   if(session!=null&&session.email.equals(expected)){replyEmail(id,session.email);return;}
   network.execute(()->{
    try{
     JSONObject saved=vault.get(profile);
     if(saved==null||!expected.equals(saved.optString("email")))throw new IOException("Connecte Gmail avec le mot de passe d’application de ce profil.");
     connect(id,profile,expected,saved.getString("password"),true,epoch);
    }catch(Exception error){runtime.reply(id,null,safe(error));}
   });return;
  }
  MainActivity activity=runtime.host;
  if(activity==null||!activity.isVisible()||prompting){runtime.reply(id,null,"Ouvre Matchwork pour saisir les identifiants Gmail.");return;}
  prompting=true;
  LinearLayout box=new LinearLayout(activity);box.setOrientation(LinearLayout.VERTICAL);int padding=(int)(20*activity.getResources().getDisplayMetrics().density);box.setPadding(padding,padding,padding,padding);
  TextView help=new TextView(activity);help.setText("Adresse Gmail et mot de passe d’application Google à 16 caractères. Active la validation en deux étapes, puis crée un mot de passe nommé Matchwork. Utilise ce code dédié, jamais ton mot de passe Google habituel.");box.addView(help);
  EditText email=new EditText(activity);email.setHint("Adresse Gmail");email.setInputType(InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS);email.setSingleLine(true);email.setText(expected);box.addView(email);
  EditText password=new EditText(activity);password.setHint("Mot de passe d’application à 16 caractères");password.setInputType(InputType.TYPE_CLASS_TEXT|InputType.TYPE_TEXT_VARIATION_PASSWORD);password.setSingleLine(true);password.setImportantForAutofill(android.view.View.IMPORTANT_FOR_AUTOFILL_NO);box.addView(password);
  CheckBox remember=new CheckBox(activity);remember.setText("Mémoriser, chiffré sur ce téléphone");remember.setChecked(true);box.addView(remember);
  android.app.AlertDialog dialog=new android.app.AlertDialog.Builder(activity).setTitle("Connecter Gmail").setView(box).setPositiveButton("Connecter",null).setNegativeButton("Annuler",(d,w)->{prompting=false;runtime.reply(id,null,"Connexion Gmail annulée.");}).setOnCancelListener(d->{prompting=false;runtime.reply(id,null,"Connexion Gmail annulée.");}).create();
  dialog.setOnShowListener(d->{
   dialog.getWindow().addFlags(android.view.WindowManager.LayoutParams.FLAG_SECURE);
   dialog.getButton(android.app.AlertDialog.BUTTON_POSITIVE).setOnClickListener(v->{
    String address=email.getText().toString().trim().toLowerCase(Locale.ROOT),secret=password.getText().toString().replaceAll("\\s","");
    if(!GmailPolicy.email(address)){email.setError("Adresse Gmail invalide.");return;}
    if(!GmailPolicy.password(secret)){password.setError("Colle le code Google à 16 caractères, sans les espaces.");return;}
    boolean save=remember.isChecked();password.setText("");prompting=false;dialog.dismiss();network.execute(()->connect(id,profile,address,secret,save,epoch));
   });
  });dialog.show();
 }
 private void connect(String id,String profile,String email,String password,boolean remember,int epoch){
  GmailImap client=null;
  try{
   client=new GmailImap(email,password);
   synchronized(this){
    if(epochs.getOrDefault(profile,0)!=epoch)throw new IOException("La connexion Gmail de ce profil a changé.");
    if(remember)vault.put(profile,email,password);else vault.forget(profile);
    Session previous=sessions.put(profile,new Session(email,client));if(previous!=null)previous.client.close();
   }
   replyEmail(id,email);
  }catch(Exception error){if(client!=null)client.close();runtime.reply(id,null,safe(error));}
 }
 private void replyEmail(String id,String email){try{runtime.reply(id,new JSONObject().put("email",email),null);}catch(JSONException ignored){}}
 void fetch(JSONObject request){
  final String id=request.optString("id"),profile=request.optString("profileId"),email=request.optString("email"),path=request.optString("path");
  if(!GmailPolicy.profileId(profile)||!GmailPolicy.path(path)){runtime.reply(id,null,"Lecture Gmail non autorisée.");return;}
  final Session session=sessions.get(profile);final int epoch=epochs.getOrDefault(profile,0);
  if(session==null||!session.email.equals(email)){runtime.reply(id,null,"Reconnecte Gmail pour ce profil.");return;}
  network.execute(()->{
   ScheduledFuture<?> timeout=deadlines.schedule(session.client::close,45,TimeUnit.SECONDS);
   try{
    if(epochs.getOrDefault(profile,0)!=epoch)throw new IOException("Connexion Gmail modifiée.");
    JSONObject value;
    if(path.equals("profile"))value=new JSONObject().put("emailAddress",session.email);
    else if(path.startsWith("messages?")){
     Map<String,String> params=new HashMap<>();for(String pair:path.substring(9).split("&")){String[] p=pair.split("=",2);params.put(URLDecoder.decode(p[0],"UTF-8"),URLDecoder.decode(p[1],"UTF-8"));}
     List<String> ids=session.client.search(params.get("q"));String cursor=params.getOrDefault("pageToken","0");if(!cursor.matches("[0-9]{1,8}"))throw new IOException("Reprise Gmail invalide. Modifie la période puis relance.");
     int start=Integer.parseInt(cursor),end=Math.min(ids.size(),start+100);JSONArray messages=new JSONArray();
     for(int i=start;i<end;i++)messages.put(new JSONObject().put("id","i"+session.client.validity+"_"+ids.get(i)));
     value=new JSONObject().put("messages",messages);if(end<ids.size())value.put("nextPageToken",Integer.toString(end));
    }else{
     String mid=path.substring(9,path.indexOf('?'));String[] parts=mid.split("_",2);
     if(parts.length!=2||!parts[0].equals("i"+session.client.validity))throw new IOException("Identifiant Gmail ancien. Modifie la période puis relance.");
     GmailMime mime=new GmailMime(session.client.message(parts[1]));JSONArray headers=new JSONArray(),bodies=new JSONArray();
     for(Map.Entry<String,String> header:mime.headers.entrySet())headers.put(new JSONObject().put("name",header.getKey()).put("value",header.getValue()));
     for(GmailMime.Body body:mime.bodies)bodies.put(new JSONObject().put("mimeType",body.type).put("body",new JSONObject().put("content",body.content)));
     value=new JSONObject().put("id",mid).put("payload",new JSONObject().put("mimeType","multipart/mixed").put("headers",headers).put("parts",bodies));
     try{value.put("internalDate",java.time.ZonedDateTime.parse(mime.headers.get("date"),java.time.format.DateTimeFormatter.RFC_1123_DATE_TIME).toInstant().toEpochMilli());}catch(Exception ignored){}
    }
    if(epochs.getOrDefault(profile,0)!=epoch)throw new IOException("Connexion Gmail modifiée.");
    runtime.reply(id,value,null);
   }catch(Exception error){sessions.remove(profile,session);session.client.close();runtime.reply(id,null,safe(error));}
   finally{timeout.cancel(false);}
  });
 }
 private String safe(Exception error){
  if(error instanceof IOException&&error.getMessage()!=null&&error.getMessage().matches("(?s)(Connexion Gmail|Connecte Gmail|Reconnecte Gmail|Le dossier Gmail|Réponse Gmail|Gmail a refusé|Email Gmail|Identifiant Gmail|Reprise Gmail|La connexion Gmail|Le téléphone).*"))return error.getMessage();
  return "Lecture Gmail interrompue ou connexion expirée. Relance la récupération ; reconnecte le compte si nécessaire.";
 }
}
