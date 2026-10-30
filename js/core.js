/*
 * Myra gårdsutsalg – kjernelogikk (ren JavaScript, ingen DOM).
 * Brukes av både kundesiden, admin-appen og testene (Node).
 *
 * Dataformat v2: kategorier med varer.
 *   { version: 2, updatedAt, categories: [
 *       { id, sort, name, note, active, namedItems, steps, updatedAt,
 *         items: [ { id, name, unit, qty, prices: [{ label, amount }], updatedAt } ] } ] }
 * - active      : kategorien vises (true) eller står som «Kommer senere» (false)
 * - namedItems  : selger skriver selv navnet på hver vare (syltetøy, bær/frukt/grønt)
 * - en vare uten navn vises ikke på kundesiden
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MyraCore = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var DATA_VERSION = 2;
  var MONTHS = ['jan.', 'feb.', 'mars', 'april', 'mai', 'juni', 'juli', 'aug.', 'sep.', 'okt.', 'nov.', 'des.'];
  var EGG_STEPS = [-12, -6, -1, 1, 6, 12];
  var DEFAULT_STEPS = [-5, -1, 1, 5];

  function clone(x) { return JSON.parse(JSON.stringify(x)); }

  function item(id, name, unit, priceLabels) {
    return { id: id, name: name, unit: unit, qty: 0,
      prices: priceLabels.map(function (l) { return { label: l, amount: null }; }), updatedAt: null };
  }

  function numbered(prefix, count, unit, priceLabel) {
    var out = [];
    for (var i = 1; i <= count; i++) out.push(item(prefix + i, '', unit, [priceLabel]));
    return out;
  }

  // Standard oppsett – brukes ved første gangs bruk og ved overgang fra v1
  function defaultData() {
    return {
      version: DATA_VERSION,
      updatedAt: null,
      categories: [
        { id: 'egg', sort: 10, name: 'Egg', note: 'Ferske egg fra gården', active: true, namedItems: false,
          steps: EGG_STEPS, updatedAt: null,
          items: [item('egg', 'Egg', 'stk', ['per egg', 'per brett (12 stk)']),
                  item('smaegg', 'Små egg', 'stk', ['per egg'])] },
        { id: 'saft', sort: 20, name: 'Saft', note: 'Hjemmelaget', active: false, namedItems: false,
          steps: DEFAULT_STEPS, updatedAt: null,
          items: [item('saft', 'Saft', 'flasker', ['per flaske'])] },
        { id: 'honning', sort: 30, name: 'Honning', note: '', active: false, namedItems: false,
          steps: DEFAULT_STEPS, updatedAt: null,
          items: [item('honning', 'Honning', 'bokser', ['per boks'])] },
        { id: 'syltetoy', sort: 40, name: 'Syltetøy', note: '', active: false, namedItems: true,
          steps: DEFAULT_STEPS, updatedAt: null,
          items: numbered('sylt', 4, 'glass', 'per glass') },
        { id: 'baer', sort: 50, name: 'Bær, frukt og grønnsaker', note: 'Etter sesong', active: false, namedItems: true,
          steps: DEFAULT_STEPS, updatedAt: null,
          items: numbered('bfg', 8, 'hg', 'per hg') },
        { id: 'ved', sort: 60, name: 'Ved', note: 'Til peis og vedovn', active: false, namedItems: false,
          steps: DEFAULT_STEPS, updatedAt: null,
          items: [item('ved', 'Ved', 'sekker', ['per sekk'])] }
      ]
    };
  }

  function toAmount(v) {
    if (v === null || v === undefined || v === '') return null;
    var n = Number(v);
    return (isNaN(n) || n < 0) ? null : Math.round(n * 100) / 100;
  }

  function normalizePrices(list) {
    return Array.isArray(list) ? list.map(function (p) {
      return { label: String((p && p.label) || ''), amount: toAmount(p && p.amount) };
    }) : [];
  }

  function normalizeItem(raw) {
    raw = raw || {};
    return {
      id: String(raw.id || ''),
      name: String(raw.name || ''),
      unit: String(raw.unit || 'stk'),
      qty: Math.max(0, parseInt(raw.qty, 10) || 0),
      prices: normalizePrices(raw.prices),
      updatedAt: raw.updatedAt ? String(raw.updatedAt) : null
    };
  }

  function normalizeCategory(raw) {
    raw = raw || {};
    var steps = Array.isArray(raw.steps) && raw.steps.length
      ? raw.steps.map(Number).filter(function (n) { return n && !isNaN(n); })
      : DEFAULT_STEPS.slice();
    return {
      id: String(raw.id || ''),
      sort: Number(raw.sort) || 0,
      name: String(raw.name || ''),
      note: String(raw.note || ''),
      active: !!raw.active,
      namedItems: !!raw.namedItems,
      steps: steps,
      updatedAt: raw.updatedAt ? String(raw.updatedAt) : null,
      items: Array.isArray(raw.items) ? raw.items.map(normalizeItem).filter(function (i) { return i.id; }) : []
    };
  }

  // v1 (løse produkter) -> v2 (kategorier). Beholder antall, priser, synlighet og tidspunkt.
  function migrateV1(raw) {
    var d = defaultData();
    d.updatedAt = raw.updatedAt ? String(raw.updatedAt) : null;
    (raw.products || []).forEach(function (p) {
      var cat = d.categories.filter(function (c) { return c.id === p.id; })[0];
      if (!cat) return; // f.eks. «Grønnsaker» er fjernet
      var it = cat.items.filter(function (i) { return i.id === p.id; })[0];
      cat.active = !!p.active;
      cat.updatedAt = p.updatedAt || null;
      it.qty = Math.max(0, parseInt(p.qty, 10) || 0);
      it.updatedAt = p.updatedAt || null;
      normalizePrices(p.prices).forEach(function (pr, i) { if (it.prices[i]) it.prices[i].amount = pr.amount; });
    });
    return d;
  }

  function normalizeData(raw) {
    raw = (raw && typeof raw === 'object') ? raw : {};
    if (!Array.isArray(raw.categories) && Array.isArray(raw.products)) raw = migrateV1(raw);
    var cats = Array.isArray(raw.categories) ? raw.categories.map(normalizeCategory) : [];
    cats = cats.filter(function (c) { return c.id; });
    cats.sort(function (a, b) { return a.sort - b.sort; });
    return { version: DATA_VERSION, updatedAt: raw.updatedAt ? String(raw.updatedAt) : null, categories: cats };
  }

  function serialize(data) {
    var d = normalizeData(data);
    return JSON.stringify({ version: d.version, updatedAt: d.updatedAt, categories: d.categories }, null, 2) + '\n';
  }

  // Varer som skal vises for kunden (de med navn)
  function visibleItems(cat) {
    return cat.items.filter(function (i) { return i.name.trim() !== ''; });
  }

  function latestUpdate(cat) {
    var stamps = [cat.updatedAt].concat(cat.items.map(function (i) { return i.updatedAt; }))
      .filter(Boolean).map(function (s) { return new Date(s).getTime(); }).filter(function (n) { return !isNaN(n); });
    return stamps.length ? new Date(Math.max.apply(null, stamps)) : null;
  }

  function stockStatus(qty) {
    if (qty <= 0) return { text: 'Utsolgt', cls: 'badge--out' };
    if (qty < 12) return { text: 'Få igjen', cls: 'badge--low' };
    return { text: 'På lager', cls: 'badge--ok' };
  }

  function two(n) { return ('0' + n).slice(-2); }

  function formatUpdated(date, now) {
    var d = (date instanceof Date) ? date : new Date(date);
    now = now || new Date();
    if (isNaN(d.getTime())) return '';
    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    var diff = Math.round((today - day) / 86400000);
    var clock = 'kl. ' + two(d.getHours()) + ':' + two(d.getMinutes());
    if (diff === 0) return 'Oppdatert i dag ' + clock;
    if (diff === 1) return 'Oppdatert i går ' + clock;
    var year = d.getFullYear() !== now.getFullYear() ? ' ' + d.getFullYear() : '';
    return 'Oppdatert ' + d.getDate() + '. ' + MONTHS[d.getMonth()] + year + ' ' + clock;
  }

  function formatNumber(n) {
    var s = String(Math.round(n * 100) / 100).replace('.', ',');
    var parts = s.split(',');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    return parts.join(',');
  }

  function formatPrice(p) {
    if (p.amount === null || p.amount === undefined) return 'Pris ' + p.label + ' kommer';
    return formatNumber(p.amount) + ' kr ' + p.label;
  }

  // null = tomt felt, undefined = ugyldig
  function parseAmount(text) {
    var t = String(text === undefined || text === null ? '' : text).replace(/\s/g, '').replace(',', '.');
    if (t === '') return null;
    if (!/^\d+(\.\d+)?$/.test(t)) return undefined;
    return Math.round(Number(t) * 100) / 100;
  }

  function parseQty(text) {
    var n = parseInt(String(text === undefined || text === null ? '' : text).replace(/\D/g, ''), 10);
    return isNaN(n) ? 0 : n;
  }

  // ---- Endringer mellom to versjoner ------------------------------------
  function index(data) {
    var cats = {}, items = {};
    data.categories.forEach(function (c) {
      cats[c.id] = c;
      c.items.forEach(function (i) { items[c.id + '/' + i.id] = i; });
    });
    return { cats: cats, items: items };
  }

  function sameItem(a, b) {
    return a.qty === b.qty && a.name === b.name && JSON.stringify(a.prices) === JSON.stringify(b.prices);
  }

  // Nøkler: 'cat:<id>' (synlighet endret) og 'item:<cat>/<id>' (antall, navn eller pris endret)
  function changedKeys(base, local) {
    var b = index(base), out = [];
    local.categories.forEach(function (c) {
      var bc = b.cats[c.id];
      if (!bc || bc.active !== c.active) out.push('cat:' + c.id);
      c.items.forEach(function (i) {
        var bi = b.items[c.id + '/' + i.id];
        if (!bi || !sameItem(bi, i)) out.push('item:' + c.id + '/' + i.id);
      });
    });
    return out;
  }

  // Antall «ting» endret, for teksten i publiseringslinja (kategori + varer telles én gang per kategori-vare)
  function changedCount(base, local) { return changedKeys(base, local).length; }

  function isCategoryChanged(base, local, catId) {
    return changedKeys(base, local).some(function (k) {
      return k === 'cat:' + catId || k.indexOf('item:' + catId + '/') === 0;
    });
  }

  function isItemChanged(base, local, catId, itemId) {
    return changedKeys(base, local).indexOf('item:' + catId + '/' + itemId) !== -1;
  }

  function buildPublish(base, local, now) {
    var stamp = (now || new Date()).toISOString();
    var keys = changedKeys(base, local);
    var out = clone(normalizeData(local));
    out.categories.forEach(function (c) {
      if (keys.indexOf('cat:' + c.id) !== -1) c.updatedAt = stamp;
      c.items.forEach(function (i) { if (keys.indexOf('item:' + c.id + '/' + i.id) !== -1) i.updatedAt = stamp; });
    });
    out.updatedAt = stamp;
    return out;
  }

  // Legg egne endringer (base -> local) oppå en nyere versjon (remote).
  function rebase(base, local, remote) {
    var b = index(base), l = index(local);
    var out = clone(normalizeData(remote));
    out.categories.forEach(function (c) {
      var bc = b.cats[c.id], lc = l.cats[c.id];
      if (bc && lc && bc.active !== lc.active) c.active = lc.active;
      c.items.forEach(function (i) {
        var key = c.id + '/' + i.id, bi = b.items[key], li = l.items[key];
        if (!bi || !li) return;
        if (li.qty !== bi.qty) i.qty = li.qty;
        if (li.name !== bi.name) i.name = li.name;
        i.prices = i.prices.map(function (pr, n) {
          var bp = bi.prices[n], lp = li.prices[n];
          if (bp && lp && bp.amount !== lp.amount) return { label: pr.label, amount: lp.amount };
          return pr;
        });
      });
    });
    return out;
  }

  function commitMessage(base, local) {
    var b = index(base), parts = [];
    local.categories.forEach(function (c) {
      var bc = b.cats[c.id];
      if (bc && bc.active !== c.active) parts.push(c.name + (c.active ? ' synlig' : ' skjult'));
      c.items.forEach(function (i) {
        var bi = b.items[c.id + '/' + i.id];
        if (!bi) return;
        var label = i.name || bi.name || (c.name + ' ' + i.id);
        if (i.name !== bi.name) parts.push(c.name + ': ' + (i.name ? 'navn «' + i.name + '»' : 'navn fjernet'));
        if (i.qty !== bi.qty) parts.push(label + ' ' + i.qty + ' ' + i.unit);
        if (JSON.stringify(i.prices) !== JSON.stringify(bi.prices)) parts.push(label + ' pris');
      });
    });
    return 'Lager: ' + (parts.length ? parts.join(', ') : 'ingen endringer');
  }

  function encodeBase64Utf8(str) {
    var bytes = new TextEncoder().encode(str);
    var bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }

  function decodeBase64Utf8(b64) {
    var bin = atob(String(b64).replace(/\s/g, ''));
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  return {
    DATA_VERSION: DATA_VERSION,
    clone: clone,
    defaultData: defaultData,
    migrateV1: migrateV1,
    normalizeData: normalizeData,
    serialize: serialize,
    visibleItems: visibleItems,
    latestUpdate: latestUpdate,
    stockStatus: stockStatus,
    formatUpdated: formatUpdated,
    formatPrice: formatPrice,
    parseAmount: parseAmount,
    parseQty: parseQty,
    changedKeys: changedKeys,
    changedCount: changedCount,
    isCategoryChanged: isCategoryChanged,
    isItemChanged: isItemChanged,
    buildPublish: buildPublish,
    rebase: rebase,
    commitMessage: commitMessage,
    encodeBase64Utf8: encodeBase64Utf8,
    decodeBase64Utf8: decodeBase64Utf8
  };
});
