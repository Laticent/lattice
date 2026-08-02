import { render } from '@testing-library/react';
import { TextSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Capture the LIVE ProseMirror view the component builds. There is no other handle
// on it from out here — PM hangs only a `pmViewDesc` off the DOM, and that desc does
// not carry a back-reference to its view. The real view is what matters: the
// caret→preview publish lives in `dispatchTransaction`, so a stub would test nothing.
let liveView: EditorView | null = null;
vi.mock('prosemirror-view', async (importOriginal) => {
	const actual = await importOriginal<typeof import('prosemirror-view')>();
	class CapturingView extends actual.EditorView {
		constructor(...args: ConstructorParameters<typeof actual.EditorView>) {
			super(...args);
			liveView = this as unknown as EditorView;
		}
	}
	return { ...actual, EditorView: CapturingView };
});

import { type ComposeHandle, ComposeView } from './ComposeView';

// #1288 — Compose had no sync with the preview in EITHER direction: moving the caret
// never moved the previewed slide, and picking a slide in the preview never moved
// Compose. These lock both halves in on the real ProseMirror view.

const DECK = ['<!-- _class: title -->\n\n# One\n\nbody one', '<!-- _class: content -->\n\n# Two\n\nbody two', '<!-- _class: quote -->\n\n> Three'].join('\n\n---\n\n');

function mount(onCursorSlide?: (i: number) => void) {
	const ref = React.createRef<ComposeHandle>();
	const view = render(<ComposeView ref={ref} source={DECK} onChange={() => {}} onCursorSlide={onCursorSlide} />);
	return { ref, view };
}

function theView(): EditorView {
	if (!liveView) throw new Error('no live ProseMirror view — the editor fell back to its inert handle');
	return liveView;
}

/** Put the caret inside slide `index` the way a click would: a plain selection transaction. */
function moveCaretInto(view: EditorView, index: number): void {
	const node = view.dom.querySelectorAll('.cs-slide')[index];
	if (!node) throw new Error(`no slide ${index}`);
	const pos = view.posAtDOM(node, 0);
	view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(pos))));
}

beforeEach(() => {
	liveView = null;
});

/** The index of the slide the caret currently sits in, read off the live editor. */
function caretSlide(container: HTMLElement): number {
	const active = container.querySelector('.cs-slide-active');
	if (!active) return -1;
	return [...container.querySelectorAll('.cs-slide')].indexOf(active);
}

describe('ComposeView — preview sync', () => {
	it('exposes revealSlide, which moves the caret into the requested slide', () => {
		const { ref, view } = mount();
		// jsdom can construct the ProseMirror view; if it ever can't, the component
		// falls back and the handle is inert — assert we got the real thing.
		expect(ref.current).not.toBeNull();
		ref.current?.revealSlide(2);
		expect(caretSlide(view.container)).toBe(2);
		ref.current?.revealSlide(0);
		expect(caretSlide(view.container)).toBe(0);
	});

	it('publishes the caret slide so the preview can follow the slide being written', () => {
		const seen: number[] = [];
		mount((i) => seen.push(i));
		// A USER caret move — a selection transaction the component did not initiate —
		// is the whole point of this direction, so drive the live ProseMirror view
		// rather than the handle. Going through `revealSlide` would only ever exercise
		// the suppression path below and could never observe a publish.
		const pmView = theView();
		moveCaretInto(pmView, 2);
		expect(seen).toEqual([2]);
		// Crossing again publishes again; staying put inside the same slide does not —
		// this is edge-triggered on slide crossings, not per keystroke.
		moveCaretInto(pmView, 0);
		expect(seen).toEqual([2, 0]);
		const before = seen.length;
		pmView.dispatch(pmView.state.tr.setSelection(TextSelection.near(pmView.state.doc.resolve(pmView.state.selection.from + 1))));
		expect(seen.length).toBe(before);
	});

	it('does not echo a programmatic reveal back out as a user move', () => {
		const seen: number[] = [];
		const { ref } = mount((i) => seen.push(i));
		ref.current?.revealSlide(1);
		// `revealSlide` pre-seeds its own index, so a jump the preview picker just
		// requested does not come back as "the user moved" — that round trip is what
		// would fight the picker that called it.
		expect(seen).not.toContain(1);
	});

	it('ignores an out-of-range index rather than throwing', () => {
		const { ref, view } = mount();
		expect(() => ref.current?.revealSlide(99)).not.toThrow();
		expect(() => ref.current?.revealSlide(-1)).not.toThrow();
		expect(caretSlide(view.container)).toBeLessThan(3);
	});

	// The regression this guards: `focus` once gated BOTH taking keyboard focus and
	// placing the caret. Suppressing it on touch (so a tablet's software keyboard stays
	// down) therefore also stopped the caret moving to the slide, so picking a slide in
	// the preview left the editor where it was. Setting a selection costs nothing on
	// touch — only `.focus()` raises the keyboard — so the two must stay independent.
	it('moves the caret to the slide WITHOUT focus, not only with it', () => {
		const { ref, view } = mount();
		ref.current?.revealSlide(2); // no opts at all — the touch path
		expect(caretSlide(view.container)).toBe(2);
		ref.current?.revealSlide(1, { focus: false }); // explicitly unfocused
		expect(caretSlide(view.container)).toBe(1);
	});

	it('focuses the editor only when asked', () => {
		const { ref, view } = mount();
		const pm = view.container.querySelector('.ProseMirror') as HTMLElement | null;
		expect(pm).not.toBeNull();
		const focus = vi.spyOn(pm as HTMLElement, 'focus');
		ref.current?.revealSlide(1);
		expect(focus).not.toHaveBeenCalled();
		ref.current?.revealSlide(2, { focus: true });
		expect(focus).toHaveBeenCalled();
	});
});
