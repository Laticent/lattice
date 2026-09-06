import { describe, expect, it } from 'vitest';
import { compile } from './compile';
import { framesOf, MERGE_FLOOR_MS } from './frames';
import type { Scene, SvgElement } from './types';

// The scene shapes below are built to `chart-anima.ts`'s real emit, not invented:
//   staggered mark i → { verb:'reveal', at: i*slot, span: slot + 0.08 }   (:301-302)
//   synchronized     → { verb:'reveal', at: 0, span: buildSpan }          (:301-302, synchronized)
//   labels           → ONE window at min(0.95, buildSpan*0.85)            (:322)
//   emphasis         → { verb:'highlight', at: buildSpan, span: 1-buildSpan }, funnel-only (:315)
// A regression in any of those shows up here as a changed beat count, which is the point.

const BUILD_SPAN = 0.6;
const el = (id: string, at: number, span: number, extra: Scene['elements'][number] extends never ? never : object = {}): SvgElement =>
	({ id, pathRef: id, motion: [{ verb: 'reveal', at, span }], ...extra }) as SvgElement;

const svgScene = (elements: SvgElement[], duration = 3600): Scene => ({ source: 'svg', duration, hero: 1, asset: 'a.svg', elements }) as Scene;

/** A staggered funnel: N marks over `buildSpan`, then one label window. */
function staggered(marks: number, duration = 3600): Scene {
	const slot = BUILD_SPAN / marks;
	const els = Array.from({ length: marks }, (_, i) => el(`bar-${i}`, i * slot, slot + 0.08));
	const labelAt = Math.min(0.95, BUILD_SPAN * 0.85);
	els.push(el('label-0', labelAt, 1 - labelAt));
	return svgScene(els, duration);
}

describe('a staggered build — one beat per mark, plus the labels', () => {
	it('counts beats from the real windows rather than from the mark count', () => {
		const scene = staggered(5);
		const { beats, synchronized } = framesOf(scene, compile(scene));
		expect(synchronized).toBe(false);
		// 5 mark opens + 1 label open + the closings that are not co-located = the beats a viewer
		// can actually resolve. The assertion is on the SHAPE, not a magic number:
		expect(beats.length).toBeGreaterThan(5);
		expect(beats[0].at).toBe(0);
		expect(beats[beats.length - 1].at).toBe(1);
	});

	it('the last beat is settled and every earlier one is not — that is the still an export prints', () => {
		const scene = staggered(5);
		const { beats } = framesOf(scene, compile(scene));
		expect(beats[beats.length - 1].settled).toBe(true);
		expect(beats.slice(0, -1).every((b) => !b.settled)).toBe(true);
	});

	it('reports what is still ARRIVING, because adjacent windows always overlap by 0.08', () => {
		const scene = staggered(5);
		const { beats } = framesOf(scene, compile(scene));
		// The overlap is unconditional in chart-anima.ts:302, so at least one mid-build beat must
		// carry a partial. A strip that showed only crisp stills would be lying about the engine.
		expect(beats.some((b) => b.partial.length > 0)).toBe(true);
		for (const b of beats) {
			for (const p of b.partial) {
				expect(p.reveal).toBeGreaterThan(0);
				expect(p.reveal).toBeLessThan(1);
			}
		}
	});

	it('holds sum to the duration, so a UI can show hold times that add up', () => {
		const scene = staggered(4);
		const { beats, durationMs } = framesOf(scene, compile(scene));
		const total = beats.reduce((s, b) => s + b.holdMs, 0);
		expect(total).toBeCloseTo(durationMs, 6);
	});
});

describe('a SYNCHRONIZED build is one fade, not a sequence', () => {
	// chart-anima.ts:286 — `together` for any chart, and EVERY sector chart (pie/donut) under
	// every style. Describing these as "5 frames" is the specific lie this flag prevents.
	const sync = (marks: number) => svgScene(Array.from({ length: marks }, (_, i) => el(`sector-${i}`, 0, BUILD_SPAN)));

	it('flags synchronized when every mark shares one window', () => {
		const scene = sync(5);
		expect(framesOf(scene, compile(scene)).synchronized).toBe(true);
	});

	it('yields far fewer beats than marks — the count a viewer sees, not the count of marks', () => {
		const scene = sync(5);
		const { beats } = framesOf(scene, compile(scene));
		expect(beats.length).toBeLessThan(5);
	});

	it('does NOT flag synchronized for a staggered build', () => {
		const scene = staggered(5);
		expect(framesOf(scene, compile(scene)).synchronized).toBe(false);
	});
});

