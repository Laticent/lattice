import MarkdownIt from 'markdown-it';
import { DOMParser as PMDOMParser } from 'prosemirror-model';
import { EditorState, TextSelection } from 'prosemirror-state';
import { describe, expect, it } from 'vitest';
import { CLIP_ORIGIN } from './clip-origin';
import { commentKind, commentText, isWellFormedComment, readCommentText } from './comment-block';
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

// Positions where modeling the comment would CHANGE THE RENDER, or where the scan used to run past
// a terminator and swallow slide-visible text. Each is measured against the real engine.
describe('scope: the rule never hides text the slide renders', () => {
	it('an abrupt-closing comment does not swallow the lines after it', () => {
		// `<!--->` carries its terminator at offset 3; scanning from `start + 4` skipped it, so the
		// rule consumed VISIBLE TEXT and the second comment into one node. The engine renders that
		// text — so the editor was hiding it, and "Remove note" would have deleted it.
		const src = '<!--->\nVISIBLE TEXT\n<!-- second note -->';
		expect(blocks(src)).toEqual(['comment', 'paragraph', 'comment']);
		expect(docToDeck(deckToDoc(src))).toContain('VISIBLE TEXT');
	});

	it('`<!-->` likewise closes at its own terminator', () => {
		expect(blocks('<!-->\nVISIBLE TEXT')).toEqual(['comment', 'paragraph']);
	});

	// RENDER-NEUTRALITY, not byte-exactness, is the contract inside a list. `origin/main` already
	// reflowed `- item one` / `  <!-- note -->` onto one line, and that is harmless: the list stays
	// TIGHT either way. What was NOT harmless was modeling the comment — that splits the item's
	// paragraph, and markdown-it then renders the list LOOSE, giving every `<li>` a `<p>`. So the
	// arm checks the rendered shape through the engine's own config, which is the thing that moved.
	const tight = (md: string) => {
		const html = new MarkdownIt('commonmark', { html: true, breaks: true }).render(md);
		return !/<li>\s*<p>/.test(html);
	};

	it('a comment inside a list item stays prose, so the list stays TIGHT', () => {
		const src = '- item one\n  <!-- note -->\n- item two';
		expect(blocks(src)).toEqual(['bullet_list']);
		expect(tight(src)).toBe(true);
		expect(tight(docToDeck(deckToDoc(src)))).toBe(true);
	});

	it('a comment as a list item’s first block stays prose too', () => {
		const src = '- <!-- a -->\n- second';
		expect(blocks(src)).not.toContain('comment');
		expect(tight(src)).toBe(true);
		expect(tight(docToDeck(deckToDoc(src)))).toBe(true);
	});

	it('a `---` inside a comment is not read as a setext underline', () => {
		// The rule registers before `heading`, where the engine's own html_block sits. Registered
		// after `lheading` instead, this turned the comment's first line into a visible `<h2>`.
		const src = '<!-- TODO\n---\nnext steps -->';
		expect(blocks(src)).toEqual(['comment']);
		expect(docToDeck(deckToDoc(src)).trim()).toBe(src);
	});

	it('a comment still ends a paragraph it follows, as the engine does', () => {
		expect(blocks('Some text\n<!-- note -->')).toEqual(['paragraph', 'comment']);
	});
});

describe('the comment CHANNEL drives the pill label, never the bytes', () => {
	it('classifies the engine\u2019s two structured channels', () => {
		expect(commentKind('<!-- caption: the slide reads as this. -->')).toBe('caption');
		expect(commentKind('<!-- describe: a bar chart with four bars. -->')).toBe('describe');
		expect(commentKind('<!-- just a note to self -->')).toBe('note');
	});

	it('is case- and space-tolerant, the way the kernel is', () => {
		expect(commentKind('<!--Caption : x-->')).toBe('caption');
		expect(commentKind('<!--  DESCRIBE: x -->')).toBe('describe');
	});

	it('shows the words, not the channel prefix', () => {
		expect(commentText('<!-- caption: FY26 revenue grew. -->')).toBe('FY26 revenue grew.');
		expect(commentText('<!-- describe: a bar chart. -->')).toBe('a bar chart.');
		expect(commentText('<!-- a plain note -->')).toBe('a plain note');
	});

	it('strips extra dashes on both ends, as the engine does', () => {
		// The engine's own comment source is `<!--+([\s\S]*?)--+!?>`, so `<!--- x --->` is a comment
		// too. Stripping exactly two dashes left the extras in the words the author reads.
		expect(commentText('<!--- extra dashes --->')).toBe('extra dashes');
		expect(commentText('<!-- ends oddly --!>')).toBe('ends oddly');
	});

	// THERE IS NO PRAGMA CHANNEL, and that is deliberate. A first version added one with a
	// hand-written prefix regex whose docblock claimed it mirrored `notes-core`. Measured against
	// the real kernel it disagreed on 22 of 32 probed bodies in BOTH directions. These arms pin the
	// honest behavior: machinery reads as a note rather than as a confidently wrong label.
	it('does not try to guess "pragma" — a tooling comment reads as a note', () => {
		expect(commentKind('<!-- markdownlint-disable -->')).toBe('note');
		expect(commentKind('<!-- tier: short -->')).toBe('note');
	});

	it('and never mislabels author prose that merely starts with such a word', () => {
		// The exact strings the kernel's own docblock names as the cases its constraints exist for.
		expect(commentKind('<!-- tier: enterprise customers churn faster -->')).toBe('note');
		expect(commentKind('<!-- color-mode: we should discuss the palette -->')).toBe('note');
		expect(commentKind('<!-- fit: this into the Q3 story -->')).toBe('note');
	});

	// PARITY with lib/authoring/notes-core.js on the two channels we DO claim. This reads the real
	// kernel, so a drift in either direction fails here.
	it('agrees with the engine kernel on caption / describe', async () => {
		const kernel = await import('../../../../lib/authoring/notes-core.js');
		const samples = ['caption: x', 'describe: x', 'Caption : x', 'DESCRIBE:x', 'a plain note', 'captions are nice', 'described below', 'tier: short', 'markdownlint-disable'];
		for (const body of samples) {
			const text = `<!-- ${body} -->`;
			expect([body, commentKind(text) === 'caption']).toEqual([body, kernel.isCaptionComment(body)]);
			expect([body, commentKind(text) === 'describe']).toEqual([body, kernel.isDescriptionComment(body)]);
		}
	});
});

