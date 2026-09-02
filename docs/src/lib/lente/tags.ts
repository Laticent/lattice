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
 * no parser and agrees with the renderer by construction, because it IS the renderer's condition.
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
		let end = cursor + next.end;
		if (src[end] === '\n') end += 1; // a directive owns its line, so the newline goes with it
		src = src.slice(0, start) + src.slice(end);
		cursor = start;
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
		let end = existing.end;
		// Removing the tag takes its line's newline with it, unconditionally — because a directive
		// OPENS ITS LINE by definition now (`opensItsLine`, above `findDirectiveComment`), so there
		// is no line content in front of it to splice onto.
		//
		// That was not always true, and the failure is worth keeping written down. While a comment
		// starting mid-sentence still counted as a directive, this line ate the author's break after
		// an INLINE tag: on prose it merged two paragraphs, and on a line followed by a ``` fence it
		// spliced the fence opener into the prose — the fence never opened, its closer became an
		// opener, a `---` inside the code became a setext underline, one authored slide rendered as
		// two, and a reader on one view was shown another view's slide. Adopting the renderer's own
		// rule for what a directive IS removed the shape entirely, rather than guarding against it.
		if (!tokens && src[end] === '\n') end += 1;
		return src.slice(0, existing.start) + (tokens ? comment : '') + src.slice(end);
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
