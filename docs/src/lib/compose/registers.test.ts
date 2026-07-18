import { EditorState, TextSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { describe, expect, it } from 'vitest';
import { deckSchema, deckToDoc, docToDeck } from './deck-doc';
import { activeRegister, applyRegister, type Reg } from './registers';

// Stress test for the grammar-register apply/detect kernel. Born from a real device bug: a
// Key-insight (❦) applied while the caret sat in a LIST wrapped the inner block in a fresh
// blockquote every tap AND the detector only read the top-level list, so it never toggled off
// → unbounded `- > > > >` nesting. The invariant these tests lock in: applying ANY register is
// either a valid toggle (apply → detect → remove) or a strict NO-OP, and can NEVER nest or grow
// the source without bound, whatever content the caret is in.

function view(src: string) {
	let state = EditorState.create({ doc: deckToDoc(src), schema: deckSchema });
	const v = {
		get state() {
			return state;
		},
		dispatch(tr: ReturnType<typeof state.tr.setSelection> extends never ? never : import('prosemirror-state').Transaction) {
			state = state.apply(tr);
		},
		focus() {},
		coordsAtPos() {
			return { top: 0, bottom: 0, left: 0, right: 0 };
		},
	} as unknown as EditorView;
	return {
		v,
		src: () => docToDeck(v.state.doc),
		// Put the caret one char into the first block whose text contains `needle`.
		caret(needle: string) {
			let at = -1;
			v.state.doc.descendants((node, pos) => {
				if (at >= 0) return false;
				if (node.isText && node.text?.includes(needle)) {
					at = pos + 1;
					return false;
				}
				return true;
			});
			if (at < 0) throw new Error(`caret target not found: ${needle}`);
			v.dispatch(v.state.tr.setSelection(TextSelection.create(v.state.doc, at)));
		},
		apply(reg: Reg) {
			applyRegister(v, reg, activeRegister(v.state));
		},
	};
}

// The exact reported bug: Key-insight tapped repeatedly with the caret in a list item.
describe('no unbounded nesting (the `- > > > >` bug)', () => {
	it('insight on a list item is a strict no-op — never wraps a blockquote', () => {
		const t = view('<!-- _class: content -->\n\n# Idea\n\n- boxes to drag');
		t.caret('boxes to drag');
		for (let i = 0; i < 6; i++) t.apply('insight');
		const out = t.src();
		expect(out).not.toMatch(/^>/m); // no blockquote line (a line STARTING with >; the `-->` in the directive doesn't count)
		expect(out).toContain('- boxes to drag'); // list intact
	});

	it('insight on a trailing paragraph is an idempotent toggle, never nests', () => {
		const t = view('<!-- _class: content -->\n\n# Idea\n\nA closing thought.');
		t.caret('A closing thought.');
		t.apply('insight'); // → blockquote
		expect(t.src()).toMatch(/^> A closing thought\.$/m);
		t.apply('insight'); // → back to paragraph
		expect(t.src()).not.toMatch(/^>/m);
		// hammer it: parity holds and nesting never appears
		for (let i = 0; i < 7; i++) t.apply('insight');
		expect(t.src()).not.toMatch(/^> >/m); // never a second blockquote level
	});

	it('insight on a non-last paragraph relocates to the slide end and still toggles', () => {
		const t = view('<!-- _class: content -->\n\n# Idea\n\nMiddle thought.\n\nTail.');
		t.caret('Middle thought.');
		t.apply('insight'); // wraps + moves to end
		expect((t.src().match(/^>/gm) || []).length).toBe(1); // exactly one blockquote line
		t.apply('insight'); // caret is now on the moved blockquote → unwrap
		expect(t.src()).not.toMatch(/^>/m);
	});
});

describe('registers are no-ops on content they cannot render from', () => {
	it('h1/h2 on a list item does not bury a heading in the list', () => {
		const t = view('<!-- _class: content -->\n\n- one\n- two');
		t.caret('one');
		t.apply('h1');
		t.apply('h2');
		const out = t.src();
		expect(out).not.toMatch(/^#{1,2}\s/m); // no heading created
		expect(out).toContain('- one'); // list intact
	});

	it('note on a list item is a no-op', () => {
		const t = view('<!-- _class: content -->\n\n- alpha\n- omega');
		t.caret('omega');
		t.apply('note');
		expect(t.src()).not.toMatch(/—/);
		expect(t.src()).toContain('- omega');
	});
});

describe('registers on a plain paragraph toggle cleanly', () => {
	it('h1 applies then toggles back to a paragraph', () => {
		const t = view('<!-- _class: content -->\n\nHello world.');
		t.caret('Hello world.');
		t.apply('h1');
		expect(t.src()).toMatch(/^# Hello world\.$/m);
		t.apply('h1'); // reg === current → back to paragraph
		expect(t.src()).not.toMatch(/^#\s/m);
		expect(t.src()).toContain('Hello world.');
	});

	it('note adds a trailing em-dash once and strips it back off', () => {
		const t = view('<!-- _class: content -->\n\n# Idea\n\nfootnote here');
		t.caret('footnote here');
		t.apply('note'); // → "— footnote here"
		expect(t.src()).toMatch(/—\s*footnote here/);
		t.apply('note'); // strip
		expect(t.src()).not.toMatch(/—/);
	});
});

describe('a cross-slide selection registers nothing', () => {
	it('a selection spanning two slides is a no-op', () => {
		const t = view('<!-- _class: content -->\n\nOne.\n\n---\n\n<!-- _class: content -->\n\nTwo.');
		// select from inside slide 1 to inside slide 2
		let from = -1;
		let to = -1;
		t.v.state.doc.descendants((node, pos) => {
			if (node.isText && node.text?.includes('One.')) from = pos + 1;
			if (node.isText && node.text?.includes('Two.')) to = pos + 2;
			return true;
		});
		t.v.dispatch(t.v.state.tr.setSelection(TextSelection.create(t.v.state.doc, from, to)));
		const before = t.src();
		applyRegister(t.v, 'insight', activeRegister(t.v.state));
		expect(t.src()).toBe(before); // unchanged
	});
});
