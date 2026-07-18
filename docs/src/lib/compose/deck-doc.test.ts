import { EditorState } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { deckSchema, deckToDoc, docToDeck, emitDeck, initBaseline } from './deck-doc';

// The whole-deck round-trip through the ONE document: source → doc → source.
// Directives, front-matter, slide order, and structured nesting must all survive.

const norm = (s: string) => s.replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').trim();
const rt = (src: string) => docToDeck(deckToDoc(src));

describe('deck round-trip (one document)', () => {
	it('preserves directives, front-matter, slide order, and a KPI slide', () => {
		const source = [
			'---',
			'theme: indaco',
			'---',
			'',
			'<!-- _class: title -->',
			'',
			'# Q4 board review',
			'',
			'`Financial · Q4 2026`',
			'',
			'---',
			'',
			'<!-- _class: kpi -->',
			'',
			'## Revenue ahead of plan.',
			'',
			'1. $2.4B',
			'   - Total revenue',
			'   - target $2.2B `On plan`',
			'2. 42%',
			'   - Gross margin',
			'',
			'---',
			'',
			'<!-- _class: content -->',
			'',
			'## Closing',
			'',
			'- One',
			'- Two',
		].join('\n');
		const out = rt(source);
		expect(out).toContain('theme: indaco'); // front-matter kept
		expect(out).toContain('<!-- _class: title -->');
		expect(out).toContain('<!-- _class: kpi -->');
		expect(out).toContain('<!-- _class: content -->');
		expect(/1\.\s+\$2\.4B\n\s+-\s+Total revenue/.test(out)).toBe(true); // KPI nesting kept
		expect((out.match(/<!-- _class:/g) || []).length).toBe(3); // three slides, order preserved
		expect(norm(out)).toBe(norm(source));
	});

	it('a directive-only / empty slide does not crash and keeps its directive', () => {
		const source = '<!-- _class: divider -->\n\n# Section\n\n---\n\n<!-- _class: content -->';
		const out = rt(source);
		expect(out).toContain('<!-- _class: divider -->');
		expect(out).toContain('<!-- _class: content -->');
	});

	it('a single-slide deck round-trips', () => {
		const source = '<!-- _class: statement -->\n\n## One thing to remember.';
		expect(norm(rt(source))).toBe(norm(source));
	});

	it('a thematic break in prose does not split the slide (stays one slide, keeps its class)', () => {
		const source = '<!-- _class: content -->\n\n## A\n\nfoo\n\n***\n\nbar';
		const out = rt(source);
		// Still exactly one slide with its directive — no phantom second slide.
		expect((out.match(/<!-- _class:/g) || []).length).toBe(1);
		expect(out).toContain('<!-- _class: content -->');
		expect(out).toContain('***');
		expect((out.match(/\n---\n/g) || []).length).toBe(0);
	});
});

describe('edit-local emit — untouched slides re-emit their bytes verbatim', () => {
	// A markdown table is a construct the Compose parser (CommonMark) does NOT model, so a
	// full re-serialize would flatten it. Edit-local emit must leave a slide the author
	// never touched byte-for-byte, so such a slide can never degrade from a keystroke made
	// elsewhere. This is the master mitigation for parser-parity gaps.
	const TABLE = '<!-- _class: content -->\n\n## Data\n\n| A | B |\n| --- | --- |\n| 1 | 2 |';
	const source = ['<!-- _class: title -->\n\n# Deck', TABLE, '<!-- _class: content -->\n\n## End'].join('\n\n---\n\n');

	it('a full re-serialize (docToDeck) WOULD corrupt the table — proving the risk is real', () => {
		// The CommonMark parser flattens the table's rows onto a single soft-broken line,
		// so the multi-line pipe grid is gone.
		expect(docToDeck(deckToDoc(source))).not.toContain('| A | B |\n| --- | --- |');
	});

	it('editing slide 0 leaves the untouched table slide byte-exact', () => {
		const doc = deckToDoc(source);
		const baseline = initBaseline(doc);
		// Simulate a keystroke in the FIRST slide: insert text inside its heading.
		let state = EditorState.create({ doc });
		const posInSlide0 = 3; // inside "# Deck" heading text
		state = state.apply(state.tr.insertText('X', posInSlide0));
		const out = emitDeck(state.doc, baseline);
		// The edited slide reflects the change...
		const firstSlide = out.split('\n\n---\n\n')[0];
		expect(firstSlide).toContain('X');
		expect(firstSlide).toContain('# D');
		// ...and the untouched table slide is preserved verbatim (grid intact, not flattened).
		expect(out).toContain('| A | B |\n| --- | --- |\n| 1 | 2 |');
	});

	it('with no edit, the first emit reproduces the deck bytes exactly (raw seed)', () => {
		const doc = deckToDoc(source);
		const baseline = initBaseline(doc);
		expect(emitDeck(doc, baseline)).toBe(source);
	});

	it('an untouched slide stays byte-exact even when the SLIDE COUNT changes (identity-keyed emit)', () => {
		// The adversarial trio's CRITICAL: the old positional emit flattened every untouched
		// slide the instant the count moved (a slide merge/delete). Identity-keyed emit must
		// keep a reused slide node byte-exact regardless of position or count.
		const doc = deckToDoc(source); // [title, TABLE, content]
		const baseline = initBaseline(doc);
		// Simulate a merge/delete that drops slide 0 but REUSES slides 1 and 2 by reference —
		// exactly what a joinBackward leaves for the surviving nodes.
		const kept = [doc.child(1), doc.child(2)];
		const merged = deckSchema.nodes.doc.create({ frontMatter: doc.attrs.frontMatter }, kept);
		const out = emitDeck(merged, baseline);
		expect(out).toContain('| A | B |\n| --- | --- |\n| 1 | 2 |'); // table grid survived the count change
		expect((out.match(/<!-- _class:/g) || []).length).toBe(2);
	});

	it('marks a slide with a lossy construct (table) as locked, and a prose slide as unlocked', () => {
		const doc = deckToDoc(source); // [title, TABLE, content]
		expect(doc.child(0).attrs.locked).toBe(false); // "# Deck" — plain prose
		expect(doc.child(1).attrs.locked).toBe(true); // the table slide
		expect(doc.child(2).attrs.locked).toBe(false); // "## End" — plain prose
	});
});
