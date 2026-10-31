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
  assert.equal(d.version, 4);
  assert.deepEqual(d.categories.map(c => c.id), ['egg', 'saft', 'honning', 'syltetoy', 'baer', 'ved']);
  assert.deepEqual(cat(d, 'egg').items.map(i => i.name), ['Egg', 'Små egg']);
  assert.equal(itm(d, 'egg', 'smaegg').prices.length, 2);
  assert.deepEqual(cat(d, 'saft').items.map(i => i.name), ['Bærsaft', 'Solbærsaft', 'Aroniasaft', 'Ripssaft']);
  assert.deepEqual(cat(d, 'saft').prices, [{ label: 'per flaske', amount: null }]);
  assert.ok(cat(d, 'saft').items.every(i => i.prices.length === 0 && i.unit === 'flasker'));
  assert.deepEqual(cat(d, 'syltetoy').items.map(i => i.name),
    ['Bringebærsyltetøy', 'Jordbærsyltetøy', 'Bjørnebærsyltetøy', 'Blåbærsyltetøy']);
  assert.equal(cat(d, 'syltetoy').namedItems, false);
  assert.deepEqual(cat(d, 'syltetoy').prices, [{ label: 'per glass', amount: null }]);
  assert.deepEqual(cat(d, 'honning').items.map(i => [i.name, i.prices[0].label]),
    [['Flytende honning', 'per boks'], ['Sommerhonning', 'per 500 g'], ['Lynghonning', 'per 500 g']]);
  assert.equal(cat(d, 'baer').items.length, 8);
  assert.ok(cat(d, 'baer').namedItems);
  assert.ok(cat(d, 'baer').items.every(i => i.prices[0].label === 'per hg'));
});

test('ved har fire typer med hver sin pris per sekk', () => {
  const d = core.defaultData();
  const ved = cat(d, 'ved');
  assert.deepEqual(ved.items.map(i => [i.id, i.name, i.unit]),
    [['bjork', 'Bjørk', 'sekker'], ['eik', 'Eik', 'sekker'], ['furu', 'Furu', 'sekker'], ['gran', 'Gran', 'sekker']]);
  assert.ok(ved.items.every(i => i.prices.length === 1 && i.prices[0].label === 'per sekk'));
  assert.deepEqual(ved.prices, [], 'ingen felles pris – hver type har sin egen');
});

test('v3-data: ved deles i fire typer, synlighet beholdes, resten urørt', () => {
  const v3 = core.defaultData();
  v3.version = 3;
  const old = v3.categories.find(c => c.id === 'ved');
  old.active = true;
  old.updatedAt = '2026-10-30T19:41:40.556Z';
  old.items = [{ id: 'ved', name: 'Ved', unit: 'sekker', qty: 1, prices: [{ label: 'per sekk', amount: null }] }];
  v3.categories.find(c => c.id === 'egg').items[0].qty = 24;
  v3.categories.find(c => c.id === 'syltetoy').items[0].qty = 1;
  const d = core.normalizeData(v3);
  assert.equal(d.version, 4);
  assert.deepEqual(cat(d, 'ved').items.map(i => i.name), ['Bjørk', 'Eik', 'Furu', 'Gran']);
  assert.ok(cat(d, 'ved').items.every(i => i.qty === 0));
  assert.equal(cat(d, 'ved').active, true);
  assert.equal(cat(d, 'ved').updatedAt, '2026-10-30T19:41:40.556Z');
  assert.equal(itm(d, 'egg', 'egg').qty, 24);
  assert.equal(itm(d, 'syltetoy', 'bringebaer').qty, 1);
  // stabilt: å normalisere på nytt endrer ingenting
  assert.deepEqual(core.normalizeData(JSON.parse(core.serialize(d))), d);
});