describe('labels are one window however many there are', () => {
	it('fifty labels add the same beats as one', () => {
		const labelAt = Math.min(0.95, BUILD_SPAN * 0.85);
		const one = svgScene([el('bar-0', 0, BUILD_SPAN), el('label-0', labelAt, 1 - labelAt)]);
		const many = svgScene([el('bar-0', 0, BUILD_SPAN), ...Array.from({ length: 50 }, (_, i) => el(`label-${i}`, labelAt, 1 - labelAt))]);
		expect(framesOf(many, compile(many)).beats.length).toBe(framesOf(one, compile(one)).beats.length);
	});
});

describe('there is no settle BEAT — settling is a condition of the last one', () => {
	it('beats are window OPENINGS plus the end of the timeline, and nothing else', () => {
		const scene = svgScene([el('bar-0', 0, 0.5)]);
		const { beats } = framesOf(scene, compile(scene));
		// The window CLOSES at 0.5 and that is deliberately not a beat: keying on closings put
		// seven do-nothing frames into an 11-beat strip for a real funnel, because every closing
		// lands mid-way through the next mark's arrival (the 0.08 overlap).
		expect(beats.map((b) => b.at)).toEqual([0, 1]);
		expect(beats[beats.length - 1].settled).toBe(true);
	});

	it('the final beat carries no entrance — it is the still, not an event', () => {
		const scene = staggered(4);
		const { beats } = framesOf(scene, compile(scene));
		const last = beats[beats.length - 1];
		expect(last.at).toBe(1);
		expect(last.enters).toEqual([]);
		expect(last.settled).toBe(true);
	});
});

describe('every revealing element enters exactly once across the strip', () => {
	it('accounts for all five marks and the labels, with none double-counted', () => {
		const scene = staggered(5);
		const { beats } = framesOf(scene, compile(scene));
		const entered = beats.flatMap((b) => b.enters);
		expect(new Set(entered).size).toBe(entered.length); // no id enters twice
		expect(new Set(entered)).toEqual(new Set([...Array.from({ length: 5 }, (_, i) => `bar-${i}`), 'label-0']));
	});
});

describe('emphasis is discovered, never assumed', () => {
	it('is false with no highlight (a pie, a radar — anything worstMarks returns [] for)', () => {
		const scene = staggered(3);
		expect(framesOf(scene, compile(scene)).emphasizes).toBe(false);
	});

	it('is true when the engine chose a mark to emphasize (the funnel case)', () => {
		const scene = svgScene([
			{ id: 'bar-0', pathRef: 'bar-0', motion: [{ verb: 'reveal', at: 0, span: BUILD_SPAN }, { verb: 'highlight', at: BUILD_SPAN, span: 1 - BUILD_SPAN }] } as SvgElement,
		]);
		expect(framesOf(scene, compile(scene)).emphasizes).toBe(true);
	});
});

describe('beats a viewer cannot resolve are folded, and the fold is reported', () => {
	it('merges two beats closer than the legibility floor', () => {
		// 20 ms apart in a 1000 ms timeline — far under MERGE_FLOOR_MS.
		const scene = svgScene([el('a', 0, 0.4), el('b', 0.02, 0.4)], 1000);
		const { beats } = framesOf(scene, compile(scene));
		expect(beats.some((b) => b.merged > 0)).toBe(true);
		// And no two kept beats are closer than the floor.
		for (let i = 1; i < beats.length; i++) expect(beats[i].atMs - beats[i - 1].atMs).toBeGreaterThanOrEqual(MERGE_FLOOR_MS);
	});

	it('keeps them separate when the same scene is played slowly enough to read', () => {
		const scene = svgScene([el('a', 0, 0.4), el('b', 0.02, 0.4)], 20000); // 0.02 → 400 ms
		const { beats } = framesOf(scene, compile(scene));
		expect(beats.every((b) => b.merged === 0)).toBe(true);
	});
});

describe('degenerate scenes do not throw', () => {
	it('a single element with no motion yields a settled set', () => {
		const scene = svgScene([{ id: 'only', pathRef: 'only' } as SvgElement]);
		const { beats, synchronized } = framesOf(scene, compile(scene));
		expect(beats.length).toBeGreaterThan(0);
		expect(beats[beats.length - 1].settled).toBe(true);
		expect(synchronized).toBe(false); // one element is not a synchronized BUILD
	});
});
