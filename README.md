
Steem URI protocol
==================

Protocol facilitating signing of steem transactions. Meant to be implemented by secure Steem wallet applications.

This repository contains both the specification and a zero dependency reference implementation that works in node.js and most browsers.


Installation
------------

Via npm or yarn:

```
npm install steem-uri
yarn add steem-uri
```

Manually: clone the repository and run `make`, this will place the built lib in `lib/index.js`.


Example usage
-------------

Encoding operations:

```js
const steemuri = require('steem-uri')

steemuri.encodeOp(['vote', {voter: 'foo', author: 'bar', permlink: 'baz', weight: 10000}])
// steem://sign/op/WyJ2b3RlIix7InZvdGVyIjoiZm9vIiwiYXV0aG9yIjoiYmFyIiwicGVybWxpbmsiOiJiYXoiLCJ3ZWlnaHQiOjEwMDAwfV0.

steemuri.encodeOps([
    ['vote', {voter: 'foo', author: 'bar', permlink: 'baz', weight: 10000}],
    ['transfer', {from: 'foo', to: 'bar', amount: '10.000 STEEM', memo: 'baz'}]
], {callback: 'https://example.com/wallet?tx={{id}}'})
// steem://sign/ops/W1sidm90ZSIseyJ2b3RlciI6ImZvbyIsImF1dGhvciI6ImJhciIsInBlcm1saW5rIjoiYmF6Iiwid2VpZ2h0IjoxMDAwMH1dLFsidHJhbnNmZXIiLHsiZnJvbSI6ImZvbyIsInRvIjoiYmFyIiwiYW1vdW50IjoiMTAuMDAwIFNURUVNIiwibWVtbyI6ImJheiJ9XV0.?cb=aHR0cHM6Ly9leGFtcGxlLmNvbS93YWxsZXQ_dHg9e3tpZH19
```

Decoding and resolving steem:// links (for wallet implementers):

```js
const steemuri = require('steem-uri')

// parse the steem:// link
const parsed = steemuri.decode(link)

// resolve the decoded tx and params to a signable tx
let {tx, signer} = steemuri.resolveTransaction(parsed.tx, parsed.params, {
    // e.g. from a get_dynamic_global_properties call
    ref_block_num: 1234,
    ref_block_prefix: 5678900,
    expiration: '2020-01-01T00:00:00',
    // accounts we are able to sign for
    signers: ['foo', 'bar'],
    // selected signer if none is asked for by the params
    preferred_signer: 'foo',
})

// sign broadcast the transaction to the network
let signature = signTx(tx, myKeys[signer])
let confirmation
if (!parsed.params.no_broadcast) {
    tx.signatures = [signature]
    confirmation = broadcastTx(tx)
}

// redirect to the callback if set
if (parsed.params.callback) {
    let url = steemuri.resolveCallback(parsed.params.callback, {
        sig: signature,
        id: confirmation.id,
        block: confirmation.block_num,
        txn: confirmation.txn_num,
    })
    redirectTo(url)
}
```

---

Specification
=============

A protocol that allows Steem transactions and operations to be encoded into links that can be shared across applications and devices to sign transactions without implementers having to reveal their private key.


Actions
-------

  * `steem://sign/tx/<base64u(JSON-encoded tx)>`
    Sign an arbitrary transaction.
  * `steem://sign/op/<base64u(JSON-encoded op)>`
    As above but constructs a transaction around the operation before signing.
  * `steem://sign/ops/<base64u(JSON-encoded op array)>`
    As above but allows multiple operations as an array.
  * `steem://sign/<operation_name>[/operation_params..]`
    Action aliases, see the "Specialized actions" section for more info.

To facilitate re-usable signing URIs the implementation allows for a set of placeholder variables that can be used in a signing payload.

  * `__signer` - Replaced with the username of the signer
  * `__expiration` - Replaced with current time plus some padding to allow the transaction to be broadcasted*
  * `__ref_block_num` - Reference block number*
  * `__ref_block_prefix` - Reference block id*

*Reasonable values are up to the implementer, suggested expiry time is 60 seconds ahead of rpc node time and the reference block set to the current head block.



Parameters
----------

Params are global to all actions and encoded as query string params.

  * `s` (signer) - Preferred signer, if the implementer has multiple signing keys available it should pre-fill the correct authority. If the implementer does not have a key for the preferred signer a warning should be shown to the user. If omitted the implementer may auto select a signer based on the transaction parameters.

  * `nb` (no_broadcast) - If set the implementer should only sign the transaction and pass the signature back in the callback.

  * `cb` (callback) - Base64u encoded url that will be redirected to when the transaction has been signed. The url also allows some templating, see the callback section below for more info.

Params uses short names to save space in encoded URIs.


Callbacks
---------

Callbacks should be redirected to once the transaction has been accepted by the network. If the callback url is a web link only `https` should be allowed.

The callbacks also allow simple templating with some response parameters, the templating format is `{{<param_name>}}`, e.g. `https://myapp.com/wallet?tx={{id}}&included_in={{block}}` or `mymobileapp://signed/{{sig}}`

