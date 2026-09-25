import { afterEach, describe, expect, it } from 'vitest';
import type { CaptionTrack } from '@/lib/ltt';
import { normalizeMatch } from '@/lib/ltt';
import { findCueWord, normalizeCueWord } from './narrate';
import { run } from './runner';
import { createStage, placeBubble, type RectLike, type Stage } from './stage';
import { resolveTheme } from './theme';

// The `caption: 'cursor'` style — the speech balloon. Two families of assertion, and the
// second is the one that matters: the geometry is nice, but the INVARIANTS are what stop a
// caption that can hide from taking the only escape hatch with it.

const box = (left: number, top: number, width: number, height: number): RectLike => ({ left, top, width, height });
const VIEW = box(0, 0, 1200, 800);

describe('placeBubble — where the balloon goes', () => {
	it('sits below-right of the cursor when there is room', () => {
		const at = placeBubble(400, 300, 240, 60, null, VIEW, 20);
		expect(at).toEqual({ left: 420, top: 320 });
	});

	it('flips to the other side rather than covering the thing being pointed at', () => {
		// The target occupies the space below-right; the bubble must not sit on it.
		const target = box(410, 310, 300, 200);
		const at = placeBubble(400, 300, 240, 60, target, VIEW, 20);
		const overlapsTarget = at.left < target.left + target.width && at.left + 240 > target.left && at.top < target.top + target.height && at.top + 60 > target.top;
		expect(overlapsTarget).toBe(false);
	});

	it('stays inside the bounds even from a cursor in the far corner', () => {
		for (const [x, y] of [
			[10, 10],
			[1190, 10],
			[10, 790],
			[1190, 790],
		]) {
			const at = placeBubble(x, y, 300, 80, null, VIEW, 20);
			expect(at.left).toBeGreaterThanOrEqual(VIEW.left);
			expect(at.top).toBeGreaterThanOrEqual(VIEW.top);
			expect(at.left + 300).toBeLessThanOrEqual(VIEW.left + VIEW.width);
			expect(at.top + 80).toBeLessThanOrEqual(VIEW.top + VIEW.height);
		}
	});

	it('leaving the bounds outranks covering the target — a caption half off the app is not a caption', () => {
		// Cursor hard against the right edge of a narrow host, with the target below-left: the only
		// in-bounds placements overlap it, and in-bounds still has to win.
		const host = box(200, 100, 320, 240);
		const target = box(210, 110, 300, 220);
		const at = placeBubble(505, 130, 260, 70, target, host, 20);
		expect(at.left).toBeGreaterThanOrEqual(host.left);
		expect(at.left + 260).toBeLessThanOrEqual(host.left + host.width);
	});

	it('clamps rather than giving up when the bubble is larger than the box', () => {
		const tiny = box(0, 0, 100, 50);
		const at = placeBubble(50, 25, 300, 120, null, tiny, 20);
		expect(Number.isFinite(at.left)).toBe(true);
		expect(Number.isFinite(at.top)).toBe(true);
		expect(at.left).toBe(tiny.left);
		expect(at.top).toBe(tiny.top);
	});
});

let active: Stage | null = null;
function mount(theme: Parameters<typeof resolveTheme>[0] = {}) {
	const root = document.createElement('div');
	document.body.appendChild(root);
	active = createStage({ root, onExit: () => {}, theme: resolveTheme({ caption: 'cursor', ...theme }) });
	const layer = document.querySelector('.vetrina-stage') as HTMLElement;
	return { root, stage: active, layer };
}
afterEach(() => {
	active?.destroy();
	active = null;
	document.body.innerHTML = '';
});

const bubbleOf = (layer: HTMLElement) => layer.querySelector('.vetrina-bubble') as HTMLElement;
const hidden = (layer: HTMLElement) => bubbleOf(layer).style.opacity === '0';

