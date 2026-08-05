/**
 * lib/core/slide-boundaries.mjs
 *
 * THE ONE text-level derivation of a deck's slide boundaries — the answer to
 * "which lines are top-level `hr`, and so where does a slide begin?", computed
 * from source text without a markdown parse.
 *
 * WHY THIS EXISTS. The engine splits slides on every top-level markdown-it `hr`
 * token (`lib/engine/slides.js splitOnHr`). Every caller-side splitter in the
 * tree derived that set independently, from a regex over `---`, and each one
 * derived it DIFFERENTLY. Measured against the real parser before this module
 * landed (`***`, `___`, `- - -`, `--- ` with a trailing space, `----`, and a
 * `---` indented one to three spaces are all `hr` to the engine):
 *
 *   deck                        engine   /^---$/m   /\r?\n-{3,}\r?\n/
 *   `# One` `***` `# Two`         2         1              1
 *   `# One` `--- ` `# Two`        2         1              1
 *   `# One` `  ---` `# Two`       2         1              1
 *
 * The consequences were not cosmetic. The preview painted a different slide
 * than the rail selected (#1265); the editor and the preview disagreed by one
 * (§7b of the preview-render-cost note); and the chat edit path DESTROYED a
 * slide the author never mentioned and reported success over it — `slideCount`
 * read 1 where the engine renders 2, so `replace slide 1` overwrote the whole
 * deck. Six separator forms reproduced that, not the two originally reported.
 * See engineering/decisions/2026-08-05-slide-boundary-reconciliation.md.
 *
 * WHAT THIS IS, PRECISELY. A line scanner that reproduces markdown-it's
 * `hr`-at-level-0 set for the deck shapes it can decide, and SAYS SO when it
 * cannot. It is not a Markdown parser and does not try to be: it tracks exactly
 * the block context that determines whether a thematic break is top-level —
 * fenced code, `$$` math, HTML blocks, blockquotes, lists, tables, indented
 * code, and whether a paragraph is open above the line (which is what turns
 * `---` into a setext underline instead of a break).
 *
 * THE `certain` FLAG IS THE LOAD-BEARING PART. A hand-written scanner that is
 * merely usually right is the defect generator this module was written to
 * retire. So every result carries `certain`, and it goes false the moment the
 * scan meets a shape whose parse it cannot settle by scanning (an HTML block
 * that only a full tag grammar recognizes, an unterminated construct). Callers
 * that can afford to be wrong about a boundary ignore it; the two that cannot —
 * the arbiter that decides whether a caller index may be handed to the engine
 * (`positionIsTrustworthy`) and the chat edit splice — refuse instead of
 * guessing. Fail closed costs an optimization; fail wrong costs a slide.
 *
 * PINNED TO THE PARSER, NOT TO A COMMENT. `test/unit/core/slide-boundaries.test.js`
 * runs this scanner and the real `lib/core/boundary-parser.js` markdown-it over
 * every committed deck and a generated corpus, and fails on any disagreement
 * this module claimed to be certain about. That test is the contract; this
 * comment is only its description.
 *
 * NO IMPORTS, on purpose — the same constraint `lib/authoring/lint-core.js` and
 * `lib/diagnostics/slice-equivalence-core.mjs` work under. It has to bundle into
 * the browser Studio, where it runs on every keystroke, and it has to be
 * `require()`-able from the CommonJS authoring cores. It touches no `fs`, no
 * network, no DOM.
 */

// ── Line geometry ────────────────────────────────────────────────────────────

/**
 * The engine's door normalization, spelled the same way `lib/core/boundary-parser.js`
 * spells it (a BOM defeats every `^` anchor; markdown-it folds `\r\n` and lone
 * `\r` internally, so a caller that splits on '\n' without folding counts
 * different lines than `token.map` does).
 *
 * U+2028 / U+2029 are DELIBERATELY NOT line terminators here, because they are
 * not line terminators to markdown-it either. JavaScript's `^`/`$` under the `m`
 * flag disagree — they break on U+2028 — which is how `source.split(/^---$/m)`
 * came to see a slide boundary in `the plan<U+2028>---<U+2028>v2 draft` where the
 * engine renders one continuous line. Nothing normalizes those two characters at
 * the ingest doors (`docs/src/lib/normalize-source-text.ts` folds CRLF and BOM
 * only), so a pasted or imported deck carries them through; scanning lines
 * rather than running a multiline regex is what makes them harmless.
 */
