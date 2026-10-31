/* Myra gårdsutsalg v1.5 – kundeside (kategorier med varer) */
(function () {
  'use strict';
  var C = window.MYRA_CONFIG;
  var core = window.MyraCore;
  var el = window.MyraDom.el;

  document.getElementById('shop-name').textContent = C.shop.name;
  document.getElementById('shop-kicker').textContent = C.shop.kicker;
  document.getElementById('info-payment').textContent = C.shop.payment;
  document.getElementById('info-address').textContent = C.shop.address;
  document.getElementById('info-hours').textContent = C.shop.hours;
  document.getElementById('version').textContent = 'v' + C.version;

  var grid = document.getElementById('products');
  var errorBanner = document.getElementById('error-banner');
  var lastJson = null;

  function badge(qty) {
    var s = core.stockStatus(qty);
    return el('span', { class: 'badge ' + s.cls, text: s.text });
  }

  function priceList(item, cls) {
    return item.prices.length ? el('ul', { class: cls || 'prices' }, item.prices.map(function (pr) {
      return el('li', { text: core.formatPrice(pr) });
    })) : null;
  }

  function updated(cat, now) {
    var d = core.latestUpdate(cat);
    return d ? el('p', { class: 'updated', text: core.formatUpdated(d, now) }) : null;
  }

  // Én vare (honning, saft, ved): stort tall som før
  function singleCard(cat, it, now) {
    return el('article', { class: 'card', 'data-category': cat.id }, [
      el('div', { class: 'card__head' }, [
        el('div', null, [
          el('h3', { class: 'card__title', text: cat.name }),
          cat.note ? el('p', { class: 'card__note', text: cat.note }) : null
        ]),
        badge(it.qty)
      ]),
      el('p', { class: 'qty', style: 'margin:0' }, [
        el('span', { class: 'qty__num', text: String(it.qty) }),
        el('span', { class: 'qty__unit', text: it.unit + ' tilgjengelig' })
      ]),
      priceList(it),
      updated(cat, now)
    ]);
  }

  // Flere varer (egg, saft, honning, syltetøy, bær/frukt/grønt): en liste i samme boks
  function listCard(cat, items, now) {
    var shared = cat.prices.length ? el('ul', { class: 'prices prices--shared' }, cat.prices.map(function (pr) {
      return el('li', { text: core.formatPrice(pr) });
    })) : null;
    return el('article', { class: 'card', 'data-category': cat.id }, [
      el('div', null, [
        el('h3', { class: 'card__title', text: cat.name }),
        cat.note ? el('p', { class: 'card__note', text: cat.note }) : null
      ]),
      shared,
      el('ul', { class: 'items' }, items.map(function (it) {
        var out = it.qty <= 0;
        return el('li', { class: 'item' + (out ? ' item--out' : '') }, [
          el('div', { class: 'item__head' }, [
            el('span', { class: 'item__name', text: it.name }),
            badge(it.qty)
          ]),
          out ? null : el('p', { class: 'item__qty' }, [
            el('strong', { text: String(it.qty) }), ' ' + it.unit + ' tilgjengelig'
          ]),
          priceList(it, 'item__prices')
        ]);
      })),
      updated(cat, now)
    ]);
  }

  function comingCard(cat) {
    return el('article', { class: 'card card--coming', 'data-category': cat.id }, [
      el('p', { class: 'coming-label', text: 'Kommer senere' }),
      el('h3', { class: 'card__title', text: cat.name }),
      cat.note ? el('p', { class: 'card__note', text: cat.note }) : null
    ]);
  }

  function render(data) {
    var now = new Date();
    // Med beholdning først (egg øverst), helt utsolgte etter, «Kommer senere» sist
    var order = core.orderForCustomers(data);
    var shown = order.inStock.concat(order.soldOut), coming = order.coming;
    var nodes = shown.map(function (s) {
      var single = s.items.length === 1 && !s.cat.namedItems && s.cat.items.length === 1;
      return single ? singleCard(s.cat, s.items[0], now) : listCard(s.cat, s.items, now);
    });
    if (!shown.length) nodes.push(el('p', { class: 'empty', text: 'Ingenting til salgs akkurat nå. Se innom igjen snart.' }));
    nodes = nodes.concat(coming.map(comingCard));
    grid.replaceChildren.apply(grid, nodes);
    grid.setAttribute('aria-busy', 'false');
  }

  function load() {
    // ?t= hindrer at nettleseren eller mellomlagre viser en gammel versjon
    return fetch('data/products.json?t=' + Date.now(), { cache: 'no-store' })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.text();
      })
      .then(function (text) {
        errorBanner.hidden = true;
        if (text === lastJson) return;
        lastJson = text;
        render(core.normalizeData(JSON.parse(text)));
      })
      .catch(function (err) {
        console.error(err);
        errorBanner.textContent = 'Klarte ikke å hente lagerstatus akkurat nå. Prøv å laste siden på nytt.';
        errorBanner.hidden = false;
        grid.setAttribute('aria-busy', 'false');
      });
  }

  load();
  setInterval(function () { if (!document.hidden) load(); }, Math.max(15, C.refreshSeconds) * 1000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) load(); });
})();
