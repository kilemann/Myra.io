/*
 * Myra gårdsutsalg – krypterer GitHub-tokenet med selgers passord.
 * PBKDF2-SHA256 -> AES-GCM 256. Tokenet lagres bare kryptert på telefonen.
 */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MyraVault = api;
})(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';

  var DEFAULT_ITERATIONS = 600000;

  function subtle() {
    var c = (root && root.crypto) || (typeof crypto !== 'undefined' ? crypto : null);
    if (!c || !c.subtle) throw new Error('Nettleseren mangler støtte for kryptering. Åpne siden via https.');
    return c;
  }

  function toB64(buf) {
    var bytes = new Uint8Array(buf), bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }

  function fromB64(s) {
    var bin = atob(s), out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function deriveKey(password, salt, iterations) {
    var c = subtle();
    return c.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey'])
      .then(function (base) {
        return c.subtle.deriveKey(
          { name: 'PBKDF2', hash: 'SHA-256', salt: salt, iterations: iterations },
          base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
      });
  }

  function encryptToken(token, password, opts) {
    var iterations = (opts && opts.iterations) || DEFAULT_ITERATIONS;
    var c = subtle();
    var salt = c.getRandomValues(new Uint8Array(16));
    var iv = c.getRandomValues(new Uint8Array(12));
    return deriveKey(String(password), salt, iterations).then(function (key) {
      return c.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, new TextEncoder().encode(String(token)));
    }).then(function (ct) {
      return { v: 1, iter: iterations, salt: toB64(salt), iv: toB64(iv), ct: toB64(ct) };
    });
  }

  function decryptToken(blob, password) {
    return Promise.resolve().then(function () {
      if (!blob || blob.v !== 1 || !blob.salt || !blob.iv || !blob.ct) throw new Error('Ugyldig lagret nøkkel.');
      var salt = fromB64(blob.salt), iv = fromB64(blob.iv), ct = fromB64(blob.ct);
      return deriveKey(String(password), salt, blob.iter || DEFAULT_ITERATIONS).then(function (key) {
        return subtle().subtle.decrypt({ name: 'AES-GCM', iv: iv }, key, ct);
      });
    }).then(function (plain) {
      return new TextDecoder().decode(plain);
    }, function (err) {
      if (err && /Ugyldig lagret/.test(err.message)) throw err;
      var e = new Error('Feil passord eller ødelagt lagret nøkkel.');
      e.code = 'badpassword';
      throw e;
    });
  }

  return { DEFAULT_ITERATIONS: DEFAULT_ITERATIONS, encryptToken: encryptToken, decryptToken: decryptToken };
});
