'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../js/core.js');

const cat = (d, id) => d.categories.find(c => c.id === id);
const itm = (d, c, i) => cat(d, c).items.find(x => x.id === i);

const base = () => {
  const d = core.defaultData();
  itm(d, 'egg', 'egg').qty = 24;
  itm(d, 'egg', 'egg').prices[0].amount = 5;
  d.categories.forEach(c => { c.updatedAt = '2026-10-20T10:00:00.000Z'; c.items.forEach(i => { i.updatedAt = '2026-10-20T10:00:00.000Z'; }); });
  return core.normalizeData(d);
};

test('standardoppsettet har riktige kategorier og varer', () => {
  const d = core.defaultData();
  assert.deepEqual(d.categories.map(c => c.id), ['egg', 'saft', 'honning', 'syltetoy', 'baer', 'ved']);
  assert.deepEqual(cat(d, 'egg').items.map(i => i.name), ['Egg', 'Små egg']);
  assert.equal(itm(d, 'egg', 'smaegg').prices.length, 2);
  assert.equal(itm(d, 'honning', 'honning').prices[0].label, 'per boks');
  assert.equal(cat(d, 'syltetoy').items.length, 4);
  assert.ok(cat(d, 'syltetoy').namedItems);
  assert.ok(cat(d, 'syltetoy').items.every(i => i.prices[0].label === 'per glass' && i.name === ''));
  assert.equal(cat(d, 'baer').items.length, 8);
  assert.ok(cat(d, 'baer').items.every(i => i.prices[0].label === 'per hg'));
  assert.equal(cat(d, 'baer').name, 'Bær, frukt og grønnsaker');
  assert.ok(!d.categories.some(c => /grønnsaker/i.test(c.name) && c.id === 'veg'));
});

test('v1-data flyttes over til v2 uten å miste antall, pris og synlighet', () => {
  const v1 = { version: 1, updatedAt: '2026-10-30T12:00:00.000Z', products: [
    { id: 'egg', name: 'Egg', qty: 24, active: true, prices: [{ label: 'per egg', amount: 6 }, { label: 'per brett (12 stk)', amount: 60 }], updatedAt: '2026-10-30T12:00:00.000Z' },
    { id: 'saft', name: 'Saft', qty: 3, active: true, prices: [{ label: 'per flaske', amount: 40 }] },
    { id: 'ved', name: 'Ved', qty: 0, active: false, prices: [{ label: 'per sekk', amount: null }] },
    { id: 'veg', name: 'Grønnsaker', qty: 5, active: true, prices: [] }
  ] };
  const d = core.normalizeData(v1);
  assert.equal(d.version, 2);
  assert.equal(itm(d, 'egg', 'egg').qty, 24);
  assert.deepEqual(itm(d, 'egg', 'egg').prices.map(p => p.amount), [6, 60]);
  assert.equal(itm(d, 'egg', 'egg').updatedAt, '2026-10-30T12:00:00.000Z');
  assert.equal(cat(d, 'egg').active, true);
  assert.equal(itm(d, 'saft', 'saft').qty, 3);
  assert.equal(cat(d, 'saft').active, true);
  assert.equal(itm(d, 'egg', 'smaegg').qty, 0);
  assert.ok(!d.categories.some(c => c.id === 'veg'), 'grønnsaker er fjernet som egen kategori');
});

test('små egg har pris per egg og per brett', () => {
  assert.deepEqual(itm(core.defaultData(), 'egg', 'smaegg').prices.map(p => p.label), ['per egg', 'per brett (12 stk)']);
});

test('nye prisfelt legges til i eksisterende data uten å røre satte priser', () => {
  const old = { version: 2, categories: [{ id: 'egg', name: 'Egg', active: true, items: [
    { id: 'egg', name: 'Egg', qty: 24, prices: [{ label: 'per egg', amount: 6 }, { label: 'per brett (12 stk)', amount: 60 }] },
    { id: 'smaegg', name: 'Små egg', qty: 6, prices: [{ label: 'per egg', amount: 4 }] }
  ] }] };
  const d = core.normalizeData(old);
  assert.deepEqual(itm(d, 'egg', 'smaegg').prices, [{ label: 'per egg', amount: 4 }, { label: 'per brett (12 stk)', amount: null }]);
  assert.equal(itm(d, 'egg', 'egg').prices.length, 2);
  assert.equal(itm(d, 'egg', 'smaegg').qty, 6);
});

test('normalizeData tåler tomt eller ødelagt innhold', () => {
  assert.deepEqual(core.normalizeData(null).categories, []);
  assert.deepEqual(core.normalizeData({ categories: 'nei' }).categories, []);
  const d = core.normalizeData({ categories: [{ id: 'x', items: [{ id: 'a', qty: -3, prices: [{ label: 'p', amount: 'tull' }] }] }] });
  assert.equal(d.categories[0].items[0].qty, 0);
  assert.equal(d.categories[0].items[0].prices[0].amount, null);
});

