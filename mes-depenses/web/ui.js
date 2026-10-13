(function() {
"use strict";
const C=SpendingCore,V=SpendingVault,B=SpendingBank,$=s=>document.querySelector(s);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const euro=n=>new Intl.NumberFormat("fr-FR",{style:"currency",currency:"EUR"}).format(n/100);
const amount=t=>new Intl.NumberFormat("fr-FR",{style:"currency",currency:t.currency}).format(t.amount/100);
const shortDate=d=>d.slice(8,10)+"/"+d.slice(5,7)+"/"+d.slice(0,4);
const monthLabel=m=>new Intl.DateTimeFormat("fr-FR",{month:"long",year:"numeric"}).format(new Date(m+"-15T12:00:00"));
const nowMonth=()=>{const d=new Date();return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0");};
let db=null,committedDB=null,epoch=0,view="month",month=nowMonth(),demo=false,busy=false,page=0,filterAccount="",filterFlow="",search="",pendingCSV=null,parsedFile=null,bankList=[],callbackURL="",bankAccountSelection=null,lastActivity=Date.now(),lastFocus=null;
let storage;
try{storage=localStorage;storage.getItem(V.KEY);}catch{storage={getItem:()=>null,setItem:()=>{throw Error("Stockage indisponible.");}};}
const vault=new V.Vault(storage);
let nativePort=null,nativeReady=false;const nativeRequests=new Map();
function native(action,data={}) {
 if(!nativePort)throw Error("Le transport Android n’est pas disponible.");
 const id=crypto.randomUUID();
 return new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{nativeRequests.delete(id);reject(Error("Android n’a pas répondu à temps."));},90000);
  nativeRequests.set(id,{resolve,reject,timer});
  nativePort.postMessage(JSON.stringify({action,id,...data}));
 });
}
window.addEventListener("message",event=>{
 if(location.origin!=="https://appassets.androidplatform.net"||event.data!=="mes-depenses:bridge:1"||!event.ports?.[0])return;
 nativePort=event.ports[0];nativeReady=true;
 nativePort.onmessage=e=>{
  let data;try{data=JSON.parse(e.data);}catch{return;}
  if(data.type==="callback"){callbackURL=data.url;toast("Retour bancaire reçu. Déverrouille ton espace pour terminer.");if(db)showCallback();return;}
  const p=nativeRequests.get(data.id);if(!p)return;
  clearTimeout(p.timer);nativeRequests.delete(data.id);
  if(data.ok)p.resolve(data.value);else p.reject(Error(data.error||"Action Android interrompue."));
 };
 nativePort.start();
 native("ready").catch(()=>{});
});
const localServer=()=>["127.0.0.1","localhost"].includes(location.hostname)&&location.protocol==="http:";
const transportAvailable=()=>nativeReady||localServer();
async function transport(request) {
 if(nativeReady)return native("http",request);
 if(!localServer())throw Error("Pour connecter les banques, utilise l’APK Android ou la version ordinateur lancée avec le serveur local. Le HTML autonome permet les imports.");
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),65000);
 try{const r=await fetch("/bank-api",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(request),signal:controller.signal,credentials:"omit"});if(!r.ok)throw Error("Le service local n’a pas pu joindre Enable Banking.");return r.json();}
 finally{clearTimeout(timer);}
}
const bank=new B.BankClient({core:C,credentials:()=>db&&!demo&&vault.unlocked?db.settings:null,transport});
function toast(text) {$("#toast").textContent=text;$("#toast").hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$("#toast").hidden=true,6000);}
function authScreen() {
 const exists=vault.exists();$("#app").hidden=true;$("#auth").hidden=false;
 $("#auth-title").textContent=exists?"Retrouve ton espace.":"Ton mois, en clair.";
 $("#auth-description").textContent=exists?"Déverrouille les données chiffrées enregistrées sur cet appareil.":"Crée un espace chiffré pour les dépenses de tes comptes courants. Conserve ce mot de passe : il est nécessaire pour relire tes données.";
 $("#confirm-box").hidden=exists;$("#password").autocomplete=exists?"current-password":"new-password";
 $("#auth-submit").textContent=exists?"Déverrouiller":"Créer mon espace";
 $("#auth-error").textContent="";$("#password").value="";$("#password-confirm").value="";
}
async function persist() {C.validate(db);const saved=JSON.stringify(db),generation=epoch;if(!demo)await vault.save(db);if(generation===epoch)committedDB=saved;}
async function perform(fn) {
 if(busy){toast("Une opération est en cours.");return;}
 busy=true;$("#busy").hidden=false;$("#status").innerHTML='<div class="progress"><span class="spinner"></span>Opération en cours…</div>';
 const before=db?JSON.stringify(db):null,generation=epoch;
 try{await fn();}
 catch(e){
  if(generation!==epoch)return;
  if(before&&db)db=JSON.parse(committedDB||before);
  const target=!$("#auth").hidden?$("#auth-error"):($("#modal").hidden?$("#status"):$("#modal-error"));
  if(target.id==="status")target.innerHTML='<div class="notice" role="alert">'+esc(e.message)+'</div>';else target.textContent=e.message;
  toast(e.message);
 }finally{if(generation===epoch){busy=false;$("#busy").hidden=true;if($("#status").querySelector(".progress"))$("#status").innerHTML="";}}
}
function audit(text){db.audit.unshift({at:new Date().toISOString(),text});db.audit=db.audit.slice(0,80);}
function showView(next) {view=next;page=0;render();window.scrollTo({top:0,behavior:"instant"});}
function render() {
 if(!db)return;
 $("#auth").hidden=true;$("#app").hidden=false;$("#demo-banner").hidden=!demo;
 document.querySelectorAll("[data-view]").forEach(el=>el.classList.toggle("active",el.dataset.view===view));
 $("#main-content").innerHTML=view==="month"?renderMonth():view==="transactions"?renderTransactions():renderAccounts();
 bindView();
 measureNavigation();
}
function monthControl() {return '<div class="month-select"><button class="btn" data-month="-1" aria-label="Mois précédent">‹</button><input id="month" type="month" value="'+month+'" aria-label="Mois observé"><button class="btn" data-month="1" aria-label="Mois suivant">›</button></div>';}
function heading(title,description) {return '<div class="view-head"><div><h1>'+title+'</h1><p>'+description+'</p></div>'+monthControl()+'</div>';}
function renderMonth() {
 const s=C.summary(db,month),rows=C.visible(db).filter(t=>t.date.startsWith(month));
 const candidates=C.candidates(db),checks=rows.filter(t=>candidates.has(t.id)).length,hasData=rows.length>0;
 const cats=Object.entries(s.categories).sort((a,b)=>b[1]-a[1]),max=Math.max(1,...cats.map(v=>Math.max(v[1],0)));
 const past=[];
 for(let i=5;i>=0;i--){const d=new Date(month+"-15T12:00:00Z");d.setUTCMonth(d.getUTCMonth()-i);const m=d.toISOString().slice(0,7),total=C.summary(db,m);past.push({m,total,data:C.visible(db).some(t=>t.date.startsWith(m))});}
 const maxPast=Math.max(1,...past.map(v=>Math.max(0,v.total.net)));
 let notice="";
 if(s.pending)notice+='<div class="notice neutral">'+s.pending+' opération(s) en attente ou à statut non comptabilisé, exclue(s) du total.</div>';
 if(s.otherCurrency)notice+='<div class="notice">'+s.otherCurrency+' opération(s) dans une autre devise. Le total affiche uniquement les euros, sans conversion estimée.</div>';
 if(s.undated)notice+='<div class="notice">'+s.undated+' opération(s) sans date de comptabilisation fournie : la date d’opération est utilisée.</div>';
 if(checks)notice+='<div class="notice">'+checks+' opération(s) pourraient être des virements internes. Elles restent comptées jusqu’à confirmation. <button class="btn small" id="review-transfers">Vérifier</button></div>';
 return heading("Mon mois","Comprendre tes dépenses, toutes banques réunies.")+notice+
 '<section class="panel hero-panel"><span class="hero-eyebrow">Dépenses nettes enregistrées · '+esc(monthLabel(month))+'</span><div class="hero-number">'+(hasData?euro(s.net):"—")+'</div><p class="muted" style="margin:0;font-size:13px">Dépenses moins remboursements identifiés. Les revenus, virements internes et mouvements d’épargne sont séparés.</p></section>'+
 '<div class="metrics"><section class="panel metric"><small>Dépenses brutes</small><span class="value">'+(hasData?euro(s.gross):"—")+'</span><small>Paiements et sorties classés en dépenses</small></section><section class="panel metric"><small>Remboursements</small><span class="value credit">'+(hasData?euro(s.refunds):"—")+'</span><small>Remboursements identifiés ce mois</small></section><section class="panel metric"><small>Entrées externes</small><span class="value">'+(hasData?euro(s.incoming):"—")+'</span><small>Séparées des dépenses nettes</small></section></div>'+
 '<div class="dashboard"><section class="panel"><div class="panel-heading"><h2>Où va ton argent ?</h2><span class="pill">'+s.unclassified+' à classer</span></div>'+
 (cats.length?cats.map(([cat,n])=>'<div class="category-row"><span>'+esc(cat)+'</span><div class="category-track"><div class="category-bar" style="width:'+Math.max(0,n)/max*100+'%"></div></div><span class="amount">'+euro(n)+'</span></div>').join(""):'<div class="empty">Les catégories apparaîtront après un import ou une synchronisation.</div>')+
 '</section><section class="panel"><div class="panel-heading"><h2>Au fil des mois</h2><span class="pill">6 mois</span></div><div class="chart" role="img" aria-label="Dépenses nettes enregistrées sur les six derniers mois">'+
 past.map(v=>'<div class="chart-column"><span class="chart-value">'+(v.data?euro(v.total.net):"—")+'</span><div class="chart-bar" style="height:'+Math.max(2,Math.max(0,v.total.net)/maxPast*108)+'px"></div><span class="chart-label">'+new Intl.DateTimeFormat("fr-FR",{month:"short"}).format(new Date(v.m+"-15"))+'</span></div>').join("")+
 '</div><p class="small-note" style="margin:18px 0 0">Une absence de données n’est pas une dépense nulle. L’historique dépend des opérations importées ou disponibles auprès des banques.</p></section>'+
 '<section class="panel"><div class="panel-heading"><h2>Dernières opérations</h2><button class="btn small" data-open-operations>Toutes les opérations</button></div>'+
 rows.sort((a,b)=>b.date.localeCompare(a.date)).slice(0,5).map(t=>'<div class="recent-row" data-transaction="'+esc(t.id)+'" tabindex="0" role="button"><div><strong>'+esc(t.label)+'</strong><small>'+shortDate(t.date)+' · '+esc(accountName(t.accountId))+'</small></div><span class="amount '+(t.amount>0?"credit":"")+'">'+amount(t)+'</span></div>').join("")+
 (!rows.length?'<div class="empty"><h3>Ton espace est prêt.</h3><p>Ajoute un compte puis importe ses opérations, ou configure Enable Banking.</p><button class="btn primary" data-open-accounts>Ajouter mes comptes</button></div>':"")+
 '</section><section class="panel"><div class="panel-heading"><h2>À part, sans gonfler les dépenses</h2></div><ul class="mini-list"><li><span>Virements internes sortants</span><strong>'+euro(s.internalOut)+'</strong></li><li><span>Versements vers l’épargne</span><strong>'+euro(s.savingsOut)+'</strong></li><li><span>Retours depuis l’épargne</span><strong>'+euro(s.savingsIn)+'</strong></li></ul><div class="method">Le suivi de l’épargne n’est pas un bilan de patrimoine. Un compte d’épargne peut servir de repère pour reconnaître les transferts, sans être connecté.</div></section></div>';
}
function accountName(id){return db.accounts.find(a=>a.id===id)?.name||"Compte";}
const flowLabel=f=>({expense:"Dépense",refund:"Remboursement",income:"Entrée externe",internal:"Virement interne",savings:"Épargne",auto:"Automatique"}[f]||f);
function renderTransactions() {
 const possible=C.candidates(db);
 let rows=C.visible(db).filter(t=>t.date.startsWith(month)&&(!filterAccount||t.accountId===filterAccount)&&(!search||C.normalize(t.label+" "+accountName(t.accountId)).includes(C.normalize(search))));
 if(filterFlow==="review")rows=rows.filter(t=>possible.has(t.id));
 else if(filterFlow==="pending")rows=rows.filter(t=>t.status!=="BOOK");
 else if(filterFlow)rows=rows.filter(t=>C.classify(db,t).flow===filterFlow);
 rows.sort((a,b)=>b.date.localeCompare(a.date)||a.id.localeCompare(b.id));page=Math.min(page,Math.max(0,Math.ceil(rows.length/40)-1));
 const list=rows.slice(page*40,page*40+40);
 return heading("Opérations","Chaque ligne reste consultable, y compris les virements internes.")+
 '<div class="filters"><input id="search" type="search" placeholder="Commerçant, libellé…" value="'+esc(search)+'" aria-label="Rechercher une opération"><select id="filter-account" aria-label="Filtrer par compte"><option value="">Tous les comptes courants</option>'+db.accounts.filter(a=>a.role==="current").map(a=>'<option value="'+esc(a.id)+'"'+(a.id===filterAccount?" selected":"")+'>'+esc(a.name)+'</option>').join("")+'</select><select id="filter-flow" aria-label="Filtrer par nature"><option value="">Toutes les opérations</option>'+["expense","refund","income","internal","savings","review","pending"].map(f=>'<option value="'+f+'"'+(f===filterFlow?" selected":"")+'>'+({review:"Transferts à confirmer",pending:"En attente / autres statuts"}[f]||flowLabel(f))+'</option>').join("")+'</select></div>'+
 '<section class="panel table-panel"><table class="table"><thead><tr><th>Date</th><th>Opération</th><th>Compte</th><th>Nature</th><th style="text-align:right">Montant</th></tr></thead><tbody>'+list.map(t=>{
 const c=C.classify(db,t);
 return '<tr data-transaction="'+esc(t.id)+'" tabindex="0"><td>'+shortDate(t.date)+'</td><td><span class="transaction-label">'+esc(t.label)+'</span><span class="transaction-sub">'+esc(c.category)+' · '+(t.status==="BOOK"?flowLabel(c.flow):"Non comptabilisée")+(possible.has(t.id)?" · Transfert à confirmer":"")+'</span><span class="transaction-sub transaction-bank">'+esc(accountName(t.accountId))+'</span></td><td>'+esc(accountName(t.accountId))+'</td><td><span class="pill '+(c.flow==="internal"||c.flow==="savings"?"rose":"")+'">'+flowLabel(c.flow)+'</span></td><td class="amount '+(t.amount>0?"credit":"")+'">'+amount(t)+'</td></tr>';
 }).join("")+'</tbody></table>'+(!list.length?'<div class="empty">Aucune opération pour cette période et ces filtres.</div>':"")+
 '<div class="pagination"><span>'+rows.length+' opération(s) · page '+(page+1)+'</span><div class="actions"><button id="prev-page" class="btn small"'+(page===0?" disabled":"")+'>Précédente</button><button id="next-page" class="btn small"'+((page+1)*40>=rows.length?" disabled":"")+'>Suivante</button></div></div></section>';
}
function maskedIBAN(value){const s=C.iban(value);return s?s.slice(0,4)+" ···· "+s.slice(-4):"IBAN non renseigné";}
function renderAccounts() {
 const cards=db.accounts.map(a=>{
 const balance=a.balance&&a.balance.currency==="EUR"?euro(a.balance.amount):"—";
 return '<section class="panel account-card"><div class="bank-name">'+esc(a.bank)+'</div><h2>'+esc(a.name)+'</h2><small>'+esc(maskedIBAN(a.iban))+'</small><div class="balance">'+balance+'</div><small>'+(a.balance?"Dernier solde reçu · "+esc(a.balance.at.slice(0,10)):"Solde non fourni")+'</small><p style="margin:14px 0 0"><span class="pill '+(a.role==="current"?"":"rose")+'">'+({current:"Compte courant",savings:"Repère d’épargne",excluded:"Hors suivi"}[a.role])+'</span> <span class="pill">'+(a.sourceMode==="api"?"Enable Banking":"Fichiers")+'</span></p>'+
 '<p class="small-note" style="margin:8px 0">'+(a.lastSync?"Opérations actualisées le "+esc(new Date(a.lastSync.at).toLocaleString("fr-FR"))+" · du "+shortDate(a.lastSync.from)+" au "+shortDate(a.lastSync.to):"Aucune synchronisation enregistrée.")+'</p>'+(a.balanceError?'<p class="error">'+esc(a.balanceError)+'</p>':'')+(a.lastSync?.undatedPending?'<p class="field-note">'+a.lastSync.undatedPending+' opérations non comptabilisées sans date fournie : hors total.</p>':'')+'<div class="actions"><button class="btn small" data-account="'+esc(a.id)+'">Modifier</button>'+(a.sourceMode==="csv"&&a.role==="current"?'<button class="btn small" data-import-account="'+esc(a.id)+'">Importer</button>':"")+(a.apiUid&&a.role==="current"?'<button class="btn small" data-sync-account="'+esc(a.id)+'">Actualiser la connexion</button>':"")+'</div></section>';
 }).join("");
 return '<div class="view-head"><div><h1>Mes comptes</h1><p>Trois banques, une lecture commune de tes dépenses.</p></div><div class="actions"><button class="btn" id="add-account">Ajouter un compte</button><button class="btn primary" data-action="settings">Connecter une banque</button></div></div>'+
 '<div class="notice neutral">Sélectionne uniquement les comptes courants pour le budget. Un repère d’épargne sert à reconnaître les transferts : ses opérations sont hors dépenses.</div>'+
 '<div class="accounts-grid">'+cards+'</div>'+
 (!cards?'<section class="panel empty"><h3>Ajoute ton premier compte.</h3><p>Tu peux commencer avec un fichier CSV, puis connecter Enable Banking.</p><button class="btn primary" id="first-account">Ajouter un compte</button></section>':"")+
 '<section class="panel" style="margin-top:18px"><h2>Les derniers changements</h2>'+(!db.audit.length?'<p class="muted">Les imports, synchronisations et confirmations apparaîtront ici.</p>':'<ul class="mini-list">'+db.audit.slice(0,8).map(e=>'<li><span>'+esc(e.text)+'</span><small>'+esc(new Date(e.at).toLocaleString("fr-FR"))+'</small></li>').join("")+'</ul>')+'</section>';
}
function bindView() {
 document.querySelectorAll("[data-month]").forEach(el=>el.onclick=()=>{const d=new Date(month+"-15T12:00:00Z");d.setUTCMonth(d.getUTCMonth()+Number(el.dataset.month));month=d.toISOString().slice(0,7);page=0;render();});
 if($("#month"))$("#month").onchange=e=>{if(/^\d{4}-(0[1-9]|1[012])$/.test(e.target.value)){month=e.target.value;page=0;render();}};
 document.querySelectorAll("[data-transaction]").forEach(el=>{el.onclick=()=>transactionModal(el.dataset.transaction);el.onkeydown=e=>{if(e.key==="Enter")transactionModal(el.dataset.transaction);};});
 document.querySelectorAll("[data-open-operations]").forEach(el=>el.onclick=()=>showView("transactions"));
 document.querySelectorAll("[data-open-accounts]").forEach(el=>el.onclick=()=>showView("accounts"));
 document.querySelectorAll("[data-account]").forEach(el=>el.onclick=()=>accountModal(el.dataset.account));
 document.querySelectorAll("[data-import-account]").forEach(el=>el.onclick=()=>chooseCSV(el.dataset.importAccount));
 document.querySelectorAll("[data-sync-account]").forEach(el=>el.onclick=()=>perform(()=>syncAccount(el.dataset.syncAccount)));
 document.querySelectorAll('[data-action="settings"]').forEach(el=>el.onclick=settingsModal);
 if($("#search"))$("#search").oninput=e=>{search=e.target.value;page=0;const position=e.target.selectionStart;render();$("#search").focus();$("#search").setSelectionRange(position,position);};
 if($("#filter-account"))$("#filter-account").onchange=e=>{filterAccount=e.target.value;page=0;render();};
 if($("#filter-flow"))$("#filter-flow").onchange=e=>{filterFlow=e.target.value;page=0;render();};
 if($("#prev-page"))$("#prev-page").onclick=()=>{page--;render();};
 if($("#next-page"))$("#next-page").onclick=()=>{page++;render();};
 if($("#review-transfers"))$("#review-transfers").onclick=()=>{filterFlow="review";showView("transactions");};
 ["add-account","first-account"].forEach(id=>{if($("#"+id))$("#"+id).onclick=()=>accountModal();});
}
function modal(title,html) {
 lastFocus=document.activeElement;$("#modal-title").textContent=title;$("#modal-body").innerHTML=html;$("#modal-error").textContent="";
 $("#modal").hidden=false;$("#app").inert=true;$("#auth").inert=true;$("#modal-close").focus({preventScroll:true});
}
function closeModal() {
 $("#modal").hidden=true;$("#modal-body").innerHTML="";$("#app").inert=false;$("#auth").inert=false;
 if(lastFocus?.isConnected)lastFocus.focus({preventScroll:true});
}
function transactionModal(id) {
 const t=db.transactions.find(r=>r.id===id);if(!t)return;
 const c=C.classify(db,t),pairId=C.candidates(db).get(id),pair=db.transactions.find(t=>t.id===pairId);
 const options=t.amount<0?["auto","expense","internal","savings"]:["auto","income","refund","internal","savings"];
 modal("Détail de l’opération",'<h3>'+esc(t.label)+'</h3><p class="hero-number" style="font-size:30px">'+amount(t)+'</p><p class="muted">'+shortDate(t.date)+' · '+esc(accountName(t.accountId))+' · '+(t.status==="BOOK"?"Comptabilisée":"Non comptabilisée : "+esc(t.status))+'</p>'+
 '<label for="tx-flow">Nature de l’opération</label><select id="tx-flow">'+options.map(f=>'<option value="'+f+'"'+((db.overrides[id]?.flow||"auto")===f?" selected":"")+'>'+flowLabel(f)+'</option>').join("")+'</select>'+
 '<p class="field-note">Classement actuel : '+esc(flowLabel(c.flow))+'. '+esc(c.reason)+'.</p><label for="tx-category">Catégorie</label><select id="tx-category">'+C.categories.map(cat=>'<option'+(cat===c.category?" selected":"")+'>'+esc(cat)+'</option>').join("")+'</select>'+
 (pair?'<div class="notice neutral" style="margin-top:18px">Transfert possible avec <strong>'+esc(accountName(pair.accountId))+'</strong> : '+amount(pair)+' le '+shortDate(pair.date)+'.<br>Le rapprochement doit être confirmé par toi.<div class="actions"><button class="btn" id="confirm-transfer">Confirmer le virement interne</button></div></div>':"")+
 '<label for="tx-fee">Frais inclus dans un transfert interne ou d’épargne (€)</label><input id="tx-fee" type="number" min="0" step="0.01" value="'+((db.overrides[id]?.fee||0)/100).toFixed(2)+'"><p class="field-note">Facultatif, uniquement si les frais sont inclus dans cette ligne. Une ligne de frais distincte est déjà comptée : ne la ressaisis pas ici.</p><label for="tx-note">Note personnelle</label><textarea id="tx-note" maxlength="2000">'+esc(db.overrides[id]?.note||"")+'</textarea><div class="actions"><button class="btn primary" id="tx-save">Enregistrer</button></div><p class="small-note" style="margin-top:18px">Source : '+(t.source==="api"?"Enable Banking":"fichier importé")+'. '+(t.dateBasis==="booking"?"La date utilisée est la date de comptabilisation.":"La banque ne fournit pas de date de comptabilisation pour cette ligne.")+'</p>');
 $("#tx-save").onclick=()=>perform(async()=>{const fee=C.money($("#tx-fee").value||"0");if(fee<0||fee>Math.abs(t.amount))throw Error("Les frais doivent être compris entre zéro et le montant de l’opération.");db.overrides[id]={flow:$("#tx-flow").value,category:$("#tx-category").value,fee,note:$("#tx-note").value.slice(0,2000)};audit("Classement modifié : "+t.label.slice(0,80));await persist();closeModal();render();});
 if(pair)$("#confirm-transfer").onclick=()=>perform(async()=>{for(const row of [t,pair])db.overrides[row.id]={flow:"internal",category:"Autres",note:db.overrides[row.id]?.note||""};audit("Virement interne confirmé entre "+accountName(t.accountId)+" et "+accountName(pair.accountId));await persist();closeModal();render();});
}
function validIBAN(value) {
 const s=C.iban(value);if(!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(s))return false;
 const n=(s.slice(4)+s.slice(0,4)).replace(/[A-Z]/g,c=>String(c.charCodeAt(0)-55));let r=0;for(const c of n)r=(r*10+Number(c))%97;return r===1;
}
function accountModal(id) {
 const a=db.accounts.find(a=>a.id===id);
 modal(a?"Mon compte":"Ajouter un compte",'<form id="account-form"><label for="account-bank">Banque</label><select id="account-bank">'+["BoursoBank","Revolut","La Banque Postale","Autre"].map(n=>'<option'+(a?.bank===n?" selected":"")+'>'+n+'</option>').join("")+'</select><label for="account-name">Nom du compte</label><input id="account-name" maxlength="100" required value="'+esc(a?.name||"")+'" placeholder="Ex. Mon compte courant"><label for="account-iban">IBAN personnel (facultatif pour les imports)</label><input id="account-iban" maxlength="45" value="'+esc(a?.iban||"")+'" placeholder="FR…"><p class="field-note">L’IBAN aide à identifier les virements entre tes comptes. Il reste chiffré dans ton espace.</p><label for="account-role">Rôle</label><select id="account-role">'+[["current","Compte courant · inclus dans les dépenses"],["savings","Épargne · repère pour les transferts"],["excluded","Hors suivi"]].map(([v,n])=>'<option value="'+v+'"'+(a?.role===v?" selected":"")+'>'+n+'</option>').join("")+'</select><label for="account-source">Source utilisée pour le budget</label><select id="account-source"><option value="csv">Fichiers importés</option><option value="api"'+(a?.sourceMode==="api"?" selected":"")+(a?.apiUid?"":" disabled")+'>Connexion Enable Banking</option></select><p class="field-note">Une seule source est comptée par compte. Les imports restent conservés lorsque tu choisis la connexion bancaire.</p><div class="actions"><button type="submit" class="btn primary">Enregistrer le compte</button></div></form>');
 $("#account-form").onsubmit=e=>{e.preventDefault();perform(async()=>{
  const name=$("#account-name").value.trim(),value=C.iban($("#account-iban").value);if(!name)throw Error("Nomme ce compte.");
  if(value&&!demo&&!validIBAN(value))throw Error("L’IBAN ne semble pas valide. Vérifie-le ou laisse ce champ vide.");
  if(value&&db.accounts.some(x=>x.id!==id&&C.iban(x.iban)===value))throw Error("Cet IBAN existe déjà dans ton espace.");
  const item=a||{id:crypto.randomUUID(),currency:"EUR"};
  Object.assign(item,{name,bank:$("#account-bank").value,iban:value,role:$("#account-role").value,sourceMode:$("#account-source").value});
  if(!a)db.accounts.push(item);audit("Compte "+(a?"modifié":"ajouté")+" : "+name);await persist();closeModal();render();
 });};
}
function chooseCSV(accountId) {
 const eligible=db.accounts.filter(a=>a.role==="current"&&a.sourceMode==="csv");
 if(!eligible.length){accountModal();toast("Ajoute un compte courant avec la source Fichiers, puis importe ses opérations.");return;}
 pendingCSV=accountId||eligible[0].id;$("#csv-file").value="";$("#csv-file").click();
}
async function readFile(file) {
 if(file.size>6*1024*1024)throw Error("Fichier limité à 6 Mo.");
 const bytes=new Uint8Array(await file.arrayBuffer());
 if(bytes[0]===255&&bytes[1]===254)return new TextDecoder("utf-16le").decode(bytes);
 try{return new TextDecoder("utf-8",{fatal:true}).decode(bytes);}catch{return new TextDecoder("windows-1252").decode(bytes);}
}
function importModal(parsed,filename) {
 parsedFile=parsed;
 const guessed=C.guessColumns(parsed.headers),fields=[["date","Date de comptabilisation"],["label","Libellé"],["amount","Montant signé"],["debit","Débit (colonne séparée)"],["credit","Crédit (colonne séparée)"],["currency","Devise"],["reference","Identifiant unique d’opération"],["status","Statut"],["counterparty","IBAN de contrepartie"]];
 modal("Importer les opérations",'<p class="muted">'+esc(filename)+' · '+parsed.rows.length+' lignes. Vérifie l’association des colonnes avant l’import.</p><label for="import-account">Compte concerné</label><select id="import-account">'+db.accounts.filter(a=>a.role==="current"&&a.sourceMode==="csv").map(a=>'<option value="'+esc(a.id)+'"'+(a.id===pendingCSV?" selected":"")+'>'+esc(a.name)+'</option>').join("")+'</select><div class="import-grid">'+fields.map(([key,label])=>'<div><label for="map-'+key+'">'+label+'</label><select id="map-'+key+'"><option value="-1">Non fourni</option>'+parsed.headers.map((h,i)=>'<option value="'+i+'"'+(guessed[key]===i?" selected":"")+'>'+esc(h)+'</option>').join("")+'</select></div>').join("")+'</div><label for="import-currency">Devise si le fichier ne l’indique pas</label><select id="import-currency"><option>EUR</option><option>USD</option><option>GBP</option><option>CHF</option></select><p class="field-note">Seules les opérations EUR entrent dans le total en euros. Sans statut, les lignes d’un relevé sont considérées comptabilisées. Associe un identifiant uniquement s’il est unique par opération.</p><h3 style="margin:20px 0 10px">Aperçu du fichier</h3><div class="preview"><table><thead><tr>'+parsed.headers.map(h=>'<th>'+esc(h)+'</th>').join("")+'</tr></thead><tbody>'+parsed.rows.slice(0,3).map(r=>'<tr>'+r.map(v=>'<td>'+esc(v)+'</td>').join("")+'</tr>').join("")+'</tbody></table></div><div class="actions"><button class="btn primary" id="do-import">Importer ces opérations</button></div>');
 $("#do-import").onclick=()=>perform(async()=>{
  const map={};for(const [key] of fields)map[key]=Number($("#map-"+key).value);
  const result=C.importRows(db,$("#import-account").value,parsedFile,map,$("#import-currency").value);
  if(result.errors.length)throw Error("Import non effectué. "+result.errors.slice(0,4).map(e=>"Ligne "+e.line+" : "+e.message).join("\n"));
  audit("Import : "+result.added+" opérations ajoutées, "+result.duplicates+" doublons rapprochés.");
  await persist();closeModal();render();toast(result.added+" opérations ajoutées. "+result.duplicates+" doublons rapprochés.");
  if(result.withoutReference)$("#status").innerHTML='<div class="notice neutral">Certaines lignes n’ont pas d’identifiant unique. Le rapprochement utilise le contenu et le nombre d’occurrences ; vérifie les achats identiques le même jour.</div>';
 });
}
let settingPEM="";
function settingsModal() {
 if(!db)return;
 settingPEM=db.settings.pem;
 const info=db.settings.verified,available=transportAvailable();
 modal("Réglages et connexion",'<p class="muted">Lecture des comptes uniquement. Tes calculs restent locaux ; Enable Banking assure l’accès bancaire après ton autorisation.</p>'+
 (demo?'<div class="notice">La démonstration utilise des données fictives. Quitte-la pour connecter tes comptes.</div>':"")+
 (!available?'<div class="notice neutral">Connexion bancaire disponible dans l’APK Android ou avec le lanceur local sur ordinateur. Le HTML autonome peut importer et analyser des fichiers.</div>':"")+
 '<h3>Enable Banking</h3><ol class="howto"><li>Crée une application <strong>Production</strong> dans <a href="https://enablebanking.com/cp/applications" target="_blank" rel="noopener noreferrer">Enable Banking</a>, puis active-la en liant chacun de tes propres comptes.</li><li>Ajoute cette adresse de retour aux URL autorisées :<br><strong style="overflow-wrap:anywhere">'+B.CALLBACK+'</strong></li><li>Renseigne l’identifiant et importe le fichier de clé privée généré par le service.</li></ol>'+
 '<label for="enable-id">Identifiant de l’application</label><input id="enable-id" autocomplete="off" spellcheck="false" maxlength="36" value="'+esc(db.settings.appId)+'" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"><label>Clé privée locale (.pem)</label><div class="actions" style="margin:0"><button class="btn" id="choose-pem">Importer la clé .pem</button><span id="pem-state" class="small-note">'+(settingPEM?"Clé enregistrée dans l’espace chiffré":"Aucune clé")+'</span></div><p class="field-note">La clé sert à signer les requêtes sur ton appareil. Elle n’est pas envoyée au serveur de connexion et n’est pas incluse dans les sauvegardes d’opérations.</p>'+
 '<div class="actions"><button class="btn primary" id="enable-verify"'+(!available||demo?" disabled":"")+'>Enregistrer et vérifier</button><button class="btn" id="enable-banks"'+(!available||demo?" disabled":"")+'>Choisir une banque</button></div><p id="enable-status" class="small-note">'+(info?'Accès vérifié le '+esc(new Date(info.checkedAt).toLocaleString("fr-FR"))+' · '+esc(info.name):"Accès pas encore vérifié")+'</p>'+
 (db.pendingAuth?'<div class="notice neutral">Une autorisation bancaire a été lancée. <button class="btn small" id="complete-callback">Terminer avec le lien de retour</button></div>':"")+
 '<hr class="separator"><h3>Actualisation</h3><p class="muted">L’actualisation récupère le mois observé et les cinq mois précédents, selon l’historique disponible auprès de chaque banque. Aucun appel IA.</p><button class="btn" id="sync-all"'+(demo||!available?" disabled":"")+'>Actualiser mes comptes connectés</button>'+
 '<hr class="separator"><h3>Sauvegardes et exports</h3><p class="muted">La sauvegarde chiffrée contient les comptes et les opérations, avec leur classement. Les autorisations bancaires et la clé privée sont exclues.</p><div class="actions"><button class="btn" id="backup-export">Sauvegarde chiffrée</button><button class="btn" id="backup-restore">Restaurer</button><button class="btn" id="export-csv">Exporter le mois en CSV</button></div><p class="field-note">Le CSV est un fichier lisible, non chiffré.</p>'+
 '<hr class="separator"><h3>Mode de calcul</h3><p class="small-note">Le total repose sur les opérations comptabilisées en euros. Les remboursements identifiés diminuent les dépenses. Les autres entrées, les virements internes et les transferts d’épargne sont séparés. Les opérations en attente et les autres devises sont signalées sans conversion automatique. Le classement local est toujours modifiable.</p>');
 $("#choose-pem").onclick=()=>{if(demo){toast("La connexion est désactivée en démonstration.");return;}$("#pem-file").value="";$("#pem-file").click();};
 $("#enable-verify").onclick=()=>perform(async()=>{
  if(!transportAvailable())throw Error("Utilise l’APK ou le lanceur local.");
  db.settings.appId=$("#enable-id").value.trim();db.settings.pem=settingPEM;delete db.settings.verified;
  await persist();const verified=await bank.verify();db.settings.verified=verified;await persist();
  $("#enable-status").textContent="Accès vérifié : "+verified.name+" · Production · AIS";toast("L’application Enable Banking est active et reconnue.");
 });
 $("#enable-banks").onclick=()=>perform(async()=>{
  db.settings.appId=$("#enable-id").value.trim();db.settings.pem=settingPEM;await persist();
  const verified=await bank.verify();db.settings.verified=verified;await persist();
  bankList=await bank.banks();bankSelectionModal();
 });
 if($("#complete-callback"))$("#complete-callback").onclick=showCallback;
 $("#sync-all").onclick=()=>perform(async()=>{
  const accounts=db.accounts.filter(a=>a.role==="current"&&a.apiUid);
  if(!accounts.length)throw Error("Connecte et sélectionne un compte courant.");
  for(const a of accounts)await syncAccount(a.id);
  closeModal();render();toast(accounts.length+" compte(s) actualisé(s).");
 });
 $("#backup-export").onclick=backupModal;
 $("#backup-restore").onclick=()=>{$("#backup-file").value="";$("#backup-file").click();};
 $("#export-csv").onclick=()=>perform(exportCSV);
}
function bankSelectionModal() {
 if(!bankList.length)throw Error("Aucune des trois banques n’a été renvoyée pour la France. Vérifie la couverture et l’activation de ton application dans Enable Banking.");
 modal("Choisir une banque",'<p class="muted">La banque demandera ton autorisation dans son propre parcours de connexion. Mes dépenses ne collecte pas tes identifiants bancaires.</p><div class="actions" style="display:grid">'+bankList.map((b,i)=>'<button class="btn" data-bank-index="'+i+'">'+esc(b.name)+'</button>').join("")+'</div>');
 document.querySelectorAll("[data-bank-index]").forEach(el=>el.onclick=()=>perform(async()=>{
  const result=await bank.begin(bankList[Number(el.dataset.bankIndex)]);
  db.pendingAuth={...result.pending,url:result.url};audit("Autorisation lancée : "+result.pending.aspsp.name);await persist();
  modal("Autoriser la connexion",'<p class="muted">Continue dans le navigateur pour autoriser la lecture de tes comptes auprès de '+esc(result.pending.aspsp.name)+'.</p><a class="btn primary" href="'+esc(result.url)+'" target="_blank" rel="noopener noreferrer">Continuer chez Enable Banking et ma banque</a><p class="small-note" style="margin-top:18px">Après l’autorisation, la page de retour permet de revenir dans l’APK ou de copier le lien dans Mes dépenses. L’autorisation reste à confirmer dans ton espace déverrouillé.</p><button class="btn" id="manual-callback">Coller le lien de retour</button>');
  $("#manual-callback").onclick=showCallback;
 }));
}
function showCallback() {
 if(!db)return;
 if(db.pendingAuth?.granted){bankAccountSelection={data:db.pendingAuth.granted,pending:db.pendingAuth};accountSelectionModal();return;}
 modal("Terminer la connexion bancaire",'<p class="muted">Vérifie que l’autorisation a été lancée depuis cet espace. Le retour n’est accepté que pour la connexion en cours.</p><label for="callback-url">Lien de retour après autorisation</label><textarea id="callback-url" autocomplete="off" spellcheck="false">'+esc(callbackURL)+'</textarea><div class="actions"><button class="btn primary" id="finish-connection">Terminer la connexion</button></div>');
 $("#finish-connection").onclick=()=>perform(async()=>{
  if(demo)throw Error("Quitte la démonstration pour te connecter.");
  const pending=db.pendingAuth,data=await bank.finish($("#callback-url").value.trim(),pending);
  db.pendingAuth.granted=data;await persist();bankAccountSelection={data,pending};callbackURL="";accountSelectionModal();
 });
}
function accountSelectionModal() {
 const {data,pending}=bankAccountSelection;
 const family=name=>/bourso/i.test(name)?"bourso":(/revolut/i.test(name)?"revolut":(/banque postale/i.test(name)?"postale":C.normalize(name)));
 const matching=raw=>db.accounts.find(a=>(a.currency||"EUR")===(raw.currency||"EUR")&&((raw.account_id?.iban&&C.iban(a.iban)===C.iban(raw.account_id.iban))||(raw.identification_hash&&a.identification===raw.identification_hash)));
 modal("Sélectionner mes comptes courants",'<p class="muted">'+esc(pending.aspsp.name)+' · '+data.accounts.length+' compte(s) autorisé(s). Les comptes d’épargne et les comptes cartes séparés ne sont pas sélectionnés par défaut.</p>'+
 data.accounts.map((a,i)=>{
  const known=matching(a),choices=db.accounts.filter(old=>old===known||((old.currency||"EUR")===(a.currency||"EUR")&&family(old.bank)===family(pending.aspsp.name))),defaultId=known?known.id:(choices.length?"":"new");
  return '<div class="panel" style="padding:12px;margin:10px 0"><label style="margin:0;display:flex;align-items:center;gap:8px"><input type="checkbox" id="select-account-'+i+'"'+(a.cash_account_type==="CACC"&&(a.currency||"EUR")==="EUR"&&known?.role!=="excluded"?" checked":"")+'> '+esc(a.name||a.product||"Compte")+'</label><p class="small-note" style="margin:7px 0">'+esc(maskedIBAN(a.account_id?.iban))+' · '+esc(a.currency||"Devise non précisée")+' · '+esc(a.cash_account_type||"Type non précisé")+'</p><label for="select-existing-'+i+'">Associer à un compte de mon espace</label><select id="select-existing-'+i+'"><option value="" disabled'+(defaultId===""?" selected":"")+'>Choisir le compte déjà importé ou créer un compte distinct</option>'+choices.map(old=>'<option value="'+esc(old.id)+'"'+(defaultId===old.id?" selected":"")+'>'+esc(old.name)+'</option>').join("")+'<option value="new"'+(defaultId==="new"?" selected":"")+'>Créer un compte distinct</option></select><p class="field-note">Associe les imports et la connexion au même compte pour éviter un double comptage.</p><label for="select-role-'+i+'">Rôle dans Mes dépenses</label><select id="select-role-'+i+'"><option value="current">Compte courant</option><option value="savings"'+(a.cash_account_type==="SVGS"||known?.role==="savings"?" selected":"")+'>Repère d’épargne, sans synchronisation des opérations</option></select></div>';
 }).join("")+
 '<div class="notice neutral">Si une carte à débit différé a son propre compte, sélectionne uniquement le compte courant dans cette première version pour éviter de compter les achats et leur règlement mensuel deux fois.</div><div class="actions"><button class="btn primary" id="save-connected-accounts">Enregistrer et récupérer les opérations</button></div>');
 $("#save-connected-accounts").onclick=()=>perform(async()=>{
  const selected=data.accounts.map((a,i)=>({raw:a,include:$("#select-account-"+i).checked,role:$("#select-role-"+i).value,existing:$("#select-existing-"+i).value})).filter(a=>a.include);
  if(!selected.length)throw Error("Sélectionne au moins un compte.");
  if(selected.some(a=>a.raw.cash_account_type==="CARD"&&a.role==="current"))throw Error("Un compte carte séparé peut doubler le règlement de la carte. Sélectionne le compte courant associé dans cette version.");
  if(selected.some(a=>!a.existing))throw Error("Associe chaque compte sélectionné à ses imports existants, ou choisis explicitement un compte distinct.");
  const existingIds=selected.filter(a=>a.existing!=="new").map(a=>a.existing);
  if(new Set(existingIds).size!==existingIds.length)throw Error("Deux comptes bancaires ne peuvent pas remplacer le même compte de ton espace.");
  const connection={id:data.session_id,bank:pending.aspsp.name,aspsp:pending.aspsp,validUntil:data.access?.valid_until||pending.validUntil};
  db.connections=db.connections.filter(c=>c.id!==connection.id);db.connections.push(connection);
  const ids=[];
  for(const {raw,role,existing} of selected){
   const value=C.iban(raw.account_id?.iban),identification=raw.identification_hash||value||raw.uid;
   let a=existing==="new"?matching(raw):db.accounts.find(a=>a.id===existing);
   if(a&&a.iban&&value&&C.iban(a.iban)!==value)throw Error("Le compte choisi a un IBAN différent. Vérifie l’association.");
   if(!a){a={id:crypto.randomUUID(),name:raw.name||pending.aspsp.name,bank:pending.aspsp.name,iban:value,role,sourceMode:"api",currency:raw.currency||"EUR"};db.accounts.push(a);}
   Object.assign(a,{apiUid:raw.uid,identification,connectionId:connection.id,role,desiredSource:"api",iban:value||a.iban,currency:raw.currency||a.currency||"EUR"});
   ids.push(a.id);
  }
  db.pendingAuth=null;audit("Connexion autorisée : "+connection.bank+" · "+selected.length+" compte(s) retenu(s).");await persist();
  closeModal();view="accounts";render();
  for(const id of ids)if(db.accounts.find(a=>a.id===id).role==="current")await syncAccount(id);
  render();toast("Les comptes sélectionnés sont enregistrés.");
 });
}
function syncRange() {
 const today=new Date(),end=new Date(month+"-15T12:00:00Z"),start=new Date(month+"-01T12:00:00Z");
 start.setUTCMonth(start.getUTCMonth()-5);end.setUTCMonth(end.getUTCMonth()+1,0);
 const todayISO=today.getFullYear()+"-"+String(today.getMonth()+1).padStart(2,"0")+"-"+String(today.getDate()).padStart(2,"0");
 const to=end.toISOString().slice(0,10)<todayISO?end.toISOString().slice(0,10):todayISO;
 if(month>todayISO.slice(0,7))throw Error("Ce mois est à venir. Choisis le mois courant ou un mois passé.");
 return {from:start.toISOString().slice(0,10),to};
}
async function syncAccount(id) {
 if(demo||!db||!vault.unlocked)throw Error("Déverrouille ton espace personnel pour actualiser.");
 const a=db.accounts.find(a=>a.id===id);if(!a?.apiUid||a.role!=="current")throw Error("Ce compte courant n’est pas connecté.");
 const connection=db.connections.find(c=>c.id===a.connectionId);
 if(!connection||!Number.isFinite(Date.parse(connection.validUntil))||new Date(connection.validUntil).getTime()<Date.now())throw Error("L’autorisation bancaire a expiré ou n’est plus enregistrée. Reconnecte ce compte.");
 const {from,to}=syncRange();
 $("#status").innerHTML='<div class="progress"><span class="spinner"></span>'+esc(a.name)+' : récupération des opérations…</div>';
 const raw=await bank.transactions(a.apiUid,from,to);
 if(!db||!vault.unlocked)throw Error("Espace verrouillé. Aucun résultat n’a été enregistré.");
 const undated=raw.filter(t=>!t.booking_date&&!t.transaction_date&&!t.value_date);
 if(undated.some(t=>t.status==="BOOK"))throw Error("La banque renvoie des opérations comptabilisées sans date. Les données précédentes de ce compte sont conservées.");
 const ready=raw.filter(t=>t.booking_date||t.transaction_date||t.value_date);
 C.replaceAPI(db,id,ready,from,to);a.lastSync={at:new Date().toISOString(),from,to,count:ready.length,undatedPending:undated.length};
 a.sourceMode="api";delete a.desiredSource;audit("Opérations actualisées : "+a.name+" · "+ready.length+" lignes reçues.");await persist();
 try{
  const balances=await bank.balances(a.apiUid),b=balances.find(b=>["CLBD","ITBD"].includes(b.balance_type))||balances.find(b=>["CLAV","ITAV"].includes(b.balance_type));
  if(b&&db&&vault.unlocked){a.balance={amount:C.money(b.balance_amount.amount),currency:b.balance_amount.currency,at:new Date().toISOString(),type:b.balance_type};delete a.balanceError;await persist();}
 }catch(e){if(db&&vault.unlocked){a.balanceError="Solde non actualisé : "+e.message;await persist();}}
 render();
}
async function saveFile(name,type,text) {
 if(nativeReady){await native("save",{name,type,text});return;}
 const blob=new Blob([text],{type}),url=URL.createObjectURL(blob),a=document.createElement("a");
 a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function backupModal() {
 modal("Sauvegarde chiffrée",'<p class="muted">Sauvegarde tes comptes, opérations et classements. Les clés et autorisations bancaires sont exclues. Une connexion bancaire devra être autorisée à nouveau après restauration.</p><label for="backup-password">Mot de passe de la sauvegarde</label><input id="backup-password" type="password" autocomplete="new-password" minlength="10"><label for="backup-confirm">Confirmer</label><input id="backup-confirm" type="password" autocomplete="new-password" minlength="10"><p class="field-note">Au moins 10 caractères. Conserve ce mot de passe pour relire le fichier.</p><div class="actions"><button class="btn primary" id="backup-do">Créer la sauvegarde</button></div>');
 $("#backup-do").onclick=()=>perform(async()=>{
  const p=$("#backup-password").value;if(p!==$("#backup-confirm").value)throw Error("Les deux mots de passe sont différents.");
  const data=await vault.export(C.backup(db),p);await saveFile("mes-depenses-sauvegarde-"+new Date().toISOString().slice(0,10)+".json","application/json",data);
  closeModal();toast("Sauvegarde chiffrée préparée.");
 });
}
function csvCell(s) {s=String(s);if(/^[=+@-]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';}
async function exportCSV() {
 const rows=C.visible(db).filter(t=>t.date.startsWith(month));
 const header=["Date","Compte","Libellé","Montant","Devise","Catégorie","Nature","Statut"];
 const text="\uFEFF"+header.map(csvCell).join(";")+"\r\n"+rows.map(t=>{const c=C.classify(db,t);return [csvCell(t.date),csvCell(accountName(t.accountId)),csvCell(t.label),(t.amount/100).toFixed(2),csvCell(t.currency),csvCell(c.category),csvCell(flowLabel(c.flow)),csvCell(t.status)].join(";");}).join("\r\n");
 await saveFile("mes-depenses-"+month+".csv","text/csv",text);toast("CSV du mois préparé.");
}
function restoreModal(text,filename) {
 const exists=!!db||vault.exists();
 modal("Restaurer une sauvegarde",'<p class="muted">'+esc(filename)+'. La restauration remplace les comptes, opérations et classements de cet espace. Les accès bancaires devront être reconnectés.</p><label for="restore-password">Mot de passe de la sauvegarde</label><input id="restore-password" type="password" autocomplete="off">'+(!exists?'<p class="field-note">Ce mot de passe protégera aussi le nouvel espace local.</p>':"")+'<label style="display:flex;align-items:center;gap:8px"><input id="restore-agree" type="checkbox">Je veux restaurer ce fichier'+(exists?" et remplacer les opérations locales":"")+'.</label><div class="actions"><button class="btn primary" id="restore-do">Restaurer</button></div>');
 $("#restore-do").onclick=()=>perform(async()=>{
  if(!$("#restore-agree").checked)throw Error("Confirme la restauration.");
  if(vault.exists()&&!vault.unlocked)throw Error("Déverrouille d’abord l’espace existant pour le remplacer.");
  const password=$("#restore-password").value,opened=await V.decryptData(text,password),clean=C.backup(C.validate(opened.data));
  if(vault.unlocked){const old=db?.settings;db=clean;if(old)db.settings=old;await persist();}
  else{await vault.create(password,clean);db=clean;committedDB=JSON.stringify(db);}
  demo=false;closeModal();render();toast("Sauvegarde restaurée. Les connexions bancaires restent à autoriser.");
 });
}
async function lock() {
 epoch++;busy=false;vault.lock();db=null;committedDB=null;demo=false;settingPEM="";bankList=[];bankAccountSelection=null;closeModal();$("#main-content").innerHTML="";$("#status").innerHTML="";$("#busy").hidden=true;authScreen();
 $("#auth-submit").disabled=true;await vault.queue.catch(()=>{});$("#auth-submit").disabled=false;
}
function measureNavigation() {const h=$("#mobile-nav").getBoundingClientRect().height;if(h>0)document.documentElement.style.setProperty("--nav-height",h+"px");}
$("#auth-form").onsubmit=e=>{e.preventDefault();perform(async()=>{
 if(!crypto.subtle)throw Error("Le chiffrement nécessite un navigateur récent en HTTPS, le lanceur local ou l’APK.");
 const password=$("#password").value;
 if(vault.exists())db=C.validate(await vault.unlock(password));
 else{if(password!==$("#password-confirm").value)throw Error("Les deux mots de passe sont différents.");const fresh=C.empty();await vault.create(password,fresh);db=fresh;}
 demo=false;committedDB=JSON.stringify(db);lastActivity=Date.now();$("#password").value="";$("#password-confirm").value="";render();if(callbackURL)showCallback();
 });};
$("#demo-start").onclick=()=>{if(busy)return;demo=true;db=C.demo(month);committedDB=JSON.stringify(db);render();};
$("#demo-exit").onclick=()=>{if(!busy)lock();};
$("#lock").onclick=()=>lock();
$("#modal-close").onclick=()=>{if(!busy)closeModal();};
$("#modal").onclick=e=>{if(e.target===$("#modal")&&!busy)closeModal();};
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!busy&&!$("#modal").hidden)closeModal();});
document.querySelectorAll("[data-view]").forEach(el=>el.onclick=()=>{if(db)showView(el.dataset.view);});
document.querySelectorAll('[data-action="settings"]').forEach(el=>el.onclick=settingsModal);
$("#global-import").onclick=()=>chooseCSV();
$("#restore-auth").onclick=()=>{$("#backup-file").value="";$("#backup-file").click();};
$("#csv-file").onchange=()=>perform(async()=>{const file=$("#csv-file").files[0];if(!file)return;const parsed=C.csv(await readFile(file));importModal(parsed,file.name);});
$("#pem-file").onchange=()=>perform(async()=>{const file=$("#pem-file").files[0];if(!file)return;if(file.size>20000)throw Error("Fichier de clé privée trop volumineux.");settingPEM=await file.text();if(!settingPEM.includes("-----BEGIN PRIVATE KEY-----"))throw Error("Le fichier doit être une clé privée PEM PKCS#8.");if($("#pem-state"))$("#pem-state").textContent="Clé chargée : "+file.name+" · à enregistrer et vérifier";});
$("#backup-file").onchange=()=>perform(async()=>{const file=$("#backup-file").files[0];if(!file)return;if(file.size>20*1024*1024)throw Error("Sauvegarde trop volumineuse.");restoreModal(await file.text(),file.name);});
["pointerdown","keydown"].forEach(event=>document.addEventListener(event,()=>{lastActivity=Date.now();},{passive:true}));
function idleLock(){if(db&&!demo&&Date.now()-lastActivity>5*60000)lock();}
setInterval(idleLock,15000);
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")idleLock();});
window.addEventListener("mes-depenses-resume",idleLock);
window.addEventListener("storage",e=>{if(e.key===V.KEY&&db&&!demo){lock();toast("L’espace a changé dans une autre fenêtre. Déverrouille-le à nouveau.");}});
if(window.ResizeObserver)new ResizeObserver(measureNavigation).observe($("#mobile-nav"));
window.addEventListener("resize",measureNavigation);
authScreen();
})();
