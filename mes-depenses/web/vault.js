(function(root) {
"use strict";
const KEY="mesdepenses_vault_v1",iterations=310000;
const encode=b=>{let s="";for(const c of new Uint8Array(b))s+=String.fromCharCode(c);return btoa(s);};
const decode=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
async function derive(password,salt) {
 const raw=await crypto.subtle.importKey("raw",new TextEncoder().encode(password),"PBKDF2",false,["deriveKey"]);
 return crypto.subtle.deriveKey({name:"PBKDF2",salt,iterations,hash:"SHA-256"},raw,{name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
}
async function encryptData(data,key,salt) {
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const encrypted=await crypto.subtle.encrypt({name:"AES-GCM",iv,additionalData:new TextEncoder().encode("mes-depenses:1")},key,new TextEncoder().encode(JSON.stringify(data)));
 return JSON.stringify({type:"mes-depenses-vault",version:1,kdf:"PBKDF2-SHA256",iterations,salt:encode(salt),iv:encode(iv),data:encode(encrypted)});
}
function envelope(text) {
 if(text.length>20000000)throw Error("Sauvegarde trop volumineuse.");
 const e=JSON.parse(text);
 if(e.type!=="mes-depenses-vault"||e.version!==1||e.iterations!==iterations||e.kdf!=="PBKDF2-SHA256"||typeof e.salt!=="string"||typeof e.iv!=="string"||typeof e.data!=="string")throw Error("Sauvegarde chiffrée incompatible.");
 if(decode(e.salt).length!==16||decode(e.iv).length!==12)throw Error("Sauvegarde invalide.");
 return e;
}
async function decryptData(text,password) {
 const e=envelope(text),salt=decode(e.salt),key=await derive(password,salt);
 let bytes;
 try{bytes=await crypto.subtle.decrypt({name:"AES-GCM",iv:decode(e.iv),additionalData:new TextEncoder().encode("mes-depenses:1")},key,decode(e.data));}
 catch{throw Error("Mot de passe incorrect ou fichier altéré.");}
 return {key,salt,data:JSON.parse(new TextDecoder().decode(bytes))};
}
class Vault {
 constructor(storage){this.storage=storage;this.key=null;this.salt=null;this.last=storage.getItem(KEY);this.queue=Promise.resolve();}
 exists(){return !!this.storage.getItem(KEY);}
 get unlocked(){return !!this.key;}
 async create(password,data){
  if(password.length<10)throw Error("Choisis un mot de passe d’au moins 10 caractères.");
  if(this.exists())throw Error("Un espace existe déjà. Déverrouille-le ou importe une sauvegarde.");
  this.salt=crypto.getRandomValues(new Uint8Array(16));this.key=await derive(password,this.salt);
  try{await this.save(data);}catch(e){this.lock();throw e;}
 }
 async unlock(password) {
  const text=this.storage.getItem(KEY);if(!text)throw Error("Aucun espace enregistré.");
  const opened=await decryptData(text,password);this.key=opened.key;this.salt=opened.salt;this.last=text;return opened.data;
 }
 save(data) {
  const key=this.key,salt=this.salt;if(!key)throw Error("Déverrouille ton espace.");
  const copy=JSON.parse(JSON.stringify(data));
  const task=this.queue.catch(()=>{}).then(async()=>{
   if(this.storage.getItem(KEY)!==this.last)throw Error("L’espace a changé dans une autre fenêtre. Déverrouille-le à nouveau.");
   const sealed=await encryptData(copy,key,salt);
   try{this.storage.setItem(KEY,sealed);}catch{throw Error("Stockage indisponible ou plein. Les modifications ne sont pas enregistrées.");}
   this.last=sealed;
  });
  this.queue=task;return task;
 }
 async export(data,password) {
  if(password.length<10)throw Error("Le mot de passe de sauvegarde doit comporter au moins 10 caractères.");
  const salt=crypto.getRandomValues(new Uint8Array(16)),key=await derive(password,salt);
  return encryptData(data,key,salt);
 }
 lock(){this.key=null;this.salt=null;}
}
const api={Vault,KEY,encryptData,decryptData};
if(typeof module!=="undefined"&&module.exports)module.exports=api;else root.SpendingVault=api;
})(typeof globalThis!=="undefined"?globalThis:this);
