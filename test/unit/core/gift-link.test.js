/**
 * Unit: the gift-link codec (lib/core/gift-link.mjs).
 *
 * FAKE KEYS ONLY. Every key below is built from a fixed byte pattern; none was ever issued by
 * OpenRouter. The PIN tests pass a fixed salt so every run produces the same bytes (HARD RULE #32).
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const load = () => import('../../../lib/core/gift-link.mjs');

// A fake key: `sk-or-v1-` + 64 hex digits from a fixed pattern.
const fakeKey = (seed) => {
	let hex = '';
	for (let i = 0; i < 32; i++) hex += ((seed * 31 + i * 17) & 0xff).toString(16).padStart(2, '0');
	return `sk-or-v1-${hex}`;
};
const KEY = fakeKey(7);
const SALT = [1, 2, 3, 4, 5, 6, 7, 8];
const SITE = 'https://example.test/lattice/';

test('a plain key round-trips through a 51-character token', async () => {
	const g = await load();
	const token = await g.encodeGiftToken(KEY);
	assert.match(token, /^v1\.[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{4}$/);
	assert.equal(token.length, 51);
	assert.deepEqual(await g.decodeGift(token), { key: KEY, locked: false });
});

test('the token is the same every time for the same key (no randomness without a PIN)', async () => {
	const g = await load();
	assert.equal(await g.encodeGiftToken(KEY), await g.encodeGiftToken(KEY));
});

test('every one of 64 distinct fake keys round-trips, including all-zero and all-f', async () => {
	const g = await load();
	const keys = [...Array.from({ length: 62 }, (_, i) => fakeKey(i)), `sk-or-v1-${'0'.repeat(64)}`, `sk-or-v1-${'f'.repeat(64)}`];
	for (const key of keys) assert.equal((await g.decodeGift(await g.encodeGiftToken(key))).key, key);
});

test('the full link puts the token after /gift#, so the key never reaches a server', async () => {
	const g = await load();
	const link = await g.encodeGiftLink(KEY, SITE);
	assert.match(link, /^https:\/\/example\.test\/lattice\/gift#v1\./);
	assert.ok(link.length < 90, `link is ${link.length} chars`);
	assert.equal(new URL(link).pathname, '/lattice/gift');
	assert.equal((await g.decodeGift(link)).key, KEY);
});

test('a link wrapped across lines or padded with spaces by a chat app still reads', async () => {
	const g = await load();
	const link = await g.encodeGiftLink(KEY, SITE);
	const wrapped = `  ${link.slice(0, 30)}\n${link.slice(30, 60)}\r\n ${link.slice(60)}  `;
	assert.equal((await g.decodeGift(wrapped)).key, KEY);
	assert.equal((await g.decodeGift(`#${await g.encodeGiftToken(KEY)}`)).key, KEY);
});

test('a bare OpenRouter key is accepted as-is (the "Have a gift link?" box takes either)', async () => {
	const g = await load();
	assert.deepEqual(await g.decodeGift(`  ${KEY}\n`), { key: KEY, locked: false });
	await assert.rejects(g.decodeGift('sk-or-v1-short'), { code: 'key-shape' });
});

test('encode refuses a key that is not sk-or-v1- + 64 lowercase hex', async () => {
	const g = await load();
	for (const bad of ['', 'sk-or-v1-', KEY.toUpperCase(), `${KEY}0`, KEY.slice(0, -1), KEY.replace('sk-or-v1-', 'sk-or-v2-'), 'sk-ant-xyz']) {
		await assert.rejects(g.encodeGiftToken(bad), { code: 'key-shape' }, bad);
	}
});

test('every single-character change to a plain token is caught, never decoded to a wrong key', async () => {
	const g = await load();
	const token = await g.encodeGiftToken(KEY);
	const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
	let tried = 0;
	for (let i = 3; i < token.length; i++) {
		if (token[i] === '.') continue;
		for (const ch of alphabet) {
			if (ch === token[i]) continue;
			const bad = token.slice(0, i) + ch + token.slice(i + 1);
			await assert.rejects(g.decodeGift(bad), (e) => e instanceof g.GiftLinkError && ['checksum', 'format'].includes(e.code), bad);
			tried++;
		}
	}
	assert.equal(tried, 47 * 63);
});

test('a dropped or added character, or a truncated link, is caught', async () => {
	const g = await load();
	const token = await g.encodeGiftToken(KEY);
	for (let i = 3; i < token.length; i++) {
		await assert.rejects(g.decodeGift(token.slice(0, i) + token.slice(i + 1)), g.GiftLinkError);
		await assert.rejects(g.decodeGift(`${token.slice(0, i)}A${token.slice(i)}`), g.GiftLinkError);
	}
	await assert.rejects(g.decodeGift(token.slice(0, 20)), g.GiftLinkError);
});

test('each failure carries a code and a plain message', async () => {
	const g = await load();
	await assert.rejects(g.decodeGift(''), { code: 'empty' });
	await assert.rejects(g.decodeGift('hello'), { code: 'format' });
	await assert.rejects(g.decodeGift('https://example.test/gift#'), { code: 'format' });
	await assert.rejects(g.decodeGift('v2.AAAA.AAAA'), { code: 'version' });
	for (const code of Object.keys(g.GIFT_LINK_MESSAGES)) assert.ok(g.GIFT_LINK_MESSAGES[code].length > 10, code);
});

test('a PIN-locked token is 69 characters, opens with the PIN, and is stable for a fixed salt', async () => {
	const g = await load();
	const token = await g.encodeGiftToken(KEY, { pin: '482913', salt: SALT });
	assert.equal(token.length, 69);
	assert.match(token, /^v1p\./);
	assert.equal(token, await g.encodeGiftToken(KEY, { pin: '482 913', salt: SALT }), 'spaces in a typed PIN are ignored');
	assert.equal(g.inspectGiftToken(token).locked, true);
	assert.deepEqual(await g.decodeGift(token, { pin: '482-913' }), { key: KEY, locked: true });
	assert.ok(!token.includes(KEY.slice(9, 20)), 'the locked token does not carry the key in clear');
	assert.notEqual(token.split('.')[2], (await g.encodeGiftToken(KEY)).split('.')[1]);
});

test('a locked token without its PIN, or with a wrong one, is refused and never returns a key', async () => {
	const g = await load();
	const token = await g.encodeGiftToken(KEY, { pin: '482913', salt: SALT });
	await assert.rejects(g.decodeGift(token), { code: 'pin-required' });
	await assert.rejects(g.decodeGift(token, { pin: '   ' }), { code: 'pin-required' });
	await assert.rejects(g.decodeGift(token, { pin: '482914' }), { code: 'pin-wrong' });
	await assert.rejects(g.decodeGift(token, { pin: 'abc' }), { code: 'pin-wrong' });
});

test('a fresh salt is drawn for each locked link when none is passed', async () => {
	const g = await load();
	const a = await g.encodeGiftToken(KEY, { pin: '1234' });
	const b = await g.encodeGiftToken(KEY, { pin: '1234' });
	assert.notEqual(a, b);
	assert.equal((await g.decodeGift(a, { pin: '1234' })).key, KEY);
	assert.equal((await g.decodeGift(b, { pin: '1234' })).key, KEY);
});

test('a PIN must be 4 to 12 digits', async () => {
	const g = await load();
	assert.equal(g.normalizePin('12 34'), '1234');
	assert.equal(g.normalizePin('123'), null);
	assert.equal(g.normalizePin('1234567890123'), null);
	assert.equal(g.normalizePin('12a4'), null);
	await assert.rejects(g.encodeGiftToken(KEY, { pin: '12' }), g.GiftLinkError);
});

test('base64url helpers have one spelling per byte string', async () => {
	const g = await load();
	for (let n = 0; n < 40; n++) {
		const bytes = Uint8Array.from({ length: n }, (_, i) => (i * 73 + n) & 0xff);
		const text = g.bytesToBase64url(bytes);
		assert.doesNotMatch(text, /[+/=]/);
		assert.deepEqual(g.base64urlToBytes(text), bytes);
	}
	assert.equal(g.base64urlToBytes('AB'), null, 'non-zero leftover bits are not canonical');
	assert.equal(g.base64urlToBytes('A'), null);
	assert.equal(g.base64urlToBytes('A+'), null);
});

test('extractGiftToken finds the token in a link, a fragment or bare text, and nothing else', async () => {
	const g = await load();
	assert.equal(g.extractGiftToken('https://x.test/gift#v1.abc.defg'), 'v1.abc.defg');
	assert.equal(g.extractGiftToken('#v1p.a.b.c.d'), 'v1p.a.b.c.d');
	assert.equal(g.extractGiftToken('https://x.test/gift#v1.ab%2Dc.defg'), 'v1.ab-c.defg');
	assert.equal(g.extractGiftToken('https://x.test/'), null);
	assert.equal(g.extractGiftToken(null), null);
});

test('a link pasted inside a sentence, with trailing punctuation, or with # sent as %23 still reads', async () => {
	const g = await load();
	const link = await g.encodeGiftLink(KEY, SITE);
	const locked = await g.encodeGiftLink(KEY, SITE, { pin: '482913', salt: SALT });
	for (const pasted of [`${link}.`, `${link})`, `${link}/`, `"${link}"`, `${link}&utm=1`, `Link: ${link} enjoy!`, `(${link}).`, link.replaceAll('#', '%23')]) {
		assert.equal((await g.decodeGift(pasted)).key, KEY, pasted);
	}
	assert.equal((await g.decodeGift(`Here: ${locked}. PIN on the back`, { pin: '482913' })).key, KEY);
});

test('an unknown newer version is named as newer, not as damaged', async () => {
	const g = await load();
	await assert.rejects(g.decodeGift('https://x.test/gift#v2.abcdef.ghij'), { code: 'version' });
});

test('a bare key wrapped across lines by a chat app is accepted', async () => {
	const g = await load();
	assert.equal((await g.decodeGift(`${KEY.slice(0, 30)}\n${KEY.slice(30)}`)).key, KEY);
});

test('an empty or numeric PIN is refused rather than making an unlocked or unopenable card', async () => {
	const g = await load();
	await assert.rejects(g.encodeGiftToken(KEY, { pin: '' }), g.GiftLinkError);
	await assert.rejects(g.encodeGiftToken(KEY, { pin: 12345 }), g.GiftLinkError, 'a number would drop a leading zero');
	assert.equal(g.normalizePin(1234), null);
});

test('a salt that is not 8 bytes is refused, never silently zeroed', async () => {
	const g = await load();
	for (const salt of ['abcdefgh', [1, 2, 3], [0, 0, 0, 0, 0, 0, 0, 256], [0.5, 0, 0, 0, 0, 0, 0, 0]]) {
		await assert.rejects(g.encodeGiftToken(KEY, { pin: '1234', salt }), /salt must be 8 bytes/, String(salt));
	}
});
