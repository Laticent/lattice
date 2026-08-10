/**
 * lib/core/slide-boundaries.mjs
 *
 * THE ONE derivation of a deck's slide boundaries — "which lines are top-level
 * `hr`, and so where does a slide begin?" — answered by the engine's own parser
 * rather than by anything that imitates it.
 *
 * WHY THIS EXISTS. The engine splits slides on every top-level markdown-it `hr`
 * token (`lib/engine/slides.js splitOnHr`). Every caller-side splitter in the
 * tree derived that set independently, from a regex over `---`, and each one
 * derived it DIFFERENTLY. Measured against the real parser (`***`, `___`,
 * `- - -`, `--- ` with a trailing space, `----`, and a `---` indented one to
 * three spaces are all `hr` to the engine, while `Interlude` over `---` is a
 * setext HEADING and no boundary at all):
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
 *
 * WHY IT CALLS THE PARSER, WHICH IS THE SECOND ANSWER TO THIS QUESTION. The
 * first cut of this module was a hand-written line scanner that reproduced
 * markdown-it's `hr` rule without parsing, on the theory that the caller needs
 * an answer on every keystroke and a parse is too expensive. The adversarial
 * trio took it apart, and the record is worth keeping because the failure was
 * structural rather than sloppy:
 *
 *   - It shipped SIX confirmed wrong answers while reporting `certain: true` —
 *     an empty list item that cannot interrupt a paragraph, an ordered list not
 *     starting at 1, a table whose delimiter row miscounts its columns, an
 *     empty `[]:` reference label, a tab straight after a list marker, and a
 *     leading-separator chunk-model desync. One of them destroyed a slide under
 *     `{ok: true}` — the exact defect this module was written to end.
 *   - Its differential test could not have found them. The fuzz's atom list was
 *     the author's intuition about deck shapes, not CommonMark's rule surface;
 *     adding three strings turned "720,000 decks, zero disagreements" into a
 *     defect every ~220 decks.
 *   - The measurement that justified the design was of the wrong thing — a bare
 *     `/^-{3,}$/` loop rather than the scanner — and was 6x optimistic.
 *
 * Re-measured honestly, `md.block.parse` costs **+0.016ms on the median
 * committed deck and +0.54ms on the largest deck in the tree**, against a
 * typing budget of roughly 8ms. That is the whole price, and it buys exactness
 * BY CONSTRUCTION: this cannot disagree with the engine about a boundary,
 * because it is asking the engine's own parser. There is no rule to keep in
 * sync, no `certain` flag to get wrong, and no class of shapes left for a
 * future fuzz to discover. See
 * engineering/decisions/2026-08-05-slide-boundary-reconciliation.md.
 *
 * BLOCK PARSE, NOT FULL PARSE. `md.block.parse` yields the identical top-level
 * `hr` set (asserted in the test) at about half the cost, because slide
 * boundaries are a block-level property and inline parsing cannot move one.
 */

import { boundaryParser as md, normalizeSource } from './boundary-parser.mjs';

/**
 * The engine's door normalization, re-exported from the parser module so there
 * is one spelling of it rather than a copy that agrees today.
 *
 * U+2028 / U+2029 are DELIBERATELY NOT line terminators, because they are not
 * line terminators to markdown-it either. JavaScript's `^`/`$` under the `m`
 * flag disagree — they break on U+2028 — which is how `source.split(/^---$/m)`
 * came to see a slide boundary in `the plan<U+2028>---<U+2028>v2 draft` where
 * the engine renders one continuous line. Nothing normalizes those two
 * characters at the ingest doors (`docs/src/lib/normalize-source-text.ts` folds
 * CRLF and BOM only), so a pasted or imported deck carries them through;
 * deriving from the parser rather than from a multiline regex is what makes
 * them harmless.
 *
 * @param {string} text
 * @returns {string}
 */
export function normalizeSourceText(text) {
	return normalizeSource(typeof text === 'string' ? text : '');
}

/**
 * Leading YAML front matter, or '' — the region no slide splitter may look inside.
 *
 * @param {string} src
 * @returns {string}
 */
export function frontMatterBlockOf(src) {
	return (/^---(?:\r\n|\r|\n)[\s\S]*?(?:\r\n|\r|\n)---[ \t]*(?:\r\n|\r|\n)?/.exec(String(src ?? '')) || [''])[0];
}

