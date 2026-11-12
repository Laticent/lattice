/**
 * A full write that lands while the previous one is still loading keeps the reader's place.
 *
 * On Firefox (and once per page in Chromium and WebKit) the Playground's frame is re-inserted for a full write, so the
 * Firefox service worker keeps serving it (lib/srcdoc-write.js). Until the new document commits, the frame holds an
 * empty about:blank, so a second full write in that window reads no anchor from it. renderDeck used to hand the host
 * `anchor: null`, and PlaygroundApp opened the deck at slide 1 although the reader was at slide 6. Found by the
 * independent checker on #3159.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderDeck } from './deck-render.js';

const sections = Array.from({ length: 10 }, (_, i) => `<section data-lattice-slide="${i + 1}"><h1>Slide ${i + 1}</h1></section>`);
const PITCH = 400;

/** A frame showing the deck scrolled to `slide`, or an about:blank when `slide` is null. */
function frameAt(slide: number | null, writeId?: number) {
	const doc = document.implementation.createHTMLDocument('preview');
	if (slide !== null) {
		doc.documentElement.setAttribute('data-lattice-write', String(writeId ?? 1));
		doc.body.innerHTML = `<article class="lattice">${sections.join('')}</article>`;
	}
	const win = { scrollY: slide === null ? 0 : slide * PITCH };
	const lattice = doc.querySelector('.lattice');
	vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
		const i = lattice ? Array.prototype.indexOf.call(lattice.children, this) : 0;
		const top = i * PITCH - win.scrollY;
		return { top, bottom: top + 360, height: 360, left: 0, right: 640, width: 640, x: 0, y: top } as DOMRect;
	});
	let srcdoc = '';
	return {
		contentDocument: doc,
		contentWindow: win,
		get srcdoc() {
			return srcdoc;
		},
		set srcdoc(v: string) {
			srcdoc = v;
		},
	} as unknown as HTMLIFrameElement;
}

const base = { css: '', mode: 'light', geom: { w: 1280, h: 720 }, runtimeUrl: '/r.js', sig: 'indaco|light|1280x720' };
const html = (edit: string) => sections.join('').replace('Slide 10', `Slide 10 ${edit}`);

afterEach(() => vi.restoreAllMocks());

describe('renderDeck keeps the reader in place across a write still in flight', () => {
	it('a second full write while the first loads opens where the reader was, not at slide 1', () => {
		const state = { frameSig: '', lastSections: null } as Record<string, unknown>;
		const first = renderDeck({ ...base, frame: frameAt(6), html: html('a'), state });
		expect(first.anchor?.index).toBe(6);
		vi.restoreAllMocks();
		// The re-inserted frame: about:blank until the first write's document commits.
		const second = renderDeck({ ...base, frame: frameAt(null), html: html('b'), state: first.state });
		expect(second.patched).toBe(false);
		expect(second.anchor?.index).toBe(6);
	});

	it('once that write has landed, a reader back at the top opens at the top', () => {
		const state = { frameSig: '', lastSections: null } as Record<string, unknown>;
		const first = renderDeck({ ...base, frame: frameAt(6), html: html('a'), state });
		vi.restoreAllMocks();
		// The write landed (its stamp is on the document) and the reader scrolled to the top.
		const landed = frameAt(0, first.state.writeId as number);
		const second = renderDeck({ ...base, frame: landed, html: html('b'), state: first.state, restyleKey: null });
		expect(second.anchor).toBe(null);
	});

	it('a fresh deck still opens at its start, even mid-write', () => {
		const state = { frameSig: '', lastSections: null } as Record<string, unknown>;
		const first = renderDeck({ ...base, frame: frameAt(6), html: html('a'), state });
		vi.restoreAllMocks();
		const second = renderDeck({ ...base, frame: frameAt(null), html: html('b'), state: first.state, fresh: true });
		expect(second.anchor).toBe(null);
	});
});
