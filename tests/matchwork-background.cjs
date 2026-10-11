/* Offline DOM integration checks. Does not emulate Android lifecycle or battery policy. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM, VirtualConsole } = require('jsdom');
const source = fs.readFileSync(process.argv[2] || path.join(__dirname, '../matchwork.html'), 'utf8');
const settle = () => new Promise(resolve => setTimeout(resolve, 5));
const now = new Date().toISOString();
const seed = {
 vlcb_settings: { orKey: 'fake-inference-key', orCreditsKey: 'fake-management-key' },
 vlcb_p1_profile: { cv: 'CV fictif enregistré', domaine: 'Conformité', where: 'Paris' },
 vlcb_p1_kw: ['responsable conformité', 'expert conformité']
};
function app({ native = true, data = {}, failBegin = false, pendingCosts = [] } = {}) {
 let html = source.replace(/<meta name="matchwork-native" content="background-v1">/g, '');
 if (native) html = html.replace('<head>', '<head><meta name="matchwork-native" content="background-v1">');
 const script = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].at(-1)[1];
 const errors = [], alerts = [], messages = [], browserCalls = [], network = [];
 const virtualConsole = new VirtualConsole();
 virtualConsole.on('jsdomError', error => errors.push(error));
 const dom = new JSDOM(html, { url: native ? 'https://appassets.androidplatform.net/assets/index.html' : 'https://example.org/matchwork.html', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole });
 const w = dom.window;
 w.alert = value => alerts.push(String(value)); w.confirm = () => true;
 w.HTMLElement.prototype.scrollIntoView = function () {};
 w.Chart = class { destroy() {} };
 w.fetch = async (url, options) => {
  browserCalls.push({ url, options });
  if (url.endsWith('/key')) return { ok: true, status: 200, json: async () => ({ data: { usage: 1, limit: 100, limit_remaining: 99 } }) };
  if (url.endsWith('/credits')) return { ok: true, status: 200, json: async () => ({ data: { total_credits: 30, total_usage: 8 } }) };
  throw new Error('Unexpected browser API request: ' + url);
 };
 for (const [key, value] of Object.entries({ ...seed, ...data })) w.localStorage.setItem(key, JSON.stringify(value));
 const context = dom.getInternalVMContext();
 vm.runInContext(script, context);
 const get = selector => w.document.querySelector(selector);
 get('#s-autoscore').checked = false; get('#s-autoverify').checked = false;
 const port = {
  onmessage: null, start() {},
  postMessage(text) {
   const message = JSON.parse(text); messages.push(message);
   if (message.action === 'ready') queueMicrotask(() => send({ type: 'ready', batteryExempt: false, receipts: pendingCosts }));
   if (message.action === 'begin') queueMicrotask(() => send({ type: 'reply', id: message.id, ok: !failBegin, error: failBegin ? 'FGS refusé par Android' : null, value: { active: true } }));
   if (message.action === 'wait') queueMicrotask(() => send({ type: 'reply', id: message.id, ok: true, value: {} }));
   if (message.action === 'fetch') network.push({
    request: message,
    complete(text, cost, receipt) { send({ type: 'reply', id: message.id, ok: true, value: { status: 200, body: JSON.stringify({ choices: [{ message: { content: JSON.stringify(text) } }], usage: { cost } }), receipt } }); },
    completeRaw(data) { send({ type: 'reply', id: message.id, ok: true, value: { status: 200, body: JSON.stringify(data), receipt: '' } }); },
    reject(reason) { send({ type: 'reply', id: message.id, ok: false, error: reason }); }
   });
  }
 };
 const send = data => port.onmessage({ data: JSON.stringify(data) });
 const connect = () => w.dispatchEvent(new w.MessageEvent('message', { data: 'matchwork:bridge:1', ports: [port], origin: '', source: null }));
 if (native) connect();
 const run = text => vm.runInContext(text, context);
 const stored = key => JSON.parse(w.localStorage.getItem(key));
 const close = async () => { await settle(); assert.deepEqual(errors, []); assert.equal(run('nativePending.size'), 0); dom.window.close(); };
 return { w, get, run, stored, messages, browserCalls, network, alerts, close, send, connect };
}
function found(n) { return [{ titre: 'Offre fictive ' + n, employeur: 'Entreprise fictive', lieu: 'Paris', url: 'https://example.org/job/' + n, description: 'Description fictive.' }]; }
async function main() {
 let a = app({ native: false });
 assert.match(a.get('#background-status').textContent, /Navigateur/);
 assert.match(a.get('#background-detail').textContent, /peut suspendre/);
 assert.equal(a.get('#btn-battery-settings').hidden, true);
 assert.equal(a.run('nativeReady'), false);
 await a.close();

 a = app({ failBegin: true });
 await settle();
 await a.get('#btn-web').onclick();
 assert.equal(a.network.length, 0, 'no paid request if Android refused service start');
 assert.equal(a.run('operationDepth'), 0);
 assert.equal(a.run('backgroundRun'), null);
 assert.equal(a.run('activeRun'), null);
 assert.match(a.get('#background-status').textContent, /non démarrée/);
 assert.equal(a.messages.filter(message => message.action === 'end').length, 1, 'cancel late service startup');
 await a.close();

 a = app(); await settle();
 const running = a.get('#btn-web').onclick(); await settle();
 assert.equal(a.network.length, 1);
 assert.equal(a.messages.find(message => message.action === 'begin').token, a.network[0].request.token);
 assert.equal(a.network[0].request.headers.Authorization, 'Bearer fake-inference-key', 'management key never used for inference');
 assert.equal(a.network[0].request.timeout, 90000);
 assert.equal(a.run('operationDepth'), 1);
 assert.match(a.get('#operation-hint').textContent, /changer d’application/);
 Object.defineProperty(a.w.document, 'visibilityState', { configurable: true, value: 'hidden' });
 a.w.document.dispatchEvent(new a.w.Event('visibilitychange'));
 a.run('show("offres")');
 a.network[0].complete(found(1), 0.01, 'receipt-first'); await settle();
 assert.equal(a.network.length, 2, 'next keyword continues without a visible document');
 assert.equal(a.stored('vlcb_p1_offers').length, 1, 'offers persisted before the end of research');
 assert.equal(a.stored('vlcb_costs').total, 0.01, 'received cost persisted immediately');
 assert.equal(a.stored('vlcb_operation').status, 'running');
 assert.equal(a.stored('vlcb_operation').done, 1);
 assert.equal(a.stored('vlcb_operation').added, 1);
 a.network[1].complete(found(2), 0.02, 'receipt-second');
 await running; await settle();
 assert.equal(a.stored('vlcb_p1_offers').length, 2);
 assert.equal(a.stored('vlcb_costs').total, 0.03);
 assert.equal(a.stored('vlcb_costs').calls, 2);
 assert.equal(a.stored('vlcb_operation').status, 'complete', 'final log does not change completed job back to running');
 assert.equal(a.messages.filter(message => message.action === 'cost-ack').length, 2);
 assert.equal(a.messages.find(message => message.action === 'end').status, 'complete');
 assert.equal(a.run('operationDepth'), 0);
 assert.equal(a.run('backgroundRun'), null);
 assert.equal(a.get('#h-balance').textContent, '22,00 $');
 assert.equal(a.browserCalls.filter(call => call.url.endsWith('/chat/completions')).length, 0, 'native transport performs paid requests');
 await a.close();

 a = app(); await settle();
 const stopped = a.get('#btn-web').onclick(); await settle();
 const token = a.network[0].request.token;
 a.send({ type: 'stop', token: 'obsolete-run' });
 assert.equal(a.run('activeRun.stopRequested'), false);
 a.send({ type: 'stop', token });
 assert.equal(a.run('activeRun.stopRequested'), true);
 a.network[0].complete(found(3), 0.04, 'receipt-before-stop');
 await stopped;
 assert.equal(a.network.length, 1, 'stop after current response does not call the next keyword');
 assert.equal(a.stored('vlcb_p1_offers').length, 1, 'current response preserved after stop');
 assert.equal(a.stored('vlcb_costs').total, 0.04);
 assert.equal(a.stored('vlcb_operation').status, 'stopped');
 assert.equal(a.messages.find(message => message.action === 'end').status, 'stopped');
 await a.close();

 a = app(); await settle();
 const interrupted = a.get('#btn-web').onclick(); await settle();
 a.send({ type: 'interrupted', token: a.network[0].request.token, message: 'Service arrêté par Android.' });
 a.network[0].reject('Connexion interrompue.');
 await interrupted;
 assert.equal(a.network.length, 1);
 assert.equal(a.stored('vlcb_operation').status, 'interrupted');
 assert.equal(a.messages.find(message => message.action === 'end').status, 'interrupted');
 assert.match(a.get('#operation-title').textContent, /interrompue par Android/);
 assert.equal(a.run('activeRun'), null);
 await a.close();

 const previous = { id: 'old-job', version: 1, profileId: 'p1', kind: 'search', startedAt: now, updatedAt: now, status: 'running', phase: 'Recherche web', done: 1, total: 2, added: 1, cost: 0.06, log: 'Une première offre trouvée.' };
 a = app({ data: {
  vlcb_operation: previous,
  vlcb_p1_offers: [{ ...found(4)[0], id: 'previous-offer', statut: 'À voir', ajoute: now, ia: { loading: true } }],
  vlcb_costs: { session: 0.06, total: 0.06, calls: 2, nativeReceipts: ['already-recorded'] }
 }, pendingCosts: [
  { id: 'already-recorded', usage: { cost: 0.02 } },
  { id: 'received-not-yet-recorded', usage: { cost: 0.03 } },
  { id: 'unknown-cost', usage: { cost: '0.01' } }
 ] });
 await settle();
 assert.equal(a.network.length, 0, 'interrupted search is not automatically relaunched');
 assert.equal(a.stored('vlcb_operation').status, 'interrupted');
 assert.equal(a.stored('vlcb_p1_offers')[0].ia.loading, undefined);
 assert.equal(a.stored('vlcb_costs').total, 0.09, 'costs recovered exactly once');
 assert.equal(a.stored('vlcb_costs').calls, 4);
 assert.equal(a.stored('vlcb_costs').unpriced, 1, 'missing cost remains unknown rather than estimated');
 assert.equal(a.stored('vlcb_operation').cost, 0.09);
 assert.equal(a.messages.filter(message => message.action === 'cost-ack').length, 3);
 a.send({ type: 'ready', receipts: [{ id: 'received-not-yet-recorded', usage: { cost: 0.03 } }] });
 assert.equal(a.stored('vlcb_costs').total, 0.09, 'duplicate receipt does not double-charge local audit');
 assert.match(a.get('#operation-hint').textContent, /Aucun appel IA n’est relancé automatiquement/);
 await a.close();

 a = app(); await settle();
 const firstAfterInterrupt = a.get('#btn-web').onclick(); await settle();
 a.network[0].complete([], 0, 'zero-first'); await settle();
 a.network[1].complete([], 0, 'zero-second'); await firstAfterInterrupt;
 const secondRun = a.get('#btn-web').onclick(); await settle();
 assert.equal(a.stored('vlcb_operation').status, 'running', 'new job resets old completion state');
 a.network[2].complete([], 0, 'zero-third'); await settle();
 a.network[3].complete([], 0, 'zero-fourth'); await secondRun;
 assert.equal(a.stored('vlcb_costs').total, 0, 'real zero cost preserved');
 assert.equal(a.stored('vlcb_costs').calls, 4);
 assert.equal(a.messages.filter(message => message.action === 'begin').length, 2);
 assert.equal(a.messages.filter(message => message.action === 'end').length, 2);
 await a.close();

 a = app({ data: { vlcb_settings: { ...seed.vlcb_settings, adId: 'fake-adzuna-id', adKey: 'fake-adzuna-key' } } }); await settle();
 const adzuna = a.get('#btn-adzuna').onclick(); await settle();
 assert.match(a.network[0].request.url, /^https:\/\/api.adzuna.com\/v1\/api\/jobs\/fr\/search\/1/);
 assert.equal(a.network[0].request.method, 'GET');
 assert.equal(a.network[0].request.headers.Authorization, undefined);
 a.network[0].completeRaw({ results: [{ id: 'native-adzuna-1', title: 'Responsable conformité', company: { display_name: 'Entreprise fictive' }, location: { display_name: 'Paris' }, created: now, redirect_url: 'https://example.org/job/adzuna', description: 'Description fictive.' }] }); await settle();
 assert.equal(a.stored('vlcb_p1_offers').length, 1);
 assert.equal(a.network.length, 2, 'Adzuna continues through native pacing');
 a.network[1].completeRaw({ results: [] }); await adzuna;
 assert.equal(a.messages.filter(message => message.action === 'wait').length, 2);
 assert.equal(a.messages.find(message => message.action === 'wait').delay, 400);
 assert.equal(a.stored('vlcb_costs').calls, 0, 'Adzuna and native service do not use OpenRouter credits');
 assert.equal(a.stored('vlcb_operation').status, 'complete');
 await a.close();

 a = app({ data: { vlcb_operation: previous } }); await settle();
 const restarted = a.get('#btn-web').onclick(); await settle();
 assert.equal(a.stored('vlcb_operation').status, 'running', 'explicit new job resets previous interruption');
 a.network[0].complete([], 0, 'restart-first'); await settle();
 a.network[1].complete([], 0, 'restart-second'); await restarted;
 assert.equal(a.stored('vlcb_operation').status, 'complete');
 await a.close();

 a = app(); await settle();
 const storageFailure = a.get('#btn-web').onclick(); await settle();
 const setItem = a.w.Storage.prototype.setItem;
 a.w.Storage.prototype.setItem = function(key, value) {
  if (key === 'vlcb_operation') throw new Error('quota atteint');
  return setItem.call(this, key, value);
 };
 a.network[0].complete(found(5), 0.01, 'saved-before-quota');
 await storageFailure;
 assert.equal(a.network.length, 1, 'storage failure stops before another paid request');
 assert.equal(a.run('operationDepth'), 0, 'UI unlocked after persistence failure');
 assert.equal(a.run('activeRun'), null);
 assert.equal(a.run('backgroundRun'), null);
 assert.equal(a.messages.filter(message => message.action === 'end').length, 1, 'foreground service released even when checkpoint write fails');
 await a.close();
 console.log('Matchwork background: service handshake, native transport, hidden document flow, progressive results, notification stop, interrupted recovery, cost deduplication and failure cleanup passed.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
