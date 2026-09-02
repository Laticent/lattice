// Per-slide lens tags — the carrier of membership. A slide declares the lenses it belongs to in a
// single lowercase `<!-- _lens: … -->` HTML comment (mirroring the `_class` grammar authors know).
// Membership travels ON the slide, so reordering never corrupts it. Case is LOCKED to lowercase so a
// stray `_Lens` can't both leak into exported HTML and silently drop membership (design doc §7).

import type { LensBase, SlideTags } from './types';

// The comment structure is scanned with plain `indexOf` / character loops, NOT regex. A regex over an
// HTML comment (`<!--\s*_lens:([^>]*)-->`) has two unbounded quantifiers CodeQL models as polynomial
// (js/polynomial-redos), even when it is provably linear; string scanning sidesteps the query entirely
// and is genuinely O(n). The only regexes left in this file are trivial whitespace SPLIT delimiters.

/** The fence marker a line opens/closes with (e.g. "```"), or null — 3+ backticks/tildes after AT
 *  MOST THREE SPACES. Pure char scan, no regex.
 *
 *  The indent cap is CommonMark's and it is load-bearing: a line indented four spaces (or by a tab)
 *  is an INDENTED CODE BLOCK, so its backticks are literal text and open no fence. Accepting any
 *  leading whitespace made this module see a fence where markdown-it sees none, and everything
 *  downstream inherited the disagreement — a `_lens` directive after such a line was written off as
 *  "inside a fence" and its slide silently lost its membership. Caught by the differential fuzz in
 *  `test/unit/core/lens-tag-quoting.test.js`, which is the whole reason that fuzz exists; the
 *  engine's own `FENCE_OPEN` (lib/core/class-directive-scan.mjs) has always carried the cap. */
function fenceMarker(line: string): string | null {
	let i = 0;
	while (i < 3 && line[i] === ' ') i++;
	const ch = line[i];
	if (ch !== '`' && ch !== '~') return null;
	let j = i;
	while (j < line.length && line[j] === ch) j++;
	return j - i >= 3 ? line.slice(i, j) : null;
}

/** Char ranges [start, end) of fenced code blocks (``` or ~~~), so a `_lens`/`_class` example
 *  DOCUMENTED inside a fence is not mistaken for a real directive. Handles CRLF and an unterminated
 *  fence (runs to EOF). */
export function fenceRanges(src: string): Array<[number, number]> {
	const out: Array<[number, number]> = [];
	let offset = 0;
	let open = -1;
	let marker = '';
	for (const line of String(src ?? '').split('\n')) {
		const m = fenceMarker(line);
		if (open < 0) {
			if (m) { open = offset; marker = m; }
		} else if (m && m[0] === marker[0] && m.length >= marker.length && line.trim() === m) {
			out.push([open, offset + line.length]);
			open = -1;
		}
		offset += line.length + 1; // +1 for the consumed '\n'
	}
	if (open >= 0) out.push([open, String(src ?? '').length]);
	return out;
}

const inFence = (i: number, ranges: Array<[number, number]>) => ranges.some(([a, b]) => i >= a && i < b);

