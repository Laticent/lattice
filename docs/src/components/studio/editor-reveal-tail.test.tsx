import { EditorView } from '@codemirror/view';
import { render } from '@testing-library/react';
import * as React from 'react';
import { describe, expect, it } from 'vitest';
import { Editor, type EditorHandle } from './Editor';

// `revealTail` — how the CONTROLLED typing path follows what it types.
//
// A native insert (`typeTail`) moves the caret and CodeMirror scrolls to follow it for free. A
// phone cannot type natively — a native insert races the React `value` prop and drops characters —
// so it types through `setSource`, which replaces the document from React state, moves no caret,
// and therefore never scrolls: the editor sat at the top of the doc while a long slide typed below
// the fold. `revealTail` is the compensation, and what it must NOT do is the load-bearing half:
// moving the caret to the end would scroll, and would also fire the editor's cursor→slide channel,
// jumping the preview to the last slide on every keystroke of a demo.
//
// This tier runs a REAL CodeMirror (docs/vitest.setup.ts stubs the rect APIs it measures with), so
// the transaction is real. What jsdom cannot show is pixels moving — there is no layout and nothing
// scrolls — so "the view actually follows the text" is owed on a real browser, and that is
// docs/e2e/demo-mobile.spec.ts (HARD RULE #23).
const DECK = '# One\n\nalpha\n\n---\n\n# Two\n\nbeta\n\n---\n\n# Three\n\ngamma\n';

// biome-ignore lint/suspicious/noExplicitAny: reaching CodeMirror through its DOM handle, as editor-cursor-channel.test.tsx does.
const viewOf = (el: Element | null) => (el as any)?.cmTile?.root?.view;

describe('the editor can reveal its tail without touching the document', () => {
	it('scrolls only — no change, no selection, and no cursor→slide jump', () => {
		const ref = React.createRef<EditorHandle>();
		const changes: string[] = [];
		const slides: number[] = [];
		const { container } = render(<Editor ref={ref} value={DECK} onChange={(v) => changes.push(v)} onCursorSlide={(i) => slides.push(i)} />);
		const view = viewOf(container.querySelector('.cm-content'));
		expect(view, 'no view means this case proves nothing').toBeTruthy();

		// biome-ignore lint/suspicious/noExplicitAny: the transaction shape is what is under test.
		const seen: any[] = [];
		const real = view.dispatch.bind(view);
		// biome-ignore lint/suspicious/noExplicitAny: same.
		view.dispatch = (...args: any[]) => {
			seen.push(args[0]);
			return real(...args);
		};

		const before = { doc: view.state.doc.toString(), head: view.state.selection.main.head };
		ref.current?.revealTail();

		expect(seen, 'revealTail dispatched nothing — the view was never asked to scroll').toHaveLength(1);
		const tr = seen[0];
		// The effect is compared by TYPE against a sample, not merely asserted truthy: `effects: []`
		// is truthy, so a mutant that dispatched an empty transaction would have passed that.
		// CodeMirror does not export the scroll effect's type, so the sample is where it comes from.
		const sample = EditorView.scrollIntoView(0) as unknown as { type: unknown };
		const effect = (Array.isArray(tr.effects) ? tr.effects[0] : tr.effects) as unknown as { type: unknown } | undefined;
		expect(effect?.type, 'the transaction carries no scroll effect — nothing asked the view to move').toBe(sample.type);
		// The two things it must not be: a document write, or a caret move.
		expect(tr.changes, 'revealTail wrote to the document').toBeUndefined();
		expect(tr.selection, 'revealTail moved the caret — that is what fires the preview jump below').toBeUndefined();
		expect(view.state.doc.toString()).toBe(before.doc);
		expect(view.state.selection.main.head).toBe(before.head);
		expect(changes, 'a pure scroll must not look like an edit to the shell').toEqual([]);
		expect(slides, 'the preview would jump to the last slide on every keystroke of a demo').toEqual([]);
	});

	it('is a no-op once the view is GONE rather than a throw', () => {
		const ref = React.createRef<EditorHandle>();
		// The handle is stated at mount, so reach it and call it after unmount — the demo's
		// double-rAF follow can land after a pane swap has taken the editor away.
		const { unmount } = render(<Editor ref={ref} value={DECK} onChange={() => {}} />);
		const handle = ref.current;
		unmount();
		expect(() => handle?.revealTail()).not.toThrow();
	});
});
