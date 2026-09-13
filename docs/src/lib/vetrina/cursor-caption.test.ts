import { afterEach, describe, expect, it } from 'vitest';
import { findCueWord, type NarratedWord } from './narrate';
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
		stage.busy(true);
		expect(hidden(layer)).toBe(true);
		stage.busy(false);
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
		stage.busy(true);
		expect(hidden(layer)).toBe(true);
		// Exit is not inside the bubble, and nothing hid it.
		expect(bubbleOf(layer).contains(exit)).toBe(false);
		expect(exit.style.opacity === '0' || exit.hidden).toBe(false);
		expect(dock.style.opacity).toBe(dockOpacityBefore);
	});

	it('hides by OPACITY, never display/visibility — a live region out of the layout tree is out of the a11y tree', () => {
		const { layer, stage } = mount({ motion: 'still' });
		stage.say('This is the caption.');
		stage.busy(true);
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
		stage.busy(true);
		stage.busy(true);
		stage.busy(false);
		expect(hidden(layer)).toBe(true); // still one performance deep
		stage.busy(false);
		expect(hidden(layer)).toBe(false);
	});

	it('an unbalanced release cannot drive the count negative and desync the caption', () => {
		const { layer, stage } = mount({ motion: 'still' });
		stage.say('Done.');
		stage.busy(false);
		stage.busy(false);
		stage.busy(true);
		expect(hidden(layer)).toBe(true);
	});

	it('a VOICED narrator keeps the caption up during the action', () => {
		const { layer, stage } = mount({ motion: 'still' });
		stage.setVoiced(true);
		stage.say('Now click Publish to send it to the board.');
		stage.busy(true);
		// The ear is carrying the words, so the eye is free — and blanking a subtitle mid-sentence
		// takes them from the viewer who is reading it BECAUSE they cannot hear it.
		expect(hidden(layer)).toBe(false);
		stage.setVoiced(false);
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
		stage.busy(true);
		expect(layer.querySelector('.vetrina-bubble')).toBeNull();
		expect(layer.querySelector('.vetrina-narration')?.textContent).toBe('Give the deck a title.');
	});

	it('busy() after destroy() does not throw — teardown races the beat that was in flight', () => {
		const { stage } = mount({ motion: 'still' });
		stage.say('Mid-beat.');
		stage.destroy();
		expect(() => stage.busy(true)).not.toThrow();
		expect(() => stage.setVoiced(true)).not.toThrow();
	});
});

describe('findCueWord — naming a moment in a line', () => {
	const plan: NarratedWord[] = [
		{ index: 0, text: 'Now', startMs: 0, endMs: 200 },
		{ index: 1, text: 'click', startMs: 200, endMs: 500 },
		{ index: 2, text: 'Publish', startMs: 500, endMs: 1000 },
		{ index: 3, text: 'again.', startMs: 1000, endMs: 1400 },
	];

	it('finds the word regardless of case', () => {
		expect(findCueWord(plan, 'publish')?.startMs).toBe(500);
		expect(findCueWord(plan, 'PUBLISH')?.startMs).toBe(500);
	});

	it('ignores the punctuation the segmenter left attached, on both sides', () => {
		expect(findCueWord(plan, 'again')?.index).toBe(3);
		expect(findCueWord(plan, '"Publish"')?.index).toBe(2);
	});

	it('returns null for a word the line does not contain, rather than guessing', () => {
		expect(findCueWord(plan, 'save')).toBeNull();
		expect(findCueWord(plan, '')).toBeNull();
		expect(findCueWord(null, 'Publish')).toBeNull();
	});

	it('takes the FIRST occurrence — a cue names a moment, and the moment is the first one', () => {
		const twice: NarratedWord[] = [...plan, { index: 4, text: 'Publish', startMs: 1400, endMs: 1900 }];
		expect(findCueWord(twice, 'Publish')?.startMs).toBe(500);
	});
});