/**
 * Does the comment at `at` OPEN ITS LINE'S CONTENT — the only shape that can be a directive?
 *
 * THIS IS THE ENGINE'S RULE, NOT A NEW ONE. markdown-it opens an `html_block` for a comment only
 * when `<!--` begins the line (after at most three spaces, and after any container markers), and
 * the engine reads directives off that token. A comment starting mid-sentence is a `code_inline`
 * or `text` child, which is PROSE — so this is also, for free, the answer to "is it quoted?": a
 * backticked `` `<!-- _lens: ask -->` `` example never begins its line.
 *
 * The canonical statement lives in `lib/core/class-directive-scan.mjs` (`COMMENT_OPEN`), which
 * reached it by hitting the identical defect: a deck documenting its own syntax overrode its own
 * layout, because a raw text scan counted the quoted example as the last directive on the slide.
 * Lente cannot import that module — it is a zero-dependency package outside the engine's tree —
 * so the predicate is restated here and PINNED AGAINST IT by
 * `test/unit/core/lens-tag-quoting.test.js`. A restatement that nothing checks is how five correct
 * copies and one wrong one become indistinguishable by reading; that is what `lib/core/slide-rule.js`
 * exists to say, and the pin is this module's version of it.
 *
 * WHY NOT DETECT INLINE CODE DIRECTLY. That was tried, three times, and each attempt shipped a
 * defect worse than the one it closed — the last a hand-rolled backtick scanner that still diverged
 * from markdown-it on 179 of 40,000 fuzzed inputs. Answering "did this comment open its line?" needs
 * no parser, and it is the renderer's own condition rather than a new guess at one.
 *
 * IT IS NOT, HOWEVER, A FULL CONTAINER MODEL, AND THE DIFFERENCE IS MEASURED. Over a corpus that
 * varies the container PREFIX as well as the comment, this predicate and the engine's both disagree
 * with markdown-it: `>` or `-` followed by four spaces is an indented code block to the renderer and
 * a directive to us, an ordered marker other than `1.` cannot interrupt a paragraph, and a fence
 * opened inside a blockquote is invisible to `fenceRanges`. Each of those five shapes is enumerated
 * and ASSERTED in the pin, along with the fact that the engine gives the same answer — recorded as
 * #2034 rather than claimed absent.
 *
 * SO READ THE PIN'S SCOPE EXACTLY. It holds Lente to markdown-it over the QUOTING corpus (zero
 * divergences in 15,325 inputs) and to the engine on the enumerated shapes. It does NOT say the two
 * modules agree everywhere, and they do not — the engine is a per-slide `_class` resolver with
 * multi-line comment handling, and it declines a directive with trailing text on its line where this
 * module and markdown-it accept one. An earlier version of this docblock said "agrees with the
 * renderer by construction", which was the broader claim and was not true.
 *
 * NONE OF IT IS REACHABLE BY THE WRITE PATHS BELOW, which `editableDirective` guarantees rather than
 * assumes: a directive sharing its line with anything is READ and returned untouched.
 *
 * CONTAINER PREFIXES COUNT AS THE BEGINNING — markdown-it opens the `html_block` INSIDE the
 * container, so `> <!-- … -->` and `- <!-- … -->` are real directives. `[ ]{0,3}` and not `\s{0,3}`,
 * because a TAB-indented line is an indented code block, where a comment is not a directive.
 */
const COMMENT_OPEN = /^[ ]{0,3}(?:>[ \t]*|(?:[-*+]|\d{1,9}[.)])[ \t]+)*$/;

function opensItsLine(text: string, at: number): boolean {
	const lineStart = text.lastIndexOf('\n', at - 1) + 1;
	return COMMENT_OPEN.test(text.slice(lineStart, at));
}

/**
 * Is this directive SAFE TO EDIT — the whole of its line, and nothing else on it?
 *
 * A DIFFERENT QUESTION FROM `opensItsLine`, AND FIVE COMMITS IN A ROW ANSWERED IT BY GUESSING.
 * `opensItsLine` answers *is this a directive*, and it says yes to `- <!-- _lens: x -->` — correctly,
 * because markdown-it opens the `html_block` inside the list item. This answers *may I rewrite it*,
 * and the honest answer for anything sharing its line is NO. Each attempt to find a cleverer answer
 * shipped a worse defect than the one it closed, every one of them past every gate in the repo:
 *
 *   eat the newline unconditionally    "- <!-- _lens: x -->\n```\nfoo\n---\n```"
 *                                   -> "- ```\nfoo\n---\n```"        the fence never opens; one
 *                                      authored slide renders as two, and a reader on one view is
 *                                      shown another view's slide.
 *   keep the newline, drop the text    "Prose\n- <!-- _lens: x -->\n  more"
 *                                   -> "Prose\n- \n  more"            a bare `-` is a SETEXT H2
 *                                      UNDERLINE: the author's paragraph becomes a heading, and the
 *                                      slide gains a page the CLI does not count.
 *   ditto, inside a tight list         "- a\n  <!-- _lens: x -->\n  b"
 *                                   -> "- a\n  \n  b"                 a whitespace-only line is a
 *                                      CommonMark BLANK line: the list goes tight -> loose and every
 *                                      item in it gains a paragraph wrapper.
 *   drop the text but not the line     "> ```md\n> <!-- _lens: x -->\n> ```"
 *                                   -> "> ```md\n> \n> ```"           `fenceRanges` cannot see a
 *                                      fence opened behind a container marker, so a slide teaching
 *                                      the syntax ships with the syntax deleted.
 *
 * There is no string splice that is safe on all of them, because the residue of a partial line is
 * itself markdown. So this predicate is the bound: an edit touches a directive only when the whole
 * of its line, trimmed, IS that directive. Everything else is read and returned untouched.
 *
 * AND THE BOUND IS NOT THE SAFETY ARGUMENT — that was the sixth mistake. Deleting a whole line is
 * itself a structural edit: between two paragraphs it merges them, above a `===` it turns the
 * paragraph before it into a heading, between two lists it welds them into one. A rule cannot know;
 * only the parser knows. So this predicate is a cheap first filter, and `lib/core/lens-export.mjs`
 * decides: it re-parses the slide with the engine's own markdown-it, keeps the prune only if the
 * block structure is unchanged, and refuses the export if a withheld id survives in a directive the
 * RENDERER can see. Two checks against the real parser, in the one place a parser is available.
 *
 * WHAT IS STILL ONLY BOUNDED, NOT CHECKED: a direct Lente caller with no parser — the Studio. There
 * the predicate is the whole protection, and the cases above are the ones it is measured against.
 */
