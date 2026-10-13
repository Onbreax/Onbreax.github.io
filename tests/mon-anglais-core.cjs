// Tests du moteur de Mon anglais : node tests/mon-anglais-core.cjs
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const dir = path.join(__dirname, "../mon-anglais/web");
const module_ = {exports:{}};
new Function("module", fs.readFileSync(path.join(dir, "content.js"), "utf8") + "\n" + fs.readFileSync(path.join(dir, "core.js"), "utf8") +
  "\nmodule.exports.DATA = {PLACEMENT, GRAMMAR, GRAMMAR_TOPICS, VOCAB, DICTATION, SCENARIOS, ERROR_CATS, WRITING_DAILY};")(module_);
const M = module_.exports, D = M.DATA;

// Contenu : identifiants uniques, 4 options distinctes, niveaux couverts
const ids = new Set();
for (const q of [...D.PLACEMENT.g, ...D.PLACEMENT.v, ...D.GRAMMAR]) {
  const id = q[0], opts = q.length === 4 ? q[3] : q[4];
  assert(!ids.has(id), "duplicate id " + id); ids.add(id);
  assert.equal(opts.length, 4, id); assert.equal(new Set(opts).size, 4, id);
}
for (const skill of ["g", "v"]) for (let L = 2; L <= 5; L++) assert(D.PLACEMENT[skill].filter(q => q[1] === L).length >= 8, skill + L);
for (const q of D.GRAMMAR) { assert(D.GRAMMAR_TOPICS[q[1]], q[0]); assert(q[3].includes("___"), q[0]); assert(q[5].length > 10, q[0]); }
assert.equal(new Set(D.VOCAB.map(v => v[0].toLowerCase())).size, D.VOCAB.length, "duplicate vocabulary");
assert.equal(new Set(D.DICTATION.map(d => d[0])).size, D.DICTATION.length);

// Niveaux
assert.equal(M.levelLabel(3), "B1"); assert.equal(M.levelLabel(3.5), "B1+"); assert.equal(M.levelLabel(4.49), "B2"); assert.equal(M.levelLabel(6.4), "C2"); assert.equal(M.levelLabel(null), "—");
assert.equal(M.parseLevel("B1+"), 3.5); assert.equal(M.parseLevel("b2"), 4); assert.equal(M.parseLevel("B1/B2"), 3.5); assert.equal(M.parseLevel("Upper C1"), 5); assert.equal(M.parseLevel("good"), null);
assert.equal(M.efsetToLevel(46), 3.5); assert.equal(M.levelLabel(M.efsetToLevel(41)), "B1"); assert.equal(M.levelLabel(M.efsetToLevel(60)), "B2+"); assert.equal(M.levelLabel(M.efsetToLevel(71)), "C2");
assert.equal(M.levelLabel(M.efsetToLevel(0)), "A1"); assert.equal(M.efsetToLevel(101), null); assert.equal(M.efsetToLevel("abc"), null);
assert.equal(M.overallLevel({a:{x:3}, b:{x:4}, c:{x:5}}), 4); assert.equal(M.overallLevel({a:{x:3}, b:{x:4}}), 3.5); assert.equal(M.overallLevel({}), null);

// Répétition espacée : intervalles croissants, oubli ramené à 10 minutes, Facile > Correct > Difficile
const t0 = Date.UTC(2026, 9, 1, 9), DAY = 864e5;
let c = M.fsrsReview(null, 3, t0);
assert.equal(Math.round((c.due - t0) / DAY), 4);
const again = M.fsrsReview(null, 1, t0); assert.equal(again.due - t0, 10 * 60e3);
let prev = c.due - t0;
for (let i = 0; i < 4; i++) { const now = c.due; c = M.fsrsReview(c, 3, now); assert(c.due - now > prev, "intervals grow"); prev = c.due - now; }
const base = M.fsrsReview(null, 3, t0), at = base.due;
const [h, g, e] = [2, 3, 4].map(x => M.fsrsReview(base, x, at).due - at);
assert(h < g && g < e);
const lapse = M.fsrsReview(c, 1, c.due); assert.equal(lapse.lapses, 1); assert(lapse.s < c.s);
assert.equal(M.previewLabel(null, 1, t0), "10 min");

// File de vocabulaire : nouvelles cartes limitées, cartes dues en premier
const st = {settings:{newPerDay:5}, profile:{skills:{}}, cards:{}, custom:[{id:"c:hello", en:"hello", fr:"bonjour", ex:""}]};
let q = M.vocabQueue(st, t0);
assert.equal(q.fresh.length, 5); assert.equal(q.fresh[0].id, "c:hello", "custom words first"); assert.equal(q.due.length, 0);
st.cards["v:actually"] = {...M.fsrsReview(null, 3, t0 - 10 * DAY), first:t0 - 10 * DAY};
st.cards["c:hello"] = {...M.fsrsReview(null, 3, t0), first:t0};
q = M.vocabQueue(st, t0);
assert.deepEqual(q.due.map(w => w.id), ["v:actually"]); assert.equal(q.fresh.length, 4);

