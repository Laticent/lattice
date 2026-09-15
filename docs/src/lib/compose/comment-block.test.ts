import { EditorState, TextSelection } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { isWellFormedComment, readCommentText } from './comment-block';
import { deckSchema, deckToDoc, docToDeck } from './deck-doc';
import { hasLossyConstruct, parseDeck } from './deck-source';
import { activeRegister, slideContext } from './registers';

// An authoring comment is a note TO the author, so Compose models it as an atom node and hides it
// behind a chip rather than setting it as prose. These tests pin the two halves that matter: the
// SOURCE is never touched (byte-exact round-trip, whatever the comment's internal shape), and the
// node can never be a paste vector (the shape gate).

/** The block type names of slide `i`'s top-level children. */
function blocks(src: string, i = 0): string[] {
	const out: string[] = [];
	deckToDoc(src)
		.child(i)
		.forEach((n) => {
			out.push(n.type.name);
		});
	return out;
}

describe('a comment parses as one node, whatever shape it is in', () => {
	const shapes: [string, string][] = [
		['one line', '<!-- a plain note -->'],
		['markdown characters inside', '<!-- note about _class and *emphasis* and [a] -->'],
		['two lines, hanging indent', '<!-- line one\n     line two -->'],
		['a blank line inside', '<!-- para one\n\n     para two -->'],
		['deeply indented continuation', '<!-- head\n\n\t\t\tdeep tail -->'],
		['an empty comment', '<!---->'],
		['dashes inside', '<!-- a -- b - c -->'],
	];

	for (const [name, comment] of shapes) {
		it(`${name} → a single comment node`, () => {
			expect(blocks(`# H\n\nbody\n\n${comment}`)).toEqual(['heading', 'paragraph', 'comment']);
		});
		it(`${name} → round-trips byte-exact`, () => {
			const src = `# H\n\nbody\n\n${comment}`;
			expect(docToDeck(deckToDoc(src)).trim()).toBe(src.trim());
		});
	}

	it('holds its position between blocks, and two in a row stay two', () => {
		expect(blocks('# H\n\nbefore\n\n<!-- mid -->\n\nafter')).toEqual(['heading', 'paragraph', 'comment', 'paragraph']);
		expect(blocks('# H\n\n<!-- one -->\n\n<!-- two -->\n\nbody')).toEqual(['heading', 'comment', 'comment', 'paragraph']);
	});

	it('carries the source bytes verbatim on the node, fence and indent included', () => {
		const comment = '<!-- head\n     tail -->';
		const node = deckToDoc(`# H\n\n${comment}`).child(0).child(1);
		expect(node.type.name).toBe('comment');
		expect(node.attrs.text).toBe(comment);
	});
});

// The bug this node was built for. A comment with a blank line inside used to parse as a paragraph
// PLUS an indented code block, and re-serializing put the closing fence inside a ``` fence — which
// the engine then rendered as an empty `pre` on the slide. Pinned by shape AND by output, because
// either one alone would pass on a half-fix.
describe('regression: the multi-line comment that corrupted decks (examples/kaizen-craftsmanship.md)', () => {
	const SLIDE = [
		'`Kaizen · The loop`',
		'',
		'## Improvement is a loop you never stop running.',
		'',
		'- Plan',
		'  - State what you expect to happen, and why you expect it.',
		'',
		'<!-- Deming fought for "Study" over "Check" for the rest of his life, and the',
		'     distinction is the whole loop.',
		'',
		'     The prediction in Plan is what makes Study possible. A change with no',
		'     prediction attached cannot be wrong. -->',
	].join('\n');

	it('no longer splits into a paragraph + a code block', () => {
		expect(blocks(SLIDE)).toEqual(['paragraph', 'heading', 'bullet_list', 'comment']);
	});

	it('re-serializes without inventing a code fence', () => {
		const out = docToDeck(deckToDoc(SLIDE));
		expect(out).not.toContain('```');
		expect(out.trim()).toBe(SLIDE.trim());
	});

	it('does not lock the slide — the author can still edit the prose around it', () => {
		expect(hasLossyConstruct(parseDeck(SLIDE).slides[0].prose)).toBe(false);
	});
});

describe('shapes that are NOT block comments stay exactly as they were', () => {
	// Each of these was already handled correctly as prose; the new rule must not annex them.
	const prose: [string, string][] = [
		['an inline comment mid-line', '# H\n\ntext <!-- inline --> more text'],
		['trailing content after the close', '# H\n\n<!-- note --> trailing'],
		['an unterminated comment', '# H\n\n<!-- never closed\n\nbody'],
	];
	for (const [name, src] of prose) {
		it(`${name} → no comment node, source unchanged`, () => {
			expect(blocks(src)).not.toContain('comment');
			expect(docToDeck(deckToDoc(src)).trim()).toBe(src.trim());
		});
	}

	it('a comment inside a fenced code sample stays code', () => {
		const src = '# H\n\n```html\n<!-- sample -->\n```';
		expect(blocks(src)).toEqual(['heading', 'code_block']);
		expect(docToDeck(deckToDoc(src)).trim()).toBe(src.trim());
	});

	it('a `_`-prefixed directive is still hoisted to the slide, never a comment node', () => {
		const doc = deckToDoc('<!-- _class: cycle -->\n\n# H');
		expect(doc.child(0).attrs.directives).toEqual(['<!-- _class: cycle -->']);
		expect(blocks('<!-- _class: cycle -->\n\n# H')).toEqual(['heading']);
	});
});