export function normalizeSourceText(text) {
	return typeof text === 'string' ? text.replace(/^﻿/, '').replace(/\r\n?/g, '\n') : '';
}

/** Leading YAML front matter, or '' — the region no slide splitter may look inside. */
export function frontMatterBlockOf(src) {
	return (/^---(?:\r\n|\r|\n)[\s\S]*?(?:\r\n|\r|\n)---[ \t]*(?:\r\n|\r|\n)?/.exec(String(src ?? '')) || [''])[0];
}

/** Column width of `line`'s leading whitespace, with tabs advancing to the next 4-column stop. */
function indentWidth(line) {
	let w = 0;
	for (const ch of line) {
		if (ch === ' ') w += 1;
		else if (ch === '\t') w += 4 - (w % 4);
		else break;
	}
	return w;
}

/** `line` with its leading whitespace removed. */
function stripIndent(line) {
	return line.replace(/^[ \t]*/, '');
}

// ── The shapes ───────────────────────────────────────────────────────────────

/**
 * Is `rest` (an indent-stripped line) a thematic break?
 *
 * markdown-it's `hr` rule verbatim: the first character is `*`, `-` or `_`, every
 * later character is that same marker or a space/tab, and the marker appears at
 * least three times. That admits `***`, `___`, `- - -`, `----`, `--- ` and
 * `-\t-\t-` — every one of which the `/^---$/m` splitters missed.
 */
function isThematicBreak(rest) {
	const marker = rest[0];
	if (marker !== '*' && marker !== '-' && marker !== '_') return false;
	let count = 0;
	for (const ch of rest) {
		if (ch === marker) count += 1;
		else if (ch !== ' ' && ch !== '\t') return false;
	}
	return count >= 3;
}

/**
 * Is `rest` a setext underline — and so a HEADING rather than a break?
 *
 * Only when a paragraph is open above it, and only for a run of a single
 * character. This is the one place the two splitters disagreed in the OPPOSITE
 * direction from everything else: `Interlude` over `---` is a level-2 heading to
 * the engine and a slide separator to a `\n---\n` scan, so the caller counted a
 * slide the deck does not render.
 *
 * `-` is the dangerous marker: `----` under a paragraph is a heading, while the
 * same four characters after a blank line are a break. `***` and `___` are never
 * underlines, which is why they terminate the paragraph and split.
 */
function isSetextUnderline(rest) {
	return /^(?:=+|-+)[ \t]*$/.test(rest);
}

