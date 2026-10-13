// Parcours complet de Mon anglais dans Chromium : node tests/mon-anglais-ui.cjs
// OpenRouter, le micro et la synthèse vocale sont simulés ; aucune connexion externe.
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path");
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const html = fs.readFileSync(path.join(__dirname, "../mon-anglais.html"), "utf8");
const shots = process.env.MON_ANGLAIS_SCREENSHOT_DIR;

const feedback = level => JSON.stringify({level, criteria:{task:4, coherence:3, range:3, accuracy:3}, summary_fr:"Bon texte, quelques erreurs de temps.",
  strengths_fr:["Idées claires"], priorities_fr:["Present perfect", "Articles"],
  errors:[{original:"I have went", correction:"I went", explanation_fr:"Prétérit avec une date passée.", category:"tenses"}, {original:"the life", correction:"life", explanation_fr:"Notion générale sans article.", category:"articles"}],
  improved_version:"An improved text.", vocabulary:[{en:"to look up to", fr:"admirer", example:"I look up to my sister."}]});

async function main(){
  const browser = await chromium.launch({executablePath:process.env.CHROME_EXECUTABLE || undefined});
  const context = await browser.newContext({viewport:{width:1280, height:900}});
  const page = await context.newPage();
  const errors = [], calls = [], unexpected = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  await page.addInitScript(() => {
    window.__spoken = [];
    window.speechSynthesis.speak = u => { window.__spoken.push(u.text); setTimeout(() => u.onend && u.onend(), 5); };
    window.speechSynthesis.cancel = () => {};
    // Micro simulé : renvoie une phrase dès le démarrage
    class FakeRecognition {
      start(){ setTimeout(() => { const r = [{transcript:window.__say || "I think it is a really interesting question because I like travelling a lot", confidence:1}]; r.isFinal = true;
        this.onresult && this.onresult({resultIndex:0, results:[r]}); }, 20); }
      stop(){}
    }
    window.webkitSpeechRecognition = window.SpeechRecognition = FakeRecognition;
  });
  await context.route("**/*", async route => {
    const url = route.request().url();
    if (url === "http://app.test/") return route.fulfill({contentType:"text/html", body:html});
    if (url === "https://openrouter.ai/api/v1/key") return route.fulfill({json:{data:{usage:1.25, limit_remaining:8.75}}});
    if (url === "https://openrouter.ai/api/v1/models") return route.fulfill({json:{data:[{id:"google/gemini-3.8-flash", name:"Gemini Flash", pricing:{prompt:"0.0000003", completion:"0.0000025"}}]}});
    if (url === "https://openrouter.ai/api/v1/chat/completions") {
      const body = JSON.parse(route.request().postData()); calls.push(body);
      assert.equal(route.request().headers().authorization, "Bearer sk-or-test");
      const sys = body.messages[0].content;
      if (body.stream) {
        const parts = body.messages.some(m => m.role === "user" && m.content.includes("more simply")) ? ["Of course. ", "Where did you go?"] : ["Hi! I'm Emma. ", "How are ", "you today? ", "Tell me more."];
        const sse = parts.map(c => "data: " + JSON.stringify({choices:[{delta:{content:c}}]}) + "\n\n").join("") + ": keep-alive\n\ndata: " + JSON.stringify({choices:[{delta:{}}], usage:{cost:0.0004}}) + "\n\ndata: [DONE]\n\n";
        return route.fulfill({status:200, contentType:"text/event-stream", body:sse});
      }
      let content;
      if (sys.includes("role-playing")) content = "That sounds great. What did you enjoy most about it?";
      else if (sys.includes("grammar exercises")) content = JSON.stringify({questions:[{question:"The letter ___ yesterday.", options:["was sent", "sent", "is sent", "has sent"], explanation_fr:"Passif au prétérit."}]});
      else if (sys.includes("speaking examiner")) content = feedback("B1+");
      else if (sys.includes("memory_en")) content = feedback("B1+").replace(/}$/, ',"memory_en":"Works in marketing, likes travel."}');
      else if (sys.includes("reviewing a role-play")) content = feedback("B1");
      else content = "Voici ma correction :\n" + feedback("B2");
      return route.fulfill({json:{model:body.model, choices:[{message:{content}}], usage:{prompt_tokens:1000, completion_tokens:300, cost:0.002}}});
    }
    unexpected.push(url); return route.abort();
  });
  await page.goto("http://app.test/");
  const text = () => page.locator("#view").innerText();

  // Accueil
  assert.match(await text(), /Commence par ton bilan de départ/);
  assert.equal(await page.locator(".block").count(), 5);

  // Réglages : clé, prix et budget
  await page.click('.main-nav a[href="#settings"]');
  await page.fill("#key", "sk-or-test");
  await page.click("#key-check"); await page.waitForSelector("text=Clé valide");
  await page.click("#price"); await page.waitForSelector("text=Estimation pour 1 h par jour");
  assert.match(await page.locator("#price-info").innerText(), /0,30 \$|0\.30 \$/);

  // Bilan : EF SET
  await page.goto("http://app.test/#bilan");
  await page.click("#start-bilan");
  await page.fill("#ef-r", "130"); await page.click("#ef-ok");
  assert.match(await page.locator("#ef-err").innerText(), /entre 0 et 100/);
  await page.fill("#ef-r", "52"); await page.fill("#ef-l", "47"); await page.click("#ef-ok");

  // Bilan : test adaptatif d'un candidat B2 (réussit jusqu'au B2, ne sait pas au-delà)
  for (let i = 0; i < 30; i++) {
    await page.waitForSelector(".q");
    const q = await page.locator(".q").innerText();
    const answer = await page.evaluate(q => { const it = [...PLACEMENT.g, ...PLACEMENT.v].find(x => x[2] === q); return it[1] <= 4 ? it[3][0] : ""; }, q);
    await page.locator(`.opt[data-a="${answer.replace(/"/g, '\\"')}"]`).first().click();
  }

  // Bilan : écrit
  await page.waitForSelector("#w-text");
  await page.click("#w-send"); await page.waitForSelector("text=au moins 60 mots");
  await page.fill("#w-text", "Nowadays many people work from home. ".repeat(30));
  await page.click("#w-send");

  // Bilan : oral (6 questions, micro simulé)
  for (let i = 0; i < 6; i++) {
    await page.waitForSelector("#s-rec");
    if ((await page.locator("#s-rec").innerText()).includes("préparation")) { await page.click("#s-rec"); await page.waitForSelector("text=Je suis prêt"); }
    await page.click("#s-rec");
    await page.waitForFunction(() => document.querySelector("#s-text").value.length > 10);
    await page.click("#s-rec");
    await page.waitForFunction(() => !document.querySelector("#s-next").disabled);
    await page.click("#s-next");
  }
  await page.click("#s-send");
  await page.waitForSelector("text=Résultats du bilan");
  const res = await text();
  for (const re of [/Compréhension écrite[\s\S]*B2/, /Expression écrite[\s\S]*B2/, /Expression orale[\s\S]*B1\+/, /Grammaire[\s\S]*B2/]) assert.match(res, re);
  assert.match(res, /Present perfect/);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("monAnglais.v1")));
  assert.equal(saved.assessment, null); assert.equal(saved.profile.history.length, 1);
  assert.equal(saved.profile.skills.listening.x, 3.6); assert.equal(saved.errors.length, 4);
  const speakingCall = calls.find(c => c.messages[0].content.includes("speaking examiner"));
  assert.match(speakingCall.messages[1].content, /Partie 2/); assert.equal(speakingCall.model, "google/gemini-3.8-flash"); assert.deepEqual(speakingCall.usage, {include:true});
  if (shots) await page.screenshot({path:path.join(shots, "resultats.png"), fullPage:true});

  // Plan du jour adapté
  await page.click('.main-nav a[href="#today"]');
  await page.waitForSelector("text=Plan du jour");
  assert.doesNotMatch(await text(), /Commence par ton bilan/);
  const minutes = await page.$$eval(".block .title .muted", els => els.reduce((a, e) => a + parseInt(e.textContent.replace(/\D/g, ""), 10), 0));
  assert.equal(minutes, 60);
  assert.match(await text(), /Temps verbaux|Articles/);
  if (shots) await page.screenshot({path:path.join(shots, "aujourdhui.png"), fullPage:true});

  // Vocabulaire
  await page.click('.block a[href="#vocab?plan=vocab"]');
  for (let i = 0; i < 3; i++) { await page.click("#flip"); await page.click('[data-g="3"]'); }
  await page.click("#flip"); await page.click('[data-g="1"]');
  let st = await page.evaluate(() => JSON.parse(localStorage.getItem("monAnglais.v1")));
  assert.equal(Object.keys(st.cards).length, 4);
  assert(Object.values(st.cards).some(c => c.lapses === 1));
  while (await page.locator("#flip").count()) { await page.click("#flip"); await page.click('[data-g="4"]'); }
  await page.waitForSelector("text=révision(s) faites");

  // Grammaire, session du plan
  await page.goto("http://app.test/#grammar?plan=grammar&mix=1");
  for (let i = 0; i < 10; i++) {
    const q = await page.locator(".q").innerText();
    const a = await page.evaluate(q => GRAMMAR.find(x => x[3] === q)[4][0], q);
    await page.locator(`.opt[data-a="${a}"]`).click();
    assert.match(await page.locator(".explain").innerText(), /Correct/);
    await page.click("#next");
  }
  await page.waitForSelector("text=10 / 10");
  // Questions générées par l'IA
  await page.goto("http://app.test/#grammar");
  await page.click('[data-gen="passive"]');
  await page.waitForSelector("text=The letter ___ yesterday.");

  // Écoute
  await page.goto("http://app.test/#listen?plan=listening");
  await page.click("#play");
  const sentence = await page.evaluate(() => window.__spoken[window.__spoken.length - 1]);
  await page.fill("#dict", sentence); await page.click("#check");
  assert.match(await page.locator(".explain").innerText(), /100 %/);

  // Écrit quotidien
  await page.goto("http://app.test/#write?plan=writing");
  await page.fill("#w-text", "Last summer I have went to Italy with my friends and the life was beautiful. ".repeat(4));
  await page.click("#w-send"); await page.waitForSelector("text=Corrections (2)");
  await page.click('[data-addword="0"]'); assert.equal(await page.locator('[data-addword="0"]').innerText(), "Ajouté");

  // Oral : conversation puis bilan
  await page.goto("http://app.test/#speak?plan=speaking&s=travel");
  for (const line of ["It was amazing, we went to Portugal.", "The food and the beaches.", "Yes, I would like to go back next year."]) {
    await page.fill("#say", line); await page.click("#send");
    await page.waitForFunction(() => !document.querySelector(".msg.ai.muted") && document.querySelectorAll(".msg.ai").length === document.querySelectorAll(".msg.me").length + 1);
  }
  await page.click("#mic"); await page.waitForFunction(() => document.querySelector("#say").value.length > 5); await page.click("#mic");
  const chatCall = calls.filter(c => c.messages[0].content.includes("role-playing")).pop();
  assert.equal(chatCall.messages[1].role, "assistant");
  await page.click("#end"); await page.waitForSelector("text=Bilan de la conversation");

  st = await page.evaluate(() => JSON.parse(localStorage.getItem("monAnglais.v1")));
  const today = Object.values(st.sessions)[0].done;
  for (const k of ["vocab", "grammar", "writing", "speaking"]) assert.equal(today[k], true, k);
  assert.equal(st.custom.length, 1);
  assert(st.spend[Object.keys(st.spend)[0]] > 0.01);

  // Discussion en direct : écoute, réponse vocale par phrase, réécoute automatique
  await page.evaluate(() => { const s = JSON.parse(localStorage.getItem("monAnglais.v1")); s.settings.pauseMs = 1000; localStorage.setItem("monAnglais.v1", JSON.stringify(s)); });
  await page.goto("http://app.test/#today"); await page.reload();
  await page.click('a.live-cta[href="#live"]');
  await page.click('[data-topic="Travel"]'); await page.click("#lv-start");
  await page.waitForFunction(() => document.querySelectorAll("#lv-log .msg.me").length >= 2, null, {timeout:30000});
  const spoken = await page.evaluate(() => window.__spoken);
  assert(spoken.includes("Hi!") && spoken.includes("I'm Emma.") && spoken.includes("How are you today?") && spoken.includes("Tell me more."), spoken.join(" | "));
  const liveCalls = calls.filter(c => c.stream);
  assert.match(liveCalls[0].messages[0].content, /live voice call[\s\S]*Travel/);
  assert.match(liveCalls[0].messages[1].content, /^\[The learner has just joined/);
  assert.equal(liveCalls[1].messages[2].role, "assistant"); assert.equal(liveCalls[1].messages[3].role, "user");
  assert.equal(await page.locator("#lv-log .msg").first().innerText(), "Hi! I'm Emma. How are you today? Tell me more.");
  await page.waitForSelector('#orb[data-state="listening"]'); await page.click("#lv-simpler");
  await page.waitForSelector("text=Where did you go?");
  await page.click("#lv-subs"); assert.match(await page.locator("#lv-log").innerText(), /texte masqué/);
  await page.waitForFunction(() => document.querySelectorAll("#lv-log .msg.me").length >= 4, null, {timeout:30000});
  await page.click("#lv-end"); await page.waitForSelector("text=Bilan de la discussion");
  st = await page.evaluate(() => JSON.parse(localStorage.getItem("monAnglais.v1")));
  assert.equal(st.liveMemory, "Works in marketing, likes travel."); assert.equal(st.convos[st.convos.length - 1].scenario, "live");
  await page.click("#lv-new");
  assert.match(await text(), /Emma se souvient de toi[\s\S]*Works in marketing/);
  if (shots) { await page.click("#lv-start"); await page.waitForSelector('#orb[data-state="listening"]'); await page.screenshot({path:path.join(shots, "direct.png")}); await page.click("#lv-pause"); }

  // Budget atteint : l'app propose le copier-coller
  await page.evaluate(() => { const s = JSON.parse(localStorage.getItem("monAnglais.v1")); s.settings.budget = 0.01; localStorage.setItem("monAnglais.v1", JSON.stringify(s)); });
  await page.goto("http://app.test/#write"); await page.reload();
  await page.fill("#w-text", "word ".repeat(50)); await page.click("#w-send");
  await page.waitForSelector("text=Budget du mois atteint");
  await page.click("[data-manual]");
  assert.match(await page.locator(".prompt-box").inputValue(), /Reply with ONLY a JSON object/);

  // Mode abonnement : coller la réponse de ChatGPT
  await page.goto("http://app.test/#settings");
  await page.check('[name=mode][value="subscription"]');
  const before = calls.length;
  await page.goto("http://app.test/#write");
  await page.fill("#w-text", "I like very much the music and I go often at concerts with my friends. ".repeat(4));
  await page.click("#w-send");
  await page.fill("#paste-answer", "n'importe quoi"); await page.click("[data-parse]");
  assert.match(await page.locator("[data-err]").innerText(), /illisible/);
  await page.fill("#paste-answer", "Sure! " + feedback("B1")); await page.click("[data-parse]");
  await page.waitForSelector("text=Corrections (2)");
  await page.goto("http://app.test/#speak?s=hotel");
  assert.match(await page.locator(".prompt-box").inputValue(), /feedback please/);
  await page.goto("http://app.test/#live");
  assert.match(await page.locator(".prompt-box").inputValue(), /Emma[\s\S]*memory_en[\s\S]*Works in marketing/);
  assert.equal(calls.length, before, "no API call in subscription mode");

  // Progrès, export sans clé
  await page.goto("http://app.test/#progress");
  assert.match(await text(), /Grammaire par thème/); assert.match(await text(), /Mes dernières erreurs/);
  await page.goto("http://app.test/#settings");
  const [download] = await Promise.all([page.waitForEvent("download"), page.click("#export")]);
  const exported = JSON.parse(fs.readFileSync(await download.path(), "utf8"));
  assert.equal(exported.settings.key, ""); assert.equal(exported.v, 1);

  // Mobile : pas de défilement horizontal, navigation du bas
  await page.setViewportSize({width:390, height:844});
  for (const h of ["#live", "#speak", "#today", "#practice", "#progress", "#settings", "#vocab", "#grammar", "#bilan?result=1"]) {
    await page.goto("http://app.test/" + h);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "no horizontal scroll on " + h);
  }
  assert(await page.locator(".mobile-nav").isVisible());
  if (shots) { await page.goto("http://app.test/#today"); await page.screenshot({path:path.join(shots, "mobile.png"), fullPage:true}); }

  // Le texte venant de l'IA est échappé
  await page.goto("http://app.test/#write");
  await page.fill("#w-text", "word ".repeat(50)); await page.click("#w-send");
  await page.fill("#paste-answer", feedback("B1").replace("Bon texte", '<img src=x onerror=alert(1)>')); await page.click("[data-parse]");
  assert.equal(await page.locator("#w-result img").count(), 0);

  assert.deepEqual(unexpected, []);
  assert.deepEqual(errors, []);
  await browser.close();
  console.log("Mon anglais UI: all tests passed (" + calls.length + " simulated AI calls)");
}
main().catch(e => { console.error(e); process.exit(1); });