// The clipboard gate. A comment node's text is written into the deck source verbatim, so text from
// a page the author does not control is an injection vector — the same reasoning as CLIP_ORIGIN /
// DIRECTIVE_SHAPE in deck-doc. A string that closes its comment EARLY smuggles live markup past a
// naive starts-with/ends-with check, so the gate requires a single, self-contained comment.
describe('the clipboard shape gate', () => {
	it('accepts one inert comment, single- or multi-line', () => {
		expect(isWellFormedComment('<!-- fine -->')).toBe(true);
		expect(isWellFormedComment('<!-- line\n  line -->')).toBe(true);
		expect(isWellFormedComment('<!---->')).toBe(true);
	});

	it('REJECTS a string that closes early and carries markup', () => {
		expect(isWellFormedComment('<!-- --><script>alert(1)</script><!-- -->')).toBe(false);
		expect(isWellFormedComment('<!-- a --><img src=x onerror=1><!-- b -->')).toBe(false);
	});

	// The three comment-end conditions BEYOND `-->`. Every one of these passed the gate's first
	// version and put a LIVE `<img>` in the document with its `onerror` running — measured through
	// the engine's own markdown-it config into a real Chromium, which is what CodeQL's
	// `js/bad-tag-filter` alert on this PR was pointing at. They are the reason the pattern carries
	// two lookaheads; if one is ever "simplified" away, these go red.
	it('REJECTS an incorrectly-closed comment (`--!>` ends a comment too)', () => {
		expect(isWellFormedComment('<!-- a --!><img src=x onerror=1><!-- b -->')).toBe(false);
		expect(isWellFormedComment('<!-- a\n--!><img src=x onerror=1><!-- b -->')).toBe(false);
	});

	it('REJECTS the abrupt-closing forms (`<!-->` and `<!--->` are complete comments)', () => {
		expect(isWellFormedComment('<!--><img src=x onerror=1><!-- b -->')).toBe(false);
		expect(isWellFormedComment('<!---><img src=x onerror=1><!-- b -->')).toBe(false);
	});

	it('still accepts a plain `--` inside a comment — parsers do, so this is not collateral damage', () => {
		expect(isWellFormedComment('<!-- a -- b - c -->')).toBe(true);
		expect(isWellFormedComment('<!-- a > b -->')).toBe(true);
		expect(isWellFormedComment('<!-- a <!-- b -->')).toBe(true);
	});

	it('REJECTS anything that is not exactly one comment', () => {
		for (const bad of ['plain text', '<!-- unterminated', 'trailing --> only', '<!-- a --> tail', 'head <!-- a -->', '']) {
			expect(isWellFormedComment(bad)).toBe(false);
		}
	});

	it('readCommentText refuses a rejected string, so the paste falls back to plain text', () => {
		expect(readCommentText('<!-- ok -->')).toEqual({ text: '<!-- ok -->' });
		expect(readCommentText('<!-- --><script>x</script><!-- -->')).toBe(false);
		expect(readCommentText(null)).toBe(false);
		expect(readCommentText(`<!-- ${'x'.repeat(9000)} -->`)).toBe(false);
	});
});

// The engine renders a comment as an HTML comment NODE, and CSS counts only elements — `:last-child`
// and `+` look straight through it. Compose's register inference must agree, or it mislabels the
// block the author is standing in.
describe('register inference looks through a comment, as the engine does', () => {
	/** Put the caret in top-level block `i` of a one-slide deck. */
	function caretIn(src: string, i: number) {
		const doc = deckToDoc(src);
		const slide = doc.child(0);
		let pos = 1; // into the slide
		for (let k = 0; k < i; k++) pos += slide.child(k).nodeSize;
		return EditorState.create({ doc, selection: TextSelection.near(doc.resolve(pos + 1)) });
	}

	it('a trailing blockquote is still the key insight when a note follows it', () => {
		const state = caretIn('## H\n\n> the insight\n\n<!-- a note -->', 1);
		expect(activeRegister(state)).toBe('insight');
	});

	it('a trailing em-dash paragraph is still a below-note when a comment follows it', () => {
		const state = caretIn('## H\n\n— the note\n\n<!-- a note -->', 1);
		expect(activeRegister(state)).toBe('note');
	});

	it('a code label separated from its heading by a comment is still an eyebrow', () => {
		const state = caretIn('`LABEL`\n\n<!-- a note -->\n\n## H', 0);
		expect(activeRegister(state)).toBe('eyebrow');
	});

	it('and still a subtitle on the other side of the heading', () => {
		const state = caretIn('## H\n\n<!-- a note -->\n\n`LABEL`\n\nbody', 2);
		expect(activeRegister(state)).toBe('subtitle');
	});

	it('slideContext reports isLast through trailing comments', () => {
		const ctx = slideContext(caretIn('## H\n\nbody\n\n<!-- one -->\n\n<!-- two -->', 1));
		expect(ctx?.isLast).toBe(true);
	});
});

describe('the comment node is a well-formed atom', () => {
	it('is an atom with no editable content, and stays selectable', () => {
		const type = deckSchema.nodes.comment;
		expect(type.isAtom).toBe(true);
		expect(type.isLeaf).toBe(true);
		expect(type.spec.selectable).toBe(true);
	});
});
