'use strict';
/*
 * Ende-til-ende-test i ekte nettleser (Playwright) mot en falsk GitHub.
 * Kjøres med: node --test tests/e2e.test.js   (hoppes over hvis Playwright mangler)
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const core = require('../js/core.js');

let playwright = null;
try { playwright = require('playwright'); } catch (e) { /* ikke installert */ }

const ROOT = path.join(__dirname, '..');
const TOKEN = 'github_pat_E2E_TEST_TOKEN';
const PASSWORD = 'test-passord-123';
const API = 'https://api.github.com/repos/kilemann/myra.io/contents/data/products.json';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };

function serve() {
  return new Promise(resolve => {
    const srv = http.createServer((req, res) => {
      const p = decodeURIComponent(req.url.split('?')[0]);
      const file = path.join(ROOT, p === '/' ? 'index.html' : p);
      if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
      fs.createReadStream(file).pipe(res);
    });
    srv.listen(0, () => resolve(srv));
  });
}

function fakeGitHub(initial) {
  const state = { data: core.clone(initial), sha: 'sha-1', puts: [], getCount: 0, failNextPut: null, auths: [] };
  state.handler = async route => {
    const req = route.request();
    state.auths.push(req.headers()['authorization']);
    if (req.headers()['authorization'] !== 'Bearer ' + TOKEN) {
      return route.fulfill({ status: 401, contentType: 'application/json', body: '{"message":"Bad credentials"}' });
    }
    if (req.method() === 'GET') {
      state.getCount++;
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ sha: state.sha, content: core.encodeBase64Utf8(core.serialize(state.data)) }) });
    }
    if (req.method() === 'PUT') {
      const body = JSON.parse(req.postData());
      state.puts.push(body);
      if (state.failNextPut) {
        const f = state.failNextPut; state.failNextPut = null;
        return route.fulfill({ status: f, contentType: 'application/json', body: '{"message":"conflict"}' });
      }
      if (body.sha !== state.sha) return route.fulfill({ status: 409, contentType: 'application/json', body: '{"message":"sha mismatch"}' });
      state.data = JSON.parse(core.decodeBase64Utf8(body.content));
      state.sha = 'sha-' + (Number(state.sha.split('-')[1]) + 1);
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: { sha: state.sha } }) });
    }
    return route.fulfill({ status: 405, body: '' });
  };
  return state;
}

// Fast testdata – uavhengig av hva som faktisk ligger i data/products.json
const FIXTURE = path.join(__dirname, 'fixtures/products.json');
const seed = () => JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
const catOf = (d, c) => d.categories.find(x => x.id === c);
const itemOf = (d, c, i) => catOf(d, c).items.find(x => x.id === i);