/** A fence opener — ``` or ~~~ — returning `{ marker, len }`, or null. */
function fenceOpener(rest) {
	const m = /^(`{3,}|~{3,})(.*)$/.exec(rest);
	if (!m) return null;
	// CommonMark: a BACKTICK fence's info string may not contain a backtick (otherwise
	// `` `` ``-style inline code would open fences). A tilde fence has no such rule.
	if (m[1][0] === '`' && m[2].includes('`')) return null;
	return { marker: m[1][0], len: m[1].length };
}

/** A list-item marker — returning the column its CONTENT starts at, or -1. */
function listContentIndent(rest, sCount) {
	const m = /^([-*+]|\d{1,9}[.)])([ \t]+|$)/.exec(rest);
	if (!m) return -1;
	const markerLen = m[1].length;
	// CommonMark: 1–4 spaces after the marker set the content column; 5+ (or a blank
	// remainder) make it marker + 1, with the rest read as an indented code block.
	const spaces = m[2] === '' ? 1 : indentWidth(m[2]) > 4 ? 1 : indentWidth(m[2]);
	return sCount + markerLen + spaces;
}

/**
 * A table delimiter row (`|---|:--:|`) — the line that turns the line above it
 * into a table header rather than a paragraph.
 *
 * It matters only for what it does to PARAGRAPH state: a delimiter row can never
 * itself be a thematic break (it carries a `|`), but without recognizing the
 * table, the scan believes a paragraph is still open at the row after it — and
 * then reads the deck's next `---` as a setext underline instead of a slide
 * boundary. Measured: `| a |` / `|---|` / `| b |` / `---` is an `hr` to the
 * engine, and a setext heading to a scanner that cannot see the table.
 */
function isTableDelimiterRow(rest) {
	// A LINEAR PRE-FILTER over the five characters a delimiter row can contain, so the pattern
	// below only ever sees a string it cannot backtrack across.
	//
	// STATED HONESTLY, because the reason is narrower than it looks. The pattern has ambiguous
	// quantifiers (`[ \t]*` and `-+` inside a `*` group) — the shape static analysis flags as
	// polynomial ReDoS. Measured, V8 runs it LINEARLY: 64,000 dashes with a failing suffix cost
	// 0.70ms, and a million cost proportionally more, not quadratically. So this is not a fix
	// for an observed hang; it is removing an ambiguity a scanner is right to dislike on a
	// function that runs on every keystroke over deck text an untrusted shared deck controls
	// (HARD RULE #22's threat model). The measured effect is real but modest, and the guard's
	// real value is that the input class is now provably unambiguous rather than empirically
	// fast on one engine.
	let bar = false;
	for (let i = 0; i < rest.length; i++) {
		const c = rest[i];
		if (c === '|') bar = true;
		else if (c !== ':' && c !== '-' && c !== ' ' && c !== '\t') return false;
	}
	if (!bar) return false;
	return /^\|?[ \t]*:?-+:?[ \t]*(?:\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/.test(rest);
}

// ── HTML blocks ──────────────────────────────────────────────────────────────

/**
 * CommonMark's block-level tag names, duplicated from markdown-it's own
 * `lib/common/html_blocks.mjs`.
 *
 * DUPLICATED, NOT IMPORTED, and that is a deliberate trade this module's header
 * explains: it takes no imports so it can bundle for the browser and be
 * `require()`d from the CommonJS cores. The duplication is pinned rather than
 * trusted — `slide-boundaries.test.js` reads markdown-it's list and fails if the
 * two ever diverge, the same shape `render-ids.js`'s id-family list uses.
 */
const HTML_BLOCK_NAMES =
	'address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h1|h2|h3|h4|h5|h6|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul';

const HTML_BLOCK_NAME_RE = new RegExp(`^</?(?:${HTML_BLOCK_NAMES})(?=[\\s/>]|$)`, 'i');
// NO `</` alternative, deliberately: CommonMark's raw-text block (type 1) opens on the
// START tag only. A lone `</script>` is a type-7 block instead — which ends at a BLANK
// LINE rather than at the matching close tag, and cannot interrupt a paragraph. Getting
// this wrong made `</script>` close immediately and exposed every `---` after it as a
// slide boundary the engine does not have; it was the single largest class the fuzz found.
const HTML_RAW_TEXT_RE = /^<(?:script|pre|style|textarea)(?=[\s>]|$)/i;
/**
 * A complete open or close tag ALONE on its line — CommonMark's html-block type 7, the one
 * kind that cannot interrupt a paragraph and the one that ends at a blank line.
 *
 * The source is `markdown-it/lib/common/html_re.mjs`'s `HTML_OPEN_CLOSE_TAG_RE`, transcribed
 * character for character and anchored to end of line exactly as markdown-it's own html_block
 * rule anchors it. Transcribed rather than imported for the reason the block-tag list is, and
 * pinned the same way: `slide-boundaries.test.js` reads markdown-it's `.source` and fails if
 * the two diverge.
 *
 * Being FAITHFUL rather than merely close is what lets the scan answer here at all. A looser
 * attribute-name class matched `<svg viewBox="…">…</svg>` — an inline graphic that markdown-it
 * reads as an ordinary paragraph, because the line does not END at the tag — and the scan gave
 * up on four committed decks rather than say so.
 */
const HTML_OPEN_CLOSE_TAG_SOURCE =
	'^(?:<[A-Za-z][A-Za-z0-9\\-]*(?:\\s+[a-zA-Z_:][a-zA-Z0-9:._-]*(?:\\s*=\\s*(?:[^"\'=<>`\\x00-\\x20]+|\'[^\']*\'|"[^"]*"))?)*\\s*\\/?>|<\\/[A-Za-z][A-Za-z0-9\\-]*\\s*>)';
const HTML_ANY_TAG_RE = new RegExp(`${HTML_OPEN_CLOSE_TAG_SOURCE}\\s*$`);

/** The transcription above, exported so a test can diff it against markdown-it's own `.source`. */
export const MARKDOWN_IT_TAG_SOURCE = HTML_OPEN_CLOSE_TAG_SOURCE;

/**
 * The html-block kind `rest` opens, or null.
 *
 * `end` is the pattern that closes it; `blankCloses` marks the kinds (types 6
 * and 7) that run to the next BLANK LINE rather than to a marker. That
 * distinction is not academic — `<div>` / `x` / `</div>` / `---` with no blank
 * line anywhere renders ZERO slide breaks, because the `---` is still inside the
 * HTML block. A splitter that stops at `</div>` cuts a slide the engine does not.
 *
 * `interrupts` is false only for type 7, which CommonMark forbids from breaking
 * an open paragraph.
 */
function htmlBlockOpener(rest) {
	if (rest[0] !== '<') return null;
	if (rest.startsWith('<!--')) return { end: /-->/, blankCloses: false, interrupts: true };
	if (rest.startsWith('<?')) return { end: /\?>/, blankCloses: false, interrupts: true };
	if (rest.startsWith('<![CDATA[')) return { end: /\]\]>/, blankCloses: false, interrupts: true };
	if (/^<![A-Za-z]/.test(rest)) return { end: />/, blankCloses: false, interrupts: true };
	if (HTML_RAW_TEXT_RE.test(rest)) return { end: /<\/(?:script|pre|style|textarea)>/i, blankCloses: false, interrupts: true };
	if (HTML_BLOCK_NAME_RE.test(rest)) return { end: null, blankCloses: true, interrupts: true };
	// THE SAME LINEAR PRE-FILTER, for the same reason and with the same caveat.
	// `HTML_OPEN_CLOSE_TAG_RE` is transcribed from markdown-it verbatim — it has to be, that is
	// the contract — and markdown-it's own attribute loop is ambiguous: the `\s+` separating
	// attributes and the `\s*` before the closing `>` can split a run of spaces between them N
	// ways. A type-7 block is a COMPLETE tag alone on its line, so it must end with `>`, and a
	// line that does not is rejected here in one pass without ever reaching the pattern.
	//
	// Measured through `slideBoundaries` on `'<a' + ' b'.repeat(64000) + '!'`: 3.26ms before,
	// 0.12ms after — 27x, and below what an ordinary deck of the same length costs. The
	// unguarded pattern was linear on V8 too (1,000,000 repeats in 116ms), so this hardens a
	// shape rather than rescuing a hang. The transcription itself is untouched, so the test that
	// pins it against markdown-it's `.source` still holds.
	const tail = rest.trimEnd();
	if (tail.charCodeAt(tail.length - 1) !== 0x3e /* > */) return null;
	if (HTML_ANY_TAG_RE.test(rest)) return { end: null, blankCloses: true, interrupts: false };
	return null;
}