/**
 * A SMALL LRU MEMO on the parse, because the editor asks this question several
 * times per keystroke.
 *
 * `lint.ts` alone reaches a boundary derivation from `splitSlides`, from
 * `slideRanges` (via both `slideIndexAt` and `slideStartOffset`) and from the
 * rail's memo, and `StudioShell` runs another. Without this, one keystroke pays
 * for several parses of the same string; with it, one.
 *
 * WHY IT IS NO LONGER SINGLE-ENTRY — and READ THE SECOND PARAGRAPH, because the
 * first justification written here was WRONG and an independent check refuted it.
 *
 * One keystroke asks about several NEARLY-identical strings, distinct for reasons
 * that are each deliberate: the editor asks about `source`, while the preview asks
 * about `editorSample`, which `StudioShell` REBUILDS from trimmed chunks
 * (`StudioShell.tsx` — `previewFm + viewSlides.join(SLIDE_SEP)`), so the two differ
 * by whitespace and can never share an entry.
 *
 * THE CLAIM THIS COMMENT USED TO MAKE: that a single entry therefore thrashed on
 * TYPING, paying 3 parses where 2 were distinct. That is false on the real path,
 * and it was false for a reason worth keeping — it assumed the editor and the
 * preview ask about the SAME string, which the paragraph directly above says they
 * never do. Counted by wrapping `boundaryParser.block.parse` and replaying the real
 * caller order on the perf spec's 40-slide gallery deck, the typing working set is
 * THREE distinct strings, and typing costs three parses with a single entry and
 * three with this LRU. On typing, this buys nothing.
 *
 * WHAT IT ACTUALLY BUYS is NAVIGATION, where the deck string does not change at
 * all: 5 parses per interaction with a single entry, 0 with this. (Plus one on a
 * keystroke that coincides with the debounced lint pass, 4 → 3.) Navigation is the
 * interaction a memo can help by construction and typing is the one it cannot —
 * the same asymmetry the whole-deck render memo has in
 * `docs/src/lib/single-slide-render.ts`, and the same one #1273 turned on.
 *
 * BOUNDED, which was the single entry's real virtue and is kept: an LRU of
 * MEMO_MAX, evicting oldest-first, so an unbounded map keyed on every
 * intermediate document state is still not what this is. Same boundedness
 * property as the whole-deck render memo in `docs/src/lib/single-slide-render.ts`.
 *
 * KEYED ON THE STRING, NOT A HASH, and that is a correctness choice rather than
 * an oversight. Hashing would shrink an entry from ~40KB to a few hundred bytes,
 * but a collision here does not degrade a cache — it returns another deck's
 * slide boundaries, which is a wrong slide and a wrong page number. The whole
 * point of deriving boundaries from the engine's own parser (#1433) is that the
 * answer cannot be wrong; a probabilistic key would hand that back. MEMO_MAX
 * bounds the memory instead: up to MEMO_MAX whole deck sources are retained
 * (~40KB each on a 40-slide deck, ~117KB on the 117-slide gallery), against one
 * before. That ceiling is the price of the navigation win above.
 *
 * WHY SIX. Measured, not picked: the typing working set is THREE distinct strings
 * (editor body, preview `editorSample` body, and — before the divider derivation
 * was fixed to chunk raw — its code-blanked copy). The largest configuration I
 * could enumerate across every `<DeckPreview>` call site is FIVE: Present with a
 * reader lens open beside a live editor preview. Six is that worst case plus one.
 * An earlier cut said four, which was the measured working set plus one and left
 * no room for the configuration above. Both the floor and the eviction ORDER are
 * pinned in `test/unit/core/slide-boundaries.test.js` — a bare size constant with
 * no test is how this drifts back to thrashing silently.
 */
const MEMO_MAX = 6;
/** @type {Map<string, {lines: number[], leadingEmpty: boolean}>} insertion-ordered LRU */
const memo = new Map();
/** Memo MISSES — i.e. real `md.block.parse` calls. Read by the counting test below. */
let parses = 0;

/**
 * Where slide boundaries fall in `body` — `{ lines }`, 0-based indices into
 * `normalizeSourceText(body).split('\n')`, which is the SAME line numbering
 * markdown-it's `token.map[0]` uses.
 *
 * `body` is the deck BODY: front matter already stripped. That is not a
 * convenience, it is a correctness requirement — front matter's own closing
 * `---` is a thematic break to any parser that sees it, and its opening `---`
 * turns the first key into a setext heading. Every caller strips it first
 * (`frontMatterBlockOf` above); the engine strips it before parsing too.
 *
 * NO `certain` FLAG, and its absence is the point. The scanner this replaced
 * carried one because a hand-written rule set can meet a shape it cannot
 * settle; a parse cannot. An unclosed fence, a half-typed HTML block, a deck
 * caught mid-keystroke — each parses here exactly as the engine parses it, so
 * the boundaries are right rather than merely admitted-to-be-doubtful. The two
 * callers that used to fail closed on that flag (`positionIsTrustworthy` and
 * `applyEditChecked`) no longer need to.
 *
 * @param {string} body
 * @returns {{lines: number[], leadingEmpty: boolean}}
 */
