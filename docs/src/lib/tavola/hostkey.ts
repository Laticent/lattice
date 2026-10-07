// The host's identity. A link holder could otherwise answer a newcomer's lobby first, or step in
// while the real host is away, and pose as the host (red-team, 2026-10-06). So the host makes an
// ECDSA P-256 key pair, the link carries a fingerprint of its public key, and every hello is signed
// over the sender's and the recipient's peer ids. A guest accepts a host only if the key matches the
// link and the signature checks — which also lets a host that RELOADED (new peer id, same saved key)
// prove it is the same host.

import { toBase64Url } from './link';

const ALG = { name: 'ECDSA', namedCurve: 'P-256' } as const;
const SIG = { name: 'ECDSA', hash: 'SHA-256' } as const;
const enc = new TextEncoder();
const subtle = () => globalThis.crypto.subtle;

export type HostKey = { privateKey: CryptoKey; publicRaw: Uint8Array; fingerprint: string };
/** What a host keeps across its own reload (JSON-safe). */
export type SavedHostKey = { priv: JsonWebKey; pub: string };

export function fromBase64Url(s: string): Uint8Array {
	const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));
	return Uint8Array.from(b, (c) => c.charCodeAt(0));
}

/** 128 bits of SHA-256 over the raw public key, base64url: 22 characters in the link. */
export async function fingerprintOf(publicRaw: Uint8Array): Promise<string> {
	const h = new Uint8Array(await subtle().digest('SHA-256', publicRaw as BufferSource));
	return toBase64Url(h.subarray(0, 16));
}

/**
 * A new host key. Pass `extractable: false` to keep the private key inside WebCrypto: it can sign
 * and can be stored as a CryptoKey object (IndexedDB), but no script can read its bytes out.
 */
export async function createHostKey({ extractable = true }: { extractable?: boolean } = {}): Promise<HostKey> {
	const pair = await subtle().generateKey(ALG, extractable, ['sign', 'verify']);
	const publicRaw = new Uint8Array(await subtle().exportKey('raw', pair.publicKey));
	return { privateKey: pair.privateKey, publicRaw, fingerprint: await fingerprintOf(publicRaw) };
}

/** Rebuild a HostKey from a stored private CryptoKey and its raw public key. */
export async function hostKeyFrom(privateKey: CryptoKey, publicRaw: Uint8Array): Promise<HostKey> {
	return { privateKey, publicRaw, fingerprint: await fingerprintOf(publicRaw) };
}

export async function saveHostKey(k: HostKey): Promise<SavedHostKey> {
	return { priv: await subtle().exportKey('jwk', k.privateKey), pub: toBase64Url(k.publicRaw) };
}

export async function loadHostKey(s: SavedHostKey): Promise<HostKey> {
	const privateKey = await subtle().importKey('jwk', s.priv, ALG, true, ['sign']);
	const publicRaw = fromBase64Url(s.pub);
	return { privateKey, publicRaw, fingerprint: await fingerprintOf(publicRaw) };
}

const helloData = (from: string, to: string) => enc.encode(`tavola-hello|${from}|${to}`);

export async function signHello(k: HostKey, from: string, to: string): Promise<string> {
	return toBase64Url(new Uint8Array(await subtle().sign(SIG, k.privateKey, helloData(from, to))));
}

/** True only if `pub` matches the link's fingerprint AND `sig` signs (from → to) with it. */
export async function verifyHello(fingerprint: string, pub: string, sig: string, from: string, to: string): Promise<boolean> {
	try {
		const raw = fromBase64Url(pub);
		if ((await fingerprintOf(raw)) !== fingerprint) return false;
		const key = await subtle().importKey('raw', raw as BufferSource, ALG, false, ['verify']);
		return await subtle().verify(SIG, key, fromBase64Url(sig) as BufferSource, helloData(from, to));
	} catch {
		return false;
	}
}

// ── succession ────────────────────────────────────────────────────────────
// A host cannot hand its key on: in the Studio it is a non-extractable CryptoKey. Instead it
// CERTIFIES the next host's own key: a cert says "the key `pub` may host at `term`", signed by the
// key that hosts now. A hello carries the chain of certs from the link's key to the key that
// signed it, so a guest checks a delegated host exactly as it checks the first one: the chain must
// start at the key the link names, every cert must check against the key before it, and the terms
// must rise. The HIGHEST term is the current host.
//
// Every cert also carries a CEILING (`max`): the highest term its key may ever reach, by
// certifying itself or anyone after it. A cert can only narrow its issuer's range. That is what
// makes a withdrawal stick: a host withdraws a cert by certifying itself above the cert's ceiling,
// and the withdrawn key can never sign its way back above that (red team, 2026-10-07: without a
// ceiling, an heir could self-certify at any term). The link's own key has no ceiling, so the
// session's first host can always out-rank every key it ever certified. See session.ts.