function editableDirective(text: string, span: { start: number; end: number } | null): { start: number; end: number } | null {
	if (!span) return null;
	const lineStart = text.lastIndexOf('\n', span.start - 1) + 1;
	let lineEnd = text.indexOf('\n', span.end);
	if (lineEnd < 0) lineEnd = text.length;
	// THE WHOLE LINE, TRIMMED, IS THE DIRECTIVE. Indentation and trailing spaces are part of the
	// line and go with it, so they are not a reason to refuse — an earlier version demanded the
	// comment sit at exactly column 0 and end at exactly the newline, which refused an entire export
	// over one invisible trailing space and told the author to put the tag on a line of its own,
	// which is where they had already put it.
	if (text.slice(lineStart, span.start).trim() !== '' || text.slice(span.end, lineEnd).trim() !== '') return null;
	// RETURNS THE LINE, NOT THE COMMENT, and that distinction is a bug this caught on its way in:
	// checking that the prefix is blank and then cutting from the COMMENT leaves the indent behind
	// and splices the next line onto it — `"- a\n  <!-- … -->\n  b"` became `"- a\n    b"`, four
	// columns, which is an indented code block. The caller removes exactly what was measured.
	return { start: lineStart, end: lineEnd };
}

/** True if `s` is empty or all ASCII whitespace (a char scan, so no `\s`-quantified regex touches
 *  library input). */
function isBlank(s: string): boolean {
	for (const c of s) if (c !== ' ' && c !== '\t' && c !== '\n' && c !== '\r') return false;
	return true;
}

/** Find the first `<!-- _<key>: … -->` HTML comment OUTSIDE any fenced code block, by plain string
 *  scanning. Only whitespace may precede the marker inside the comment. Returns the comment's span and
 *  its `body` (text between the marker and `-->`), or null. */
export function findDirectiveComment(
	src: string,
	key: 'lens' | 'class',
	ranges?: Array<[number, number]>,
): { start: number; end: number; body: string } | null {
	const text = String(src ?? '');
	const fences = ranges ?? fenceRanges(text);
	const marker = `_${key}:`;
	let i = 0;
	for (;;) {
		const open = text.indexOf('<!--', i);
		if (open < 0) return null;
		const close = text.indexOf('-->', open + 4);
		if (close < 0) return null;
		i = close + 3;
		// A documented example is not a directive — whether it is fenced, or quoted inline, or
		// simply written mid-sentence. Both tests are the renderer's own.
		if (inFence(open, fences) || !opensItsLine(text, open)) continue;
		const inner = text.slice(open + 4, close); // between `<!--` and `-->`
		const k = inner.indexOf(marker);
		if (k >= 0 && isBlank(inner.slice(0, k))) return { start: open, end: close + 3, body: inner.slice(k + marker.length) };
	}
}