describe('caption: cursor — the contract every dock style keeps', () => {
	it('one .vetrina-caption, Exit inside it, one narration live region', () => {
		const { layer } = mount();
		const dock = layer.querySelector('.vetrina-caption');
		expect(layer.querySelectorAll('.vetrina-caption')).toHaveLength(1);
		expect(dock?.querySelectorAll('button[aria-label="Exit the demo"]')).toHaveLength(1);
		expect(dock?.querySelectorAll('.vetrina-narration[role="status"][aria-live="polite"]')).toHaveLength(1);
	});

	it('the narration is NOT inside an aria-hidden subtree', () => {
		const { layer } = mount();
		expect((layer.querySelector('.vetrina-narration') as HTMLElement).closest('[aria-hidden="true"]')).toBeNull();
	});

	it('Exit fires onExit', () => {
		let exited = false;
		const root = document.createElement('div');
		document.body.appendChild(root);
		active = createStage({ root, onExit: () => (exited = true), theme: resolveTheme({ caption: 'cursor' }) });
		(document.querySelector('.vetrina-caption button[aria-label="Exit the demo"]') as HTMLButtonElement).click();
		expect(exited).toBe(true);
	});
});

describe('caption: cursor — it steps aside, and Exit does not go with it', () => {
	it('the bubble hides while the cursor performs and comes back when it stops', async () => {
		const { layer, stage } = mount({ motion: 'still' }); // 'still' makes say() synchronous
		stage.say('Give the deck a title.');
		expect(hidden(layer)).toBe(false);
		stage.busy?.(true);
		expect(hidden(layer)).toBe(true);
		stage.busy?.(false);
		expect(hidden(layer)).toBe(false);
	});

	it('EXIT STAYS PUT while the bubble is hidden — the invariant this style exists under', () => {
		const { layer, stage } = mount({ motion: 'still' });
		stage.say('Now click Publish.');
		const dock = layer.querySelector('.vetrina-caption') as HTMLElement;
		const exit = layer.querySelector('button[aria-label="Exit the demo"]') as HTMLElement;
		// The dock's own opacity is the mount cross-fade, driven by a rAF this test does not run.
		// What matters is that stepping the BUBBLE aside does not touch it.
		const dockOpacityBefore = dock.style.opacity;
		stage.busy?.(true);
		expect(hidden(layer)).toBe(true);
		// Exit is not inside the bubble, and nothing hid it.
		expect(bubbleOf(layer).contains(exit)).toBe(false);
		expect(exit.style.opacity === '0' || exit.hidden).toBe(false);
		expect(dock.style.opacity).toBe(dockOpacityBefore);
	});

	it('hides by OPACITY, never display/visibility — a live region out of the layout tree is out of the a11y tree', () => {
		const { layer, stage } = mount({ motion: 'still' });
		stage.say('This is the caption.');
		stage.busy?.(true);
		const bubble = bubbleOf(layer);
		expect(bubble.style.display).not.toBe('none');
		expect(bubble.style.visibility).not.toBe('hidden');
		expect(bubble.hidden).toBe(false);
		// And the words are still there to be announced.
		expect(layer.querySelector('.vetrina-narration')?.textContent).toBe('This is the caption.');
	});

	it('nesting is reference-counted — an inner verb finishing must not reveal the caption early', () => {
		const { layer, stage } = mount({ motion: 'still' });
		stage.say('Reorder the backlog.');
		stage.busy?.(true);
		stage.busy?.(true);
		stage.busy?.(false);
		expect(hidden(layer)).toBe(true); // still one performance deep
		stage.busy?.(false);
		expect(hidden(layer)).toBe(false);
	});

	it('an unbalanced release cannot drive the count negative and desync the caption', () => {
		const { layer, stage } = mount({ motion: 'still' });
		stage.say('Done.');
		stage.busy?.(false);
		stage.busy?.(false);
		stage.busy?.(true);
		expect(hidden(layer)).toBe(true);
	});

	it('a VOICED narrator keeps the caption up during the action', () => {
		const { layer, stage } = mount({ motion: 'still' });
		stage.setVoiced?.(true);
		stage.say('Now click Publish to send it to the board.');
		stage.busy?.(true);
		// The ear is carrying the words, so the eye is free — and blanking a subtitle mid-sentence
		// takes them from the viewer who is reading it BECAUSE they cannot hear it.
		expect(hidden(layer)).toBe(false);
		stage.setVoiced?.(false);
		expect(hidden(layer)).toBe(true);
	});

	it('an empty say() hides the bubble: there is nothing to show, and the hint belongs in a dock', () => {
		const { layer, stage } = mount({ motion: 'still' });
		stage.say('Something.');
		expect(hidden(layer)).toBe(false);
		stage.say('');
		expect(hidden(layer)).toBe(true);
	});

	it('busy() is inert in every other style, so a host can call it unconditionally', () => {
		const { layer, stage } = mount({ caption: 'bar', motion: 'still' });
		stage.say('Give the deck a title.');
		stage.busy?.(true);
		expect(layer.querySelector('.vetrina-bubble')).toBeNull();
		expect(layer.querySelector('.vetrina-narration')?.textContent).toBe('Give the deck a title.');
	});

	it('busy() after destroy() does not throw — teardown races the beat that was in flight', () => {
		const { stage } = mount({ motion: 'still' });
		stage.say('Mid-beat.');
		stage.destroy();
		expect(() => stage.busy?.(true)).not.toThrow();
		expect(() => stage.setVoiced?.(true)).not.toThrow();
	});
});

