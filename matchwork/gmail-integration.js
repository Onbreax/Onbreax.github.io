/* Profile-bound Gmail state. App passwords never enter backups or localStorage. */
const gmailSessions=new Map(),gmailStatus=new Map();
let gmailGeneration=0,gmailFormProfile="";
const gmailLocalToken=document.querySelector('meta[name="matchwork-gmail-local"]')?.content||"";
const GMAIL_LOCAL=!!gmailLocalToken&&location.protocol==="http:"&&location.hostname==="127.0.0.1"&&location.port==="8765";
const gmailTransportAvailable=()=>BACKGROUND_NATIVE||GMAIL_LOCAL;
const gmailConfig=()=>MatchworkGmail.config(profile.gmail);
const gmailKey=()=>"vlcb_"+pid+"_gmail_state";
function gmailAvailable(){const c=gmailConfig();return gmailTransportAvailable()&&!!c.email&&c.enabled}
function gmailDay(date){const d=new Date(date);return [d.getFullYear(),d.getMonth()+1,d.getDate()].join("-")}
function gmailDue(){const c=gmailConfig();return gmailAvailable()&&c.frequency!=="manual"&&(c.frequency!=="daily"||!c.lastComplete||gmailDay(c.lastComplete)!==gmailDay(Date.now()))}
function gmailSetStatus(state,message){gmailStatus.set(pid,{state,message});renderGmail()}
function renderGmail(){
 const c=gmailConfig(),name=profiles.find(p=>p.id===pid)?.nom||"Mon profil",s=gmailStatus.get(pid),session=gmailSessions.get(pid),available=gmailTransportAvailable();
 $("#gmail-profile-name").textContent=name;$("#gmail-email").textContent=c.email||"Aucun compte Gmail associé";
 $("#gmail-enabled").checked=c.enabled;$("#gmail-enabled").disabled=!available||!c.email||!!operationDepth;
 $("#gmail-days").value=String(c.days);$("#gmail-frequency").value=c.frequency;
 $("#gmail-local-form").hidden=!GMAIL_LOCAL;$("#gmail-browser-note").hidden=available;
 if(gmailFormProfile!==pid){$("#gmail-address").value=c.email;$("#gmail-password").value="";gmailFormProfile=pid;}
 $("#gmail-connect").hidden=!available;$("#gmail-connect").textContent=c.email?"Reconnecter / changer de compte":"Connecter Gmail";
 $("#gmail-disconnect").hidden=!c.email;$("#gmail-sync").disabled=!available||!c.email||!!operationDepth;
 const cache=load(gmailKey(),{}),pending=cache.email===c.email&&cache.cursor;
 $("#gmail-sync").textContent=pending?"Continuer la récupération":"Récupérer les alertes";
 if(s)connectionState("#gmail-state",s.state,s.message);
 else connectionState("#gmail-state",c.email?"saved":"missing",!available?"Pour connecter Gmail, utilise l’APK Android ou le pack HTML avec lanceur local.":c.email?(session&&session.expires>Date.now()?"Compte vérifié pour ce profil.":"Compte associé · l’accès sera vérifié à la prochaine recherche."):"Connecte Gmail avec ton mot de passe d’application Google.");
 const run=c.lastRun;
 $("#gmail-last").textContent=run?`${new Date(run.at).toLocaleString("fr-FR")} · ${run.read||0} email(s) lu(s), ${run.added||0} offre(s) ajoutée(s), ${run.merged||0} doublon(s) fusionné(s).${run.unparsed?" "+run.unparsed+" email(s) sans offre reconnue.":""}${run.partial?" Récupération incomplète : relance pour continuer.":""}`:"Aucune récupération pour ce profil.";
 $("#gmail-search-state").textContent=!available?"Gmail : connexion disponible dans l’APK ou le pack HTML local.":c.email?`${c.enabled?"Activée":"Désactivée"} pour ${name} · ${c.email} · ${c.days} derniers jours · ${{each:"à chaque recherche",daily:"une fois par jour lors d’une recherche",manual:"manuellement"}[c.frequency]}.`:"Les alertes Gmail sont facultatives. Connecte le compte dans Profil et cible.";
}
function gmailContext(){return {pid,email:gmailConfig().email,generation:gmailGeneration}}
function gmailCheck(context){checkCancelled();if(context.pid!==pid||context.generation!==gmailGeneration||context.email!==gmailConfig().email)throw new Error("Le profil ou le compte Gmail a changé ; récupération interrompue.")}
function gmailSaveConfig(next){const p={...profile,gmail:MatchworkGmail.config(next)};save(LS.profile,p);profile=p;renderGmail();renderHome()}
async function gmailLocal(action,data){
 if(!GMAIL_LOCAL)throw new Error("Ouvre le pack HTML avec son lanceur local pour connecter Gmail.");
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),90000);
 try{const response=await fetch("/gmail/"+action,{method:"POST",headers:{"Content-Type":"application/json","X-Matchwork-Local":gmailLocalToken},body:JSON.stringify(data),credentials:"omit",cache:"no-store",redirect:"error",signal:controller.signal});
 const value=await response.json();if(!response.ok)throw new Error(value.error||"Connexion Gmail locale impossible.");return value;
 }finally{clearTimeout(timer)}
}
function gmailForget(profileId){if(BACKGROUND_NATIVE&&nativeReady)nativeSend({action:"gmail-forget",profileId});else if(GMAIL_LOCAL)gmailLocal("forget",{profileId}).catch(()=>{});}
async function gmailApi(path,context){
 gmailCheck(context);
 try{const data={profileId:context.pid,email:context.email,path};
 const response=BACKGROUND_NATIVE?await nativeRequest("gmail-fetch",data,55000):await gmailLocal("fetch",data);gmailCheck(context);return response;
 }catch(error){gmailSessions.delete(context.pid);throw error}
}
async function gmailAuthorize(select=false){
 const context=gmailContext(),c=gmailConfig(),cached=gmailSessions.get(pid);
 if(!select&&cached?.email===c.email&&cached.expires>Date.now()+15000)return cached.email;
 if(!gmailTransportAvailable())throw new Error("La connexion Gmail demande l’APK Android ou le pack HTML avec lanceur local.");
 gmailSetStatus("pending","Connexion Gmail en cours…");
 try{
  let result;
  if(BACKGROUND_NATIVE){
   if(!nativeReady)throw new Error("La connexion Android n’est pas encore prête.");
   result=await nativeRequest("gmail-authorize",{profileId:context.pid,email:c.email,selectAccount:select},180000);
  }else{
   const email=select?$("#gmail-address").value.trim().toLowerCase():c.email;
   const password=select?$("#gmail-password").value.replace(/\s/g,""):"";
   if(select&&(!/^[^\s<>]+@[^\s<>]+\.[^\s<>]+$/.test(email)||!/^[a-zA-Z0-9]{16}$/.test(password)))throw new Error("Saisis ton adresse Gmail et le mot de passe d’application Google à 16 caractères.");
   try{result=await gmailLocal("connect",{profileId:context.pid,email,password})}finally{$("#gmail-password").value="";}
  }
  gmailCheck(context);
  const email=String(result.email||"").trim().toLowerCase();if(!email)throw new Error("Gmail n’a pas identifié le compte.");
  if(!select&&c.email&&email!==c.email)throw new Error("Le compte ne correspond pas à celui de ce profil.");
  gmailSessions.set(context.pid,{email,expires:Date.now()+300000});return email;
 }catch(error){if(context.pid===pid)gmailSetStatus("error",error.message);throw error}
}
async function prepareGmailForSearch(){
 if(!gmailDue())return "";
 try{await gmailAuthorize(false);gmailSetStatus("ok","Compte vérifié · alertes prêtes à être récupérées.");return ""}catch(error){return error.message}
}
async function runGmail(options={}){
 const c=gmailConfig();if(!c.email||(!options.manual&&!c.enabled)){log("#log-search","Gmail : aucune source activée pour ce profil.");return 0}
 if(!options.manual&&!gmailDue()){log("#log-search",c.frequency==="manual"?"Gmail : récupération manuelle sélectionnée.":"Gmail : récupération quotidienne déjà effectuée aujourd’hui.");return 0}
 if(options.authError){recordRunError();gmailSetStatus("error",options.authError);log("#log-search","Gmail : "+options.authError);return 0}
 const context=gmailContext(),saved=load(gmailKey(),{}),state=saved.transport==="imap-v1"&&saved.email===c.email&&saved.days===c.days?saved:{transport:"imap-v1",email:c.email,days:c.days,processed:[],cursor:null};
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
 const old=pid;gmailGeneration++;gmailSessions.delete(old);gmailStatus.delete(old);gmailForget(old);
 localStorage.removeItem(gmailKey());gmailSaveConfig({...gmailConfig(),email:"",enabled:false,lastComplete:"",lastRun:null});gmailSetStatus("saved","Compte dissocié de ce profil. Les offres déjà importées sont conservées.");
};
$("#gmail-enabled").onchange=()=>gmailSaveConfig({...gmailConfig(),enabled:$("#gmail-enabled").checked});
$("#gmail-days").onchange=()=>{localStorage.removeItem(gmailKey());gmailSaveConfig({...gmailConfig(),days:+$("#gmail-days").value,lastComplete:"",lastRun:null})};
$("#gmail-frequency").onchange=()=>gmailSaveConfig({...gmailConfig(),frequency:$("#gmail-frequency").value});
$("#gmail-sync").onclick=async()=>{
 await gmailAuthorize(false);startRun("gmail");try{await runGmail({manual:true});const n=dedupeAll();if(n)log("#log-search",`${n} doublon(s) fusionné(s).`)}finally{endRun()}
};

