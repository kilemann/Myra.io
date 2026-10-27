/*
 * Myra gårdsutsalg – kjernelogikk (ren JavaScript, ingen DOM).
 * Brukes av både kundesiden, admin-appen og testene (Node).
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MyraCore = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var DATA_VERSION = 1;
  var MONTHS = ['jan.', 'feb.', 'mars', 'april', 'mai', 'juni', 'juli', 'aug.', 'sep.', 'okt.', 'nov.', 'des.'];

  function clone(x) { return JSON.parse(JSON.stringify(x)); }

  function toAmount(v) {
    if (v === null || v === undefined || v === '') return null;
    var n = Number(v);
    return (isNaN(n) || n < 0) ? null : Math.round(n * 100) / 100;
  }

  function normalizeProduct(raw) {
    raw = raw || {};
    return {
      id: String(raw.id || ''),
      sort: Number(raw.sort) || 0,
      name: String(raw.name || ''),
      note: String(raw.note || ''),
      unit: String(raw.unit || 'stk'),
      qty: Math.max(0, parseInt(raw.qty, 10) || 0),
      active: !!raw.active,
      prices: Array.isArray(raw.prices) ? raw.prices.map(function (p) {
        return { label: String((p && p.label) || ''), amount: toAmount(p && p.amount) };
      }) : [],
      updatedAt: raw.updatedAt ? String(raw.updatedAt) : null
    };
  }

  function normalizeData(raw) {
    raw = (raw && typeof raw === 'object') ? raw : {};
    var products = Array.isArray(raw.products) ? raw.products.map(normalizeProduct) : [];
    products = products.filter(function (p) { return p.id; });
    products.sort(function (a, b) { return a.sort - b.sort; });
    return {
      version: DATA_VERSION,
      updatedAt: raw.updatedAt ? String(raw.updatedAt) : null,
      products: products
    };
  }

  function serialize(data) {
    var d = normalizeData(data);
    return JSON.stringify({ version: d.version, updatedAt: d.updatedAt, products: d.products }, null, 2) + '\n';
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

  function sameProductValues(a, b) {
    return a.qty === b.qty && a.active === b.active &&
      JSON.stringify(a.prices) === JSON.stringify(b.prices);
  }

  function byId(data) {
    var m = {};
    data.products.forEach(function (p) { m[p.id] = p; });
    return m;
  }

  function changedIds(base, local) {
    var b = byId(base);
    return local.products.filter(function (p) {
      return !b[p.id] || !sameProductValues(b[p.id], p);
    }).map(function (p) { return p.id; });
  }

  function buildPublish(base, local, now) {
    var stamp = (now || new Date()).toISOString();
    var changed = changedIds(base, local);
    var out = clone(normalizeData(local));
    out.products.forEach(function (p) { if (changed.indexOf(p.id) !== -1) p.updatedAt = stamp; });
    out.updatedAt = stamp;
    return out;
  }

  // Legg egne endringer (base -> local) oppå en nyere versjon (remote).
  function rebase(base, local, remote) {
    var b = byId(base), l = byId(local);
    var out = clone(normalizeData(remote));
    out.products.forEach(function (p) {
      var bp = b[p.id], lp = l[p.id];
      if (!bp || !lp) return;
      if (lp.qty !== bp.qty) p.qty = lp.qty;
      if (lp.active !== bp.active) p.active = lp.active;
      p.prices = p.prices.map(function (pr, i) {
        var bpr = bp.prices[i], lpr = lp.prices[i];
        if (bpr && lpr && bpr.amount !== lpr.amount) return { label: pr.label, amount: lpr.amount };
        return pr;
      });
    });
    return out;
  }

  function commitMessage(base, local) {
    var b = byId(base);
    var parts = [];
    local.products.forEach(function (p) {
      var bp = b[p.id];
      if (!bp) return;
      if (p.qty !== bp.qty) parts.push(p.name + ' ' + p.qty + ' ' + p.unit);
      if (p.active !== bp.active) parts.push(p.name + (p.active ? ' synlig' : ' skjult'));
      if (JSON.stringify(p.prices) !== JSON.stringify(bp.prices)) parts.push(p.name + ' pris');
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
    normalizeProduct: normalizeProduct,
    normalizeData: normalizeData,
    serialize: serialize,
    stockStatus: stockStatus,
    formatUpdated: formatUpdated,
    formatPrice: formatPrice,
    parseAmount: parseAmount,
    parseQty: parseQty,
    changedIds: changedIds,
    buildPublish: buildPublish,
    rebase: rebase,
    commitMessage: commitMessage,
    encodeBase64Utf8: encodeBase64Utf8,
    decodeBase64Utf8: decodeBase64Utf8
  };
});
