// Gift links: a spend-capped OpenRouter key carried whole in a URL fragment.
//
// One codec, imported by the admin CLI that writes the cards (tools/gift-cards.mjs) and by the
// Studio's /gift page that reads them, so the code that writes a link and the code that reads it
// cannot disagree (HARD RULE #1). Design: engineering/decisions/2026-11-06-gift-link-cli.md §1–§2.
//
// THE FORMAT. A gift link is `<site>/gift#<token>`, and the token is one of:
//
//   v1.<key, 43 chars>.<check, 4 chars>                         a plain link, 51 characters
//   v1p.<salt, 11 chars>.<sealed key, 43>.<pin check, 4>.<check, 4>   a PIN-locked link, 69 characters
//
// - <key> is the 64 hex digits after OpenRouter's fixed `sk-or-v1-` prefix, packed as 32 bytes
//   and written in base64url (RFC 4648 §5, no padding). OpenRouter's OpenAPI spec for
//   `POST /api/v1/keys` gives the key as `sk-or-v1-` + 64 lowercase hex digits (confirmed
//   2026-11-10); a key of any other shape is refused here rather than half-encoded.
// - <check> is the top 24 bits of a CRC-32 over everything before it, so a damaged or mistyped
//   link fails with a clear message instead of storing a broken key. It catches mistakes, not
//   attackers: anyone can recompute it.
// - The PIN lock derives 35 bytes from the PIN with PBKDF2-SHA-256 (a random 8-byte salt,
//   PIN_ITERATIONS rounds): 32 are XORed onto the key, 3 are the <pin check> that tells a wrong
//   PIN apart from a right one. Three bytes let about one wrong PIN in 16.7 million through to a
//   garbage key, which OpenRouter then refuses; a longer check would only speed up the offline
//   guessing §4 already concedes. It stops someone who only photographed the QR code. It does not
//   stop a determined attacker, who can try every 6-digit PIN offline; the spending cap
//   OpenRouter enforces on the key is the real protection (§4).
//
// Pure and isomorphic: no fs, no DOM, only TextEncoder and Web Crypto, which Node 20+ and every
// browser the Studio supports both have as globals.

const PREFIX = 'sk-or-v1-';
const KEY_RE = /^sk-or-v1-[0-9a-f]{64}$/;
const B64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const KEY_BYTES = 32;
const SALT_BYTES = 8;
const PIN_CHECK_BYTES = 3;

/** The PBKDF2 round count for a PIN-locked link. Part of the v1p format: changing it needs a new tag. */
export const PIN_ITERATIONS = 200_000;
/** The path a gift link opens. */
export const GIFT_PATH = 'gift';

/**
 * A gift link that cannot be read, with a `code` the caller turns into words:
 * 'empty' | 'format' | 'version' | 'checksum' | 'key-shape' | 'pin-required' | 'pin-wrong'.
 */
export class GiftLinkError extends Error {
	constructor(code, message) {
		super(message);
		this.name = 'GiftLinkError';
		this.code = code;
	}
}

/** Plain-language messages for each GiftLinkError code, for a page or a terminal to show. */
export const GIFT_LINK_MESSAGES = Object.freeze({
	empty: 'There is no gift link here.',
	format: 'That does not look like a gift link. Check that the whole link was copied.',
	version: 'This gift link was made by a newer Lattice. Reload the page and try again.',
	checksum: 'This gift link is damaged: a character is missing or changed. Copy it again, or scan the card again.',
	'key-shape': 'That is not an OpenRouter key. Gift links carry OpenRouter keys, which start with “sk-or-v1-”.',
	'pin-required': 'This gift link is locked with a PIN. Enter the PIN printed on the card.',
	'pin-wrong': 'That PIN does not open this gift link.',
	'no-crypto': 'This browser cannot unlock a PIN-locked gift here. Open the link over https, or in a current browser.',
});

const fail = (code) => {
	throw new GiftLinkError(code, GIFT_LINK_MESSAGES[code]);
};

// ── base64url over bytes ──────────────────────────────────────────────────────────────────

/** Bytes → base64url, no padding. */
export function bytesToBase64url(bytes) {
	let out = '';
	let i = 0;
	for (; i + 2 < bytes.length; i += 3) {
		const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
		out += B64URL[n >> 18] + B64URL[(n >> 12) & 63] + B64URL[(n >> 6) & 63] + B64URL[n & 63];
	}
	const rest = bytes.length - i;
	if (rest === 1) {
		const n = bytes[i] << 16;
		out += B64URL[n >> 18] + B64URL[(n >> 12) & 63];
	} else if (rest === 2) {
		const n = (bytes[i] << 16) | (bytes[i + 1] << 8);
		out += B64URL[n >> 18] + B64URL[(n >> 12) & 63] + B64URL[(n >> 6) & 63];
	}
	return out;
}

