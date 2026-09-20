// @vitest-environment node
// This file touches no DOM. Under the suite default it paid for a jsdom window it
// never used; see engineering/decisions/2026-09-20-dom-library-bakeoff.md.
import { describe, expect, it } from 'vitest';
// The boundary gate skips *.test.ts, which is what lets this file do the one thing the
// library itself must not: import Cadenza, and pin the two engines' reading rate together.
import { PACE_WPM } from '@/lib/cadenza';
import { CAPTION_MAX_MS, CAPTION_MIN_MS, CAPTION_WPM, NOMINAL_TARGET_PX, REGISTER_MS, resolvePacing, TRAVEL_MAX_MS, TRAVEL_MIN_MS } from './pacing';
import { readMs } from './storyboard';

describe('pacing — the caption reading budget', () => {
	it('matches Cadenza word for word: the two engines read at ONE rate', () => {
		// This is the whole reason the constant is duplicated rather than imported. The two
		// libraries are separately spin-off-able, so Vetrina cannot import `PACE_WPM` — but they
		// narrate the same words to the same viewer, and before this test they disagreed by 2x
		// (Vetrina 300 wpm, Cadenza 150 wpm). A copy with a pin is honest; a copy without one is
		// how you get back to two answers.
		expect(CAPTION_WPM).toEqual(PACE_WPM);
	});

	it('is slower than undistracted silent reading, and inside the subtitle band', () => {
		// Brysbaert 2019 (77 studies, 5,965 participants): ~238 wpm for silent non-fiction.
		// BBC subtitle guidance: 160–180 wpm. A tour caption is the DISTRACTED case, so it has
		// to sit below the first number, and near the second.
		expect(CAPTION_WPM.moderate).toBeLessThan(238);
		expect(CAPTION_WPM.moderate).toBeGreaterThanOrEqual(120);
		expect(CAPTION_WPM.moderate).toBeLessThanOrEqual(180);
	});

	it('gives a long caption more time than the shipped estimate did', () => {
		const p = resolvePacing('moderate', 'grounded');
		const legacy = resolvePacing('moderate', 'legacy');
		const line = 'Every slide in this deck is plain Markdown, and the engine picks the layout from what you wrote.';
		expect(p.captionMs(line)).toBeGreaterThan(legacy.captionMs(line));
	});

	it('clamps a one-word caption up and a paragraph down', () => {
		const p = resolvePacing('moderate', 'grounded');
		expect(p.captionMs('Done.')).toBe(CAPTION_MIN_MS);
		expect(p.captionMs(new Array(400).fill('word').join(' '))).toBe(CAPTION_MAX_MS);
	});

	it('a slow preset dwells longer than a fast one', () => {
		const line = 'Give the deck a title, then publish it.';
		expect(resolvePacing('slow', 'grounded').captionMs(line)).toBeGreaterThan(resolvePacing('fast', 'grounded').captionMs(line));
	});

	it('the preset is applied ONCE — the rate table is already indexed by it', () => {
		// The call site must NOT multiply by `stage.pace` on top of this. When it did, `slow`
		// spent 6720ms on a line the model prices at 4800 (86 effective wpm) and `fast` came out
		// at 243 wpm — above the undistracted silent-reading rate the budget exists to sit below —
		// while the documented 1.0–6.0s clamp bounded neither end.
		const line = 'Give the deck a title, then publish it.';
		const words = line.trim().split(/\s+/).length;
		for (const speed of ['slow', 'moderate', 'fast'] as const) {
			expect(resolvePacing(speed, 'grounded').captionMs(line)).toBe(Math.round(300 + (60000 / CAPTION_WPM[speed]) * words));
		}
	});

	it('legacy ignores the preset entirely, which is what it did before the model existed', () => {
		const line = 'Give the deck a title, then publish it.';
		expect(resolvePacing('slow', 'legacy').captionMs(line)).toBe(resolvePacing('fast', 'legacy').captionMs(line));
	});
});

describe('pacing — travel is Fitts, not distance', () => {
	const p = resolvePacing('moderate', 'grounded');

	it('spends longer on a SMALL target at the same distance — the whole point of the change', () => {
		const far = 600;
		expect(p.travelMs(far, 16)).toBeGreaterThan(p.travelMs(far, 240));
	});

	it('the legacy law cannot tell those two apart', () => {
		const legacy = resolvePacing('moderate', 'legacy');
		expect(legacy.travelMs(600, 16)).toBe(legacy.travelMs(600, 240));
	});

	it('stays inside the envelope the linear law used, at both extremes', () => {
		expect(p.travelMs(0, 200)).toBe(TRAVEL_MIN_MS);
		expect(p.travelMs(4000, 8)).toBe(TRAVEL_MAX_MS);
		for (const d of [50, 200, 500, 900, 1400]) {
			for (const w of [12, 44, 120, 400]) {
				const t = p.travelMs(d, w);
				expect(t).toBeGreaterThanOrEqual(TRAVEL_MIN_MS);
				expect(t).toBeLessThanOrEqual(TRAVEL_MAX_MS);
			}
		}
	});

	it('is monotonic in distance for a fixed target', () => {
		let prev = 0;
		for (const d of [0, 100, 300, 700, 1200]) {
			const t = p.travelMs(d, 44);
			expect(t).toBeGreaterThanOrEqual(prev);
			prev = t;
		}
	});

	it('an unmeasurable target is assumed SMALL, which buys time rather than losing it', () => {
		expect(p.travelMs(500, Number.NaN)).toBe(p.travelMs(500, NOMINAL_TARGET_PX));
		expect(p.travelMs(500, Number.NaN)).toBeGreaterThan(p.travelMs(500, 300));
	});

	it('survives the garbage a live rect can hand it', () => {
		expect(Number.isFinite(p.travelMs(Number.NaN, 44))).toBe(true);
		expect(Number.isFinite(p.travelMs(-500, 44))).toBe(true);
		expect(Number.isFinite(p.travelMs(1e9, 0))).toBe(true);
	});
});

