/**
 * The PRESENT MEMORY fixture for the iOS Simulator suite (PROBE=present-memory, PR #3148): a deck of eighteen
 * phone-photo-sized pictures, packed as the `.lattice` project the Studio imports, the way the owner's deck reached it.
 *
 * Before #3148, opening Present on such a deck built the Stage window's document with every photo spelled out as a
 * base64 `data:` URL (about 33 MB of text for the owner's eighteen photos) and walked that text through the engine;
 * an iPhone reloaded the tab. The probe (present-memory-probe.js, driven by run.mjs) imports this deck, opens Present,
 * steps through it, and reads the simulator's WebKit footprint on the Mac (photo-memory.mjs `simulatorWebContentMB`).
 *
 * Pure Node (zlib and the repo's own `.lattice` writer, lib/core/reopenable.js), so the Linux self-test builds the same
 * bytes the macOS job does. The pixels are seeded (HARD RULE #32): the same deck every run.
 */

import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import { FOUR_K_FROM } from '../../../lib/core/screen-canvas.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const require = createRequire(path.join(root, 'package.json'));

export const PRESENT_PHOTOS = 18;
export const PRESENT_TITLE = 'Present memory probe';
/** The 4K arm's deck has its own title, so the arm can tell it is presenting that deck and not the HD arm's import. */
export const PRESENT_TITLE_4K = 'Present memory probe in 4K';
/** The landscape probe's deck (PROBE=present-landscape): the 4K photos again, with spoken notes so captions have lines. */
export const PRESENT_TITLE_LANDSCAPE = 'Present landscape probe in 4K';

const CRC = Array.from({ length: 256 }, (_, n) => {
	let c = n;
	for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
	return c >>> 0;
});
function crc32(buf) {
	let c = ~0;
	for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8);
	return ~c >>> 0;
}
function chunk(type, data) {
	const out = Buffer.alloc(12 + data.length);
	out.writeUInt32BE(data.length, 0);
	out.write(type, 4, 'latin1');
	data.copy(out, 8);
	out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
	return out;
}

/**
 * A square RGB PNG of `size` pixels, about the bytes of a phone photo saved as PNG (the owner's were 1032-1179 px and
 * 1.1-1.3 MB each): a gradient with one seeded bit of grain, so it neither compresses to nothing nor stays raw.
 * Eighteen at 1100 px come to 24.1 MB, about 32 MB as base64: the owner's deck was 33 MB of `data:` text.
 */
export function photoPng(size, seed) {
	let x = (seed * 2654435761) >>> 0;
	const rand = () => {
		x = (x * 1103515245 + 12345) >>> 0;
		return x >>> 24;
	};
	const stride = size * 3 + 1;
	const raw = Buffer.alloc(stride * size);
	for (let y = 0; y < size; y++) {
		raw[y * stride] = 0;
		for (let i = 0; i < size; i++) {
			const o = y * stride + 1 + i * 3;
			const g = rand() & 1;
			raw[o] = ((i * 255) / size + seed * 13 + g) & 255;
			raw[o + 1] = ((y * 255) / size + g) & 255;
			raw[o + 2] = (((i + y) * 127) / size + seed * 29 + g) & 255;
		}
	}
	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(size, 0);
	ihdr.writeUInt32BE(size, 4);
	ihdr[8] = 8;
	ihdr[9] = 2;
	return new Uint8Array(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 6 })), chunk('IEND', Buffer.alloc(0))]));
}

/**
 * The deck: one photo slide per picture, each heading `Photo N.`, the photo as the slide's background. `deckSize` adds a
 * `size:` line: the 4K arm (#3304) presents the same photos on a 4K deck, the canvas whose frames reloaded an iPhone tab,
 * which the Studio lays out on HD wherever the slide is shown at 2,560 device px or fewer (lib/core/screen-canvas.mjs).
 */