/** base64url (no padding) → bytes, or null when the text is not canonical base64url. */
export function base64urlToBytes(text) {
	if (typeof text !== 'string' || text.length % 4 === 1) return null;
	const out = new Uint8Array(Math.floor((text.length * 3) / 4));
	let bits = 0;
	let acc = 0;
	let j = 0;
	for (const ch of text) {
		const v = B64URL.indexOf(ch);
		if (v < 0) return null;
		acc = (acc << 6) | v;
		bits += 6;
		if (bits >= 8) {
			bits -= 8;
			out[j++] = (acc >> bits) & 0xff;
		}
	}
	// Leftover bits must be zero, so each byte string has exactly one spelling.
	if (acc & ((1 << bits) - 1)) return null;
	return out;
}

// ── the check ─────────────────────────────────────────────────────────────────────────────

let CRC_TABLE = null;
function crc32(bytes) {
	if (!CRC_TABLE) {
		CRC_TABLE = new Uint32Array(256);
		for (let n = 0; n < 256; n++) {
			let c = n;
			for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
			CRC_TABLE[n] = c >>> 0;
		}
	}
	let c = 0xffffffff;
	for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
	return (c ^ 0xffffffff) >>> 0;
}

/** The 4-character check for the text before it (the top 24 bits of its CRC-32). */
function checkOf(text) {
	const c = crc32(new TextEncoder().encode(text));
	return bytesToBase64url(new Uint8Array([c >>> 24, (c >>> 16) & 0xff, (c >>> 8) & 0xff]));
}

// ── keys ──────────────────────────────────────────────────────────────────────────────────

/** True when `key` has the shape OpenRouter gives its API keys: `sk-or-v1-` and 64 lowercase hex digits. */
export function isOpenRouterKey(key) {
	return typeof key === 'string' && KEY_RE.test(key);
}

function keyToBytes(key) {
	if (!isOpenRouterKey(key)) fail('key-shape');
	const hex = key.slice(PREFIX.length);
	const out = new Uint8Array(KEY_BYTES);
	for (let i = 0; i < KEY_BYTES; i++) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
	return out;
}

function bytesToKey(bytes) {
	let hex = '';
	for (const b of bytes) hex += b.toString(16).padStart(2, '0');
	return PREFIX + hex;
}

// ── the PIN ───────────────────────────────────────────────────────────────────────────────

function cryptoApi() {
	const c = globalThis.crypto;
	// Browsers expose crypto.subtle only on https and localhost.
	if (!c?.subtle || !c.getRandomValues) fail('no-crypto');
	return c;
}

/**
 * A PIN is 4 to 12 digits, given as a STRING: a number would lose its leading zeros, and the card
 * would print a PIN that does not open it. Spaces and dashes a person types between digits are ignored.
 */
export function normalizePin(pin) {
	if (typeof pin !== 'string') return null;
	const p = pin.replace(/[\s-]/g, '');
	return /^\d{4,12}$/.test(p) ? p : null;
}

async function pinStream(pin, salt) {
	const c = cryptoApi();
	const base = await c.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
	const bits = await c.subtle.deriveBits(
		{ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PIN_ITERATIONS },
		base,
		(KEY_BYTES + PIN_CHECK_BYTES) * 8,
	);
	return new Uint8Array(bits);
}

// ── encode / decode ───────────────────────────────────────────────────────────────────────

/**
 * Turn an OpenRouter key into a gift token (the part after `#`). With `pin`, the key is locked.
 * `salt` is for tests only; a real link always takes a fresh random one.
 * @param {string} key
 * @param {{ pin?: string | null, salt?: ArrayLike<number> | null }} [opts]
 * @returns {Promise<string>}
 */
export async function encodeGiftToken(key, { pin = null, salt = null } = {}) {
	const bytes = keyToBytes(key);
	// Only an absent PIN means "no lock": an empty `--pin ""` must not quietly print an unlocked card.
	if (pin == null) {
		const body = `v1.${bytesToBase64url(bytes)}`;
		return `${body}.${checkOf(body)}`;
	}
	const p = normalizePin(pin);
	if (!p) throw new GiftLinkError('pin-wrong', 'A PIN is 4 to 12 digits.');
	if (salt != null && !(Array.from(salt).length === SALT_BYTES && Array.from(salt).every((b) => Number.isInteger(b) && b >= 0 && b <= 255))) {
		throw new Error(`salt must be ${SALT_BYTES} bytes`);
	}
	const s = salt != null ? Uint8Array.from(salt) : cryptoApi().getRandomValues(new Uint8Array(SALT_BYTES));
	const stream = await pinStream(p, s);
	const sealed = bytes.map((b, i) => b ^ stream[i]);
	const pinCheck = stream.slice(KEY_BYTES);
	const body = `v1p.${bytesToBase64url(s)}.${bytesToBase64url(sealed)}.${bytesToBase64url(pinCheck)}`;
	return `${body}.${checkOf(body)}`;
}

