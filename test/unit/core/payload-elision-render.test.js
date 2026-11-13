// The engine skips a photo's base64 and puts it back (lib/core/payload-elision.js, wrapped around `render` in
// lib/engine/index.js). Every export renders through that door, so it must give what the WHOLE text gives, byte for
// byte. The web-image blocker sets what a preview may fetch, so it skips nothing; what it may never be is fooled by a
// run that only looks like a payload, and the kernel must never call such a run one.
// The oracle is the same input with skipping switched off: the kernel's export is wrapped before the engine loads it.
// (A short payload swapped for a long one is NOT an oracle: a payload the engine reads whole, in a code block, is
// highlighted, and `Zg==` tokenizes differently from `QUJD`.)
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const elision = require('../../../lib/core/payload-elision.js');
const { imageLineRanges } = require('../../../lib/engine/image-line-payloads.js');

const realElide = elision.elidePayloads;
let skipping = true;
// A test may reshape what the kernel hands the engine, to reach a guard no real deck reaches on its own.
let tamper = (cut) => cut;
elision.elidePayloads = (...args) => (skipping ? tamper(realElide(...args), args) : null);
const { createEngine } = require('../../../lib/engine/index.js');
const { blockWebImages } = require('../../../lib/core/remote-ref.js');

/** `fn` run with skipping on and with it off. */
function bothWays(fn) {
	skipping = true;
	const on = fn();
	skipping = false;
	try {
		return { on, off: fn() };
	} finally {
		skipping = true;
	}
}

const LONG = `${'QUJD'.repeat(400)}iVBORw0+Kgo/Zg==`;

// Every way a deck carries a picture, one per slide, in turn: the image line the engine skips, and the forms it reads whole.
const FORMS = [
	(p) => `![bg](data:image/jpeg;base64,${p})`,
	(p) => `![bg right:40%](data:image/png;base64,${p})`,
	(p) => `An inline ![a photo](data:image/jpeg;base64,${p}) in prose.`,
	(p) => `<img src="data:image/png;base64,${p}" alt="pasted">`,
	(p) => `<div style="background-image:url('data:image/png;base64,${p}')">Styled</div>`,
	(p) => `![](data:image/webp;base64,${p} "a title")`,
	(p) => `   ![photo](<data:image/png;base64,${p}>)`,
	(p) => `\`\`\`markdown\n![bg](data:image/png;base64,${p})\n\`\`\``,
];

function withPhotos(deck, p) {
	// After each slide break past the front matter, so every slide carries one picture. (One in the front matter is never
	// rendered: the engine finds its stand-in missing and renders the whole text, which is right and slower.)
	const fm = /^---\n[\s\S]*?\n---\n/.exec(deck)?.[0] ?? '';
	let n = 0;
	return fm + deck.slice(fm.length).replace(/\n---\n/g, () => `\n\n${FORMS[n++ % FORMS.length](p)}\n\n---\n`);
}

const DECKS = [
	path.join(__dirname, '../../integration/baseline-decks/gallery.md'),
	...['adaptive-image', 'bg-on-any-slide', 'bg-split-ratio', 'image-band', 'image-card-controls'].map((f) => path.join(__dirname, '../../../examples', `${f}.md`)),
];

