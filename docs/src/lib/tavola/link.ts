// The invite link: `#live=<room>.<secret>` in the URL FRAGMENT, which browsers never send to
// a server (§4.1). `room` names the meeting place on the relays; `secret` encrypts the
// handshake, so a relay carries only ciphertext.

const ROOM_BYTES = 16;
const SECRET_BYTES = 32;
const B64URL = /^[A-Za-z0-9_-]+$/;
export const FRAGMENT_KEY = 'live';

export type LinkParts = { room: string; secret: string };

/** Unpadded base64url of `bytes`. */
export function toBase64Url(bytes: Uint8Array): string {
	let s = '';
	for (const b of bytes) s += String.fromCharCode(b);
	return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** `n` cryptographically random bytes from the platform (browser or Node ≥ 20). */
export function randomBytes(n: number): Uint8Array {
	const out = new Uint8Array(n);
	globalThis.crypto.getRandomValues(out);
	return out;
}

/** A fresh room and secret. `random` is injectable so tests are deterministic. */
export function mintLink(random: (n: number) => Uint8Array = randomBytes): LinkParts {
	return { room: toBase64Url(random(ROOM_BYTES)), secret: toBase64Url(random(SECRET_BYTES)) };
}

/** The fragment for `parts`, without the leading `#`. */
export function formatFragment(parts: LinkParts): string {
	return `${FRAGMENT_KEY}=${parts.room}.${parts.secret}`;
}

/** A shareable URL: `base` with its fragment replaced. */
export function formatLink(base: string, parts: LinkParts): string {
	return `${base.split('#')[0]}#${formatFragment(parts)}`;
}

/** The base64url length of `n` bytes, unpadded. */
const encodedLength = (n: number) => Math.ceil((n * 4) / 3);

/**
 * Read a link out of a `location.hash` (with or without `#`). Returns null for anything that is
 * not exactly a well-formed Tavola fragment, so a stray hash never starts a join.
 */
export function parseFragment(hash: string): LinkParts | null {
	const raw = hash.startsWith('#') ? hash.slice(1) : hash;
	const params = new URLSearchParams(raw);
	const value = params.get(FRAGMENT_KEY);
	if (!value) return null;
	const [room, secret, extra] = value.split('.');
	if (extra !== undefined || !room || !secret) return null;
	if (!B64URL.test(room) || !B64URL.test(secret)) return null;
	if (room.length !== encodedLength(ROOM_BYTES) || secret.length !== encodedLength(SECRET_BYTES)) return null;
	return { room, secret };
}