describe('pacing — the register beat', () => {
	it('is spent when the cursor has to travel, and NOT when it is already there', () => {
		const p = resolvePacing('moderate', 'grounded');
		expect(p.registerMs(false)).toBe(REGISTER_MS);
		expect(p.registerMs(true)).toBe(0);
	});

	it('the legacy literal paid it either way — the pause that read as hesitation', () => {
		const legacy = resolvePacing('moderate', 'legacy');
		expect(legacy.registerMs(true)).toBe(legacy.registerMs(false));
		expect(legacy.registerMs(true)).toBe(480);
	});
});

describe('pacing — typing above the fusion threshold', () => {
	it('slows the reveal to where characters resolve as separate events', () => {
		// Two visual events closer than ~40 ms fuse. 22 ms/char was below that, so the reveal
		// read as a paste rather than as typing.
		expect(resolvePacing('moderate', 'legacy').typeMsPerChar()).toBeLessThan(40);
		expect(resolvePacing('moderate', 'grounded').typeMsPerChar()).toBeGreaterThan(40);
	});

	it('is still far faster than a person — a demo that types at human speed is unwatchable', () => {
		// A fast human typist is ~120–150 ms/char (80–100 wpm).
		expect(resolvePacing('moderate', 'grounded').typeMsPerChar()).toBeLessThan(120);
	});
});

describe('pacing — legacy is the DEFAULT, and byte-identical to what shipped', () => {
	it('an unspecified model is legacy, so adding the model re-times nothing on its own', () => {
		expect(resolvePacing().model).toBe('legacy');
		expect(resolvePacing('moderate').settleMs()).toBe(900);
		expect(resolvePacing('moderate').typeMsPerChar()).toBe(22);
	});
});

describe('pacing — the legacy literals', () => {
	const legacy = resolvePacing('moderate', 'legacy');

	it('reproduces the exported readMs exactly, so an A/B compares two real things', () => {
		for (const line of ['Done.', 'Give the deck a title.', 'Every slide in this deck is plain Markdown, and the engine decides the layout for you.']) {
			expect(legacy.captionMs(line)).toBe(readMs(line));
		}
	});

	it('reproduces the literal settle and travel clamp', () => {
		expect(legacy.settleMs()).toBe(900);
		expect(legacy.travelMs(500, 44)).toBe(500);
		expect(legacy.travelMs(100, 44)).toBe(300);
		expect(legacy.travelMs(9999, 44)).toBe(820);
	});
});

describe('dwellMs — the budget for a caption that is about to be ERASED', () => {
	// `captionMs` is a pacing decision and follows the model; `dwellMs` is how long a person needs
	// to read the words and follows nothing. The split exists because `caption:'cursor'` against
	// the DEFAULT `pacing:'legacy'` — one option, which is what a host sets after reading the
	// caption-style table — budgeted the self-dismissing caption at legacy's 300 wpm, the rate
	// pacing.ts documents as wrong by a factor. Nothing tested that pairing.
	const LINE = 'This panel is the app you are about to tour.'; // 9 words

	it('is the grounded number under BOTH models, unlike captionMs', () => {
		const legacy = resolvePacing('moderate', 'legacy');
		const grounded = resolvePacing('moderate', 'grounded');
		expect(legacy.dwellMs(LINE)).toBe(grounded.dwellMs(LINE));
		expect(legacy.captionMs(LINE)).not.toBe(legacy.dwellMs(LINE));
	});

	it('and the gap it closes is the measured one — legacy erases the line 43% early', () => {
		const legacy = resolvePacing('moderate', 'legacy');
		const shortfall = 1 - legacy.captionMs(LINE) / legacy.dwellMs(LINE);
		expect(shortfall).toBeGreaterThan(0.4);
	});

	it('tracks the speed preset, because the reading RATE is what the preset selects', () => {
		expect(resolvePacing('slow', 'legacy').dwellMs(LINE)).toBeGreaterThan(resolvePacing('fast', 'legacy').dwellMs(LINE));
	});

	it('keeps the same floor and ceiling as captionMs — a caption still never flashes or stares', () => {
		for (const model of ['legacy', 'grounded'] as const) {
			const p = resolvePacing('moderate', model);
			expect(p.dwellMs('Hi.')).toBeGreaterThanOrEqual(CAPTION_MIN_MS);
			expect(p.dwellMs('word '.repeat(400))).toBeLessThanOrEqual(CAPTION_MAX_MS);
		}
	});
});
