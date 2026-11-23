/**
 * The PRESENT NARRATION fixture for the iOS Simulator suite (PROBE=present-narration). The owner's report (2026-11-17):
 * Present with narration and Guide on reloaded the tab on an iPhone, partway through a 38-slide `size: 4k` deck whose
 * every slide carries a spoken note; with narration off it did not. This deck has the same shape: a 4K canvas, Guide-able
 * prose on every slide, and an `@say{…}` note of about the owner's length, so about ten minutes of narration in all. The text is
 * generated and seeded (HARD RULE #32): the same deck every run, and no one's talk committed as a fixture.
 *
 * The probe (present-narration-probe.js, driven by run.mjs) imports it, installs a stand-in cloud voice that answers in
 * the page, and plays Present twice, voice on and voice off, reading the simulator's WebKit footprint as it plays.
 */

import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const require = createRequire(path.join(root, 'package.json'));

export const NARRATION_TITLE = 'Present narration probe';
export const NARRATION_SLIDES = 30;

const WORDS = 'evidence mission fidelity oracle boundary transfer ledger retry timeout parity invariant scenario coverage mutation property fuzzing contract surface reviewer customer settlement replica broker gateway'.split(' ');

/** A deterministic sentence of `n` words, so the narration's length (and so its audio) is the same every run. */
function sentence(seed, n) {
	const out = [];
	let x = seed * 7919 + 13;
	for (let i = 0; i < n; i++) {
		x = (x * 1103515245 + 12345) % 2147483648;
		out.push(WORDS[x % WORDS.length]);
	}
	out[0] = out[0][0].toUpperCase() + out[0].slice(1);
	return `${out.join(' ')}.`;
}

/** The deck: a title, then content slides of a heading and three bullets, each with an `@say{…}` note of about 55 words (lib/core/note-grammar.mjs). */
export function narrationDeckSource(n = NARRATION_SLIDES) {
	const say = (k) => [sentence(k, 14), sentence(k + 101, 13), sentence(k + 211, 15), sentence(k + 307, 13)].join(' ');
	const slides = [`---\ntheme: indaco\nsize: 4k\ntitle: ${NARRATION_TITLE}\n---\n\n<!-- _class: title -->\n\n# ${NARRATION_TITLE}.\n\nTen minutes of narration on a 4K canvas.\n\n<!-- @say{${say(0)}} -->`];
	for (let k = 1; k < n; k++) {
		slides.push(`## Slide ${k} names one claim.\n\n- ${sentence(k + 401, 7)}\n- ${sentence(k + 503, 8)}\n- ${sentence(k + 601, 7)}\n\n<!-- @say{${say(k)}} -->`);
	}
	return slides.join('\n\n---\n\n');
}

/** The `.lattice` bytes, as the Studio's own export writes them. */
export async function buildNarrationDeck(n = NARRATION_SLIDES) {
	const JSZip = require('jszip');
	const { buildLatticeZip } = require('./lib/core/reopenable.js');
	const bytes = await buildLatticeZip(JSZip, { source: narrationDeckSource(n), title: NARRATION_TITLE, date: new Date(Date.UTC(2026, 0, 1)) });
	return { bytes, slides: n };
}

/**
 * The verdict, shared by run.mjs (Mobile Safari, with the Mac's footprint readings) and probe.selftest.mjs (Playwright's
 * WebKit, `memory: false`). It judges WORK, never the clock (HARD RULE #32): the voice arm advanced and spoke, the page
 * did not reload, and the decoded narration the page still holds stays under `audioCapMB`. With `memory`, the voice arm
 * also adds at most `capMB` to the simulator's WebKit footprint. The times and the silent arm are reported, not judged.
 */
export function narrationChecks(arms, { slides, capMB, audioCapMB, memory, targetSlide = 15 }) {
	const on = arms.find((a) => a.voice) ?? { error: 'not run' };
	const last = on.samples?.at(-1) ?? {};
	const checks = [
		{ name: 'the deck imported and Present counts all its slides', pass: !on.error && on.total === slides, detail: on.error || `${on.total} of ${slides} slides` },
		// Narration requested across the deck: four sentences a slide (the deck's `say()`), so at least 4 per slide walked. The
		// arm walks to `targetSlide` (run.mjs NARRATION_TARGET_SLIDE) and is judged on that work, never on how far a fixed
		// time got it (HARD RULE #32).
		{ name: 'the voice arm asked for narration across the deck', pass: (last.slide ?? 1) >= targetSlide && (last.speech ?? 0) >= 4 * ((last.slide ?? 1) - 1), detail: `${last.speech ?? 0} sentences asked for (${last.pcm ?? 0} as PCM), on slide ${last.slide ?? '?'} after ${on.playedS ?? '?'} s` },
		{ name: 'the page did not reload while narration played', pass: on.alive === true, detail: on.alive ? '' : 'the mark Present left is gone' },
		{ name: `the narration audio decoded stays under ${audioCapMB} MB, and some was decoded`, pass: (last.clips ?? 0) > 0 && last.liveMB !== undefined && last.liveMB <= audioCapMB, detail: `${last.liveMB ?? '?'} MB counted of ${last.decodedMB ?? '?'} MB decoded, ${last.clips ?? '?'} clips at ${last.sampleRate ?? '?'} Hz` },
	];
	if (memory) {
		// The reader reads Safari: an empty vmmap read sums to 0 and would pass the cap on nothing (present-memory.mjs).
		checks.push({ name: 'the reader reads Safari (the Studio holds at least 50 MB before Present)', pass: (on.baseMB ?? 0) >= 50, detail: `${on.baseMB ?? '?'} MB` });
		checks.push({ name: `Present with narration adds at most ${capMB} MB`, pass: on.peakGrewMB !== undefined && on.peakGrewMB <= capMB, detail: `peak ${on.peakGrewMB ?? '?'} MB above ${on.baseMB ?? '?'} MB` });
	}
	return checks;
}
