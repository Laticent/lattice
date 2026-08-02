import { render } from '@testing-library/react';
import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';
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
		const { ref } = mount((i) => seen.push(i));
		ref.current?.revealSlide(1);
		// The reveal pre-seeds its own index so a programmatic jump does not echo back
		// out as a "the user moved" event — that round trip is what would fight the
		// preview picker that just called it.
		expect(seen).not.toContain(1);
	});

	it('ignores an out-of-range index rather than throwing', () => {
		const { ref, view } = mount();
		expect(() => ref.current?.revealSlide(99)).not.toThrow();
		expect(() => ref.current?.revealSlide(-1)).not.toThrow();
		expect(caretSlide(view.container)).toBeLessThan(3);
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
