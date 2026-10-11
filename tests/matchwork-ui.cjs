/* npm install --no-save jsdom@26.1.0 ; node tests/matchwork-ui.cjs */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM, VirtualConsole } = require('jsdom');
const html = fs.readFileSync(process.argv[2] || path.join(__dirname, '../matchwork.html'), 'utf8');
const script = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].at(-1)[1];
const now = new Date().toISOString();
const offer = (n, extra = {}) => ({ id: 'test' + n, titre: 'Responsable conformité ' + n,
 employeur: 'Entreprise ' + n, lieu: 'Paris', date: now.slice(0, 10), ajoute: now,
 statut: 'À voir', source: 'Test', description: 'Une annonce fictive sans données personnelles.',
 url: 'https://example.org/offre/' + n, notes: '', ...extra });
function app(seed = {}, mockFetch) {
 const errors = [], alerts = [], calls = [];
 const virtualConsole = new VirtualConsole();
 virtualConsole.on('jsdomError', e => errors.push(e));
 const dom = new JSDOM(html, { url: 'https://example.org/matchwork.html', runScripts: 'outside-only',
  pretendToBeVisual: true, virtualConsole });
 const w = dom.window;
 w.alert = x => alerts.push(String(x)); w.confirm = () => true;
 w.HTMLElement.prototype.scrollIntoView = function () {};
 w.fetch = async (url, options) => { calls.push({ url, options });
  if (mockFetch) return mockFetch(url, options);
  throw new Error('Unexpected network access in test: ' + url); };
 w.Chart = class { destroy() {} };
 for (const [k, v] of Object.entries(seed)) w.localStorage.setItem(k, JSON.stringify(v));
 const context = dom.getInternalVMContext();
 vm.runInContext(script, context);
 const get = s => w.document.querySelector(s);
 const run = s => vm.runInContext(s, context);
 const close = async () => { await settle(); assert.equal(errors.length, 0, errors.map(e => e.stack).join('\n')); dom.window.close(); };
 return { w, get, run, close, alerts, calls };
}
const settle = () => new Promise(r => setTimeout(r, 5));
const reply = (data, status = 200) => ({ ok: status >= 200 && status < 300, status,
 json: async () => data, text: async () => JSON.stringify(data) });
