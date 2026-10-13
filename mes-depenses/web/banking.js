(function(root) {
"use strict";
const BASE="https://api.enablebanking.com",CALLBACK="https://onbreax.github.io/mes-depenses-retour.html";
const idPattern=/^[a-zA-Z0-9_-]{1,150}$/;
function allowed(path,method) {
 if(method==="POST")return path==="/auth"||path==="/sessions";
 if(method!=="GET")return false;
 const p=path.split("?")[0];
 return ["/application","/aspsps"].includes(p)||/^\/sessions\/[a-zA-Z0-9_-]{1,150}$/.test(p)||/^\/accounts\/[a-zA-Z0-9_-]{1,150}\/(balances|transactions)$/.test(p);
}
function b64url(bytes) {let s="";for(const b of new Uint8Array(bytes))s+=String.fromCharCode(b);return btoa(s).replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_");}
function utf8(s){return new TextEncoder().encode(s);}
async function jwt(appId,pem,now=Date.now()) {
 if(!/^[a-f0-9-]{36}$/i.test(appId))throw Error("L’identifiant de l’application Enable Banking est invalide.");
 if(!pem.includes("-----BEGIN PRIVATE KEY-----"))throw Error("Importe la clé privée .pem générée par Enable Banking (format PKCS#8, BEGIN PRIVATE KEY).");
 const data=pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g,"");
 let key;try{key=await crypto.subtle.importKey("pkcs8",Uint8Array.from(atob(data),c=>c.charCodeAt(0)),{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["sign"]);}catch{throw Error("La clé privée n’a pas pu être lue.");}
 const iat=Math.floor(now/1000),header=b64url(utf8(JSON.stringify({typ:"JWT",alg:"RS256",kid:appId}))),body=b64url(utf8(JSON.stringify({iss:"enablebanking.com",aud:"api.enablebanking.com",iat,exp:iat+900})));
 const unsigned=header+"."+body,signature=await crypto.subtle.sign("RSASSA-PKCS1-v1_5",key,utf8(unsigned));
 return unsigned+"."+b64url(signature);
}
function authParameters(bank,now=Date.now()) {
 const maximum=Number(bank.maximum_consent_validity),seconds=Math.max(60,Math.min(Number.isFinite(maximum)&&maximum>0?maximum:86400,180*86400)-60);
 return {access:{valid_until:new Date(now+seconds*1000).toISOString()},aspsp:{name:bank.name,country:bank.country},state:crypto.randomUUID(),redirect_url:CALLBACK,psu_type:"personal",language:"fr"};
}
function parseCallback(url) {
 const u=new URL(url);
 if(!((u.origin==="https://onbreax.github.io"&&u.pathname==="/mes-depenses-retour.html")||(u.protocol==="mesdepenses:"&&u.hostname==="retour")))throw Error("Ce lien n’est pas une adresse de retour de Mes dépenses.");
 const error=u.searchParams.get("error");if(error)throw Error("Connexion non autorisée ou interrompue. Tu peux la recommencer.");
 const code=u.searchParams.get("code"),state=u.searchParams.get("state");
 if(!code||!state||code.length>12000||state.length>200)throw Error("Lien de retour incomplet.");
 return {code,state};
}
class BankClient {
 constructor({credentials,transport,core,now}){this.credentials=credentials;this.transport=transport;this.core=core;this.now=now||Date.now;}
 async request(path,method="GET",body) {
  if(!allowed(path,method))throw Error("Opération bancaire non autorisée.");
  const credentials=this.credentials();if(!credentials)throw Error("Déverrouille ton espace.");
  const token=await jwt(credentials.appId,credentials.pem,this.now());
  if(this.credentials()!==credentials)throw Error("L’espace a été verrouillé ou remplacé.");
  const response=await this.transport({path,method,token,body:body?JSON.stringify(body):null});
  if(this.credentials()!==credentials)throw Error("L’espace a été verrouillé ou remplacé. La réponse n’est pas appliquée.");
  if(!response||!Number.isInteger(response.status))throw Error("Réponse bancaire invalide.");
  let data;try{data=JSON.parse(response.text||"{}");}catch{throw Error("Réponse bancaire illisible.");}
  if(response.status<200||response.status>=300){
   if(response.status===429)throw Error("Limite de requêtes atteinte. Les données précédentes sont conservées. Réessaie plus tard.");
   if(response.status===401||response.status===403)throw Error("Accès refusé : vérifie l’application, son activation et les comptes liés chez Enable Banking.");
   throw Error("Enable Banking : erreur "+response.status+" — "+String(data.message||data.error||"requête refusée").slice(0,200));
  }
  return data;
 }
 async verify() {
  const data=await this.request("/application");
  if(data.environment!=="PRODUCTION")throw Error("Cette application est en Sandbox. Pour tes vrais comptes, crée une application Production et lie tes comptes personnels.");
  if(data.active!==true)throw Error("L’application n’est pas active. Active-la en liant tes propres comptes dans Enable Banking.");
  if(!Array.isArray(data.services)||!data.services.includes("AIS"))throw Error("L’application ne dispose pas du service de lecture des comptes (AIS).");
  if(!Array.isArray(data.redirect_urls)||!data.redirect_urls.includes(CALLBACK))throw Error("Ajoute l’adresse de retour indiquée dans Mes dépenses aux URL autorisées de l’application Enable Banking.");
  return {name:String(data.name||"Application personnelle"),environment:data.environment,active:true,checkedAt:new Date(this.now()).toISOString()};
 }
 async banks() {
  const data=await this.request("/aspsps?country=FR");
  if(!Array.isArray(data.aspsps))throw Error("Liste des banques invalide.");
  return data.aspsps.filter(b=>typeof b.name==="string"&&b.country==="FR"&&/boursorama|bourso|revolut|banque postale/i.test(b.name)&&(!Array.isArray(b.psu_types)||b.psu_types.includes("personal")));
 }
 async begin(bank) {
  const parameters=authParameters(bank,this.now()),data=await this.request("/auth","POST",parameters);
  let u;try{u=new URL(data.url);}catch{throw Error("Adresse d’autorisation invalide.");}
  if(u.protocol!=="https:"||u.hostname!=="auth.enablebanking.com"||u.username||u.password||u.port)throw Error("Adresse d’autorisation inattendue.");
  return {url:u.href,pending:{state:parameters.state,at:this.now(),aspsp:parameters.aspsp,validUntil:parameters.access.valid_until}};
 }
 async finish(url,pending) {
  const callback=parseCallback(url);
  if(!pending||callback.state!==pending.state)throw Error("Ce retour ne correspond pas à la connexion lancée depuis cet espace.");
  if(this.now()-pending.at>20*60000||this.now()<pending.at-60000)throw Error("La connexion a expiré. Recommence l’autorisation.");
  const data=await this.request("/sessions","POST",{code:callback.code});
  if(!idPattern.test(data.session_id)||!Array.isArray(data.accounts))throw Error("Session bancaire invalide.");
  if(!data.accounts.length)throw Error("Aucun compte autorisé. Lie chacun de tes comptes à cette application dans Enable Banking, puis reconnecte la banque.");
  for(const a of data.accounts)if(!idPattern.test(a.uid))throw Error("Identifiant de compte invalide.");
  return {session_id:data.session_id,access:data.access,accounts:data.accounts.map(a=>({uid:a.uid,name:a.name,product:a.product,currency:a.currency,cash_account_type:a.cash_account_type,account_id:{iban:a.account_id?.iban||""},identification_hash:a.identification_hash||""}))};
 }
 async transactions(uid,from,to) {
  if(!idPattern.test(uid))throw Error("Compte invalide.");
  this.core.date(from);this.core.date(to);
  const rows=[],seen=new Set();let key="";
  for(let page=0;page<80;page++) {
   const query=new URLSearchParams({date_from:from,date_to:to});if(key)query.set("continuation_key",key);
   const data=await this.request("/accounts/"+uid+"/transactions?"+query);
   if(!Array.isArray(data.transactions))throw Error("Liste d’opérations invalide.");
   rows.push(...data.transactions);if(rows.length>30000)throw Error("Trop d’opérations dans cette période. Choisis une période plus courte.");
   const next=data.continuation_key;
   if(!next)return rows;
   if(typeof next!=="string"||next.length>5000||seen.has(next))throw Error("La pagination bancaire est incohérente. Aucune donnée de ce compte n’a été remplacée.");
   seen.add(next);key=next;
  }
  throw Error("La pagination n’est pas terminée. Choisis une période plus courte.");
 }
 async balances(uid) {
  if(!idPattern.test(uid))throw Error("Compte invalide.");
  const data=await this.request("/accounts/"+uid+"/balances");
  if(!Array.isArray(data.balances))throw Error("Solde invalide.");
  return data.balances;
 }
}
const api={BASE,CALLBACK,allowed,jwt,authParameters,parseCallback,BankClient};
if(typeof module!=="undefined"&&module.exports)module.exports=api;else root.SpendingBank=api;
})(typeof globalThis!=="undefined"?globalThis:this);