describe('caption: cursor — the bubble is anchored to where the cursor RESTS', () => {
	// jsdom has no layout, so `place` returns early on a zero-size bubble and the coordinates
	// cannot be asserted here — the e2e does that on a real surface. What IS assertable, and is
	// the actual defect, is WHEN the placement is recomputed: the balloon used to be positioned
	// once, when the line was set, which is before the beat's travel. It then reappeared after
	// the performance next to where the cursor had been at the end of the PREVIOUS beat —
	// measured at up to 561px from the pointer it was speaking for.
	function mountSpy() {
		const { layer, stage } = mount({ motion: 'still' });
		const bubble = bubbleOf(layer);
		let places = 0;
		// `place` sizes the bubble to the bounds BEFORE it measures, and bails on a zero-area
		// measurement — which is every measurement in jsdom. So the observable that survives here
		// is that write, not the left/top it would have produced.
		const proto = Object.getOwnPropertyDescriptor(CSSStyleDeclaration.prototype, 'maxWidth');
		Object.defineProperty(bubble.style, 'maxWidth', {
			configurable: true,
			get: () => '320px',
			set: () => {
				places++;
			},
		});
		return { layer, stage, places: () => places, restore: () => proto && Object.defineProperty(bubble.style, 'maxWidth', proto) };
	}

	it('re-places when it comes BACK, not only when the line changes', () => {
		const { stage, places, restore } = mountSpy();
		stage.say('Give the deck a title.');
		const afterSay = places();
		stage.busy?.(true); // the cursor travels and types — the bubble is hidden
		expect(places()).toBe(afterSay); // nothing to place while hidden
		stage.busy?.(false); // …and comes to rest somewhere else
		expect(places()).toBeGreaterThan(afterSay);
		restore();
	});

	it('re-places on a text change too — a new line is a new size', () => {
		const { stage, places, restore } = mountSpy();
		stage.say('One.');
		const first = places();
		stage.say('A considerably longer second line.');
		expect(places()).toBeGreaterThan(first);
		restore();
	});

	it('stepping aside never places — placement is for the moment it is SHOWN', () => {
		const { stage, places, restore } = mountSpy();
		stage.say('Give the deck a title.');
		const before = places();
		stage.busy?.(true);
		stage.busy?.(true);
		expect(places()).toBe(before);
		restore();
	});

	it('a new line during a performance re-zeros the count — the drag-stranding guard', () => {
		// `drag` brackets across two calls and a raw Walkthrough can branch away from both, which
		// would leave the count above zero and the caption hidden for the rest of the run. A beat
		// that has started saying something new is proof the last performance finished.
		const { layer, stage } = mount({ motion: 'still' });
		stage.busy?.(true);
		stage.busy?.(true);
		stage.say('A new beat begins.');
		expect(hidden(layer)).toBe(false);
	});
});

describe('bounds — the default is not touched by the machinery that serves `host`', () => {
	it("bounds:'viewport' leaves the bar's geometry to CSS, as it was before `bounds` existed", () => {
		const { layer } = mount({ caption: 'bar' });
		const dock = layer.querySelector('.vetrina-caption') as HTMLElement;
		// The mount lays out under `host` only. Under the default these stay the declared values —
		// re-seating them from JS is what silently narrowed every existing tour's caption bar from
		// 704px to 680px at 1440, on a change whose commit message said nothing shipped moved.
		expect(dock.style.left).toBe('50%');
		expect(dock.style.width).toBe('calc(100% - 24px)');
		expect(dock.style.maxWidth).toBe('680px');
	});

	it("bounds:'host' is what opts into the JS seating", async () => {
		const { layer } = mount({ caption: 'bar', bounds: 'host' });
		const dock = layer.querySelector('.vetrina-caption') as HTMLElement;
		// The seating runs in the mount frame, so give it one.
		await new Promise<void>((r) => requestAnimationFrame(() => r()));
		// jsdom reports a zero-area root, so `boundsRect` falls back to the window — the assertion
		// is that the JS path RAN (px, not the declared calc), not what number it produced.
		expect(dock.style.width.endsWith('px')).toBe(true);
	});
});

