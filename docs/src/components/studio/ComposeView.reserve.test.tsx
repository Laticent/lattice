import { render } from '@testing-library/react';
import { TextSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The live ProseMirror view the component builds (the same capture ComposeView.sync.test.tsx uses).
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

import { ComposeView } from './ComposeView';

// THE TOOLBAR RESERVES ITS WIDTH THE MOMENT IT IS LAID OUT, not at the next editor update.
//
// `reserveFormatWidth` measures a hidden copy of the slide's style chips. Before the slide bar is laid out that measures
// zero, and the reserve used to wait for whatever editor update came next; on a first visit the title slide's toolbar
// could show at its unreserved width and then grow with no caret move (the iOS Compose probe, 2026-11-15). jsdom lays
// nothing out, so every measure here is zero, which makes the zero pass certain; the test then gives the pill a size
// and runs ONLY the resize observers watching the pill, with no editor update at all. Before the fix nothing watched
// it, so the reserve stayed unset.

const DECK = ['<!-- _class: title -->\n\n# One\n\n`EYEBROW`\n\nbody one', '<!-- _class: content -->\n\n# Two\n\nbody two'].join('\n\n---\n\n');

type Watch = { cb: ResizeObserverCallback; targets: Set<Element>; self: ResizeObserver };
let watches: Watch[] = [];
const RealRO = globalThis.ResizeObserver;

beforeEach(() => {
	liveView = null;
	watches = [];
	globalThis.ResizeObserver = class {
		private w: Watch;
		constructor(cb: ResizeObserverCallback) {
			this.w = { cb, targets: new Set(), self: this as unknown as ResizeObserver };
			watches.push(this.w);
		}
		observe(t: Element) {
			this.w.targets.add(t);
		}
		unobserve(t: Element) {
			this.w.targets.delete(t);
		}
		disconnect() {
			this.w.targets.clear();
		}
	} as unknown as typeof ResizeObserver;
});

afterEach(() => {
	globalThis.ResizeObserver = RealRO;
	vi.restoreAllMocks();
});

describe('ComposeView — the toolbar reserve after a zero pass', () => {
	it('sets the reserve when the pill is laid out, with no editor update in between', () => {
		render(<ComposeView source={DECK} onChange={() => {}} />);
		const view = liveView;
		if (!view) throw new Error('no live ProseMirror view');
		// The caret into slide 1's heading: the slide syncs its toolbar, and in jsdom the measure is zero.
		const slide = view.dom.querySelectorAll('.cs-slide')[0] as HTMLElement;
		const pos = view.posAtDOM(slide.querySelector('h1') as Node, 0);
		view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(pos))));
		const pill = slide.querySelector(':scope > .cs-slide-bar > .cs-sb-pill') as HTMLElement;
		const format = pill.querySelector('.cs-sb-format') as HTMLElement;
		expect(format.querySelectorAll('.cs-fmt-btn').length, 'the slide offers styles to reserve').toBeGreaterThan(0);
		expect(format.style.getPropertyValue('--cs-fmt-min'), 'the zero pass leaves the reserve unset').toBe('');

		// Layout arrives: everything now measures 120px wide. No transaction, no focus, no selection change.
		vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(() => ({ x: 0, y: 0, top: 0, left: 0, right: 120, bottom: 20, width: 120, height: 20, toJSON: () => ({}) }) as DOMRect);
		for (const w of watches.filter((x) => x.targets.has(pill))) w.cb([], w.self);

		expect(format.style.getPropertyValue('--cs-fmt-min'), 'the reserve once the pill has a size').toBe('120px');
	});
});
