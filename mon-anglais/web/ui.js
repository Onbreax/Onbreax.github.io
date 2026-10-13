"use strict";
// Interface : vues, stockage local, appels OpenRouter, micro et synthèse vocale.

const VERSION = "1.0.0", STORE = "monAnglais.v1";
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"}[c]));
const on = (sel, ev, fn, root = document) => $$(sel, root).forEach(el => el.addEventListener(ev, fn));
const fmtUsd = n => (Math.round((n || 0) * 100) / 100).toLocaleString("fr-FR", {minimumFractionDigits:2, maximumFractionDigits:2}) + " $";
const fmtDate = t => new Date(t).toLocaleDateString("fr-FR", {day:"numeric", month:"long", year:"numeric"});
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const wordsIn = s => normWords(s).length;

function defaults(){
  return {v:1, settings:{mode:"openrouter", key:"", model:"google/gemini-3.8-flash", budget:3, accent:"en-GB", voice:"", autoSpeak:true, minutes:60, newPerDay:10, theme:"auto"},
    profile:{skills:{}, history:[]}, cards:{}, custom:[], grammar:{}, seen:{}, genGrammar:{}, errors:[], sessions:{}, spend:{}, calls:0,
    listening:[], writings:[], convos:[], drafts:{}, assessment:null, lastResult:null};
}
function loadState(){
  const d = defaults();
  try {
    const raw = localStorage.getItem(STORE);
    if (raw) { const o = JSON.parse(raw); if (o && o.v === 1) return {...d, ...o, settings:{...d.settings, ...o.settings}, profile:{...d.profile, ...o.profile}}; }
  } catch {}
  return d;
}
let S = loadState();
function save(){
  try { localStorage.setItem(STORE, JSON.stringify(S)); }
  catch { toast("Enregistrement impossible : le stockage du navigateur est plein ou bloqué. Exporte tes données."); }
}
let toastTimer;
function toast(msg){
  const t = $("#toast"); t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 3600);
}

// État temporaire de la vue courante (non enregistré)
let T = {};
function cleanup(){
  try { speechSynthesis.cancel(); } catch {}
  if (T.mic) T.mic.stop();
  for (const id of T.timers || []) clearInterval(id);
  T = {timers:[]};
}
function every(ms, fn){ const id = setInterval(fn, ms); T.timers.push(id); return id; }

function markDone(key){
  if (!key) return;
  const d = dayKey(), sess = S.sessions[d] || (S.sessions[d] = {done:{}, min:{}});
  if (!sess.min) sess.min = {};
  if (!sess.done[key]) { sess.done[key] = true; sess.min[key] = planFor(S).minutes[key] || 0; save(); toast("Bloc du jour terminé."); }
}

// --- Voix ---
function voices(){ try { return speechSynthesis.getVoices().filter(v => /^en[-_]/i.test(v.lang)); } catch { return []; } }
function pickVoice(){
  const vs = voices(), acc = S.settings.accent;
  return vs.find(v => v.voiceURI === S.settings.voice) ||
    vs.find(v => v.lang.replace("_", "-") === acc && /google|natural|premium|enhanced|neural/i.test(v.name)) ||
    vs.find(v => v.lang.replace("_", "-") === acc) || vs[0] || null;
}
function speak(text, rate = 1){
  return new Promise(resolve => {
    if (!("speechSynthesis" in window)) { toast("La lecture vocale n'est pas disponible dans ce navigateur."); return resolve(); }
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text), v = pickVoice();
    u.lang = S.settings.accent; if (v) u.voice = v; u.rate = rate;
    u.onend = u.onerror = () => resolve();
    speechSynthesis.speak(u);
  });
}
// --- Micro (reconnaissance vocale du navigateur) ---
const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
function startMic(onText){
  const rec = new Recognition(), finals = [];
  let keep = true;
  rec.lang = S.settings.accent; rec.continuous = true; rec.interimResults = true;
  rec.onresult = e => {
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const t = e.results[i][0].transcript.trim();
      if (!e.results[i].isFinal) { interim += " " + t; continue; }
      // Chrome Android renvoie parfois le même passage enrichi : on remplace au lieu d'ajouter
      const last = finals[finals.length - 1];
      if (last && t.toLowerCase().startsWith(last.toLowerCase())) finals[finals.length - 1] = t; else if (t) finals.push(t);
    }
    onText(finals.join(" "), interim.trim());
  };
  rec.onerror = e => { if (/not-allowed|service-not-allowed/.test(e.error)) { keep = false; toast("Micro refusé : autorise-le dans les réglages du navigateur."); } };
  rec.onend = () => { if (keep) try { rec.start(); } catch {} };
  try { rec.start(); } catch { toast("Impossible de démarrer le micro."); }
  return {stop(){ keep = false; try { rec.stop(); } catch {} }, text:() => finals.join(" ")};
}

// --- OpenRouter ---
async function callAI(messages, {maxTokens = 2500, temperature = 0.4} = {}){
  const st = S.settings, m = monthKey();
  if (!st.key) throw new Error("Aucune clé OpenRouter : ajoute-la dans Réglages ou passe en mode abonnement.");
  if ((S.spend[m] || 0) >= st.budget) throw new Error("Budget du mois atteint (" + fmtUsd(S.spend[m]) + " sur " + fmtUsd(st.budget) + "). Augmente-le dans Réglages ou utilise le mode abonnement.");
  const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), 120000);
  let r, j;
  try {
    r = await fetch("https://openrouter.ai/api/v1/chat/completions", {method:"POST", signal:ctrl.signal,
      headers:{"Content-Type":"application/json", "Authorization":"Bearer " + st.key, "X-Title":"Mon anglais"},
      body:JSON.stringify({model:st.model, messages, max_tokens:maxTokens, temperature, usage:{include:true}, reasoning:{effort:"low", exclude:true}})});
    j = await r.json().catch(() => ({}));
  } catch (e) {
    throw new Error(e.name === "AbortError" ? "Pas de réponse après 2 minutes. Réessaie." : "Connexion à OpenRouter impossible. Vérifie ta connexion Internet.");
  } finally { clearTimeout(timer); }
  if (!r.ok || j.error) {
    const code = (j.error && j.error.code) || r.status;
    throw new Error({401:"Clé OpenRouter refusée. Vérifie-la dans Réglages.", 402:"Crédits OpenRouter insuffisants. Recharge ton compte sur openrouter.ai.", 429:"Ce modèle est saturé pour l'instant. Réessaie dans un moment ou choisis-en un autre."}[code] ||
      "Erreur OpenRouter : " + ((j.error && j.error.message) || r.status));
  }
  const u = j.usage || {};
  S.spend[m] = (S.spend[m] || 0) + (typeof u.cost === "number" ? u.cost : 0); S.calls = (S.calls || 0) + 1; save(); renderChips();
  const c = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
  const text = typeof c === "string" ? c : Array.isArray(c) ? c.map(x => typeof x === "string" ? x : (x && x.text) || "").join("") : "";
  if (!text.trim()) throw new Error("Le modèle a renvoyé une réponse vide. Réessaie ou choisis un autre modèle.");
  return text;
}
const useApi = () => S.settings.mode === "openrouter" && !!S.settings.key;

// Exécute une tâche d'IA : via OpenRouter, ou par copier-coller en mode abonnement
function aiTask(box, messages, onText, opts = {}){
  if (!useApi() || opts.manual) return subscriptionBox(box, messagesToText(messages), onText);
  box.innerHTML = '<div class="panel tight"><span class="muted">' + esc(opts.label || "Analyse en cours… (20 à 60 secondes)") + "</span></div>";
  callAI(messages, opts).then(onText).catch(e => {
    box.innerHTML = '<div class="notice">' + esc(e.message) + '</div><div class="row"><button class="btn primary" data-retry>Réessayer</button><button class="btn" data-manual>Passer par ChatGPT ou Claude cette fois</button></div>';
    on("[data-retry]", "click", () => aiTask(box, messages, onText, opts), box);
    on("[data-manual]", "click", () => aiTask(box, messages, onText, {...opts, manual:true}), box);
  });
}
function copyText(text){
  if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text).then(() => toast("Consigne copiée."), () => fallbackCopy(text));
  fallbackCopy(text);
}
function fallbackCopy(text){
  const ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta); ta.select();
  try { document.execCommand("copy"); toast("Consigne copiée."); } catch { toast("Copie impossible : sélectionne le texte manuellement."); }
  ta.remove();
}
function subscriptionBox(box, prompt, onText, intro){
  box.innerHTML = '<div class="panel">' +
    (S.settings.mode === "openrouter" && !S.settings.key ? '<div class="notice info">Pas de clé OpenRouter configurée : on passe par ton abonnement ChatGPT ou Claude.</div>' : "") +
    "<h3>Avec ChatGPT ou Claude</h3><p class=\"muted\">" + (intro || "1. Copie la consigne. 2. Colle-la dans une nouvelle conversation ChatGPT ou Claude. 3. Copie toute la réponse et colle-la ci-dessous.") + "</p>" +
    '<textarea class="prompt-box" readonly aria-label="Consigne à copier">' + esc(prompt) + "</textarea>" +
    '<div class="row" style="margin:10px 0 4px"><button class="btn primary" data-copy>Copier la consigne</button><a class="btn" href="https://chatgpt.com/" target="_blank" rel="noopener">Ouvrir ChatGPT ↗</a><a class="btn" href="https://claude.ai/new" target="_blank" rel="noopener">Ouvrir Claude ↗</a></div>' +
    '<label for="paste-answer">Réponse de l\'IA</label><textarea id="paste-answer" placeholder="Colle ici la réponse complète (elle contient un bloc entre accolades { … })"></textarea>' +
    '<div class="row" style="margin-top:10px"><button class="btn primary" data-parse>Analyser la réponse</button></div><p class="muted" data-err role="alert"></p></div>';
  on("[data-copy]", "click", () => copyText(prompt), box);
  on("[data-parse]", "click", () => {
    const v = $("#paste-answer", box).value;
    try { onText(v); } catch (e) { $("[data-err]", box).textContent = "Réponse illisible : " + e.message + " Vérifie que tu as bien copié toute la réponse."; }
  }, box);
}