test('kunde- og admin-flyt', { skip: !playwright && 'Playwright er ikke installert' }, async t => {
  const srv = await serve();
  const base = 'http://localhost:' + srv.address().port + '/';
  const browser = await playwright.chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  const gh = fakeGitHub(seed());
  await ctx.route(API + '**', gh.handler);
  await ctx.route(/^http:\/\/localhost:\d+\/data\/products\.json/, r => r.fulfill({ status: 200, contentType: 'application/json', body: fs.readFileSync(FIXTURE, 'utf8') }));
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));

  try {
    await t.test('kundesiden viser varer fra datafila og henter uten cache', async () => {
      const urls = [];
      page.on('request', r => { if (r.url().includes('products.json')) urls.push(r.url()); });
      await page.goto(base + 'index.html');
      await page.waitForSelector('.card');
      const text = await page.locator('#products').innerText();
      assert.match(text, /Egg/);
      assert.match(text, /Små egg/);
      assert.match(text, /Kommer senere/i);
      assert.match(text, /Ved/);
      assert.doesNotMatch(text, /^Grønnsaker$/m);
      assert.ok(urls.some(u => /products\.json\?t=\d+/.test(u)), 'skal bruke cache-busting');
      const order = await page.locator('.card .card__title').allInnerTexts();
      assert.deepEqual(order, ['Egg', 'Saft', 'Honning', 'Syltetøy', 'Bær, frukt og grønnsaker', 'Ved']);
      const eggCard = await page.locator('.card[data-category="egg"]').innerText();
      assert.match(eggCard, /Små egg[\s\S]*Pris per egg kommer/);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390);
    });

    await t.test('kundesiden viser Myra-logoen i toppen og som fane-ikon', async () => {
      const logo = page.locator('header.brand img.brand__logo');
      assert.equal(await logo.count(), 1);
      assert.equal(await logo.getAttribute('src'), 'img/logo.svg');
      assert.match(await logo.getAttribute('alt'), /Myra/);
      const loaded = await logo.evaluate(img => img.complete && img.naturalWidth > 0);
      assert.ok(loaded, 'logo.svg skal laste');
      const box = await logo.boundingBox();
      assert.ok(box.width >= 56 && box.width <= 100, 'fornuftig størrelse på mobil: ' + box.width);
      assert.equal(await page.getAttribute('link[rel="icon"]', 'href'), 'img/logo.svg');
      assert.equal(await page.getAttribute('link[rel="apple-touch-icon"]', 'href'), 'img/logo-180.png');
      const res = await page.request.get(base + 'img/logo-180.png');
      assert.equal(res.status(), 200);
    });

    await t.test('kundesiden har ingen lenke til admin-siden', async () => {
      assert.equal(await page.locator('a[href*="admin"]').count(), 0);
      assert.doesNotMatch(await page.locator('body').innerText(), /Oppdater lager/i);
    });

    await t.test('første gang: oppsett lagrer nøkkelen kryptert', async () => {
      await page.goto(base + 'admin.html');
      await page.waitForSelector('#setup:not([hidden])');
      await page.fill('#setup-username', 'Myra');
      await page.fill('#setup-token', TOKEN);
      await page.fill('#setup-password', PASSWORD);
      await page.fill('#setup-password2', 'noe-annet');
      await page.click('#setup-btn');
      await page.waitForSelector('#setup-error:not([hidden])');
      assert.match(await page.textContent('#setup-error'), /passordene/i);
      await page.fill('#setup-password2', PASSWORD);
      await page.click('#setup-btn');
      await page.waitForSelector('#admin:not([hidden])', { timeout: 20000 });
      const stored = await page.evaluate(() => JSON.stringify(localStorage));
      assert.ok(!stored.includes(TOKEN), 'tokenet skal ikke ligge i klartekst');
      assert.ok(stored.includes('myra-vault-v1'));
    });

    await t.test('etter omlasting kreves innlogging; feil passord avvises', async () => {
      await page.reload();
      await page.waitForSelector('#login:not([hidden])');
      await page.fill('#username', 'Myra');
      await page.fill('#password', 'feil');
      await page.click('#login-btn');
      await page.waitForSelector('#login-error:not([hidden])', { timeout: 20000 });
      assert.match(await page.textContent('#login-error'), /feil brukernavn eller passord/i);
      await page.fill('#username', 'Ola');
      await page.fill('#password', PASSWORD);
      await page.click('#login-btn');
      await page.waitForSelector('#login-error:not([hidden])');
      assert.equal(await page.isVisible('#admin'), false);
      await page.fill('#username', 'myra');
      await page.click('#login-btn');
      await page.waitForSelector('#admin:not([hidden])', { timeout: 20000 });
    });

    await t.test('endringer publiseres først når selger trykker Publiser', async () => {
      const putsBefore = gh.puts.length;
      assert.equal(await page.isDisabled('#publish'), true);
      const egg = page.locator('section.acard[data-category="egg"] .aitem[data-item="egg"]');
      await egg.getByRole('button', { name: 'Legg til 6 stk – Egg' }).click();
      await egg.getByRole('button', { name: 'Legg til 1 stk – Egg' }).click();
      await page.fill('#price-egg-egg-0', '5,5');
      await page.locator('#price-egg-egg-0').dispatchEvent('change');
      const small = page.locator('section.acard[data-category="egg"] .aitem[data-item="smaegg"]');
      await small.getByRole('button', { name: 'Legg til 12 stk – Små egg' }).click();
      await page.fill('#price-egg-smaegg-0', '4');
      await page.locator('#price-egg-smaegg-0').dispatchEvent('change');
      await page.locator('section.acard[data-category="saft"] .toggle').click();
      await page.waitForTimeout(800);
      assert.equal(gh.puts.length, putsBefore, 'ingen autolagring');
      assert.match(await page.textContent('#pending'), /3 endringer/);
      assert.equal(await page.isDisabled('#publish'), false);

      await page.click('#publish');
      await page.waitForFunction(() => /Publisert/.test(document.querySelector('#pending').textContent));
      assert.equal(gh.puts.length, putsBefore + 1);
      const put = gh.puts[gh.puts.length - 1];
      assert.equal(put.committer.name, 'Myra lager');
      assert.match(put.message, /Egg 7 stk/);
      assert.match(put.message, /Små egg 12 stk/);
      assert.equal(gh.data.version, 2);
      const egg2 = itemOf(gh.data, 'egg', 'egg');
      assert.equal(egg2.qty, 7);
      assert.equal(egg2.prices[0].amount, 5.5);
      assert.equal(itemOf(gh.data, 'egg', 'smaegg').qty, 12);
      assert.equal(itemOf(gh.data, 'egg', 'smaegg').prices[0].amount, 4);
      assert.equal(catOf(gh.data, 'saft').active, true);
      assert.notEqual(egg2.updatedAt, itemOf(seed(), 'egg', 'egg').updatedAt);
      assert.equal(itemOf(gh.data, 'ved', 'ved').updatedAt, itemOf(seed(), 'ved', 'ved').updatedAt);
      assert.equal(await page.isDisabled('#publish'), true);
    });

    await t.test('syltetøy og bær: selger setter navn og pris, og slår på kategorien', async () => {
      const sylt = page.locator('section.acard[data-category="syltetoy"]');
      await sylt.locator('summary').click();
      await page.fill('#name-syltetoy-sylt1', 'Jordbærsyltetøy');
      await page.locator('#name-syltetoy-sylt1').dispatchEvent('change');
      await page.fill('#qty-syltetoy-sylt1', '5');
      await page.locator('#qty-syltetoy-sylt1').dispatchEvent('change');
      await page.fill('#price-syltetoy-sylt1-0', '60');
      await page.locator('#price-syltetoy-sylt1-0').dispatchEvent('change');
      await sylt.locator('.toggle').click();
      assert.equal(await sylt.locator('.aitem[data-item="sylt1"] .aitem__title').innerText(), 'Jordbærsyltetøy');

      const baer = page.locator('section.acard[data-category="baer"]');
      await baer.locator('summary').click();
      assert.equal(await baer.locator('.aitem').count(), 8);
      assert.equal(await page.inputValue('#name-baer-bfg3'), '');
      await page.fill('#name-baer-bfg3', 'Poteter');
      await page.locator('#name-baer-bfg3').dispatchEvent('change');
      await page.fill('#price-baer-bfg3-0', '3,5');
      await page.locator('#price-baer-bfg3-0').dispatchEvent('change');
      assert.match(await baer.locator('label[for="price-baer-bfg3-0"]').innerText(), /per hg/);

      await page.click('#publish');
      await page.waitForFunction(() => /Publisert/.test(document.querySelector('#pending').textContent));
      const s1 = itemOf(gh.data, 'syltetoy', 'sylt1');
      assert.equal(s1.name, 'Jordbærsyltetøy');
      assert.equal(s1.qty, 5);
      assert.equal(s1.prices[0].amount, 60);
      assert.equal(catOf(gh.data, 'syltetoy').active, true);
      assert.equal(itemOf(gh.data, 'baer', 'bfg3').name, 'Poteter');
      assert.equal(itemOf(gh.data, 'baer', 'bfg3').prices[0].amount, 3.5);
      assert.equal(catOf(gh.data, 'baer').active, false);
    });

    await t.test('konflikt: henter nyeste versjon og beholder egne endringer', async () => {
      // noen andre publiserer i mellomtiden
      itemOf(gh.data, 'ved', 'ved').qty = 9;
      gh.sha = 'sha-50';
      const egg = page.locator('section.acard[data-category="egg"] .aitem[data-item="egg"]');
      await egg.getByRole('button', { name: 'Trekk fra 1 stk – Egg' }).click();
      await page.click('#publish');
      await page.waitForSelector('#admin-error:not([hidden])');
      assert.match(await page.textContent('#admin-error'), /endret av noen andre/i);
      assert.equal(await page.inputValue('#qty-egg-egg'), '6');
      assert.equal(await page.inputValue('#qty-ved-ved'), '9');
      await page.click('#publish');
      await page.waitForFunction(() => /Publisert/.test(document.querySelector('#pending').textContent));
      assert.equal(itemOf(gh.data, 'egg', 'egg').qty, 6);
      assert.equal(itemOf(gh.data, 'ved', 'ved').qty, 9);
    });

    await t.test('Forkast tilbakestiller ulagrede endringer', async () => {
      const egg = page.locator('section.acard[data-category="egg"] .aitem[data-item="egg"]');
      await egg.getByRole('button', { name: 'Legg til 12 stk – Egg' }).click();
      assert.equal(await page.inputValue('#qty-egg-egg'), '18');
      await page.click('#discard');
      assert.equal(await page.inputValue('#qty-egg-egg'), '6');
      assert.equal(await page.isDisabled('#publish'), true);
    });

    await t.test('Glem denne enheten sletter nøkkelen', async () => {
      await page.click('#forget');
      assert.match(await page.textContent('#forget'), /bekreft/i, 'krever et ekstra trykk');
      assert.equal(await page.isVisible('#admin'), true);
      await page.click('#forget');
      await page.waitForSelector('#setup:not([hidden])');
      const stored = await page.evaluate(() => localStorage.getItem('myra-vault-v1'));
      assert.equal(stored, null);
    });

    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    srv.close();
  }
});
