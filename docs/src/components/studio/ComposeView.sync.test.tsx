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

describe('revealTail — following what a tour types into Compose', () => {
	// A tour started in Compose types through the CONTROLLED `source` path (the markdown editor is
	// not mounted in this mode, so `buildTypeOps` never picks the native channel), which replaces
	// the document from React state and moves no caret. Nothing then scrolls to follow it — the
	// same defect the markdown editor's `revealTail` closes, on the other editor.
	//
	// jsdom has no layout: every box is 0x0 and `coordsAtPos` has nothing real to answer. So these
	// arms pin what jsdom CAN hold — that it is a pure scroll of the host, with no transaction —
	// and stub the two geometry reads. That the host is the element that actually scrolls is the
	// claim `revealSlide` already paid for with a browser measurement (see its note), and the
	// real-surface arm is a 390px Compose run in docs/e2e/demo-mobile.spec.ts (HARD RULE #23).

	/** Give the host and the document end real boxes: a 400px pane running to the BOTTOM of the
	 *  window, whose tail sits `below` px past that edge. The pane has to reach the window's
	 *  bottom for the caption arm to mean anything — that is where a stage paints its caption,
	 *  and `tourChromeOverlap` measures the band from there. */
	const WIN = () => window.innerHeight;
	function geometry(view: EditorView, host: HTMLElement, below: number) {
		const bottom = WIN();
		host.getBoundingClientRect = () => ({ left: 0, top: bottom - 400, width: 600, height: 400, right: 600, bottom, x: 0, y: bottom - 400, toJSON: () => ({}) }) as DOMRect;
		view.coordsAtPos = () => ({ top: bottom + below - 20, bottom: bottom + below, left: 0, right: 10 });
	}

	const hostOf = (c: HTMLElement) => c.querySelector('.cs-host') as HTMLElement;

	it('scrolls the host down to the end of the document, and writes nothing', () => {
		const { ref, view } = mount();
		const pm = theView();
		const host = hostOf(view.container as HTMLElement);
		geometry(pm, host, 120);
		const before = { doc: pm.state.doc, sel: pm.state.selection };
		host.scrollTop = 0;

		ref.current?.revealTail();

		// 120px past the bottom, plus the same 8px breathing room `revealSlide` leaves.
		expect(host.scrollTop, 'the host never scrolled — a tour typing into Compose follows nothing').toBe(128);
		// PURE scroll. A transaction here would move the caret, and the caret→slide channel would
		// jump the preview to the last slide on every keystroke of a demo.
		expect(pm.state.doc, 'revealTail wrote to the document').toBe(before.doc);
		expect(pm.state.selection, 'revealTail moved the caret — that is what fires the preview jump').toBe(before.sel);
	});

	it('does nothing when the tail is already on screen', () => {
		const { ref, view } = mount();
		const pm = theView();
		const host = hostOf(view.container as HTMLElement);
		geometry(pm, host, -60); // the tail sits 60px ABOVE the pane's bottom edge
		host.scrollTop = 42;
		ref.current?.revealTail();
		expect(host.scrollTop, 'it scrolled a tail that was already visible').toBe(42);
	});

	it('leaves room for a running tour\'s caption', () => {
		// The same occlusion the markdown editor's reveal clears: the stage paints its caption over
		// the bottom of the pane, so revealing to the pane's edge reveals under it.
		document.documentElement.style.setProperty('--vt-chrome-bottom', '150px');
		try {
			const { ref, view } = mount();
			const pm = theView();
			const host = hostOf(view.container as HTMLElement);
			geometry(pm, host, -60); // already inside the pane — but inside the CAPTION's band
			host.scrollTop = 0;
			ref.current?.revealTail();
			// The tail is 60px inside the pane, but the caption covers the pane's last 150px — so it
			// is 90px inside the covered band, and the reveal owes that plus the 8px breathing room.
			expect(host.scrollTop, 'the tail was revealed under the caption that is talking about it').toBe(98);
		} finally {
			document.documentElement.style.removeProperty('--vt-chrome-bottom');
		}
	});

	it('is a no-op after unmount rather than a throw', () => {
		// The demo's follow is a double-rAF, so it can land after a pane swap or a mode switch.
		const { ref, view } = mount();
		const handle = ref.current;
		view.unmount();
		expect(() => handle?.revealTail()).not.toThrow();
	});
});