// --- Retours de correction ---
function recordFeedback(fb, src){
  const at = Date.now();
  for (const e of fb.errors) S.errors.push({...e, at, src});
  if (S.errors.length > 400) S.errors = S.errors.slice(-400);
}
function addWord(w){
  const en = w.en.trim(), id = "c:" + en.toLowerCase();
  if (!en || !w.fr.trim()) return false;
  if (allWords(S.custom).some(x => x.en.toLowerCase() === en.toLowerCase())) return false;
  S.custom.push({id, en, fr:w.fr.trim(), ex:(w.ex || "").trim(), lvl:4}); save(); return true;
}
function feedbackHTML(fb, title){
  const crit = Object.entries(fb.criteria);
  const names = {task:"Consigne", coherence:"Cohérence", range:"Richesse", accuracy:"Correction", fluency:"Aisance"};
  return '<div class="panel hero"><div class="eyebrow">' + esc(title || "Résultat") + '</div><div class="row"><div class="big">' + esc(levelLabel(fb.level)) + '</div><p class="grow" style="margin:0">' + esc(fb.summary) + "</p></div>" +
    (crit.length ? '<div class="crit">' + crit.map(([k, v]) => "<div><b>" + esc(String(Math.round(v * 10) / 10)) + '<small>/5</small></b><span class="stat-label">' + esc(names[k] || k) + "</span></div>").join("") + "</div>" : "") +
    (fb.strengths.length ? "<h3>Points forts</h3><ul>" + fb.strengths.map(s => "<li>" + esc(s) + "</li>").join("") + "</ul>" : "") +
    (fb.priorities.length ? "<h3>À travailler en priorité</h3><ul>" + fb.priorities.map(s => "<li>" + esc(s) + "</li>").join("") + "</ul>" : "") + "</div>" +
    (fb.errors.length ? '<div class="panel"><h2>Corrections (' + fb.errors.length + ")</h2>" + fb.errors.map(e =>
      '<div class="err"><span class="tag">' + esc(ERROR_CATS[e.cat][0]) + '</span><span class="o">' + esc(e.o) + '</span> → <span class="c">' + esc(e.c) + '</span><div class="e">' + esc(e.e) + "</div></div>").join("") + "</div>" : "") +
    (fb.improved ? '<details class="panel"><summary><b>Version améliorée</b></summary><p style="margin-top:10px;white-space:pre-wrap">' + esc(fb.improved) + "</p></details>" : "") +
    (fb.vocabulary.length ? '<div class="panel"><h2>Vocabulaire utile</h2><ul class="mini">' + fb.vocabulary.map((v, i) =>
      "<li><span><b>" + esc(v.en) + "</b> — " + esc(v.fr) + (v.ex ? '<br><small>' + esc(v.ex) + "</small>" : "") + '</span><button class="btn small" data-addword="' + i + '">Ajouter à mes cartes</button></li>').join("") + "</ul></div>" : "");
}
function bindFeedback(box, fb){
  on("[data-addword]", "click", e => {
    const ok = addWord(fb.vocabulary[+e.currentTarget.dataset.addword]);
    e.currentTarget.disabled = true; e.currentTarget.textContent = ok ? "Ajouté" : "Déjà dans tes cartes";
  }, box);
}
function parseFeedback(text){
  const fb = normFeedback(parseJSONLoose(text));
  if (fb.level === null) throw new Error("Le niveau est absent de la réponse.");
  return fb;
}

// --- Navigation ---
const VIEWS = {today:viewToday, practice:viewPractice, bilan:viewBilan, vocab:viewVocab, grammar:viewGrammar, listen:viewListen, write:viewWrite, speak:viewSpeak, progress:viewProgress, settings:viewSettings};
const NAV_OF = {vocab:"practice", grammar:"practice", listen:"practice", write:"practice", speak:"practice"};
function route(){
  cleanup();
  const [raw, query] = location.hash.slice(1).split("?"), name = VIEWS[raw] ? raw : "today", params = new URLSearchParams(query || "");
  T.plan = params.get("plan");
  $$("[data-nav]").forEach(a => a.classList.toggle("active", a.dataset.nav === (NAV_OF[name] || name)));
  renderChips();
  VIEWS[name](params);
  $("#view").focus({preventScroll:true}); window.scrollTo(0, 0);
}
function render(html){ $("#view").innerHTML = html; }
function renderChips(){
  const ov = overallLevel(S.profile.skills), st = streak(S.sessions);
  $("#chips").innerHTML = (ov ? '<span class="chip">Niveau ' + esc(levelLabel(ov)) + "</span>" : "") +
    '<span class="chip">Série : ' + st + " j</span>" +
    (S.settings.mode === "openrouter" ? '<span class="chip opt-hide' + ((S.spend[monthKey()] || 0) >= S.settings.budget * 0.8 ? " warn" : "") + '">IA : ' + fmtUsd(S.spend[monthKey()]) + " / " + fmtUsd(S.settings.budget) + "</span>" : "");
  $("#side-foot").innerHTML = "Mon anglais " + VERSION + "<br>Données enregistrées sur cet appareil" + (S.settings.mode === "openrouter" ? "<br>IA : OpenRouter" : "<br>IA : ton abonnement");
}
function applyTheme(){ if (S.settings.theme === "auto") delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = S.settings.theme; }
const backLink = (href = "#practice", label = "Pratiquer") => '<a class="btn ghost small" href="' + href + '" style="margin:-6px 0 8px -10px">‹ ' + label + "</a>";

// --- Aujourd'hui ---
function viewToday(){
  const has = Object.keys(S.profile.skills).length, plan = planFor(S), sess = S.sessions[dayKey()] || {done:{}};
  const q = vocabQueue(S), sc = SCENARIOS.find(s => s.id === plan.scenario);
  const blocks = [
    ["vocab", "Vocabulaire : répétition espacée", q.due.length + " carte(s) à revoir · " + q.fresh.length + " nouvelle(s)", "#vocab?plan=vocab"],
    ["grammar", "Grammaire ciblée", GRAMMAR_TOPICS[plan.topic] + " et révisions", "#grammar?plan=grammar&mix=1"],
    ["listening", "Écoute : dictées", "8 phrases lues par une voix anglaise", "#listen?plan=listening"],
    ["writing", "Écrit corrigé", plan.prompt, "#write?plan=writing"],
    ["speaking", "Oral : jeu de rôle", sc.title, "#speak?plan=speaking&s=" + sc.id]
  ];
  const total = Object.values(plan.minutes).reduce((a, b) => a + b, 0);
  const doneMin = blocks.reduce((a, [k]) => a + (sess.done[k] ? plan.minutes[k] : 0), 0);
  const last = S.profile.history[S.profile.history.length - 1], errs = topErrors(S.errors);
  render(
    "<h1>Aujourd'hui</h1><p class=\"lead\">" + esc(new Date().toLocaleDateString("fr-FR", {weekday:"long", day:"numeric", month:"long"})) + " · " + total + " minutes</p>" +
    (!has ? '<div class="panel hero"><h2>Commence par ton bilan de départ</h2><p>Environ 1 h 15 en quatre étapes (test EF SET, grammaire et vocabulaire, écrit, oral) pour mesurer ton vrai niveau dans chaque compétence. Ton plan s\'adaptera ensuite à tes points faibles.</p><a class="btn primary" href="#bilan">Faire mon bilan</a></div>' :
      last && Date.now() - last.at > 30 * DAY ? '<div class="notice">Ton dernier bilan date du ' + esc(fmtDate(last.at)) + '. Refais-le pour mesurer tes progrès. <a href="#bilan">Refaire le bilan</a></div>' : "") +
    '<div class="panel"><div class="row" style="margin-bottom:8px"><h2 class="grow" style="margin:0">Plan du jour' + (has ? "" : " (standard B1-B2 en attendant ton bilan)") + '</h2><span class="muted">' + doneMin + " / " + total + ' min</span></div><div class="bar ok"><i style="width:' + Math.round(100 * doneMin / total) + '%"></i></div>' +
    blocks.map(([k, title, detail, href]) => '<div class="block' + (sess.done[k] ? " done" : "") + '"><button class="check' + (sess.done[k] ? " on" : "") + '" data-toggle="' + k + '" aria-label="Marquer « ' + esc(title) + ' » comme ' + (sess.done[k] ? "non fait" : "fait") + '">✓</button>' +
      '<div><div class="title">' + esc(title) + ' <span class="muted" style="font-weight:500">· ' + plan.minutes[k] + ' min</span></div><div class="detail">' + esc(detail) + "</div></div>" +
      '<a class="btn small' + (sess.done[k] ? "" : " primary") + '" href="' + href + '">' + (sess.done[k] ? "Refaire" : "Commencer") + "</a></div>").join("") + "</div>" +
    '<div class="grid2"><div class="panel"><div class="eyebrow">Point de grammaire du jour</div><h3>' + esc(GRAMMAR_TOPICS[plan.topic]) + '</h3><p class="muted">Choisi parmi tes thèmes les plus faibles ou pas encore travaillés.</p></div>' +
    '<div class="panel"><div class="eyebrow">Erreur la plus fréquente (30 jours)</div>' + (errs.length ? "<h3>" + esc(ERROR_CATS[errs[0][0]][0]) + " · " + errs[0][1] + ' fois</h3><p class="muted">' + esc(ERROR_CATS[errs[0][0]][1]) + "</p>" : '<p class="muted">Tes erreurs à l\'écrit et à l\'oral apparaîtront ici après tes premières corrections.</p>') + "</div></div>"
  );
  on("[data-toggle]", "click", e => {
    const k = e.currentTarget.dataset.toggle, d = dayKey(), s = S.sessions[d] || (S.sessions[d] = {done:{}, min:{}});
    if (!s.min) s.min = {};
    s.done[k] = !s.done[k]; s.min[k] = s.done[k] ? plan.minutes[k] : 0; save(); route();
  });
}

