/* Local extraction only. Email HTML stays inside an inert template. */
(function(root,factory){if(typeof module==="object"&&module.exports)module.exports=factory();else root.MatchworkGmail=factory()})(typeof globalThis!=="undefined"?globalThis:this,function(){
 "use strict";
 const SENDER="jobalerts-noreply@linkedin.com",VERSION=1;
 const clean=s=>String(s||"").replace(/[\u034f\u200b-\u200f\ufeff]/g,"").replace(/\u00a0/g," ").trim();
 function jobId(value){try{const u=new URL(clean(value));if(u.protocol!=="https:"||u.username||u.password||u.port||!(u.hostname==="linkedin.com"||u.hostname.endsWith(".linkedin.com")))return "";const m=u.pathname.match(/^\/(?:comm\/)?jobs\/view\/(?:[^/]*-)?(\d{6,20})\/?$/);return m?m[1]:""}catch{return ""}}
 function canonical(value){const id=jobId(value);return id?"https://www.linkedin.com/jobs/view/"+id+"/":""}
 function header(message,name){const h=(message.payload?.headers||[]).find(h=>String(h.name).toLowerCase()===name.toLowerCase());return clean(h?.value)}
 function sender(message){const from=header(message,"from"),m=from.match(/<([^<>]+)>/);return (m?m[1]:from).trim().toLowerCase()}
 function decode(data){if(typeof data!=="string"||!data)return "";const binary=atob(data.replace(/-/g,"+").replace(/_/g,"/"));return new TextDecoder("utf-8",{fatal:false}).decode(Uint8Array.from(binary,c=>c.charCodeAt(0)))}
 function bodies(message){const out={plain:[],html:[]};function walk(p){if(!p||p.filename)return;const type=String(p.mimeType||p.mime_type||"").toLowerCase();if(type==="text/plain"||type==="text/html"){const value=typeof p.body?.content==="string"?p.body.content:decode(p.body?.data||p.body?.base64_url_content);if(value)out[type==="text/plain"?"plain":"html"].push(value.slice(0,1000000))}for(const child of p.parts||[])walk(child)}walk(message.payload);return out}
 const noise=/^(?:votre alerte (?:emploi|job)|offres? d[’']emploi (?:semblables|similaires)|voir l[’']offre|view job|cette entreprise recrute|recrutement actif|postuler|candidature simplifi|easy apply|il y a \d|\d+ (?:jour|heure|minute|week|day)|promu|sponsoris|nouveau$|new$|activer|linkedin$)/i;
 const salary=/\b(?:\d[\d .,]*\s*(?:k\s*)?[€$£]|\d[\d .,]*\s*(?:EUR|USD))\b|\d[\d .,]*\s*(?:k\s*)?[€$£]/i;
 function fields(text){const lines=String(text||"").split(/\r?\n/).map(clean).filter(Boolean).filter(s=>!noise.test(s)&&!/^https?:\/\//i.test(s)&&!salary.test(s));return {titre:lines[0]||"",employeur:lines[1]||"",lieu:lines[2]||""}}
 function textOf(node){let out="";function walk(n){if(n.nodeType===3){out+=n.nodeValue;return}if(n.nodeType!==1&&n.nodeType!==11)return;const block=/^(BR|DIV|P|TR|TD|H[1-6]|LI|TABLE|SECTION)$/.test(n.nodeName);if(block)out+="\n";for(const c of n.childNodes)walk(c);if(block)out+="\n"}walk(node);return out}
 function parse(message,doc){
  if(sender(message)!==SENDER)return {offers:[],recognized:false,ignoredSender:true};
  const body=bodies(message),found=new Map(),ts=Number(message.internalDate||message.internal_date),receivedAt=Number.isFinite(ts)&&ts>0?new Date(ts).toISOString():"";
  function add(id,f,text){if(!id||!f.titre||!f.employeur||f.titre.length>600||f.employeur.length>400)return;const o={titre:f.titre,employeur:f.employeur,lieu:f.lieu||"",url:"https://www.linkedin.com/jobs/view/"+id+"/",date:"",source:"LinkedIn · Gmail",description:clean(text).replace(/https?:\/\/[^\s<>]+/g,u=>canonical(u)||"").slice(0,5000),salaire:"",linkedinId:id,emailPartial:true,emailSource:{messageId:String(message.id||"").slice(0,200),sender:SENDER,receivedAt}};const previous=found.get(id);if(!previous)found.set(id,o)}
  for(const plain of body.plain){for(const block of plain.split(/\n\s*[-–—]{5,}\s*\n/)){
   const links=[...block.matchAll(/https:\/\/[^\s<>"’]+/g)].map(m=>({value:m[0],at:m.index})).filter(x=>jobId(x.value));
   if(links.length!==1)continue;
   const link=links[0],before=block.slice(0,link.at).replace(/(?:Voir l[’']offre d[’']emploi|View job)\s*[:：]?\s*$/i,"");const f=fields(before);add(jobId(link.value),f,before);
  }}
  if(doc)for(const html of body.html){
   const template=doc.createElement("template");template.innerHTML=html;
   template.content.querySelectorAll("script,style,iframe,object,embed,form,link,meta,img,video,audio,source,svg").forEach(n=>n.remove());
   for(const a of template.content.querySelectorAll("a[href]")){
    const id=jobId(a.getAttribute("href"));if(!id)continue;let node=a,best=null;
    for(let depth=0;node&&depth<14;depth++,node=node.parentNode){
     if(node.nodeType!==1)continue;
     const ids=new Set([...node.querySelectorAll("a[href]")].map(n=>jobId(n.getAttribute("href"))).filter(Boolean));if(jobId(node.getAttribute?.("href")))ids.add(id);if(ids.size>1)break;
     const text=textOf(node),f=fields(text);if(f.titre&&f.employeur&&f.lieu){best={f,text};break}
    }
    if(best)add(id,best.f,best.text);
   }
  }
  return {offers:[...found.values()],recognized:found.size>0,ignoredSender:false};
 }
 function query(days,now=Date.now()){if(![7,30,90,180,365].includes(Number(days)))throw new Error("Période Gmail invalide.");const until=Math.floor(now/1000)+1,since=until-Number(days)*86400;return `from:${SENDER} after:${since} before:${until} -in:spam -in:trash`}
 function config(value){const v=value&&typeof value==="object"&&!Array.isArray(value)?value:{};return {email:typeof v.email==="string"?v.email.trim().toLowerCase():"",enabled:v.enabled===true,days:[7,30,90,180,365].includes(+v.days)?+v.days:30,frequency:["each","daily","manual"].includes(v.frequency)?v.frequency:"each",lastComplete:typeof v.lastComplete==="string"?v.lastComplete:"",lastRun:v.lastRun&&typeof v.lastRun==="object"?v.lastRun:null}}
 return {SENDER,VERSION,jobId,canonical,header,sender,bodies,parse,query,config};
});
