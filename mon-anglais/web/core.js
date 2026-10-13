"use strict";
// Moteur sans interface : niveaux, répétition espacée, test adaptatif, plan du jour, consignes pour l'IA.

const LEVELS = ["A1","A2","B1","B2","C1","C2"];
const SKILLS = {
  reading:"Compréhension écrite", listening:"Compréhension orale", writing:"Expression écrite",
  speaking:"Expression orale", grammar:"Grammaire", vocabulary:"Vocabulaire"
};
const DAY = 864e5;

function levelLabel(x){
  if (typeof x !== "number" || !isFinite(x)) return "—";
  const base = Math.min(6, Math.max(1, Math.floor(x + 1e-9)));
  return LEVELS[base - 1] + (base < 6 && x - base >= 0.5 ? "+" : "");
}
// "B1+", "b2", "B1/B2", "Upper B1" → nombre ; inconnu → null
function parseLevel(v){
  if (typeof v === "number" && isFinite(v)) return Math.min(6.5, Math.max(1, v));
  const found = String(v || "").toUpperCase().match(/[ABC][12]\+?/g);
  if (!found) return null;
  const nums = found.map(t => LEVELS.indexOf(t.slice(0, 2)) + 1 + (t.endsWith("+") ? 0.5 : 0));
  return nums.length > 1 ? (nums[0] + nums[nums.length - 1]) / 2 : nums[0];
}
// Barème public de l'EF SET : 1-30 A1, 31-40 A2, 41-50 B1, 51-60 B2, 61-70 C1, 71-100 C2
function efsetToLevel(score){
  const s = Number(score);
  if (!isFinite(s) || s < 0 || s > 100) return null;
  const bands = [[0,30,1],[31,40,2],[41,50,3],[51,60,4],[61,70,5],[71,100,6]];
  for (const [lo, hi, lv] of bands) if (s <= hi) return Math.round((lv + Math.max(0, s - lo) / (hi - lo + 1)) * 10) / 10;
  return 6;
}
function overallLevel(skills){
  const v = Object.values(skills || {}).map(s => s && s.x).filter(x => typeof x === "number").sort((a, b) => a - b);
  if (!v.length) return null;
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

// --- Dates ---
function dayKey(t = Date.now()){
  const d = new Date(t);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
const monthKey = (t = Date.now()) => dayKey(t).slice(0, 7);
function hashStr(s){ let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
// Mélange déterministe : une même question garde le même ordre d'options
function shuffled(arr, seed){
  const a = arr.slice(); let h = hashStr(seed) || 1;
  for (let i = a.length - 1; i > 0; i--) { h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0; const j = h % (i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function streak(sessions, today = dayKey()){
  const active = k => sessions[k] && Object.values(sessions[k].done || {}).some(Boolean);
  let n = 0, t = new Date(today + "T12:00:00").getTime();
  if (!active(today)) t -= DAY;
  while (active(dayKey(t))) { n++; t -= DAY; }
  return n;
}

// --- Répétition espacée (FSRS-4.5, paramètres par défaut, rétention visée 90 %) ---
const FSRS_W = [0.4872,1.4003,3.7145,13.8206,5.1618,1.2298,0.8975,0.031,1.6474,0.1367,1.0461,2.1072,0.0793,0.3246,1.587,0.2272,2.8755];
const FSRS_DECAY = -0.5, FSRS_FACTOR = 19 / 81, RETENTION = 0.9, RELEARN_MS = 10 * 60e3;
const clampD = d => Math.min(10, Math.max(1, d));
const initD = g => clampD(FSRS_W[4] - (g - 3) * FSRS_W[5]);
const retrievability = (days, s) => Math.pow(1 + FSRS_FACTOR * days / s, FSRS_DECAY);
const intervalDays = s => Math.min(36500, Math.max(1, Math.round(s / FSRS_FACTOR * (Math.pow(RETENTION, 1 / FSRS_DECAY) - 1))));
// g : 1 À revoir, 2 Difficile, 3 Correct, 4 Facile
function fsrsReview(card, g, now = Date.now()){
  const W = FSRS_W;
  if (!card || !card.reps) {
    const s = W[g - 1];
    return {s, d:initD(g), reps:1, lapses:g === 1 ? 1 : 0, last:now, due:g === 1 ? now + RELEARN_MS : now + intervalDays(s) * DAY};
  }
  const t = Math.max(0, (now - card.last) / DAY), r = retrievability(t, card.s);
  const d = clampD(W[7] * initD(3) + (1 - W[7]) * (card.d - W[6] * (g - 3)));
  let s;
  if (g === 1) s = Math.min(card.s, W[11] * Math.pow(d, -W[12]) * (Math.pow(card.s + 1, W[13]) - 1) * Math.exp(W[14] * (1 - r)));
  else s = card.s * (Math.exp(W[8]) * (11 - d) * Math.pow(card.s, -W[9]) * (Math.exp(W[10] * (1 - r)) - 1) * (g === 2 ? W[15] : 1) * (g === 4 ? W[16] : 1) + 1);
  return {s, d, reps:card.reps + 1, lapses:card.lapses + (g === 1 ? 1 : 0), last:now, due:g === 1 ? now + RELEARN_MS : now + intervalDays(s) * DAY};
}
function previewLabel(card, g, now = Date.now()){
  const ms = fsrsReview(card, g, now).due - now;
  if (ms < DAY) return Math.max(1, Math.round(ms / 60e3)) + " min";
  const d = Math.round(ms / DAY);
  return d < 31 ? d + " j" : d < 365 ? Math.round(d / 30) + " mois" : (d / 365).toFixed(1).replace(".0", "") + " an";
}
function allWords(custom){
  return VOCAB.map(([en, fr, ex, lvl]) => ({id:"v:" + en, en, fr, ex, lvl})).concat((custom || []).map(c => ({...c, lvl:c.lvl || 4})));
}
// File du jour : cartes dues, puis nouvelles cartes autour du niveau
function vocabQueue(state, now = Date.now()){
  const words = allWords(state.custom), cards = state.cards || {};
  const due = words.filter(w => cards[w.id] && cards[w.id].due <= now).sort((a, b) => cards[a.id].due - cards[b.id].due);
  const introduced = Object.values(cards).filter(c => c.first && dayKey(c.first) === dayKey(now)).length;
  const room = Math.max(0, (state.settings.newPerDay || 10) - introduced);
  const lv = state.profile.skills.vocabulary ? state.profile.skills.vocabulary.x : 3.5;
  const fresh = words.filter(w => !cards[w.id])
    .sort((a, b) => (b.id.startsWith("c:") - a.id.startsWith("c:")) || (Math.abs(a.lvl - lv - 0.5) - Math.abs(b.lvl - lv - 0.5)))
    .slice(0, room);
  return {due, fresh};
}

// --- Test adaptatif grammaire / vocabulaire ---
function placementInit(){ return {i:0, total:30, g:{lvl:3, asked:[]}, v:{lvl:3, asked:[]}}; }
function placementNext(st){
  const skill = st.i % 2 === 0 ? "g" : "v", cur = st[skill], used = new Set(cur.asked.map(a => a.id)), pool = PLACEMENT[skill];
  for (const d of [0, 1, -1, 2, -2, 3, -3]) {
    const q = pool.find(q => q[1] === cur.lvl + d && !used.has(q[0]));
    if (q) return {skill, q};
  }
  return {skill, q:null};
}
function placementAnswer(st, skill, q, answer){
  const ok = answer === q[3][0];
  st[skill].asked.push({id:q[0], lvl:q[1], ok});
  st[skill].lvl = Math.min(5, Math.max(2, q[1] + (ok ? 1 : -1)));
  st.i++;
  return ok;
}
// Plus haut niveau réussi à 60 % au moins, plus une part du niveau suivant
function placementEstimate(asked){
  const by = {};
  for (const a of asked) { const b = by[a.lvl] || (by[a.lvl] = {n:0, ok:0}); b.n++; if (a.ok) b.ok++; }
  let theta = 1.5;
  for (let L = 2; L <= 5; L++) {
    const b = by[L];
    if (b && b.ok / b.n >= 0.6 && (b.n >= 2 || L === 5 || !by[L + 1])) theta = L;
  }
  let frac = 0;
  if (theta >= 2) { const nx = by[theta + 1]; if (nx) frac = 0.8 * nx.ok / nx.n; else if (theta === 5) frac = 0.5; }
  return Math.round(Math.min(theta + frac, 5.9) * 10) / 10;
}

// --- Plan du jour ---
const PLAN_BASE = {vocab:0.2, grammar:0.15, listening:0.15, writing:0.2, speaking:0.3};
const PLAN_SKILL = {vocab:"vocabulary", grammar:"grammar", listening:"listening", writing:"writing", speaking:"speaking"};
function grammarStats(state){
  return Object.keys(GRAMMAR_TOPICS).map(t => {
    const s = state.grammar[t] || {n:0, ok:0};
    return {t, n:s.n, ok:s.ok, acc:s.n ? s.ok / s.n : null};
  });
}
function weakestTopic(state){
  const lv = (state.profile.skills.grammar || {}).x || 3.5;
  return grammarStats(state).map(s => ({...s, score:s.acc === null ? 0.55 - (GRAMMAR.some(q => q[1] === s.t && q[2] <= lv + 0.5) ? 0.1 : 0) : s.acc}))
    .sort((a, b) => a.score - b.score || a.t.localeCompare(b.t))[0].t;
}
function topErrors(errors, days = 30, now = Date.now()){
  const n = {};
  for (const e of errors || []) if (now - e.at < days * DAY) n[e.cat] = (n[e.cat] || 0) + 1;
  return Object.entries(n).sort((a, b) => b[1] - a[1]);
}
function planFor(state, key = dayKey()){
  const skills = state.profile.skills, total = state.settings.minutes || 60;
  const ov = overallLevel(skills) || 3.5, max = Math.max(...Object.values(skills).map(s => s.x), ov);
  const w = {};
  for (const k in PLAN_BASE) { const x = (skills[PLAN_SKILL[k]] || {}).x ?? ov; w[k] = PLAN_BASE[k] * (1 + 0.6 * Math.max(0, max - x)); }
  const sum = Object.values(w).reduce((a, b) => a + b, 0), minutes = {};
  for (const k in w) minutes[k] = Math.max(5, Math.round(total * w[k] / sum / 5) * 5);
  const diff = total - Object.values(minutes).reduce((a, b) => a + b, 0);
  const biggest = Object.keys(minutes).sort((a, b) => minutes[b] - minutes[a])[0];
  minutes[biggest] = Math.max(5, minutes[biggest] + diff);
  const h = hashStr(key);
  return {
    key, minutes,
    topic:weakestTopic(state),
    prompt:WRITING_DAILY[h % WRITING_DAILY.length],
    scenario:SCENARIOS[(h >>> 4) % (SCENARIOS.length - 1)].id   // la conversation libre reste au choix
  };
}

// --- Écoute : comparaison mot à mot ---
const normWords = s => String(s || "").toLowerCase().replace(/[’‘]/g, "'").replace(/[^a-z0-9' -]+/g, " ").replace(/-/g, " ").split(/\s+/).filter(Boolean);
function wordDiff(reference, attempt){
  const a = normWords(reference), b = normWords(attempt), m = a.length, n = b.length;
  const L = Array.from({length:m + 1}, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) for (let j = n - 1; j >= 0; j--) L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const ops = []; let i = 0, j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) { ops.push({t:"ok", w:a[i]}); i++; j++; }
    else if (L[i + 1][j] >= L[i][j + 1]) ops.push({t:"miss", w:a[i++]});
    else ops.push({t:"extra", w:b[j++]});
  }
  while (i < m) ops.push({t:"miss", w:a[i++]});
  while (j < n) ops.push({t:"extra", w:b[j++]});
  return {ops, score:m ? L[0][0] / m : 0};
}

// --- Réponses de l'IA ---
function parseJSONLoose(text){
  let t = String(text || "").trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1];
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a < 0 || b < a) throw new Error("La réponse ne contient pas le bloc de résultats attendu.");
  return JSON.parse(t.slice(a, b + 1));
}
const str = (v, max = 2000) => typeof v === "string" ? v.trim().slice(0, max) : "";
const strList = (v, n = 8) => Array.isArray(v) ? v.map(x => str(x, 400)).filter(Boolean).slice(0, n) : [];
function normFeedback(o){
  if (!o || typeof o !== "object") throw new Error("Résultat illisible.");
  const crit = {};
  for (const [k, v] of Object.entries(o.criteria || {})) { const n = Number(v); if (isFinite(n)) crit[str(k, 30)] = Math.min(5, Math.max(0, n)); }
  const cats = Object.keys(ERROR_CATS);
  return {
    level:parseLevel(o.level),
    criteria:crit,
    summary:str(o.summary_fr),
    strengths:strList(o.strengths_fr),
    priorities:strList(o.priorities_fr),
    errors:(Array.isArray(o.errors) ? o.errors : []).slice(0, 25).map(e => ({
      o:str(e && e.original, 300), c:str(e && e.correction, 300), e:str(e && e.explanation_fr, 400),
      cat:cats.includes(e && e.category) ? e.category : "other"
    })).filter(e => e.o || e.c),
    improved:str(o.improved_version, 4000),
    vocabulary:(Array.isArray(o.vocabulary) ? o.vocabulary : []).slice(0, 8).map(v => ({en:str(v && v.en, 80), fr:str(v && v.fr, 120), ex:str(v && v.example, 200)})).filter(v => v.en && v.fr)
  };
}
function normQuestions(o){
  const list = Array.isArray(o && o.questions) ? o.questions : [];
  return list.map(q => ({q:str(q && q.question, 300), opts:strList(q && q.options, 4), ex:str(q && q.explanation_fr, 400)}))
    .filter(q => q.q.includes("___") && q.opts.length === 4 && new Set(q.opts).size === 4);
}

const LEVEL_SCALE = "Use CEFR levels A1, A2, B1, B1+, B2, B2+, C1, C1+, C2. Be strict and calibrated like an official Cambridge/IELTS examiner: do not inflate. A text with frequent basic errors is not B2.";
const ERROR_SCHEMA = '"errors":[{"original":"exact words from the learner","correction":"corrected words","explanation_fr":"short explanation in French","category":"tenses|articles|prepositions|word-choice|word-order|agreement|spelling|punctuation|register|other"}]';
const VOCAB_SCHEMA = '"vocabulary":[{"en":"useful word or phrase","fr":"French translation","example":"example sentence"}]';

function writingMessages(task, text, opts = {}){
  const sys = "You are an expert English examiner and teacher for a French-speaking adult learner. " + LEVEL_SCALE +
    " Assess the text against the CEFR writing descriptors on four criteria scored 0-5: task (task achievement), coherence (organisation, linking), range (vocabulary and structures), accuracy (grammar, spelling)." +
    " List every significant error (max 20), most important first. Write all explanations and comments in French, addressed to the learner with \"tu\"." +
    " Reply with ONLY a JSON object: {\"level\":\"B1+\",\"criteria\":{\"task\":0,\"coherence\":0,\"range\":0,\"accuracy\":0},\"summary_fr\":\"2-3 sentences\",\"strengths_fr\":[\"...\"],\"priorities_fr\":[\"the 3 most useful things to work on\"]," +
    ERROR_SCHEMA + ",\"improved_version\":\"the learner's text rewritten at one level higher, keeping their ideas\"," + VOCAB_SCHEMA + "}" +
    " vocabulary: 3 to 6 words or phrases that would have improved this text.";
  const user = (opts.assessment ? "This is a placement test: the learner had about 30 minutes, no dictionary.\n" : "") +
    (opts.level ? "Learner's estimated level: " + levelLabel(opts.level) + ".\n" : "") +
    "Task: " + task + "\n\nLearner's text (" + normWords(text).length + " words):\n\"\"\"\n" + text + "\n\"\"\"";
  return [{role:"system", content:sys}, {role:"user", content:user}];
}
function speakingMessages(parts){
  const sys = "You are an expert IELTS/Cambridge speaking examiner for a French-speaking adult learner. " + LEVEL_SCALE +
    " You receive automatic speech-to-text transcripts with timing. Ignore punctuation, capitalisation and obvious transcription artefacts (homophones, missing words the recogniser may have dropped); you cannot hear pronunciation, so do not grade it and say so briefly." +
    " Score 0-5: fluency (length of answers, words per minute, hesitation words, development), range (vocabulary, structures), accuracy (grammar), coherence (logic, linking, answering the question)." +
    " Very short answers limit the level. Write all comments in French with \"tu\"." +
    " Reply with ONLY a JSON object: {\"level\":\"B1\",\"criteria\":{\"fluency\":0,\"range\":0,\"accuracy\":0,\"coherence\":0},\"summary_fr\":\"...\",\"strengths_fr\":[\"...\"],\"priorities_fr\":[\"...\"]," + ERROR_SCHEMA + "," + VOCAB_SCHEMA + "}";
  const user = parts.map((p, i) => "[" + p.part + "] Question: " + p.q + "\nAnswer (" + p.words + " words in " + Math.round(p.seconds) + " s" + (p.typed ? ", TYPED because no microphone" : "") + "): " + (p.text || "(no answer)")).join("\n\n");
  return [{role:"system", content:sys}, {role:"user", content:user}];
}
function chatSystem(scenario, level, weak){
  return "You are role-playing with a French-speaking adult learner of English (estimated level " + levelLabel(level || 3.5) + "). Your role: " + scenario.role + "." +
    " Stay in character. Speak naturally, the way people really talk, slightly above the learner's level. Reply in 1 to 3 short sentences and usually end with a question to keep the conversation going." +
    " Do not correct the learner during the conversation unless you genuinely cannot understand them; in that case ask them to rephrase, in character." +
    (weak && weak.length ? " Naturally create opportunities for the learner to use: " + weak.join(", ") + "." : "") +
    " Their messages come from speech recognition: ignore missing punctuation. Never use lists, markdown or emojis. Reply in English only.";
}
function chatFeedbackMessages(scenario, turns){
  const sys = "You are an English teacher reviewing a role-play conversation (" + scenario.title + ") by a French-speaking adult learner. " + LEVEL_SCALE +
    " Only assess the LEARNER's lines. They come from speech recognition: ignore punctuation and likely transcription artefacts, and do not grade pronunciation." +
    " Write comments in French with \"tu\". For each important error give the natural way a native speaker would say it." +
    " Reply with ONLY a JSON object: {\"level\":\"B1\",\"criteria\":{\"fluency\":0,\"range\":0,\"accuracy\":0,\"coherence\":0},\"summary_fr\":\"...\",\"strengths_fr\":[\"...\"],\"priorities_fr\":[\"...\"]," + ERROR_SCHEMA + "," + VOCAB_SCHEMA + "}";
  const user = turns.map(t => (t.role === "user" ? "LEARNER: " : "PARTNER: ") + t.content).join("\n");
  return [{role:"system", content:sys}, {role:"user", content:user}];
}
function grammarGenMessages(topic, level, n = 8){
  return [{role:"system", content:"You write English grammar exercises for French-speaking adults. Reply with ONLY JSON."},
    {role:"user", content:"Write " + n + " multiple-choice gap-fill questions on: " + GRAMMAR_TOPICS[topic] + " (topic code " + topic + "), for CEFR level " + levelLabel(level || 3.5) +
      ". Each question is one natural sentence containing exactly one gap written ___ . Exactly 4 options, exactly one correct, the correct option FIRST in the list. Distractors must be typical mistakes of French speakers. " +
      'Format: {"questions":[{"question":"...","options":["correct","wrong","wrong","wrong"],"explanation_fr":"short rule in French"}]}'}];
}
// Consigne à coller dans le mode vocal de ChatGPT ou Claude (mode abonnement)
function voicePrompt(scenario, level, weak){
  return chatSystem(scenario, level, weak) + "\n\nStart now with: \"" + scenario.open + "\"\n\n" +
    "When I say \"feedback please\", stop the role-play and reply with ONLY a JSON object (no other text) in this format, with comments in French:\n" +
    '{"level":"B1","criteria":{"fluency":0,"range":0,"accuracy":0,"coherence":0},"summary_fr":"...","strengths_fr":["..."],"priorities_fr":["..."],' + ERROR_SCHEMA + "," + VOCAB_SCHEMA + "}";
}
const messagesToText = msgs => msgs.map(m => m.content).join("\n\n");

if (typeof module !== "undefined") module.exports = {levelLabel, parseLevel, efsetToLevel, overallLevel, dayKey, monthKey, shuffled, streak, fsrsReview, intervalDays, previewLabel, vocabQueue, placementInit, placementNext, placementAnswer, placementEstimate, planFor, weakestTopic, topErrors, wordDiff, normWords, parseJSONLoose, normFeedback, normQuestions, writingMessages, speakingMessages, chatSystem, chatFeedbackMessages, grammarGenMessages, voicePrompt, messagesToText};