/** Every non-fenced `<!-- _<key>: … -->` body in document order. */
export function allDirectiveBodies(src: string, key: 'lens' | 'class'): string[] {
	const text = String(src ?? '');
	const fences = fenceRanges(text);
	const marker = `_${key}:`;
	const out: string[] = [];
	let i = 0;
	for (;;) {
		const open = text.indexOf('<!--', i);
		if (open < 0) break;
		const close = text.indexOf('-->', open + 4);
		if (close < 0) break;
		i = close + 3;
		if (inFence(open, fences) || !opensItsLine(text, open)) continue;
		const inner = text.slice(open + 4, close);
		const k = inner.indexOf(marker);
		if (k >= 0 && isBlank(inner.slice(0, k))) out.push(inner.slice(k + marker.length));
	}
	return out;
}

/** Parse the include/exclude tokens off a slide's first non-fenced `_lens` comment. `id`/`+id`
 *  include; `-id` exclude. A `_lens` shown inside a code fence (documentation) is ignored. */
export function parseSlideTags(slideSrc: string): SlideTags {
	const include = new Set<string>();
	const exclude = new Set<string>();
	const found = findDirectiveComment(slideSrc, 'lens');
	if (found) {
		for (const tok of found.body.split(/\s+/).filter(Boolean)) {
			if (tok.startsWith('-')) exclude.add(tok.slice(1));
			else if (tok.startsWith('+')) include.add(tok.slice(1));
			else include.add(tok);
		}
	}
	return { include, exclude };
}

/** The set of lens ids the deck has AUTHORED a membership tag for — any include (`+id`) or exclude
 *  (`-id`) token across all slides. This is "the author has ACTED on this view," which is distinct from
 *  a view merely HAVING members (a `base:all` view has every slide as a member with no tags at all). The
 *  Studio uses it to MATERIALIZE an inherited view once the author tags into it — so that in-progress
 *  membership survives the workspace default-views setting being turned off — and to clear its "Starter"
 *  badge once it's been worked on. */
export function taggedLensIds(slides: string[]): Set<string> {
	const ids = new Set<string>();
	for (const s of slides) {
		const { include, exclude } = parseSlideTags(s);
		for (const id of include) ids.add(id);
		for (const id of exclude) ids.add(id);
	}
	return ids;
}

/**
 * Remove every `_lens` directive on a slide EXCEPT the first — returning the slide unchanged when
 * there is at most one, which is every slide Lente itself wrote.
 *
 * `parseSlideTags` and `writeTags` both stop at the first, by design: one slide has one membership,
 * and a second tag has no defined meaning. The consequence is that a second tag is READ by nothing
 * and REWRITTEN by nothing — so an export pruning a deck's tags down to the views it carries could
 * not see it, and a withheld view's id rode into the artifact verbatim.
 *
 * THIS IS SAFE ONLY BECAUSE THE PREDICATE IS SHARED. An earlier version of this function decided
 * "is that comment quoted?" its own way, and the sweep and the reader then disagreed about which
 * comment was the slide's tag — which was worse than the leak it closed: the real tag's withheld
 * token went unpruned. Everything here goes through `findDirectiveComment`, so the comment this
 * KEEPS is by construction the comment `parseSlideTags` READS, and the ones it removes are the ones
 * nothing has ever read. A quoted or mid-sentence example is not a directive to either of them.
 *
 * IT REMOVES ONLY A DIRECTIVE THAT IS THE WHOLE OF ITS LINE, and that bound is what makes DELETING
 * safe rather than merely READING safe. `fenceRanges` finds a fence by scanning for ``` at the start
 * of a line, so it cannot see one opened inside a container: in
 *
 *     > ```markdown
 *     > <!-- _lens: secret -->
 *     > ```
 *
 * markdown-it emits no `html_block` at all, this module sees a directive, and an unbounded sweep
 * DELETED the author's documented example — measured, through the real CLI, on a slide whose whole
 * job is teaching the syntax. The bound costs the sweep every duplicate that shares its line: behind
 * a container marker, indented under a list item, or written second on the same line. Lente never
 * writes one of those and no deck in this repo has one, and the blindness underneath is older than
 * this module and shared verbatim with `lib/core/class-directive-scan.mjs` (#2034). What makes the
 * cost safe rather than a leak is that `lib/core/lens-export.mjs` VERIFIES the prune instead of
 * trusting it — a withheld id surviving in the emitted source refuses the export.
 */
