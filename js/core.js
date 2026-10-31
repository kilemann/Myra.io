/*
 * Myra gårdsutsalg – kjernelogikk (ren JavaScript, ingen DOM).
 * Brukes av både kundesiden, admin-appen og testene (Node).
 *
 * Dataformat v3: kategorier med varer.
 *   { version: 3, updatedAt, categories: [
 *       { id, sort, name, note, active, namedItems, steps, updatedAt,
 *         prices: [{ label, amount }],            // felles pris for alle varene (saft, syltetøy)
 *         items: [ { id, name, unit, qty, prices: [{ label, amount }], updatedAt } ] } ] }
 * - active      : kategorien vises (true) eller står som «Kommer senere» (false)
 * - namedItems  : selger skriver selv navnet på hver vare (bær, frukt og grønnsaker)
 * - en vare uten navn vises ikke på kundesiden
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MyraCore = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var DATA_VERSION = 3;
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

  function shared(label) { return [{ label: label, amount: null }]; }

  // Standard oppsett – brukes ved første gangs bruk og ved overgang fra eldre format
  function defaultData() {
    return {
      version: DATA_VERSION,
      updatedAt: null,
      categories: [
        { id: 'egg', sort: 10, name: 'Egg', note: 'Ferske egg fra gården', active: true, namedItems: false,
          steps: EGG_STEPS, updatedAt: null, prices: [],
          items: [item('egg', 'Egg', 'stk', ['per egg', 'per brett (12 stk)']),
                  item('smaegg', 'Små egg', 'stk', ['per egg', 'per brett (12 stk)'])] },
        { id: 'saft', sort: 20, name: 'Saft', note: 'Hjemmelaget', active: false, namedItems: false,
          steps: DEFAULT_STEPS, updatedAt: null, prices: shared('per flaske'),
          items: [item('baersaft', 'Bærsaft', 'flasker', []),
                  item('solbaersaft', 'Solbærsaft', 'flasker', []),
                  item('aroniasaft', 'Aroniasaft', 'flasker', []),
                  item('ripssaft', 'Ripssaft', 'flasker', [])] },
        { id: 'honning', sort: 30, name: 'Honning', note: '', active: false, namedItems: false,
          steps: DEFAULT_STEPS, updatedAt: null, prices: [],
          items: [item('flytende', 'Flytende honning', 'bokser', ['per boks']),
                  item('sommer', 'Sommerhonning', 'stk', ['per 500 g']),
                  item('lyng', 'Lynghonning', 'stk', ['per 500 g'])] },
        { id: 'syltetoy', sort: 40, name: 'Syltetøy', note: 'Hjemmelaget', active: false, namedItems: false,
          steps: DEFAULT_STEPS, updatedAt: null, prices: shared('per glass'),
          items: [item('bringebaer', 'Bringebærsyltetøy', 'glass', []),
                  item('jordbaer', 'Jordbærsyltetøy', 'glass', []),
                  item('bjornebaer', 'Bjørnebærsyltetøy', 'glass', []),
                  item('blabaer', 'Blåbærsyltetøy', 'glass', [])] },
        { id: 'baer', sort: 50, name: 'Bær, frukt og grønnsaker', note: 'Etter sesong', active: false, namedItems: true,
          steps: DEFAULT_STEPS, updatedAt: null, prices: [],
          items: numbered('bfg', 8, 'hg', 'per hg') },
        { id: 'ved', sort: 60, name: 'Ved', note: 'Til peis og vedovn', active: false, namedItems: false,
          steps: DEFAULT_STEPS, updatedAt: null, prices: [],
          items: [item('ved', 'Ved', 'sekker', ['per sekk'])] }
      ]
    };
  }

  function findById(list, id) { return list.filter(function (x) { return x.id === id; })[0]; }

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
      prices: normalizePrices(raw.prices),
      items: Array.isArray(raw.items) ? raw.items.map(normalizeItem).filter(function (i) { return i.id; }) : []
    };
  }

  function firstAmount(prices) {
    var p = normalizePrices(prices).filter(function (x) { return x.amount !== null; })[0];
    return p ? p.amount : null;
  }

  // v1 (løse produkter) -> nyeste format. Beholder antall, priser, synlighet og tidspunkt der det går.
  function migrateV1(raw) {
    var d = defaultData();
    d.updatedAt = raw.updatedAt ? String(raw.updatedAt) : null;
    (raw.products || []).forEach(function (p) {
      var cat = findById(d.categories, p.id);
      if (!cat) return; // f.eks. «Grønnsaker» er fjernet
      cat.active = !!p.active;
      cat.updatedAt = p.updatedAt || null;
      var it = findById(cat.items, p.id);
      if (!it) { // saft: én vare ble til fire med felles pris
        if (cat.prices.length) cat.prices[0].amount = firstAmount(p.prices);
        return;
      }
      it.qty = Math.max(0, parseInt(p.qty, 10) || 0);
      it.updatedAt = p.updatedAt || null;
      normalizePrices(p.prices).forEach(function (pr, i) { if (it.prices[i]) it.prices[i].amount = pr.amount; });
    });
    return d;
  }

  // v2 -> v3: saft og syltetøy får faste navn og felles pris, honning deles i tre.
  // Andre kategorier beholdes som de er.
  var RESTRUCTURED = ['saft', 'syltetoy', 'honning'];
  function migrateV2(raw) {
    var defaults = defaultData().categories;
    var cats = raw.categories.map(function (old) {
      if (RESTRUCTURED.indexOf(old.id) === -1) return old;
      var cat = clone(findById(defaults, old.id));
      var oldItems = (old.items || []).map(normalizeItem);
      cat.active = !!old.active;
      cat.updatedAt = old.updatedAt || null;
      if (cat.prices.length) {
        var amounts = oldItems.map(function (i) { return firstAmount(i.prices); }).filter(function (a) { return a !== null; });
        cat.prices[0].amount = amounts.length ? amounts[0] : null;
      }
      cat.items.forEach(function (it) {
        // Samme id (honning -> flytende honning) eller navn som passer (f.eks. «Jordbær» -> Jordbærsyltetøy)
        var match = oldItems.filter(function (o) {
          if (old.id === 'honning') return o.id === 'honning' && it.id === 'flytende';
          var n = o.name.trim().toLowerCase();
          return n && n !== cat.name.toLowerCase() && it.name.toLowerCase().indexOf(n) !== -1;
        })[0];
        if (!match) return;
        it.qty = match.qty;
        it.updatedAt = match.updatedAt;
        match.prices.forEach(function (pr, i) { if (it.prices[i]) it.prices[i].amount = pr.amount; });
      });
      return cat;
    });
    defaults.forEach(function (dc) { if (!findById(cats, dc.id)) cats.push(clone(dc)); });
    return { version: DATA_VERSION, updatedAt: raw.updatedAt || null, categories: cats };
  }

  // Legger til prisfelt som er nye i standardoppsettet (f.eks. «per brett» for små egg),
  // uten å røre priser selger allerede har satt.
  function addMissingPrices(cats) {
    var defaults = defaultData().categories;
    cats.forEach(function (c) {
      var dc = defaults.filter(function (x) { return x.id === c.id; })[0];
      if (!dc) return;
      dc.prices.forEach(function (dp) {
        if (!c.prices.some(function (p) { return p.label === dp.label; })) c.prices.push({ label: dp.label, amount: null });
      });
      c.items.forEach(function (it) {
        var di = dc.items.filter(function (x) { return x.id === it.id; })[0];
        if (!di) return;
        di.prices.forEach(function (dp) {
          var has = it.prices.some(function (p) { return p.label === dp.label; });
          if (!has) it.prices.push({ label: dp.label, amount: null });
        });
      });
    });
    return cats;
  }

  function normalizeData(raw) {
    raw = (raw && typeof raw === 'object') ? raw : {};
    if (!Array.isArray(raw.categories) && Array.isArray(raw.products)) raw = migrateV1(raw);
    else if (Array.isArray(raw.categories) && (Number(raw.version) || 0) < 3) raw = migrateV2(raw);
    var cats = Array.isArray(raw.categories) ? raw.categories.map(normalizeCategory) : [];
    cats = addMissingPrices(cats.filter(function (c) { return c.id; }));
    cats.sort(function (a, b) { return a.sort - b.sort; });
    return { version: DATA_VERSION, updatedAt: raw.updatedAt ? String(raw.updatedAt) : null, categories: cats };
  }

  function serialize(data) {
    var d = normalizeData(data);
    return JSON.stringify({ version: d.version, updatedAt: d.updatedAt, categories: d.categories }, null, 2) + '\n';
  }

  // Varer som skal vises for kunden (de med navn)
  // Rekkefølge på kundesiden:
  //   1. Kategorier med beholdning (minst én vare > 0) – egg alltid øverst når egg ikke er utsolgt
  //   2. Kategorier som er synlige, men helt utsolgt (alle varer 0)
  //   3. «Kommer senere» (skjult eller uten varer med navn)
  // Innenfor hver gruppe beholdes den faste rekkefølgen (sort).
  var TOP_CATEGORY = 'egg';
  function orderForCustomers(data) {
    var inStock = [], soldOut = [], coming = [];
    data.categories.forEach(function (cat) {
      var items = visibleItems(cat);
      if (!cat.active || !items.length) { coming.push(cat); return; }
      var entry = { cat: cat, items: items };
      if (items.some(function (i) { return i.qty > 0; })) inStock.push(entry);
      else soldOut.push(entry);
    });
    inStock.sort(function (a, b) {
      var ta = a.cat.id === TOP_CATEGORY ? 0 : 1, tb = b.cat.id === TOP_CATEGORY ? 0 : 1;
      return (ta - tb) || (a.cat.sort - b.cat.sort);
    });
    return { inStock: inStock, soldOut: soldOut, coming: coming };
  }

  function visibleItems(cat) {
    return cat.items.filter(function (i) { return i.name.trim() !== ''; });
  }

  function latestUpdate(cat) {
    var stamps = [cat.updatedAt].concat(cat.items.map(function (i) { return i.updatedAt; }))
      .filter(Boolean).map(function (s) { return new Date(s).getTime(); }).filter(function (n) { return !isNaN(n); });
    return stamps.length ? new Date(Math.max.apply(null, stamps)) : null;
  }

  function stockStatus(qty) {
    if (qty <= 0) return { text: 'Midlertidig utsolgt', cls: 'badge--out' };
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

  // Nøkler: 'cat:<id>' (synlighet endret), 'catprice:<id>' (felles pris endret)
  // og 'item:<cat>/<id>' (antall, navn eller pris endret)
  function changedKeys(base, local) {
    var b = index(base), out = [];
    local.categories.forEach(function (c) {
      var bc = b.cats[c.id];
      if (!bc || bc.active !== c.active) out.push('cat:' + c.id);
      if (bc && JSON.stringify(bc.prices) !== JSON.stringify(c.prices)) out.push('catprice:' + c.id);
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
      return k === 'cat:' + catId || k === 'catprice:' + catId || k.indexOf('item:' + catId + '/') === 0;
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
      if (keys.indexOf('cat:' + c.id) !== -1 || keys.indexOf('catprice:' + c.id) !== -1) c.updatedAt = stamp;
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
      if (bc && lc) {
        c.prices = c.prices.map(function (pr, n) {
          var bp = bc.prices[n], lp = lc.prices[n];
          if (bp && lp && bp.amount !== lp.amount) return { label: pr.label, amount: lp.amount };
          return pr;
        });
      }
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
      if (bc && JSON.stringify(bc.prices) !== JSON.stringify(c.prices)) parts.push(c.name + ' pris');
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
    orderForCustomers: orderForCustomers,
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