test('visibleItems skjuler varer uten navn', () => {
  const d = core.defaultData();
  const s = cat(d, 'syltetoy');
  assert.equal(core.visibleItems(s).length, 0);
  s.items[1].name = 'Jordbær';
  assert.deepEqual(core.visibleItems(s).map(i => i.name), ['Jordbær']);
});

test('latestUpdate gir nyeste tidspunkt i kategorien', () => {
  const c = cat(base(), 'egg');
  c.items[1].updatedAt = '2026-10-29T08:00:00.000Z';
  c.items[0].updatedAt = '2026-10-30T09:00:00.000Z';
  assert.equal(core.latestUpdate(c).toISOString(), '2026-10-30T09:00:00.000Z');
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
  assert.equal(core.formatPrice({ label: 'per hg', amount: 12.5 }), '12,5 kr per hg');
  assert.equal(core.formatPrice({ label: 'per glass', amount: null }), 'Pris per glass kommer');
});

test('parseAmount og parseQty', () => {
  assert.equal(core.parseAmount('55,5'), 55.5);
  assert.equal(core.parseAmount(''), null);
  assert.equal(core.parseAmount('abc'), undefined);
  assert.equal(core.parseQty('2 4'), 24);
  assert.equal(core.parseQty(''), 0);
});

test('changedKeys finner endret synlighet, antall, navn og pris', () => {
  const b = base();
  const l = core.clone(b);
  assert.deepEqual(core.changedKeys(b, l), []);
  cat(l, 'honning').active = true;
  itm(l, 'egg', 'smaegg').qty = 10;
  itm(l, 'syltetoy', 'sylt2').name = 'Bringebær';
  itm(l, 'baer', 'bfg1').prices[0].amount = 15;
  assert.deepEqual(core.changedKeys(b, l).sort(),
    ['cat:honning', 'item:baer/bfg1', 'item:egg/smaegg', 'item:syltetoy/sylt2']);
  assert.equal(core.isCategoryChanged(b, l, 'egg'), true);
  assert.equal(core.isCategoryChanged(b, l, 'ved'), false);
  assert.equal(core.isItemChanged(b, l, 'egg', 'egg'), false);
});

test('buildPublish setter nytt tidspunkt kun på det som er endret', () => {
  const b = base();
  const l = core.clone(b);
  itm(l, 'egg', 'smaegg').qty = 6;
  cat(l, 'saft').active = true;
  const now = new Date('2026-10-30T15:00:00.000Z');
  const out = core.buildPublish(b, l, now);
  assert.equal(out.updatedAt, now.toISOString());
  assert.equal(itm(out, 'egg', 'smaegg').updatedAt, now.toISOString());
  assert.equal(itm(out, 'egg', 'egg').updatedAt, '2026-10-20T10:00:00.000Z');
  assert.equal(cat(out, 'saft').updatedAt, now.toISOString());
  assert.equal(cat(out, 'egg').updatedAt, '2026-10-20T10:00:00.000Z');
  const json = JSON.parse(core.serialize(out));
  assert.deepEqual(Object.keys(json), ['version', 'updatedAt', 'categories']);
  assert.equal(json.version, 2);
});

test('rebase legger egne endringer oppå nyere versjon fra GitHub', () => {
  const b = base();
  const local = core.clone(b);
  itm(local, 'egg', 'egg').qty = 12;
  itm(local, 'syltetoy', 'sylt1').name = 'Solbær';
  const remote = core.clone(b);
  itm(remote, 'egg', 'egg').prices[0].amount = 6;
  cat(remote, 'ved').active = true;
  const m = core.rebase(b, local, remote);
  assert.equal(itm(m, 'egg', 'egg').qty, 12);
  assert.equal(itm(m, 'egg', 'egg').prices[0].amount, 6);
  assert.equal(itm(m, 'syltetoy', 'sylt1').name, 'Solbær');
  assert.equal(cat(m, 'ved').active, true);
});

test('commitMessage beskriver endringene kort', () => {
  const b = base();
  const l = core.clone(b);
  itm(l, 'egg', 'smaegg').qty = 30;
  cat(l, 'honning').active = true;
  itm(l, 'syltetoy', 'sylt1').name = 'Jordbær';
  itm(l, 'syltetoy', 'sylt1').prices[0].amount = 50;
  const msg = core.commitMessage(b, l);
  assert.match(msg, /^Lager: /);
  assert.match(msg, /Små egg 30 stk/);
  assert.match(msg, /Honning synlig/);
  assert.match(msg, /Syltetøy: navn «Jordbær»/);
  assert.match(msg, /Jordbær pris/);
});

test('base64 med æøå går begge veier', () => {
  const s = '{"name":"Bær, frukt og grønnsaker – æøå ÆØÅ"}';
  assert.equal(core.decodeBase64Utf8(core.encodeBase64Utf8(s)), s);
  assert.equal(core.decodeBase64Utf8(core.encodeBase64Utf8(s).replace(/(.{10})/g, '$1\n')), s);
});
