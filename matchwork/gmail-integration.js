/* Profile-bound Gmail state. Access tokens are never put in localStorage/backups. */
const GMAIL_SCOPE="https://www.googleapis.com/auth/gmail.readonly";
const gmailSessions=new Map(),gmailStatus=new Map();
let gmailScript=null,gmailGeneration=0;
const gmailConfig=()=>MatchworkGmail.config(profile.gmail);
const gmailKey=()=>"vlcb_"+pid+"_gmail_state";
function gmailAvailable(){const c=gmailConfig();return !!c.email&&c.enabled}
function gmailDay(date){const d=new Date(date);return [d.getFullYear(),d.getMonth()+1,d.getDate()].join("-")}
function gmailDue(){const c=gmailConfig();return gmailAvailable()&&c.frequency!=="manual"&&(c.frequency!=="daily"||!c.lastComplete||gmailDay(c.lastComplete)!==gmailDay(Date.now()))}
function gmailSetStatus(state,message){gmailStatus.set(pid,{state,message});renderGmail()}
function renderGmail(){
 const c=gmailConfig(),name=profiles.find(p=>p.id===pid)?.nom||"Mon profil",s=gmailStatus.get(pid),session=gmailSessions.get(pid);
 $("#gmail-profile-name").textContent=name;$("#gmail-email").textContent=c.email||"Aucun compte Gmail associé";
 $("#gmail-enabled").checked=c.enabled;$("#gmail-enabled").disabled=!c.email||!!operationDepth;
 $("#gmail-days").value=String(c.days);$("#gmail-frequency").value=c.frequency;
 $("#gmail-client-id").value=settings.gmailClientId||"";
 $("#gmail-web-config").hidden=BACKGROUND_NATIVE;$("#gmail-native-config").hidden=!BACKGROUND_NATIVE;
 $("#gmail-connect").textContent=c.email?"Changer de compte Gmail":"Connecter Gmail";
 $("#gmail-disconnect").hidden=!c.email;$("#gmail-sync").disabled=!c.email||!!operationDepth;
 const cache=load(gmailKey(),{}),pending=cache.email===c.email&&cache.cursor;
 $("#gmail-sync").textContent=pending?"Continuer la récupération":"Récupérer les alertes";
 if(s)connectionState("#gmail-state",s.state,s.message);
 else connectionState("#gmail-state",c.email?"saved":"missing",c.email?(session&&session.expires>Date.now()?"Compte vérifié pour ce profil.":"Compte associé · l’accès sera vérifié à la prochaine recherche."):"Connecte un compte Google pour ce profil.");
 const run=c.lastRun;
 $("#gmail-last").textContent=run?`${new Date(run.at).toLocaleString("fr-FR")} · ${run.read||0} email(s) lu(s), ${run.added||0} offre(s) ajoutée(s), ${run.merged||0} doublon(s) fusionné(s).${run.unparsed?" "+run.unparsed+" email(s) sans offre reconnue.":""}${run.partial?" Récupération incomplète : relance pour continuer.":""}`:"Aucune récupération pour ce profil.";
 $("#gmail-search-state").textContent=c.email?`${c.enabled?"Activée":"Désactivée"} pour ${name} · ${c.email} · ${c.days} derniers jours · ${{each:"à chaque recherche",daily:"une fois par jour lors d’une recherche",manual:"manuellement"}[c.frequency]}.`:"Les alertes Gmail sont facultatives. Connecte le compte dans Profil et cible.";
}
function gmailContext(){return {pid,email:gmailConfig().email,generation:gmailGeneration}}
function gmailCheck(context){checkCancelled();if(context.pid!==pid||context.generation!==gmailGeneration||context.email!==gmailConfig().email)throw new Error("Le profil ou le compte Gmail a changé ; récupération interrompue.")}
function gmailSaveConfig(next){const p={...profile,gmail:MatchworkGmail.config(next)};save(LS.profile,p);profile=p;renderGmail();renderHome()}
function loadGmailLibrary(){
 if(window.google?.accounts?.oauth2)return Promise.resolve();if(gmailScript)return gmailScript;
 gmailScript=new Promise((resolve,reject)=>{const script=document.createElement("script");script.src="https://accounts.google.com/gsi/client";script.async=true;script.onload=()=>resolve();script.onerror=()=>{gmailScript=null;script.remove();reject(new Error("Le service de connexion Google n’a pas pu être chargé."))};document.head.append(script)});return gmailScript;
}
async function gmailApi(path,context){
 gmailCheck(context);
 if(BACKGROUND_NATIVE){try{const response=await nativeRequest("gmail-fetch",{profileId:context.pid,email:context.email,path},55000);gmailCheck(context);return response}catch(error){if(/expirée|révoquée|Reconnecte|reconnecter/.test(error.message))gmailSessions.delete(context.pid);throw error}}
 const session=gmailSessions.get(context.pid);if(!session||session.email!==context.email||session.expires<=Date.now())throw new Error("L’autorisation Gmail a expiré. Relance la connexion Gmail.");
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),25000);
 try{const r=await fetch("https://gmail.googleapis.com/gmail/v1/users/me/"+path,{headers:{Authorization:"Bearer "+session.token},credentials:"omit",redirect:"error",cache:"no-store",signal:controller.signal});gmailCheck(context);
  if(!r.ok){if(r.status===401)gmailSessions.delete(context.pid);throw new Error(r.status===401?"Autorisation Gmail expirée ou révoquée. Reconnecte le compte.":r.status===403?"Gmail refuse l’accès : vérifie l’API Gmail et l’autorisation de lecture dans le projet Google.":r.status===429?"Quota Gmail atteint. Réessaie plus tard.":"Gmail indisponible (HTTP "+r.status+").")}
  const data=await r.json();gmailCheck(context);return data;
 }finally{clearTimeout(timer)}
}
async function gmailAuthorize(select=false){
 const context=gmailContext(),c=gmailConfig(),cached=gmailSessions.get(pid);
 if(!select&&cached?.email===c.email&&cached.expires>Date.now()+15000)return cached.email;
 gmailSetStatus("pending","Autorisation Google en cours…");
 try{
  if(BACKGROUND_NATIVE){
   if(!nativeReady)throw new Error("La connexion Android n’est pas encore prête.");
   const result=await nativeRequest("gmail-authorize",{profileId:context.pid,email:select?"":c.email,selectAccount:select},180000);gmailCheck(context);
   if(!result.email)throw new Error("Google n’a pas identifié le compte Gmail.");
   if(!select&&c.email&&result.email.toLowerCase()!==c.email)throw new Error("Google a renvoyé un autre compte. Reconnecte le compte associé à ce profil.");
   gmailSessions.set(context.pid,{email:result.email.toLowerCase(),expires:Date.now()+300000});return result.email.toLowerCase();
  }
  const clientId=String(settings.gmailClientId||"").trim();
  if(!/^[\w-]+\.apps\.googleusercontent\.com$/.test(clientId)){$("#gmail-setup").open=true;throw new Error("Renseigne l’identifiant client OAuth Web dans la configuration Google ci-dessous.")}
  if(location.protocol!=="https:"&&!(location.protocol==="http:"&&["localhost","127.0.0.1"].includes(location.hostname)))throw new Error("La connexion Google demande la version web hébergée. Ouvre https://onbreax.github.io/matchwork.html ; le fichier HTML local reste utilisable sans Gmail.");
  await loadGmailLibrary();gmailCheck(context);
  const response=await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>reject(new Error("Autorisation Google non terminée. Relance la connexion.")),150000);
   const client=google.accounts.oauth2.initTokenClient({client_id:clientId,scope:GMAIL_SCOPE,include_granted_scopes:false,
    callback:r=>{clearTimeout(timer);if(r.error)return reject(new Error("Autorisation Gmail refusée ou interrompue."));resolve(r)},
    error_callback:()=>{clearTimeout(timer);reject(new Error("La fenêtre Google a été fermée ou bloquée. Autorise les fenêtres de connexion puis réessaie."))}});
   client.requestAccessToken({prompt:select?"select_account":"",...(c.email&&!select?{hint:c.email}:{})});
  });gmailCheck(context);
  if(typeof response.access_token!=="string"||!response.access_token||!String(response.scope||"").split(" ").includes(GMAIL_SCOPE))throw new Error("L’autorisation de lecture Gmail n’a pas été accordée.");
  const previous=gmailSessions.get(context.pid),expires=Date.now()+Math.max(0,Math.min(Number(response.expires_in)||300,3600)-30)*1000;
  // Verify the mailbox with this token before attaching it to a profile.
  gmailSessions.set(context.pid,{token:response.access_token,email:c.email,expires});
  let result;try{result=await gmailApi("profile",context)}catch(error){gmailSessions.delete(context.pid);if(previous)gmailSessions.set(context.pid,previous);throw error}
  const email=String(result.emailAddress||"").trim().toLowerCase();if(!email||(!select&&c.email&&email!==c.email)){gmailSessions.delete(context.pid);throw new Error("Le compte autorisé ne correspond pas au compte Gmail de ce profil.")}
  gmailSessions.set(context.pid,{token:response.access_token,email,expires});return email;
 }catch(error){gmailSetStatus("error",error.message);throw error}
}
async function prepareGmailForSearch(){
 if(!gmailDue())return "";
 try{await gmailAuthorize(false);gmailSetStatus("ok","Compte vérifié · alertes prêtes à être récupérées.");return ""}catch(error){return error.message}
}
async function runGmail(options={}){
 const c=gmailConfig();if(!c.email||(!options.manual&&!c.enabled)){log("#log-search","Gmail : aucune source activée pour ce profil.");return 0}
 if(!options.manual&&!gmailDue()){log("#log-search",c.frequency==="manual"?"Gmail : récupération manuelle sélectionnée.":"Gmail : récupération quotidienne déjà effectuée aujourd’hui.");return 0}
 if(options.authError){recordRunError();gmailSetStatus("error",options.authError);log("#log-search","Gmail : "+options.authError);return 0}
 const context=gmailContext(),saved=load(gmailKey(),{}),state=saved.email===c.email&&saved.days===c.days?saved:{email:c.email,days:c.days,processed:[],cursor:null};
 const seen=new Set((Array.isArray(state.processed)?state.processed:[]).filter(x=>Array.isArray(x)&&x[1]===MatchworkGmail.VERSION).map(x=>x[0]));
 const query=state.cursor?.query||MatchworkGmail.query(c.days),stats={at:new Date().toISOString(),read:0,added:0,merged:0,filtered:0,unparsed:0,partial:false};
 let pageToken=state.cursor?.pageToken||"",pages=0;
 gmailSetStatus("pending","Récupération des alertes de ce profil…");progSet("Alertes Gmail",1);
 try{
  while(true){
   gmailCheck(context);state.cursor={query,pageToken};save(gmailKey(),state);
   const params=new URLSearchParams({q:query,maxResults:"100",fields:"messages(id),nextPageToken"});if(pageToken)params.set("pageToken",pageToken);
   const batch=await gmailApi("messages?"+params,context);gmailCheck(context);
   if(batch.messages!==undefined&&!Array.isArray(batch.messages))throw new Error("Réponse Gmail invalide.");
   const ids=batch.messages||[];progSet("Alertes Gmail",ids.length||1);
   for(const item of ids){
    gmailCheck(context);if(!/^[\w-]{1,200}$/.test(String(item.id||"")))throw new Error("Identifiant d’email Gmail invalide.");
    if(seen.has(item.id)){progStep("Déjà traité");continue}
    const message=await gmailApi("messages/"+encodeURIComponent(item.id)+"?format=full",context);gmailCheck(context);
    const parsed=MatchworkGmail.parse(message,document);stats.read++;
    if(!parsed.recognized&&!parsed.ignoredSender)stats.unparsed++;
    const excluded=$("#s-excl").value.split(",").map(norm).filter(Boolean),eligible=parsed.offers.filter(o=>!excluded.some(x=>(" "+norm(o.titre)+" ").includes(" "+x+" ")));
    stats.filtered+=parsed.offers.length-eligible.length;
    const n=addOffers(eligible,"LinkedIn · Gmail");stats.added+=n;stats.merged+=eligible.length-n;
    // Only acknowledge a message after offers have been saved successfully.
    seen.add(item.id);state.processed=[...(state.processed||[]).filter(x=>Array.isArray(x)&&x[0]!==item.id),[item.id,MatchworkGmail.VERSION]].slice(-5000);save(gmailKey(),state);
    progStep(`${stats.read} email(s), ${stats.added} offre(s)`);
   }
   pageToken=typeof batch.nextPageToken==="string"?batch.nextPageToken:"";pages++;
   state.cursor=pageToken?{query,pageToken}:null;save(gmailKey(),state);
   if(!pageToken)break;
   if(pages>=2){stats.partial=true;break}
  }
  const next={...gmailConfig(),lastRun:stats};if(!stats.partial)next.lastComplete=new Date().toISOString();gmailSaveConfig(next);
  gmailSetStatus(stats.partial?"saved":"ok",stats.partial?"Premier lot récupéré. Relance pour poursuivre les alertes plus anciennes.":"Alertes récupérées et enregistrées pour ce profil.");
  log("#log-search",`Gmail : ${stats.read} email(s) lu(s), ${stats.added} offre(s) ajoutée(s), ${stats.merged} doublon(s) fusionné(s).${stats.unparsed?" "+stats.unparsed+" email(s) sans offre reconnue ; consulte les alertes dans Gmail.":""}${stats.partial?" Récupération à continuer.":""} Extraction locale : aucun appel OpenRouter.`);
  render();return stats.added;
 }catch(error){
  stats.partial=true;if(/HTTP 400/.test(error.message)&&state.cursor?.pageToken){state.cursor=null;save(gmailKey(),state)}gmailSaveConfig({...gmailConfig(),lastRun:stats});
  if(error.name==="AbortError"){gmailSetStatus("saved","Récupération arrêtée ; les offres reçues sont conservées.");throw error}
  recordRunError();gmailSetStatus("error",error.message);log("#log-search","Gmail : "+error.message+" Les offres déjà reçues sont conservées.");render();return stats.added;
 }
}
$("#gmail-connect").onclick=async()=>{
 persistProfileForm();const email=await gmailAuthorize(true),old=gmailConfig();
 if(email!==old.email)localStorage.removeItem(gmailKey());
 gmailGeneration++;gmailSaveConfig({...old,email,enabled:true,lastComplete:email===old.email?old.lastComplete:"",lastRun:email===old.email?old.lastRun:null});gmailSetStatus("ok","Gmail connecté et vérifié pour ce profil. Les prochaines recherches incluront ses alertes.");
};
$("#gmail-disconnect").onclick=()=>{
 const old=pid;gmailGeneration++;gmailSessions.delete(old);gmailStatus.delete(old);if(BACKGROUND_NATIVE&&nativeReady)nativeSend({action:"gmail-forget",profileId:old});
 localStorage.removeItem(gmailKey());gmailSaveConfig({...gmailConfig(),email:"",enabled:false,lastComplete:"",lastRun:null});gmailSetStatus("saved","Compte dissocié de ce profil. Les offres déjà importées sont conservées.");
};
$("#gmail-enabled").onchange=()=>gmailSaveConfig({...gmailConfig(),enabled:$("#gmail-enabled").checked});
$("#gmail-days").onchange=()=>{localStorage.removeItem(gmailKey());gmailSaveConfig({...gmailConfig(),days:+$("#gmail-days").value,lastComplete:"",lastRun:null})};
$("#gmail-frequency").onchange=()=>gmailSaveConfig({...gmailConfig(),frequency:$("#gmail-frequency").value});
$("#gmail-save-client").onclick=()=>{
 const id=$("#gmail-client-id").value.trim();if(id&&!/^[\w-]+\.apps\.googleusercontent\.com$/.test(id)){gmailSetStatus("error","Identifiant client OAuth Web invalide.");return}
 const next={...settings,gmailClientId:id};save(LS.settings,next);settings=next;gmailSessions.clear();gmailGeneration++;gmailSetStatus("saved","Configuration Google enregistrée. Connecte le compte Gmail de ce profil.");if(id&&!BACKGROUND_NATIVE)loadGmailLibrary().catch(e=>gmailSetStatus("error",e.message));
};
$("#gmail-sync").onclick=async()=>{
 await gmailAuthorize(false);startRun("gmail");try{await runGmail({manual:true});const n=dedupeAll();if(n)log("#log-search",`${n} doublon(s) fusionné(s).`)}finally{endRun()}
};
if(settings.gmailClientId&&!BACKGROUND_NATIVE)loadGmailLibrary().catch(()=>{});