/**
 * Does `rest` open a block that TERMINATES a link reference definition's line scan?
 *
 * markdown-it gathers a definition's text line by line and stops at the first line a
 * terminator rule claims — `table`, `fence`, `blockquote`, `hr`, `list`, `html_block`,
 * `heading`. So `[ref]:` over `<script>` is NOT a definition with `<script>` as its
 * destination: the scan stops before it, the definition has no destination, and the label
 * falls back to being a paragraph — which is what makes the NEXT line a setext underline
 * instead of a slide boundary. Getting this wrong turned four `___` runs into boundaries
 * the engine does not have.
 *
 * A type-7 HTML block is excluded because it cannot terminate a paragraph, which is the
 * same predicate markdown-it consults in silent mode.
 */
function opensTerminatingBlock(rest) {
	if (rest === '') return false;
	return (
		isThematicBreak(rest) ||
		Boolean(fenceOpener(rest)) ||
		rest[0] === '>' ||
		listContentIndent(rest, 0) >= 0 ||
		/^#{1,6}(?:[ \t]|$)/.test(rest) ||
		Boolean(htmlBlockOpener(rest)?.interrupts)
	);
}

// ── The scan ─────────────────────────────────────────────────────────────────

/**
 * Where slide boundaries fall in `body` — `{ lines, certain, reason }`.
 *
 * `body` is the deck BODY: front matter already stripped. That is not a
 * convenience, it is a correctness requirement — front matter's own closing
 * `---` is a thematic break to any scanner that sees it, and its opening `---`
 * turns the first key into a setext heading. Every caller strips it first
 * (`frontMatterBlockOf` above); the engine strips it before parsing too.
 *
 * `lines` are 0-based indices into `normalizeSourceText(body).split('\n')` — the
 * SAME line numbering markdown-it's `token.map[0]` uses, which is the whole
 * point of normalizing here rather than at each caller.
 *
 * `certain` is false when the scan met a shape it cannot settle without a real
 * parse. The boundaries returned are still this module's best answer; what
 * changes is whether a caller may bet a slide on them.
 */