test('v2-data flyttes til v3: faste navn, felles pris og honning delt i tre', () => {
  const v2 = { version: 2, updatedAt: '2026-10-30T12:00:00.000Z', categories: [
    { id: 'egg', name: 'Egg', active: true, items: [
      { id: 'egg', name: 'Egg', unit: 'stk', qty: 24, prices: [{ label: 'per egg', amount: 6 }, { label: 'per brett (12 stk)', amount: 60 }] },
      { id: 'smaegg', name: 'Små egg', unit: 'stk', qty: 6, prices: [{ label: 'per egg', amount: 4 }, { label: 'per brett (12 stk)', amount: 45 }] }] },
    { id: 'saft', name: 'Saft', active: true, updatedAt: '2026-10-29T10:00:00.000Z',
      items: [{ id: 'saft', name: 'Saft', unit: 'flasker', qty: 3, prices: [{ label: 'per flaske', amount: 40 }] }] },
    { id: 'honning', name: 'Honning', active: true,
      items: [{ id: 'honning', name: 'Honning', unit: 'bokser', qty: 7, prices: [{ label: 'per boks', amount: 120 }] }] },
    { id: 'syltetoy', name: 'Syltetøy', namedItems: true, active: false, items: [
      { id: 'sylt1', name: 'Jordbær', unit: 'glass', qty: 5, prices: [{ label: 'per glass', amount: 60 }] },
      { id: 'sylt2', name: '', unit: 'glass', qty: 0, prices: [{ label: 'per glass', amount: null }] }] },
    { id: 'baer', name: 'Bær, frukt og grønnsaker', namedItems: true, active: true, items: [
      { id: 'bfg1', name: 'Poteter', unit: 'hg', qty: 80, prices: [{ label: 'per hg', amount: 3.5 }] }] },
    { id: 'ved', name: 'Ved', active: false, items: [{ id: 'ved', name: 'Ved', unit: 'sekker', qty: 1, prices: [{ label: 'per sekk', amount: null }] }] }
  ] };
  const d = core.normalizeData(v2);
  assert.equal(d.version, 4);
  assert.equal(itm(d, 'egg', 'egg').qty, 24);
  assert.deepEqual(itm(d, 'egg', 'smaegg').prices.map(p => p.amount), [4, 45]);
  assert.equal(cat(d, 'saft').active, true);
  assert.equal(cat(d, 'saft').updatedAt, '2026-10-29T10:00:00.000Z');
  assert.equal(cat(d, 'saft').prices[0].amount, 40);
  assert.equal(cat(d, 'saft').items.length, 4);
  assert.equal(itm(d, 'honning', 'flytende').qty, 7);
  assert.equal(itm(d, 'honning', 'flytende').prices[0].amount, 120);
  assert.equal(itm(d, 'honning', 'sommer').qty, 0);
  assert.equal(cat(d, 'syltetoy').prices[0].amount, 60);
  assert.equal(itm(d, 'syltetoy', 'jordbaer').qty, 5, '«Jordbær» passer Jordbærsyltetøy');
  assert.equal(itm(d, 'syltetoy', 'bringebaer').qty, 0);
  assert.equal(itm(d, 'baer', 'bfg1').name, 'Poteter');
  assert.equal(itm(d, 'baer', 'bfg1').qty, 80);
  assert.deepEqual(cat(d, 'ved').items.map(i => i.name), ['Bjørk', 'Eik', 'Furu', 'Gran']);
  // kjøres ikke på nytt når data allerede er v3
  const again = core.normalizeData(JSON.parse(core.serialize(d)));
  assert.deepEqual(again, d);
});

test('v1-data flyttes til nyeste format uten å miste egg, pris og synlighet', () => {
  const v1 = { version: 1, updatedAt: '2026-10-30T12:00:00.000Z', products: [
    { id: 'egg', name: 'Egg', qty: 24, active: true, prices: [{ label: 'per egg', amount: 6 }, { label: 'per brett (12 stk)', amount: 60 }], updatedAt: '2026-10-30T12:00:00.000Z' },
    { id: 'saft', name: 'Saft', qty: 3, active: true, prices: [{ label: 'per flaske', amount: 40 }] },
    { id: 'ved', name: 'Ved', qty: 0, active: false, prices: [{ label: 'per sekk', amount: null }] },
    { id: 'veg', name: 'Grønnsaker', qty: 5, active: true, prices: [] }
  ] };
  const d = core.normalizeData(v1);
  assert.equal(d.version, 4);
  assert.equal(itm(d, 'egg', 'egg').qty, 24);
  assert.deepEqual(itm(d, 'egg', 'egg').prices.map(p => p.amount), [6, 60]);
  assert.equal(itm(d, 'egg', 'egg').updatedAt, '2026-10-30T12:00:00.000Z');
  assert.equal(cat(d, 'egg').active, true);
  assert.equal(cat(d, 'saft').prices[0].amount, 40, 'saftprisen blir felles pris');
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
  const s = cat(d, 'baer');
  assert.equal(core.visibleItems(s).length, 0);
  s.items[1].name = 'Jordbær';
  assert.deepEqual(core.visibleItems(s).map(i => i.name), ['Jordbær']);
  assert.equal(core.visibleItems(cat(d, 'saft')).length, 4);
});

