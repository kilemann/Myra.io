/* Myra gårdsutsalg v1.1 – oppdateringsside for selger (lagrer via GitHub) */
(function () {
  'use strict';
  var C = window.MYRA_CONFIG;
  var core = window.MyraCore;
  var vault = window.MyraVault;
  var GH = window.MyraGitHub;
  var el = window.MyraDom.el;

  var STORE_KEY = 'myra-vault-v1';
  var STEPS = [-12, -6, -1, 1, 6, 12];

  var $ = function (id) { return document.getElementById(id); };
  var screens = { setup: $('setup'), login: $('login'), admin: $('admin') };

  var client = null;     // GitHub-klient (tokenet finnes bare i minnet mens du er logget inn)
  var base = null;       // siste versjon fra GitHub
  var local = null;      // versjonen selger redigerer
  var sha = null;
  var busy = false;
  var cards = {};

  $('version').textContent = 'Myra gårdsutsalg v' + C.version;

  // ---------- Lagring på telefonen ----------
  function readStore() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)); } catch (e) { return null; }
  }
  function writeStore(v) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(v)); return true; } catch (e) { return false; }
  }
  function clearStore() {
    try { localStorage.removeItem(STORE_KEY); } catch (e) { /* ignorer */ }
  }

  // ---------- Skjermer ----------
  function show(name) {
    Object.keys(screens).forEach(function (k) { screens[k].hidden = k !== name; });
    $('publishbar').hidden = name !== 'admin';
    var focus = { setup: 'setup-username', login: 'username' }[name];
    if (focus) $(focus).focus();
  }

  function setError(id, msg) {
    $(id).textContent = msg || '';
    $(id).hidden = !msg;
  }

  function userOk(name) {
    return String(name || '').trim().toLowerCase() === String(C.adminUsername).toLowerCase();
  }

  function makeClient(token) {
    return GH.createClient(Object.assign({ token: token }, C.github));
  }

  function friendly(err) {
    if (!err) return 'Noe gikk galt.';
    if (err.code === 'auth') return 'GitHub avviste nøkkelen. Den kan være utløpt eller mangle skrivetilgang. Trykk «Glem denne enheten» og legg inn en ny.';
    if (err.code === 'notfound') return 'Fant ikke datafila på GitHub. Sjekk at nøkkelen gjelder repoet ' + C.github.owner + '/' + C.github.repo + '.';
    return err.message || 'Noe gikk galt.';
  }

  function enterAdmin(c, file) {
    client = c;
    base = core.clone(file.data);
    local = core.clone(file.data);
    sha = file.sha;
    setError('admin-error', '');
    renderAll();
    setPending();
    show('admin');
  }

  // ---------- Oppsett ----------
  $('setup').addEventListener('submit', function (e) {
    e.preventDefault();
    setError('setup-error', '');
    var u = $('setup-username').value, token = $('setup-token').value.trim();
    var p1 = $('setup-password').value, p2 = $('setup-password2').value;
    if (!userOk(u)) return setError('setup-error', 'Ukjent brukernavn.');
    if (!token) return setError('setup-error', 'Lim inn GitHub-nøkkelen.');
    if (p1.length < 8) return setError('setup-error', 'Passordet må ha minst 8 tegn.');
    if (p1 !== p2) return setError('setup-error', 'Passordene er ikke like.');

    var btn = $('setup-btn');
    btn.disabled = true; btn.textContent = 'Sjekker nøkkelen …';
    var c = makeClient(token), file;
    c.getFile().then(function (f) {
      file = f;
      btn.textContent = 'Krypterer …';
      return vault.encryptToken(token, p1);
    }).then(function (blob) {
      if (!writeStore({ user: C.adminUsername, blob: blob })) throw new Error('Telefonen lot meg ikke lagre nøkkelen (privat nettleservindu?).');
      $('setup-token').value = ''; $('setup-password').value = ''; $('setup-password2').value = '';
      enterAdmin(c, file);
    }).catch(function (err) {
      setError('setup-error', friendly(err));
    }).then(function () {
      btn.disabled = false; btn.textContent = 'Lagre og logg inn';
    });
  });

  // ---------- Innlogging ----------
  $('login').addEventListener('submit', function (e) {
    e.preventDefault();
    setError('login-error', '');
    var stored = readStore();
    if (!stored) return show('setup');
    var btn = $('login-btn');
    var pw = $('password').value;
    if (!userOk($('username').value)) return setError('login-error', 'Feil brukernavn eller passord.');
    btn.disabled = true; btn.textContent = 'Logger inn …';
    var c;
    vault.decryptToken(stored.blob, pw).then(function (token) {
      c = makeClient(token);
      return c.getFile();
    }).then(function (file) {
      $('password').value = '';
      enterAdmin(c, file);
    }).catch(function (err) {
      setError('login-error', err && err.code === 'badpassword' ? 'Feil brukernavn eller passord.' : friendly(err));
    }).then(function () {
      btn.disabled = false; btn.textContent = 'Logg inn';
    });
  });

  // ---------- Endringer ----------
  function product(id) {
    return local.products.filter(function (p) { return p.id === id; })[0];
  }

  function change(id, fn) {
    if (busy) return;
    fn(product(id));
    paint(cards[id]);
    setPending();
  }

  function setPending(text) {
    var n = core.changedIds(base, local).length;
    $('publish').disabled = busy || n === 0;
    $('discard').disabled = busy || n === 0;
    if (text) { $('pending').textContent = text; return; }
    $('pending').textContent = n === 0 ? 'Ingen endringer' : (n === 1 ? '1 vare endret – ikke publisert' : n + ' varer endret – ikke publisert');
    $('pending').className = 'publishbar__status' + (n ? ' publishbar__status--dirty' : '');
  }

  function two(n) { return ('0' + n).slice(-2); }

  function publish() {
    if (busy || !core.changedIds(base, local).length) return;
    busy = true;
    setError('admin-error', '');
    $('publish').textContent = 'Publiserer …';
    setPending('Sender til GitHub …');
    var out = core.buildPublish(base, local, new Date());
    client.putFile(core.serialize(out), sha, core.commitMessage(base, local)).then(function (res) {
      sha = res.sha;
      base = core.clone(out);
      local = core.clone(out);
      busy = false;
      renderAll();
      var t = new Date();
      setPending('Publisert kl. ' + two(t.getHours()) + ':' + two(t.getMinutes()) + '. Kundesiden oppdateres om noen minutter.');
    }).catch(function (err) {
      if (err && err.code === 'conflict') {
        return client.getFile().then(function (remote) {
          local = core.rebase(base, local, remote.data);
          base = core.clone(remote.data);
          sha = remote.sha;
          busy = false;
          renderAll();
          setPending();
          setError('admin-error', 'Lageret ble endret av noen andre i mellomtiden. Nyeste versjon er hentet og endringene dine er beholdt. Sjekk tallene og trykk Publiser igjen.');
        });
      }
      throw err;
    }).catch(function (err) {
      busy = false;
      setPending();
      setError('admin-error', 'Ikke publisert: ' + friendly(err));
    }).then(function () {
      $('publish').textContent = 'Publiser';
    });
  }

  $('publish').addEventListener('click', publish);

  $('discard').addEventListener('click', function () {
    if (busy) return;
    local = core.clone(base);
    renderAll();
    setPending();
  });

  // Hent nyeste versjon når appen åpnes igjen og ingenting er ulagret
  document.addEventListener('visibilitychange', function () {
    if (document.hidden || !client || busy || core.changedIds(base, local).length) return;
    client.getFile().then(function (file) {
      if (busy || core.changedIds(base, local).length) return;
      base = core.clone(file.data); local = core.clone(file.data); sha = file.sha;
      renderAll(); setPending();
    }).catch(function () { /* prøver igjen neste gang */ });
  });

  window.addEventListener('beforeunload', function (e) {
    if (local && base && core.changedIds(base, local).length) { e.preventDefault(); e.returnValue = ''; }
  });

  // ---------- Logg ut / glem ----------
  function lock() {
    client = null; base = null; local = null; sha = null;
    $('admin-list').replaceChildren();
    show(readStore() ? 'login' : 'setup');
  }

  $('lock').addEventListener('click', function () {
    if (local && core.changedIds(base, local).length) {
      setError('admin-error', 'Du har endringer som ikke er publisert. Publiser eller forkast dem først.');
      return;
    }
    lock();
  });

  function twoTap(btn, label, action) {
    var armed = false, timer = null;
    btn.addEventListener('click', function () {
      if (!armed) {
        armed = true;
        btn.textContent = 'Trykk igjen for å bekrefte';
        timer = setTimeout(function () { armed = false; btn.textContent = label; }, 4000);
        return;
      }
      clearTimeout(timer); armed = false; btn.textContent = label;
      action();
    });
  }

  function forget() {
    clearStore();
    lock();
  }
  twoTap($('forget'), 'Glem denne enheten', forget);
  twoTap($('login-forget'), 'Bytt GitHub-nøkkel', forget);

  // ---------- Kort per vare ----------
  function paint(c) {
    var p = product(c.id);
    if (document.activeElement !== c.qty) c.qty.value = String(p.qty);
    c.toggle.setAttribute('aria-pressed', p.active ? 'true' : 'false');
    c.toggle.textContent = p.active ? 'Synlig' : 'Skjult';
    c.toggle.setAttribute('aria-label', p.active
      ? p.name + ' vises på kundesiden. Trykk for å skjule.'
      : p.name + ' er skjult og står som «Kommer senere». Trykk for å vise.');
    c.prices.forEach(function (input, i) {
      if (document.activeElement !== input && p.prices[i]) {
        input.value = p.prices[i].amount === null ? '' : String(p.prices[i].amount).replace('.', ',');
      }
    });
    var changed = core.changedIds(base, local).indexOf(c.id) !== -1;
    c.root.classList.toggle('acard--dirty', changed);
    c.meta.textContent = changed ? 'Endret – ikke publisert'
      : (p.updatedAt ? core.formatUpdated(new Date(p.updatedAt)) : '');
    c.meta.className = 'acard__meta' + (changed ? ' acard__meta--saving' : '');
  }

  function buildCard(p) {
    var c = { id: p.id, prices: [] };
    var qtyId = 'qty-' + p.id;
    c.meta = el('span', { class: 'acard__meta' });
    c.toggle = el('button', { type: 'button', class: 'toggle', onclick: function () {
      change(p.id, function (x) { x.active = !x.active; });
    } });
    c.qty = el('input', {
      id: qtyId, type: 'text', inputmode: 'numeric', pattern: '[0-9]*', autocomplete: 'off',
      onchange: function () { change(p.id, function (x) { x.qty = core.parseQty(c.qty.value); }); },
      onfocus: function () { c.qty.select(); }
    });
    var steps = STEPS.map(function (n) {
      var abs = Math.abs(n);
      return el('button', {
        type: 'button', class: 'step' + (n > 0 ? ' step--plus' : ''),
        'aria-label': (n > 0 ? 'Legg til ' : 'Trekk fra ') + abs + ' ' + p.unit,
        text: (n > 0 ? '+' : '−') + abs,
        onclick: function () { change(p.id, function (x) { x.qty = Math.max(0, x.qty + n); }); }
      });
    });
    var priceRows = p.prices.map(function (pr, i) {
      var inputId = 'price-' + p.id + '-' + i;
      var input = el('input', {
        id: inputId, class: 'input', type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: '0',
        onchange: function () {
          var val = core.parseAmount(input.value);
          if (val === undefined) {
            c.meta.textContent = 'Ugyldig pris – bruk bare tall';
            c.meta.className = 'acard__meta acard__meta--error';
            input.value = '';
            return;
          }
          change(p.id, function (x) { x.prices[i].amount = val; });
        },
        onfocus: function () { input.select(); }
      });
      c.prices.push(input);
      var label = pr.label.charAt(0).toUpperCase() + pr.label.slice(1);
      return el('div', { class: 'price-row' }, [
        el('label', { for: inputId, text: label }),
        el('span', { class: 'price-row__right' }, [input, el('span', { class: 'kr', text: 'kr' })])
      ]);
    });
    c.root = el('section', { class: 'acard', 'aria-labelledby': 'h-' + p.id }, [
      el('div', { class: 'acard__head' }, [
        el('div', null, [el('h2', { class: 'acard__title', id: 'h-' + p.id, text: p.name }), c.meta]),
        c.toggle
      ]),
      el('div', { class: 'acard__qty' }, [
        el('label', { for: qtyId, class: 'visually-hidden', text: 'Antall ' + p.name.toLowerCase() + ' på lager' }),
        c.qty,
        el('span', { text: p.unit })
      ]),
      el('div', { class: 'steps' }, steps),
      priceRows.length ? el('div', { class: 'pricebox' }, [el('span', { class: 'pricebox__label', text: 'Pris' })].concat(priceRows)) : null
    ]);
    cards[p.id] = c;
    paint(c);
    return c.root;
  }

  function renderAll() {
    cards = {};
    $('admin-list').replaceChildren.apply($('admin-list'), local.products.map(buildCard));
  }

  // ---------- Start ----------
  show(readStore() ? 'login' : 'setup');
})();