export function slideBoundaries(body) {
	const text = normalizeSourceText(String(body ?? ''));
	const lines = text.split('\n');
	const out = [];
	let certain = true;
	let reason = null;
	const unsure = (why) => {
		if (certain) {
			certain = false;
			reason = why;
		}
	};

	let fence = null; // { marker, len, blkIndent } — an open fenced block
	let html = null; // { end, blankCloses } — an open HTML block
	let math = false; // inside a `$$` display-math block
	let list = null; // { contentIndent } — the OUTERMOST open list
	let quote = false; // a blockquote is open
	let paraOpen = false; // a paragraph is open in the INNERMOST open context
	let inTable = false;
	let prevBlank = true; // the start of the document behaves like the line after a blank

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const sCount = indentWidth(line);
		const rest = stripIndent(line);
		const blank = rest === '';

		// 1. Inside a fenced block — nothing in here is a boundary, and the closer has to
		//    match the opener's MARKER and be at least as long (a shorter inner ``` cannot
		//    close a ```` opener).
		if (fence) {
			if (!blank && sCount - fence.blkIndent < 4 && new RegExp(`^\\${fence.marker}{${fence.len},}[ \\t]*$`).test(rest)) fence = null;
			paraOpen = false;
			prevBlank = blank;
			continue;
		}

		// 2. Inside a `$$` display-math block (lib/core/math-block-rule.js). Its body is
		//    LaTeX, which is full of lines that look like Markdown structure — a lone `=`
		//    row in a matrix is a setext underline to anything that cannot see the block.
		if (math) {
			if (rest.trimEnd().endsWith('$$')) math = false;
			paraOpen = false;
			prevBlank = blank;
			continue;
		}

		// 3. Inside an HTML block.
		if (html) {
			if (html.blankCloses ? blank : html.end.test(line)) html = null;
			paraOpen = false;
			prevBlank = blank;
			continue;
		}

		// 4. A blank line closes any open paragraph, ends a table, and closes a blockquote.
		//    It does NOT close a list: `- a` / '' / '' / `  ---` keeps the break inside the
		//    item, which is why list state survives blanks here.
		if (blank) {
			paraOpen = false;
			quote = false;
			inTable = false;
			prevBlank = true;
			continue;
		}

		const afterBlank = prevBlank;
		prevBlank = false;

		// Where this line sits relative to the innermost open container. `insideList` is the
		// pivot for almost every decision below: a construct indented INTO an open list item
		// belongs to that item and is emitted below level 0, while the same construct below
		// the item's content column terminates the list and is top-level.
		const blkIndent = list ? list.contentIndent : 0;
		const effIndent = sCount - blkIndent;
		const insideList = Boolean(list) && sCount >= list.contentIndent;
		// Everything except a lazy paragraph continuation leaves the containers it is not
		// indented into.
		const leaveContainers = () => {
			if (!insideList) list = null;
			quote = false;
			inTable = false;
		};
		// The line is ordinary paragraph text. WHOSE paragraph is what the containers decide:
		// a line below an open container's content column continues that container's paragraph
		// LAZILY — opening no top-level paragraph, which is what keeps the next `-` run a slide
		// boundary rather than an underline. Laziness needs a paragraph to BE open (a `***`
		// inside the item leaves none, so the line after it starts a top-level paragraph
		// instead), and a blank line breaks it outright.
		const asParagraph = () => {
			if (!afterBlank && paraOpen && (quote || (list && !insideList))) return;
			if (!insideList) {
				list = null;
				quote = false;
			}
			paraOpen = true;
		};

		// 5. An indented code block — but ONLY when no paragraph is open. Indented code
		//    cannot interrupt a paragraph, so `A` / `\tB` / `---` leaves the paragraph open
		//    and the `---` that follows is a setext underline, not a break. Either way the
		//    line holds no top-level boundary and changes no state.
		if (effIndent >= 4) {
			inTable = false; // a table body breaks at four columns of indent
			continue;
		}

		// 6. A TABLE, recognized by the delimiter row beneath its header. FIRST, because
		//    `table` is the first rule markdown-it tries — ahead of `list`, `reference` and
		//    `paragraph`, and able to interrupt an open paragraph. Order is not cosmetic
		//    here: with the check further down, `[ref]:` over `|---|---|` was read as a link
		//    reference where the parser reads a table, and the deck's next `---` came out a
		//    heading instead of a slide boundary. The header must contain a `|` (markdown-it
		//    requires it), which is why a thematic break can never be mistaken for one.
		if (!inTable && i + 1 < lines.length && rest.includes('|')) {
			const next = lines[i + 1];
			if (indentWidth(next) - blkIndent < 4 && isTableDelimiterRow(stripIndent(next))) {
				leaveContainers();
				inTable = true;
				paraOpen = false;
				i += 1; // consume the delimiter row along with the header
				continue;
			}
		}

		// 7. A fence opener. Fences DO interrupt a paragraph.
		const opener = fenceOpener(rest);
		if (opener) {
			fence = { ...opener, blkIndent };
			paraOpen = false;
			leaveContainers();
			continue;
		}

		// 7. A `$$` math opener. The rule is installed without paragraph-terminator options
		//    (`md.block.ruler.before('fence', …)` with no `alt`), so unlike a fence it CANNOT
		//    interrupt a paragraph — including a paragraph being continued lazily inside a
		//    list item, which is why the guard is `paraOpen` rather than "top level". And an
		//    opener whose closer never arrives matches nothing at all, so the lookahead has
		//    to confirm the close before the scan commits to it.
		if (!paraOpen && !inTable && rest.startsWith('$$')) {
			if (rest.slice(2).trim().endsWith('$$')) {
				leaveContainers();
				continue; // opened and closed on one line
			}
			let closes = false;
			for (let j = i + 1; j < lines.length; j++) {
				if (lines[j].trimEnd().endsWith('$$')) {
					closes = true;
					break;
				}
			}
			if (closes) {
				math = true;
				leaveContainers();
				continue;
			}
			// Never closed: the rule declines and the line is ordinary paragraph text.
		}

		// 8. A thematic break — the thing this whole module exists to locate. Tested BEFORE
		//    the list rule on purpose, because markdown-it tests it there too: that is why
		//    `- - -` is a break and not a one-item list.
		if (isThematicBreak(rest)) {
			// A run of `-` under an open paragraph is that paragraph's SETEXT UNDERLINE
			// rather than a break — but only where markdown-it's `lheading` looks for one,
			// which is at or above the innermost container's content column. A line BELOW it
			// (a lazy continuation of a list item, or of a blockquote) is skipped by that
			// check, so the same characters terminate the container and ARE a break. That
			// asymmetry is why `- a` / `lazy` / `----` is a slide boundary and `lazy` /
			// `----` alone is a heading.
			if (paraOpen && !quote && (!list || insideList) && isSetextUnderline(rest)) {
				paraOpen = false;
				continue;
			}
			if (insideList) {
				// The break belongs to the list item; the engine emits it below level 0.
				paraOpen = false;
				continue;
			}
			leaveContainers();
			paraOpen = false;
			out.push(i);
			continue;
		}

		// 9. A setext underline that is not also a break (`===`) closes the paragraph it heads.
		if (paraOpen && !quote && (!list || insideList) && isSetextUnderline(rest)) {
			paraOpen = false;
			continue;
		}

		// 10. An ATX heading is a one-line block: it opens no paragraph, so the line after it
		//     is a break rather than an underline (`# One` / `----` is an `hr`).
		if (/^#{1,6}(?:[ \t]|$)/.test(rest)) {
			paraOpen = false;
			leaveContainers();
			continue;
		}

		// 11. A blockquote. Its content sits behind the `>`, so a prefixed line is never a
		//     top-level break candidate; an unprefixed line that IS a break terminates the
		//     quote rather than continuing it (verified: `> A` / `---` is a top-level `hr`).
		if (rest[0] === '>') {
			if (!insideList) list = null;
			quote = true;
			inTable = false;
			paraOpen = rest.slice(1).trim() !== '';
			continue;
		}

		// 12. A list item.
		const contentIndent = listContentIndent(rest, sCount);
		if (contentIndent >= 0) {
			// Which content column is now in force. A marker indented INTO the open item's
			// content is a NESTED list, and the outer column still governs when a later line
			// leaves the structure. A marker BELOW that column is a sibling — or, when the
			// bullet style changes, a whole new list — and it replaces the column outright.
			//
			// Taking the smaller of the two instead looked equivalent and was not: `- item`
			// over `1. ordered` kept the bullet's column of 2 where the ordered list's is 3,
			// so a following `  ---` read as list content when the engine emits it as a
			// top-level break. One deck in 60,000 fuzzed, and a wrong slide boundary.
			if (!list || sCount < list.contentIndent) list = { contentIndent };
			quote = false;
			inTable = false;
			// The item's own content opens a paragraph unless it starts another block — and
			// whether a paragraph is open decides both the setext question and whether a `$$`
			// on the next line can open a math block.
			const after = rest.replace(/^(?:[-*+]|\d{1,9}[.)])[ \t]*/, '');
			paraOpen = after !== '' && !/^(?:#{1,6}[ \t]|>|`{3,}|~{3,})/.test(after) && !isThematicBreak(after);
			// A fence opening INSIDE a list item on the marker's own line hides everything up
			// to its closer, and tracking that means tracking the item's content column
			// through a nested block. Declined rather than guessed.
			if (/^(?:`{3,}|~{3,})/.test(after)) unsure('a code fence opened on a list item line');
			continue;
		}

		// 13. An HTML block.
		// A table body's terminator set is `getRules('blockquote')` — fence, blockquote, hr,
		// list, html_block, heading — and `html_block` answers it in silent mode with its
		// "can interrupt a paragraph" flag. So a type-7 block (`<br/>`, `</script>`) does NOT
		// end a table: it is a row. Opening a block there swallowed every following line to
		// end of input and lost three real boundaries.
		const htmlOpen = htmlBlockOpener(rest);
		if (htmlOpen && (htmlOpen.interrupts || !paraOpen) && !(inTable && !htmlOpen.interrupts)) {
			leaveContainers();
			paraOpen = false;
			// A marker-terminated block can close on its own opening line.
			if (htmlOpen.blankCloses) html = { end: null, blankCloses: true };
			else if (!htmlOpen.end.test(line)) html = { end: htmlOpen.end, blankCloses: false };
			continue;
		}
		// A `<`-led line that opens none of the seven block kinds is INLINE HTML in a paragraph,
		// and it falls through to the paragraph branch below. This used to raise `unsure`
		// instead, on the reasoning that a `<` line is where a hand-written scanner is least
		// certain — but the reasoning outlived its cause: all seven kinds are implemented above
		// against markdown-it's own patterns, so there is nothing left to be unsure about.
		// Measured, the blanket refusal cost four committed decks their fast path over a single
		// inline `<svg …>…</svg>` line, which is a paragraph to the engine and to this scan
		// alike. Declining what you can decide is not caution, it is a slower wrong answer.

		// 14. A LINK REFERENCE DEFINITION. It looks like paragraph text and is not one — and
		//     the difference decides the next line: `[ref]: /url` followed by `---` is a
		//     BREAK, because no paragraph is open for the `---` to underline. A scanner that
		//     reads the definition as prose reports a heading and loses the slide.
		//
		//     Only the complete same-line form is decided here. markdown-it also accepts the
		//     destination and the title split across following lines, and how many lines the
		//     definition eats is what decides whether the line after it is an underline — so
		//     the split form is declined rather than guessed.
		// `reference` is absent from the table's terminator set too, so a definition-shaped
		// line inside a table body is a row.
		if (!paraOpen && !inTable && rest[0] === '[') {
			const ref = /^\[(?:[^\]\\]|\\.)*\]:[ \t]*(.*)$/.exec(rest);
			if (ref) {
				// The destination may sit on the label's own line or on the very next one, and
				// a title may follow either. How many lines the definition eats is exactly what
				// decides whether the line after it is an underline or a break — measured:
				// `[ref]:` / `/url` / `---` is a BOUNDARY, while `[ref]:` / '' / `/url` / `---`
				// is a heading, because a blank line makes the definition fail and leaves an
				// ordinary paragraph for the `---` to underline.
				const isTitle = (s) => /^(?:"[^"]*"|'[^']*'|\([^)]*\))$/.test(s);
				let rem = ref[1].trim();
				let last = i; // the last line the definition consumes
				if (rem === '') {
					const next = i + 1 < lines.length ? stripIndent(lines[i + 1]).trim() : '';
					if (next === '' || opensTerminatingBlock(next)) {
						// No destination follows — either the line is blank or it opens a block
						// that stops the definition's line scan before it. Either way the
						// definition fails and the label is ordinary paragraph text.
						asParagraph();
						continue;
					}
					rem = next;
					last = i + 1;
				}
				const dest = /^(<[^<>\n]*>|\S+)(?:[ \t]+(.*))?$/.exec(rem);
				const trailing = (dest?.[2] ?? '').trim();
				if (!dest || (trailing && !isTitle(trailing))) {
					// A destination followed by something that is not a title invalidates the
					// WHOLE definition — markdown-it falls back to a paragraph rather than
					// keeping the part that parsed.
					asParagraph();
					continue;
				}
				if (!trailing && last + 1 < lines.length && isTitle(stripIndent(lines[last + 1]).trim())) last += 1;
				leaveContainers();
				paraOpen = false;
				i = last;
				continue;
			}
		}

		// 15. Another table row. A table body runs to a blank line or to a block that
		//     terminates it, and every such terminator is handled above — so reaching here
		//     with a table open means an ordinary row.
		if (inTable) continue;

		// 16. Anything the rules above did not claim is paragraph text.
		asParagraph();
	}

	// An unterminated fence or HTML block swallowed the rest of the deck. The engine sees
	// the same thing, so the boundary list is right — but it is the shape most likely to
	// mean the source is mid-edit, and a caller splicing slides into it should know.
	//
	// A `$$` opener is deliberately absent from this list: the math rule DECLINES when its
	// closer never arrives, so an unclosed math block masks nothing and the scan never ends
	// in math state. Asserting on it here would be a check that cannot fire.
	if (fence) unsure('a code fence that never closes');
	if (html) unsure('an HTML block that never closes');

	return { lines: out, certain, reason };
}

/**
 * `body` cut into per-slide chunks on its boundaries — `{ chunks, certain, reason }`.
 *
 * The chunk model is `splitOnHr`'s: the separator line belongs to neither
 * neighbor, an empty MIDDLE chunk is a real (empty) slide and is kept, and only
 * a leading empty chunk — a deck whose body opens with a separator — is dropped.
 * Callers that want the Studio's trimmed, empties-dropped list filter this; they
 * do not re-derive the boundaries.
 */
export function splitSlideChunks(body) {
	const { lines: seps, certain, reason } = slideBoundaries(body);
	const lines = normalizeSourceText(String(body ?? '')).split('\n');
	const chunks = [];
	let start = 0;
	for (const at of seps) {
		chunks.push(lines.slice(start, at).join('\n'));
		start = at + 1;
	}
	chunks.push(lines.slice(start).join('\n'));
	if (chunks.length > 1 && chunks[0].trim() === '') chunks.shift();
	return { chunks, certain, reason };
}

/**
 * The boundaries of `text` as CHARACTER ranges — `{ ranges, certain, reason }`,
 * each `{ index, length }` covering the separator line and the newline that ends
 * it, so `text.slice(prevEnd, index)` is a slide.
 *
 * For the editor, which locates a caret in a slide and a slide in the document
 * and so needs offsets rather than line numbers. `offset` shifts every range,
 * for a caller scanning a body it stripped front matter from but addressing the
 * full document.
 *
 * The offsets index the RAW string the caller passed, not the normalized one —
 * which is the whole difficulty. `slideBoundaries` counts NORMALIZED lines (it
 * folds `\r\n` and a lone `\r`, and drops a BOM), so a line number from it only
 * addresses the caller's text if the line geometry is measured the same way.
 *
 * An earlier cut measured it with `src.split('\n')`. That agrees on CRLF by
 * luck — the `\r` rides along on the end of its line, so the COUNT matches — and
 * it fails outright on a lone `\r`, where the whole document is one "line" and
 * every boundary index is out of range: the function did not return a wrong
 * offset, it THREW. A BOM shifted every offset on the first line by one. Both
 * were argued away in a comment saying the caller normalizes at its ingest door,
 * which is true of the editor today and is not a property of this function.
 */
export function separatorRanges(text, offset = 0) {
	const src = String(text ?? '');
	const { lines: seps, certain, reason } = slideBoundaries(src);
	const ranges = [];
	if (seps.length) {
		// Line starts in the RAW string, split on exactly the terminators markdown-it folds,
		// so line N here is line N there.
		const bom = src.charCodeAt(0) === 0xfeff ? 1 : 0;
		const starts = [bom];
		const TERMINATOR = /\r\n|\r|\n/g;
		TERMINATOR.lastIndex = bom;
		for (let m = TERMINATOR.exec(src); m; m = TERMINATOR.exec(src)) starts.push(m.index + m[0].length);
		for (const ln of seps) {
			const from = starts[ln];
			if (from === undefined) continue; // unreachable while the two agree; never throw if they don't
			// The range covers the separator line AND its terminator, so slicing between two
			// ranges yields a slide with no orphan newline at its head.
			ranges.push({ index: from + offset, length: (starts[ln + 1] ?? src.length) - from });
		}
	}
	return { ranges, certain, reason };
}
