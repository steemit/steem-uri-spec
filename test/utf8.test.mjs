import assert from 'node:assert'
import { encodeOp, encodeOps, encodeTx, decode } from '../lib/index.js'

// --- UTF-8 mojibake regression: CJK payload round-trip ----------------------
{
  const op = ['comment', {
    parent_author: '',
    parent_permlink: 'cn',
    author: 'ety001',
    permlink: 'tuning-local-27b-model-for-agent-frameworks',
    title: '让本地 27B 模型在 Agent 框架里真正干活：一次完整调优实录',
    body: '# 引子\n\n中文内容 with mixed ASCII — 标题、正文都不能乱码。\n\n「」【】￥…—✓ emoji 🚀 test.',
    json_metadata: '{"tags":["cn","cn-dev","ai"],"app":"hermes-agent/1.0"}',
  }]
  const uri = encodeOp(op, {})  // op form
  const { tx } = decode(uri)
  assert.deepStrictEqual(tx.operations[0], op, 'CJK op must round-trip without mojibake')
  assert.ok(tx.operations[0][1].title.includes('让本地'), 'title must contain CJK')
  console.log('PASS: CJK comment op round-trip (op form)')
}

// --- ops form ---------------------------------------------------------------
{
  const ops = [['vote', { voter: 'ety001', author: 'ety001', permlink: '中文测试', weight: 10000 }]]
  const uri = encodeOps(ops, {})
  const { tx } = decode(uri)
  assert.strictEqual(tx.operations[0][1].permlink, '中文测试')
  console.log('PASS: CJK permlink round-trip (ops form)')
}

// --- legacy compatibility: pure-ASCII payloads still decode ------------------
{
  const uri = 'steem://sign/op/WyJ2b3RlIl0'  // not valid JSON payload; use a real one below
  const op = ['vote', { voter: 'ety001', author: 'bob', permlink: 'hello-world', weight: 10000 }]
  const encoded = encodeOp(op, {})
  const { tx } = decode(encoded)
  assert.deepStrictEqual(tx.operations[0], op)
  console.log('PASS: ASCII op round-trip unchanged')
}

// --- legacy mojibake payload decode: old atob-encoded CJK now throws (fatal utf-8) ---
// Old clients produced base64 of UTF-8 bytes; atob-decode gave mojibake but the
// bytes were still the same. Our new decoder reads the same bytes as UTF-8, so
// URLs produced by BOTH old and new encoders decode to correct text.
{
  // simulate an old-style encoder: base64url of the UTF-8 JSON bytes
  const op = ['comment', { parent_author: '', parent_permlink: 'cn', author: 'a', permlink: 'p', title: '中文标题', body: '正文', json_metadata: '{}' }]
  const json = JSON.stringify(op)
  const b64u = Buffer.from(json, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  const { tx } = decode(`steem://sign/op/${b64u}`)
  assert.strictEqual(tx.operations[0][1].title, '中文标题')
  console.log('PASS: old-encoder URL (UTF-8 bytes) decodes correctly with new decoder')
}

// --- invalid UTF-8 bytes should throw a clear error --------------------------
{
  const b64u = Buffer.from([0xff, 0xfe, 0x00]).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  assert.throws(() => decode(`steem://sign/op/${b64u}`), /Invalid payload|encoding/i)
  console.log('PASS: invalid UTF-8 payload rejected with clear error')
}

console.log('ALL UTF-8 TESTS PASSED')
