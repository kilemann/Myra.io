/* Myra gårdsutsalg v1.3 – oppdateringsside for selger (lagrer via GitHub) */
(function () {
  'use strict';
  var C = window.MYRA_CONFIG;
  var core = window.MyraCore;
  var vault = window.MyraVault;
  var GH = window.MyraGitHub;
  var el = window.MyraDom.el;

  var STORE_KEY = 'myra-vault-v1';

  var $ = function (id) { return document.getElementById(id); };
  var screens = { setup: $('setup'), login: $('login'), admin: $('admin') };

  var client = null;     // GitHub-klient (tokenet finnes bare i minnet mens du er logget inn)
  var base = null;       // siste versjon fra GitHub
  var local = null;      // versjonen selger redigerer
  var sha = null;
  var busy = false;
  var views = {};        // catId -> { root, toggle, meta, details, items: { itemId -> refs } }

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

  function dirty() { return !!(base && local && core.changedCount(base, local)); }

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
  function category(catId) {
    return local.categories.filter(function (c) { return c.id === catId; })[0];
  }
  function item(catId, itemId) {
    return category(catId).items.filter(function (i) { return i.id === itemId; })[0];
  }

  function change(catId, fn) {
    if (busy) return;
    fn();
    paintCategory(catId);
    setPending();
  }

  function setPending(text) {
    var n = core.changedCount(base, local);
    $('publish').disabled = busy || n === 0;
    $('discard').disabled = busy || n === 0;
    if (text) { $('pending').textContent = text; return; }
    $('pending').textContent = n === 0 ? 'Ingen endringer'
      : (n === 1 ? '1 endring – ikke publisert' : n + ' endringer – ikke publisert');
    $('pending').className = 'publishbar__status' + (n ? ' publishbar__status--dirty' : '');
  }

  function two(n) { return ('0' + n).slice(-2); }

  function publish() {
    if (busy || !dirty()) return;
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
    if (document.hidden || !client || busy || dirty()) return;
    client.getFile().then(function (file) {
      if (busy || dirty()) return;
      base = core.clone(file.data); local = core.clone(file.data); sha = file.sha;
      renderAll(); setPending();
    }).catch(function () { /* prøver igjen neste gang */ });
  });

  window.addEventListener('beforeunload', function (e) {
    if (dirty()) { e.preventDefault(); e.returnValue = ''; }
  });

  // ---------- Logg ut / glem ----------
  function lock() {
    client = null; base = null; local = null; sha = null;
    $('admin-list').replaceChildren();
    show(readStore() ? 'login' : 'setup');
  }

  $('lock').addEventListener('click', function () {
    if (dirty()) {
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

  // ---------- Visning: kategori med varer ----------
  function itemLabel(cat, it, n) {
    if (!cat.namedItems) return it.name;
    return it.name.trim() || ('Type ' + (n + 1));
  }

  function paintCategory(catId) {
    var v = views[catId], cat = category(catId);
    v.toggle.setAttribute('aria-pressed', cat.active ? 'true' : 'false');
    v.toggle.textContent = cat.active ? 'Synlig' : 'Skjult';
    v.toggle.setAttribute('aria-label', cat.active
      ? cat.name + ' vises på kundesiden. Trykk for å skjule.'
      : cat.name + ' er skjult og står som «Kommer senere». Trykk for å vise.');
    var catChanged = core.isCategoryChanged(base, local, catId);
    v.root.classList.toggle('acard--dirty', catChanged);
    var last = core.latestUpdate(cat);
    v.meta.textContent = catChanged ? 'Endret – ikke publisert' : (last ? core.formatUpdated(last) : '');
    v.meta.className = 'acard__meta' + (catChanged ? ' acard__meta--saving' : '');

    cat.items.forEach(function (it, n) {
      var r = v.items[it.id];
      if (document.activeElement !== r.qty) r.qty.value = String(it.qty);
      if (r.name && document.activeElement !== r.name) r.name.value = it.name;
      r.prices.forEach(function (input, i) {
        if (document.activeElement !== input && it.prices[i]) {
          input.value = it.prices[i].amount === null ? '' : String(it.prices[i].amount).replace('.', ',');
        }
      });
      if (r.title) r.title.textContent = itemLabel(cat, it, n);
      r.root.classList.toggle('aitem--dirty', core.isItemChanged(base, local, catId, it.id));
      r.root.classList.toggle('aitem--unnamed', cat.namedItems && !it.name.trim());
    });
  }

  function buildItem(cat, it, n, refs) {
    var key = cat.id + '-' + it.id;
    var qtyId = 'qty-' + key;
    var label = function () { return itemLabel(cat, item(cat.id, it.id), n); };

    if (cat.namedItems) {
      var nameId = 'name-' + key;
      refs.name = el('input', {
        id: nameId, class: 'input', type: 'text', autocomplete: 'off', maxlength: '40',
        placeholder: cat.id === 'syltetoy' ? 'f.eks. Jordbærsyltetøy' : 'f.eks. Jordbær',
        onchange: function () {
          change(cat.id, function () { item(cat.id, it.id).name = refs.name.value.trim(); });
        }
      });
    }
    refs.title = (cat.items.length > 1 || cat.namedItems) ? el('h3', { class: 'aitem__title' }) : null;

    refs.qty = el('input', {
      id: qtyId, type: 'text', inputmode: 'numeric', pattern: '[0-9]*', autocomplete: 'off',
      onchange: function () { change(cat.id, function () { item(cat.id, it.id).qty = core.parseQty(refs.qty.value); }); },
      onfocus: function () { refs.qty.select(); }
    });

    var steps = cat.steps.map(function (s) {
      var abs = Math.abs(s);
      return el('button', {
        type: 'button', class: 'step' + (s > 0 ? ' step--plus' : ''),
        'aria-label': (s > 0 ? 'Legg til ' : 'Trekk fra ') + abs + ' ' + it.unit + ' – ' + label(),
        text: (s > 0 ? '+' : '−') + abs,
        onclick: function () {
          change(cat.id, function () { var x = item(cat.id, it.id); x.qty = Math.max(0, x.qty + s); });
        }
      });
    });

    refs.prices = [];
    var priceRows = it.prices.map(function (pr, i) {
      var inputId = 'price-' + key + '-' + i;
      var input = el('input', {
        id: inputId, class: 'input', type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: '0',
        onchange: function () {
          var val = core.parseAmount(input.value);
          if (val === undefined) {
            views[cat.id].meta.textContent = 'Ugyldig pris – bruk bare tall';
            views[cat.id].meta.className = 'acard__meta acard__meta--error';
            input.value = '';
            return;
          }
          change(cat.id, function () { item(cat.id, it.id).prices[i].amount = val; });
        },
        onfocus: function () { input.select(); }
      });
      refs.prices.push(input);
      return el('div', { class: 'price-row' }, [
        el('label', { for: inputId, text: 'Pris ' + pr.label }),
        el('span', { class: 'price-row__right' }, [input, el('span', { class: 'kr', text: 'kr' })])
      ]);
    });

    refs.root = el('div', { class: 'aitem', 'data-item': it.id }, [
      refs.title,
      refs.name ? el('div', { class: 'field' }, [
        el('label', { for: refs.name.id, text: 'Navn' }), refs.name
      ]) : null,
      el('div', { class: 'acard__qty' }, [
        el('label', { for: qtyId, class: 'visually-hidden', text: 'Antall ' + label() }),
        refs.qty,
        el('span', { text: it.unit })
      ]),
      el('div', { class: 'steps steps--' + cat.steps.length }, steps),
      priceRows.length ? el('div', { class: 'pricebox' }, priceRows) : null
    ]);
    return refs.root;
  }

  function buildCategory(cat) {
    var v = { items: {} };
    v.meta = el('span', { class: 'acard__meta' });
    v.toggle = el('button', { type: 'button', class: 'toggle', onclick: function () {
      change(cat.id, function () { var c = category(cat.id); c.active = !c.active; });
    } });
    var itemNodes = cat.items.map(function (it, n) {
      var refs = {};
      v.items[it.id] = refs;
      return buildItem(cat, it, n, refs);
    });
    var body;
    if (cat.items.length > 2) {
      // Mange varer: samlet i en sammenleggbar seksjon, åpen når kategorien er synlig
      v.details = el('details', { class: 'acat__details', open: cat.active }, [
        el('summary', { text: cat.namedItems ? 'Varer og navn (' + cat.items.length + ')' : 'Varer (' + cat.items.length + ')' }),
        el('div', { class: 'acat__items' }, itemNodes)
      ]);
      body = v.details;
    } else {
      body = el('div', { class: 'acat__items' }, itemNodes);
    }
    v.root = el('section', { class: 'acard', 'aria-labelledby': 'h-' + cat.id, 'data-category': cat.id }, [
      el('div', { class: 'acard__head' }, [
        el('div', null, [el('h2', { class: 'acard__title', id: 'h-' + cat.id, text: cat.name }), v.meta]),
        v.toggle
      ]),
      body
    ]);
    views[cat.id] = v;
    paintCategory(cat.id);
    return v.root;
  }

  function renderAll() {
    views = {};
    $('admin-list').replaceChildren.apply($('admin-list'), local.categories.map(buildCategory));
  }

  // ---------- Start ----------
  show(readStore() ? 'login' : 'setup');
})();