export function stripExtraLensTags(slideSrc: string): string {
	let src = String(slideSrc ?? '');
	const first = findDirectiveComment(src, 'lens');
	if (!first) return src;
	// Walk forward from the end of the first tag, removing each subsequent one. The tail is
	// re-scanned each time so fence ranges stay honest as the string shrinks.
	let cursor = first.end;
	for (;;) {
		const tail = src.slice(cursor);
		const next = findDirectiveComment(tail, 'lens');
		if (!next) return src;
		const start = cursor + next.start;
		const end = cursor + next.end;
		// Anything sharing its line is left exactly as the author typed it — see `editableDirective`.
		// The residue of a partial line is itself markdown, and four different splices each corrupted
		// a real deck.
		const line = editableDirective(src, { start, end });
		if (!line) {
			cursor = end;
			continue;
		}
		const cut = src[line.end] === '\n' ? line.end + 1 : line.end;
		src = src.slice(0, line.start) + src.slice(cut);
		cursor = line.start;
	}
}

/** Render the two token sets to the shortest canonical, deterministically-ordered token string.
 *  Includes first (sorted), then `-`excludes (sorted). Empty => ''. */
function emitTokens(tags: SlideTags): string {
	const inc = [...tags.include].sort();
	const exc = [...tags.exclude].sort().map((id) => `-${id}`);
	return [...inc, ...exc].join(' ');
}

/** Write the `<!-- _lens: … -->` comment for a slide from its token sets. Replaces the slide's first
 *  NON-fenced `_lens` comment (a fenced example is left untouched); removes it when empty; inserts a
 *  new one right after the `_class` comment (or at the top) when none exists. */
function writeTags(slideSrc: string, tags: SlideTags): string {
	const src = String(slideSrc ?? '');
	const tokens = emitTokens(tags);
	const comment = `<!-- _lens: ${tokens} -->`;
	const existing = findDirectiveComment(src, 'lens');
	if (existing) {
		// A DIRECTIVE SHARING ITS LINE IS READ AND RETURNED UNTOUCHED — replace as well as remove.
		// Removing it corrupts the line's residue (`editableDirective` has the four measured shapes);
		// replacing it edits an author's text just as surely, because the shape that hides from
		// `fenceRanges` is a documented EXAMPLE inside a blockquoted fence, and rewriting its tokens
		// ships a slide teaching the syntax with the syntax altered.
		const line = editableDirective(src, existing);
		if (!line) return src;
		// Replacing swaps the comment in place and leaves the line's whitespace alone; removing takes
		// the WHOLE line, indent and trailing spaces included, because a half-removed line is the
		// residue every earlier attempt tripped over.
		if (tokens) return src.slice(0, existing.start) + comment + src.slice(existing.end);
		const cut = src[line.end] === '\n' ? line.end + 1 : line.end;
		return src.slice(0, line.start) + src.slice(cut);
	}
	if (!tokens) return src;
	const cls = findDirectiveComment(src, 'class');
	if (cls) return `${src.slice(0, cls.end)}\n${comment}${src.slice(cls.end)}`;
	return `${comment}\n${src}`;
}

/** Set (or clear) this slide's membership in one lens, emitting the SHORTEST correct tag for the
 *  lens's base: a `base:none` lens carries an include token only when a member; a `base:all` lens
 *  carries a `-id` exclude token only when NOT a member. Pure — returns new slide source. */
export function applyTag(slideSrc: string, lensId: string, member: boolean, base: LensBase): string {
	const tags = parseSlideTags(slideSrc);
	if (base === 'all') {
		tags.include.delete(lensId); // a base:all lens never uses an include token
		if (member) tags.exclude.delete(lensId);
		else tags.exclude.add(lensId);
	} else {
		tags.exclude.delete(lensId); // a base:none lens never uses an exclude token
		if (member) tags.include.add(lensId);
		else tags.include.delete(lensId);
	}
	return writeTags(slideSrc, tags);
}
