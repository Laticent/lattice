import type MarkdownIt from 'markdown-it';
import type { NodeSpec } from 'prosemirror-model';

// An authoring COMMENT, modeled as a real schema node instead of falling through as prose.
//
// Compose exists for the author who does not want markdown's machinery in their face, and an
// HTML comment is machinery: it is a note TO the author, never a thing on the slide. Until
// this node existed the Compose parser ran markdown-it with `html: false`, which does not mean
// "drop HTML" — it means "do not model it", so every `<!-- … -->` landed in the document as
// literal, editable prose. That was not merely untidy; it corrupted decks, and the measurement
// is worth keeping because the failure is not the one you would guess:
//
//   <!-- Deming fought for "Study" over "Check" …
//
//        The prediction in Plan is what makes Study possible. … -->
//
// A continuation line indented four spaces or more, after a blank line, is an INDENTED CODE
// BLOCK. So that one comment parsed as a paragraph plus a code block (the monospace box the
// bug report screenshotted), and re-serializing the slide emitted the closing `-->` INSIDE a
// fence. The engine (`commonmark` + `html: true`) then read the fence opener as part of the
// comment and the fence closer as a block of its own, putting an empty `<pre><code></code></pre>`
// on the rendered slide. One keystroke on such a slide was enough; 25 multi-line comments
// across 7 shipped decks were exposed, 14 of them the blank-line variant.
//
// Modeling the comment fixes all of that at the root: the rule below consumes the whole comment
// as ONE token whatever its internal shape, the node carries the source bytes verbatim, and the
// serializer writes them back unchanged — so there is no reflow to get wrong.

/** A well-formed, self-contained HTML comment: opens once, closes once, closes at the END.
 *
 *  This is the CLIPBOARD gate, and it is the same reasoning as `DIRECTIVE_SHAPE` in deck-doc —
 *  a comment node's text is written into the deck source VERBATIM, so text arriving from a page
 *  the author does not control is an injection vector, not content. `<!-- --><script>…</script><!-- -->`
 *  is a single string that passes a naive "starts with `<!--`, ends with `-->`" check and lands
 *  live markup in the export. Requiring that no `-->` appear before the final one makes the node
 *  incapable of carrying anything but one inert comment. */
const COMMENT_SHAPE = /^<!--(?:(?!-->)[\s\S])*-->$/;

/** Whether a string is exactly one inert HTML comment (see COMMENT_SHAPE). */
export function isWellFormedComment(text: string): boolean {
	return COMMENT_SHAPE.test(text);
}

/** Read a comment's text back off pasted DOM. Anything that is not exactly one inert comment is
 *  REJECTED (`false` tells ProseMirror to skip the parse rule), so the paste degrades to plain
 *  text — the pre-node behavior, and therefore never a regression. */
export function readCommentText(raw: string | null): { text: string } | false {
	if (!raw || raw.length > 8192 || !isWellFormedComment(raw)) return false;
	return { text: raw };
}

/** The `comment` node: a block-level ATOM carrying its source bytes.
 *
 *  Atom, so it has no editable content and a keystroke can never reflow it. A node — rather than
 *  a slide attr with a block index, the other way to hide something — because ProseMirror then
 *  owns the POSITION: the comment survives every insert, delete, undo and paste around it with no
 *  anchor bookkeeping to drift. That is the whole reason this is cheap.
 *
 *  `selectable` is deliberately LEFT ON. A truly invisible, unselectable node is a data-loss
 *  footgun: Backspace at the start of the following block would delete an authoring note with
 *  nothing on screen to say it had. The chip in the view is what makes the node visible enough
 *  to be deleted on purpose. */
export const commentNodeSpec: NodeSpec = {
	atom: true,
	group: 'block',
	attrs: { text: { default: '' } },
	selectable: true,
	defining: true,
	toDOM: (node) => ['div', { class: 'cs-comment', 'data-comment': node.attrs.text as string }],
	parseDOM: [{ tag: 'div.cs-comment', getAttrs: (dom) => readCommentText((dom as HTMLElement).getAttribute('data-comment')) }],
};

/** A markdown-it BLOCK rule recognizing a whole `<!-- … -->` comment, however many lines it spans.
 *
 *  Registered before `paragraph` (and before `code`, which is why the opener's indent is checked):
 *  with `html: false` there is no `html_block` rule to do this, and we specifically do not want to
 *  turn `html: true` on — that would also start modeling inline tags and block HTML, which the
 *  round-trip deliberately refuses (they lock the slide instead). This rule is comments only.
 *
 *  It bails unless the comment ENDS its line. A trailing `<!-- x --> and more text` is a paragraph
 *  with an inline comment in it; hoisting only its head would split the author's line. Leaving it
 *  to `paragraph` keeps today's behavior for that shape. */
export function commentBlockRule(md: MarkdownIt): void {
	md.block.ruler.before(
		'paragraph',
		'lattice_comment',
		// biome-ignore lint/suspicious/noExplicitAny: markdown-it's StateBlock is loosely typed upstream.
		(state: any, startLine: number, endLine: number, silent: boolean) => {
			// An opener indented 4+ is an indented code block, and `code` owns it.
			if (state.sCount[startLine] - state.blkIndent >= 4) return false;
			const start = state.bMarks[startLine] + state.tShift[startLine];
			if (state.src.slice(start, start + 4) !== '<!--') return false;

			// Scan forward for the line that closes the comment. `endLine` is exclusive.
			let line = startLine;
			let close = -1;
			for (; line < endLine; line++) {
				const to = state.eMarks[line];
				const at = state.src.indexOf('-->', line === startLine ? start + 4 : state.bMarks[line]);
				if (at !== -1 && at + 3 <= to) {
					close = at + 3;
					break;
				}
			}
			// Unterminated — not our token. `paragraph` takes it, exactly as before.
			if (close === -1) return false;
			// Trailing content on the closing line: an inline comment, not a block one (see above).
			if (state.src.slice(close, state.eMarks[line]).trim() !== '') return false;
			if (silent) return true;

			const token = state.push('lattice_comment', '', 0);
			token.map = [startLine, line + 1];
			// The SOURCE BYTES, verbatim — internal newlines, indentation and all. Serializing
			// writes this back unchanged, which is what makes the round-trip exact.
			token.content = state.src.slice(start, close);
			token.block = true;
			state.line = line + 1;
			return true;
		},
		{ alt: ['paragraph', 'blockquote', 'list'] },
	);
}
