(function(root){
"use strict";
// Read-only protocol, based on Crypto.com's published App API signing implementation.
const paths=["/v1/portfolio","/v1/crypto-account","/v1/fiat-account"];
const allowed=(path,method)=>method==="GET"&&paths.includes(path);
async function signedRequest(credentials,path,now=Date.now()){
 if(!allowed(path,"GET"))throw Error("Lecture Crypto.com non autorisée.");
 if(!credentials||!credentials.key||!credentials.secret||credentials.key.length>500||credentials.secret.length>2000||/[\r\n]/.test(credentials.key))throw Error("Renseigne la clé API et la clé secrète Crypto.com App.");
 const timestamp=String(now),key=await crypto.subtle.importKey("raw",new TextEncoder().encode(credentials.secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
 const bytes=await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(timestamp+"GET"+path));
 let binary="";for(const byte of new Uint8Array(bytes))binary+=String.fromCharCode(byte);
 return {provider:"crypto",path,method:"GET",headers:{"Cdc-Api-Key":credentials.key,"Cdc-Api-Timestamp":timestamp,"Cdc-Api-Signature":btoa(binary)}};
}
function decimal(value){
 const s=String(value??"");if(!/^-?\d+(?:\.\d{1,18})?$/.test(s)||s.length>60)throw Error("Montant Crypto.com illisible.");
 return s;
}
function cents(value){
 const s=decimal(value),negative=s[0]==="-",parts=(negative?s.slice(1):s).split(".");
 const frac=(parts[1]||"").padEnd(3,"0"),n=BigInt(parts[0])*100n+BigInt(frac.slice(0,2))+(Number(frac[2])>=5?1n:0n);
 if(n>100000000000n)throw Error("Valeur Crypto.com hors limite.");
 return Number(n)*(negative?-1:1);
}
function portfolio(data){
 if(!Array.isArray(data.products)||!data.products.length)throw Error("La valorisation du portefeuille n’a pas été fournie. Les anciens montants sont conservés.");
 if(data.products.length>200)throw Error("Portefeuille trop volumineux.");
 const details=data.products.map((p,i)=>{
  const price=p.price_native;
  // Never infer a currency or silently convert a USD valuation into EUR.
  if(!price||price.currency!=="EUR")throw Error("Crypto.com ne fournit pas toutes les valorisations en EUR. Choisis l’euro dans Crypto.com ou saisis une valorisation datée.");
  const value=cents(price.amount);if(value<0)throw Error("Valeur de produit Crypto.com négative.");
  return {label:String(p.name||p.product_type||p.type||p.id||"Produit "+(i+1)).slice(0,200),value,available:null};
 });
 const value=details.reduce((s,p)=>s+p.value,0);
 if(!Number.isSafeInteger(value)||value>100000000000)throw Error("Total Crypto.com hors limite.");
 return {value,available:null,details};
}
class Client{
 constructor({credentials,transport,now}){this.credentials=credentials;this.transport=transport;this.now=now||Date.now;}
 async request(path){
  const c=this.credentials();if(!c)throw Error("Déverrouille ton espace.");
  const request=await signedRequest(c,path,this.now());
  if(this.credentials()!==c)throw Error("Espace verrouillé ou remplacé.");
  const response=await this.transport(request);
  if(this.credentials()!==c)throw Error("Espace verrouillé ou remplacé. La réponse n’est pas appliquée.");
  if(response?.status===429)throw Error("Crypto.com limite les requêtes. Réessaie dans une minute.");
  let data;try{data=JSON.parse(response.text);}catch{throw Error("Réponse Crypto.com illisible.");}
  if(response.status!==200||data.ok!==true)throw Error("Connexion Crypto.com refusée ou indisponible. Vérifie la clé App, sa validité et les autorisations de lecture.");
  return data;
 }
 async snapshot(){return portfolio(await this.request("/v1/portfolio"));}
}
const api={paths,allowed,signedRequest,decimal,cents,portfolio,Client};
if(typeof module!=="undefined"&&module.exports)module.exports=api;else root.SpendingCrypto=api;
})(typeof globalThis!=="undefined"?globalThis:this);
