/**
 * E2E tests: run against the built package (lib/) to verify CJS and ESM entry points.
 * Requires: pnpm run build (or prepublish) before running.
 * Run: node test/e2e.test.mjs  or  pnpm run test:e2e
 */
import test from 'node:test';
import assert from 'node:assert';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const libCjs = join(__dirname, '..', 'lib', 'index.cjs');
const libEsm = join(__dirname, '..', 'lib', 'index.js');

const voteOp = ['vote', { voter: 'foo', author: 'bar', permlink: 'baz', weight: 10000 }];
const transferOp = ['transfer', { from: 'foo', to: 'bar', amount: '10.000 STEEM', memo: '' }];
const resolveOptions = {
  ref_block_num: 1234,
  ref_block_prefix: 5678900,
  expiration: '2020-01-01T00:00:00',
  signers: ['foo', 'bar'],
  preferred_signer: 'foo',
};

/** Run all e2e assertions against a loaded steem-uri module (no nested test()). */
function runSuite(steemuri) {
  // encodeOp -> decode round-trip (default protocol web+steem)
  const uri = steemuri.encodeOp(voteOp);
  assert.ok(uri.startsWith('web+steem://sign/op/'), 'encodeOp: default URI starts with web+steem://sign/op/');
  let { tx, params } = steemuri.decode(uri);
  assert.ok(tx.operations, 'decode: tx has operations');
  assert.strictEqual(tx.operations.length, 1);
  assert.deepStrictEqual(tx.operations[0], voteOp);
  assert.strictEqual(Object.keys(params).length, 0);

  // encodeOp with protocol steem
  const uriSteem = steemuri.encodeOp(voteOp, {}, 'steem');
  assert.ok(uriSteem.startsWith('steem://sign/op/'), 'encodeOp(steem): URI starts with steem://sign/op/');
  const { tx: txSteem } = steemuri.decode(uriSteem);
  assert.deepStrictEqual(txSteem.operations[0], voteOp);

  // encodeOp with protocol ext+steem
  const uriExt = steemuri.encodeOp(voteOp, {}, 'ext+steem');
  assert.ok(uriExt.startsWith('ext+steem://sign/op/'), 'encodeOp(ext+steem): URI starts with ext+steem://sign/op/');
  const { tx: txExt } = steemuri.decode(uriExt);
  assert.deepStrictEqual(txExt.operations[0], voteOp);

  // encodeOps -> decode with params
  const paramsWithCb = { callback: 'https://example.com/wallet?tx={{id}}', signer: 'foo' };
  const uriOps = steemuri.encodeOps([voteOp, transferOp], paramsWithCb);
  assert.ok(uriOps.startsWith('web+steem://sign/ops/'), 'encodeOps: URI starts with web+steem://sign/ops/');
  assert.ok(uriOps.includes('?'), 'encodeOps: URI has query string');
  const { tx: txOps, params: decodedParams } = steemuri.decode(uriOps);
  assert.strictEqual(txOps.operations.length, 2);
  assert.strictEqual(decodedParams.signer, 'foo');
  assert.strictEqual(decodedParams.callback, 'https://example.com/wallet?tx={{id}}');

  // encodeTx -> decode
  const fullTx = {
    ref_block_num: 1,
    ref_block_prefix: 2,
    expiration: '2020-01-01T00:00:00',
    extensions: [],
    operations: [voteOp],
  };
  const uriTx = steemuri.encodeTx(fullTx);
  assert.ok(uriTx.startsWith('web+steem://sign/tx/'), 'encodeTx: URI starts with web+steem://sign/tx/');
  const { tx: decodedTx } = steemuri.decode(uriTx);
  assert.strictEqual(decodedTx.ref_block_num, 1);
  assert.strictEqual(decodedTx.ref_block_prefix, 2);
  assert.strictEqual(decodedTx.operations.length, 1);

  // resolveTransaction replaces placeholders
  const opWithPlaceholder = ['vote', { voter: '__signer', author: 'bar', permlink: 'baz', weight: 10000 }];
  const uriPlaceholder = steemuri.encodeOp(opWithPlaceholder);
  const { tx: utx, params: p } = steemuri.decode(uriPlaceholder);
  const { signer, tx: resolvedTx } = steemuri.resolveTransaction(utx, p, resolveOptions);
  assert.strictEqual(signer, 'foo');
  assert.strictEqual(resolvedTx.operations[0][1].voter, 'foo');
  assert.strictEqual(Number(resolvedTx.ref_block_num), 1234);
  assert.strictEqual(Number(resolvedTx.ref_block_prefix), 5678900);
  assert.strictEqual(String(resolvedTx.expiration), '2020-01-01T00:00:00');

  // resolveTransaction throws when signer not in list
  const uriBaz = steemuri.encodeOp(voteOp, { signer: 'baz' });
  const { tx: txBaz, params: paramsBaz } = steemuri.decode(uriBaz);
  assert.throws(
    () => steemuri.resolveTransaction(txBaz, paramsBaz, resolveOptions),
    /Signer 'baz' not available/
  );

  // resolveCallback substitutes template vars
  const url = 'https://example.com/cb?sig={{sig}}&id={{id}}&block={{block}}&txn={{txn}}';
  const ctx = { sig: 'abc', id: 'def', block: 100, txn: 2 };
  const resolved = steemuri.resolveCallback(url, ctx);
  assert.strictEqual(resolved, 'https://example.com/cb?sig=abc&id=def&block=100&txn=2');

  // decode accepts legacy steem:// (backward compatibility)
  const legacyUri = steemuri.encodeOp(voteOp, {}, 'steem');
  const { tx: legacyTx } = steemuri.decode(legacyUri);
  assert.strictEqual(legacyTx.operations.length, 1);
  assert.deepStrictEqual(legacyTx.operations[0], voteOp);

  // decode accepts ext+steem:// (browser extension usage)
  const extUri = steemuri.encodeOp(voteOp, {}, 'ext+steem');
  const { tx: extTx } = steemuri.decode(extUri);
  assert.strictEqual(extTx.operations.length, 1);
  assert.deepStrictEqual(extTx.operations[0], voteOp);

  // decode rejects invalid protocol
  assert.throws(() => steemuri.decode('https://sign/op/x'), /Invalid protocol/);

  // decode rejects invalid action
  assert.throws(() => steemuri.decode('web+steem://other/op/x'), /Invalid action/);
}

test('E2E: CommonJS entry (lib/index.cjs)', () => {
  const steemuri = require(libCjs);
  runSuite(steemuri);
});

test('E2E: ESM entry (lib/index.js)', async () => {
  const steemuri = await import(libEsm);
  runSuite(steemuri);
});
