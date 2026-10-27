/* Myra gårdsutsalg v1.1 – kundeside */
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

  function activeCard(p, now) {
    var status = core.stockStatus(p.qty);
    return el('article', { class: 'card' }, [
      el('div', { class: 'card__head' }, [
        el('div', null, [
          el('h3', { class: 'card__title', text: p.name }),
          p.note ? el('p', { class: 'card__note', text: p.note }) : null
        ]),
        el('span', { class: 'badge ' + status.cls, text: status.text })
      ]),
      el('p', { class: 'qty', style: 'margin:0' }, [
        el('span', { class: 'qty__num', text: String(p.qty) }),
        el('span', { class: 'qty__unit', text: p.unit + ' tilgjengelig' })
      ]),
      p.prices.length ? el('ul', { class: 'prices' }, p.prices.map(function (pr) {
        return el('li', { text: core.formatPrice(pr) });
      })) : null,
      p.updatedAt ? el('p', { class: 'updated', text: core.formatUpdated(new Date(p.updatedAt), now) }) : null
    ]);
  }

  function comingCard(p) {
    return el('article', { class: 'card card--coming' }, [
      el('p', { class: 'coming-label', text: 'Kommer senere' }),
      el('h3', { class: 'card__title', text: p.name }),
      p.note ? el('p', { class: 'card__note', text: p.note }) : null
    ]);
  }

  function render(data) {
    var now = new Date();
    var active = data.products.filter(function (p) { return p.active; });
    var coming = data.products.filter(function (p) { return !p.active; });
    var nodes = active.map(function (p) { return activeCard(p, now); });
    if (!active.length) nodes.push(el('p', { class: 'empty', text: 'Ingenting til salgs akkurat nå. Se innom igjen snart.' }));
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
        if (text === lastJson) return; // ingen endring
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
