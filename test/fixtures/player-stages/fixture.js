/**
 * A player-assembly fixture that fires EVERY stage of the export pipeline, for the
 * host-parity golden (test/integration/export/player-host-parity.test.js).
 *
 * The frozen-artifact golden in test/unit/export/html-player.test.js reaches none of the
 * late stages: its font is two bytes of fake base64, it carries no picture, and its sheet is
 * far below the prune's 50,000-character floor. This one does, on purpose:
 *
 *   · glyph subsetting — real woff2 faces from assets/fonts;
 *   · the font prune — a display face nothing on the page names;
 *   · the identical-file font merge — one Outfit file declared at two weights;
 *   · the asset hoist — two distinct pictures, each used on two slides (player-assets.mjs);
 *   · the CSS prune — a deck sheet over the floor, most of it rules nothing matches;
 *   · the computed-style gate — the used rules really style the slides.
 *
 * Pure and deterministic: the pictures are PNGs drawn from a fixed seed and stored without
 * compression, so the bytes depend on neither the machine nor the Node release. CommonJS, so a test and a scratch script can both require it.
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..', '..');

function crc32(buf) {
	let c;
	let crc = 0xffffffff;
	for (const b of buf) {
		c = (crc ^ b) & 0xff;
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		crc = (crc >>> 8) ^ c;
	}
	return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
	const len = Buffer.alloc(4);
	len.writeUInt32BE(data.length);
	const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
	const crc = Buffer.alloc(4);
	crc.writeUInt32BE(crc32(body));
	return Buffer.concat([len, body, crc]);
}

/**
 * A zlib stream of STORED (uncompressed) deflate blocks. Written by hand rather than with
 * `zlib.deflateSync`, whose output may change with the zlib build a Node release bundles: the
 * golden must not move because CI's Node moved.
 */
function storedZlib(raw) {
	const parts = [Buffer.from([0x78, 0x01])];
	for (let i = 0; i < raw.length || i === 0; i += 65535) {
		const block = raw.subarray(i, i + 65535);
		const head = Buffer.alloc(5);
		head[0] = i + 65535 >= raw.length ? 1 : 0;
		head.writeUInt16LE(block.length, 1);
		head.writeUInt16LE(~block.length & 0xffff, 3);
		parts.push(head, block);
	}
	let a = 1;
	let b = 0;
	for (const byte of raw) {
		a = (a + byte) % 65521;
		b = (b + a) % 65521;
	}
	const adler = Buffer.alloc(4);
	adler.writeUInt32BE(((b << 16) | a) >>> 0);
	parts.push(adler);
	return Buffer.concat(parts);
}

/** A `size`×`size` RGB noise PNG from a fixed seed: big enough to cross the hoist's 2 KB floor. */
function noisePng(seed, size = 40) {
	let s = seed >>> 0;
	const rand = () => {
		s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
		return s >>> 24;
	};
	const raw = Buffer.alloc(size * (size * 3 + 1));
	for (let y = 0; y < size; y++) {
		raw[y * (size * 3 + 1)] = 0;
		for (let x = 0; x < size * 3; x++) raw[y * (size * 3 + 1) + 1 + x] = rand();
	}
	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(size, 0);
	ihdr.writeUInt32BE(size, 4);
	ihdr[8] = 8;
	ihdr[9] = 2;
	const png = Buffer.concat([
		Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		chunk('IHDR', ihdr),
		chunk('IDAT', storedZlib(raw)),
		chunk('IEND', Buffer.alloc(0)),
	]);
	return `data:image/png;base64,${png.toString('base64')}`;
}

function face(family, weight, file) {
	const b64 = fs.readFileSync(path.join(ROOT, 'assets', 'fonts', file)).toString('base64');
	return `@font-face{font-family:'${family}';font-style:normal;font-weight:${weight};font-display:swap;src:url(data:font/woff2;base64,${b64}) format('woff2')}`;
}

/** The deck stylesheet: a few rules the slides use, then enough unused ones to cross the floor. */
function deckSheet() {
	const used = [
		'section[data-lattice-slide]{font-family:Outfit,sans-serif;color:var(--text-body,#222);background:var(--bg,#fff);padding:48px}',
		'section[data-lattice-slide] h1{font-size:48px;font-weight:700;letter-spacing:-.01em}',
		'section[data-lattice-slide] h2{font-size:32px;font-weight:500}',
		'section.photo{background-size:cover;background-position:center}',
		'section[data-lattice-slide] p{line-height:1.5}',
	];
	const unused = [];
	for (let i = 0; unused.join('').length < 60000; i++) {
		unused.push(`section.unused-${i} .card-${i}>li::before{content:"";display:block;width:${i % 40}px;color:var(--accent,#036);border-top:1px solid var(--border,#ccc)}`);
	}
	return used.join('') + unused.join('');
}

/** The emulator-shaped `docHtml` the assembler takes, and the source and options beside it. */
function playerStagesFixture() {
	const a = noisePng(1);
	const b = noisePng(2);
	// Outfit 300 and 400 are the SAME file, so the identical-file merge can declare it once; the
	// display face is a family nothing names, so the font prune drops it.
	const fonts = [
		face('Outfit', 300, 'outfit-400.woff2'),
		face('Outfit', 400, 'outfit-400.woff2'),
		face('Outfit', 700, 'outfit-700.woff2'),
		face('Unused Display', 400, 'playfair-400.woff2'),
	].join('');
	const slide = (n, cls, inner, pic) =>
		`<section data-lattice-slide="${n}" id="${n}" class="${cls}"${pic ? ` style="background-image:url('${pic}')"` : ''}>${inner}</section>`;
	const docHtml = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>Stages</title>
<style id="lattice-embedded-fonts">${fonts}</style>
<style>${deckSheet()}</style>
</head><body>
${slide(1, 'title', '<h1>Every stage</h1><p>A fixture that fires the whole pipeline.</p>')}
${slide(2, 'photo', '<h2>First picture</h2>', a)}
${slide(3, 'photo', '<h2>Second picture</h2>', b)}
${slide(4, 'photo', '<h2>First, again</h2>', a)}
${slide(5, 'photo', '<h2>Second, again</h2>', b)}
</body></html>`;
	return {
		docHtml,
		source: '---\ntheme: indaco\n---\n\n# Every stage\n',
		title: 'Stages',
		now: 0,
		build: 'GOLDEN',
		// Pins the glyph-cut path on both hosts: the default (`used`) keeps text faces whole, which would skip that stage.
		fonts: 'exact',
		playerVersion: 'GOLDEN',
	};
}

module.exports = { playerStagesFixture, noisePng };