/** "The key `pub` may host at `term`, and never above `max`", signed by the key before it. */
export type Cert = { pub: string; term: number; max: number; sig: string };
/** The link key's own ceiling: none. */
export const ROOT_MAX = Number.MAX_SAFE_INTEGER;
/** Longest chain a guest accepts: 16 handoffs, each adding a cert and at most one self-cert. */
export const MAX_CHAIN = 32;

const certData = (pub: string, term: number, max: number) => enc.encode(`tavola-heir|${pub}|${term}|${max}`);

export async function signCert(k: HostKey, pub: string, term: number, max: number): Promise<Cert> {
	return { pub, term, max, sig: toBase64Url(new Uint8Array(await subtle().sign(SIG, k.privateKey, certData(pub, term, max)))) };
}

const verifyWith = async (pub: string, sig: string, data: Uint8Array) => {
	const key = await subtle().importKey('raw', fromBase64Url(pub) as BufferSource, ALG, false, ['verify']);
	return subtle().verify(SIG, key, fromBase64Url(sig) as BufferSource, data as BufferSource);
};

/** The key at the end of `chain`, its term and its ceiling, if the chain starts at the link's key
 *  (`root`, which must match `fingerprint`), every cert checks, terms rise, and every cert stays
 *  inside the range of the key before it; null otherwise. An empty chain is the root at 0. */
export async function verifyChain(fingerprint: string, root: string, chain: Cert[]): Promise<{ pub: string; term: number; max: number } | null> {
	try {
		if (chain.length > MAX_CHAIN || (await fingerprintOf(fromBase64Url(root))) !== fingerprint) return null;
		let pub = root;
		let term = 0;
		let max = ROOT_MAX;
		for (const c of chain) {
			if (!Number.isSafeInteger(c.term) || !Number.isSafeInteger(c.max) || c.term <= term || c.term > c.max || c.max > max) return null;
			if (!(await verifyWith(pub, c.sig, certData(c.pub, c.term, c.max)))) return null;
			pub = c.pub;
			term = c.term;
			max = c.max;
		}
		return { pub, term, max };
	} catch {
		return null;
	}
}

/** The term and ceiling of a hello signed (from → to) by the key `chain` ends at, or null if
 *  anything fails. */
export async function verifyHostHello(fingerprint: string, root: string, chain: Cert[], sig: string, from: string, to: string): Promise<{ term: number; max: number } | null> {
	const end = await verifyChain(fingerprint, root, chain);
	if (!end) return null;
	try {
		return (await verifyWith(end.pub, sig, helloData(from, to))) ? { term: end.term, max: end.max } : null;
	} catch {
		return null;
	}
}

// ── token ids ────────────────────────────────────────────────────────────────
// A host keeps rejoin tokens by their SHA-256, never in the clear, and hands its heir only those
// ids: the heir can then check a knock (hash the token, look the id up) without holding a token it
// could knock with itself (red team, 2026-10-07). Synchronous, so a knock is checked in order.

const K = new Uint32Array([
	0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
	0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

/** SHA-256 of a string's UTF-8 bytes, as base64url. */
export function tokenId(token: string): string {
	const msg = enc.encode(token);
	const len = msg.length;
	const blocks = Math.ceil((len + 9) / 64);
	const buf = new Uint8Array(blocks * 64);
	buf.set(msg);
	buf[len] = 0x80;
	const view = new DataView(buf.buffer);
	view.setUint32(buf.length - 4, len * 8);
	view.setUint32(buf.length - 8, Math.floor(len / 0x20000000));
	const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
	const w = new Uint32Array(64);
	const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));
	for (let b = 0; b < blocks; b++) {
		for (let i = 0; i < 16; i++) w[i] = view.getUint32(b * 64 + i * 4);
		for (let i = 16; i < 64; i++) {
			const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
			const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
			w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
		}
		let [a, bb, c, d, e, f, g, hh] = h;
		for (let i = 0; i < 64; i++) {
			const t1 = (hh + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
			const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & bb) ^ (a & c) ^ (bb & c))) | 0;
			hh = g;
			g = f;
			f = e;
			e = (d + t1) | 0;
			d = c;
			c = bb;
			bb = a;
			a = (t1 + t2) | 0;
		}
		h[0] += a;
		h[1] += bb;
		h[2] += c;
		h[3] += d;
		h[4] += e;
		h[5] += f;
		h[6] += g;
		h[7] += hh;
	}
	const out = new Uint8Array(32);
	const ov = new DataView(out.buffer);
	for (let i = 0; i < 8; i++) ov.setUint32(i * 4, h[i]);
	return toBase64Url(out);
}