describe('engine render: a photo payload is skipped and put back byte for byte', () => {
	const engine = createEngine();
	for (const file of DECKS) {
		test(path.basename(file), () => {
			const deck = withPhotos(fs.readFileSync(file, 'utf8'), LONG);
			const before = elision.readStats.renderChars;
			const skipped = engine.render(deck);
			const read = elision.readStats.renderChars - before;
			const { on, off } = bothWays(() => engine.render(deck));
			assert.ok(on.html.includes(LONG), 'the pictures reached the output');
			assert.deepEqual(on, off);
			assert.deepEqual(skipped, on);
			// Read once, and shorter. The gallery is read whole, rightly: it has display math (`$$`), and two of its slides
			// leave an image the author wrote out of the slide. The five photo decks take the short path.
			if (path.basename(file) === 'gallery.md') assert.ok(read >= deck.length, 'the gallery is read whole');
			else assert.ok(read < deck.length, `the skipping render read ${read} of ${deck.length} characters`);
		});
	}

	// A fence's text reaches a plugin, and anima and function-plot base64 it into an attribute where no stand-in could be
	// found again (the checker's case): a payload in a fence is never skipped.
	test('a plugin that packs its fence gets the whole payload', () => {
		const fences = [`\`\`\`anima\n{"scenes":[{"image":"data:image/png;base64,${LONG}"}]}\n\`\`\``, `\`\`\`functionplot\n{"title":"data:image/png;base64,${LONG}"}\n\`\`\``, `\`\`\`anima\n![bg](data:image/png;base64,${LONG})\n\`\`\``];
		for (const fence of fences) {
			const deck = `---\ntheme: indaco\nplugins: [anima, function-plot]\n---\n\n## Hi\n\n${FORMS[0](LONG)}\n\n${fence}\n`;
			const { on, off } = bothWays(() => engine.render(deck));
			assert.deepEqual(on, off, fence.slice(0, 20));
		}
	});

	// A `$$` block's text goes to KaTeX, which sets each character as a glyph: an image line there is not skipped (the
	// checker's case: the stand-in came out glyph by glyph and the payload past its first 960 characters was lost). A
	// stray `$$` before the block, in a code span, a fence or a comment, once flipped a count and let the line through
	// (the checker's second case), so a deck with any `$$` skips nothing. Inline math runs across a paragraph's lines, so
	// a line in a paragraph holding a `$` is read whole too.
	test('an image line math could reach is read whole', () => {
		const img = FORMS[0](LONG);
		for (const [deck, why] of [
			[`## Math\n\n$$\n${img}\n$$\n\n---\n\n${img}\n`, 'a math block'],
			[`## Hi\n\nPrice is \`$$\` today.\n\n$$\n${img}\n$$\n`, 'a stray $$ in a code span'],
			[`## Hi\n\n\`\`\`text\n$$\n\`\`\`\n\n$$\n${img}\n$$\n`, 'a stray $$ in a fence'],
			[`## Hi\n\n<!-- $$ -->\n\n$$\n${img}\n$$\n`, 'a stray $$ in a comment'],
			[`## Hi\n\n$x\n${img}\ny$\n`, 'inline math across lines'],
			[`## Hi\n\nCosts $5\n${img}\n`, 'a $ in the paragraph'],
		]) {
			const full = `---\ntheme: indaco\n---\n\n${deck}`;
			assert.equal(imageLineRanges(full).length, 0, why);
			const { on, off } = bothWays(() => engine.render(full));
			assert.deepEqual(on, off, why);
			assert.ok(!JSON.stringify(on).includes('LatticeElided'), why);
		}
		// A `$` in another paragraph does not stop the skip.
		assert.equal(imageLineRanges(`## Costs $5\n\n${img}\n`).length, 1);
	});

	// The fence scan errs toward "inside": a closer must be bare (CommonMark), and an opener after a list marker or a
	// `>` counts (the checker's cases: an info-string line read as a closer, and a list-item anima fence missed).
	test('an image line a fence could hold is read whole', () => {
		const img = FORMS[0](LONG);
		for (const [deck, why] of [
			[`\`\`\`anima\n\`\`\`x\n${img}\n\`\`\`\n`, 'an info-string line is not a closer'],
			[`- \`\`\`anima\n  ${img}\n  \`\`\`\n`, 'a fence in a list item'],
			[`> \`\`\`text\n> ${img}\n> \`\`\`\n`, 'a fence in a blockquote'],
		]) {
			assert.equal(imageLineRanges(deck).length, 0, why);
			const full = `---\ntheme: indaco\nplugins: [anima]\n---\n\n${deck}`;
			const { on, off } = bothWays(() => engine.render(full));
			assert.deepEqual(on, off, why);
		}
	});

	test('the flat sheet, a deck that already holds the marker, and the code door are read whole or identically', () => {
		const deck = `---\ntheme: indaco\n---\n\n<!-- _class: image -->\n\n## One\n\n${FORMS[0](LONG)}`;
		const flat = bothWays(() => engine.render(deck, undefined, { styles: 'flat' }));
		assert.deepEqual(flat.on, flat.off);
		const marked = bothWays(() => engine.render(`${deck}\n\nLatticeElidedPayload0x`));
		assert.deepEqual(marked.on, marked.off);
		const seen = [];
		const door = bothWays(() =>
			engine.render(deck, undefined, {
				codePackages: (html) => {
					seen.push(html);
					return html;
				},
			}),
		);
		assert.deepEqual(door.on, door.off);
		assert.ok(seen.every((h) => !h.includes('LatticeElidedPayload')), 'a package was handed a stand-in');
	});

	test('a stand-in that reaches a field other than a string is never returned: the whole text is rendered', () => {
		// The engine puts payloads back in its string fields only. A stand-in in `diagnostics` (here a plugin name the
		// front matter quotes, cut everywhere and with `standIns` emptied so the html check above it passes) must send the
		// render to the whole text instead of returning the marker.
		tamper = (cut, [source, opts]) => {
			const wide = realElide(source, { ...opts, rangesOf: undefined });
			return wide && { ...wide, standIns: [] };
		};
		try {
			const deck = `---\nplugins: ["=data:image/png;base64,${LONG}"]\n---\n\n# A\n`;
			const { on, off } = bothWays(() => engine.render(deck));
			assert.ok(JSON.stringify(off.diagnostics).includes(LONG), 'the diagnostic quotes the payload');
			assert.ok(!JSON.stringify(on).includes('LatticeElided'), 'a stand-in came back in the render');
			assert.deepEqual(on, off);
		} finally {
			tamper = (cut) => cut;
		}
	});
});