export function slideBoundaries(body) {
	const text = normalizeSourceText(String(body ?? ''));
	const hit = memo.get(text);
	if (hit) {
		memo.delete(text); // re-insert so recency is the eviction order
		memo.set(text, hit);
		return hit;
	}
	parses += 1;
	const tokens = [];
	md.block.parse(text, md, {}, tokens);
	const lines = [];
	for (const t of tokens) if (t.type === 'hr' && t.level === 0 && Array.isArray(t.map)) lines.push(t.map[0]);
	// `splitOnHr` drops its first group when that group holds NO TOKENS — which is not the
	// same as "no source text", and the difference is load-bearing. A link reference
	// definition is real source that produces zero tokens, so `[a]: /url` over a separator
	// renders ONE section from two chunks of text. Reading it off the token stream is exact;
	// a `chunk.trim() === ''` test on the text is not, and got this case wrong.
	const leadingEmpty = tokens.length > 0 && tokens[0].type === 'hr' && tokens[0].level === 0;
	const out = { lines, leadingEmpty };
	memo.set(text, out);
	if (memo.size > MEMO_MAX) memo.delete(memo.keys().next().value);
	return out;
}

/**
 * How many times the parse has actually RUN (memo misses), and a reset.
 *
 * Exported so the cost this memo exists to remove is COUNTABLE rather than only
 * timeable. A whole-deck parse per keystroke is an amount of WORK; counting it is
 * deterministic and machine-independent where a wall-clock assertion on the same
 * fact would be the flaky gate `test/benchmark/preview-budget.json` argues against.
 * Nothing in the shipped app reads these — they exist for
 * `test/unit/core/slide-boundaries.test.js`.
 */
export function boundaryParseCount() {
	return parses;
}
/** Reset the counter AND drop the memo, so a test can measure a cold keystroke. */
export function resetBoundaryMemo() {
	memo.clear();
	parses = 0;
}

/**
 * `body` cut into per-slide chunks — `{ chunks }`.
 *
 * The chunk model is `splitOnHr`'s: the separator line belongs to neither
 * neighbor, and an empty MIDDLE or trailing chunk is a real (empty) rendered
 * slide, so it is kept.
 *
 * A LEADING EMPTY CHUNK IS DROPPED, exactly as `splitOnHr` drops its leading
 * empty group — so chunk `i` is section `i` and every downstream index means
 * what the render means by it. `dropLeadingEmpty` is exported beside this for
 * the ONE other place that has to know the rule: a caller walking LINES rather
 * than chunks. The first cut had the drop here and not there, the two index
 * spaces in the same file went off by one, and an `applyEditChecked` replace on
 * a deck whose body opens with a separator INSERTED instead of replacing —
 * duplicating slide one and rendering three sections where the deck had two, a
 * regression against `main` found by the red team. One rule, exported once, is
 * what stops that recurring.
 *
 * @param {string} body
 * @returns {{chunks: string[]}}
 */
export function splitSlideChunks(body) {
	const text = normalizeSourceText(String(body ?? ''));
	const { lines: seps } = slideBoundaries(text);
	const lines = text.split('\n');
	const chunks = [];
	let start = 0;
	for (const at of seps) {
		chunks.push(lines.slice(start, at).join('\n'));
		start = at + 1;
	}
	chunks.push(lines.slice(start).join('\n'));
	return { chunks: dropLeadingEmpty(chunks, slideBoundaries(text).leadingEmpty) };
}

/**
 * `splitOnHr`'s leading-group rule, as a function, because two different index
 * spaces need to apply it and a copy is how they drift apart.
 *
 * The engine (`lib/engine/slides.js`) drops its first group when that group
 * holds no tokens — a body that opens with a separator renders N sections from
 * N+1 chunks, and a caller that keeps the chunk numbers every later slide one
 * too high. `leadingEmpty` comes from `slideBoundaries`, which reads it off the
 * token stream; pass it rather than re-deriving it from the text, because
 * "produces no tokens" and "is blank" are different questions and a link
 * reference definition answers them differently.
 *
 * @param {string[]} chunks
 * @param {boolean} leadingEmpty
 * @returns {string[]}
 */
