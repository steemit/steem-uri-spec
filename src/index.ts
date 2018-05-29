/**
 * Steem URI Signing Protocol
 * @author Johan Nordberg <johan@steemit.com>
 */

// Only used for typings, no code is pulled in.
import {Operation, Transaction} from 'dsteem'

// Assumes node.js if any of the utils needed are missing.
if (typeof URL === 'undefined') {
    global['URL'] = require('url').URL
}
if (typeof URLSearchParams === 'undefined') {
    global['URLSearchParams'] = require('url').URLSearchParams
}
if (typeof btoa === 'undefined') {
    global['btoa'] = (str) => new Buffer(str, 'binary').toString('base64')
}
if (typeof atob === 'undefined') {
    global['atob'] = (str) => new Buffer(str, 'base64').toString('binary')
}

/// URL-safe Base64 encoding and decoding.
const B64U_LOOKUP = {'/': '_', '_': '/', '+': '-', '-': '+', '=': '.', '.': '='}
const b64uEnc = (str) => btoa(str).replace(/(\+|\/|=)/g, (m) => B64U_LOOKUP[m])
const b64uDec = (str) => atob(str.replace(/(-|_|\.)/g, (m) => B64U_LOOKUP[m]))

/**
 * Protocol parameters.
 */
export interface Parameters {
    /** Requested signer. */
    signer?: string
    /** Redurect uri. */
    callback?: string
    /** Whether to just sign the transaction. */
    no_broadcast?: boolean
}

/**
 * A transactions that may contain placeholders.
 */
export interface UnresolvedTransaction extends Transaction {
    ref_block_num: any
    ref_block_prefix: any
    expiration: any
    operations: any[]
}

/**
 * Decoding result.
 */
export interface DecodeResult {
    /**
     * Decoded transaction. May have placeholders, use {@link resolve} to
     * resolve them into a signable transaction.
     */
    tx: UnresolvedTransaction
    /**
     * Decoded protocol parameters.
     */
    params: Parameters
}

/**
 * Parse a steem:// protocol link.
 * @param steemUrl The `steem:` url to parse.
 * @throws If the url can not be parsed.
 * @returns The resolved transaction and parameters.
 */
export function decode(steemUrl: string): DecodeResult {
    const url = new URL(steemUrl)
    if (url.protocol !== 'steem:') {
        throw new Error(`Invalid protocol, expected 'steem:' got '${ url.protocol }'`)
    }
    if (url.host !== 'sign') {
        throw new Error(`Invalid action, expected 'sign' got '${ url.host }'`)
    }
    const [type, rawPayload] = url.pathname.split('/').slice(1)
    let payload: any
    try {
        payload = JSON.parse(b64uDec(rawPayload))
    } catch (error) {
        error.message = `Invalid payload: ${ error.message }`
        throw error
    }
    let tx: UnresolvedTransaction
    switch (type) {
        case 'tx':
            tx = payload
            break
        case 'op':
        case 'ops':
            const operations: any[] = type === 'ops' ? payload : [payload]
            tx = {
                ref_block_num: '__ref_block_num',
                ref_block_prefix: '__ref_block_prefix',
                expiration: '__expiration',
                extensions: [],
                operations,
            }
            break
        // case 'transfer':
        // case 'follow':
        default:
            throw new Error(`Invalid signing action '${ type }'`)
    }
    const params: Parameters = {}
    if (url.searchParams.has('cb')) {
        params.callback = b64uDec(url.searchParams.get('cb')!)
    }
    if (url.searchParams.has('nb')) {
        params.no_broadcast = true
    }
    if (url.searchParams.has('s')) {
        params.signer = url.searchParams.get('s')!
    }
    return {tx, params}
}

/**
 * Transaction resolving options.
 */
