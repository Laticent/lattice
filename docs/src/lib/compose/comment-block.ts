import type MarkdownIt from 'markdown-it';
import type { NodeSpec } from 'prosemirror-model';
import { isCaptionBody, isDescriptionBody } from '../../components/studio/slide-directives';
import { CLIP_ORIGIN } from './clip-origin';

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
//
// WHAT "VERBATIM" DOES AND DOES NOT COVER. The comment's own bytes are exact: internal line breaks,
// hanging indent, odd dash counts, all of it. Its BLOCK SEPARATION is normalized, because
// `closeBlock` emits a blank line the way it does for every other block — so `A para\n<!-- n -->`
// re-emits as `A para\n\n<!-- n -->` once that slide is edited. That is 7 places across 3 shipped
// decks, it is render-neutral (a comment is invisible either way, and the html_block boundaries do
// not move), and it is the same normalization `initBaseline` already documents for inter-slide
// separators. Worth stating because an earlier draft claimed the round-trip was "byte-exact
// whatever shape the comment is in", which is true of the comment and false of the gap beside it.

/** A well-formed, self-contained HTML comment: opens once, closes once, closes at the END — where
 *  "closes" means what a BROWSER means by it, not what the obvious regex means.
 *
 *  BANNING ONLY `-->` IS NOT ENOUGH, and the first version of this gate did exactly that. The HTML
 *  spec ends a comment on three more conditions, and a real Chromium honors all of them — measured,
 *  by rendering each payload through the engine's own markdown-it config and counting the elements
 *  that came out:
 *
 *    <!-- a --!><img src=x onerror=…><!-- b -->    "incorrectly closed comment": `--!>` ends it
 *    <!-->      <img …><!-- b -->                  "abrupt closing": `<!--` then `>`
 *    <!--->     <img …><!-- b -->                  "abrupt closing": `<!--` then `->`
 *
 *  All three passed the `-->`-only gate, and all three put a LIVE `<img>` in the document with its
 *  `onerror` running. They are why this pattern carries two lookaheads rather than one: `(?!>|->)`
 *  refuses the abrupt forms, and `(?!--!?>)` refuses both real terminators. A plain `--` inside a
 *  comment is still fine (parsers accept it), so `<!-- a -- b -->` is not collateral damage.
 *
 *  CodeQL's `js/bad-tag-filter` is what surfaced this, and its premise is the durable lesson: a
 *  regex that models HTML parsing will miss a spec case. So each payload is pinned as a REJECTION
 *  in `comment-block.test.ts` — the arm that runs on every PR. What those tests cannot do is
 *  re-derive the browser behavior that makes the payloads dangerous; that was measured once,
 *  against a real Chromium, and a new spec case needs the same measurement, not a guess here. */
const COMMENT_SHAPE = /^<!--(?!>|->)(?:(?!--!?>)[\s\S])*-->$/;

/** A `_`-prefixed DIRECTIVE, which a comment node must never carry. See `readCommentText`. */
const DIRECTIVE_SHAPED = /^<!--\s*_[A-Za-z]/;

/** Whether a string is exactly one inert HTML comment (see COMMENT_SHAPE). */
export function isWellFormedComment(text: string): boolean {
	return COMMENT_SHAPE.test(text);
}

/** Read a comment's text back off pasted DOM.
 *
 *  THREE gates, and the first two exist because the markup gate alone was not enough. The original
 *  version checked shape only, and that re-opened the exact hole `CLIP_ORIGIN` was built to close:
 *  `<!-- _backgroundImage: url(https://evil.example/beacon.png) -->` is a perfectly well-formed
 *  INERT comment, so it passed — and `DIRECTIVE_LINE_RE` (deck-source) then hoisted it out of the
 *  emitted source into the slide's `directives` attr on the next parse. Measured end-to-end: a
 *  crafted `div.cs-comment` pasted into Compose produced
 *  `directives: ['<!-- _class: content -->', '<!-- _backgroundImage: url(…) -->']`, with the chip
 *  that briefly showed it gone after the resync. Attributes are not content; a foreign page must
 *  not be able to set them.
 *
 *  1. PROVENANCE — `data-lattice-origin` must be this session's token, so foreign HTML is inert.
 *  2. NOT A DIRECTIVE — defense in depth for the case where the token leaks or a future change
 *     relaxes it. A directive is hoisted out of the prose before parsing ever reaches this node,
 *     so a directive-shaped comment arriving here is already anomalous; refusing it keeps the
 *     invariant "a comment node never carries a directive" true by construction.
 *  3. SHAPE — exactly one inert comment (COMMENT_SHAPE).
 *
 *  Anything failing any gate is REJECTED (`false` tells ProseMirror to skip the parse rule), so the
 *  paste degrades to plain text — the pre-node behavior, and therefore never a regression. */
