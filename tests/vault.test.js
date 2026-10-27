'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vault = require('../js/vault.js');

const TOKEN = 'github_pat_TEST_1234567890abcdef';

test('token krypteres og dekrypteres med riktig passord', async () => {
  const blob = await vault.encryptToken(TOKEN, 'hemmelig-passord', { iterations: 1000 });
  assert.equal(blob.v, 1);
  assert.ok(!JSON.stringify(blob).includes('github_pat'), 'tokenet skal ikke ligge i klartekst');
  assert.equal(await vault.decryptToken(blob, 'hemmelig-passord'), TOKEN);
});

test('feil passord gir feil, ikke søppel', async () => {
  const blob = await vault.encryptToken(TOKEN, 'riktig', { iterations: 1000 });
  await assert.rejects(() => vault.decryptToken(blob, 'galt'), /passord/i);
});

test('hver kryptering bruker nytt salt og iv', async () => {
  const a = await vault.encryptToken(TOKEN, 'pw', { iterations: 1000 });
  const b = await vault.encryptToken(TOKEN, 'pw', { iterations: 1000 });
  assert.notEqual(a.salt, b.salt);
  assert.notEqual(a.iv, b.iv);
});

test('standard antall iterasjoner er høyt', async () => {
  assert.ok(vault.DEFAULT_ITERATIONS >= 600000);
});

test('ødelagt blob avvises', async () => {
  await assert.rejects(() => vault.decryptToken({ v: 1, salt: 'x', iv: 'y', ct: 'z', iter: 1000 }, 'pw'));
  await assert.rejects(() => vault.decryptToken(null, 'pw'));
});