// Test adaptatif : un candidat parfait finit au plus haut, un candidat qui rate tout au plus bas
function run(answerer){
  const s = M.placementInit();
  while (s.i < s.total) { const {skill, q} = M.placementNext(s); assert(q, "question available"); M.placementAnswer(s, skill, q, answerer(q)); }
  return [M.placementEstimate(s.g.asked), M.placementEstimate(s.v.asked)];
}
const perfect = run(q => q[3][0]); assert(perfect.every(x => M.levelLabel(x) === "C1+"), perfect);
const none = run(() => ""); assert(none.every(x => M.levelLabel(x) === "A1+"), none);
const b1 = run(q => q[1] <= 3 ? q[3][0] : ""); assert(b1.every(x => M.levelLabel(x) === "B1"), b1);
const b2 = run(q => q[1] <= 4 ? q[3][0] : ""); assert(b2.every(x => M.levelLabel(x) === "B2"), b2);

// Plan du jour : 60 minutes, plus de temps pour la compétence la plus faible
const state = {settings:{minutes:60}, profile:{skills:{vocabulary:{x:4}, grammar:{x:4}, listening:{x:4}, writing:{x:4}, speaking:{x:2.5}}}, grammar:{}, errors:[]};
const plan = M.planFor(state, "2026-10-13");
assert.equal(Object.values(plan.minutes).reduce((a, b) => a + b, 0), 60);
assert(plan.minutes.speaking > plan.minutes.writing);
assert(Object.values(plan.minutes).every(m => m >= 5 && m % 5 === 0));
assert.equal(M.planFor(state, "2026-10-13").prompt, plan.prompt, "deterministic per day");
assert.notEqual(plan.scenario, "free");
const empty = M.planFor({settings:{minutes:45}, profile:{skills:{}}, grammar:{}, errors:[]});
assert.equal(Object.values(empty.minutes).reduce((a, b) => a + b, 0), 45);
state.grammar = Object.fromEntries(Object.keys(D.GRAMMAR_TOPICS).map(t => [t, {n:10, ok:9}])); state.grammar.passive = {n:10, ok:3};
assert.equal(M.weakestTopic(state), "passive");

// Série
const sess = {"2026-10-11":{done:{vocab:true}}, "2026-10-12":{done:{grammar:true}}, "2026-10-10":{done:{}}};
assert.equal(M.streak(sess, "2026-10-13"), 2);
sess["2026-10-13"] = {done:{writing:true}}; assert.equal(M.streak(sess, "2026-10-13"), 3);

// Dictée
const d = M.wordDiff("I've been living here for three years.", "I been living here for 3 years");
assert.equal(d.ops.filter(o => o.t === "miss").length, 2); assert(d.score > 0.6 && d.score < 0.8);
assert.equal(M.wordDiff("Hello, world!", "hello world").score, 1);
assert.equal(M.wordDiff("It’s fine.", "it's fine").score, 1);

// Réponses de l'IA
const fb = M.normFeedback(M.parseJSONLoose('Voici :\n```json\n{"level":"B1+","criteria":{"task":4,"accuracy":"3","bad":"x"},"summary_fr":"Bien.","errors":[{"original":"I have went","correction":"I went","explanation_fr":"prétérit","category":"tenses"},{"original":"x","correction":"y","category":"unknown"}],"vocabulary":[{"en":"to cope","fr":"faire face"},{"en":"","fr":"vide"}]}\n```'));
assert.equal(fb.level, 3.5); assert.deepEqual(fb.criteria, {task:4, accuracy:3}); assert.equal(fb.errors.length, 2); assert.equal(fb.errors[1].cat, "other"); assert.equal(fb.vocabulary.length, 1);
assert.throws(() => M.parseJSONLoose("pas de JSON"));
const qs = M.normQuestions({questions:[{question:"I ___ here.", options:["live","lives","living","lived"], explanation_fr:"x"}, {question:"no gap", options:["a","b","c","d"]}, {question:"A ___", options:["a","a","b","c"]}]});
assert.equal(qs.length, 1);

// Consignes
const w = M.writingMessages("Task", "My text here.", {assessment:true});
assert.equal(w[0].role, "system"); assert.match(w[0].content, /JSON/); assert.match(w[1].content, /placement test/); assert.match(w[1].content, /3 words/);
assert.match(M.voicePrompt(D.SCENARIOS[0], 3.5, ["articles"]), /feedback please/);
assert.match(M.chatSystem(D.SCENARIOS[0], 3.5, []), /B1\+/);
console.log("Mon anglais core: all tests passed");
