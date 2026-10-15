(function(root){
"use strict";
const DEFAULTS={budget:12000,radius:150,mileage:150000,city:{name:"Paris",postalCode:"75019",coordinates:[2.347,48.8589]},format:"all",equipment:[],hideIncident:true,sort:"distance",mode:"cards"};
const EQUIPMENT={climate:"Climatisation",bluetooth:"Bluetooth",parking:"Aide au stationnement",cruise:"Régulateur"};
const finite=n=>typeof n==="number"&&Number.isFinite(n);
const point=p=>Array.isArray(p)&&p.length===2&&p.every(finite)&&Math.abs(p[0])<=180&&Math.abs(p[1])<=90;
const copy=x=>JSON.parse(JSON.stringify(x));
function sourceURL(value){try{const u=new URL(value);if(u.protocol!=="https:"||u.username||u.password||u.port||u.hash)return null;const h=u.hostname;if(h!=="www.lacentrale.fr"&&h!=="pros.lacentrale.fr"&&!/^[a-z0-9-]+\.espacevo\.fr$/.test(h))return null;return u.href;}catch{return null;}}
function integer(value,min,max,name){if(!Number.isInteger(value)||value<min||value>max)throw Error("Valeur invalide : "+name);return value;}
function text(value,max,name){if(typeof value!=="string"||!value.trim()||value.length>max)throw Error("Champ invalide : "+name);return value.trim();}
function validateFeed(raw,now=Date.now()){
 if(!raw||raw.schemaVersion!==1||!Array.isArray(raw.listings)||!raw.listings.length||raw.listings.length>500)throw Error("Le relevé doit contenir de 1 à 500 annonces.");
 const stamp=Date.parse(raw.observedAt);if(!Number.isFinite(stamp)||stamp>now+300000)throw Error("Date du relevé invalide.");
 const ids=new Set(),urls=new Set();
 const listings=raw.listings.map(a=>{
  if(!a||typeof a!=="object")throw Error("Annonce invalide.");
  const id=text(a.id,80,"identifiant");if(!/^[a-zA-Z0-9_-]+$/.test(id)||ids.has(id)||["__proto__","constructor","prototype"].includes(id))throw Error("Identifiant dupliqué ou invalide.");ids.add(id);
  const url=sourceURL(a.url);if(!url||urls.has(url))throw Error("Lien d’annonce invalide ou dupliqué.");urls.add(url);
  if(!["dealer","agency","private","unknown"].includes(a.sellerRole)||!["automatic","manual","unknown"].includes(a.gearbox)||!["suv","compact"].includes(a.format))throw Error("Caractéristiques incomplètes.");
  if(![true,false,null].includes(a.incident))throw Error("Historique invalide.");
  const equipment={};for(const k of Object.keys(EQUIPMENT)){const v=a.equipment?.[k]??null;if(![true,false,null].includes(v))throw Error("Équipement invalide.");equipment[k]=v;}
  const coordinates=a.coordinates===null?null:a.coordinates;if(coordinates!==null&&!point(coordinates))throw Error("Coordonnées invalides.");
  const seats=a.seats===null?null:integer(a.seats,1,9,"places");
  const year=integer(a.year,1980,new Date(now).getUTCFullYear()+1,"année");
  const guarantee=a.guaranteeMonths===null?null:integer(a.guaranteeMonths,0,120,"garantie");
  const specURL=a.specURL==null?null:sourceURL(a.specURL);if(a.specURL!=null&&!specURL)throw Error("Lien technique invalide.");
  return {id,url,brand:text(a.brand,45,"marque"),model:text(a.model,65,"modèle"),version:text(a.version,160,"version"),price:integer(a.price,100,200000,"prix"),mileage:integer(a.mileage,0,1000000,"kilométrage"),year,gearbox:a.gearbox,gearboxName:text(a.gearboxName,80,"boîte"),energy:text(a.energy,30,"énergie"),seller:text(a.seller,100,"vendeur"),sellerRole:a.sellerRole,city:text(a.city,100,"ville"),postalCode:/^\d{5}$/.test(a.postalCode)?a.postalCode:"",coordinates,seats,format:a.format,length:finite(a.length)&&a.length>2&&a.length<6?a.length:null,specURL,equipment,guaranteeMonths:guarantee,incident:a.incident,notes:Array.isArray(a.notes)?a.notes.slice(0,6).map(x=>text(x,350,"note")):[]};
 });
 return {schemaVersion:1,observedAt:new Date(stamp).toISOString(),listings};
}
function preferences(raw){const p=copy(DEFAULTS);if(!raw||typeof raw!=="object")return p;for(const [k,min,max] of [["budget",2000,40000],["radius",10,1000],["mileage",20000,250000]])if(Number.isInteger(raw[k])&&raw[k]>=min&&raw[k]<=max)p[k]=raw[k];if(raw.radius===0)p.radius=0;if(raw.city&&typeof raw.city.name==="string"&&raw.city.name.length<=100&&/^\d{5}$/.test(raw.city.postalCode)&&point(raw.city.coordinates))p.city=copy(raw.city);for(const [k,allowed] of [["format",["all","suv","compact"]],["sort",["distance","price","mileage"]],["mode",["cards","list"]]])if(allowed.includes(raw[k]))p[k]=raw[k];if(Array.isArray(raw.equipment))p.equipment=[...new Set(raw.equipment.filter(k=>Object.hasOwn(EQUIPMENT,k)))];if(typeof raw.hideIncident==="boolean")p.hideIncident=raw.hideIncident;return p;}
function distance(a,b){if(!point(a)||!point(b))return null;const rad=x=>x*Math.PI/180,dlat=rad(b[1]-a[1]),dlon=rad(b[0]-a[0]);const h=Math.sin(dlat/2)**2+Math.cos(rad(a[1]))*Math.cos(rad(b[1]))*Math.sin(dlon/2)**2;return 6371.0088*2*Math.atan2(Math.sqrt(Math.min(1,h)),Math.sqrt(Math.max(0,1-h)));}
function reasons(a,p){const r=[];if(a.gearbox!=="automatic")r.push("Boîte automatique non confirmée");if(a.sellerRole!=="dealer")r.push(a.sellerRole==="agency"?"Agence représentant un particulier":"Vendeur professionnel non confirmé");if(a.seats===null||a.seats<4)r.push("Quatre places minimum non confirmées");if(a.price>p.budget)r.push("Au-dessus du budget");if(a.mileage>p.mileage)r.push("Au-dessus du kilométrage");const d=distance(p.city.coordinates,a.coordinates);if(p.radius&&(d===null||d>p.radius))r.push(d===null?"Distance non renseignée":"Hors du rayon");if(p.format!=="all"&&p.format!==a.format)r.push("Autre format");if(p.hideIncident&&a.incident===true)r.push("Sinistre ou expertise signalé");if(p.equipment.some(k=>a.equipment[k]!==true))r.push("Équipement demandé non signalé");return r;}
function matching(feed,p){return feed.listings.filter(a=>!reasons(a,p).length).map(a=>({...a,distance:distance(p.city.coordinates,a.coordinates)})).sort((a,b)=>{const key=p.sort;const va=key==="price"?a.price:key==="mileage"?a.mileage:a.distance??Infinity,vb=key==="price"?b.price:key==="mileage"?b.mileage:b.distance??Infinity;return va-vb||a.price-b.price||a.id.localeCompare(b.id);});}
function status(feed,now=Date.now()){const days=Math.max(0,Math.floor((now-Date.parse(feed.observedAt))/86400000));return {days,stale:days>=3,label:days>=3?"Relevé ancien · disponibilité à revérifier":"Relevé documentaire · disponibilité à vérifier"};}
function communes(raw,postalCode){if(!/^\d{5}$/.test(postalCode)||!Array.isArray(raw))throw Error("Réponse de localisation invalide.");return raw.filter(c=>c&&typeof c.nom==="string"&&c.nom.length<=100&&point(c.centre?.coordinates)).map(c=>({name:c.nom,postalCode,coordinates:[...c.centre.coordinates]}));}
const api={DEFAULTS,EQUIPMENT,copy,sourceURL,validateFeed,preferences,distance,reasons,matching,status,communes,point};
if(typeof module!=="undefined"&&module.exports)module.exports=api;else root.AutoCore=api;
})(typeof window!=="undefined"?window:globalThis);
