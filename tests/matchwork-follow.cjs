/* Regression checks for personal follow-up and partial/legacy detail data. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM, VirtualConsole } = require('jsdom');
const html = fs.readFileSync(process.argv[2] || path.join(__dirname, '../matchwork.html'), 'utf8')
 .replace(/<meta name="matchwork-native" content="background-v1">/g, '');
const script = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].at(-1)[1];
const now = new Date().toISOString();
const offer = (id, extra = {}) => ({ id, titre: 'Offre fictive ' + id, employeur: 'Employeur fictif',
 lieu: 'Paris', ajoute: now, statut: 'À voir', description: 'Description fictive.', url: 'https://example.org/job/' + id, notes: '', ...extra });
const history = (statut, source) => ({ statut, source, at: now });
function app(data = {}) {
 const errors = [], requests = [];
 const console = new VirtualConsole(); console.on('jsdomError', error => errors.push(error));
 const dom = new JSDOM(html, { url: 'https://example.org/matchwork.html', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: console });
 const w = dom.window;
 w.alert = () => {}; w.confirm = () => true; w.Chart = class { destroy() {} };
 w.HTMLElement.prototype.scrollIntoView = function() {};
 w.fetch = async (url, options) => {
  requests.push({ url, options });
  if (url.endsWith('/key')) return { ok: true, json: async () => ({ data: { usage: 0, limit: null } }) };
  if (!url.endsWith('/chat/completions')) throw new Error('Unexpected external request in offline test');
  const verdict = JSON.parse(options.body).messages.at(-1).content.includes('reject-me') ? 'Écarter' : 'À creuser';
  return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ score: verdict === 'À creuser' ? 88 : 20, verdict, forces: [], reserves: [], resume: 'Analyse fictive.' }) } }], usage: { cost: 0.01 } }) };
 };
 for (const [key, value] of Object.entries({ vlcb_p1_profile: { cv: 'CV fictif' }, ...data })) w.localStorage.setItem(key, JSON.stringify(value));
 const context = dom.getInternalVMContext(); vm.runInContext(script, context);
 const get = selector => w.document.querySelector(selector);
 const run = text => vm.runInContext(text, context);
 const stored = key => JSON.parse(w.localStorage.getItem(key));
 const close = async () => { await new Promise(resolve => setTimeout(resolve, 5)); assert.deepEqual(errors, []); dom.window.close(); };
 return { w, get, run, stored, requests, close };
}
async function main() {
 let a = app({ vlcb_p1_offers: [
  offer('auto', { statut: 'À creuser', ia: { score: 88, verdict: 'À creuser', forces: [], reserves: [] }, statusHistory: [history('À creuser', 'IA')] }),
  offer('auto-rejected', { statut: 'Écartée', ia: { score: 20, verdict: 'Écarter', forces: [], reserves: [] }, statusHistory: [history('Écartée', 'IA')] }),
  offer('manual', { statut: 'À creuser', statusHistory: [history('À creuser', 'manuel')] }),
  offer('sent', { statut: 'Candidature envoyée', notes: 'Suivi saisi par la personne', statusHistory: [history('À creuser', 'IA'), history('Candidature envoyée', 'manuel')] }),
  offer('annotated', { statut: 'À creuser', notes: 'Note personnelle à conserver', statusHistory: [history('À creuser', 'IA')] }),
  offer('legacy-manual', { statut: 'À creuser' })
 ] });
 assert.equal(a.run('offers[0].statut'), 'À voir', 'recorded automatic selection removed from personal follow');
 assert.equal(a.run('offers[0].ia.verdict'), 'À creuser', 'AI suggestion kept');
 assert.equal(a.run('offers[1].statut'), 'À voir', 'AI rejection does not decide a personal status');
 assert.equal(a.run('offers[2].statut'), 'À creuser', 'manual decision preserved');
 assert.equal(a.run('offers[3].statut'), 'Candidature envoyée', 'application history preserved');
 assert.equal(a.run('offers[4].notes'), 'Note personnelle à conserver');
 assert.equal(a.run('offers[4].statut'), 'À creuser', 'annotated legacy offer not changed');
 assert.equal(a.run('offers[5].statut'), 'À creuser', 'ambiguous old status not guessed');
 const migrated = a.stored('vlcb_p1_offers');
 assert.equal(migrated[0].statusHistory[0].source, 'IA');
 assert.equal(migrated[0].statusHistory.at(-1).source, 'correction');
 a.run('migrateAutomaticStatuses()');
 assert.equal(a.run('offers[0].statusHistory.length'), 2, 'migration performed once');
 assert.equal(a.run('validateBackup(makeBackup()).profiles[0].offers.length'), 6, 'corrected history can be backed up and restored');
 a.run('show("candidatures")');
 assert.equal(a.get('#c-list').children.length, 4);
 a.get('#c-list button').click();
 assert.equal(a.get('#drawer').classList.contains('open'), true);
 assert.equal(a.get('#drawer').getAttribute('aria-hidden'), 'false');
 assert.equal(a.get('#detail-suivi').hidden, false, 'direct follow opens the follow tab');
 assert.equal(a.get('#tab-suivi').getAttribute('aria-selected'), 'true');
 assert.equal(a.get('#d-statut').value, 'À creuser');
 a.get('#d-notes').value = 'Prochaine étape';
 a.get('#d-notes').dispatchEvent(new a.w.Event('input', { bubbles: true }));
 assert.equal(a.stored('vlcb_p1_offers').find(o => o.id === 'manual').notes, 'Prochaine étape');
 a.get('#d-close').click();
 assert.equal(a.get('#drawer').getAttribute('aria-hidden'), 'true');
 assert.equal(a.get('#drawer-backdrop').hidden, true);
 assert.equal(a.w.document.querySelector('.app').inert, false);
 a.get('#c-list button').click();
 a.w.document.dispatchEvent(new a.w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
 assert.equal(a.get('#drawer').classList.contains('open'), false);
 await a.close();

 a = app({ vlcb_p1_offers: [offer('choose'), offer('reject-me')], vlcb_settings: { orKey: 'fake-inference-key' } });
 await a.run('scoreOffer(offers[0])');
 await a.run('scoreOffer(offers[1])');
 assert.equal(a.run('offers[0].statut'), 'À voir', 'positive AI verdict never selects on behalf of user');
 assert.equal(a.run('offers[1].statut'), 'À voir', 'negative AI verdict never rejects on behalf of user');
 a.run('show("candidatures")'); assert.match(a.get('#c-list').textContent, /Aucune offre/);
 a.run('openDrawer(offers[0])');
 const before = a.requests.length;
 a.get('#d-retain').click();
 assert.equal(a.run('offers[0].statut'), 'À creuser');
 assert.equal(a.stored('vlcb_p1_offers')[0].statusHistory.at(-1).source, 'manuel');
 assert.equal(a.get('#detail-suivi').hidden, false);
 assert.equal(a.requests.length, before, 'retaining an offer uses no API');
 a.get('#d-close').click(); a.run('show("candidatures")');
 assert.equal(a.get('#c-list').children.length, 1);
 a.get('#c-list button').click();
 assert.equal(a.get('#detail-suivi').hidden, false);
 await a.close();

 a = app({ vlcb_p1_offers: [offer('legacy-detail', { statut: 'À creuser', ia: { score: 90, forces: 'legacy non-array', reserves: [] } })] });
 a.run('renderEmp=()=>{throw new Error("legacy employer data")};renderEstablishment=()=>{throw new Error("legacy establishment data")}');
 a.run('show("candidatures")');
 a.get('#c-list button').click();
 assert.equal(a.get('#detail-suivi').hidden, false, 'partial AI/employer data never prevents access to own follow');
 a.get('#tab-resume').click();
 assert.match(a.get('#d-ia').textContent, /ne peuvent pas être affichées/);
 assert.equal(a.get('#drawer').classList.contains('open'), true, 'malformed summary leaves modal usable');
 a.get('#tab-employeur').click();
 assert.match(a.get('#d-empsheet').textContent, /ne peuvent pas être affichées/);
 a.get('#tab-suivi').click();
 assert.equal(a.get('#d-statut').value, 'À creuser');
 a.get('#tab-cv').click();
 a.get('#d-ats-out').textContent = 'Analyse déjà consultée';
 a.get('#tab-suivi').click(); a.get('#tab-cv').click();
 assert.equal(a.get('#d-ats-out').textContent, 'Analyse déjà consultée', 'tab navigation keeps existing CV results and does not require a paid rerun');
 a.get('#d-close').click();
 assert.equal(a.w.document.querySelector('.app').inert, false);
 a.run('enterOperation();show("candidatures")');
 a.get('#c-list button').click();
 assert.equal(a.get('#detail-suivi').hidden, false, 'follow view accessible during background operation');
 assert.equal(a.get('#d-readonly-hint').hidden, false);
 assert.equal(a.get('#d-notes').disabled, true);
 a.run('leaveOperation()');
 assert.equal(a.get('#d-notes').disabled, false);
 assert.equal(a.get('#d-readonly-hint').hidden, true);
 await a.close();
 console.log('Matchwork follow: automatic status migration, manual choices, direct follow navigation, legacy detail isolation, cost-free retention and read access during operations passed.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