// --- Pratiquer ---
function viewPractice(){
  const q = vocabQueue(S), g = grammarStats(S).reduce((a, s) => ({n:a.n + s.n, ok:a.ok + s.ok}), {n:0, ok:0});
  const lastL = S.listening.slice(-10), avgL = lastL.length ? Math.round(100 * lastL.reduce((a, x) => a + x.score, 0) / lastL.length) : null;
  render("<h1>Pratiquer</h1><p class=\"lead\">Chaque module est utilisable à tout moment, en plus du plan du jour.</p><div class=\"hub\">" +
    '<a href="#vocab"><h2>Vocabulaire</h2><p class="muted">' + q.due.length + " à revoir · " + Object.keys(S.cards).length + " mots étudiés · répétition espacée FSRS</p></a>" +
    '<a href="#grammar"><h2>Grammaire</h2><p class="muted">' + (g.n ? Math.round(100 * g.ok / g.n) + " % de réussite sur " + g.n + " questions" : "10 thèmes clés du B1 au C1") + "</p></a>" +
    '<a href="#listen"><h2>Écoute</h2><p class="muted">Dictées lues par une voix anglaise' + (avgL !== null ? " · moyenne " + avgL + " %" : "") + "</p></a>" +
    '<a href="#write"><h2>Écrit</h2><p class="muted">Rédaction corrigée par l\'IA, erreurs expliquées en français</p></a>' +
    '<a href="#speak"><h2>Oral</h2><p class="muted">Jeux de rôle au micro avec un partenaire IA</p></a>' +
    '<a href="#bilan"><h2>Bilan de niveau</h2><p class="muted">Test complet des 4 compétences, à refaire chaque mois</p></a></div>');
}