describe('blockWebImages: a photo render reads as the whole text does', () => {
	const engine = createEngine();
	test('with web images around the payloads, with and without the no-policy reading', () => {
		const deck = fs.readFileSync(DECKS[0], 'utf8');
		const web = withPhotos(deck, LONG).replace(/\n---\n/g, '\n\n![bg](https://cdn.example/a.jpg) <img src="https://ok.example/b.png">\n\n---\n');
		const html = engine.render(web).html;
		for (const fonts of [false, true]) {
			const { on, off } = bothWays(() => blockWebImages(html, ['https://ok.example'], { fonts, DOMParser: null }));
			assert.ok(off.blocked.length > 0 && off.html.includes(LONG));
			assert.deepEqual(on, off);
		}
	});

	// A run that looks like base64 but carries syntax: inside a tag `/` separates attributes and `=` starts a value, so
	// `;base64,AAAA…/src=https://…` holds a `src` (the checker's case, PR #3153). It is not a payload, and is read whole.
	test('a run that hides an attribute is not a payload', () => {
		const run = 'AAAA'.repeat(300);
		const cases = [
			`<img alt=x data:a/b;base64,${run}/src="https://tracker.allowed.example/x.png">`,
			`<img alt=x data:a/b;base64,${run}/src='https://tracker.allowed.example/x.png'>`,
			`<img alt=x data:a/b;base64,${run}/style="background:url(https://tracker.allowed.example/y.png)">`,
			`<img alt=x "data:a/b;base64,${run}/src="https://tracker.allowed.example/x.png">`,
			`<img alt="p" ;base64,${run}/src=https://tracker.allowed.example/x.png>`,
			`<img alt="p" data:image/png;base64,${run}/src=https://tracker.allowed.example/x.png>`,
			`<img alt="p" data:image/png;base64,${run}/src=//intranet/x>`,
			`<div data:image/png;base64,${run}/style=background:url(https://tracker.allowed.example/y.png)>x</div>`,
			`<svg><image data:image/png;base64,${run}/><image href="https://tracker.allowed.example/z.png"/></svg>`,
		];
		for (const html of cases) {
			assert.equal(elision.payloadRanges(html).length, 0, html.slice(0, 40));
			const { on, off } = bothWays(() => blockWebImages(html, ['https://allowed.example'], { DOMParser: null }));
			assert.deepEqual(on, off);
		}
		for (const html of cases.slice(0, 4)) assert.equal(blockWebImages(html, ['https://allowed.example'], { DOMParser: null }).blocked.length, 1, `the tracker is blocked: ${html.slice(0, 30)}`);
	});
});

