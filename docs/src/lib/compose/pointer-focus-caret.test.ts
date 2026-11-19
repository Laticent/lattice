import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const takes: number[] = [];
vi.mock('./pending-selection', () => ({ takePendingSelection: () => takes.push(1) }));
const { pointerFocusCaret } = await import('./pointer-focus-caret');

const view = { isDestroyed: false } as unknown as Parameters<ReturnType<typeof pointerFocusCaret>['focus']>[0];

describe('a click that focuses Compose keeps its caret', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		takes.length = 0;
	});
	afterEach(() => vi.useRealTimers());

	it('reads the caret on a 0 ms timer when a mousedown caused the focus', () => {
		const h = pointerFocusCaret();
		h.mousedown(view);
		h.focus(view);
		expect(takes).toEqual([]);
		vi.advanceTimersByTime(0);
		expect(takes).toEqual([1]);
	});

	it('leaves a keyboard or programmatic focus to ProseMirror, which restores its own caret', () => {
		const h = pointerFocusCaret();
		h.focus(view);
		vi.advanceTimersByTime(50);
		expect(takes).toEqual([]);
	});

	it('does not let a mousedown that focused nothing mark a later keyboard focus as a click', () => {
		const h = pointerFocusCaret();
		h.mousedown(view);
		vi.advanceTimersByTime(0);
		h.focus(view);
		vi.advanceTimersByTime(50);
		expect(takes).toEqual([]);
	});

	it('never lets prosemirror-view handle the event less: both handlers return false', () => {
		const h = pointerFocusCaret();
		expect(h.mousedown(view)).toBe(false);
		expect(h.focus(view)).toBe(false);
	});
});

// The fix races a prosemirror-view INTERNAL (pointer-focus-caret.ts): its focus handler writes ProseMirror's own selection
// back to the DOM on a 20 ms timer. Ours runs at 0 ms, so it wins only while theirs is a later timer. If an upgrade changes
// that handler, this fails: re-check the race and pointer-focus-caret.ts before relaxing it.
describe('the prosemirror-view focus timer this races', () => {
	it('still writes its selection back on a 20 ms timer started in handlers.focus', () => {
		const require = createRequire(import.meta.url);
		const entry = require.resolve('prosemirror-view');
		const source = readFileSync(path.join(path.dirname(entry), 'index.js'), 'utf8');
		const handler = /handlers\.focus = view => \{[\s\S]*?\n\};/.exec(source)?.[0];
		expect(handler, 'prosemirror-view no longer defines handlers.focus where pointer-focus-caret.ts expects it').toBeDefined();
		const timer = /setTimeout\(\(\) => \{[\s\S]*?selectionToDOM\(view\);?[\s\S]*?\}, (\d+)\)/.exec(handler as string);
		expect(timer, "prosemirror-view's focus handler no longer writes its selection back on a timer: re-check pointer-focus-caret.ts").not.toBeNull();
		expect(Number(timer?.[1]), 'its delay must stay above our 0 ms timer for the click to win').toBeGreaterThan(0);
	});
});
