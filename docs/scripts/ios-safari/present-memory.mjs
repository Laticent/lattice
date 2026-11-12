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

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const require = createRequire(path.join(root, 'package.json'));

export const PRESENT_PHOTOS = 18;
export const PRESENT_TITLE = 'Present memory probe';

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

/** The deck: one photo slide per picture, each heading `Photo N.`, the photo as the slide's background. */
export function presentDeckSource(n = PRESENT_PHOTOS) {
	const slides = [`---\ntitle: ${PRESENT_TITLE}\n---\n\n# ${PRESENT_TITLE}.\n\nEighteen phone photos, presented.`];
	for (let i = 1; i <= n; i++) slides.push(`## Photo ${i}.\n\n![bg](asset:probe-photo-${i})`);
	return slides.join('\n\n---\n\n');
}

/** The `.lattice` bytes, the photos as Library media (`media.json` + `media/<file>`), as the Studio's own export writes them. */
export async function buildPresentDeck(n = PRESENT_PHOTOS, size = 1100) {
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
	const bytes = await buildLatticeZip(JSZip, { source: presentDeckSource(n), title: PRESENT_TITLE, media: { index: `${JSON.stringify(index, null, 2)}\n`, files }, date: new Date(Date.UTC(2026, 0, 1)) });
	return { bytes, photoBytes, slides: n + 1 };
}

/**
 * The verdict on one arm, shared by run.mjs (Mobile Safari, with the Mac's footprint readings) and probe.selftest.mjs
 * (Playwright's WebKit, `memory: false`, where no footprint can be read). In Playwright's WebKit at iPhone size, `main`
 * took 11.8 s and 8.0 s on two of six steps and this build at most 0.57 s, so 2 s separates them with room for a slow runner.
 */
export function presentChecks(a, { slides, capMB, memory }) {
	const slow = (a.stepsMs || []).filter((ms) => ms > 2000);
	const checks = [
		{ name: 'the deck imported and Present counts all its slides', pass: !a.error && a.slides === slides, detail: a.error || `${a.slides} of ${slides} slides, imported in ${a.importMs} ms` },
		{ name: 'Present shows its first slide within 5 s', pass: a.openMs !== undefined && a.openMs <= 5000, detail: `${a.openMs ?? '?'} ms` },
		{ name: 'every step paints the next slide and its photo within 2 s', pass: !!a.stepsMs && slow.length === 0 && a.photos === true, detail: `${(a.stepsMs || []).join('/')} ms${a.photos === false ? ', a photo did not paint' : ''}` },
		{ name: 'the page did not reload under Present', pass: a.alive === true, detail: a.alive ? '' : 'the mark Present left is gone' },
	];
	if (memory) {
		checks.splice(1, 0, { name: 'the reader reads Safari (the Studio holds at least 50 MB before Present)', pass: a.baseMB >= 50, detail: `${a.baseMB ?? '?'} MB` });
		checks.push({ name: `Present and six steps add at most ${capMB} MB`, pass: a.grewMB !== undefined && a.grewMB <= capMB, detail: `${a.grewMB ?? '?'} MB (Present alone ${a.openGrewMB ?? '?'} MB, other processes freed ${a.freedMB ?? '?'} MB)` });
	}
	return checks;
}