export function readCommentText(raw: string | null, origin?: string | null): { text: string } | false {
	if (!raw || origin !== CLIP_ORIGIN) return false;
	if (raw.length > 8192 || DIRECTIVE_SHAPED.test(raw) || !isWellFormedComment(raw)) return false;
	return { text: raw };
}

// ── What CHANNEL is this comment on? ─────────────────────────────────────────
// Not every `<!-- … -->` is a speaker note, and labelling them all "note" is wrong on the slide's
// own terms: `caption:` is the text the slide NARRATES and `describe:` is its WCAG text
// alternative — different channels with different sinks, neither a note.
//
// The two predicates are REUSED from `slide-directives.ts`, which is the Studio's existing mirror
// of `notes-core.isCaptionComment` / `isDescriptionComment` (HARD RULE #15 — this module had its
// own third copy until a review pointed at the two that already existed).
//
// THERE IS DELIBERATELY NO "pragma" CHANNEL. A first version added one with a hand-written prefix
// regex and a docblock claiming it mirrored the kernel. It did not: measured against the real
// `notes-core`, it disagreed on 22 of 32 probed bodies IN BOTH DIRECTIONS — missing every real
// remark pragma (the kernel's is `lint disable`, with a space; the regex had `lint-`), inventing
// `fit:` and `scrub:` which are not pragmas anywhere in the repo, and labelling ordinary author
// prose as machinery ("tier: enterprise customers churn faster", "color-mode: we should discuss
// the palette" — strings the kernel's own docblock names as the cases its value constraints exist
// to get right). The kernel needs 15 value-constrained matchers to make that call; a label on a
// pill does not earn that surface. A pragma now reads as a note, which is honest — it IS a comment
// the author wrote — instead of confidently wrong.
export type CommentKind = 'caption' | 'describe' | 'note';

/** The comment's body — its text with the `<!--` / `-->` fence removed and trimmed. Dash-tolerant
 *  on both ends, matching the engine's own `<!--+([\s\S]*?)--+!?>`: `<!--- x --->` is a comment
 *  too, and stripping exactly two dashes left the extras in the text the author reads. */
export function commentBody(text: string): string {
	return String(text || '')
		.replace(/^<!--+/, '')
		.replace(/--+!?>$/, '')
		.trim();
}

/** Which channel this comment belongs to. Drives the pill's LABEL only — the bytes are untouched. */
export function commentKind(text: string): CommentKind {
	const body = commentBody(text);
	if (isCaptionBody(body)) return 'caption';
	if (isDescriptionBody(body)) return 'describe';
	return 'note';
}

/** The words to SHOW for a comment — its body with the channel prefix stripped, because
 *  "caption: " is the syntax that selects the channel, not part of what the author wrote. */
export function commentText(text: string): string {
	const body = commentBody(text);
	const kind = commentKind(text);
	if (kind === 'caption') return body.replace(/^caption\s*:/i, '').trim();
	if (kind === 'describe') return body.replace(/^describe\s*:/i, '').trim();
	return body;
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
	toDOM: (node) => ['div', { class: 'cs-comment', 'data-comment': node.attrs.text as string, 'data-lattice-origin': CLIP_ORIGIN }],
	parseDOM: [
		{
			tag: 'div.cs-comment',
			getAttrs: (dom) => readCommentText((dom as HTMLElement).getAttribute('data-comment'), (dom as HTMLElement).getAttribute('data-lattice-origin')),
		},
	],
};