// THE CLIPBOARD GATE. A comment node's text is written into the deck source verbatim, so text from
// a page the author does not control is an injection vector — the same reasoning as CLIP_ORIGIN and
// DIRECTIVE_SHAPE in deck-doc. Three things have to hold: the string must be one self-contained
// INERT comment (a string that closes early smuggles live markup), it must have come from THIS
// editor, and it must not be a directive.
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
		expect(readCommentText('<!-- ok -->', CLIP_ORIGIN)).toEqual({ text: '<!-- ok -->' });
		expect(readCommentText('<!-- --><script>x</script><!-- -->', CLIP_ORIGIN)).toBe(false);
		expect(readCommentText(null, CLIP_ORIGIN)).toBe(false);
		expect(readCommentText(`<!-- ${'x'.repeat(9000)} -->`, CLIP_ORIGIN)).toBe(false);
	});

	// PROVENANCE. The shape gate alone re-opened the exact hole CLIP_ORIGIN was built to close:
	// `<!-- _backgroundImage: url(…) -->` is a well-formed INERT comment, so it passed — and
	// `DIRECTIVE_LINE_RE` then hoisted it out of the emitted source into the slide's `directives`
	// on the next parse. Measured end-to-end before the fix.
	it('REJECTS a comment with no provenance, however well-formed', () => {
		expect(readCommentText('<!-- ok -->', null)).toBe(false);
		expect(readCommentText('<!-- ok -->', 'some-other-session')).toBe(false);
	});

	it('REJECTS a directive-shaped comment even WITH provenance (defense in depth)', () => {
		expect(readCommentText('<!-- _backgroundImage: url(https://evil.example/beacon.png) -->', CLIP_ORIGIN)).toBe(false);
		expect(readCommentText('<!-- _class: quote -->', CLIP_ORIGIN)).toBe(false);
	});

	it('a foreign div.cs-comment cannot put a directive into the deck source', () => {
		const payload = '<!-- _backgroundImage: url(https://evil.example/beacon.png) -->';
		const host = document.createElement('div');
		const div = document.createElement('div');
		div.className = 'cs-comment';
		div.setAttribute('data-comment', payload);
		div.setAttribute('data-lattice-origin', 'forged-token');
		host.append(div);
		const slice = PMDOMParser.fromSchema(deckSchema).parseSlice(host);
		const kinds: string[] = [];
		slice.content.forEach((n) => {
			kinds.push(n.type.name);
		});
		expect(kinds).not.toContain('comment');
	});

	it('but a comment copied from THIS session round-trips', () => {
		const host = document.createElement('div');
		const div = document.createElement('div');
		div.className = 'cs-comment';
		div.setAttribute('data-comment', '<!-- a real note -->');
		div.setAttribute('data-lattice-origin', CLIP_ORIGIN);
		host.append(div);
		const slice = PMDOMParser.fromSchema(deckSchema).parseSlice(host);
		const texts: string[] = [];
		slice.content.forEach((n) => {
			if (n.type.name === 'comment') texts.push(n.attrs.text as string);
		});
		expect(texts).toEqual(['<!-- a real note -->']);
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

	// THE ASYMMETRY, and the reason it is not a tidiness problem. An earlier version of this file
	// asserted `subtitle` here, because the skip was applied in both directions on the claim that
	// eyebrow and subtitle are "pure CSS". They are not the same mechanism: the subtitle is hoisted
	// into `.masthead-lede` by `masthead.transform.js`, whose adjacency test is a string match that
	// a comment defeats. Measured on the real engine — with a comment between, the lede renders as
	// `<h2>H</h2>` alone and the label falls through as ordinary prose. Compose must agree.
	it('but NOT a subtitle on the other side of the heading — the engine drops it there', () => {
		const state = caretIn('## H\n\n<!-- a note -->\n\n`LABEL`\n\nbody', 2);
		expect(activeRegister(state)).toBe(null);
	});

	it('with no comment in the way, the subtitle still reads as one', () => {
		const state = caretIn('## H\n\n`LABEL`\n\nbody', 1);
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