test('rekkefølge for kunder: egg øverst når det er på lager', () => {
  const d = core.defaultData();
  ['saft', 'honning', 'syltetoy'].forEach(id => { cat(d, id).active = true; });
  itm(d, 'egg', 'smaegg').qty = 2;            // bare små egg igjen – egg er ikke utsolgt
  itm(d, 'saft', 'ripssaft').qty = 3;
  itm(d, 'honning', 'lyng').qty = 1;
  const o = core.orderForCustomers(d);
  assert.deepEqual(o.inStock.map(x => x.cat.id), ['egg', 'saft', 'honning']);
  assert.deepEqual(o.soldOut.map(x => x.cat.id), ['syltetoy']);
  assert.deepEqual(o.coming.map(c => c.id), ['baer', 'ved']);
});

test('rekkefølge for kunder: helt utsolgte kategorier havner sist, også egg', () => {
  const d = core.defaultData();
  ['saft', 'honning', 'ved'].forEach(id => { cat(d, id).active = true; });
  itm(d, 'honning', 'flytende').qty = 4;
  itm(d, 'ved', 'eik').qty = 2;
  // egg: begge typer 0; saft: alle fire typer 0
  const o = core.orderForCustomers(d);
  assert.deepEqual(o.inStock.map(x => x.cat.id), ['honning', 'ved']);
  assert.deepEqual(o.soldOut.map(x => x.cat.id), ['egg', 'saft']);
});

test('rekkefølge for kunder: én type igjen holder kategorien oppe; varer uten navn teller ikke', () => {
  const d = core.defaultData();
  cat(d, 'saft').active = true;
  cat(d, 'baer').active = true;
  itm(d, 'saft', 'aroniasaft').qty = 1;
  itm(d, 'baer', 'bfg2').qty = 50;        // har antall, men ikke navn – vises ikke
  itm(d, 'baer', 'bfg1').name = 'Poteter'; // har navn, men 0
  const o = core.orderForCustomers(d);
  assert.ok(o.inStock.some(x => x.cat.id === 'saft'));
  assert.ok(o.soldOut.some(x => x.cat.id === 'baer'));
});

test('latestUpdate gir nyeste tidspunkt i kategorien', () => {
  const c = cat(base(), 'egg');
  c.items[1].updatedAt = '2026-10-29T08:00:00.000Z';
  c.items[0].updatedAt = '2026-10-30T09:00:00.000Z';
  assert.equal(core.latestUpdate(c).toISOString(), '2026-10-30T09:00:00.000Z');
});

test('unitFor: entall ved 1, flertall ellers', () => {
  assert.equal(core.unitFor('flasker', 1), 'flaske');
  assert.equal(core.unitFor('flasker', 2), 'flasker');
  assert.equal(core.unitFor('flasker', 0), 'flasker');
  assert.equal(core.unitFor('bokser', 1), 'boks');
  assert.equal(core.unitFor('sekker', 1), 'sekk');
  assert.equal(core.unitFor('sekker', 5), 'sekker');
  assert.equal(core.unitFor('stk', 1), 'stk');
  assert.equal(core.unitFor('glass', 1), 'glass');
  assert.equal(core.unitFor('hg', 1), 'hg');
});

test('commitMessage bruker entall ved 1', () => {
  const b = core.defaultData();
  const l = core.clone(b);
  itm(l, 'saft', 'baersaft').qty = 1;
  itm(l, 'honning', 'flytende').qty = 1;
  itm(l, 'ved', 'gran').qty = 2;
  const msg = core.commitMessage(b, l);
  assert.match(msg, /Bærsaft 1 flaske(,|$)/);
  assert.match(msg, /Flytende honning 1 boks(,|$)/);
  assert.match(msg, /Gran 2 sekker/);
});

