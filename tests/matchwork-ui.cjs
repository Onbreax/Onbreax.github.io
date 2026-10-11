/* npm install --no-save jsdom@26.1.0 ; node tests/matchwork-ui.cjs */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM, VirtualConsole } = require('jsdom');
// Shared UI checks run without Android. The native protocol has its own background suite.
const html = fs.readFileSync(process.argv[2] || path.join(__dirname, '../matchwork.html'), 'utf8')
 .replace(/<meta name="matchwork-native" content="background-v1">/g, '');
const script = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].at(-1)[1];
const now = new Date().toISOString();
const offer = (n, extra = {}) => ({ id: 'test' + n, titre: 'Responsable conformité ' + n,
 employeur: 'Entreprise ' + n, lieu: 'Paris', date: now.slice(0, 10), ajoute: now,
 statut: 'À voir', source: 'Test', description: 'Une annonce fictive sans données personnelles.',
 url: 'https://example.org/offre/' + n, notes: '', ...extra });
function app(seed = {}, mockFetch, beforeRun) {
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
 if (beforeRun) beforeRun(w);
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
const keyReply = (extra = {}) => reply({ data: { usage: 3.25, limit: null, limit_remaining: null,
 is_management_key: false, is_provisioning_key: false, ...extra } });
async function main() {
 let a = app({ vlcb_offers: [offer(1)], vlcb_profile: { cv: 'CV historique', cible: 'Lieu : Paris' },
  vlcb_settings: { adId: 'fake-id', adKey: 'fake-key' } });
 assert.equal(a.run('offers.length'), 1, 'legacy offers migrate');
 assert.equal(a.run('profile.cv'), 'CV historique');
 assert.equal(a.run('targetFieldsFor(profile).lieu'), 'Paris');
 assert.equal(a.get('#v-accueil').classList.contains('hidden'), false);
 assert.equal(a.get('#drawer').getAttribute('aria-hidden'), 'true');
 assert.equal(a.get('#home-total').textContent, '1');
 assert.equal(a.get('#h-balance').textContent, 'À connecter');
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

 // Ordinary inference keys are checked independently of management-only account credits.
 for (const [data, status, expected, pattern] of [
  [{ error: { message: 'Invalid key' } }, 401, '—', /Clé refusée/],
  [{ data: {} }, 200, '—', /informations valides/],
  [{ data: { usage: '3.25' } }, 200, '—', /informations valides/],
  [{ error: {} }, 403, '—', /Accès refusé/],
  [{ error: {} }, 429, '—', /Trop de demandes/],
  [{ data: { usage: 3.25, is_management_key: true } }, 200, '—', /champ des crédits/],
  [{ data: { usage: 3.25, expires_at: '2020-01-01T00:00:00Z' } }, 200, '—', /expiré/],
  [{ data: { usage: 0, limit: 0, limit_remaining: 0 } }, 200, '0,00 $', /Clé IA active/],
  [{ data: { usage: 3.25, limit: 12, limit_remaining: 8.75 } }, 200, '8,75 $', /Clé IA active/],
  [{ data: { usage: 3.25, limit: null, limit_remaining: null } }, 200, 'Sans plafond défini', /Clé IA active/],
  [{ data: { usage: 300, limit: 100, limit_reset: 'monthly' } }, 200, 'Non communiqué', /Clé IA active/]
 ]) {
  a = app({ vlcb_settings: { orKey: 'mock-key' } }, () => reply(data, status));
  await settle(); assert.equal(a.get('#or-key-budget').textContent, expected);
  assert.equal(a.get('#h-balance').textContent, 'À connecter', 'key allowance never replaces account credits in the header');
  assert.match(a.get('#or-connection').textContent, pattern);
  assert.equal(a.calls.every(c => c.url.endsWith('/key')), true, 'no account or paid call with an ordinary key');
  assert.equal(a.get('#or-balance').textContent, 'À connecter', 'key budget is not presented as account balance');
  assert.equal(a.get('#h-balance-label').textContent, 'Crédits OpenRouter');
  assert.equal(a.get('#or-key-details').open, false, 'key allowance stays in collapsed details');
  assert.equal(a.get('#or-account-setup').open, true, 'account credit setup is visible when management key is missing');
  await a.close();
 }

 for (const [data, status, expected] of [
  [{ error: { message: 'Only management keys can perform this operation' } }, 403, 'Indisponible'],
  [{ error: {} }, 401, 'Indisponible'],
  [{ data: {} }, 200, 'Indisponible'],
  [{ data: { total_credits: '30', total_usage: 8 } }, 200, 'Indisponible'],
  [{ data: { total_credits: 0, total_usage: 0 } }, 200, '0,00 $'],
  [{ data: { total_credits: 12, total_usage: 3.25 } }, 200, '8,75 $']
 ]) {
  a = app({ vlcb_settings: { orKey: 'inference-key', orCreditsKey: 'management-key' } }, (url, options) => {
   if (url.endsWith('/key')) { assert.equal(options.headers.Authorization, 'Bearer inference-key'); return keyReply(); }
   assert.match(url, /\/credits$/); assert.equal(options.headers.Authorization, 'Bearer management-key'); return reply(data, status);
  });
  await settle(); assert.equal(a.get('#or-balance').textContent, expected);
  assert.equal(a.get('#or-connection').dataset.state, 'ok', 'account balance failure never rejects a valid inference key');
  assert.equal(a.get('#or-key-usage').textContent, '3,250 $');
  assert.equal(a.get('#h-balance').textContent, expected, 'header shows only actual account credits or their error state');
  assert.equal(a.calls.some(c => c.url.endsWith('/chat/completions')), false, 'verification is not an inference call');
  assert.doesNotMatch(a.run('JSON.stringify(makeBackup())'), /inference-key|management-key/, 'both credentials excluded from backups');
  await a.close();
 }

 // Different account balance, key allowance and local spending must never be conflated.
 a = app({ vlcb_settings: { orKey: 'inference-key', orCreditsKey: 'management-key' }, vlcb_costs: { session: 0, total: 1, calls: 2 } }, url => {
  if (url.endsWith('/key')) return keyReply({ usage: 8, limit: 100, limit_remaining: 92 });
  return reply({ data: { total_credits: 30, total_usage: 8 } });
 });
 await settle(); assert.equal(a.get('#h-balance').textContent, '22,00 $');
 assert.equal(a.get('#or-balance').textContent, '22,00 $');
 assert.equal(a.get('#or-account-total').textContent, '30,00 $');
 assert.equal(a.get('#or-account-usage').textContent, '8,000 $');
 assert.equal(a.get('#or-key-limit').textContent, '100,00 $');
 assert.equal(a.get('#or-key-budget').textContent, '92,00 $');
 assert.equal(a.get('#h-total').textContent, '1,000 $', 'local app cost is separate from account consumption');
 assert.equal(a.get('#or-account-setup').open, false); await a.close();

 a = app({ vlcb_settings: { orKey: 'inference-key', orCreditsKey: 'management-key' } }, url => {
  if (url.endsWith('/key')) return keyReply({ limit: 100, limit_remaining: 92 });
  return reply({ error: {} }, 403);
 });
 await settle(); assert.equal(a.get('#or-key-budget').textContent, '92,00 $');
 assert.equal(a.get('#h-balance').textContent, 'Indisponible', 'account error never falls back to the key allowance');
 assert.equal(a.get('#or-account-total').textContent, '—'); await a.close();

 a = app({ vlcb_settings: { orCreditsKey: 'management-key' } }, url => {
  assert.match(url, /\/credits$/); return reply({ data: { total_credits: 30, total_usage: 8 } });
 });
 await settle(); assert.equal(a.get('#h-balance').textContent, '22,00 $');
 assert.equal(a.get('#or-connection').dataset.state, 'missing'); await a.close();

 a = app({ vlcb_settings: { orKey: 'old-key', adId: 'saved-ad-id', adKey: 'saved-ad-key', orModel: 'saved-model' } }, () => keyReply());
 await settle(); a.get('#or-key').value = 'new-key'; a.get('#or-key').dispatchEvent(new a.w.Event('input'));
 assert.equal(a.get('#or-connection').dataset.state, 'draft');
 a.get('#ad-id').value = 'unsaved-ad-id';
 await a.get('#btn-balance').onclick();
 assert.equal(a.run('settings.orKey'), 'new-key', 'refresh saves the key that was actually entered');
 assert.equal(JSON.parse(a.w.localStorage.getItem('vlcb_settings')).orKey, 'new-key');
 assert.equal(a.run('settings.adId'), 'saved-ad-id', 'OpenRouter key save leaves other draft settings alone');
 assert.equal(a.run('settings.orModel'), 'saved-model');
 assert.equal(a.get('#or-connection').dataset.state, 'ok');
 a.get('#or-key').value = 'third-key'; await a.get('#btn-or-save').onclick();
 assert.equal(a.run('settings.orKey'), 'third-key');
 a.get('#or-key').value = 'blocked-key'; a.run('enterOperation()');
 await a.get('#btn-balance').onclick();
 assert.equal(a.run('settings.orKey'), 'third-key', 'cannot switch paid-operation credentials while an operation runs');
 a.run('leaveOperation()'); await a.close();

 let releaseKey;
 a = app({ vlcb_settings: { orKey: 'old-key' } }, (_url, options) => {
  if (options.headers.Authorization === 'Bearer old-key') return new Promise(resolve => { releaseKey = resolve; });
  return keyReply({ limit: 8, limit_remaining: 7 });
 });
 a.get('#or-key').value = 'new-key'; await a.get('#btn-or-save').onclick();
 assert.equal(a.get('#or-key-budget').textContent, '7,00 $');
 assert.equal(a.get('#h-balance').textContent, 'À connecter');
 releaseKey(keyReply({ limit: 90, limit_remaining: 90 })); await settle();
 assert.equal(a.get('#or-key-budget').textContent, '7,00 $', 'late response from old inference key ignored');
 assert.equal(a.get('#h-balance').textContent, 'À connecter'); await a.close();

 let releaseSlowKey;
 a = app({ vlcb_settings: { orKey: 'slow-inference-key', orCreditsKey: 'management-key' } }, url => {
  if (url.endsWith('/key')) return new Promise(resolve => { releaseSlowKey = resolve; });
  return reply({ data: { total_credits: 30, total_usage: 8 } });
 });
 await settle(); assert.equal(a.get('#h-balance').textContent, '22,00 $', 'account credits do not wait for a slow inference key');
 assert.equal(a.get('#or-connection').dataset.state, 'pending');
 releaseSlowKey(reply({ error: {} }, 401)); await settle();
 assert.equal(a.get('#or-connection').dataset.state, 'error');
 assert.equal(a.get('#h-balance').textContent, '22,00 $', 'invalid inference key does not alter valid account credits'); await a.close();

 let releaseCredits;
 a = app({ vlcb_settings: { orKey: 'inference-key', orCreditsKey: 'old-management-key' } }, (url, options) => {
  if (url.endsWith('/key')) return keyReply();
  if (options.headers.Authorization === 'Bearer old-management-key') return new Promise(resolve => { releaseCredits = resolve; });
  return reply({ data: { total_credits: 8, total_usage: 1 } });
 });
 await settle(); a.get('#or-credits-key').value = 'new-management-key'; await a.get('#btn-balance').onclick();
 assert.equal(a.get('#h-balance').textContent, '7,00 $');
 releaseCredits(reply({ data: { total_credits: 90, total_usage: 0 } })); await settle();
 assert.equal(a.get('#h-balance').textContent, '7,00 $', 'late account response from old management key ignored');
 a.get('#or-credits-key').value = ''; await a.get('#btn-or-save').onclick();
 assert.equal(a.get('#h-balance').textContent, 'À connecter', 'removing management key clears the obsolete account balance');
 assert.equal(a.get('#or-account-total').textContent, '—');
 await a.close();

 a = app({ vlcb_settings: { orKey: 'mock-key' } }, () => { throw new Error('connection failed'); });
 await settle(); assert.equal(a.get('#or-connection').dataset.state, 'error');
 assert.equal(a.get('#h-balance').textContent, 'À connecter'); await a.close();

 // The timeout covers the JSON body too, not only the response headers.
 a = app({ vlcb_settings: { orKey: 'mock-key' } }, (_url, options) => ({ ok: true, status: 200,
  json: () => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => {
   const error = new Error('aborted body'); error.name = 'AbortError'; reject(error);
  }, { once: true })) }), w => {
  const original = w.setTimeout.bind(w); w.setTimeout = (fn, delay) => original(fn, delay === 20000 ? 1 : delay);
 });
 await settle(); assert.match(a.get('#or-connection').textContent, /20 secondes/);
 assert.equal(a.get('#h-balance').textContent, 'À connecter'); await a.close();

 a = app({ vlcb_settings: { orKey: 'inference-key', orCreditsKey: 'management-key' } }, (url, options) => {
  if (url.endsWith('/key')) return keyReply({ limit: 100, limit_remaining: 92 });
  return { ok: true, status: 200, json: () => new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => {
   const error = new Error('aborted credits body'); error.name = 'AbortError'; reject(error);
  }, { once: true })) };
 }, w => { const original = w.setTimeout.bind(w); w.setTimeout = (fn, delay) => original(fn, delay === 20000 ? 1 : delay); });
 await settle(); assert.match(a.get('#or-credit-status').textContent, /20 secondes/);
 assert.equal(a.get('#h-balance').textContent, 'Indisponible');
 assert.equal(a.get('#or-key-budget').textContent, '92,00 $'); await a.close();

 a = app({ vlcb_settings: { orKey: 'inference-key', orCreditsKey: 'management-key' } }, url => {
  if (url.endsWith('/key')) return keyReply();
  if (url.endsWith('/credits')) return reply({ data: { total_credits: 10, total_usage: 0 } });
  return reply({ usage: { cost: .002 }, choices: [{ message: { content: 'test' } }] });
 });
 await settle(); await a.run('orChat({model:"test-model",messages:[]})');
 assert.equal(a.calls.find(c => c.url.endsWith('/chat/completions')).options.headers.Authorization, 'Bearer inference-key', 'management credential never used for inference');
 assert.equal(a.run('costs.session'), .002, 'account reads do not count as paid calls'); await a.close();

 a = app({ vlcb_p1_offers: [offer(1)], vlcb_settings: { orKey: 'mock-key' }, vlcb_p1_profile: { cv: 'Compétences conformité audit contrôle interne.' } }, url => {
  assert.match(url, /\/key$/); return keyReply();
 });
 a.run('openDrawer(offers[0])'); a.get('#tab-cv').click(); await a.get('#d-ats').onclick();
 assert.equal(a.calls.some(c => c.url.endsWith('/chat/completions')), false, 'local ATS stays free with a saved key');
 assert.equal(a.run('!!offers[0].ats'), true);
 a.run('addCost({})'); assert.match(a.get('#cost-note').textContent, /total affiché est incomplet/); await a.close();

 let releaseAnalysis;
 a = app({ vlcb_p1_offers: [offer(1), offer(2)], vlcb_settings: { orKey: 'mock-key' }, vlcb_p1_profile: { cv: 'Compétences conformité audit.' } }, url => {
  if (url.endsWith('/key')) return keyReply();
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
  if (url.endsWith('/key')) return keyReply();
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
