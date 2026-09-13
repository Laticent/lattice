/**
 * Unit: the shared video provider registry (lib/core/video-providers.mjs).
 *
 * The behavior of each facet is already pinned where it is consumed — the static
 * render in test/unit/transformers/video.test.js, the lightbox in
 * test/unit/playground/video-overlay.test.js. What THIS file pins is the property
 * those two suites cannot see individually: that there is exactly ONE table, that
 * every row is complete, and that the host match is anchored.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO = path.join(__dirname, '..', '..', '..');
const {
	PROVIDERS,
	providerFor,
	detectProvider,
	embedSrc,
	isEmbeddable,
	providerShape,
} = require('../../../lib/core/video-providers.mjs');

describe('the registry is one table, and every row is whole', () => {
	test('no id extractor matches a hostname WITH A REGEX', () => {
		// `providerFor` settles which provider owns the URL, so an extractor that
		// re-matched the host in a pattern would be redundant AND wrong: an unanchored
		// `instagram\.com\/p\/` also matches `https://evil.example/instagram.com/p/x`.
		// That is the substring shape this registry exists to stop, and the shape
		// CodeQL's js/incomplete-hostname-regexp flags. Extractors read the parsed
		// `pathname` and `searchParams` instead.
		//
		// Comparing a PARSED `url.hostname` against a plain string is the safe pattern
		// and stays allowed — youtu.be needs it, because it puts the id at the path
		// root while youtube.com nests it under a verb. So the rule is specifically
		// "no regex-escaped host", which is the form a pattern would carry.
		const escaped = PROVIDERS.flatMap((p) => p.hosts).map((h) => h.replace(/\./g, '\\.'));
		for (const p of PROVIDERS) {
			const src = p.id.toString();
			for (const h of escaped) {
				assert.ok(!src.includes(h), `${p.key}: id extractor carries the host pattern ${h}`);
			}
		}
	});

	test('id extractors anchor to the path, so no `.*` can backtrack over a long URL', () => {
		for (const p of PROVIDERS) {
			const src = p.id.toString();
			assert.ok(!src.includes('.*'), `${p.key}: no unbounded wildcard`);
		}
		// A long, hostile query cannot make extraction superlinear.
		const long = `https://www.youtube.com/watch?${'&'.repeat(200000)}v=aqz-KE-bpKQ`;
		const t0 = process.hrtime.bigint();
		assert.equal(detectProvider(long).id, 'aqz-KE-bpKQ');
		const ms = Number(process.hrtime.bigint() - t0) / 1e6;
		assert.ok(ms < 500, `extraction took ${ms.toFixed(1)}ms on a 200k-char query`);
	});

	test('each row carries the full descriptor, with the right types', () => {
		for (const p of PROVIDERS) {
			assert.match(p.key, /^[a-z0-9-]+$/, `${p.key}: key is a slug`);
			assert.ok(p.label && typeof p.label === 'string', `${p.key}: has a human label`);
			assert.ok(Array.isArray(p.hosts) && p.hosts.length > 0, `${p.key}: declares its hosts`);
			for (const h of p.hosts) {
				// Hostnames, as data — not regexes, not URLs, not patterns.
				assert.match(h, /^[a-z0-9.-]+\.[a-z]{2,}$/, `${p.key}: '${h}' is a bare hostname`);
			}
			assert.equal(typeof p.id, 'function', `${p.key}: id is a function`);
			assert.equal(typeof p.watch, 'function', `${p.key}: watch is a function`);
			// `oembed` and `embed` are legitimately null (no public endpoint / not
			// frameable), but they must be declared either way — an absent key is a
			// row someone forgot to finish.
			assert.ok('oembed' in p, `${p.key}: declares oembed (or null)`);
			assert.ok('embed' in p, `${p.key}: declares embed (or null)`);
			assert.ok(['portrait', 'landscape'].includes(p.shape), `${p.key}: declares a shape`);
		}
	});

	test('keys are unique — two rows claiming one key would make dispatch order silently decide', () => {
		const keys = PROVIDERS.map((p) => p.key);
		assert.equal(new Set(keys).size, keys.length);
	});

	test('no second provider table: nothing outside the kernel hard-codes a provider host', () => {
		// The defect this change closed was a SECOND table in the docs site with its own
		// regexes. This is the census that stops a third appearing.
		//
		// The pattern is DERIVED FROM THE REGISTRY, not written out beside it. A
		// hand-written alternation is exactly what drifts: the first draft of this arm
		// read `(?:youtube|youtu\.be|vimeo|tiktok|instagram)\\?\.` and required a literal
		// dot after every branch, which made `youtu.be` and `youtube-nocookie` — two of
		// the four hosts the registry declares — UNMATCHABLE. A second YouTube table
		// written against either would have shipped green through its own guard.
		//
		// Scope is EXECUTABLE CODE. A provider URL in a manifest, a skeleton, a deck or a
		// doc is authoring content, not a dispatch table, and `video.manifest.json` is
		// full of legitimate examples.
		const hostPattern = new RegExp(
			PROVIDERS.flatMap((p) => p.hosts)
				// Match the host as written in code, whether plain (`youtube.com`) or
				// regex-escaped (`youtube\.com`).
				.map((h) => h.split('.').join('\\\\?\\.'))
				.join('|'),
			'i',
		);
		const roots = ['lib', 'docs/src', 'tools'];
		const CODE = /\.(js|mjs|cjs|jsx|ts|tsx|astro)$/;
		const offenders = [];
		const walk = (dir) => {
			for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
				const full = path.join(dir, e.name);
				if (e.isDirectory()) {
					if (e.name === 'node_modules' || e.name === 'dist' || e.name.startsWith('.')) continue;
					walk(full);
					continue;
				}
				if (!CODE.test(e.name)) continue;
				const rel = path.relative(REPO, full);
				if (rel === path.join('lib', 'core', 'video-providers.mjs')) continue;
				if (/\.test\.(js|mjs|cjs|jsx|ts|tsx)$/.test(e.name)) continue;
				for (const [i, line] of fs.readFileSync(full, 'utf8').split('\n').entries()) {
					// A comment mentioning a provider is fine; a REGEX or a URL TEMPLATE
					// naming one is the thing that drifts.
					const code = line.replace(/^\s*(\/\/|\*|\/\*).*$/, '');
					if (!hostPattern.test(code)) continue;
					if (!/[/`'"]/.test(code)) continue;
					offenders.push(`${rel}:${i + 1}: ${line.trim().slice(0, 90)}`);
				}
			}
		};
		for (const r of roots) walk(path.join(REPO, r));
		assert.deepEqual(
			offenders,
			[],
			`a provider host is hard-coded outside lib/core/video-providers.mjs:\n${offenders.join('\n')}`,
		);
	});

	test('the census pattern actually covers every host the registry declares', () => {
		// The arm above is only as good as its pattern, and its predecessor silently
		// covered two hosts of four. Prove the coverage rather than trusting it.
		const hostPattern = new RegExp(
			PROVIDERS.flatMap((p) => p.hosts)
				.map((h) => h.split('.').join('\\\\?\\.'))
				.join('|'),
			'i',
		);
		for (const h of PROVIDERS.flatMap((p) => p.hosts)) {
			assert.ok(hostPattern.test(`const s = 'https://${h}/x';`), `plain: ${h}`);
			assert.ok(hostPattern.test(`const re = /${h.replace(/\./g, '\\.')}\\/x/;`), `escaped: ${h}`);
			assert.ok(hostPattern.test(`const t = \`https://${h}/\${id}\`;`), `template: ${h}`);
		}
	});
});

describe('the host match is a parsed host, not a substring', () => {
	// The merge of the two former tables exposed this. Both matched a SUBSTRING of
	// the whole URL, so a provider name anywhere in it counted — one in a FRAGMENT,
	// the other in a QUERY. It could never become a player src (those rebuild from
	// the parsed id), but `tiktok` and `instagram` pass the author's URL THROUGH as
	// their watch target, so the slide rendered a provider badge and a QR code over
	// a foreign origin. Matching the parsed host closes it.
	const HOSTILE = [
		'https://evil.example/#instagram.com/reel/DaStLQkuN3Q',
		'https://evil.example/#youtube.com/embed/aqz-KE-bpKQ',
		'https://evil.example/?next=https://vimeo.com/1084537',
		'https://notyoutube.com/watch?v=aqz-KE-bpKQ',
		'https://youtube.com.evil.example/watch?v=aqz-KE-bpKQ',
		'https://youtube.com@evil.example/watch?v=aqz-KE-bpKQ',
	];

	test('a provider name away from the host position resolves to nothing, on every facet', () => {
		for (const u of HOSTILE) {
			assert.equal(providerFor(u), null, `${u}: no row`);
			assert.equal(detectProvider(u), null, `${u}: no poster/QR target`);
			assert.equal(embedSrc(u), null, `${u}: no player src`);
			assert.equal(isEmbeddable(u), false, `${u}: not embeddable`);
			assert.equal(providerShape(u), 'landscape', `${u}: default shape`);
		}
	});

	test('the watch target is re-serialized, so the two URL standards cannot disagree about it', () => {
		// A backslash is an authority terminator in WHATWG (every browser, and the
		// parser here) but userinfo in RFC 3986. `tiktok` and `instagram` hand their
		// watch target straight through, and that target is the payload of a QR code
		// somebody scans with a phone — so a raw string would let the scanner's parser
		// reach a different host than the one we validated.
		const p = detectProvider('https://instagram.com\\@evil.example/p/DaStLQkuN3Q/');
		assert.equal(p.key, 'instagram');
		assert.ok(!p.url.includes('\\'), 'no backslash survives into the href or the QR');
		assert.equal(new URL(p.url).hostname, 'instagram.com');
		// A scheme-less bullet becomes an absolute link, not a relative one.
		assert.equal(detectProvider('youtube.com/watch?v=aqz-KE-bpKQ').url, 'https://www.youtube.com/watch?v=aqz-KE-bpKQ');
	});

	test('the legitimate host forms still resolve — with and without scheme, www, or a trailing dot', () => {
		for (const u of [
			'https://www.youtube.com/watch?v=aqz-KE-bpKQ',
			'https://youtube.com/watch?v=aqz-KE-bpKQ',
			'youtube.com/watch?v=aqz-KE-bpKQ',
			'https://music.youtube.com/watch?v=aqz-KE-bpKQ',
			'https://youtu.be/aqz-KE-bpKQ',
			'https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ',
			// A fully-qualified name keeps its trailing dot through the parser; without
			// stripping it the row never matched and the slide silently rendered no poster.
			'https://youtube.com./watch?v=aqz-KE-bpKQ',
		]) {
			assert.equal(providerFor(u)?.key, 'youtube', u);
			assert.ok(detectProvider(u).id, `${u}: id extracted`);
		}
		assert.equal(providerFor('https://vimeo.com/1084537')?.key, 'vimeo');
		assert.equal(providerFor('https://www.tiktok.com/t/ZP8GrtdJH/')?.key, 'tiktok');
		assert.equal(providerFor('https://www.instagram.com/p/DaStLQkuN3Q/')?.key, 'instagram');
	});
});

describe('the id extractor agrees with the host matcher', () => {
	test('a mixed-case hostname still yields its id', () => {
		// The host is matched case-insensitively (the URL parser lowercases it), so an
		// id extractor without `i` would match the ROW and then find no id — leaving a
		// truncated watch target behind a valid-looking provider badge.
		for (const u of [
			'HTTPS://WWW.YOUTUBE.COM/watch?v=aqz-KE-bpKQ',
			'https://YouTube.com/watch?v=aqz-KE-bpKQ',
			'https://VIMEO.com/1084537',
		]) {
			const p = detectProvider(u);
			assert.ok(p.id, `${u}: extracted an id`);
			assert.ok(!p.url.endsWith('='), `${u}: watch target is not truncated`);
		}
	});

	test('a provider URL with NO id falls back to the authored URL, never a truncated one', () => {
		// A channel page, playlist or profile. Building from an empty id produced
		// `https://www.youtube.com/watch?v=` — a dead poster link AND a dead QR.
		for (const u of ['https://www.youtube.com/@somechannel', 'https://vimeo.com/channels/staffpicks']) {
			const p = detectProvider(u);
			assert.equal(p.id, '', `${u}: no id to find`);
			assert.equal(p.url, u, `${u}: watch target is what the author wrote`);
		}
	});
});

describe('a player src is always rebuilt from the parsed id', () => {
	test('every row emits its own origin, never the input URL', () => {
		for (const p of PROVIDERS) {
			if (!p.embed) continue;
			const src = p.embed('SAMPLE_ID0');
			assert.match(src, /^https:\/\//, `${p.key}: absolute https`);
			assert.ok(src.includes('SAMPLE_ID0'), `${p.key}: carries the id`);
			assert.ok(!src.includes('evil'), `${p.key}: no input passthrough`);
		}
	});
});
