// Included inside ui.js's private scope by build-web.py.
const roleName=r=>({current:"Compte courant",savings:"Épargne",crypto:"Cryptoactifs",employee:"Épargne salariale",excluded:"Hors suivi"}[r]);
const sourceName=s=>({manual:"Saisie",csv:"Import",bank:"Banque",crypto:"Crypto.com App"}[s]||"Source inconnue");
let assetImportAccount="";
const cryptoClient=new SpendingCrypto.Client({credentials:()=>db&&!demo&&vault.unlocked?db.cryptoSettings:null,transport});
function renderBudget(){
 const b=C.budgetSummary(db,month),configured=b.total.limit!==null||b.categories.length;
 const row=(name,v)=>'<div class="budget-row"><div class="panel-heading"><strong>'+esc(name)+'</strong><span class="'+(v.remaining<0?"danger":"")+'">'+(v.remaining<0?"Dépassement : ":"Reste : ")+euro(Math.abs(v.remaining))+'</span></div><div class="category-track"><div class="category-bar" style="width:'+Math.min(100,v.limit===0?(v.spent>0?100:0):v.spent/v.limit*100)+'%"></div></div><small>'+euro(v.spent)+' dépensés sur '+euro(v.limit)+'</small></div>';
 return '<section class="panel budget-panel"><div class="panel-heading"><div><h2>Mon budget du mois</h2><small>'+esc(monthLabel(month))+'</small></div><button class="btn small" id="edit-budget">'+(configured?"Modifier":"Définir")+'</button></div>'+
 (configured?(b.total.limit!==null?row("Budget global",b.total):"")+b.categories.map(c=>row(c.category,c)).join(""):'<p class="muted">Fixe un montant pour le mois ou pour certaines catégories. Les virements internes et l’épargne restent à part.</p>')+
 '<p class="field-note">Dépenses nettes comptabilisées, après remboursements. Aucun report automatique des budgets. Les opérations non importées ne sont pas connues.</p></section>';
}
function budgetModal(){
 const b=db.budgets[month]||{total:null,categories:{}};
 modal("Budget · "+monthLabel(month),'<form id="budget-form"><p class="muted">Un champ vide signifie « sans limite ». Zéro fixe un budget de 0 €. Les limites par catégorie et la limite globale sont indépendantes.</p><label for="budget-total">Budget global en EUR</label><input id="budget-total" inputmode="decimal" value="'+(b.total===null?"":b.total/100)+'"><div class="import-grid">'+C.categories.map((c,i)=>'<div><label for="budget-'+i+'">'+esc(c)+'</label><input id="budget-'+i+'" inputmode="decimal" value="'+(b.categories[c]===undefined?"":b.categories[c]/100)+'"></div>').join("")+'</div><div class="actions"><button class="btn primary" type="submit">Enregistrer ce mois</button></div></form>');
 $("#budget-form").onsubmit=e=>{e.preventDefault();perform(async()=>{
  const limit=id=>{const s=$(id).value.trim();if(!s)return null;const n=C.money(s);if(n<0)throw Error("Le budget ne peut pas être négatif.");return n;};
  const item={total:limit("#budget-total"),categories:{}};
  C.categories.forEach((c,i)=>{const n=limit("#budget-"+i);if(n!==null)item.categories[c]=n;});
  db.budgets[month]=item;await persist();closeModal();render();toast("Budget du mois enregistré.");
 });};
}
function sameBank(a,b){const n=C.normalize(a),m=C.normalize(b);return /bourso/.test(n)&&/bourso/.test(m)||n===m;}
function renderWealth(){
 const s=C.wealth(db),card=({account:a,valuation:v,stale})=>'<section class="panel account-card"><div class="bank-name">'+esc(a.bank)+'</div><h2>'+esc(a.name)+'</h2><span class="pill">'+roleName(a.role)+'</span><div class="balance">'+(v?euro(v.value):"À renseigner")+'</div><small>'+(v?sourceName(v.source)+' · '+shortDate(v.date):"Aucune valeur enregistrée")+'</small>'+
 (stale?'<p class="field-note danger">Valeur datant de plus de 30 jours</p>':"")+
 (v?.available!==null&&v?.available!==undefined?'<p class="small-note">Disponible déclaré : '+euro(v.available)+'<br>Non disponible déclaré : '+euro(v.value-v.available)+'</p>':(C.assetRoles.includes(a.role)?'<p class="small-note">Disponibilité non renseignée</p>':""))+
 '<div class="actions"><button class="btn small" data-value="'+esc(a.id)+'">Saisir une valeur</button><button class="btn small" data-asset-history="'+esc(a.id)+'">Historique</button>'+(C.assetRoles.includes(a.role)?'<button class="btn small" data-asset-import="'+esc(a.id)+'">Importer un relevé CSV</button>':"")+(a.role==="crypto"&&sameBank(a.bank,"Crypto.com")?'<button class="btn small" data-crypto-settings>Connexion Crypto.com</button>':"")+'</div></section>';
 const absent=C.institutions.filter(bank=>!db.accounts.some(a=>sameBank(a.bank,bank)&&a.role!=="excluded"));
 return '<div class="view-head"><div><h1>Mes avoirs</h1><p>Comptes, cryptoactifs et épargne salariale, dans une seule vue.</p></div><button class="btn" id="wealth-export">Exporter les valeurs</button></div>'+
 '<section class="panel hero-panel"><span class="hero-eyebrow">Total des valeurs connues · EUR</span><div class="hero-number">'+(s.known?euro(s.total):"—")+'</div><p class="muted">'+s.known+' compte(s) valorisé(s) sur '+s.items.length+' suivi(s). '+s.missing+' sans valeur. '+s.stale+' valeur(s) de plus de 30 jours.</p><p class="field-note">Dernière valeur connue de chaque compte : les dates peuvent différer. Total indicatif des comptes suivis, sans les crédits ni les avoirs non renseignés.</p></section>'+
 '<div class="metrics wealth-metrics"><section class="panel metric"><small>Soldes des comptes courants connus</small><span class="value">'+(s.items.some(i=>i.account.role==="current"&&i.valuation)?euro(s.bank):"—")+'</span></section><section class="panel metric"><small>Épargne et placements connus</small><span class="value">'+(s.items.some(i=>C.assetRoles.includes(i.account.role)&&i.valuation)?euro(s.invested):"—")+'</span></section></div>'+
 '<div class="accounts-grid wealth-grid">'+s.items.map(card).join("")+absent.map(bank=>'<section class="panel account-card empty-account"><div class="bank-name">'+esc(bank)+'</div><h2>À ajouter</h2><p class="small-note">'+(["Esalia","Fédéral Finance"].includes(bank)?"Saisie datée ou import de valorisations CSV. Pas de connexion automatique intégrée.":bank==="Crypto.com"?"Connexion App en lecture seule, ou valorisation saisie / importée.":"Connexion Enable Banking ou import CSV des opérations.")+'</p><button class="btn small" data-add-bank="'+esc(bank)+'">Ajouter ce compte</button></section>').join("")+'</div>'+
 '<p class="small-note wealth-note">Les variations de valeur peuvent venir des versements, retraits et marchés : elles ne constituent pas une mesure de performance. Les montants d’épargne sont ceux du relevé, sans estimation des prélèvements à la sortie.</p>';
}
function valuationModal(id){
 const a=db.accounts.find(a=>a.id===id);if(!a)return;
 const v=C.wealth(db).items.find(i=>i.account.id===id)?.valuation;
 modal("Valorisation · "+a.name,'<form id="valuation-form"><p class="muted">Recopie la valeur totale du compte à la date du relevé. Une valorisation ne crée aucune dépense ni aucun revenu.</p><label for="value-date">Date de la valeur</label><input id="value-date" type="date" required max="'+C.today()+'" value="'+C.today()+'"><label for="value-total">Valeur totale en EUR</label><input id="value-total" inputmode="decimal" required placeholder="Ex. 1 234,56" value=""><label for="value-available">Part disponible en EUR (facultatif)</label><input id="value-available" inputmode="decimal"><p class="field-note">Vide = inconnue. Zéro = aucun montant déclaré disponible.</p><label for="value-note">Précision (facultatif)</label><textarea id="value-note" maxlength="2000" placeholder="Ex. Relevé PEE, valeur avant prélèvements"></textarea>'+
 (v?'<p class="small-note">Dernière valeur : '+euro(v.value)+' au '+shortDate(v.date)+'.</p>':"")+
 '<label class="check-label"><input id="value-replace" type="checkbox">Remplacer la valeur de cette date si elle existe déjà.</label><div class="actions"><button class="btn primary" type="submit">Enregistrer la valeur</button></div></form>');
 $("#valuation-form").onsubmit=e=>{e.preventDefault();perform(async()=>{
  const day=$("#value-date").value;if(db.valuations.some(v=>v.accountId===id&&v.date===day)&&!$("#value-replace").checked)throw Error("Une valeur existe déjà à cette date. Confirme son remplacement.");
  C.recordValuation(db,{accountId:id,date:day,value:C.money($("#value-total").value),available:$("#value-available").value.trim()?C.money($("#value-available").value):null,note:$("#value-note").value.trim()});
  audit("Valorisation enregistrée : "+a.name);await persist();closeModal();render();toast("Valeur datée enregistrée.");
 });};
}
function assetHistory(id){
 const a=db.accounts.find(a=>a.id===id),rows=db.valuations.filter(v=>v.accountId===id).sort((a,b)=>b.date.localeCompare(a.date));
 modal("Historique · "+a.name,'<p class="muted">Une valeur par date, sans extrapolation. Les variations incluent les versements et retraits éventuels.</p>'+
 (rows.length?rows.map(v=>'<details class="value-history"><summary><span>'+shortDate(v.date)+' · '+sourceName(v.source)+'</span><strong>'+euro(v.value)+'</strong></summary><p class="small-note">'+esc(v.note)+(v.available===null?"":" · Disponible déclaré : "+euro(v.available))+'</p>'+v.details.map(p=>'<div class="recent-row"><span>'+esc(p.label)+'</span><span>'+euro(p.value)+'</span></div>').join("")+'<button class="btn small danger" data-delete-value="'+esc(v.id)+'">Supprimer cette valeur</button></details>').join(""):'<p class="muted">Aucun relevé daté enregistré.</p>'));
 document.querySelectorAll("[data-delete-value]").forEach(el=>el.onclick=()=>{
  const vid=el.dataset.deleteValue;
  modal("Supprimer une valorisation",'<p>Cette suppression concerne uniquement la valeur datée sélectionnée.</p><button id="delete-value-confirm" class="btn danger">Confirmer la suppression</button>');
  $("#delete-value-confirm").onclick=()=>perform(async()=>{db.valuations=db.valuations.filter(v=>v.id!==vid);await persist();render();assetHistory(id);});
 });
}
function assetImportModal(parsed,filename){
 const fields=[["date","Date du relevé"],["label","Support / placement"],["value","Valeur en EUR"],["available","Disponible en EUR (facultatif)"],["currency","Devise (facultatif)"]];
 const match={date:/date/,label:/support|placement|libelle|label/,value:/valeur|valuation|montant|value/,available:/disponible|available/,currency:/devise|currency/};
 modal("Importer des valorisations",'<p class="muted">'+esc(filename)+' · '+parsed.rows.length+' ligne(s). Le fichier doit décrire les supports complets du compte pour chaque date, sans ligne de total. Un historique de transactions Crypto.com ne constitue pas un relevé de valorisation.</p><div class="import-grid">'+fields.map(([k,label])=>'<div><label for="asset-map-'+k+'">'+label+'</label><select id="asset-map-'+k+'"><option value="-1">Non fourni</option>'+parsed.headers.map((h,i)=>'<option value="'+i+'"'+(parsed.headers.findIndex(h=>match[k].test(C.normalize(h)))===i?" selected":"")+'>'+esc(h)+'</option>').join("")+'</select></div>').join("")+'</div><label class="check-label"><input type="checkbox" id="asset-complete">Les valeurs sont en EUR et chaque date couvre la totalité de ce compte.</label><button class="btn primary" id="asset-preview">Vérifier les montants</button>');
 $("#asset-preview").onclick=()=>perform(async()=>{
  if(!$("#asset-complete").checked)throw Error("Confirme la devise et le périmètre du relevé.");
  const map=Object.fromEntries(fields.map(([k])=>[k,Number($("#asset-map-"+k).value)])),rows=C.valuationCSV(db,assetImportAccount,parsed,map);
  const replacements=rows.filter(v=>db.valuations.some(old=>old.accountId===v.accountId&&old.date===v.date)).length;
  modal("Confirmer les valorisations",'<p class="muted">'+rows.length+' date(s) · '+replacements+' valeur(s) existante(s) seront remplacées. Les autres dates seront conservées.</p>'+rows.map(v=>'<div class="recent-row"><span>'+shortDate(v.date)+' · '+v.details.length+' support(s)</span><strong>'+euro(v.value)+'</strong></div>').join("")+'<div class="actions"><button class="btn primary" id="asset-apply">Enregistrer ces valeurs'+(replacements?" et remplacer les dates existantes":"")+'</button></div>');
  $("#asset-apply").onclick=()=>perform(async()=>{
   const copy=JSON.parse(JSON.stringify(db));for(const row of rows)C.recordValuation(copy,row);C.validate(copy);
   db=copy;await persist();closeModal();render();toast("Valorisations importées.");
  });
 });
}
async function exportWealth(){
 const header=["Compte","Établissement","Date","Valeur EUR","Disponible EUR","Source","Support"];
 const rows=db.valuations.flatMap(v=>{const a=db.accounts.find(a=>a.id===v.accountId);return (v.details.length?v.details:[{label:"Total du compte",value:v.value,available:v.available}]).map(p=>[a.name,a.bank,v.date,(p.value/100).toFixed(2),p.available===null?"":(p.available/100).toFixed(2),sourceName(v.source),p.label]);});
 await saveFile("mes-avoirs-"+C.today()+".csv","text/csv","\uFEFF"+[header,...rows].map(row=>row.map(csvCell).join(";")).join("\r\n"));toast("Export des valeurs préparé (CSV non chiffré).");
}
function cryptoModal(){
 const c=db.cryptoSettings,accounts=db.accounts.filter(a=>a.role==="crypto"&&sameBank(a.bank,"Crypto.com"));
 modal("Connexion Crypto.com App",'<p class="muted">La connexion récupère les valorisations publiées par Crypto.com App. Elle ne récupère pas les dépenses de la carte et n’utilise pas les clés Crypto.com Exchange.</p><ol class="howto"><li>Dans Crypto.com App, ouvre <strong>Plus → Agent Key</strong>.</li><li>Désactive <strong>Execute trades</strong>. L’accès aux soldes reste actif.</li><li>Renseigne les deux clés ici. Choisis EUR comme devise d’affichage dans Crypto.com.</li></ol><label for="crypto-account">Compte destinataire</label><select id="crypto-account">'+accounts.map(a=>'<option value="'+esc(a.id)+'"'+(c.accountId===a.id?" selected":"")+'>'+esc(a.name)+'</option>').join("")+'<option value="new">Créer un portefeuille Crypto.com App</option></select><label for="crypto-key">Clé API</label><input id="crypto-key" type="password" autocomplete="new-password" placeholder="'+(c.key?"Clé enregistrée · vide pour conserver":"Clé API App")+'"><label for="crypto-secret">Clé secrète</label><input id="crypto-secret" type="password" autocomplete="new-password" placeholder="'+(c.secret?"Secret enregistré · vide pour conserver":"Clé secrète App")+'"><p class="field-note">Clés chiffrées sur cet appareil, exclues des sauvegardes. Aucun achat, vente, transfert ou retrait n’est autorisé par Mes dépenses.</p><p class="small-note">Le résultat dépend de l’accès disponible sur ton compte et du périmètre renvoyé par Crypto.com. Une erreur conserve les dernières valeurs enregistrées.</p><div class="actions"><button id="crypto-save" class="btn primary"'+(demo||!transportAvailable()?" disabled":"")+'>Enregistrer et actualiser</button><button id="crypto-remove" class="btn">Retirer les clés locales</button></div>'+
 (!transportAvailable()?'<p class="field-note">Connexion disponible dans l’APK ou avec le lanceur ordinateur.</p>':""));
 $("#crypto-save").onclick=()=>perform(async()=>{
  const key=$("#crypto-key").value.trim(),secret=$("#crypto-secret").value.trim();
  if(!!key!==!!secret)throw Error("Renseigne les deux nouvelles clés ensemble, ou laisse les deux champs vides pour les conserver.");
  let id=$("#crypto-account").value;
  if(id==="new"){const a={id:crypto.randomUUID(),name:"Portefeuille Crypto.com App",bank:"Crypto.com",role:"crypto",sourceMode:"csv",iban:"",currency:"EUR"};db.accounts.push(a);id=a.id;}
  db.cryptoSettings={key:key||c.key,secret:secret||c.secret,accountId:id};
  if(!db.cryptoSettings.key||!db.cryptoSettings.secret)throw Error("Renseigne les deux clés Crypto.com App.");
  await persist();await syncCrypto();closeModal();render();toast("Valorisation Crypto.com actualisée.");
 });
 $("#crypto-remove").onclick=()=>perform(async()=>{db.cryptoSettings={key:"",secret:"",accountId:""};await persist();closeModal();render();toast("Clés locales retirées. Les valorisations sont conservées.");});
}
async function syncCrypto(){
 const id=db.cryptoSettings.accountId,a=db.accounts.find(a=>a.id===id&&a.role==="crypto"&&sameBank(a.bank,"Crypto.com"));
 if(!a)throw Error("Choisis le portefeuille Crypto.com à actualiser.");
 const v=await cryptoClient.snapshot();
 C.recordValuation(db,{accountId:id,date:C.today(),...v,source:"crypto",note:"Produits valorisés par Crypto.com App. Périmètre fourni par l’API, sans addition séparée des sous-portefeuilles."});
 audit("Valorisation Crypto.com App actualisée.");await persist();render();
}
async function syncAll(){
 if(demo)throw Error("Les connexions sont désactivées en démonstration.");
 const accounts=db.accounts.filter(a=>a.role==="current"&&a.apiUid),errors=[];let success=0;
 if(!accounts.length&&!db.cryptoSettings.key)throw Error("Configure une connexion dans Comptes ou dans Mes avoirs.");
 for(const a of accounts){try{await syncAccount(a.id);success++;}catch(e){if(!db||!vault.unlocked)throw e;db=JSON.parse(committedDB);errors.push(a.name+" : "+e.message);}}
 if(db.cryptoSettings.key){try{await syncCrypto();success++;}catch(e){if(!db||!vault.unlocked)throw e;db=JSON.parse(committedDB);errors.push("Crypto.com : "+e.message);}}
 closeModal();render();
 $("#status").innerHTML='<div class="notice '+(errors.length?"":"neutral")+'">'+success+' connexion(s) actualisée(s).'+(errors.length?'<br>'+errors.map(esc).join("<br>"):"")+'</div>';
}
function bindWealth(){
 if($("#edit-budget"))$("#edit-budget").onclick=budgetModal;
 document.querySelectorAll("[data-value]").forEach(el=>el.onclick=()=>valuationModal(el.dataset.value));
 document.querySelectorAll("[data-asset-history]").forEach(el=>el.onclick=()=>assetHistory(el.dataset.assetHistory));
 document.querySelectorAll("[data-add-bank]").forEach(el=>el.onclick=()=>accountModal(null,el.dataset.addBank));
 document.querySelectorAll("[data-crypto-settings]").forEach(el=>el.onclick=cryptoModal);
 document.querySelectorAll("[data-asset-import]").forEach(el=>el.onclick=()=>{assetImportAccount=el.dataset.assetImport;$("#asset-file").value="";$("#asset-file").click();});
 if($("#wealth-export"))$("#wealth-export").onclick=()=>perform(exportWealth);
}
