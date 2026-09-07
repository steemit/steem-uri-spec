# Changelog

## 0.2.2

- fix: UTF-8 aware base64url encode/decode for non-ASCII payloads (#6).
  `b64uEnc`/`b64uDec` previously used `btoa`/`atob` latin1 binary-string
  semantics, which corrupted non-ASCII payloads (e.g. CJK titles/bodies in
  `comment` ops decoded to mojibake). Encoding now serializes the string's
  UTF-8 bytes; decoding parses them back with a fatal `TextDecoder`.
- **Behavior change**: payloads whose bytes are not valid UTF-8 now throw a
  clear `Invalid payload` error from `decode()` instead of silently producing
  mojibake. URLs produced by encoders that base64'd raw UTF-8 bytes decode
  correctly; pure-ASCII payloads are byte-identical and unchanged.
- fix: `encodeOps` parameter type corrected from `Operation` to `Operation[]`.
- docs: README Base64u section now specifies UTF-8 serialization/parsing; the
  previous `btoa`/`atob`-only snippet documented the buggy latin1 behavior.

## 0.2.1

- New links use the `web+steem:` protocol scheme; `decode()` accepts `steem:`,
  `web+steem:`, and `ext+steem:` for backward compatibility.
- `encodeTx()`, `encodeOp()`, and `encodeOps()` accept an optional `protocol`
  argument (`'steem'`, `'web+steem'` (default), or `'ext+steem'`).

## 0.2.0

- Dual ESM/CJS build; pnpm + Node 20 toolchain; e2e entry-point tests.
- Published as the scoped `@steemit/steem-uri` package.
