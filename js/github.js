/*
 * Myra gårdsutsalg – leser og skriver datafila via GitHubs Contents API.
 * Dokumentasjon: https://docs.github.com/rest/repos/contents
 */
(function (root, factory) {
  var core = (typeof module === 'object' && module.exports) ? require('./core.js') : root.MyraCore;
  var api = factory(core, root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MyraGitHub = api;
})(typeof self !== 'undefined' ? self : this, function (core, root) {
  'use strict';

  var COMMITTER = { name: 'Myra lager', email: 'lager@myra.invalid' };

  function fail(code, message, status) {
    var e = new Error(message);
    e.code = code;
    e.status = status;
    return e;
  }

  function createClient(opts) {
    var doFetch = opts.fetch || (root && root.fetch && root.fetch.bind(root));
    var base = 'https://api.github.com/repos/' + encodeURIComponent(opts.owner) + '/' +
      encodeURIComponent(opts.repo) + '/contents/' + opts.path.split('/').map(encodeURIComponent).join('/');

    function request(url, init) {
      init = init || {};
      init.cache = 'no-store';
      init.headers = Object.assign({
        Accept: 'application/vnd.github+json',
        Authorization: 'Bearer ' + opts.token
      }, init.headers || {});
      return Promise.resolve().then(function () { return doFetch(url, init); }).then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (body) {
          if (res.ok) return body;
          var msg = (body && body.message) || ('HTTP ' + res.status);
          if (res.status === 409) throw fail('conflict', 'Fila er endret av noen andre i mellomtiden.', 409);
          if (res.status === 401 || res.status === 403) throw fail('auth', 'GitHub avviste nøkkelen (' + msg + ').', res.status);
          if (res.status === 404) throw fail('notfound', 'Fant ikke repoet eller fila – sjekk nøkkelens tilgang.', 404);
          throw fail('http', 'GitHub svarte med feil: ' + msg, res.status);
        });
      }, function (err) {
        if (err && err.code) throw err;
        throw fail('network', 'Får ikke kontakt med GitHub. Sjekk nettforbindelsen.');
      });
    }

    function getFile() {
      return request(base + '?ref=' + encodeURIComponent(opts.branch)).then(function (body) {
        var text = core.decodeBase64Utf8(body.content || '');
        var parsed;
        try { parsed = JSON.parse(text); } catch (e) { throw fail('format', 'Datafila på GitHub er ikke gyldig JSON.'); }
        return { sha: body.sha, data: core.normalizeData(parsed) };
      });
    }

    function putFile(text, sha, message) {
      var body = {
        message: message,
        content: core.encodeBase64Utf8(text),
        branch: opts.branch,
        committer: COMMITTER,
        author: COMMITTER
      };
      if (sha) body.sha = sha;
      return request(base, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      }).then(function (res) {
        return { sha: res && res.content && res.content.sha };
      });
    }

    return { getFile: getFile, putFile: putFile };
  }

  return { createClient: createClient, COMMITTER: COMMITTER };
});