// --- Bilan ---
const STEP_NAMES = ["EF SET", "Grammaire et vocabulaire", "Écrit", "Oral", "Résultats"];
function stepsHTML(cur){ return '<div class="steps">' + STEP_NAMES.map((n, i) => '<div class="step' + (i + 1 === cur ? " on" : i + 1 < cur ? " done" : "") + '">' + (i + 1) + ". " + n + "</div>").join("") + "</div>"; }
function saveA(){ save(); cleanup(); viewBilan(new URLSearchParams()); }
function viewBilan(params){
  const A = S.assessment;
  if (params.get("result") && S.lastResult) return bilanResults();
  if (!A) {
    render("<h1>Bilan de niveau</h1><p class=\"lead\">Pour mesurer ton vrai niveau comme si personne ne te connaissait : les 4 compétences, notées séparément sur l'échelle européenne (A1 à C2).</p>" +
      '<div class="panel"><ol style="margin:0;padding-left:20px;line-height:1.9"><li><b>EF SET</b> (gratuit, ~50 min) : compréhension écrite et orale, test calibré et reconnu.</li><li><b>Grammaire et vocabulaire</b> (~10 min) : 30 questions adaptatives.</li><li><b>Écrit</b> (~30 min) : une rédaction notée selon la grille officielle.</li><li><b>Oral</b> (~10 min) : 6 questions au micro, sur le modèle de l\'IELTS.</li></ol>' +
      '<p class="muted" style="margin-top:12px">Conditions d\'examen : pas de dictionnaire, pas de traducteur, réponds seul. Tu peux t\'arrêter entre deux étapes, ta progression est enregistrée.</p><div class="row"><button class="btn primary" id="start-bilan">Commencer le bilan</button>' +
      (S.lastResult ? '<a class="btn" href="#bilan?result=1">Voir mon dernier résultat (' + esc(fmtDate(S.lastResult.at)) + ")</a>" : "") + "</div></div>");
    on("#start-bilan", "click", () => {
      S.assessment = {step:1, at:Date.now(), set:Math.floor(Math.random() * SPEAKING_ASSESS.length), prompt:pick(WRITING_ASSESS), efset:null, quiz:placementInit(), writing:null, writingText:"", speaking:[], speakingFb:null};
      saveA();
    });
    return;
  }
  ({1:bilanEfset, 2:bilanQuiz, 3:bilanWriting, 4:bilanSpeaking, 5:bilanFinish})[A.step]();
}
function bilanEfset(){
  render("<h1>Bilan · étape 1</h1>" + stepsHTML(1) + '<div class="panel"><h2>Test EF SET (lecture et écoute)</h2><p>Passe le test gratuit <b>EF SET 50 minutes</b> dans un autre onglet. Il s\'adapte à tes réponses et donne un score sur 100 pour la lecture et pour l\'écoute.</p>' +
    '<p><a class="btn" href="https://www.efset.org/" target="_blank" rel="noopener">Ouvrir efset.org ↗</a></p><div class="grid2"><div><label for="ef-r">Score lecture (0-100)</label><input id="ef-r" type="number" min="0" max="100" inputmode="numeric"></div><div><label for="ef-l">Score écoute (0-100)</label><input id="ef-l" type="number" min="0" max="100" inputmode="numeric"></div></div>' +
    '<p class="muted" id="ef-err" role="alert"></p><div class="row"><button class="btn primary" id="ef-ok">Valider mes scores</button><button class="btn ghost" id="ef-skip">Passer cette étape</button><button class="btn ghost danger" id="abandon">Abandonner le bilan</button></div>' +
    '<p class="muted" style="margin-top:10px">Sans EF SET, la lecture et l\'écoute resteront « non évaluées » : elles sont difficiles à mesurer de façon fiable sans questions calibrées.</p></div>');
  on("#ef-ok", "click", () => {
    const r = $("#ef-r").value.trim(), l = $("#ef-l").value.trim();
    if (r === "" || l === "" || efsetToLevel(r) === null || efsetToLevel(l) === null) { $("#ef-err").textContent = "Entre deux scores entre 0 et 100."; return; }
    S.assessment.efset = {reading:+r, listening:+l}; S.assessment.step = 2; saveA();
  });
  on("#ef-skip", "click", () => { S.assessment.efset = null; S.assessment.step = 2; saveA(); });
  on("#abandon", "click", () => { if (confirm("Abandonner ce bilan ? Ce qui a été fait sera perdu.")) { S.assessment = null; saveA(); } });
}
function bilanQuiz(){
  const A = S.assessment, st = A.quiz, next = st.i < st.total ? placementNext(st) : {q:null};
  if (!next.q) {
    A.results = {grammar:placementEstimate(st.g.asked), vocabulary:placementEstimate(st.v.asked)}; A.step = 3; A.writingStart = Date.now(); return saveA();
  }
  const {skill, q} = next, opts = shuffled(q[3], q[0]);
  render("<h1>Bilan · étape 2</h1>" + stepsHTML(2) + '<div class="panel"><div class="row"><span class="eyebrow grow" style="margin:0">' + (skill === "g" ? "Grammaire" : "Vocabulaire") + '</span><span class="muted">' + (st.i + 1) + " / " + st.total + '</span></div><div class="bar" style="margin:8px 0 4px"><i style="width:' + Math.round(100 * st.i / st.total) + '%"></i></div>' +
    '<p class="q">' + esc(q[2]) + '</p><div class="opts">' + opts.map(o => '<button class="opt" data-a="' + esc(o) + '">' + esc(o) + "</button>").join("") +
    '<button class="opt" data-a="" style="color:var(--ink-3)">Je ne sais pas</button></div><p class="muted" style="margin-top:12px">Pas de correction pendant le test : réponds « Je ne sais pas » plutôt que de deviner, le résultat sera plus juste.</p></div>');
  on("[data-a]", "click", e => { placementAnswer(st, skill, q, e.currentTarget.dataset.a); save(); bilanQuiz(); });
}
function bilanWriting(){
  const A = S.assessment;
  render("<h1>Bilan · étape 3</h1>" + stepsHTML(3) + '<div class="panel"><div class="row"><h2 class="grow" style="margin:0">Expression écrite</h2><span class="timer" id="timer"></span></div><p class="muted">Conseillé : 30 minutes, 180 à 250 mots, sans dictionnaire ni correcteur.</p>' +
    '<div class="cue"><b>' + esc(A.prompt) + '</b></div><label for="w-text">Ton texte</label><textarea id="w-text" style="min-height:260px" spellcheck="false" autocomplete="off" autocapitalize="sentences">' + esc(A.writingText) + '</textarea>' +
    '<div class="row" style="margin-top:8px"><span class="muted grow" id="w-count"></span><button class="btn ghost" id="w-skip">Passer l\'écrit</button><button class="btn primary" id="w-send">Envoyer pour évaluation</button></div></div><div id="w-result"></div>');
  const ta = $("#w-text"), count = () => { const n = wordsIn(ta.value); $("#w-count").textContent = n + " mots" + (n && n < 120 ? " · trop court pour une évaluation fiable" : ""); };
  const tick = () => { const s = Math.floor((Date.now() - (A.writingStart || Date.now())) / 1000); $("#timer").textContent = String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0"); };
  count(); tick(); every(1000, tick);
  ta.addEventListener("input", () => { A.writingText = ta.value; count(); save(); });
  on("#w-skip", "click", () => { if (confirm("Passer l'écrit ? Cette compétence ne sera pas évaluée.")) { A.writing = null; A.step = 4; saveA(); } });
  on("#w-send", "click", () => {
    if (wordsIn(ta.value) < 60) return toast("Écris au moins 60 mots (idéalement 180 à 250).");
    aiTask($("#w-result"), writingMessages(A.prompt, ta.value, {assessment:true}), text => {
      const fb = parseFeedback(text); A.writing = fb; recordFeedback(fb, "bilan écrit"); A.step = 4; saveA();
    });
    $("#w-result").scrollIntoView({behavior:"smooth", block:"start"});
  });
}
function speakingQuestions(set){
  const s = SPEAKING_ASSESS[set];
  return s.p1.map(q => ({part:"Partie 1", q})).concat([{part:"Partie 2", q:s.p2.topic, cue:s.p2.points}], s.p3.map(q => ({part:"Partie 3", q})));
}
function bilanSpeaking(){
  const A = S.assessment, qs = speakingQuestions(A.set), idx = A.speaking.length;
  if (idx >= qs.length) {
    render("<h1>Bilan · étape 4</h1>" + stepsHTML(4) + '<div class="panel"><h2>Réponses enregistrées</h2><p>' + A.speaking.map(a => "<b>" + esc(a.part) + "</b> · " + a.words + " mots en " + Math.round(a.seconds) + " s").join("<br>") + '</p><div class="row"><button class="btn primary" id="s-send">Envoyer pour évaluation</button><button class="btn ghost" id="s-redo">Recommencer l\'oral</button></div></div><div id="s-result"></div>');
    on("#s-redo", "click", () => { A.speaking = []; saveA(); });
    on("#s-send", "click", () => aiTask($("#s-result"), speakingMessages(A.speaking), text => {
      const fb = parseFeedback(text); A.speakingFb = fb; recordFeedback(fb, "bilan oral"); A.step = 5; saveA();
    }));
    return;
  }
  const item = qs[idx], hasMic = !!Recognition, p2 = !!item.cue;
  render("<h1>Bilan · étape 4</h1>" + stepsHTML(4) + '<div class="panel"><div class="row"><span class="eyebrow grow" style="margin:0">' + esc(item.part) + " · question " + (idx + 1) + " / " + qs.length + '</span><span class="timer" id="timer"></span></div>' +
    '<p class="q">' + esc(item.q) + "</p>" + (p2 ? '<div class="cue">You should say:<ul>' + item.cue.map(c => "<li>" + esc(c) + "</li>").join("") + '</ul></div><p class="muted" style="margin-top:10px">1 minute de préparation (tu peux prendre des notes sur papier), puis parle 1 à 2 minutes.</p>' : '<p class="muted">Réponds en développant : 2 à 4 phrases, environ 30 secondes.</p>') +
    (hasMic ? '<div class="row" style="margin:12px 0"><button class="btn" id="s-listen">Réécouter la question</button><button class="btn primary" id="s-rec">' + (p2 ? "Commencer la préparation" : "Répondre au micro") + "</button></div>" : '<div class="notice">Ce navigateur ne propose pas la reconnaissance vocale (utilise Chrome ou Edge pour l\'oral). Tu peux taper ta réponse comme tu la dirais : l\'évaluation sera moins représentative.</div>') +
    '<div class="live" id="s-live"></div><label for="s-text">' + (hasMic ? "Transcription (corrige seulement les erreurs évidentes de reconnaissance)" : "Ta réponse") + '</label><textarea id="s-text"' + (hasMic ? " readonly" : "") + '></textarea>' +
    '<div class="row" style="margin-top:10px"><span class="grow"></span>' + (idx === 0 ? '<button class="btn ghost" id="s-skip">Passer l\'oral</button>' : "") + '<button class="btn primary" id="s-next" disabled>Valider et continuer</button></div></div>');
  const ta = $("#s-text"), shown = Date.now();
  let recStart = 0, seconds = 0, phase = "idle";
  if (hasMic) speak(item.q);
  ta.addEventListener("input", () => { $("#s-next").disabled = !ta.value.trim(); });
  on("#s-skip", "click", () => { if (confirm("Passer l'oral ? Cette compétence ne sera pas évaluée.")) { A.speakingFb = null; A.step = 5; saveA(); } });
  on("#s-listen", "click", () => speak(item.q));
  const startRecording = () => {
    phase = "rec"; recStart = Date.now();
    const btn = $("#s-rec"); btn.textContent = "Terminer ma réponse"; btn.className = "btn rec";
    speechSynthesis.cancel();
    T.mic = startMic((final, interim) => { ta.value = final; $("#s-live").textContent = interim; });
    const limit = p2 ? 120 : 75;
    every(500, () => { const s = (Date.now() - recStart) / 1000; $("#timer").textContent = Math.floor(s) + " s"; if (s >= limit) stopRecording(); });
  };
  const stopRecording = () => {
    if (phase !== "rec") return;
    phase = "done"; seconds = (Date.now() - recStart) / 1000;
    T.mic.stop(); for (const id of T.timers) clearInterval(id); T.timers = [];
    // Laisse arriver les derniers résultats de la reconnaissance
    setTimeout(() => { ta.value = T.mic ? T.mic.text() || ta.value : ta.value; ta.readOnly = false; $("#s-live").textContent = ""; $("#s-next").disabled = !ta.value.trim();
      const btn = $("#s-rec"); if (btn) { btn.textContent = "Recommencer cette réponse"; btn.className = "btn"; } }, 700);
  };
  on("#s-rec", "click", () => {
    if (phase === "rec") return stopRecording();
    if (p2 && phase === "idle") {
      phase = "prep"; let left = 60; const btn = $("#s-rec"); btn.textContent = "Je suis prêt";
      $("#timer").textContent = "Préparation 60 s";
      every(1000, () => { left--; $("#timer").textContent = "Préparation " + left + " s"; if (left <= 0) { for (const id of T.timers) clearInterval(id); T.timers = []; startRecording(); } });
      return;
    }
    if (phase === "prep") { for (const id of T.timers) clearInterval(id); T.timers = []; }
    ta.value = ""; startRecording();
  });
  on("#s-next", "click", () => {
    const text = ta.value.trim(); if (!text) return;
    A.speaking.push({part:item.part, q:item.q, text, words:wordsIn(text), seconds:hasMic ? seconds : (Date.now() - shown) / 1000, typed:!hasMic});
    saveA();
  });
}
function bilanFinish(){
  const A = S.assessment, now = Date.now(), skills = {};
  if (A.efset) { skills.reading = {x:efsetToLevel(A.efset.reading), src:"EF SET (" + A.efset.reading + "/100)", at:now}; skills.listening = {x:efsetToLevel(A.efset.listening), src:"EF SET (" + A.efset.listening + "/100)", at:now}; }
  if (A.results) { skills.grammar = {x:A.results.grammar, src:"Test intégré, indicatif", at:now}; skills.vocabulary = {x:A.results.vocabulary, src:"Test intégré, indicatif", at:now}; }
  if (A.writing) skills.writing = {x:A.writing.level, src:"Rédaction notée par l'IA", at:now};
  if (A.speakingFb) skills.speaking = {x:A.speakingFb.level, src:"Oral noté par l'IA (sans la prononciation)", at:now};
  S.profile.skills = {...S.profile.skills, ...skills};
  S.profile.history.push({at:now, skills:Object.fromEntries(Object.entries(skills).map(([k, v]) => [k, v.x]))});
  S.lastResult = {at:now, skills, writing:A.writing, speaking:A.speakingFb};
  S.assessment = null; save();
  location.hash = "#bilan?result=1";
}
function levelsHTML(skills){
  return '<div class="levels">' + Object.keys(SKILLS).map(k => {
    const s = skills[k];
    return '<div class="lvl-row"><span>' + esc(SKILLS[k]) + (s && s.src ? '<br><small>' + esc(s.src) + "</small>" : "") + '</span><div class="lvl-scale" role="img" aria-label="' + esc(SKILLS[k]) + " : " + esc(s ? levelLabel(s.x) : "non évalué") + '">' + (s ? '<i style="width:' + Math.min(100, s.x / 6 * 100) + '%"></i>' : "") + '</div><span class="lvl-tag">' + esc(s ? levelLabel(s.x) : "—") + "</span></div>";
  }).join("") + '<div class="scale-legend"><span></span><span>' + LEVELS.map(l => "<b>" + l + "</b>").join("") + "</span><span></span></div></div>";
}
function bilanResults(){
  const R = S.lastResult, ov = overallLevel(R.skills);
  const prios = [...new Set([...(R.writing ? R.writing.priorities : []), ...(R.speaking ? R.speaking.priorities : [])])];
  render("<h1>Résultats du bilan</h1>" + stepsHTML(6) + '<div class="panel hero"><div class="eyebrow">Niveau global (médiane des compétences évaluées) · ' + esc(fmtDate(R.at)) + '</div><div class="big">' + esc(levelLabel(ov)) + '</div></div>' +
    '<div class="panel"><h2>Par compétence</h2>' + levelsHTML(R.skills) + "</div>" +
    (prios.length ? '<div class="panel"><h2>Tes priorités</h2><ul>' + prios.map(p => "<li>" + esc(p) + "</li>").join("") + "</ul></div>" : "") +
    '<div class="row" style="margin-bottom:14px"><a class="btn primary" href="#today">Voir mon plan du jour</a><a class="btn" href="#progress">Mes progrès</a></div>' +
    (R.writing ? '<details class="panel"><summary><b>Détail de l\'écrit</b></summary><div id="fb-w" style="margin-top:12px"></div></details>' : "") +
    (R.speaking ? '<details class="panel"><summary><b>Détail de l\'oral</b></summary><div id="fb-s" style="margin-top:12px"></div></details>' : "") +
    '<p class="muted">Ces niveaux sont une estimation : seul un examen officiel (TOEIC, IELTS, Linguaskill…) délivre un niveau certifié. Refais le bilan dans un mois pour mesurer ta progression.</p>');
  if (R.writing) { $("#fb-w").innerHTML = feedbackHTML(R.writing, "Expression écrite"); bindFeedback($("#fb-w"), R.writing); }
  if (R.speaking) { $("#fb-s").innerHTML = feedbackHTML(R.speaking, "Expression orale"); bindFeedback($("#fb-s"), R.speaking); }
}

// --- Vocabulaire ---
function viewVocab(){
  if (!T.vq) { const q = vocabQueue(S); T.vq = [...q.due, ...q.fresh].map(w => w.id); T.reviewed = 0; T.flipped = false; }
  const words = Object.fromEntries(allWords(S.custom).map(w => [w.id, w]));
  T.vq = T.vq.filter(id => words[id]);
  const id = T.vq[0];
  if (!id) {
    if (T.plan === "vocab" && T.reviewed) markDone("vocab");
    const studied = Object.values(S.cards), mature = studied.filter(c => c.s >= 21).length;
    render(backLink() + "<h1>Vocabulaire</h1>" + '<div class="panel hero"><h2>' + (T.reviewed ? "Bravo, " + T.reviewed + " révision(s) faites" : "Rien à revoir pour l'instant") + '</h2><p class="muted">' + studied.length + " mots étudiés · " + mature + ' bien ancrés (intervalle de 3 semaines ou plus). Les cartes reviennent juste avant que tu les oublies.</p><button class="btn" id="more">Apprendre 5 mots de plus</button></div>' +
      '<div class="panel"><h2>Ajouter un mot</h2><div class="grid3"><div><label for="nw-en">Anglais</label><input id="nw-en" autocapitalize="none"></div><div><label for="nw-fr">Français</label><input id="nw-fr"></div><div><label for="nw-ex">Exemple (facultatif)</label><input id="nw-ex"></div></div><div class="row" style="margin-top:10px"><button class="btn primary" id="nw-add">Ajouter</button></div></div>' +
      (S.custom.length ? '<div class="panel"><h2>Mes mots ajoutés (' + S.custom.length + ')</h2><ul class="mini">' + S.custom.slice().reverse().map(w => "<li><span><b>" + esc(w.en) + "</b> — " + esc(w.fr) + '</span><button class="btn small ghost danger" data-del="' + esc(w.id) + '">Supprimer</button></li>').join("") + "</ul></div>" : ""));
    on("#more", "click", () => {
      const lv = (S.profile.skills.vocabulary || {}).x || 3.5;
      T.vq = allWords(S.custom).filter(w => !S.cards[w.id]).sort((a, b) => Math.abs(a.lvl - lv - 0.5) - Math.abs(b.lvl - lv - 0.5)).slice(0, 5).map(w => w.id);
      if (!T.vq.length) toast("Tu as déjà vu tous les mots : ajoute les tiens !");
      viewVocab();
    });
    on("#nw-add", "click", () => {
      if (addWord({en:$("#nw-en").value, fr:$("#nw-fr").value, ex:$("#nw-ex").value})) { toast("Mot ajouté : il apparaîtra dans tes prochaines cartes."); viewVocab(); }
      else toast("Renseigne l'anglais et le français (ce mot est peut-être déjà dans tes cartes).");
    });
    on("[data-del]", "click", e => { const d = e.currentTarget.dataset.del; S.custom = S.custom.filter(w => w.id !== d); delete S.cards[d]; save(); viewVocab(); });
    return;
  }
  const w = words[id], card = S.cards[id], now = Date.now();
  render(backLink() + '<div class="row"><h1 class="grow">Vocabulaire</h1><span class="muted">' + T.vq.length + " restante(s)</span></div>" +
    '<div class="panel card"><div class="eyebrow">' + (card ? "Révision" : "Nouveau mot") + " · " + esc(LEVELS[w.lvl - 1] || "") + '</div><div class="word">' + esc(w.en) + '</div><button class="btn small ghost" data-say="en">Écouter</button>' +
    (T.flipped ? '<div class="fr" style="margin-top:12px">' + esc(w.fr) + "</div>" + (w.ex ? '<div class="ex">' + esc(w.ex) + ' <button class="btn small ghost" data-say="ex">Écouter</button></div>' : "") +
      '<div class="grades">' + [[1, "À revoir"], [2, "Difficile"], [3, "Correct"], [4, "Facile"]].map(([g, l]) => '<button class="btn' + (g === 3 ? " primary" : "") + '" data-g="' + g + '">' + l + "<small>" + esc(previewLabel(card, g, now)) + "</small></button>").join("") + "</div>"
      : '<p class="muted" style="margin-top:14px">Essaie de te rappeler le sens, puis vérifie.</p><button class="btn primary" id="flip">Afficher la réponse</button>') + "</div>" +
    '<p class="muted">Raccourcis : Espace pour retourner, 1 à 4 pour noter.</p>');
  on("[data-say]", "click", e => speak(e.currentTarget.dataset.say === "ex" ? w.ex : w.en));
  on("#flip", "click", () => { T.flipped = true; viewVocab(); });
  on("[data-g]", "click", e => gradeCard(id, +e.currentTarget.dataset.g));
  if (!T.keys) {
    T.keys = e => {
      if (!location.hash.startsWith("#vocab") || /INPUT|TEXTAREA/.test(document.activeElement.tagName)) return;
      if (e.key === " " && !T.flipped && T.vq[0]) { e.preventDefault(); T.flipped = true; viewVocab(); }
      else if (T.flipped && /^[1-4]$/.test(e.key) && T.vq[0]) gradeCard(T.vq[0], +e.key);
    };
    document.addEventListener("keydown", T.keys);
    const kill = T.keys; window.addEventListener("hashchange", () => document.removeEventListener("keydown", kill), {once:true});
  }
}
function gradeCard(id, g){
  const old = S.cards[id], now = Date.now();
  S.cards[id] = {...fsrsReview(old, g, now), first:old && old.first || now};
  save(); T.reviewed++; T.flipped = false; T.vq.shift();
  if (g === 1) T.vq.push(id);
  viewVocab();
}

// --- Grammaire ---
function grammarPool(topic){
  return GRAMMAR.filter(q => q[1] === topic).map(q => ({id:q[0], topic, lvl:q[2], q:q[3], opts:q[4], ex:q[5]}))
    .concat((S.genGrammar[topic] || []).map(q => ({...q, topic})));
}
function buildGrammarSession(topics, n){
  const seen = id => S.seen[id] || 0, lv = (S.profile.skills.grammar || {}).x || 3.5, out = [];
  const per = Math.ceil(n / topics.length);
  for (const t of topics) out.push(...grammarPool(t).sort((a, b) => seen(a.id) - seen(b.id) || Math.abs(a.lvl - lv) - Math.abs(b.lvl - lv)).slice(0, per));
  return out.slice(0, n);
}
function viewGrammar(params){
  if (!T.gs && (params.get("mix") || params.get("topic"))) {
    const t = params.get("topic"), stats = grammarStats(S);
    const topics = t && GRAMMAR_TOPICS[t] ? [t] : [weakestTopic(S), ...stats.filter(s => s.t !== weakestTopic(S)).sort((a, b) => (a.acc ?? 0.55) - (b.acc ?? 0.55)).slice(0, 2).map(s => s.t)];
    T.gs = {items:buildGrammarSession(topics, t ? 8 : 10), i:0, ok:0, answered:null};
  }
  if (!T.gs) {
    const stats = grammarStats(S);
    render(backLink() + "<h1>Grammaire</h1><p class=\"lead\">Questions corrigées immédiatement, avec la règle expliquée en français.</p>" +
      '<div class="panel hero"><h2>Session recommandée</h2><p class="muted">10 questions sur tes thèmes les plus faibles, en commençant par : ' + esc(GRAMMAR_TOPICS[weakestTopic(S)]) + '.</p><a class="btn primary" href="#grammar?mix=1' + (T.plan ? "&plan=" + T.plan : "") + '">Commencer</a></div>' +
      '<div class="panel"><h2>Par thème</h2><ul class="mini">' + stats.map(s => '<li><span class="grow"><b>' + esc(GRAMMAR_TOPICS[s.t]) + '</b><br><small>' + (s.n ? Math.round(100 * s.acc) + " % sur " + s.n + " réponses" : "Pas encore travaillé") + " · " + grammarPool(s.t).length + ' questions</small></span><span class="row"><a class="btn small" href="#grammar?topic=' + s.t + '">S\'entraîner</a>' + (useApi() ? '<button class="btn small ghost" data-gen="' + s.t + '">+8 avec l\'IA</button>' : "") + "</span></li>").join("") + '</ul></div><div id="gen-box"></div>');
    on("[data-gen]", "click", e => {
      const t = e.currentTarget.dataset.gen;
      aiTask($("#gen-box"), grammarGenMessages(t, (S.profile.skills.grammar || {}).x), text => {
        const qs = normQuestions(parseJSONLoose(text));
        if (!qs.length) throw new Error("aucune question exploitable");
        const list = S.genGrammar[t] || (S.genGrammar[t] = []);
        for (const q of qs) list.push({id:"ai:" + t + ":" + hashOf(q.q), lvl:(S.profile.skills.grammar || {}).x || 3.5, ...q});
        S.genGrammar[t] = list.slice(-40); save();
        T.gs = {items:qs.map(q => ({id:"ai:" + t + ":" + hashOf(q.q), topic:t, lvl:3.5, ...q})), i:0, ok:0, answered:null}; viewGrammar(new URLSearchParams());
      }, {label:"Création des questions…", maxTokens:3000});
    });
    return;
  }
  const G = T.gs, item = G.items[G.i];
  if (!item) {
    if (T.plan === "grammar") markDone("grammar");
    render(backLink("#grammar", "Grammaire") + '<h1>Grammaire</h1><div class="panel hero"><div class="big">' + G.ok + " / " + G.items.length + '</div><p class="muted" style="margin-top:8px">' + (G.ok / G.items.length >= 0.8 ? "Excellent, ce thème est en bonne voie." : "Ces thèmes reviendront dans tes prochaines sessions.") + '</p><div class="row"><a class="btn primary" href="#today">Retour au plan</a><button class="btn" id="again">Nouvelle session</button></div></div>');
    on("#again", "click", () => { T.gs = null; viewGrammar(new URLSearchParams("mix=1")); });
    return;
  }
  const opts = shuffled(item.opts, item.id), ans = G.answered;
  render(backLink("#grammar", "Grammaire") + '<div class="panel"><div class="row"><span class="eyebrow grow" style="margin:0">' + esc(GRAMMAR_TOPICS[item.topic]) + '</span><span class="muted">' + (G.i + 1) + " / " + G.items.length + "</span></div>" +
    '<p class="q">' + esc(item.q) + '</p><div class="opts">' + opts.map(o => '<button class="opt' + (ans !== null ? (o === item.opts[0] ? " right" : o === ans ? " wrong" : "") : "") + '" data-a="' + esc(o) + '"' + (ans !== null ? " disabled" : "") + ">" + esc(o) + "</button>").join("") + "</div>" +
    (ans !== null ? '<div class="explain"><b>' + (ans === item.opts[0] ? "Correct." : "La bonne réponse : " + esc(item.opts[0]) + ".") + "</b> " + esc(item.ex) + '</div><div class="row end" style="margin-top:12px"><button class="btn primary" id="next">Suivante</button></div>' : "") + "</div>");
  on("[data-a]", "click", e => {
    const a = e.currentTarget.dataset.a, ok = a === item.opts[0], s = S.grammar[item.topic] || (S.grammar[item.topic] = {n:0, ok:0});
    s.n++; if (ok) { s.ok++; G.ok++; } S.seen[item.id] = (S.seen[item.id] || 0) + 1; save();
    G.answered = a; viewGrammar(new URLSearchParams());
  });
  on("#next", "click", () => { G.i++; G.answered = null; viewGrammar(new URLSearchParams()); });
  const nx = $("#next"); if (nx) nx.focus();
}
const hashOf = s => { let h = 0; for (const c of s) h = (Math.imul(h, 31) + c.charCodeAt(0)) | 0; return (h >>> 0).toString(36); };

// --- Écoute ---
function viewListen(){
  if (!T.ls) {
    const lv = Math.round((S.profile.skills.listening || {}).x || overallLevel(S.profile.skills) || 3.5);
    const pool = DICTATION.filter(d => Math.abs(d[1] - lv) <= 1).sort((a, b) => (S.seen[a[0]] || 0) - (S.seen[b[0]] || 0) || a[1] - b[1]);
    T.ls = {items:pool.slice(0, 8), i:0, scores:[], checked:null};
  }
  const L = T.ls, item = L.items[L.i];
  if (!item) {
    const avg = L.scores.reduce((a, b) => a + b, 0) / (L.scores.length || 1);
    if (L.scores.length && !L.saved) { L.saved = true; S.listening.push({at:Date.now(), score:avg}); S.listening = S.listening.slice(-100); save(); if (T.plan === "listening") markDone("listening"); }
    render(backLink() + '<h1>Écoute</h1><div class="panel hero"><div class="big">' + Math.round(avg * 100) + ' %</div><p class="muted" style="margin-top:8px">de mots justes sur ' + L.scores.length + ' dictées.</p><div class="row"><a class="btn primary" href="#today">Retour au plan</a><button class="btn" id="again">Nouvelle série</button></div></div>');
    on("#again", "click", () => { T.ls = null; viewListen(); });
    return;
  }
  const res = L.checked;
  render(backLink() + '<div class="row"><h1 class="grow">Écoute</h1><span class="muted">' + (L.i + 1) + " / " + L.items.length + "</span></div>" +
    '<div class="panel"><p>Écoute la phrase (autant de fois que nécessaire) et écris-la.</p><div class="row"><button class="btn primary" id="play">Écouter</button><button class="btn" id="slow">Écouter lentement</button></div>' +
    '<label for="dict">Ce que tu entends</label><textarea id="dict" style="min-height:80px" spellcheck="false" autocomplete="off" autocapitalize="sentences"' + (res ? " readonly" : "") + ">" + esc(L.typed || "") + "</textarea>" +
    (res ? '<div class="explain"><b>' + Math.round(res.score * 100) + ' %</b> · <span class="diff">' + res.ops.map(o => '<span class="' + o.t + '">' + esc(o.w) + "</span>").join(" ") + '</span><br><small>Phrase exacte : ' + esc(item[2]) + '</small><br><small>Souligné : mots manqués ou mal écrits · barré : mots en trop.</small></div><div class="row end" style="margin-top:12px"><button class="btn primary" id="next">Suivante</button></div>'
      : '<div class="row end" style="margin-top:12px"><button class="btn primary" id="check">Vérifier</button></div>') + "</div>");
  on("#play", "click", () => speak(item[2], 0.95));
  on("#slow", "click", () => speak(item[2], 0.7));
  on("#check", "click", () => {
    const v = $("#dict").value; if (!v.trim()) return toast("Écris ce que tu as entendu.");
    L.typed = v; L.checked = wordDiff(item[2], v); L.scores.push(L.checked.score); S.seen[item[0]] = (S.seen[item[0]] || 0) + 1; save(); viewListen();
  });
  on("#next", "click", () => { L.i++; L.checked = null; L.typed = ""; viewListen(); });
  if (!res && L.i === 0 && !L.started) { L.started = true; speak(item[2], 0.95); }
}

// --- Écrit ---
function viewWrite(){
  if (!T.wp) T.wp = planFor(S).prompt;
  const draft = S.drafts[T.wp] || "";
  render(backLink() + "<h1>Écrit</h1><p class=\"lead\">80 à 200 mots. L'IA corrige chaque erreur et l'explique en français.</p>" +
    '<div class="panel"><div class="eyebrow">Sujet</div><div class="cue"><b id="w-prompt">' + esc(T.wp) + '</b></div><div class="row" style="margin-top:8px"><button class="btn small" id="w-other">Autre sujet</button><button class="btn small ghost" id="w-free">Sujet libre</button></div>' +
    '<label for="w-text">Ton texte</label><textarea id="w-text" style="min-height:220px" spellcheck="false" autocomplete="off" autocapitalize="sentences">' + esc(draft) + '</textarea>' +
    '<div class="row" style="margin-top:8px"><span class="muted grow" id="w-count"></span><button class="btn primary" id="w-send">Faire corriger</button></div></div><div id="w-result"></div>');
  const ta = $("#w-text"), count = () => { $("#w-count").textContent = wordsIn(ta.value) + " mots · brouillon enregistré"; };
  count();
  ta.addEventListener("input", () => { S.drafts[T.wp] = ta.value; count(); save(); });
  on("#w-other", "click", () => { const i = WRITING_DAILY.indexOf(T.wp); T.wp = WRITING_DAILY[(i + 1) % WRITING_DAILY.length]; viewWrite(); });
  on("#w-free", "click", () => { const p = prompt("Écris ton sujet (en anglais ou en français) :"); if (p && p.trim()) { T.wp = p.trim().slice(0, 300); viewWrite(); } });
  on("#w-send", "click", () => {
    if (wordsIn(ta.value) < 40) return toast("Écris au moins 40 mots pour une correction utile.");
    const text = ta.value, task = T.wp;
    aiTask($("#w-result"), writingMessages(task, text, {level:(S.profile.skills.writing || {}).x}), raw => {
      const fb = parseFeedback(raw);
      recordFeedback(fb, "écrit"); S.writings.push({at:Date.now(), prompt:task, level:fb.level, words:wordsIn(text)}); S.writings = S.writings.slice(-60);
      delete S.drafts[task]; save();
      if (T.plan === "writing") markDone("writing");
      $("#w-result").innerHTML = feedbackHTML(fb, "Correction"); bindFeedback($("#w-result"), fb);
    });
    $("#w-result").scrollIntoView({behavior:"smooth", block:"start"});
  });
}

// --- Oral ---
function viewSpeak(params){
  const id = params.get("s");
  const sc = SCENARIOS.find(s => s.id === id);
  if (!sc) {
    const rec = planFor(S).scenario;
    render(backLink() + "<h1>Oral</h1><p class=\"lead\">Choisis une situation. Parle au micro, ton partenaire te répond à voix haute. Le bilan détaillé arrive à la fin.</p>" +
      (Recognition ? "" : '<div class="notice">La reconnaissance vocale n\'est pas disponible dans ce navigateur (utilise Chrome ou Edge). Tu peux écrire tes réponses, ou utiliser le mode vocal de ChatGPT.</div>') +
      '<div class="hub">' + [SCENARIOS.find(s => s.id === rec), ...SCENARIOS.filter(s => s.id !== rec)].map(s => '<a href="#speak?s=' + s.id + (T.plan ? "&plan=" + T.plan : "") + '"><h3>' + esc(s.title) + (s.id === rec ? ' <span class="tag">Suggéré</span>' : "") + '</h3><p class="muted" style="margin:0">' + esc(s.open) + "</p></a>").join("") + "</div>");
    return;
  }
  const lv = (S.profile.skills.speaking || {}).x || overallLevel(S.profile.skills) || 3.5;
  const weak = topErrors(S.errors).slice(0, 2).map(([c]) => ERROR_CATS[c][0].toLowerCase());
  if (!useApi()) {
    render(backLink("#speak", "Oral") + "<h1>" + esc(sc.title) + '</h1><div id="sub"></div><div id="fb"></div>');
    subscriptionBox($("#sub"), voicePrompt(sc, lv, weak), raw => {
      const fb = parseFeedback(raw); finishConvo(sc, fb, 0); $("#sub").innerHTML = ""; $("#fb").innerHTML = feedbackHTML(fb, "Bilan de la conversation"); bindFeedback($("#fb"), fb);
    }, "1. Copie la consigne et colle-la dans une nouvelle conversation ChatGPT (ou Claude). 2. Lance le mode vocal et joue la scène. 3. À la fin, dis « feedback please ». 4. Copie la réponse obtenue et colle-la ci-dessous pour enregistrer tes erreurs et ta progression.");
    return;
  }
  if (!T.chat || T.chat.id !== sc.id) T.chat = {id:sc.id, turns:[{role:"assistant", content:sc.open}], busy:false};
  const C = T.chat, userTurns = C.turns.filter(t => t.role === "user").length;
  render(backLink("#speak", "Oral") + '<div class="row"><h1 class="grow">' + esc(sc.title) + '</h1><label class="row" style="margin:0;font-weight:500"><input type="checkbox" id="auto" style="width:18px;min-height:18px"' + (S.settings.autoSpeak ? " checked" : "") + "> Lecture auto</label></div>" +
    '<div class="panel"><div class="chat" id="chat">' + C.turns.map((t, i) => '<div class="msg ' + (t.role === "user" ? "me" : "ai") + '">' + esc(t.content) + (t.role === "assistant" ? '<button class="say" data-say="' + i + '" aria-label="Réécouter">♪</button>' : "") + "</div>").join("") +
    (C.busy ? '<div class="msg ai muted">…</div>' : "") + '</div><div class="live" id="live"></div>' +
    '<div id="chat-err"></div><textarea id="say" style="min-height:70px" placeholder="' + (Recognition ? "Appuie sur Parler, ou écris ta réponse" : "Écris ta réponse") + '"></textarea>' +
    '<div class="row" style="margin-top:8px">' + (Recognition ? '<button class="btn" id="mic">Parler</button>' : "") + '<button class="btn primary" id="send"' + (C.busy ? " disabled" : "") + '>Envoyer</button><span class="grow"></span><button class="btn" id="end"' + (userTurns < 3 || C.busy ? " disabled" : "") + ">Terminer et recevoir mon bilan</button></div>" +
    (userTurns < 3 ? '<p class="muted" style="margin-top:8px">Le bilan est disponible après 3 réponses (vise au moins 8 échanges).</p>' : "") + '</div><div id="fb"></div>');
  const chat = $("#chat"); chat.scrollTop = chat.scrollHeight;
  if (C.turns.length === 1 && !C.greeted && S.settings.autoSpeak) { C.greeted = true; speak(sc.open); }
  on("#auto", "change", e => { S.settings.autoSpeak = e.target.checked; save(); });
  on("[data-say]", "click", e => speak(C.turns[+e.currentTarget.dataset.say].content));
  const box = $("#say");
  box.addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } });
  on("#mic", "click", () => {
    const b = $("#mic");
    if (T.mic) { T.mic.stop(); const t = T.mic.text(); T.mic = null; b.textContent = "Parler"; b.className = "btn"; $("#live").textContent = ""; if (t) box.value = t; box.focus(); return; }
    speechSynthesis.cancel(); b.textContent = "Arrêter"; b.className = "btn rec";
    T.mic = startMic((final, interim) => { box.value = final; $("#live").textContent = interim; });
  });
  on("#send", "click", send);
  on("#end", "click", () => {
    $("#end").disabled = true;
    aiTask($("#fb"), chatFeedbackMessages(sc, C.turns), raw => {
      const fb = parseFeedback(raw); finishConvo(sc, fb, userTurns);
      $("#fb").innerHTML = feedbackHTML(fb, "Bilan de la conversation"); bindFeedback($("#fb"), fb); T.chat = null;
    }, {label:"Analyse de ta conversation…"});
    $("#fb").scrollIntoView({behavior:"smooth", block:"start"});
  });
  function send(){
    if (T.mic) { T.mic.stop(); T.mic = null; }
    const text = box.value.trim(); if (!text || C.busy) return;
    C.turns.push({role:"user", content:text}); C.busy = true; viewSpeak(params);
    callAI([{role:"system", content:chatSystem(sc, lv, weak)}, ...C.turns.slice(-16)], {maxTokens:400, temperature:0.8})
      .then(reply => { C.turns.push({role:"assistant", content:reply.trim()}); C.busy = false; if (T.chat === C) { viewSpeak(params); if (S.settings.autoSpeak) speak(reply); } })
      .catch(e => { C.busy = false; C.turns.pop(); if (T.chat === C) { viewSpeak(params); $("#say").value = text; $("#chat-err").innerHTML = '<div class="notice">' + esc(e.message) + "</div>"; } });
  }
}
function finishConvo(sc, fb, turns){
  recordFeedback(fb, "oral"); S.convos.push({at:Date.now(), scenario:sc.id, level:fb.level, turns}); S.convos = S.convos.slice(-60); save();
  if (T.plan === "speaking") markDone("speaking");
}

