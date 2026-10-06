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

export async function createHostKey(): Promise<HostKey> {
	const pair = await subtle().generateKey(ALG, true, ['sign', 'verify']);
	const publicRaw = new Uint8Array(await subtle().exportKey('raw', pair.publicKey));
	return { privateKey: pair.privateKey, publicRaw, fingerprint: await fingerprintOf(publicRaw) };
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
