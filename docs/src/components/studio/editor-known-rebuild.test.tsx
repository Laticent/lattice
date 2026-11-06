import { act, render } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { loadStudioPanels } from '@/test/panels';
import { Editor } from './Editor';

// THE EDITOR SURVIVES THE COMPONENT LIST ARRIVING (ci-flake-audit §3 (engineering/decisions/2026-11-04)). The Studio hands the
// editor its known component names a moment after it paints. Rebuilding the CodeMirror view then
// replaced the editor's DOM under a word the author had just typed, and WebKit's own undo (Safari's
// Edit → Undo, the iPad keyboard bar, shake) lost its step: ios-safari-undo saw the editor element
// change between the typed word and the undo command, and no `historyUndo` arrived. The linter is
// reconfigured in place instead, so the element, the view and the text all stay.

// The first slide, held by the test: the editor's first lint pass waits on it, and the real module's 6 s backstop
// (counted from module load) would release it while the panels load. It is a thenable that records when a lint pass
// starts waiting on it, so the test waits for that signal instead of a duration (HARD RULE #32).
const slide = vi.hoisted(() => {
	let show = () => {};
	const shown = new Promise<void>((r) => {
		show = r;
	});
	const state = { waited: false, show: () => show() };
	const thenable = {
		// biome-ignore lint/suspicious/noThenProperty: a thenable on purpose, so the test sees the moment the editor awaits the first slide
		then<T>(onOk?: (v: void) => T, onErr?: (e: unknown) => T) {
			state.waited = true;
			return shown.then(onOk, onErr);
		},
	};
	return Object.assign(state, { shown: thenable });
});
vi.mock('./first-slide', async (importOriginal) => ({ ...(await importOriginal<typeof import('./first-slide')>()), firstSlideShown: slide.shown, markFirstSlideShown: slide.show }));

// The lint core's loader, recording when the core has arrived: the stale pass resumes only after it does.
const door = vi.hoisted(() => ({ loaded: false }));
vi.mock('@/playground/authoring-door.js', async (importOriginal) => {
	const real = await importOriginal<typeof import('@/playground/authoring-door.js')>();
	return {
		...real,
		loadAuthoring: (...args: Parameters<typeof real.loadAuthoring>) =>
			real.loadAuthoring(...args).then((m: unknown) => {
				door.loaded = true;
				return m;
			}),
	};
});

/** Let every promise callback already queued run, so a pass that can resume has resumed. Ordering, not a duration. */
const drainMicrotasks = async () => {
	for (let i = 0; i < 50; i++) await Promise.resolve();
};

const DECK = '# One\n\n---\n\n<!-- _class: kpi -->\n\n# Two\n';
const viewOf = (el: Element | null) => (el as unknown as { cmTile: { root: { view: { state: { doc: { toString(): string } } } } } }).cmTile.root.view;

describe('Editor and its known component names', () => {
	beforeAll(loadStudioPanels);

	it('keeps the same editor element and view when the known names arrive', () => {
		const { container, rerender } = render(<Editor value={DECK} onChange={() => {}} knownComponents={[]} />);
		const el = container.querySelector('.cm-content');
		const view = viewOf(el);
		rerender(<Editor value={DECK} onChange={() => {}} knownComponents={['kpi', 'title']} />);
		const after = container.querySelector('.cm-content');
		expect(after, 'the editor DOM must not be replaced').toBe(el);
		expect(viewOf(after)).toBe(view);
		expect(view.state.doc.toString()).toBe(DECK);
	});

	// AND A LINT PASS FROM BEFORE THE CHANGE DOES NOT LAND AFTER IT. With the view kept, a pass started while
	// validation was on (waiting for the first slide and the lint core) used to resume after validation was
	// turned off and put back its finding: an underline and a lit "Fix all" that did nothing (checker review,
	// PR #3040). The rebuild used to drop it; the linter's generation does now.
	it('drops a lint pass that was waiting when validation was turned off', async () => {
		const lintVocab = { names: ['kpi', 'title'], modifiers: [], mapRegions: {}, finishNames: [], splitNames: [], capacity: {} };
		const counts: Array<{ total: number; fixable: number } | null> = [];
		const onLintCounts = (c: { total: number; fixable: number } | null) => counts.push(c);
		const deck = '<!-- _class: kpix -->\n\n# One\n';
		const { container, rerender } = render(<Editor value={deck} onChange={() => {}} knownComponents={['kpi', 'title']} lintVocab={lintVocab} onLintCounts={onLintCounts} />);
		// Let the first pass start: it now waits on the first slide, which records the wait.
		await act(() => vi.waitFor(() => expect(slide.waited, 'the first lint pass started').toBe(true), { timeout: 10_000 }));
		rerender(<Editor value={deck} onChange={() => {}} knownComponents={[]} lintVocab={lintVocab} onLintCounts={onLintCounts} />);
		await act(() => vi.waitFor(() => expect(counts.at(-1), 'validation off reports a clean editor').toEqual({ total: 0, fixable: 0 }), { timeout: 10_000 }));
		// The first slide shows; the old pass resumes and loads the lint core. Wait for the core, then let the pass finish.
		slide.show();
		await act(async () => {
			await vi.waitFor(() => expect(door.loaded, 'the lint core loaded').toBe(true), { timeout: 10_000 });
			await drainMicrotasks();
		});
		expect(counts.filter((c) => c && c.total > 0), 'no finding from the pass started before validation went off').toEqual([]);
		expect(container.querySelectorAll('.cm-lintRange').length).toBe(0);
	}, 15_000);
});