// --- Progrès ---
const SHORT = {reading:"Lecture", listening:"Écoute", writing:"Écrit", speaking:"Oral", grammar:"Grammaire", vocabulary:"Vocabulaire"};
function viewProgress(){
  const sk = S.profile.skills, ov = overallLevel(sk), month = monthKey();
  const days = Object.entries(S.sessions).filter(([d, s]) => Object.values(s.done || {}).some(Boolean));
  const minutes = days.reduce((a, [, s]) => a + Object.values(s.min || {}).reduce((x, y) => x + (y || 0), 0), 0);
  const cards = Object.values(S.cards), lastL = S.listening.slice(-10), errs = topErrors(S.errors, 30);
  const stats = grammarStats(S);
  render("<h1>Progrès</h1><p class=\"lead\">" + (ov ? "Niveau global estimé : <b>" + esc(levelLabel(ov)) + "</b>" : "Fais ton bilan pour situer ton niveau.") + "</p>" +
    '<div class="grid3" style="margin-bottom:14px">' + [[streak(S.sessions) + " j", "Série en cours"], [days.filter(([d]) => d.startsWith(month)).length + " j", "Jours pratiqués ce mois-ci"], [Math.round(minutes / 6) / 10 + " h", "Temps de pratique total"],
      [cards.length, "Mots étudiés"], [cards.filter(c => c.s >= 21).length, "Mots bien ancrés"], [lastL.length ? Math.round(100 * lastL.reduce((a, x) => a + x.score, 0) / lastL.length) + " %" : "—", "Dictées (10 dernières)"]]
      .map(([v, l]) => '<div class="panel tight" style="margin:0"><div class="stat">' + esc(String(v)) + '</div><div class="stat-label">' + esc(l) + "</div></div>").join("") + "</div>" +
    '<div class="panel"><div class="row"><h2 class="grow">Niveau par compétence</h2><a class="btn small" href="#bilan">' + (Object.keys(sk).length ? "Refaire le bilan" : "Faire le bilan") + "</a></div>" + levelsHTML(sk) + "</div>" +
    (S.profile.history.length > 1 ? '<div class="panel"><h2>Historique des bilans</h2><ul class="mini">' + S.profile.history.slice().reverse().map(h => "<li><span>" + esc(fmtDate(h.at)) + "</span><span>" + Object.entries(h.skills).map(([k, x]) => esc(SHORT[k] || k) + " " + esc(levelLabel(x))).join(" · ") + "</span></li>").join("") + "</ul></div>" : "") +
    '<div class="grid2"><div class="panel"><h2>Grammaire par thème</h2><div class="levels">' + stats.map(s => '<div class="lvl-row" style="grid-template-columns:minmax(0,1fr) 90px 44px"><span>' + esc(GRAMMAR_TOPICS[s.t]) + '</span><div class="bar' + (s.acc >= 0.8 ? " ok" : "") + '"><i style="width:' + Math.round(100 * (s.acc || 0)) + '%"></i></div><span class="lvl-tag">' + (s.n ? Math.round(100 * s.acc) + " %" : "—") + "</span></div>").join("") + "</div></div>" +
    '<div class="panel"><h2>Erreurs fréquentes (30 jours)</h2>' + (errs.length ? '<ul class="mini">' + errs.slice(0, 6).map(([c, n]) => "<li><span><b>" + esc(ERROR_CATS[c][0]) + "</b><br><small>" + esc(ERROR_CATS[c][1]) + "</small></span><span>" + n + "</span></li>").join("") + "</ul>" : '<p class="muted">Rien pour l\'instant.</p>') + "</div></div>" +
    (S.errors.length ? '<div class="panel"><h2>Mes dernières erreurs</h2>' + S.errors.slice(-12).reverse().map(e => '<div class="err"><span class="tag">' + esc(ERROR_CATS[e.cat][0]) + '</span><span class="o">' + esc(e.o) + '</span> → <span class="c">' + esc(e.c) + '</span><div class="e">' + esc(e.e) + " · " + esc(e.src) + "</div></div>").join("") + "</div>" : "") +
    (S.settings.mode === "openrouter" ? '<div class="panel tight"><b>Dépense IA ce mois-ci :</b> ' + fmtUsd(S.spend[month]) + " sur " + fmtUsd(S.settings.budget) + " · " + (S.calls || 0) + " appels au total</div>" : ""));
}

