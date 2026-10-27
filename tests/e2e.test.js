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
      assert.match(text, /Kommer senere/i);
      assert.match(text, /Ved/);
      assert.ok(urls.some(u => /products\.json\?t=\d+/.test(u)), 'skal bruke cache-busting');
      const order = await page.locator('.card .card__title').allInnerTexts();
      assert.deepEqual(order, ['Egg', 'Saft', 'Ved', 'Grønnsaker']);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390);
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
      const egg = page.locator('section.acard', { has: page.locator('h2', { hasText: 'Egg' }) });
      await egg.getByRole('button', { name: 'Legg til 6 stk' }).click();
      await egg.getByRole('button', { name: 'Legg til 1 stk' }).click();
      await page.fill('#price-egg-0', '5,5');
      await page.locator('#price-egg-0').dispatchEvent('change');
      const saft = page.locator('section.acard', { has: page.locator('h2', { hasText: 'Saft' }) });
      await saft.locator('.toggle').click();
      await page.waitForTimeout(800);
      assert.equal(gh.puts.length, putsBefore, 'ingen autolagring');
      assert.match(await page.textContent('#pending'), /2 varer endret/);
      assert.equal(await page.isDisabled('#publish'), false);

      await page.click('#publish');
      await page.waitForFunction(() => /Publisert/.test(document.querySelector('#pending').textContent));
      assert.equal(gh.puts.length, putsBefore + 1);
      const put = gh.puts[gh.puts.length - 1];
      assert.equal(put.committer.name, 'Myra lager');
      assert.match(put.message, /Egg 7 stk/);
      const egg2 = gh.data.products.find(p => p.id === 'egg');
      assert.equal(egg2.qty, 7);
      assert.equal(egg2.prices[0].amount, 5.5);
      assert.equal(gh.data.products.find(p => p.id === 'saft').active, true);
      assert.ok(egg2.updatedAt);
      assert.equal(gh.data.products.find(p => p.id === 'ved').updatedAt, seed().products.find(p => p.id === 'ved').updatedAt);
      assert.equal(await page.isDisabled('#publish'), true);
    });

    await t.test('konflikt: henter nyeste versjon og beholder egne endringer', async () => {
      // noen andre publiserer i mellomtiden
      gh.data.products.find(p => p.id === 'ved').qty = 9;
      gh.sha = 'sha-50';
      const egg = page.locator('section.acard', { has: page.locator('h2', { hasText: 'Egg' }) });
      await egg.getByRole('button', { name: 'Trekk fra 1 stk' }).click();
      await page.click('#publish');
      await page.waitForSelector('#admin-error:not([hidden])');
      assert.match(await page.textContent('#admin-error'), /endret av noen andre/i);
      assert.equal(await page.inputValue('#qty-egg'), '6');
      assert.equal(await page.inputValue('#qty-ved'), '9');
      await page.click('#publish');
      await page.waitForFunction(() => /Publisert/.test(document.querySelector('#pending').textContent));
      assert.equal(gh.data.products.find(p => p.id === 'egg').qty, 6);
      assert.equal(gh.data.products.find(p => p.id === 'ved').qty, 9);
    });

    await t.test('Forkast tilbakestiller ulagrede endringer', async () => {
      const egg = page.locator('section.acard', { has: page.locator('h2', { hasText: 'Egg' }) });
      await egg.getByRole('button', { name: 'Legg til 12 stk' }).click();
      assert.equal(await page.inputValue('#qty-egg'), '18');
      await page.click('#discard');
      assert.equal(await page.inputValue('#qty-egg'), '6');
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