describe('the pacing default reaches the RUN, not just resolveTheme', () => {
	// The claim "pacing defaults to legacy, so nothing shipped is re-timed" was made in four
	// documents and was FALSE: `resolveTheme` defaulted to 'legacy' and handed that to the stage,
	// while the runner read `opts.theme?.pacing ?? 'grounded'` off the RAW theme. Every run mixed
	// the two — grounded dwell, settle and typing against legacy travel — and every existing tour
	// was silently re-timed. Asserting on `resolveTheme` alone could never have caught it; this
	// drives a real run and reads what the beat actually gets.
	async function pacingOfRun(theme?: Parameters<typeof run>[0]['theme']) {
		const root = document.createElement('div');
		document.body.appendChild(root);
		const got: { model?: string; typeMs?: number } = {};
		await new Promise<void>((resolve) => {
			run({
				root,
				actions: {},
				intro: false,
				theme,
				play: async (ctx) => {
					got.model = ctx.pacing.model;
					got.typeMs = ctx.pacing.typeMsPerChar();
				},
				onStop: () => resolve(),
			});
		});
		return got;
	}

	it('no pacing in the theme means legacy in the beat, not just in resolveTheme', async () => {
		expect(await pacingOfRun()).toEqual({ model: 'legacy', typeMs: 22 });
	});

	it('no THEME AT ALL means legacy too', async () => {
		expect(await pacingOfRun(undefined)).toEqual({ model: 'legacy', typeMs: 22 });
	});

	it('and opting in actually opts in', async () => {
		expect(await pacingOfRun({ pacing: 'grounded' })).toEqual({ model: 'grounded', typeMs: 55 });
	});
});

describe('findCueWord — naming a moment in a line', () => {
	// The plan is the LTT core: a CaptionTrack. Two sentences, so a cue in the second one proves
	// the answer carries its cue index as well as its word index.
	const w = (display: string, startMs: number, endMs: number) => ({ display, spoken: display, startMs, endMs, charOffset: 0 });
	const plan: CaptionTrack = {
		durationMs: 2400,
		cues: [
			{ display: 'Now click Publish again.', startMs: 0, endMs: 1400, charOffset: 0, words: [w('Now', 0, 200), w('click', 200, 500), w('Publish', 500, 1000), w('again.', 1000, 1400)] },
			{ display: 'Then Save.', startMs: 1600, endMs: 2400, charOffset: 25, words: [w('Then', 1600, 1900), w('Save.', 1900, 2400)] },
		],
	};

	it('finds the word regardless of case', () => {
		expect(findCueWord(plan, 'publish')?.startMs).toBe(500);
		expect(findCueWord(plan, 'PUBLISH')?.startMs).toBe(500);
	});

	it('ignores the punctuation the segmenter left attached, on both sides', () => {
		expect(findCueWord(plan, 'again')?.word).toBe(3);
		expect(findCueWord(plan, '"Publish"')?.word).toBe(2);
	});

	it('answers with the {cue, word, match} an LTT action records', () => {
		expect(findCueWord(plan, 'Save')).toEqual({ cue: 1, word: 1, match: 'save', text: 'Save.', startMs: 1900, endMs: 2400 });
	});

	it('returns null for a word the line does not contain, rather than guessing', () => {
		expect(findCueWord(plan, 'delete')).toBeNull();
		expect(findCueWord(plan, '')).toBeNull();
		expect(findCueWord(null, 'Publish')).toBeNull();
	});

	it('takes the FIRST occurrence — a cue names a moment, and the moment is the first one', () => {
		const twice: CaptionTrack = { ...plan, cues: [...plan.cues, { display: 'Publish.', startMs: 2600, endMs: 3000, charOffset: 36, words: [w('Publish.', 2600, 3000)] }] };
		expect(findCueWord(twice, 'Publish')?.startMs).toBe(500);
	});
});