Callback template params:

  * `sig` - Hex-encoded string containing the 65-byte transaction signature
  * `id` - Hex-encoded string containing the 20-byte transaction hash*
  * `block` - The block number the transaction was included in*
  * `txn` - The block transaction index*

*Will not be available if the `nb` param was set for the action.



Base64u
-------

An URL-safe version base64 where `+` is replaced by `-`, `/` by `_` and the `=` padding by `.`.

```
base64
SGn+dGhlcmUh/k5pY2X+b2b+eW91/nRv/mRlY29kZf5tZf46KQ==
base64u
SGn-dGhlcmUh_k5pY2X-b2b-eW91_nRv_mRlY29kZf5tZf46KQ..
```

JavaScript implementation:

```js
b64u_lookup = {'/': '_', '_': '/', '+': '-', '-': '+', '=': '.', '.': '='}
b64u_enc = (str) => btoa(str).replace(/(\+|\/|=)/g, (m) => b64u_lookup[m])
b64u_dec = (str) => atob(str.replace(/(-|_|\.)/g, (m) => b64u_lookup[m]))
```


Specialized actions
-------------------

To keep the length of the URIs short, and the QR code size manageable, some common operations have aliases. See list below for supported aliases, params noted in operation payloads using the format `{{param_name}}` and optional (`[param_name]`) params should be filled with empty strings unless otherwise specified:

### Transfer tokens

Action: `steem://sign/follow/<username>/<amount>[/memo]`

Params:

  * `username` - User that should be followed by `__signer`
  * `amount` - Amount to transfer, e.g. `1.000 STEEM`
  * `memo` - Base64u encoded memo, optional.

Operation:

```json
["transfer", {
  "from": "__signer",
  "to": "{{username}}",
  "amount": "{{amount}}",
  "memo": "{{memo}}"
}]
```

### Follow user

Action: `steem://sign/follow/<username>`

Params:

  * `<username>` - User that should be followed by `__signer`.

Operation:

```json
["custom_json", {
  "required_auths": [],
  "required_posting_auths": ["__signer"],
  "id": "follow",
  "json": "[\"follow\",{\"follower\":\"__signer\",\"following\":\"{{username}}\",\"what\":[\"blog\"]}]"
}]
```


Examples
--------

Example usage of the protocol along with data for every step that can be used in tests. Examples assumes a `__signer` of `foo` a `__expiration` of `1970-01-01T00:00:00` and `__ref_block_num`, `__ref_block_prefix` set to `0`.

### Send a limit order

Might be requested from a trading app, here we don't use any templating since we never want the transaction to be reusable.

Transaction:

```json
{
  "ref_block_num": 48872,
  "ref_block_prefix": 1543858519,
  "expiration": "2018-05-29T13:17:39",
  "extensions": [],
  "operations": [
    ["limit_order_create2", {
      "owner": "foo",
      "orderid": 1,
      "amount_to_sell": "10.000 STEEM",
      "fill_or_kill": false,
      "exchange_rate": {"base": "1.000 STEEM", "quote": "0.420 SBD"},
      "expiration": "2018-05-30T00:00:00"
    }]
  ]
}
```

Parameters:

```json
{
  "signer": "foo",
  "callback": "https://steem.trader/sign_callback?id={{id}}"
}
```

Encoded:

```
steem://sign/tx/eyJyZWZfYmxvY2tfbnVtIjo0ODg3MiwicmVmX2Jsb2NrX3ByZWZpeCI6MTU0Mzg1ODUxOSwiZXhwaXJhdGlvbiI6IjIwMTgtMDUtMjlUMTM6MTc6MzkiLCJleHRlbnNpb25zIjpbXSwib3BlcmF0aW9ucyI6W1sibGltaXRfb3JkZXJfY3JlYXRlMiIseyJvd25lciI6ImZvbyIsIm9yZGVyaWQiOjEsImFtb3VudF90b19zZWxsIjoiMTAuMDAwIFNURUVNIiwiZmlsbF9vcl9raWxsIjpmYWxzZSwiZXhjaGFuZ2VfcmF0ZSI6eyJiYXNlIjoiMS4wMDAgU1RFRU0iLCJxdW90ZSI6IjAuNDIwIFNCRCJ9LCJleHBpcmF0aW9uIjoiMjAxOC0wNS0zMFQwMDowMDowMCJ9XV19?s=foo&cb=aHR0cHM6Ly9zdGVlbS50cmFkZXIvc2lnbl9jYWxsYmFjaz9pZD17e2lkfX0.
```

### Witness vote

Reusable witness vote URI, e.g. for a "Vote for me!" QR code t-shirt.

Operation:

```json
["account_witness_vote", {
  "account": "__signer",
  "witness": "jesta",
  "approve": true
}]
```

Encoded:

```
steem://sign/op/WyJhY2NvdW50X3dpdG5lc3Nfdm90ZSIseyJhY2NvdW50IjoiX19zaWduZXIiLCJ3aXRuZXNzIjoiamVzdGEiLCJhcHByb3ZlIjp0cnVlfV0.
```