async function main() {
 let a = app({ vlcb_offers: [offer(1)], vlcb_profile: { cv: 'CV historique', cible: 'Lieu : Paris' },
  vlcb_settings: { adId: 'fake-id', adKey: 'fake-key' } });
 assert.equal(a.run('offers.length'), 1, 'legacy offers migrate');
 assert.equal(a.run('profile.cv'), 'CV historique');
 assert.equal(a.run('targetFieldsFor(profile).lieu'), 'Paris');
 assert.equal(a.get('#v-accueil').classList.contains('hidden'), false);
 assert.equal(a.get('#drawer').getAttribute('aria-hidden'), 'true');
 assert.equal(a.get('#home-total').textContent, '1');
 assert.equal(a.get('#h-balance').textContent, '—');
 a.run('show("offres")');
 a.get('#f-text').value = 'aucun résultat'; a.run('render()');
 assert.match(a.get('#empty').textContent, /Aucune offre ne correspond/);
 assert.equal(a.get('#empty').classList.contains('hidden'), false);
 a.get('#btn-reset-filters').click(); assert.equal(a.get('#tbl tbody').children.length, 1);
 a.get('#tbl tbody tr').focus(); a.get('#tbl tbody tr').click();
 assert.equal(a.get('#drawer').getAttribute('aria-hidden'), 'false');
 assert.equal(a.get('#drawer-backdrop').hidden, false);
 a.get('#tab-suivi').click(); assert.equal(a.get('#detail-suivi').hidden, false);
 a.get('#d-statut').value = 'Candidature envoyée';
 a.get('#d-statut').dispatchEvent(new a.w.Event('change', { bubbles: true }));
 a.get('#d-notes').value = 'Relire le CV';
 a.get('#d-notes').dispatchEvent(new a.w.Event('input', { bubbles: true }));
 let saved = JSON.parse(a.w.localStorage.getItem('vlcb_p1_offers'));
 assert.equal(saved[0].notes, 'Relire le CV'); assert.equal(saved[0].statusHistory.length, 1);
 assert.equal(saved[0].statusHistory[0].statut, 'Candidature envoyée');
 assert.equal(a.run('validateBackup(makeBackup()).profiles[0].offers[0].statusHistory.length'), 1);
 a.get('#drawer').classList.remove('open'); await settle(); // unchanged native Android back callback
 assert.equal(a.get('#drawer').getAttribute('aria-hidden'), 'true');
 assert.equal(a.get('#drawer-backdrop').hidden, true);
 assert.equal(a.w.document.querySelector('.app').inert, false);
 a.run('show("candidatures")'); assert.equal(a.get('#c-list').children.length, 1);
 await a.close();

 a = app({ vlcb_p1_offers: Array.from({ length: 95 }, (_, i) => offer(i)) });
 assert.equal(a.get('#tbl tbody').children.length, 30);
 a.get('#page-next').click(); assert.equal(a.get('#tbl tbody').children.length, 30);
 assert.match(a.get('#page-info').textContent, /^31–60/);
 a.get('#page-next').click(); a.get('#page-next').click();
 assert.equal(a.get('#tbl tbody').children.length, 5);
 assert.equal(a.get('#page-next').disabled, true);
 a.get('#f-text').value = 'Entreprise 94'; a.get('#f-text').dispatchEvent(new a.w.Event('input'));
 await new Promise(r => setTimeout(r, 190));
 assert.equal(a.get('#tbl tbody').children.length, 1);
 a.get('#btn-reset-filters').click(); a.get('[data-list-view=detail]').click();
 assert.equal(a.get('#tbl').classList.contains('compact'), false);
 assert.equal(a.get('[data-list-view=detail]').getAttribute('aria-pressed'), 'true');
 a.run('enterOperation()');
 a.get('[data-v=offres]').click(); assert.equal(a.run('activeView'), 'offres');
 a.get('#tbl tbody tr').click(); assert.equal(a.get('#drawer').classList.contains('open'), true);
 a.get('#tab-employeur').click(); assert.equal(a.get('#detail-employeur').hidden, false);
 assert.equal(a.get('#d-notes').disabled, true);
 a.get('#d-close').click(); assert.equal(a.get('#drawer').classList.contains('open'), false);
 a.get('[data-v=profil]').click(); assert.equal(a.run('activeView'), 'profil');
 assert.equal(a.get('#p-cv').dispatchEvent(new a.w.Event('beforeinput', { bubbles: true, cancelable: true })), false);
 a.run('switchProfile("forbidden")'); assert.equal(a.run('pid'), 'p1');
 a.run('leaveOperation()'); assert.equal(a.get('#d-notes').disabled, false);
 await a.close();

 for (const [data, status, expected] of [
  [{ error: { message: 'Invalid key' } }, 401, 'Indisponible'],
  [{ data: {} }, 200, 'Indisponible'],
  [{ data: { total_credits: 0, total_usage: 0 } }, 200, '0,00 $'],
  [{ data: { total_credits: 12, total_usage: 3.25 } }, 200, '8,75 $']
 ]) {
  a = app({ vlcb_settings: { orKey: 'mock-key' } }, () => reply(data, status));
  await settle(); assert.equal(a.get('#h-balance').textContent, expected);
  if (status === 401) assert.match(a.get('#or-connection').textContent, /Clé refusée/);
  assert.equal(a.calls.every(c => c.url.endsWith('/credits')), true, 'no paid call at startup');
  a.get('#or-key').value = 'changed-but-unsaved'; a.get('#or-key').dispatchEvent(new a.w.Event('input'));
  a.get('#btn-balance').click(); assert.match(a.get('#or-connection').textContent, /Enregistre d’abord/);
  assert.equal(a.run('settings.orKey'), 'mock-key'); await a.close();
 }

 let releaseCredits;
 a = app({ vlcb_settings: { orKey: 'old-key' } }, (_url, options) => {
  if (options.headers.Authorization === 'Bearer old-key') return new Promise(resolve => { releaseCredits = resolve; });
  return reply({ data: { total_credits: 8, total_usage: 1 } });
 });
 a.get('#or-key').value = 'new-key'; a.get('#btn-save-settings').click(); await settle();
 assert.equal(a.get('#h-balance').textContent, '7,00 $');
 releaseCredits(reply({ data: { total_credits: 90, total_usage: 0 } })); await settle();
 assert.equal(a.get('#h-balance').textContent, '7,00 $', 'late response from old key ignored'); await a.close();

 a = app({ vlcb_p1_offers: [offer(1)], vlcb_settings: { orKey: 'mock-key' }, vlcb_p1_profile: { cv: 'Compétences conformité audit contrôle interne.' } }, url => {
  assert.match(url, /\/credits$/); return reply({ data: { total_credits: 10, total_usage: 0 } });
 });
 a.run('openDrawer(offers[0])'); a.get('#tab-cv').click(); await a.get('#d-ats').onclick();
 assert.equal(a.calls.some(c => c.url.endsWith('/chat/completions')), false, 'local ATS stays free with a saved key');
 assert.equal(a.run('!!offers[0].ats'), true);
 a.run('addCost({})'); assert.match(a.get('#cost-note').textContent, /total affiché est incomplet/); await a.close();

 let releaseAnalysis;
 a = app({ vlcb_p1_offers: [offer(1), offer(2)], vlcb_settings: { orKey: 'mock-key' }, vlcb_p1_profile: { cv: 'Compétences conformité audit.' } }, url => {
  if (url.endsWith('/credits')) return reply({ data: { total_credits: 10, total_usage: 0 } });
  return new Promise(resolve => { releaseAnalysis = resolve; });
 });
 a.run('openDrawer(offers[0])'); a.get('#ats-use-ai').checked = true;
 const atsPromise = a.get('#d-ats').onclick(); await settle();
 a.get('#d-close').click(); a.run('openDrawer(offers[1])');
 releaseAnalysis(reply({ usage: { cost: .002 }, choices: [{ message: { content: JSON.stringify({ grade: 'A', lecture: 'ONLY OFFER ONE', suggestions: [] }) } }] }));
 await atsPromise;
 assert.equal(a.run('!!offers[0].ats'), true); assert.equal(a.run('!!offers[1].ats'), false);
 assert.doesNotMatch(a.get('#d-ats-out').textContent, /ONLY OFFER ONE/); await a.close();

 let releaseSearch;
 a = app({ vlcb_settings: { orKey: 'mock-key' }, vlcb_p1_kw: ['mot un', 'mot deux'] }, url => {
  if (url.endsWith('/credits')) return reply({ data: { total_credits: 10, total_usage: 0 } });
  return new Promise(resolve => { releaseSearch = resolve; });
 });
 a.get('#s-autoscore').checked = false; a.get('#s-autoverify').checked = false;
 const pending = a.get('#btn-web').onclick(); await settle();
 a.get('[data-v=offres]').click(); assert.equal(a.run('activeView'), 'offres');
 a.get('#btn-stop').click(); assert.match(a.get('#operation-hint').textContent, /Arrêt demandé/);
 releaseSearch(reply({ usage: { cost: .003 }, choices: [{ message: { content: JSON.stringify([offer(11)]) } }] }));
 await pending; await settle();
 assert.equal(a.calls.filter(c => c.url.endsWith('/chat/completions')).length, 1, 'stop prevents next keyword and all later calls');
 assert.equal(a.run('offers.length'), 1); assert.equal(a.run('costs.session'), .003);
 assert.equal(a.run('profile.lastSearch.stopped'), true); assert.equal(a.run('operationDepth'), 0);
 assert.match(a.get('#prog-txt').textContent, /Arrêtée/);
 assert.equal(a.run('validateBackup(makeBackup()).profiles[0].offers.length'), 1);
 await a.close();

 a = app({ vlcb_p1_offers: [offer(1)], vlcb_establishments_v1: { version: 1, period: '2026-10', rows: [{ id: 'PRIVATE_SENTINEL', name: 'PRIVATE_SENTINEL' }] } });
 const backup = a.run('JSON.stringify(makeBackup())'); assert.doesNotMatch(backup, /PRIVATE_SENTINEL/);
 const idCounts = [...a.w.document.querySelectorAll('[id]')].reduce((m, e) => m.set(e.id, (m.get(e.id) || 0) + 1), new Map());
 assert.equal([...idCounts].filter(([, count]) => count > 1).length, 0, 'no duplicate ids');
 const secretOffer = [offer(1, { statusHistory: [{ at: now, statut: 'Entretien', source: 'unknown' }] })];
 assert.throws(() => a.run('validateOffers(' + JSON.stringify(secretOffer) + ')'), /Historique/);
 await a.close();
 console.log('Matchwork UI: legacy data, navigation, filters, pagination, status history, native back cleanup, balances, local ATS, async isolation, cancellation, backups and private data checks passed.');
}
main().catch(e => { console.error(e); process.exitCode = 1; });
