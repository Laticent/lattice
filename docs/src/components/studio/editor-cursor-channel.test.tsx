import { render } from '@testing-library/react';
import { StrictMode } from 'react';
import { describe, expect, it } from 'vitest';
import { Editor } from './Editor';

// THE DECK EDITOR RUNS A REAL CODEMIRROR IN THIS TIER — measured, not assumed:
// `textarea: false, .cm-content: true`. `Editor.tsx` does carry a `<textarea>` fallback for
// surfaces where the view cannot construct, and this file asserts we are NOT on it, because
// the whole point of these cases is the real `EditorView`. (`docs/vitest.setup.ts` is what
// makes it work: it stubs the rect APIs CodeMirror measures with, which bare jsdom throws on.)
//
// WHY THIS FILE EXISTS AT ALL. The markdown-pane sweep (#2064) shipped a defect whose whole
// shape is "an event that should fire does not", and it went out under the belief that this
// tier could only ever exercise a textarea. It can't be caught end to end cheaply — it needs a
// caret click in a specific slide after a specific restored `activeSlide` — and it is two lines
// here. See `engineering/decisions/2026-09-05-markdown-pane-fuzz-findings.md` §7.
const DECK = '# One\n\nalpha\n\n---\n\n# Two\n\nbeta\n\n---\n\n# Three\n\ngamma\n';

// biome-ignore lint/suspicious/noExplicitAny: reaching CodeMirror through its DOM handle.
const viewOf = (el: Element | null) => (el as any)?.cmTile?.root?.view;

describe('the editor announces the author’s first caret move', () => {
	it('mounts a real CodeMirror, not the textarea fallback', () => {
		const { container } = render(<Editor value={DECK} onChange={() => {}} />);
		expect(container.querySelector('textarea'), 'the fallback would make every case below vacuous').toBeNull();
		expect(container.querySelector('.cm-content')).not.toBeNull();
	});

	// `lastSlideRef` starts at -1 so the FIRST move always emits, whatever slide it lands on.
	// The shell restores `activeSlide` from storage on boot while the editor's caret starts at
	// offset 0, so those two disagree at mount — and a click into slide 1 is exactly the move
	// that has to reach the shell to reconcile them.
	it('emits for a caret move into the slide the document already opens on', () => {
		const seen: number[] = [];
		const { container } = render(<Editor value={DECK} onChange={() => {}} onCursorSlide={(i) => seen.push(i)} />);
		const view = viewOf(container.querySelector('.cm-content'));
		expect(view, 'no view means this case proves nothing').toBeTruthy();
		// A caret move inside slide 1 — the same transaction a click produces.
		view.dispatch({ selection: { anchor: DECK.indexOf('alpha') } });
		expect(seen, 'the first caret move was swallowed, so the rail keeps the slide it booted on').toEqual([0]);
	});

	// STRICTMODE MOUNTS, UNMOUNTS AND MOUNTS AGAIN, and `StudioIsland` really does wrap the
	// Studio in it — so the second mount must still count as a FIRST mount. Guarding on a plain
	// "have I built a view before?" boolean gets this wrong: the repeat looks like a rebuild, the
	// refs are re-stated, and the case above regresses in dev only. The guard therefore compares
	// what the last view was BUILT FOR; StrictMode's repeat matches on both halves.
	it('still emits under StrictMode, whose second mount is not a rebuild', () => {
		const seen: number[] = [];
		const { container } = render(
			<StrictMode>
				<Editor value={DECK} onChange={() => {}} onCursorSlide={(i) => seen.push(i)} />
			</StrictMode>,
		);
		const view = viewOf(container.querySelector('.cm-content'));
		expect(view, 'no view means this case proves nothing').toBeTruthy();
		view.dispatch({ selection: { anchor: DECK.indexOf('alpha') } });
		expect(seen, 'StrictMode’s repeat mount was mistaken for a rebuild').toEqual([0]);
	});
});
