'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../js/core.js');
const gh = require('../js/github.js');

const settings = { owner: 'kilemann', repo: 'myra.io', branch: 'main', path: 'data/products.json' };

function fakeFetch(handler) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init: init || {} });
    const r = await handler(url, init || {}, calls.length);
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      json: async () => r.body
    };
  };
  fn.calls = calls;
  return fn;
}

test('getFile henter og dekoder fila med token', async () => {
  const data = { version: 2, updatedAt: null, categories: [{ id: 'egg', name: 'Egg', items: [{ id: 'egg', name: 'Egg', qty: 3 }] }] };
  const f = fakeFetch(() => ({ status: 200, body: { sha: 'abc', content: core.encodeBase64Utf8(JSON.stringify(data)) } }));
  const c = gh.createClient(Object.assign({ token: 'T', fetch: f }, settings));
  const res = await c.getFile();
  assert.equal(res.sha, 'abc');
  assert.equal(res.data.categories[0].items[0].qty, 3);
  const call = f.calls[0];
  assert.equal(call.url, 'https://api.github.com/repos/kilemann/myra.io/contents/data/products.json?ref=main');
  assert.equal(call.init.headers.Authorization, 'Bearer T');
  assert.equal(call.init.cache, 'no-store');
});

test('putFile sender base64, sha, branch, melding og nøytral committer', async () => {
  const f = fakeFetch(() => ({ status: 200, body: { content: { sha: 'ny-sha' } } }));
  const c = gh.createClient(Object.assign({ token: 'T', fetch: f }, settings));
  const res = await c.putFile('{"a":"ø"}', 'gammel-sha', 'Lager: Egg 5 stk');
  assert.equal(res.sha, 'ny-sha');
  const call = f.calls[0];
  assert.equal(call.init.method, 'PUT');
  assert.equal(call.url, 'https://api.github.com/repos/kilemann/myra.io/contents/data/products.json');
  const body = JSON.parse(call.init.body);
  assert.equal(body.sha, 'gammel-sha');
  assert.equal(body.branch, 'main');
  assert.equal(body.message, 'Lager: Egg 5 stk');
  assert.equal(core.decodeBase64Utf8(body.content), '{"a":"ø"}');
  assert.equal(body.committer.name, 'Myra lager');
  assert.equal(body.author.name, 'Myra lager');
  assert.ok(body.committer.email);
});

test('409 gir konfliktfeil', async () => {
  const f = fakeFetch(() => ({ status: 409, body: { message: 'is at x but expected y' } }));
  const c = gh.createClient(Object.assign({ token: 'T', fetch: f }, settings));
  await assert.rejects(() => c.putFile('{}', 's', 'm'), err => err.code === 'conflict');
});

test('401 og 403 gir tilgangsfeil, 404 gir ikke-funnet', async () => {
  for (const [status, code] of [[401, 'auth'], [403, 'auth'], [404, 'notfound'], [500, 'http']]) {
    const f = fakeFetch(() => ({ status, body: { message: 'x' } }));
    const c = gh.createClient(Object.assign({ token: 'T', fetch: f }, settings));
    await assert.rejects(() => c.getFile(), err => err.code === code, 'status ' + status);
  }
});

test('nettverksfeil gir egen kode', async () => {
  const f = async () => { throw new TypeError('Failed to fetch'); };
  const c = gh.createClient(Object.assign({ token: 'T', fetch: f }, settings));
  await assert.rejects(() => c.getFile(), err => err.code === 'network');
});
