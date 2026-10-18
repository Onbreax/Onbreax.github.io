package fr.onbreax.matchwork;

import android.accounts.Account;
import android.app.Activity;
import android.content.Intent;
import com.google.android.gms.auth.api.identity.*;
import com.google.android.gms.common.GoogleApiAvailability;
import com.google.android.gms.common.ConnectionResult;
import com.google.android.gms.common.api.Scope;
import com.google.android.gms.common.api.ApiException;
import org.json.JSONObject;
import java.net.HttpURLConnection;
import java.net.URL;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;

/** Official Google Identity authorization UI. Gmail tokens stay in native memory. */
final class GmailBridge {
 static final String SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
 static final int REQUEST = 731;
 private final MatchworkRuntime runtime;
 private final ExecutorService network = Executors.newSingleThreadExecutor();
 private final ScheduledExecutorService deadlines = Executors.newSingleThreadScheduledExecutor();
 private final Map<String,Session> sessions = new ConcurrentHashMap<>();
 private final Map<String,Integer> epochs = new ConcurrentHashMap<>();
 private String requestId, profileId, expectedEmail;
 private int authEpoch;
 private static final class Session {
  final String email, token;
  Session(String email, String token) { this.email=email; this.token=token; }
 }
 GmailBridge(MatchworkRuntime runtime) { this.runtime=runtime; }
 void forget(String profile) {
  if (!GmailPolicy.profileId(profile)) return;
  epochs.put(profile,epochs.getOrDefault(profile,0)+1); sessions.remove(profile);
 }
 void authorize(JSONObject request) {
  String id=request.optString("id"), profile=request.optString("profileId");
  MainActivity activity=runtime.host;
  if (!GmailPolicy.profileId(profile) || activity==null || !activity.isVisible()) { runtime.reply(id,null,"Ouvre Matchwork pour autoriser le compte Google.");return; }
  if (requestId!=null) { runtime.reply(id,null,"Une autorisation Google est déjà en cours.");return; }
  if (GoogleApiAvailability.getInstance().isGooglePlayServicesAvailable(activity)!=ConnectionResult.SUCCESS) { runtime.reply(id,null,"Les services Google Play doivent être disponibles et à jour pour connecter Gmail.");return; }
  requestId=id;profileId=profile;expectedEmail=request.optString("email").trim().toLowerCase(Locale.ROOT);authEpoch=epochs.getOrDefault(profile,0);
  AuthorizationRequest.Builder builder=AuthorizationRequest.builder().setRequestedScopes(Collections.singletonList(new Scope(SCOPE))).setOptOutIncludingGrantedScopes(true);
  if (request.optBoolean("selectAccount",false)||expectedEmail.isEmpty()) builder.setPrompt(AuthorizationRequest.Prompt.SELECT_ACCOUNT);
  else builder.setAccount(new Account(expectedEmail,"com.google"));
  Identity.getAuthorizationClient(activity).authorize(builder.build()).addOnSuccessListener(result -> {
   if (result.hasResolution()) {
    MainActivity current=runtime.host;
    if (current==null || !current.isVisible() || result.getPendingIntent()==null) { fail("Rouvre Matchwork pour terminer l’autorisation Google.");return; }
    try { current.startIntentSenderForResult(result.getPendingIntent().getIntentSender(),REQUEST,null,0,0,0); }
    catch (Exception error) { fail("La fenêtre d’autorisation Google n’a pas pu être ouverte."); }
   } else complete(result);
  }).addOnFailureListener(this::authorizationError);
 }
 void onActivityResult(int request,int result,Intent data) {
  if (request!=REQUEST || requestId==null) return;
  if (result!=Activity.RESULT_OK || data==null) { fail("Autorisation Gmail annulée ou refusée.");return; }
  try { complete(Identity.getAuthorizationClient(runtime.context).getAuthorizationResultFromIntent(data)); }
  catch (ApiException error) { authorizationError(error); }
 }
 private void authorizationError(Exception error) {
  int code=error instanceof ApiException?((ApiException)error).getStatusCode():-1;
  fail(code==10?"Configuration Google Android manquante ou incorrecte (code 10). Enregistre le package et l’empreinte SHA-1 indiqués dans Profil et cible.":"Autorisation Gmail impossible (code "+code+"). Vérifie le projet Google, l’utilisateur de test et l’API Gmail.");
 }
 private void complete(AuthorizationResult result) {
  String token=result.getAccessToken();
  if (token==null || token.isEmpty() || !result.getGrantedScopes().contains(SCOPE)) { fail("L’autorisation de lecture Gmail n’a pas été accordée.");return; }
  final String id=requestId,profile=profileId,expected=expectedEmail;final int epoch=authEpoch;
  network.execute(() -> {
   try {
    JSONObject info=get("profile",token);String email=info.optString("emailAddress").trim().toLowerCase(Locale.ROOT);
    if (email.isEmpty() || (!expected.isEmpty()&&!expected.equals(email))) throw new IOException("Le compte Google ne correspond pas au compte associé à ce profil.");
    if (epochs.getOrDefault(profile,0)!=epoch) throw new IOException("La connexion Gmail de ce profil a changé.");
    sessions.put(profile,new Session(email,token));runtime.reply(id,new JSONObject().put("email",email),null);
   } catch (Exception error) {
    if ("Autorisation Gmail expirée ou révoquée. Reconnecte le compte.".equals(error.getMessage())) {
     sessions.remove(profile);
     Identity.getAuthorizationClient(runtime.context).clearToken(ClearTokenRequest.builder().setToken(token).build());
    }
    runtime.reply(id,null,safeMessage(error));
   }
   finally { runtime.main.post(() -> { requestId=null;profileId=null;expectedEmail=null; }); }
  });
 }
 private void fail(String message) { String id=requestId;requestId=null;profileId=null;expectedEmail=null;runtime.reply(id,null,message); }
 void fetch(JSONObject request) {
  final String id=request.optString("id"),profile=request.optString("profileId"),email=request.optString("email"),path=request.optString("path");
  if (!GmailPolicy.profileId(profile)||!GmailPolicy.path(path)) { runtime.reply(id,null,"Lecture Gmail non autorisée.");return; }
  final Session session=sessions.get(profile);final int epoch=epochs.getOrDefault(profile,0);
  if (session==null||!session.email.equals(email.toLowerCase(Locale.ROOT))) { runtime.reply(id,null,"Ce profil doit reconnecter son compte Gmail.");return; }
  network.execute(() -> {
   try {
    if (epochs.getOrDefault(profile,0)!=epoch) throw new IOException("Connexion Gmail modifiée.");
    JSONObject value=get(path,session.token);
    if (epochs.getOrDefault(profile,0)!=epoch) throw new IOException("Connexion Gmail modifiée.");
    runtime.reply(id,value,null);
   } catch (Exception error) {
    if ("Autorisation Gmail expirée ou révoquée. Reconnecte le compte.".equals(error.getMessage())) {
     sessions.remove(profile,session);
     Identity.getAuthorizationClient(runtime.context).clearToken(ClearTokenRequest.builder().setToken(session.token).build());
    }
    runtime.reply(id,null,safeMessage(error));
   }
  });
 }
 private JSONObject get(String path,String token) throws Exception {
  if (!GmailPolicy.path(path)) throw new IOException("Lecture Gmail non autorisée.");
  HttpURLConnection connection=(HttpURLConnection)new URL("https://gmail.googleapis.com/gmail/v1/users/me/"+path).openConnection();
  ScheduledFuture<?> deadline=deadlines.schedule(connection::disconnect,45,TimeUnit.SECONDS);
  try {
   connection.setRequestMethod("GET");connection.setConnectTimeout(15000);connection.setReadTimeout(25000);connection.setInstanceFollowRedirects(false);
   connection.setRequestProperty("Authorization","Bearer "+token);connection.setRequestProperty("Accept","application/json");
   int code=connection.getResponseCode();
   if (code!=200) throw new IOException(code==401?"Autorisation Gmail expirée ou révoquée. Reconnecte le compte.":code==403?"Gmail refuse l’accès. Vérifie l’API Gmail, les autorisations et l’utilisateur de test Google.":code==429?"Quota Gmail atteint. Réessaie plus tard.":"Gmail indisponible (HTTP "+code+").");
   ByteArrayOutputStream output=new ByteArrayOutputStream();
   try(InputStream input=connection.getInputStream()) { byte[] bytes=new byte[8192];int n;while((n=input.read(bytes))!=-1) { if(output.size()+n>8*1024*1024)throw new IOException("Email Gmail trop volumineux.");output.write(bytes,0,n); } }
   return new JSONObject(new String(output.toByteArray(),StandardCharsets.UTF_8));
  } finally { deadline.cancel(false);connection.disconnect(); }
 }
 private String safeMessage(Exception error) { return error instanceof IOException && error.getMessage()!=null && !error.getMessage().contains("https:")?error.getMessage():"La lecture Gmail a échoué ou a dépassé le délai. Les offres reçues sont conservées."; }
}