/** Join a site address and a token into the full gift link: `<site>/gift#<token>`. */
export function giftLinkUrl(site, token) {
	let base = String(site);
	while (base.endsWith('/')) base = base.slice(0, -1);
	return `${base}/${GIFT_PATH}#${token}`;
}

/**
 * Turn a key into a full gift link.
 * @param {string} key
 * @param {string} site
 * @param {{ pin?: string | null, salt?: ArrayLike<number> | null }} [opts]
 * @returns {Promise<string>}
 */
export async function encodeGiftLink(key, site, opts = {}) {
	return giftLinkUrl(site, await encodeGiftToken(key, opts));
}

// The two token shapes this version writes, exactly, so text a chat app glued on after the link
// (a full stop, a bracket, "enjoy!") is left behind instead of being read as part of the check.
const T = '[A-Za-z0-9_-]';
const TOKEN_EXACT = new RegExp(`v1p\\.${T}{11}\\.${T}{43}\\.${T}{4}\\.${T}{4}|v1\\.${T}{43}\\.${T}{4}`);
// Any token-like run, for a newer version this one cannot read (so it says "newer", not "damaged").
const TOKEN_LOOSE = /v\d+[a-z]*(?:\.[A-Za-z0-9_-]+)+/;

/**
 * Find the token in what a person pasted or scanned: a whole link, a bare `#…` fragment, a bare
 * token, or any of those inside a sentence. Whitespace and line breaks are ignored (a link wrapped
 * by a chat app still reads), and so is anything after the token. Returns null when nothing
 * token-shaped is there; it does not check the token.
 */
export function extractGiftToken(input) {
	if (typeof input !== 'string') return null;
	let text = input.replace(/\s+/g, '');
	try {
		text = decodeURIComponent(text);
	} catch {
		/* a stray % — read the text as it is */
	}
	const hash = text.lastIndexOf('#');
	const tail = hash >= 0 ? text.slice(hash + 1) : text;
	const exact = TOKEN_EXACT.exec(tail);
	if (exact) return exact[0];
	const loose = TOKEN_LOOSE.exec(tail);
	return loose && (hash >= 0 || loose.index === 0) ? loose[0] : null;
}

/** Read a token's shape without opening it: `{ version, locked }`. Throws GiftLinkError on a damaged token. */
export function inspectGiftToken(token) {
	if (typeof token !== 'string' || !token) fail('empty');
	const parts = token.split('.');
	const tag = parts[0];
	if (!/^v\d+[a-z]*$/.test(tag)) fail('format');
	if (tag !== 'v1' && tag !== 'v1p') fail('version');
	const want = tag === 'v1' ? 3 : 5;
	if (parts.length !== want) fail('format');
	const check = parts.pop();
	if (check !== checkOf(parts.join('.'))) fail('checksum');
	const lengths = tag === 'v1' ? [43] : [11, 43, 4];
	const fields = parts.slice(1).map((p, i) => {
		const b = base64urlToBytes(p);
		if (!b || p.length !== lengths[i]) fail('format');
		return b;
	});
	return { version: 1, locked: tag === 'v1p', fields };
}

/**
 * Open a gift token (or a whole link, or a bare key) and return `{ key, locked }`.
 * A locked token needs `pin`. Throws GiftLinkError with a code and a plain message.
 * @param {string} input
 * @param {{ pin?: string | null }} [opts]
 * @returns {Promise<{ key: string, locked: boolean }>}
 */
export async function decodeGift(input, { pin = null } = {}) {
	const trimmed = typeof input === 'string' ? input.trim() : '';
	if (!trimmed) fail('empty');
	if (/^sk-or-/.test(trimmed)) {
		// A bare key, possibly wrapped across lines by a chat app.
		const key = trimmed.replace(/\s+/g, '');
		if (!isOpenRouterKey(key)) fail('key-shape');
		return { key, locked: false };
	}
	const token = extractGiftToken(trimmed);
	if (!token) fail('format');
	const { locked, fields } = inspectGiftToken(token);
	if (!locked) return { key: bytesToKey(fields[0]), locked: false };
	if (pin == null || String(pin).trim() === '') fail('pin-required');
	const p = normalizePin(pin);
	if (!p) fail('pin-wrong');
	const [salt, sealed, pinCheck] = fields;
	const stream = await pinStream(p, salt);
	for (let i = 0; i < PIN_CHECK_BYTES; i++) if (stream[KEY_BYTES + i] !== pinCheck[i]) fail('pin-wrong');
	return { key: bytesToKey(sealed.map((b, i) => b ^ stream[i])), locked: true };
}