describe('normalizeCueWord — the same word, in linear time', () => {
	it('trims a 40k-character punctuation run in milliseconds, not seconds', () => {
		// The shape the old trailing regex was quadratic on: a long run INSIDE the word, which does
		// not reach the end, so the engine retried it from every position. Measured on Node 22: the
		// old regex took 2,006 ms for this 40k-character run; the scan takes about 2 ms.
		const long = `x${'-'.repeat(40000)}X`;
		const t0 = performance.now();
		expect(normalizeCueWord(`"${long}."`)).toBe(long.toLowerCase());
		const one = { display: long, spoken: long, startMs: 0, endMs: 1, charOffset: 0 };
		expect(findCueWord({ durationMs: 1, cues: [{ display: long, startMs: 0, endMs: 1, charOffset: 0, words: [one] }] }, long)?.word).toBe(0);
		expect(performance.now() - t0).toBeLessThan(200);
	});

	it("agrees with @laticent/ltt's normalizeMatch, which an action's `match` is written with", () => {
		for (const w of ['Publish', '"Publish"', 'again.', '¿Qué?', '$4.2M', '—', '', '  x  ', 'Ünïcödé!', '(3)', '🙂ok🙂', 'e\u0301']) {
			expect(normalizeCueWord(w), w).toBe(normalizeMatch(w));
		}
	});
});