// --- Réglages ---
const MODEL_CHOICES = [["google/gemini-3.8-flash", "économique, recommandé"], ["google/gemini-3.5-flash", "économique"], ["openai/gpt-5.4-mini", "économique"], ["anthropic/claude-haiku-4.5", "intermédiaire"], ["anthropic/claude-sonnet-5", "haut de gamme, plus cher"], ["openai/gpt-5.5", "haut de gamme, plus cher"]];
function viewSettings(){
  const st = S.settings, vs = voices();
  render("<h1>Réglages</h1>" +
    '<div class="panel"><h2>Intelligence artificielle</h2><p class="muted">Elle sert uniquement à corriger l\'écrit, à noter l\'oral et à jouer les conversations. Le vocabulaire, la grammaire et les dictées sont gratuits.</p>' +
    '<label class="row" style="font-weight:500"><input type="radio" name="mode" value="openrouter" style="width:18px;min-height:18px"' + (st.mode === "openrouter" ? " checked" : "") + "> <span><b>OpenRouter</b> : tout se fait dans l'app, payé à l'usage avec tes crédits</span></label>" +
    '<label class="row" style="font-weight:500"><input type="radio" name="mode" value="subscription" style="width:18px;min-height:18px"' + (st.mode === "subscription" ? " checked" : "") + "> <span><b>Abonnement ChatGPT ou Claude</b> : l'app prépare la consigne, tu la colles dans ChatGPT ou Claude (0 € de plus)</span></label>" +
    '<div id="or-settings"' + (st.mode === "openrouter" ? "" : " hidden") + '><label for="key">Clé OpenRouter</label><div class="row"><input id="key" class="grow" type="password" autocomplete="off" value="' + esc(st.key) + '" placeholder="sk-or-…" style="width:auto"><button class="btn" id="key-check">Vérifier</button></div><p class="muted" id="key-info">À créer sur openrouter.ai/keys. Astuce : fixe aussi une limite de crédits sur la clé elle-même.</p>' +
    '<label for="model">Modèle</label><div class="row"><input id="model" class="grow" list="models" value="' + esc(st.model) + '" style="width:auto" autocapitalize="none" spellcheck="false"><button class="btn" id="price">Voir le prix</button></div><datalist id="models">' + MODEL_CHOICES.map(([m, d]) => '<option value="' + m + '">' + d + "</option>").join("") + '</datalist><p class="muted" id="price-info">Un modèle économique suffit largement pour un niveau B1-B2.</p>' +
    '<label for="budget">Budget maximum par mois (crédits OpenRouter, en $)</label><input id="budget" type="number" min="0" step="0.5" value="' + esc(st.budget) + '" style="max-width:160px"><p class="muted">Dépensé ce mois-ci : ' + fmtUsd(S.spend[monthKey()]) + ". Au-delà du budget, l'app bascule sur le copier-coller.</p></div></div>" +
    '<div class="panel"><h2>Voix et rythme</h2><div class="grid2"><div><label for="accent">Accent</label><select id="accent"><option value="en-GB"' + (st.accent === "en-GB" ? " selected" : "") + '>Britannique</option><option value="en-US"' + (st.accent === "en-US" ? " selected" : "") + '>Américain</option></select></div>' +
    '<div><label for="voice">Voix</label><select id="voice"><option value="">Automatique</option>' + vs.map(v => '<option value="' + esc(v.voiceURI) + '"' + (v.voiceURI === st.voice ? " selected" : "") + ">" + esc(v.name + " (" + v.lang + ")") + "</option>").join("") + "</select></div>" +
    '<div><label for="minutes">Temps par jour</label><select id="minutes">' + [30, 45, 60, 90].map(m => '<option value="' + m + '"' + (st.minutes === m ? " selected" : "") + ">" + m + " minutes</option>").join("") + "</select></div>" +
    '<div><label for="newPerDay">Nouveaux mots par jour</label><select id="newPerDay">' + [5, 10, 15, 20].map(m => '<option value="' + m + '"' + (st.newPerDay === m ? " selected" : "") + ">" + m + "</option>").join("") + "</select></div>" +
    '<div><label for="theme">Thème</label><select id="theme">' + [["auto", "Automatique"], ["light", "Clair"], ["dark", "Sombre"]].map(([v, l]) => '<option value="' + v + '"' + (st.theme === v ? " selected" : "") + ">" + l + "</option>").join("") + '</select></div></div><div class="row" style="margin-top:12px"><button class="btn" id="test-voice">Tester la voix</button></div></div>' +
    '<div class="panel"><h2>Mes données</h2><p class="muted">Tout est enregistré dans ce navigateur, sur cet appareil. La sauvegarde n\'inclut pas ta clé OpenRouter.</p><div class="row"><button class="btn" id="export">Exporter une sauvegarde</button><button class="btn" id="import">Importer une sauvegarde</button><button class="btn danger" id="reset">Tout effacer</button></div></div>');
  const set = (k, v) => { S.settings[k] = v; save(); renderChips(); };
  on("[name=mode]", "change", e => { set("mode", e.target.value); $("#or-settings").hidden = e.target.value !== "openrouter"; });
  on("#key", "input", e => set("key", e.target.value.trim()));
  on("#model", "input", e => set("model", e.target.value.trim() || defaults().settings.model));
  on("#budget", "input", e => set("budget", Math.max(0, +e.target.value || 0)));
  on("#accent", "change", e => set("accent", e.target.value));
  on("#voice", "change", e => set("voice", e.target.value));
  on("#minutes", "change", e => set("minutes", +e.target.value));
  on("#newPerDay", "change", e => set("newPerDay", +e.target.value));
  on("#theme", "change", e => { set("theme", e.target.value); applyTheme(); });
  on("#test-voice", "click", () => speak("Hello! This is how I sound. Let's practise your English together."));
  on("#key-check", "click", async () => {
    set("key", $("#key").value.trim()); const info = $("#key-info");
    if (!S.settings.key) { info.textContent = "Colle d'abord ta clé."; return; }
    info.textContent = "Vérification…";
    try {
      const r = await fetch("https://openrouter.ai/api/v1/key", {headers:{"Authorization":"Bearer " + S.settings.key}}), j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(r.status === 401 ? "Clé refusée." : "Erreur " + r.status);
      const d = j.data || {};
      info.textContent = "Clé valide." + (typeof d.usage === "number" ? " Utilisé au total : " + fmtUsd(d.usage) + "." : "") + (typeof d.limit_remaining === "number" ? " Reste sur la limite de la clé : " + fmtUsd(d.limit_remaining) + "." : "");
    } catch (e) { info.textContent = e.message.startsWith("Clé") || e.message.startsWith("Erreur") ? e.message : "Connexion impossible à OpenRouter."; }
  });
  on("#price", "click", async () => {
    set("model", $("#model").value.trim() || defaults().settings.model); const info = $("#price-info");
    info.textContent = "Recherche du tarif…";
    try {
      const r = await fetch("https://openrouter.ai/api/v1/models"), j = await r.json();
      const m = (j.data || []).find(x => x.id === S.settings.model);
      if (!m) { info.textContent = "Modèle introuvable sur OpenRouter : vérifie son identifiant (ex. google/gemini-3.8-flash)."; return; }
      const pin = +m.pricing.prompt * 1e6, pout = +m.pricing.completion * 1e6;
      // Estimation : 1 h par jour ≈ 1,4 M de tokens envoyés et 0,45 M reçus par mois (conversation surtout)
      info.textContent = m.name + " : " + (pin + pout === 0 ? "gratuit (avec limites de débit)." : pin.toFixed(2) + " $ / M tokens envoyés, " + pout.toFixed(2) + " $ / M reçus. Estimation pour 1 h par jour : environ " + fmtUsd(1.4 * pin + 0.45 * pout) + " par mois.");
    } catch { info.textContent = "Impossible de récupérer les tarifs."; }
  });
  on("#export", "click", () => {
    const data = JSON.parse(JSON.stringify(S)); data.settings.key = "";
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], {type:"application/json"}));
    a.download = "mon-anglais-" + dayKey() + ".json"; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  on("#import", "click", () => $("#import-file").click());
  on("#reset", "click", () => { if (confirm("Effacer toute ta progression, tes mots et tes réglages ? C'est définitif.")) { S = defaults(); save(); applyTheme(); toast("Données effacées."); route(); } });
}
$("#import-file").addEventListener("change", async e => {
  const f = e.target.files[0]; e.target.value = "";
  if (!f) return;
  try {
    const o = JSON.parse(await f.text());
    if (!o || o.v !== 1 || !o.profile || !o.settings) throw new Error();
    if (!confirm("Remplacer ta progression actuelle par cette sauvegarde ?")) return;
    const key = S.settings.key, d = defaults();
    S = {...d, ...o, settings:{...d.settings, ...o.settings, key}, profile:{...d.profile, ...o.profile}}; save(); applyTheme(); toast("Sauvegarde importée."); route();
  } catch { toast("Fichier de sauvegarde invalide."); }
});

try { speechSynthesis.onvoiceschanged = () => { if (location.hash.startsWith("#settings")) route(); }; } catch {}
window.addEventListener("hashchange", route);
applyTheme();
route();
