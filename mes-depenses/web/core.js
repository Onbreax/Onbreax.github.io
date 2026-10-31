(function(root) {
"use strict";
const categories=["À classer","Courses","Restaurants","Transport","Logement","Factures","Abonnements","Santé","Achats","Loisirs","Frais bancaires","Autres"];
const flows=["auto","expense","refund","income","internal","savings"];
const normalize=s=>String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/\s+/g," ").trim();
const iban=s=>String(s||"").replace(/\s/g,"").toUpperCase();
function money(value) {
 let s=String(value??"").trim().replace(/[\s\u00a0\u202f€]/g,"");
 if(!s)throw Error("Montant manquant.");
 let sign=1;
 if(/^\(.*\)$/.test(s)){sign=-1;s=s.slice(1,-1);}
 if(s[0]==="-"){sign*=-1;s=s.slice(1);}else if(s[0]==="+")s=s.slice(1);
 if(s.includes(",")&&s.includes(".")){if(s.lastIndexOf(",")>s.lastIndexOf("."))s=s.replace(/\./g,"").replace(",",".");else s=s.replace(/,/g,"");}
 else if(s.includes(","))s=s.replace(",",".");
 if(!/^\d+(?:\.\d{1,2})?$/.test(s))throw Error("Montant invalide : deux décimales maximum.");
 const [whole,decimal=""]=s.split(".");
 const n=Number(whole)*100+Number(decimal.padEnd(2,"0"));
 if(!Number.isSafeInteger(n)||n>100000000000)throw Error("Montant hors limite.");
 return sign*n;
}
function date(value) {
 const s=String(value||"").trim();let y,m,d;
 let match=s.match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/);
 if(match)[,y,m,d]=match;
 else {match=s.match(/^(\d{2})[/.](\d{2})[/.](\d{4})$/);if(!match)throw Error("Date invalide : "+s);[,d,m,y]=match;}
 const iso=y+"-"+m+"-"+d,check=new Date(iso+"T12:00:00Z");
 if(!Number.isFinite(check.getTime())||check.toISOString().slice(0,10)!==iso)throw Error("Date impossible : "+s);
 return iso;
}
function hash(s) {
 let a=2166136261,b=3335557771;
 for(let i=0;i<s.length;i++){a=Math.imul(a^s.charCodeAt(i),16777619);b=Math.imul(b^s.charCodeAt(i),2246822519);}
 return (a>>>0).toString(16)+(b>>>0).toString(16);
}
function fingerprint(t){return JSON.stringify([t.accountId,t.date,t.amount,t.currency,normalize(t.label),iban(t.counterpartyIban)]);}
function category(label,mcc) {
 const s=normalize(label);
 if(/frais|commission|agios/.test(s))return "Frais bancaires";
 if(/carrefour|auchan|lidl|aldi|monoprix|intermarche|leclerc|supermarche|picard/.test(s))return "Courses";
 if(/restaurant|boulanger|cafe |ubereats|uber eats|deliveroo/.test(s))return "Restaurants";
 if(/sncf|ratp|navigo|transport|uber |bolt |station service/.test(s))return "Transport";
 if(/loyer|quittance/.test(s))return "Logement";
 if(/edf|engie|electric|orange|bouygues|sfr|free telecom|internet/.test(s))return "Factures";
 if(/netflix|spotify|abonnement|openrouter/.test(s))return "Abonnements";
 if(/pharmacie|medecin|doctolib|hopital/.test(s))return "Santé";
 if(String(mcc)==="5411")return "Courses";
 if(["5812","5814"].includes(String(mcc)))return "Restaurants";
 return "À classer";
}
function empty() {return {schema:2,accounts:[],transactions:[],overrides:{},connections:[],settings:{appId:"",pem:"",redirect:"https://onbreax.github.io/mes-depenses-retour.html"},pendingAuth:null,audit:[],valuations:[],budgets:{},cryptoSettings:{key:"",secret:"",accountId:""}};}
function validate(db) {
 if(!db||![1,2].includes(db.schema)||!Array.isArray(db.accounts)||!Array.isArray(db.transactions)||db.accounts.length>100||db.transactions.length>60000)throw Error("Données incompatibles ou trop volumineuses.");
 if(db.schema===1){db.valuations=[];db.budgets={};db.cryptoSettings={key:"",secret:"",accountId:""};db.schema=2;}
 const ids=new Set(),byId=new Map();
 for(const a of db.accounts){
  if(!a||typeof a.id!=="string"||!a.id||a.id.length>200||ids.has(a.id)||typeof a.name!=="string"||a.name.length>200||typeof a.bank!=="string"||a.bank.length>200||typeof a.iban!=="string"||!["current","savings","crypto","employee","excluded"].includes(a.role)||!["csv","api"].includes(a.sourceMode))throw Error("Compte invalide.");
  if(a.balance&&(!Number.isSafeInteger(a.balance.amount)||typeof a.balance.currency!=="string"||!/^[A-Z]{3}$/.test(a.balance.currency)||typeof a.balance.at!=="string"||!Number.isFinite(Date.parse(a.balance.at))))throw Error("Solde enregistré invalide.");
  if(a.lastSync){date(a.lastSync.from);date(a.lastSync.to);if(!Number.isFinite(Date.parse(a.lastSync.at)))throw Error("Date de synchronisation invalide.");}
  ids.add(a.id);
 }
 const rows=new Set();
 for(const t of db.transactions){
  if(!t||typeof t.id!=="string"||rows.has(t.id)||!ids.has(t.accountId)||!Number.isSafeInteger(t.amount)||Math.abs(t.amount)>100000000000||typeof t.label!=="string"||t.label.length>2000||!/^[A-Z]{3}$/.test(t.currency)||!["api","csv"].includes(t.source))throw Error("Opération invalide.");
  date(t.date);rows.add(t.id);byId.set(t.id,t);
 }
 if(!db.overrides||typeof db.overrides!=="object"||Array.isArray(db.overrides))throw Error("Classement invalide.");
 for(const [key,v] of Object.entries(db.overrides)){const t=byId.get(key);if(!v||!flows.includes(v.flow)||!categories.includes(v.category)||(v.note!==undefined&&(typeof v.note!=="string"||v.note.length>2000))||(v.fee!==undefined&&(!Number.isSafeInteger(v.fee)||v.fee<0||(t&&v.fee>Math.abs(t.amount)))))throw Error("Classement invalide.");}
 if(!Array.isArray(db.connections)||db.connections.length>100)throw Error("Connexions invalides.");
 if(!db.settings||typeof db.settings.appId!=="string"||typeof db.settings.pem!=="string"||db.settings.pem.length>20000)throw Error("Paramètres invalides.");
 if(!Array.isArray(db.audit)||db.audit.length>80||db.audit.some(a=>!a||typeof a.text!=="string"||a.text.length>3000||!Number.isFinite(Date.parse(a.at))))throw Error("Historique local invalide.");
 if(db.pendingAuth!==null&&(!db.pendingAuth||typeof db.pendingAuth.state!=="string"||!Number.isFinite(db.pendingAuth.at)||!db.pendingAuth.aspsp))throw Error("Autorisation invalide.");
 validateWealth(db,ids);
 return db;
}
function visible(db) {
 const accounts=new Map(db.accounts.map(a=>[a.id,a]));
 return db.transactions.filter(t=>{const a=accounts.get(t.accountId);return a&&a.role==="current"&&t.source===a.sourceMode;});
}
function classify(db,t) {
 const own=db.accounts.find(a=>a.iban&&iban(a.iban)===iban(t.counterpartyIban));
 const override=db.overrides[t.id];
 const cat=override?.category||t.category||category(t.label,t.mcc);
 let flow=override?.flow||"auto",reason="Classement local";
 if(flow==="auto") {
  if(own){flow=["savings","crypto","employee"].includes(own.role)?"savings":"internal";reason="Compte destinataire ou émetteur identifié parmi tes comptes";}
  else if(t.amount<0)flow="expense";
  else if(/\brefund\b|\bremb(?:oursement)? (?:cb|carte|achats?)\b/.test(normalize(t.label)))flow="refund";
  else flow="income";
 }
 return {flow,category:cat,reason,manual:override?.flow!=="auto"&&!!override};
}
function candidates(db) {
 const all=visible(db).filter(t=>t.status==="BOOK"&&!["internal","savings"].includes(classify(db,t).flow)&&!db.overrides[t.id]&&/\bvirement\b|\bvir\b|transfer|revolut|recharge/.test(normalize(t.label)));
 const groups=new Map(),matches=new Map(),result=new Map();
 for(const t of all){const key=t.currency+":"+t.amount;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(t);}
 for(const t of all){const group=groups.get(t.currency+":"+(-t.amount))||[];matches.set(t.id,group.length>200?[]:group.filter(o=>o.accountId!==t.accountId&&Math.abs(Date.parse(o.date)-Date.parse(t.date))<=7*86400000));}
 for(const t of all){const possible=matches.get(t.id);if(possible.length===1&&matches.get(possible[0].id)?.length===1)result.set(t.id,possible[0].id);}
 return result;
}
function summary(db,month) {
 if(!/^\d{4}-(0[1-9]|1[012])$/.test(month))throw Error("Mois invalide.");
 const totals={gross:0,refunds:0,net:0,incoming:0,savingsOut:0,savingsIn:0,internalOut:0,pending:0,otherCurrency:0,undated:0,unclassified:0,count:0,categories:{}};
 for(const t of visible(db).filter(t=>t.date.slice(0,7)===month)) {
  if(t.currency!=="EUR"){totals.otherCurrency++;continue;}
  if(t.dateBasis!=="booking")totals.undated++;
  if(t.status!=="BOOK"){totals.pending++;continue;}
  const c=classify(db,t),fee=["internal","savings"].includes(c.flow)?(db.overrides[t.id]?.fee||0):0;totals.count++;
  if(fee){totals.gross+=fee;totals.categories["Frais bancaires"]=(totals.categories["Frais bancaires"]||0)+fee;}
  if(c.flow==="expense"&&t.amount<0){totals.gross-=t.amount;totals.categories[c.category]=(totals.categories[c.category]||0)-t.amount;if(c.category==="À classer")totals.unclassified++;}
  else if(c.flow==="refund"&&t.amount>0){totals.refunds+=t.amount;totals.categories[c.category]=(totals.categories[c.category]||0)-t.amount;}
  else if(c.flow==="income"&&t.amount>0)totals.incoming+=t.amount;
  else if(c.flow==="internal"&&t.amount<0)totals.internalOut+=-t.amount-fee;
  else if(c.flow==="savings"){if(t.amount<0)totals.savingsOut+=-t.amount-fee;else totals.savingsIn+=t.amount;}
 }
 totals.net=totals.gross-totals.refunds;
 for(const n of Object.values(totals))if(typeof n==="number"&&!Number.isSafeInteger(n))throw Error("Total hors limite.");
 return totals;
}
function normalizeAPI(raw,accountId) {
 if(!raw?.transaction_amount||!["CRDT","DBIT"].includes(raw.credit_debit_indicator))throw Error("Montant ou sens d’une opération bancaire manquant.");
 const amount=Math.abs(money(raw.transaction_amount.amount))*(raw.credit_debit_indicator==="DBIT"?-1:1);
 const other=amount<0?raw.creditor:raw.debtor;
 const cp=amount<0?raw.creditor_account:raw.debtor_account;
 const label=[other?.name,...(Array.isArray(raw.remittance_information)?raw.remittance_information:[])].filter(Boolean).join(" · ")||raw.bank_transaction_code?.description||"Opération bancaire";
 const ds=raw.booking_date||raw.transaction_date||raw.value_date;
 return {id:"",accountId,amount,currency:String(raw.transaction_amount.currency||"").toUpperCase(),date:date(ds),dateBasis:raw.booking_date?"booking":"fallback",label:label.slice(0,2000),counterpartyIban:iban(cp?.iban),status:String(raw.status||"OTHR"),source:"api",entryRef:String(raw.entry_reference||""),mcc:String(raw.merchant_category_code||""),category:category(label,raw.merchant_category_code)};
}
function replaceAPI(db,accountId,rawRows,from,to) {
 date(from);date(to);
 const parsed=rawRows.map(r=>normalizeAPI(r,accountId));
 const occurrence=new Map(),stable=new Map(),rows=[];
 for(const t of parsed) {
  if(t.entryRef){
   t.id="api:"+accountId+":"+t.entryRef;
   const old=stable.get(t.id);
   if(old){
    if(old.status==="BOOK"&&t.status==="BOOK"&&(old.amount!==t.amount||old.currency!==t.currency||old.date!==t.date))throw Error("La banque renvoie deux écritures contradictoires pour le même identifiant.");
    const rank={BOOK:3,CNCL:4,RJCT:4,PDNG:2,HOLD:1,SCHD:0,OTHR:0};
    if((rank[t.status]||0)>=(rank[old.status]||0))Object.assign(old,t);
    continue;
   }
   stable.set(t.id,t);
  }
  else {const k=hash(fingerprint(t)+"|"+t.status);const n=(occurrence.get(k)||0)+1;occurrence.set(k,n);t.id="api:"+accountId+":"+k+":"+n;}
  rows.push(t);
 }
 const map=new Map(db.transactions.filter(t=>!(t.accountId===accountId&&t.source==="api"&&t.date>=from&&t.date<=to)).map(t=>[t.id,t]));
 for(const t of rows)map.set(t.id,t);
 db.transactions=[...map.values()];
 return rows.length;
}
function csv(text) {
 text=String(text).replace(/^\uFEFF/,"");
 const first=text.split(/\r?\n/)[0],sep=(first.match(/;/g)||[]).length>(first.match(/,/g)||[]).length?";":((first.match(/\t/g)||[]).length>0?"\t":",");
 const rows=[];let row=[],cell="",quoted=false;
 for(let i=0;i<=text.length;i++) {
  const ch=text[i];
  if(ch==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}
  else if(!quoted&&(ch===sep||ch==="\n"||ch==="\r"||ch===undefined)) {
   row.push(cell);cell="";
   if(ch!==sep){if(row.some(v=>v.trim()))rows.push(row);row=[];if(ch==="\r"&&text[i+1]==="\n")i++;}
  }else if(ch!==undefined)cell+=ch;
 }
 if(quoted)throw Error("Fichier CSV incomplet : guillemet non fermé.");
 if(rows.length<2)throw Error("Le fichier doit contenir un en-tête et des opérations.");
 if(rows.length>30001)throw Error("Import limité à 30 000 opérations par fichier.");
 return {headers:rows[0].map(s=>s.trim()),rows:rows.slice(1),sep};
}
function guessColumns(headers) {
 const names=headers.map(normalize);
 const find=patterns=>names.findIndex(n=>patterns.some(p=>p.test(n)));
 return {date:find([/^date$/, /^dateop$/, /date.*operation/,/date.*compta/,/completed date/,/booking date/]),
 label:find([/libelle/,/description/,/^label$/,/intitule/]),amount:find([/^montant$/, /^amount$/, /montant.*eur/,/amount.*eur/]),
 debit:find([/^debit$/]),credit:find([/^credit$/]),currency:find([/devise/,/currency/]),
 reference:find([/^id.*transaction/,/^transaction.*id/,/^reference.*operation/,/^entry.reference$/]),
 status:find([/^state$/, /^statut$/, /^status$/]),counterparty:find([/iban.*beneficiaire/,/iban.*contrepartie/,/counterparty.*iban/])};
}
function importRows(db,accountId,parsed,map,currency="EUR") {
 const account=db.accounts.find(a=>a.id===accountId);if(!account)throw Error("Choisis un compte.");
 if(account.sourceMode!=="csv")throw Error("Ce compte utilise la connexion bancaire. Choisis la source Fichiers dans sa fiche avant d’importer.");
 if(map.date<0||map.label<0||(map.amount<0&&map.debit<0&&map.credit<0))throw Error("Associe la date, le libellé et le montant.");
 const ready=[],errors=[];
 for(let i=0;i<parsed.rows.length;i++) {
  const r=parsed.rows[i];
  try {
   let amount;if(map.amount>=0)amount=money(r[map.amount]);else amount=(map.credit>=0&&r[map.credit]?.trim()?Math.abs(money(r[map.credit])):0)-(map.debit>=0&&r[map.debit]?.trim()?Math.abs(money(r[map.debit])):0);
   const label=String(r[map.label]||"").trim().slice(0,2000);if(!label)throw Error("Libellé manquant.");
   const cur=map.currency>=0?String(r[map.currency]||currency).trim().toUpperCase():currency;
   if(!/^[A-Z]{3}$/.test(cur))throw Error("Devise invalide.");
   const st=map.status>=0?normalize(r[map.status]):"book";
   const status=["book","booked","completed","comptabilise","comptabilisee","termine","terminee",""].includes(st)?"BOOK":(["pending","en attente","pdng"].includes(st)?"PDNG":"OTHR");
   ready.push({id:"",accountId,date:date(r[map.date]),dateBasis:"booking",amount,currency:cur,label,counterpartyIban:map.counterparty>=0?iban(r[map.counterparty]):"",entryRef:map.reference>=0?String(r[map.reference]||""):"",status,source:"csv",category:category(label)});
  } catch(e){errors.push({line:i+2,message:e.message});}
 }
 if(errors.length)return {added:0,duplicates:0,errors};
 const existing=new Set(db.transactions.map(t=>t.id)),occurrence=new Map();let added=0,duplicates=0;
 for(const t of ready) {
  const k=t.entryRef||hash(fingerprint(t)),n=(occurrence.get(k)||0)+1;occurrence.set(k,n);
  t.id="csv:"+accountId+":"+k+(t.entryRef?"":":"+n);
  if(existing.has(t.id)){duplicates++;continue;}
  existing.add(t.id);db.transactions.push(t);added++;
 }
 return {added,duplicates,errors:[],withoutReference:ready.filter(t=>!t.entryRef).length};
}
function backup(db) {
 const copy=JSON.parse(JSON.stringify(db));
 copy.connections=[];copy.pendingAuth=null;copy.settings={appId:"",pem:"",redirect:"https://onbreax.github.io/mes-depenses-retour.html"};
 copy.cryptoSettings={key:"",secret:"",accountId:""};
 for(const a of copy.accounts){delete a.apiUid;delete a.connectionId;delete a.sessionId;delete a.lastSync;}
 return validate(copy);
}
const institutions=["La Banque Postale","Revolut","BoursoBank","Crypto.com","Esalia","Fédéral Finance"];
const assetRoles=["savings","crypto","employee"];
const today=()=>{const d=new Date();return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");};
function validValue(n){return Number.isSafeInteger(n)&&Math.abs(n)<=100000000000;}
function checkValuation(v,ids){
 if(!v||typeof v.id!=="string"||!v.id||!ids.has(v.accountId)||!validValue(v.value)||!["manual","csv","bank","crypto"].includes(v.source)||typeof v.note!=="string"||v.note.length>2000)throw Error("Valorisation invalide.");
 if(date(v.date)!==v.date)throw Error("La date de valorisation doit être une date civile.");
 if(v.available!==null&&(!validValue(v.available)||v.available<0||v.available>v.value))throw Error("Le montant disponible doit être compris entre zéro et la valeur totale.");
 if(!Array.isArray(v.details)||v.details.length>500)throw Error("Détail de valorisation invalide.");
 for(const p of v.details)if(!p||typeof p.label!=="string"||p.label.length>200||!validValue(p.value)||p.value<0||(p.available!==null&&(!validValue(p.available)||p.available<0||p.available>p.value)))throw Error("Support de placement invalide.");
 if(v.details.length&&v.details.reduce((s,p)=>s+p.value,0)!==v.value)throw Error("Le total des supports diffère du montant déclaré.");
 if(v.details.length&&v.available!==null&&(v.details.some(p=>p.available===null)||v.details.reduce((s,p)=>s+p.available,0)!==v.available))throw Error("Disponibilité des supports incohérente.");
}
function validateWealth(db,ids){
 if(!Array.isArray(db.valuations)||db.valuations.length>10000)throw Error("Historique des avoirs invalide.");
 const keys=new Set(),valuationIds=new Set();
 for(const v of db.valuations){
  checkValuation(v,ids);const k=v.accountId+":"+v.date;
  if(keys.has(k)||valuationIds.has(v.id))throw Error("Valorisation dupliquée.");
  keys.add(k);valuationIds.add(v.id);
  if(v.value<0&&db.accounts.find(a=>a.id===v.accountId).role!=="current")throw Error("Une valorisation de placement ne peut pas être négative.");
 }
 if(!db.budgets||typeof db.budgets!=="object"||Array.isArray(db.budgets)||Object.keys(db.budgets).length>600)throw Error("Budgets invalides.");
 for(const [m,b] of Object.entries(db.budgets)){
  if(!/^\d{4}-(0[1-9]|1[012])$/.test(m)||!b||(b.total!==null&&(!validValue(b.total)||b.total<0))||!b.categories||typeof b.categories!=="object"||Array.isArray(b.categories))throw Error("Budget mensuel invalide.");
  for(const [c,n] of Object.entries(b.categories))if(!categories.includes(c)||!validValue(n)||n<0)throw Error("Budget de catégorie invalide.");
 }
 const c=db.cryptoSettings;
 if(!c||typeof c.key!=="string"||c.key.length>500||typeof c.secret!=="string"||c.secret.length>2000||typeof c.accountId!=="string"||(c.accountId&&!ids.has(c.accountId)))throw Error("Paramètres Crypto.com invalides.");
}
function recordValuation(db,input){
 const a=db.accounts.find(a=>a.id===input.accountId);if(!a||a.role==="excluded")throw Error("Choisis un compte suivi.");
 const v={id:input.accountId+":"+date(input.date),accountId:input.accountId,date:date(input.date),value:input.value,available:input.available??null,source:input.source||"manual",note:input.note||"",details:input.details||[]};
 checkValuation(v,new Set(db.accounts.map(a=>a.id)));
 if(v.date>today())throw Error("Une valorisation doit être datée d’aujourd’hui ou d’un jour passé.");
 if(v.value<0&&a.role!=="current")throw Error("La valeur d’un placement ne peut pas être négative.");
 db.valuations=db.valuations.filter(old=>old.accountId!==v.accountId||old.date!==v.date);db.valuations.push(v);
 return v;
}
function wealth(db,asOf=today()){
 date(asOf);
 const items=db.accounts.filter(a=>a.role!=="excluded").map(account=>{
  let valuation=db.valuations.filter(v=>v.accountId===account.id&&v.date<=asOf).sort((a,b)=>b.date.localeCompare(a.date))[0]||null;
  const b=account.balance;
  if(!valuation&&b?.currency==="EUR"&&["CLBD","ITBD"].includes(b.type)&&date(b.at)<=asOf)valuation={date:date(b.at),value:b.amount,available:null,source:"bank",details:[],note:""};
  return {account,valuation,stale:!!valuation&&(Date.parse(asOf)-Date.parse(valuation.date))/86400000>30};
 });
 const known=items.filter(i=>i.valuation);
 const sum=fn=>{const n=known.filter(fn).reduce((s,i)=>s+i.valuation.value,0);if(!Number.isSafeInteger(n))throw Error("Total des avoirs hors limite.");return n;};
 return {items,total:sum(()=>true),bank:sum(i=>i.account.role==="current"),invested:sum(i=>assetRoles.includes(i.account.role)),missing:items.length-known.length,known:known.length,stale:items.filter(i=>i.stale).length};
}
function valuationCSV(db,accountId,parsed,map){
 if(!db.accounts.some(a=>a.id===accountId&&a.role!=="excluded"))throw Error("Choisis un compte.");
 if(map.date<0||map.label<0||map.value<0)throw Error("Associe Date, Support et Valeur en EUR.");
 if(!parsed.rows.length||parsed.rows.length>500)throw Error("Le relevé doit contenir entre 1 et 500 supports.");
 for(const index of parsed.headers.map((h,i)=>/^(compte|account|etablissement)$/.test(normalize(h))?i:-1).filter(i=>i>=0)){
  if(new Set(parsed.rows.map(r=>normalize(r[index]))).size>1)throw Error("Le fichier contient plusieurs comptes ou établissements. Sépare les relevés avant de choisir le compte destinataire.");
 }
 const groups=new Map();
 for(let i=0;i<parsed.rows.length;i++){
  const r=parsed.rows[i];
  try{
   const day=date(r[map.date]),label=String(r[map.label]||"").trim();
   if(!label||label.length>200)throw Error("Support manquant ou trop long.");
   if(map.currency>=0&&String(r[map.currency]).trim().toUpperCase()!=="EUR")throw Error("Seules les valorisations EUR sont acceptées.");
   const value=money(r[map.value]),available=map.available>=0&&String(r[map.available]||"").trim()?money(r[map.available]):null;
   if(value<0||available!==null&&(available<0||available>value))throw Error("Valeur ou disponibilité incohérente.");
   if(day>today())throw Error("Date à venir.");
   if(!groups.has(day))groups.set(day,[]);
   const details=groups.get(day);
   if(details.some(p=>normalize(p.label)===normalize(label)))throw Error("Support répété pour la même date : distingue les lignes ou retire le doublon.");
   details.push({label,value,available});
  }catch(e){throw Error("Ligne "+(i+2)+" : "+e.message);}
 }
 return [...groups].map(([day,details])=>({accountId,date:day,value:details.reduce((s,p)=>s+p.value,0),available:details.every(p=>p.available!==null)?details.reduce((s,p)=>s+p.available,0):null,source:"csv",note:"Relevé de valorisation importé",details}));
}
function budgetSummary(db,month){
 const totals=summary(db,month),b=db.budgets[month]||{total:null,categories:{}};
 const line=(limit,spent)=>({limit,spent:Math.max(0,spent),remaining:limit===null?null:limit-Math.max(0,spent),ratio:limit===null||limit===0?null:Math.max(0,spent)/limit});
 return {total:line(b.total,totals.net),categories:Object.entries(b.categories).map(([category,limit])=>({category,...line(limit,totals.categories[category]||0)}))};
}
function demo(month) {
 const db=empty();
 db.accounts=[
 {id:"demo-bourso",name:"BoursoBank",bank:"BoursoBank",role:"current",sourceMode:"csv",iban:"DEMOBOURSO",currency:"EUR"},
 {id:"demo-postale",name:"La Banque Postale",bank:"La Banque Postale",role:"current",sourceMode:"csv",iban:"DEMOPOSTALE",currency:"EUR"},
 {id:"demo-revolut",name:"Revolut",bank:"Revolut",role:"current",sourceMode:"csv",iban:"DEMOREVOLUT",currency:"EUR"},
 {id:"demo-savings",name:"Épargne (repère fictif)",bank:"Autre",role:"savings",sourceMode:"csv",iban:"DEMOEPARGNE",currency:"EUR"}];
 const entries=[
 ["demo-bourso",3,-80000,"Loyer","Logement"],["demo-bourso",5,-7635,"Monoprix","Courses"],
 ["demo-revolut",6,-2490,"Restaurant","Restaurants"],["demo-postale",7,-8640,"Navigo","Transport"],
 ["demo-bourso",8,-4500,"Électricité","Factures"],["demo-revolut",9,-1299,"Abonnement","Abonnements"],
 ["demo-bourso",10,280000,"Virement salaire","Autres"],["demo-postale",11,-30000,"Virement vers BoursoBank","Autres","DEMOBOURSO"],
 ["demo-bourso",11,30000,"Virement Banque Postale","Autres","DEMOPOSTALE"],
 ["demo-bourso",12,-15000,"Versement épargne","Autres","DEMOEPARGNE"],
 ["demo-bourso",13,-3500,"Achats","Achats"],["demo-bourso",14,1500,"Remboursement achats","Achats"],
 ["demo-revolut",15,-1790,"Pharmacie","Santé"],["demo-postale",16,-400,"Frais de tenue de compte","Frais bancaires"]];
 db.transactions=entries.map((e,i)=>({id:"demo:"+i,accountId:e[0],date:month+"-"+String(e[1]).padStart(2,"0"),dateBasis:"booking",amount:e[2],currency:"EUR",label:e[3],category:e[4],counterpartyIban:e[5]||"",status:"BOOK",source:"csv",entryRef:""}));
 for(const [i,bank] of ["Crypto.com","Esalia","Fédéral Finance"].entries()){
  const a={id:"demo-asset-"+i,name:["Portefeuille crypto","Épargne salariale","Épargne salariale"][i],bank,role:i===0?"crypto":"employee",sourceMode:"csv",iban:"",currency:"EUR"};db.accounts.push(a);
  recordValuation(db,{accountId:a.id,date:today(),value:[123450,856000,432100][i],available:i===0?null:[0,250000,100000][i],source:"manual",note:"Donnée fictive"});
 }
 db.budgets[month]={total:160000,categories:{Courses:30000,Restaurants:10000}};
 return db;
}
const api={categories,flows,normalize,iban,money,date,hash,category,empty,validate,visible,classify,candidates,summary,normalizeAPI,replaceAPI,csv,guessColumns,importRows,backup,demo,institutions,assetRoles,today,recordValuation,wealth,valuationCSV,budgetSummary};
if(typeof module!=="undefined"&&module.exports)module.exports=api;else root.SpendingCore=api;
})(typeof globalThis!=="undefined"?globalThis:this);