describe("bounds:'host' confines the chrome to the VISIBLE part of the host", () => {
	// A host taller than the window is the ordinary case the option exists for — a panel in a
	// scrolling page — and seating Exit in the RAW host's corner put it 638px above the top of the
	// window, or 536px below the bottom for the bar. Off screen, and Exit is pointer-only (the
	// first Tab is a keydown the take-over guard reads as the viewer taking the wheel), so the
	// documented escape from the demo was simply gone. The branch's own e2e could not see it: it
	// asserts containment against a proto host SMALLER than the viewport.
	function tallHost(theme: Parameters<typeof resolveTheme>[0] = {}) {
		const root = document.createElement('div');
		document.body.appendChild(root);
		// 2200px tall, starting 700px above the top of the window — the shape a mid-page panel has
		// once the viewer has scrolled into it.
		root.getBoundingClientRect = () => ({ left: 40, top: -700, width: 900, height: 2200, right: 940, bottom: 1500, x: 40, y: -700, toJSON: () => ({}) }) as DOMRect;
		active = createStage({ root, onExit: () => {}, theme: resolveTheme({ bounds: 'host', ...theme }) });
		const layer = document.querySelector('.vetrina-stage') as HTMLElement;
		// jsdom measures every element as 0x0, and the seating converts viewport -> layer by
		// subtracting the LAYER's box. Left at zero it reports the caption 690px above the top of
		// the window in a passing tree, which would make these assertions about jsdom rather than
		// about the clamp. The layer is `position:fixed; inset:0`, so the window IS its box.
		layer.getBoundingClientRect = () => ({ left: 0, top: 0, width: window.innerWidth, height: window.innerHeight, right: window.innerWidth, bottom: window.innerHeight, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
		return { root, layer };
	}

	const px = (v: string) => (v.endsWith('px') ? Number.parseFloat(v) : Number.NaN);

	it('seats Exit inside the window, not in the off-screen corner of the host', async () => {
		const { layer } = tallHost({ caption: 'cursor' });
		await new Promise<void>((r) => requestAnimationFrame(() => r()));
		const exit = layer.querySelector('.vetrina-exit') as HTMLElement;
		// The layer is the viewport (jsdom reports 0,0), so these offsets ARE window coordinates.
		// Whichever edge it is anchored from, the distance must be inside the window's own extent.
		const fromTop = px(exit.style.top);
		const fromBottom = px(exit.style.bottom);
		const anchored = Number.isFinite(fromTop) ? fromTop : fromBottom;
		expect(Number.isFinite(anchored)).toBe(true);
		expect(anchored).toBeGreaterThanOrEqual(0);
		expect(anchored).toBeLessThan(window.innerHeight);
	});

	it("and the same for the 'bar' dock, which carries the whole caption with it", async () => {
		const { layer } = tallHost({ caption: 'bar' });
		await new Promise<void>((r) => requestAnimationFrame(() => r()));
		const dock = layer.querySelector('.vetrina-caption') as HTMLElement;
		const fromTop = px(dock.style.top);
		const fromBottom = px(dock.style.bottom);
		const anchored = Number.isFinite(fromTop) ? fromTop : fromBottom;
		expect(anchored).toBeGreaterThanOrEqual(0);
		expect(anchored).toBeLessThan(window.innerHeight);
	});

	it('a host scrolled entirely out of view falls back to the window rather than clamping to a sliver', async () => {
		const root = document.createElement('div');
		document.body.appendChild(root);
		root.getBoundingClientRect = () => ({ left: 0, top: -4000, width: 900, height: 500, right: 900, bottom: -3500, x: 0, y: -4000, toJSON: () => ({}) }) as DOMRect;
		active = createStage({ root, onExit: () => {}, theme: resolveTheme({ caption: 'bar', bounds: 'host' }) });
		const layer = document.querySelector('.vetrina-stage') as HTMLElement;
		layer.getBoundingClientRect = () => ({ left: 0, top: 0, width: window.innerWidth, height: window.innerHeight, right: window.innerWidth, bottom: window.innerHeight, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
		await new Promise<void>((r) => requestAnimationFrame(() => r()));
		const dock = layer.querySelector('.vetrina-caption') as HTMLElement;
		const fromBottom = px(dock.style.bottom);
		expect(fromBottom).toBeGreaterThanOrEqual(0);
		expect(fromBottom).toBeLessThan(window.innerHeight);
	});
});

describe('a VOICED run docks its caption at the edge', () => {
	// The balloon saves a reading trip between the pointer and the words. A voice removes that
	// trip, and what is left is a SUBTITLE — which subtitle practice puts at a fixed screen
	// position, because a reader has to know where to look back to. It is also the only honest
	// fix for the anchor: a voiced caption never hides, and the bubble re-anchors on the
	// hidden -> shown edge, so a voiced one was placed once at the top of the beat and then sat
	// there while the cursor crossed the app — measured at 493px from the pointer it was
	// speaking for, the very defect the cursor style was built to remove.
	async function stageOfRun(voiced: boolean) {
		const root = document.createElement('div');
		document.body.appendChild(root);
		const got: { stepsAside?: boolean; hasBubble?: boolean } = {};
		await new Promise<void>((resolve) => {
			run({
				root,
				actions: {},
				intro: false,
				theme: { caption: 'cursor' },
				narrate: { voiced, speak: () => ({ done: Promise.resolve(), cancel() {} }) },
				play: async (ctx) => {
					got.stepsAside = ctx.stage.captionStepsAside?.() ?? false;
					got.hasBubble = !!document.querySelector('.vetrina-bubble');
				},
				onStop: () => resolve(),
			});
		});
		return got;
	}

	it('a voiced narrator turns the balloon into an edge dock', async () => {
		expect(await stageOfRun(true)).toEqual({ stepsAside: false, hasBubble: false });
	});

	it('and a silent one still gets the balloon', async () => {
		expect(await stageOfRun(false)).toEqual({ stepsAside: true, hasBubble: true });
	});
});

describe('setVoiced is guarded like every other verb', () => {
	it('a destroyed stage ignores it instead of styling a detached bubble', () => {
		// The state has to be "caption WANTED but currently HIDDEN", because that is the only one
		// in which `syncCaption` re-places rather than short-circuiting — with the bubble already
		// shown, an unguarded `setVoiced` is a no-op and the test would pass either way. A
		// performance in flight is what hides it: `point` brackets itself, so not awaiting it
		// leaves the depth above zero.
		const { root, stage, layer } = mount({ motion: 'still' });
		const target = document.createElement('button');
		root.appendChild(target);
		const bubble = bubbleOf(layer);
		// jsdom measures everything as 0x0 and `place()` correctly declines to position a
		// zero-size bubble — so without a size the placement never runs and the guard is
		// untestable rather than unnecessary.
		Object.defineProperty(bubble, 'offsetWidth', { value: 240, configurable: true });
		Object.defineProperty(bubble, 'offsetHeight', { value: 60, configurable: true });
		stage.say('Something worth saying.');
		void stage.point(target);
		expect(bubble.style.opacity).toBe('0');
		stage.destroy();
		active = null;
		// A sentinel no placement would ever produce — and a VALID length, because CSSOM silently
		// drops an unparseable one and the assertion would then pass on the old value either way.
		bubble.style.left = '-99999px';
		expect(() => stage.setVoiced?.(true)).not.toThrow();
		expect(bubble.style.left).toBe('-99999px');
	});
});

describe('avoidance is a preference, and proximity outranks it', () => {
	// A gesture now writes `lastAim` too, so the scorer is fed the thing the stroke just drew
	// instead of the previous beat's target. That is the right input — and MEASURED, it changes no
	// placement in any layout I could build, which is worth writing down rather than dressing up.
	//
	// The reason is structural: a bubble anchored to the cursor cannot escape a rect the cursor is
	// SITTING IN, and after a gesture the cursor is always on the thing it gestured at. Avoidance
	// works by flipping to another quadrant around the cursor, so it only escapes a target the
	// cursor is OUTSIDE of. These pin that boundary, so the next reader does not mistake the
	// avoid list for a guarantee.

	it('escapes a target the cursor is outside of', () => {
		const target = box(410, 310, 300, 200);
		const at = placeBubble(400, 300, 240, 60, target, VIEW, 20);
		const overlaps = at.left < target.left + target.width && at.left + 240 > target.left && at.top < target.top + target.height && at.top + 60 > target.top;
		expect(overlaps).toBe(false);
	});

	it('but sits on one the cursor is INSIDE, rather than abandoning the cursor to escape it', () => {
		// A whole panel, with clear room below it. Moving the caption down there would put it
		// hundreds of px from the pointer, which is the one thing `caption:'cursor'` exists to
		// stop — so overlapping is the correct answer, not a bug.
		const panel = box(0, 200, 1000, 460);
		const at = placeBubble(500, 400, 260, 70, panel, VIEW, 20);
		const overlaps = at.left < panel.left + panel.width && at.left + 260 > panel.left && at.top < panel.top + panel.height && at.top + 70 > panel.top;
		expect(overlaps).toBe(true);
		expect(Math.hypot(at.left - 500, at.top - 400)).toBeLessThan(100);
	});
});

describe('the caption never comes back carrying the PREVIOUS line', () => {
	// `say()` hides the bubble and swaps the words 140ms later, but `captionWanted` is true for the
	// whole of that window. Any `syncCaption` arriving inside it — an `endPerform` from the typing
	// reveal is the common one — revealed the bubble still carrying the last beat's caption, beside
	// the new beat's cursor. Measured on the real page at 96% opacity for 134ms, and intermittent,
	// because it is a race against a timer: a suite that only asks what is on screen AT REST cannot
	// see it, which is why 268 tests did not.
	it('a performance that ends mid-cross-fade does not reveal the stale words', async () => {
		// 'legible' is the tier that makes this reproducible: travel is instant (no tween to sit
		// through) while the 140ms caption cross-fade STAYS, so the performance genuinely begins and
		// ends inside the swap window. Under the default tier the glide outlasts the window and the
		// race closes on its own — which is why it is intermittent on a real page rather than absent.
		const { root, stage, layer } = mount({ motion: 'legible' });
		const target = document.createElement('button');
		root.appendChild(target);
		const bubble = bubbleOf(layer);
		Object.defineProperty(bubble, 'offsetWidth', { value: 240, configurable: true });
		Object.defineProperty(bubble, 'offsetHeight', { value: 60, configurable: true });

		stage.say('The first line.');
		// Let the cross-fade land, so the bubble is genuinely up with line one.
		await new Promise<void>((r) => setTimeout(r, 200));
		expect(hidden(layer)).toBe(false);
		expect(bubble.textContent).toContain('The first line.');

		// A new line, then a performance that begins AND ends inside the 140ms swap window.
		stage.say('The second line.');
		await stage.point(target);

		// The reveal must not have happened yet — and if it did, it must not be showing line one.
		if (!hidden(layer)) expect(bubble.textContent).not.toContain('The first line.');
		expect(hidden(layer)).toBe(true);

		// And it still comes back, with the right words, once the swap lands.
		await new Promise<void>((r) => setTimeout(r, 200));
		expect(hidden(layer)).toBe(false);
		expect(bubble.textContent).toContain('The second line.');
	});
});