test('stockStatus', () => {
  assert.equal(core.stockStatus(0).text, 'Midlertidig utsolgt');
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
  itm(l, 'baer', 'bfg2').name = 'Bringebær';
  itm(l, 'baer', 'bfg1').prices[0].amount = 15;
  cat(l, 'saft').prices[0].amount = 45;
  assert.deepEqual(core.changedKeys(b, l).sort(),
    ['cat:honning', 'catprice:saft', 'item:baer/bfg1', 'item:baer/bfg2', 'item:egg/smaegg']);
  assert.equal(core.isCategoryChanged(b, l, 'saft'), true);
  assert.equal(core.isCategoryChanged(b, l, 'egg'), true);
  assert.equal(core.isCategoryChanged(b, l, 'ved'), false);
  assert.equal(core.isItemChanged(b, l, 'egg', 'egg'), false);
});

test('buildPublish setter nytt tidspunkt kun på det som er endret', () => {
  const b = base();
  const l = core.clone(b);
  itm(l, 'egg', 'smaegg').qty = 6;
  cat(l, 'saft').active = true;
  cat(l, 'syltetoy').prices[0].amount = 60;
  const now = new Date('2026-10-30T15:00:00.000Z');
  const out = core.buildPublish(b, l, now);
  assert.equal(out.updatedAt, now.toISOString());
  assert.equal(itm(out, 'egg', 'smaegg').updatedAt, now.toISOString());
  assert.equal(itm(out, 'egg', 'egg').updatedAt, '2026-10-20T10:00:00.000Z');
  assert.equal(cat(out, 'saft').updatedAt, now.toISOString());
  assert.equal(cat(out, 'egg').updatedAt, '2026-10-20T10:00:00.000Z');
  assert.equal(cat(out, 'syltetoy').updatedAt, now.toISOString());
  const json = JSON.parse(core.serialize(out));
  assert.deepEqual(Object.keys(json), ['version', 'updatedAt', 'categories']);
  assert.equal(json.version, 4);
});

test('rebase legger egne endringer oppå nyere versjon fra GitHub', () => {
  const b = base();
  const local = core.clone(b);
  itm(local, 'egg', 'egg').qty = 12;
  itm(local, 'baer', 'bfg1').name = 'Solbær';
  cat(local, 'syltetoy').prices[0].amount = 55;
  const remote = core.clone(b);
  itm(remote, 'egg', 'egg').prices[0].amount = 6;
  cat(remote, 'ved').active = true;
  const m = core.rebase(b, local, remote);
  assert.equal(itm(m, 'egg', 'egg').qty, 12);
  assert.equal(itm(m, 'egg', 'egg').prices[0].amount, 6);
  assert.equal(itm(m, 'baer', 'bfg1').name, 'Solbær');
  assert.equal(cat(m, 'syltetoy').prices[0].amount, 55);
  assert.equal(cat(m, 'ved').active, true);
});

test('commitMessage beskriver endringene kort', () => {
  const b = base();
  const l = core.clone(b);
  itm(l, 'egg', 'smaegg').qty = 30;
  cat(l, 'honning').active = true;
  itm(l, 'baer', 'bfg1').name = 'Jordbær';
  itm(l, 'baer', 'bfg1').prices[0].amount = 50;
  cat(l, 'saft').prices[0].amount = 45;
  itm(l, 'saft', 'ripssaft').qty = 4;
  const msg = core.commitMessage(b, l);
  assert.match(msg, /^Lager: /);
  assert.match(msg, /Små egg 30 stk/);
  assert.match(msg, /Honning synlig/);
  assert.match(msg, /Bær, frukt og grønnsaker: navn «Jordbær»/);
  assert.match(msg, /Jordbær pris/);
  assert.match(msg, /Saft pris/);
  assert.match(msg, /Ripssaft 4 flasker/);
});

test('base64 med æøå går begge veier', () => {
  const s = '{"name":"Bær, frukt og grønnsaker – æøå ÆØÅ"}';
  assert.equal(core.decodeBase64Utf8(core.encodeBase64Utf8(s)), s);
  assert.equal(core.decodeBase64Utf8(core.encodeBase64Utf8(s).replace(/(.{10})/g, '$1\n')), s);
});