/** A markdown-it BLOCK rule recognizing a whole `<!-- … -->` comment, however many lines it spans.
 *
 *  Registered before `heading`, which is exactly where markdown-it's own `html_block` sits
 *  (measured ruler order: table, code, fence, blockquote, hr, list, reference, html_block,
 *  heading, lheading, paragraph). That position is load-bearing in both directions: with
 *  `html: false` there is no `html_block` to do this job, and registering any LATER — the first
 *  version used `before('paragraph')` — puts the rule after `lheading`, so
 *  `<!-- TODO` / `---` / `more -->` has its middle line taken as a SETEXT UNDERLINE and the
 *  comment's first line is rewritten into a visible `<h2>`. The engine does not do that, because
 *  its `html_block` runs first.
 *
 *  `html: true` is deliberately NOT turned on instead: that would also model inline tags and block
 *  HTML, which the round-trip refuses on purpose (they lock the slide). This rule is comments only. */
export function commentBlockRule(md: MarkdownIt): void {
	md.block.ruler.before(
		'heading',
		'lattice_comment',
		// biome-ignore lint/suspicious/noExplicitAny: markdown-it's StateBlock is loosely typed upstream.
		(state: any, startLine: number, endLine: number, silent: boolean) => {
			// TOP LEVEL ONLY — `blkIndent > 0` means we are inside a list item, and modeling a
			// comment there CHANGES THE RENDER. `- item` / `  <!-- note -->` / `- item` is a TIGHT
			// list; lifting the comment out of the item's paragraph splits it, and markdown-it then
			// renders the list LOOSE — every `<li>` gains a `<p>`. Measured against `origin/main`,
			// which was render-neutral here. Bailing in BOTH the silent and non-silent paths is
			// what keeps it neutral: returning true in silent mode would terminate the item's
			// paragraph and produce the same loose list by another route. So a comment inside a
			// list item stays prose, exactly as before this node existed. (blkIndent is 0 inside a
			// blockquote and after a paragraph, so neither of those loses the chip — measured.)
			if (state.blkIndent > 0) return false;
			// An opener indented 4+ is an indented code block. The `code` rule is registered BEFORE
			// this one and owns that case at the opener; the guard is still load-bearing in the
			// TERMINATOR path (a paragraph line followed by `    <!-- x -->`), where `code` is never
			// consulted. An earlier version of this comment had the ordering backwards.
			if (state.sCount[startLine] - state.blkIndent >= 4) return false;
			const start = state.bMarks[startLine] + state.tShift[startLine];
			if (state.src.slice(start, start + 4) !== '<!--') return false;

			// Scan forward for the line that closes the comment. `endLine` is exclusive.
			//
			// The search starts at `start`, NOT at `start + 4`, because markdown-it tests `/-->/`
			// against the WHOLE line including the opener — and `<!-->` carries its terminator at
			// offset 2, `<!--->` at offset 3. Skipping the opener made this rule consume PAST them
			// and swallow the following lines: `<!--->` / `VISIBLE TEXT` / `<!-- note -->` became a
			// single comment node, so the editor hid text the slide actually renders and "Remove
			// note" would have deleted it. Measured against the real engine.
			//
			// `-->` ONLY, deliberately — and this is the one place here where stopping at `--!>`
			// too would be WRONG. markdown-it's comment scanning ends at `-->`, so the ENGINE keeps
			// consuming past a `--!>`; matching that is how the Compose node boundary stays the
			// same boundary the render uses (HARD RULE #1). The browser disagreeing with
			// markdown-it there is real, but it is an engine-level property of authored source that
			// predates this node, and forking the parser would make a slide edit differently from
			// how it renders. What that mismatch makes dangerous is UNTRUSTED text, which is why
			// the paste gate refuses both terminators.
			let line = startLine;
			let close = -1;
			for (; line < endLine; line++) {
				const to = state.eMarks[line];
				const at = state.src.indexOf('-->', line === startLine ? start : state.bMarks[line]);
				if (at !== -1 && at + 3 <= to) {
					close = at + 3;
					break;
				}
			}
			// Unterminated — not our token. `paragraph` takes it, exactly as before.
			if (close === -1) return false;
			// Trailing content on the closing line: an inline comment, not a block one. A
			// `<!-- x --> and more text` is a paragraph with a comment in it; hoisting only its
			// head would split the author's line.
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
		// Mirrors markdown-it's own `html_block` terminator list. `reference` is included for the
		// same reason it is there: `reference.mjs` runs its own block chain.
		{ alt: ['paragraph', 'reference', 'blockquote'] },
	);
}