// The blocker reads every character, so its decoder copies runs into a typed map instead of a character at a time
// (lib/core/web-ref-readers.js). Pinned to the per-character reference it replaced, on random text full of references.
describe('decodeEntitiesMapped: the run copy gives what the character copy gave', () => {
	const { decodeEntitiesMapped } = require('../../../lib/core/remote-ref.js');
	const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
	test('text and map, on 2,000 seeded inputs, attribute and not', () => {
		let seed = 3153;
		const rnd = (n) => {
			seed = (seed * 1664525 + 1013904223) >>> 0;
			return seed % n;
		};
		console.log(`seed 3153`);
		const pieces = ['a', 'Z', '9', '+', '/', '=', ' ', '&amp;', '&amp', '&lt', '&quot=', '&#65;', '&#x41;', '&#0;', '&#128;', '&#x1F600;', '&bogus;', '&', ';', '&ampx', '&#;'];
		for (let i = 0; i < 2000; i++) {
			const raw = Array.from({ length: rnd(40) }, () => pieces[rnd(pieces.length)]).join('');
			for (const attribute of [false, true]) {
				const got = decodeEntitiesMapped(raw, { attribute });
				const ref = referenceDecode(raw, attribute);
				assert.equal(got.text, ref.text, raw);
				assert.deepEqual([...got.map], ref.map, raw);
			}
		}
		// What the reference shares with the shipped decoder: the names it knows are a subset, checked on their own.
		for (const [n, c] of Object.entries(NAMED)) assert.equal(decodeEntitiesMapped(`&${n};`).text, c);
	});

	// The decoder as it was before PR #3153, a character at a time (lib/core/web-ref-readers.js at 8749f421).
	function referenceDecode(raw, attribute) {
		const { ASCII_NAMED } = require('../../../lib/core/web-ref-readers.js').makeWebRefReaders({
			isRemoteUrl: require('../../../lib/core/media-sources.js').isRemoteRef,
			...require('../../../lib/core/css-token-readers.js'),
			makeCssRefSpans: require('../../../lib/core/css-ref-reader.js').makeCssRefSpans,
			cssParser: require('../../../lib/core/css-ref.generated.js'),
			makeScanHtml: require('../../../lib/core/html-ref-reader.js').makeScanHtml,
			rawTextEnd: require('../../../lib/core/html-ref-reader.js').rawTextEnd,
			htmlParser: require('../../../lib/core/html-ref.generated.js'),
		});
		const LEGACY = new Set(['amp', 'lt', 'gt', 'quot', 'AMP', 'LT', 'GT', 'QUOT']);
		const W1252 = { 128: 0x20ac }; // the only windows-1252 reference the seeded inputs write
		const REF = /&(?:#(\d+)|#[xX]([0-9a-fA-F]+)|([A-Za-z]+))(;?)/g;
		let text = '';
		const map = [];
		let at = 0;
		const copy = (to) => {
			for (; at < to; at++) {
				map.push(at);
				text += raw[at];
			}
		};
		for (let m = REF.exec(raw); m; m = REF.exec(raw)) {
			const [whole, dec, hex, name, semi] = m;
			let out;
			if (dec || hex) {
				let cp = Number.parseInt(dec ?? hex, dec ? 10 : 16);
				cp = W1252[cp] ?? cp;
				out = cp === 0 || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff) ? '\uFFFD' : String.fromCodePoint(cp);
			} else if (Object.hasOwn(ASCII_NAMED, name) && (semi || (LEGACY.has(name) && !(attribute && /[=A-Za-z0-9]/.test(raw[m.index + whole.length] ?? ''))))) {
				out = ASCII_NAMED[name];
			} else continue;
			copy(m.index);
			for (let k = 0; k < out.length; k++) map.push(m.index);
			text += out;
			at = m.index + whole.length;
		}
		copy(raw.length);
		map.push(raw.length);
		return { text, map };
	}
});
