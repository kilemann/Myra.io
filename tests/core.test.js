'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../js/core.js');

const base = () => core.normalizeData({
  version: 1,
  updatedAt: '2026-10-20T10:00:00.000Z',
  products: [
    { id: 'saft', sort: 20, name: 'Saft', note: 'Hjemmelaget', unit: 'flasker', qty: 0, active: false,
      prices: [{ label: 'per flaske', amount: null }], updatedAt: '2026-10-20T10:00:00.000Z' },
    { id: 'egg', sort: 10, name: 'Egg', note: 'Ferske egg', unit: 'stk', qty: 24, active: true,
      prices: [{ label: 'per egg', amount: 5 }, { label: 'per brett (12 stk)', amount: 55 }],
      updatedAt: '2026-10-20T10:00:00.000Z' }
  ]
});

test('normalizeData sorterer etter sort og retter opp ugyldige verdier', () => {
  const d = core.normalizeData({ products: [
    { id: 'b', sort: 2, name: 'B', qty: -4, active: 'ja', prices: [{ label: 'x', amount: 'tull' }] },
    { id: 'a', sort: 1, name: 'A', qty: '7' }
  ] });
  assert.deepEqual(d.products.map(p => p.id), ['a', 'b']);
  assert.equal(d.products[0].qty, 7);
  assert.equal(d.products[1].qty, 0);
  assert.equal(d.products[1].active, true);
  assert.equal(d.products[1].prices[0].amount, null);
  assert.deepEqual(d.products[0].prices, []);
  assert.equal(d.version, 1);
});

test('normalizeData tåler tomt eller ødelagt innhold', () => {
  assert.deepEqual(core.normalizeData(null).products, []);
  assert.deepEqual(core.normalizeData({ products: 'nei' }).products, []);
});

test('stockStatus', () => {
  assert.equal(core.stockStatus(0).text, 'Utsolgt');
  assert.equal(core.stockStatus(11).text, 'Få igjen');
  assert.equal(core.stockStatus(12).text, 'På lager');
});

test('formatUpdated: i dag, i går, dato og annet år', () => {
  const now = new Date(2026, 9, 27, 16, 0);
  assert.equal(core.formatUpdated(new Date(2026, 9, 27, 9, 5), now), 'Oppdatert i dag kl. 09:05');
  assert.equal(core.formatUpdated(new Date(2026, 9, 26, 18, 30), now), 'Oppdatert i går kl. 18:30');
  assert.equal(core.formatUpdated(new Date(2026, 9, 12, 7, 0), now), 'Oppdatert 12. okt. kl. 07:00');
  assert.equal(core.formatUpdated(new Date(2025, 4, 3, 7, 0), now), 'Oppdatert 3. mai 2025 kl. 07:00');
});

test('formatPrice bruker norsk desimalkomma og tom pris', () => {
  assert.equal(core.formatPrice({ label: 'per egg', amount: 5 }), '5 kr per egg');
  assert.equal(core.formatPrice({ label: 'per brett', amount: 55.5 }), '55,5 kr per brett');
  assert.equal(core.formatPrice({ label: 'per flaske', amount: null }), 'Pris per flaske kommer');
});

test('parseAmount godtar komma og punktum, avviser tull', () => {
  assert.equal(core.parseAmount('55,5'), 55.5);
  assert.equal(core.parseAmount(' 12.25 '), 12.25);
  assert.equal(core.parseAmount('1 000'), 1000);
  assert.equal(core.parseAmount(''), null);
  assert.equal(core.parseAmount('abc'), undefined);
  assert.equal(core.parseAmount('-3'), undefined);
});

test('parseQty gir heltall >= 0', () => {
  assert.equal(core.parseQty('24'), 24);
  assert.equal(core.parseQty('2 4'), 24);
  assert.equal(core.parseQty(''), 0);
  assert.equal(core.parseQty('-5'), 5);
});

test('changedIds finner bare varer med endret antall, synlighet eller pris', () => {
  const b = base();
  const l = core.clone(b);
  assert.deepEqual(core.changedIds(b, l), []);
  l.products.find(p => p.id === 'egg').qty = 30;
  l.products.find(p => p.id === 'saft').prices[0].amount = 40;
  assert.deepEqual(core.changedIds(b, l).sort(), ['egg', 'saft']);
});

test('buildPublish setter nytt tidspunkt kun på endrede varer', () => {
  const b = base();
  const l = core.clone(b);
  l.products.find(p => p.id === 'saft').active = true;
  const now = new Date('2026-10-27T15:00:00.000Z');
  const out = core.buildPublish(b, l, now);
  assert.equal(out.updatedAt, now.toISOString());
  assert.equal(out.products.find(p => p.id === 'saft').updatedAt, now.toISOString());
  assert.equal(out.products.find(p => p.id === 'egg').updatedAt, '2026-10-20T10:00:00.000Z');
  // serialiserbart og uten interne felt
  const json = JSON.parse(core.serialize(out));
  assert.deepEqual(Object.keys(json), ['version', 'updatedAt', 'products']);
  assert.equal(json.products[0].id, 'egg');
});

test('rebase legger egne endringer oppå nyere versjon fra GitHub', () => {
  const b = base();
  const local = core.clone(b);
  local.products.find(p => p.id === 'egg').qty = 12;              // vår endring
  const remote = core.clone(b);
  remote.products.find(p => p.id === 'saft').qty = 6;             // noen andres endring
  remote.products.find(p => p.id === 'egg').prices[0].amount = 6; // noen andres endring
  const merged = core.rebase(b, local, remote);
  assert.equal(merged.products.find(p => p.id === 'egg').qty, 12);
  assert.equal(merged.products.find(p => p.id === 'egg').prices[0].amount, 6);
  assert.equal(merged.products.find(p => p.id === 'saft').qty, 6);
});

test('commitMessage beskriver endringene kort', () => {
  const b = base();
  const l = core.clone(b);
  l.products.find(p => p.id === 'egg').qty = 30;
  l.products.find(p => p.id === 'saft').active = true;
  l.products.find(p => p.id === 'saft').prices[0].amount = 45;
  const msg = core.commitMessage(b, l);
  assert.match(msg, /^Lager: /);
  assert.match(msg, /Egg 30 stk/);
  assert.match(msg, /Saft synlig/);
  assert.match(msg, /Saft pris/);
});

test('base64 med æøå går begge veier', () => {
  const s = '{"name":"Grønnsaker – æøå ÆØÅ"}';
  const b64 = core.encodeBase64Utf8(s);
  assert.equal(core.decodeBase64Utf8(b64), s);
  // GitHub leverer base64 med linjeskift
  assert.equal(core.decodeBase64Utf8(b64.replace(/(.{10})/g, '$1\n')), s);
});
