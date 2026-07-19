import { EditorState, TextSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { describe, expect, it } from 'vitest';
import { deckSchema, deckToDoc, docToDeck } from './deck-doc';
import { activeRegister, applicableRegisters, applyRegister, type Reg } from './registers';

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

// Adversarial sweep of the OTHER register vectors (range selection, nested carets, empty /
// deep content, mixed sequences). The bar: never a crash, never unbounded nesting, and the
// output always re-parses to a stable doc (valid markdown, no lost slide).
describe('adversarial register sweep — never corrupts, never nests unbounded', () => {
	// A register operation must leave the source RE-PARSEABLE and STABLE.
	const stable = (t: ReturnType<typeof view>) => {
		const once = t.src();
		expect(() => deckToDoc(once)).not.toThrow();
		expect(docToDeck(deckToDoc(once))).toBe(once); // idempotent round-trip
		expect(once).not.toMatch(/^> >/m); // no nested blockquote anywhere
	};

	it('a range selection across two blocks in one slide stays valid and never nests', () => {
		const t = view('<!-- _class: content -->\n\n# Head\n\nBody line.');
		let from = -1;
		let to = -1;
		t.v.state.doc.descendants((node, pos) => {
			if (node.isText && node.text?.includes('Head')) from = pos + 1;
			if (node.isText && node.text?.includes('Body line.')) to = pos + 3;
			return true;
		});
		t.v.dispatch(t.v.state.tr.setSelection(TextSelection.create(t.v.state.doc, from, to)));
		for (let i = 0; i < 4; i++) applyRegister(t.v, 'insight', activeRegister(t.v.state));
		stable(t);
	});

	it('a caret inside a blockquote paragraph: heading is a no-op, insight unwraps', () => {
		const t = view('<!-- _class: content -->\n\n> quoted thought');
		t.caret('quoted thought');
		t.apply('h1'); // top-level block is a blockquote → no-op
		expect(t.src()).not.toMatch(/^#\s/m);
		t.apply('insight'); // blockquote → unwrap
		expect(t.src()).not.toMatch(/^>/m);
		stable(t);
	});

	it('an empty paragraph survives every register (no crash, no nest)', () => {
		for (const reg of ['h1', 'h2', 'eyebrow', 'subtitle', 'insight', 'note'] as const) {
			const t = view('<!-- _class: content -->\n\n# Head\n\ntmp');
			// empty the trailing paragraph, caret inside it
			t.caret('tmp');
			t.v.dispatch(t.v.state.tr.delete(t.v.state.selection.from - 1, t.v.state.selection.from + 2));
			applyRegister(t.v, reg, activeRegister(t.v.state));
			applyRegister(t.v, reg, activeRegister(t.v.state));
			stable(t);
		}
	});

	it('note on a non-last paragraph preserves the paragraph text when it moves to the end', () => {
		const t = view('<!-- _class: content -->\n\nkeep this text\n\nTail.');
		t.caret('keep this text');
		t.apply('note');
		expect(t.src()).toMatch(/—\s*keep this text/); // text preserved, em-dash prepended
		expect((t.src().match(/keep this text/g) || []).length).toBe(1); // not duplicated
		stable(t);
	});

	it('a deeply nested list item is a no-op for every block register', () => {
		const t = view('<!-- _class: content -->\n\n- outer\n  - inner deep');
		t.caret('inner deep');
		for (const reg of ['h1', 'insight', 'note'] as const) t.apply(reg);
		expect(t.src()).not.toMatch(/^>/m);
		expect(t.src()).not.toMatch(/^#/m);
		expect(t.src()).toContain('inner deep');
		stable(t);
	});

	it('the Format group is context-sensitive to the caret block', () => {
		const t = view('<!-- _class: content -->\n\n# Head\n\nright after heading\n\n- a list item\n\nlone paragraph');
		t.caret('Head'); // heading → only H1/H2
		expect(applicableRegisters(t.v.state).keys).toEqual(['h1', 'h2']);
		t.caret('right after heading'); // paragraph AFTER a heading → subtitle applies
		expect(applicableRegisters(t.v.state).keys).toEqual(['h1', 'h2', 'subtitle', 'insight', 'note']);
		t.caret('lone paragraph'); // paragraph NOT adjacent to any heading → no eyebrow/subtitle
		expect(applicableRegisters(t.v.state).keys).toEqual(['h1', 'h2', 'insight', 'note']);
		t.caret('a list item'); // inside a list → nothing applies
		expect(applicableRegisters(t.v.state).keys).toEqual([]);
	});

	it('the HEADING register follows the slide-class grammar (H1 for a title, H2 for a body class)', () => {
		const headings: Record<string, ('h1' | 'h2')[]> = { title: ['h1'], content: ['h2'], 'cards-grid': ['h2'], journey: ['h1', 'h2'] };
		// A TITLE slide grammars an h1 → the heading register offers ONLY H1 (never H2).
		const title = view('<!-- _class: title -->\n\n# Deck title\n\nsub line');
		title.caret('Deck title');
		expect(applicableRegisters(title.v.state, headings).keys).toEqual(['h1']);
		title.caret('sub line'); // paragraph right after the h1 → H1 + subtitle, still NO H2
		expect(applicableRegisters(title.v.state, headings).keys).toEqual(['h1', 'subtitle', 'insight', 'note']);
		// A CONTENT slide grammars an h2 → the heading register offers ONLY H2 (never H1 — the
		// single-h1 rule the user hit on slide 2).
		const content = view('<!-- _class: content -->\n\n## Section\n\nbody text');
		content.caret('Section');
		expect(applicableRegisters(content.v.state, headings).keys).toEqual(['h2']);
		content.caret('body text'); // right after the h2 → H2 + subtitle (never H1)
		expect(applicableRegisters(content.v.state, headings).keys).toEqual(['h2', 'subtitle', 'insight', 'note']);
		// A multi-level class (heading slot lists `h1, h2`) offers BOTH.
		const jrn = view('<!-- _class: journey -->\n\n## Stage\n\nstep');
		jrn.caret('Stage');
		expect(applicableRegisters(jrn.v.state, headings).keys).toEqual(['h1', 'h2']); // grammar allows both
		// An UNKNOWN class (not in the grammar map) stays permissive — never silently drop the control.
		const unknown = view('<!-- _class: mystery-box -->\n\n# Head\n\ntext');
		unknown.caret('Head');
		expect(applicableRegisters(unknown.v.state, headings).keys).toEqual(['h1', 'h2']);
	});

	// MAJOR (checker): a heading at a grammar-illegal level must stay lit + toggle-off-able from the
	// pill, not render as a lone wrong button. An H1 on a body (h2) slide offers H1 (lit) AND H2.
	it('keeps a grammar-illegal heading level available so it can be un-set from the pill', () => {
		const headings: Record<string, ('h1' | 'h2')[]> = { content: ['h2'] };
		const t = view('<!-- _class: content -->\n\n# Rogue H1'); // an h1 on a body-class slide
		t.caret('Rogue H1');
		const { keys, active } = applicableRegisters(t.v.state, headings);
		expect(active).toBe('h1'); // the block really is an h1
		expect(keys).toContain('h1'); // ...and h1 is offered (lit), so it can be toggled back to paragraph
		expect(keys).toContain('h2'); // ...alongside the grammar-correct h2 to switch to
		t.apply('h1'); // clicking the lit register reverts to paragraph
		expect(t.src()).not.toMatch(/^#/m);
	});

	it('a locked slide offers no registers', () => {
		const t = view('<!-- _class: content -->\n\n# Locked\n\n| a | b |\n| - | - |\n| 1 | 2 |');
		t.caret('Locked');
		expect(applicableRegisters(t.v.state)).toEqual({ keys: [], active: null });
	});

	it('a rapid mixed sequence leaves a valid, un-nested doc', () => {
		const t = view('<!-- _class: content -->\n\n# Head\n\nplain paragraph');
		t.caret('plain paragraph');
		for (const reg of ['h1', 'insight', 'note', 'h2', 'insight', 'h1', 'note'] as const) t.apply(reg);
		stable(t);
	});

	// Finding 4: a locked slide (a construct Compose can't round-trip, e.g. a table) is immutable —
	// the register must be a clean no-op, not a doomed dispatch the structural guard silently eats.
	it('every register is a no-op on a locked slide', () => {
		const src = '<!-- _class: content -->\n\n# Locked head\n\n| a | b |\n| - | - |\n| 1 | 2 |';
		const t = view(src);
		// sanity: the slide really is locked
		expect(t.v.state.doc.child(0).attrs.locked).toBe(true);
		const before = t.src();
		t.caret('Locked head');
		for (const reg of ['h1', 'h2', 'insight', 'note', 'eyebrow'] as const) t.apply(reg);
		expect(t.src()).toBe(before); // untouched
	});

	// Finding 7: a `— …` paragraph that isn't the slide's last block was a dead-end (couldn't
	// strip or move). It now relocates to the slide end so it becomes the recognized note.
	it('note on a non-last em-dash paragraph relocates it to the end (no dead-end)', () => {
		const t = view('<!-- _class: content -->\n\n— aside first\n\nTail.');
		t.caret('aside first');
		t.apply('note'); // moves "— aside first" to the slide end
		const out = t.src();
		expect(out).toMatch(/Tail\.[\s\S]*—\s*aside first/); // aside now AFTER Tail (trailing)
		expect((out.match(/aside first/g) || []).length).toBe(1); // not duplicated
		t.apply('note'); // now trailing → strips the em-dash
		expect(t.src()).not.toMatch(/—\s*aside first/);
		stable(t);
	});
});