export interface ResolveOptions {
    /** The ref block number used to fill in the `__ref_block_num` placeholder. */
    ref_block_num: number
    /** The ref block prefix used to fill in the `__ref_block_prefix` placeholder. */
    ref_block_prefix: number
    /** The date string used to fill in the `__expiration` placeholder. */
    expiration: string,
    /** List of account names avialable as signers. */
    signers: string[]
    /** Preferred signer if none is explicitly set in params. */
    preferred_signer: string
}

/**
 * Transaction resolving result.
 */
export interface ResolveResult {
    /** The resolved transaction ready to be signed. */
    tx: Transaction,
    /** The account that should sign the transaction. */
    signer: string,
}

const RESOLVE_PATTERN = /(__(ref_block_(num|prefix)|expiration|signer))/g

/**
 * Resolves placeholders in a transaction.
 * @param utx Unresolved transaction data.
 * @param params Protocol parameters.
 * @param options Values to use when resolving.
 * @returns The resolved transaction and signer.
 */
export function resolveTransaction(utx: UnresolvedTransaction, params: Parameters, options: ResolveOptions): ResolveResult {
    const signer = params.signer || options.preferred_signer
    if (!options.signers.includes(signer)) {
        throw new Error(`Signer '${ signer }' not available`)
    }
    const ctx = {
        __ref_block_num: options.ref_block_num,
        __ref_block_prefix: options.ref_block_prefix,
        __expiration: options.expiration,
        __signer: signer,
    }
    const walk = (val: any) => {
        let type: string = typeof val
        if (type === 'object' && Array.isArray(val)) {
            type = 'array'
        } else if (val === null) {
            type = 'null'
        }
        switch (type) {
            case 'string':
                return val.replace(RESOLVE_PATTERN, (m) => ctx[m])
            case 'array':
                return val.map(walk)
            case 'object': {
                const rv: any = {}
                for (const [k, v] of Object.entries(val)) {
                    rv[k] = walk(v)
                }
                return rv
            }
            default:
                return val
        }
    }
    let tx = walk(utx) as Transaction
    return {signer, tx}
}

/**
 * Transaction confirmation including signature.
 */
export interface TransactionConfirmation {
    /** Transaction signature. */
    sig: string
    /** Transaction hash. */
    id?: string
    /** Block number transaction was included in. */
    block?: number
    /** Transaction index in block. */
    txn?: number
}

const CALLBACK_RESOLVE_PATTERN = /({{(sig|id|block|txn)}})/g

/**
 * Resolves template vars in a callback url.
 * @param url The callback url.
 * @param ctx Values to use when resolving.
 * @returns The resolved url.
 */
export function resolveCallback(url: string, ctx: TransactionConfirmation) {
    return url.replace(CALLBACK_RESOLVE_PATTERN, (_1, _2, m) => ctx[m] || '')
}

/*** Internal helper to encode Parameters to a querystring. */
function encodeParameters(params: Parameters) {
    const out = new URLSearchParams()
    if (params.no_broadcast === true) {
        out.set('nb', '')
    }
    if (params.signer) {
        out.set('s', params.signer)
    }
    if (params.callback) {
        out.set('cb', b64uEnc(params.callback))
    }
    let qs = out.toString()
    if (qs.length > 0) {
        qs = '?' + qs
    }
    return qs
}

/** Internal helper to encode a tx or op to a b64u+json payload. */
function encodeJson(data: any) {
    return b64uEnc(JSON.stringify(data, null, 0))
}

/** Encodes a Steem transaction to a steem: URI. */
export function encodeTx(tx: Transaction, params: Parameters = {}) {
    return `steem://sign/tx/${ encodeJson(tx) }${ encodeParameters(params) }`
}

/** Encodes a Steem operation to a steem: URI. */
export function encodeOp(op: Operation, params: Parameters = {}) {
    return `steem://sign/op/${ encodeJson(op) }${ encodeParameters(params) }`
}

/** Encodes several Steem operations to a steem: URI. */
export function encodeOps(ops: Operation, params: Parameters = {}) {
    return `steem://sign/ops/${ encodeJson(ops) }${ encodeParameters(params) }`
}