export function presentDeckSource(n = PRESENT_PHOTOS, deckSize = '', title = PRESENT_TITLE, say = false) {
	const size = deckSize ? `size: ${deckSize}\n` : '';
	// `say` gives every slide a spoken note long enough to wrap to a second caption line on a phone: the landscape probe
	// plays the deck, and a caption band that clips its second line is the defect it looks for (#3304, `height: auto`).
	// ONE sentence per note, long enough to wrap: over the slide, Present shows only the sentence being read, so a short
	// first sentence would be all the probe ever measured (the check then could not see a clipped second line).
	const note = (what) => (say ? `\n\n<!-- @say{${what}, and the caption that carries this sentence should keep every one of its wrapped lines whole and inside the slide, on a phone turned sideways as much as on one held upright.} -->` : '');
	const slides = [`---\ntitle: ${title}\n${size}---\n\n# ${title}.\n\nEighteen phone photos, presented.${note('This is the title slide of the landscape probe')}`];
	for (let i = 1; i <= n; i++) slides.push(`<!-- _class: content bleed -->\n\n## Photo ${i}.\n\n![Probe photo ${i}](asset:probe-photo-${i})${note(`This is photo ${i}`)}`);
	return slides.join('\n\n---\n\n');
}

/** The `.lattice` bytes, the photos as Library media (`media.json` + `media/<file>`), as the Studio's own export writes them. */
export async function buildPresentDeck(n = PRESENT_PHOTOS, size = 1100, deckSize = '', title = PRESENT_TITLE, say = false) {
	const JSZip = require('jszip');
	const { buildLatticeZip } = require('./lib/core/reopenable.js');
	const files = {};
	const index = [];
	let photoBytes = 0;
	for (let i = 1; i <= n; i++) {
		const bytes = photoPng(size, i);
		photoBytes += bytes.length;
		const file = `probe-photo-${i}.png`;
		files[`media/${file}`] = bytes;
		index.push({ name: `probe-photo-${i}`, kind: 'image', scope: 'library', mime: 'image/png', bytes: bytes.length, width: size, height: size, sourceName: file, original: true, addedAt: 1, file });
	}
	const bytes = await buildLatticeZip(JSZip, { source: presentDeckSource(n, deckSize, title, say), title, media: { index: `${JSON.stringify(index, null, 2)}\n`, files }, date: new Date(Date.UTC(2026, 0, 1)) });
	return { bytes, photoBytes, slides: n + 1 };
}

/**
 * The verdict on one arm, shared by run.mjs (Mobile Safari, with the Mac's footprint readings) and probe.selftest.mjs
 * (Playwright's WebKit, `memory: false`, where no footprint can be read). It judges WORK, never the clock (HARD RULE #32):
 * every step reached its slide and that slide's photo decoded, the page did not reload, and Present added at most `capMB`. The times are
 * reported in the details and judged by no check: the first iOS run read 1,965 ms on a step a 2 s limit would have
 * passed by 35 ms, and on the Mac's fast simulator `main` and this change stepped at the same speed.
 * The memory is what separates them: the first iOS run read 795 MB on `main` and 124 MB on #3148.
 */
export function presentChecks(a, { slides, capMB, memory, box }) {
	const checks = [
		{ name: 'the deck imported and Present counts all its slides', pass: !a.error && a.slides === slides, detail: a.error || `${a.slides} of ${slides} slides, imported in ${a.importMs} ms` },
		{ name: 'Present showed its first slide', pass: a.openMs !== undefined, detail: `${a.openMs ?? '?'} ms` },
		{ name: 'every step reached the next slide and its photo decoded', pass: (a.stepsMs || []).length === 6 && a.photos === true, detail: `${(a.stepsMs || []).join('/')} ms${a.photos === false ? ', a photo did not decode' : ''}` },
		{ name: 'the page did not reload under Present', pass: a.alive === true, detail: a.alive ? '' : 'the mark Present left is gone' },
	];
	// The 4K arm: the presented slide is laid out on the canvas this screen shows. On an iPhone (about 1,179 device px across)
	// that is HD's 1280 px, never the 3840 a 4K frame would be, and the reason the tab no longer reloads.
	if (box) checks.push({ name: `Present shows the 4K deck, laid out ${box} wide`, pass: a.box === box && a.heading === a.wantHeading, detail: `${a.box || 'no width read'}, title "${a.heading ?? ''}"` });
	if (memory) {
		checks.splice(1, 0, { name: 'the reader reads Safari (the Studio holds at least 50 MB before Present)', pass: a.baseMB >= 50, detail: `${a.baseMB ?? '?'} MB` });
		checks.push({ name: `Present and six steps add at most ${capMB} MB`, pass: a.grewMB !== undefined && a.grewMB <= capMB, detail: `${a.grewMB ?? '?'} MB (Present alone ${a.openGrewMB ?? '?'} MB, other processes freed ${a.freedMB ?? '?'} MB)` });
	}
	return checks;
}

