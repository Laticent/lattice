/**
 * Unit: the gift-cards admin CLI (tools/gift-cards.mjs).
 *
 * NO NETWORK, NO REAL KEYS. Every OpenRouter call goes to `fakeOpenRouter`, which answers the way
 * OpenRouter's OpenAPI spec says (POST /keys → { key, data: { hash, … } }). The clock is pinned.
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const load = () => import('../../../tools/gift-cards.mjs');
const NOW = new Date('2026-11-10T12:00:00Z');

function fakeOpenRouter({ failOn = Infinity, status = 500 } = {}) {
	const keys = [];
	const calls = [];
	let made = 0;
	const fetch = async (url, init = {}) => {
		const u = new URL(url);
		calls.push({ method: init.method, path: u.pathname + u.search, auth: init.headers?.Authorization, body: init.body ? JSON.parse(init.body) : null });
		const reply = (code, body) => new Response(body == null ? '' : JSON.stringify(body), { status: code });
		if (init.method === 'POST' && u.pathname === '/api/v1/keys') {
			if (++made >= failOn) return reply(status, { error: { message: 'limit reached' } });
			const hex = made.toString(16).padStart(2, '0').repeat(32);
			const rec = { hash: `hash${made}`, name: calls.at(-1).body.name, limit: calls.at(-1).body.limit, usage: 0.01 * made, disabled: false, created_at: NOW.toISOString(), expires_at: calls.at(-1).body.expires_at ?? null };
			keys.push(rec);
			return reply(201, { key: `sk-or-v1-${hex}`, data: rec });
		}
		if (init.method === 'GET' && u.pathname === '/api/v1/keys') {
			const offset = Number(u.searchParams.get('offset') ?? 0);
			return reply(200, { data: keys.slice(offset, offset + 2) }); // pages of 2, to exercise paging
		}
		const del = /^\/api\/v1\/keys\/(.+)$/.exec(u.pathname);
		if (init.method === 'DELETE' && del) {
			const i = keys.findIndex((k) => k.hash === decodeURIComponent(del[1]));
			if (i < 0) return reply(404, { error: { message: 'not found' } });
			keys.splice(i, 1);
			return reply(200, { deleted: true });
		}
		return reply(404, {});
	};
	return { fetch, keys, calls };
}

test('parseArgs reads flags, inline values and booleans, and refuses unknown ones', async () => {
	const g = await load();
	assert.deepEqual(g.parseArgs(['make', '--count', '3', '--cap=2', '--pin']), { command: 'make', opts: { count: '3', cap: '2', pin: true } });
	assert.throws(() => g.parseArgs(['make', '--bogus']), /unknown flag/);
	assert.throws(() => g.parseArgs(['make', '--count']), /needs a value/);
	assert.throws(() => g.parseArgs(['make', 'stray']), /unexpected argument/);
	// A switch given a value must not quietly mean yes.
	assert.throws(() => g.parseArgs(['revoke', '--label', 'cafe', '--yes=no']), /takes no value/);
	assert.throws(() => g.parseArgs(['make', '--with-links=false']), /takes no value/);
});

test('makeOptions: one key and $1 by default; bounds are enforced', async () => {
	const g = await load();
	const o = g.makeOptions({}, NOW);
	assert.equal(o.count, 1);
	assert.equal(o.cap, 1);
	assert.equal(o.size, 'us');
	assert.equal(o.label, 'gift-20261110-1200');
	assert.equal(o.site, 'https://lattice.style');
	assert.equal(o.pin, false);
	assert.equal(o.withLinks, false);
	assert.equal(o.expiresAt, '2027-02-08T12:00:00Z');
	assert.throws(() => g.makeOptions({ count: '0' }, NOW), /--count/);
	assert.throws(() => g.makeOptions({ count: '1.5' }, NOW), /--count/);
	assert.throws(() => g.makeOptions({ cap: '0' }, NOW), /--cap/);
	assert.throws(() => g.makeOptions({ size: 'a4' }, NOW), /--size/);
	assert.throws(() => g.makeOptions({ label: 'has space' }, NOW), /--label/);
});

test('parseExpires gives OpenRouter a seconds-precision UTC time, or null for never', async () => {
	const g = await load();
	assert.equal(g.parseExpires('30d', NOW), '2026-12-10T12:00:00Z');
	assert.equal(g.parseExpires('12h', NOW), '2026-11-11T00:00:00Z');
	assert.equal(g.parseExpires('2027-01-31', NOW), '2027-01-31T23:59:59Z');
	assert.equal(g.parseExpires('never', NOW), null);
	assert.throws(() => g.parseExpires('2020-01-01', NOW), /future/);
	assert.throws(() => g.parseExpires('soon', NOW), /--expires/);
	assert.throws(() => g.parseExpires('2027-02-31', NOW), /not a real date/);
});

test('createKeys asks OpenRouter for each capped, named key with the management key and keeps the hash', async () => {
	const g = await load();
	const or = fakeOpenRouter();
	const { cards, error } = await g.createKeys({ fetch: or.fetch, mgmtKey: 'mgmt-fake', count: 12, cap: 1, label: 'cafe', expiresAt: '2026-12-10T12:00:00Z' });
	assert.equal(error, null);
	assert.equal(cards.length, 12);
	assert.equal(cards[0].name, 'cafe-01');
	assert.equal(cards[11].name, 'cafe-12');
	assert.equal(cards[2].hash, 'hash3');
	assert.match(cards[2].key, /^sk-or-v1-(03){32}$/);
	for (const c of or.calls) assert.equal(c.auth, 'Bearer mgmt-fake');
	assert.deepEqual(or.calls[0].body, { name: 'cafe-01', limit: 1, expires_at: '2026-12-10T12:00:00Z' });
});

test('a failure part way returns the keys already made, so the batch is recorded and revocable', async () => {
	const g = await load();
	const or = fakeOpenRouter({ failOn: 4 });
	const { cards, error } = await g.createKeys({ fetch: or.fetch, mgmtKey: 'm', count: 10, cap: 1, label: 'x', expiresAt: null });
	assert.equal(cards.length, 3);
	assert.match(String(error), /500.*limit reached/);
});

test('a 401 says to use a management key', async () => {
	const g = await load();
	const or = fakeOpenRouter({ failOn: 1, status: 401 });
	const { error } = await g.createKeys({ fetch: or.fetch, mgmtKey: 'm', count: 1, cap: 1, label: 'x', expiresAt: null });
	assert.match(String(error), /MANAGEMENT key/);
});

test('listKeys follows the pages and filters by label; revokeKeys deletes exactly those', async () => {
	const g = await load();
	const or = fakeOpenRouter();
	await g.createKeys({ fetch: or.fetch, mgmtKey: 'm', count: 3, cap: 1, label: 'cafe', expiresAt: null });
	await g.createKeys({ fetch: or.fetch, mgmtKey: 'm', count: 2, cap: 1, label: 'friend', expiresAt: null });
	const cafe = await g.listKeys({ fetch: or.fetch, mgmtKey: 'm', label: 'cafe' });
	assert.deepEqual(cafe.map((k) => k.name), ['cafe-1', 'cafe-2', 'cafe-3']);
	assert.equal((await g.listKeys({ fetch: or.fetch, mgmtKey: 'm' })).length, 5);
	// `caf` is a prefix of `cafe` but not the label: it matches nothing.
	assert.equal((await g.listKeys({ fetch: or.fetch, mgmtKey: 'm', label: 'caf' })).length, 0);
	// Another batch whose label STARTS with this one is never reached: `cafe` vs `cafe-2`.
	await g.createKeys({ fetch: or.fetch, mgmtKey: 'm', count: 1, cap: 1, label: 'cafe-2', expiresAt: null });
	assert.deepEqual((await g.listKeys({ fetch: or.fetch, mgmtKey: 'm', label: 'cafe' })).map((k) => k.name), ['cafe-1', 'cafe-2', 'cafe-3']);
	assert.deepEqual((await g.listKeys({ fetch: or.fetch, mgmtKey: 'm', label: 'cafe-2' })).map((k) => k.name), ['cafe-2-1']);
	or.keys.pop();
	const { deleted, failed } = await g.revokeKeys({ fetch: or.fetch, mgmtKey: 'm', keys: cafe });
	assert.equal(deleted, 3);
	assert.deepEqual(failed, []);
	assert.deepEqual(or.keys.map((k) => k.name), ['friend-1', 'friend-2']);
});

test('the CSV leaves the links out unless asked, and quotes what needs quoting', async () => {
	const g = await load();
	const cards = [
		{ n: 1, name: 'cafe-1', hash: 'h1', cap: 1, created: 'c', expires: 'e', link: 'https://x.test/gift#v1.a.b', pin: '012345' },
		{ n: 2, name: 'cafe,2', hash: 'h2', cap: 1, created: 'c', expires: '', link: 'https://x.test/gift#v1.c.d', pin: '987654' },
	];
	const plain = g.buildCsv(cards);
	assert.equal(plain.split('\n')[0], 'card,name,openrouter_hash,cap_usd,created,expires,pin');
	assert.ok(!plain.includes('gift#'), 'no working link without --with-links');
	assert.ok(plain.includes(',012345'), 'a PIN keeps its leading zero');
	assert.ok(plain.includes('"cafe,2"'));
	assert.match(g.buildCsv(cards, { withLinks: true }), /,gift_link\n.*https:\/\/x\.test\/gift#v1\.a\.b/);
});

test('the deck is one gift-card slide per key at the card size, the PIN spaced for reading', async () => {
	const g = await load();
	const cards = [
		{ n: 1, link: 'https://x.test/gift#v1.a.b', pin: null },
		{ n: 2, link: 'https://x.test/gift#v1p.c.d.e.f', pin: '482913' },
	];
	const deck = g.buildDeck(cards, { size: 'us', cap: 1 });
	assert.match(deck, /^---\nsize: card\n/);
	assert.equal(deck.match(/<!-- _class: gift-card -->/g).length, 2);
	assert.ok(deck.includes('- `https://x.test/gift#v1.a.b` `link`'));
	assert.match(deck, /paginate: false\nspectrum: off\n/);
	assert.ok(deck.includes('- 482 913 `pin`'));
	assert.ok(!deck.split('\n---\n\n')[0].includes('`pin`'), 'an unlocked card prints no PIN line');
	assert.match(g.buildDeck(cards, { size: 'iso' }), /^---\nsize: card-iso\n/);
});

test('newPin is six digits as a string', async () => {
	const g = await load();
	for (let i = 0; i < 50; i++) assert.match(g.newPin(), /^\d{6}$/);
});

test('imposeSheet lays ten cards to a Letter sheet at exactly 3.5 x 2 inches', async () => {
	const g = await load();
	const { PDFDocument } = require('pdf-lib');
	const src = await PDFDocument.create();
	for (let i = 0; i < 12; i++) src.addPage([1050, 600]).drawText(`card ${i + 1}`, { x: 40, y: 40 });
	const bytes = await g.imposeSheet(await src.save(), { size: 'us' });
	const sheet = await PDFDocument.load(bytes);
	assert.equal(sheet.getPageCount(), 2, '12 cards → two sheets');
	const { width, height } = sheet.getPage(0).getSize();
	assert.deepEqual([width, height], [612, 792]);
	const iso = await PDFDocument.load(await g.imposeSheet(await src.save(), { size: 'iso' }));
	assert.deepEqual(
		Object.values(iso.getPage(0).getSize()).map((v) => Math.round(v)),
		[595, 842],
	);
});

test('a server that ignores the page offset cannot loop listKeys or double its results', async () => {
	const g = await load();
	let calls = 0;
	const same = async () => {
		calls++;
		return new Response(JSON.stringify({ data: [{ hash: 'a', name: 'x-1' }, { hash: 'b', name: 'x-2' }] }), { status: 200 });
	};
	const keys = await g.listKeys({ fetch: same, mgmtKey: 'm', label: 'x' });
	assert.deepEqual(keys.map((k) => k.hash), ['a', 'b']);
	assert.equal(calls, 2);
});

test('--site must be https, with no query or fragment', async () => {
	const g = await load();
	assert.equal(g.checkSite('https://example.test/lattice/'), 'https://example.test/lattice');
	assert.throws(() => g.checkSite('http://example.test'), /https/);
	assert.throws(() => g.checkSite('not a url'), /not a URL/);
	assert.throws(() => g.checkSite('https://example.test/?a=1'), /query/);
});

test('a key in an unknown shape stops the batch but stays in the record, so it can be revoked', async () => {
	const g = await load();
	const fetch = async () => new Response(JSON.stringify({ key: 'sk-or-v2-new', data: { hash: 'h1' } }), { status: 201 });
	const { cards, error } = await g.createKeys({ fetch, mgmtKey: 'm', count: 3, cap: 1, label: 'x', expiresAt: null });
	assert.match(String(error), /shape/);
	assert.equal(cards.length, 1);
	assert.equal(cards[0].hash, 'h1');
	assert.equal(cards[0].key, null);
});