export function dropLeadingEmpty(chunks, leadingEmpty) {
	return chunks.length > 1 && leadingEmpty ? chunks.slice(1) : chunks;
}

/**
 * The 0-based line numbers that cut a FULL deck source — front matter and all —
 * into the chunk list `splitTopLevel` (`lib/authoring/slide-split.js`) produces.
 *
 * A third index space over the same derivation, and it exists because three
 * different consumers had each built their own and no two agreed:
 * `splitTopLevel` cut TEXT, `separatorLines` walked LINES, and
 * `class-directive-scan.mjs` walked lines again with its own `/^---$/` — so the
 * class resolved for chunk `i` and the text of chunk `i` could come from
 * different slides. Every consumer pairs those arrays POSITIONALLY, so a
 * one-off there checks each slide against its NEIGHBOR's contract.
 *
 * Front matter's OWN two `---` lines are included. Nothing renders between
 * them, so they are not slide boundaries — but they are what produces the
 * leading `['', yaml]` chunks every authoring core's `idx - fmChunks + 1` slide
 * numbering is written against. Below them, `slideBoundaries` answers, having
 * never seen the front matter: a YAML block's closing `---` is a thematic break
 * to any parser that reads it and its opening `---` makes the first key a setext
 * heading.
 *
 * @param {string} source
 * @returns {number[]}
 */
export function chunkBoundaryLines(source) {
	const text = normalizeSourceText(String(source ?? ''));
	const fm = frontMatterBlockOf(text);
	const out = [];
	let skip = 0;
	if (fm) {
		skip = fm.replace(/\n$/, '').split('\n').length;
		out.push(0, skip - 1);
	}
	const { lines: seps, leadingEmpty } = slideBoundaries(text.slice(fm.length));
	// The SAME leading-empty rule `splitSlideChunks` applies, read off the token
	// stream rather than re-derived from the text — `dropLeadingEmpty`'s comment
	// says why the two questions differ. Dropping the first separator LINE is the
	// line-space spelling of dropping the first CHUNK: it merges the empty leading
	// group into the slide that follows it, exactly as the render does.
	for (let i = leadingEmpty ? 1 : 0; i < seps.length; i++) out.push(seps[i] + skip);
	return out;
}

/**
 * The boundaries of `text` as CHARACTER ranges — `{ ranges }`, each
 * `{ index, length }` covering the separator line and the terminator that ends
 * it, so slicing between two ranges yields a slide with no orphan newline.
 *
 * For the editor, which locates a caret in a slide and a slide in the document
 * and so needs offsets rather than line numbers. `offset` shifts every range,
 * for a caller scanning a body it stripped front matter from but addressing the
 * full document.
 *
 * The offsets index the RAW string the caller passed, not the normalized one —
 * which is the whole difficulty. The derivation counts NORMALIZED lines (it
 * folds `\r\n` and a lone `\r`, and drops a BOM), so a line number from it only
 * addresses the caller's text if the line geometry is measured the same way. An
 * earlier cut measured it with `src.split('\n')`: that agrees on CRLF by luck —
 * the `\r` rides along on the end of its line, so the COUNT matches — and fails
 * outright on a lone `\r`, where the whole document is one "line" and every
 * boundary index is out of range. It did not return a wrong offset, it THREW.
 *
 * @param {string} text
 * @param {number} [offset]
 * @returns {{ranges: {index: number, length: number}[]}}
 */
export function separatorRanges(text, offset = 0) {
	const src = String(text ?? '');
	const { lines: seps } = slideBoundaries(src);
	const ranges = [];
	if (seps.length) {
		// Line starts in the RAW string, split on exactly the terminators markdown-it folds,
		// so line N here is line N there.
		const bom = src.charCodeAt(0) === 0xfeff ? 1 : 0;
		const starts = [bom];
		const TERMINATOR = /\r\n|\r|\n/g;
		TERMINATOR.lastIndex = bom;
		for (let m = TERMINATOR.exec(src); m; m = TERMINATOR.exec(src)) starts.push(m.index + m[0].length);
		// No `from === undefined` guard. It used to sit here as belt-and-braces, and it was a
		// check that could not fire — the exact thing this file's other comments criticize.
		// `starts` is built from the same terminator set the derivation counts lines with, so
		// it has an entry for every line the parser can name.
		for (const ln of seps) ranges.push({ index: starts[ln] + offset, length: (starts[ln + 1] ?? src.length) - starts[ln] });
	}
	return { ranges };
}