/**
 * The verdict on the LANDSCAPE arm (PROBE=present-landscape, #3304), on top of `presentChecks`. The arm presents the 4K
 * photo deck on a simulator turned sideways: the iPad Pro 13-inch, the one iPad screen wider than FOUR_K_FROM device
 * px, and an iPhone, with captions playing over the slide.
 *
 *   `a.geo`       latticePresentGeometry() after Present opened: the viewport, the density, the slide host's width on
 *                 screen, and the width the slide is laid out at
 *   `a.captions`  latticePresentCaptions() on the phone: the band shown, inside the slide, every line whole, the
 *                 highlight walking, and Play/Pause leaving the slide's size alone
 *
 * The canvas is judged against lib/core/screen-canvas.mjs's own rule applied to what the page measured, so the check
 * holds on whatever device the runner image ships; `expect` then pins what that device does in Studio Present: HD on
 * any phone, and HD on the 13-inch iPad in landscape too, where Present's chrome left the slide host 1,099 CSS px in
 * the Playwright self-test (2,198 device px, under FOUR_K_FROM); the iOS run is what confirms it. States and sizes only, never a duration (HARD RULE #32).
 */
export function landscapeChecks(a, { expect, captions }) {
	const g = a.geo || {};
	const devicePx = Math.round((g.hostW || 0) * (g.dpr || 0));
	const want = devicePx > FOUR_K_FROM ? '3840px' : '1280px';
	const share = g.innerW ? (g.slideW || 0) / g.innerW : 0;
	const checks = [
		{ name: 'the simulator is turned to landscape', pass: g.innerW > g.innerH, detail: `${g.innerW ?? '?'}x${g.innerH ?? '?'} CSS px, turned by ${a.rotatedBy || 'nothing'}` },
		{ name: 'Present held its layout after the turn', pass: g.settled === true, detail: g.settled ? `rotation hold ${g.sawHold ? 'seen' : 'not seen'}` : 'the layout never held within 20 s' },
		// A floor, so a regression that shrinks the presented slide to a stamp cannot pass the canvas checks below: sideways,
		// the slide spans most of the screen (the self-test read 62% on the 13-inch iPad, 77% on the iPhones).
		{ name: 'the presented slide spans at least 45% of the screen\'s width', pass: share >= 0.45, detail: `${g.slideW ?? '?'} of ${g.innerW ?? '?'} CSS px (${Math.round(share * 100)}%)` },
		{ name: 'the slide is laid out on the canvas the screen canvas rule picks', pass: g.hostW >= 100 && !!g.box && g.box === want, detail: `${g.hostW ?? '?'} CSS px x ${g.dpr ?? '?'} = ${devicePx} device px: rule says ${want}, laid out ${g.box || 'unread'}` },
		{ name: `the 4K deck is laid out ${expect === '4k' ? 'on 4K' : 'on HD'} in Studio Present on this device`, pass: g.box === (expect === '4k' ? '3840px' : '1280px'), detail: g.box || 'unread' },
	];
	if (captions) {
		const c = a.captions || {};
		checks.push(
			{ name: 'captions play over the slide, inside its frame, and the highlight walks', pass: c.inside === true && c.lit > 1, detail: c.error || `"${c.caption ?? ''}" ${c.lit ?? 0} lit` },
			{ name: 'the caption on screen wraps to at least two lines (so the next check can see a clipped line)', pass: c.screenLines >= 2, detail: `${c.trackH ?? '?'} px at ${c.lineH ?? '?'} px a line = ${c.screenLines ?? '?'} line(s)` },
			{ name: 'the caption band sizes to its sentence, every line whole', pass: c.clipped === false, detail: `band ${c.bandH ?? '?'} px for ${c.trackH ?? '?'} px of caption` },
			{ name: 'Play and Pause leave the slide its size', pass: c.resized === false, detail: `${c.frameBefore ?? '?'} -> ${c.frameAfter ?? '?'} px` },
		);
	}
	return checks;
}
