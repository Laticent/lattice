// Per-slide lens tags — the carrier of membership. A slide declares the lenses it belongs to in a
// single lowercase `<!-- _lens: … -->` HTML comment (mirroring the `_class` grammar authors know).
// Membership travels ON the slide, so reordering never corrupts it. Case is LOCKED to lowercase so a
// stray `_Lens` can't both leak into exported HTML and silently drop membership (design doc §7).

import type { LensBase, SlideTags } from './types';

// The comment structure is scanned with plain `indexOf` / character loops, NOT regex. A regex over an
// HTML comment (`<!--\s*_lens:([^>]*)-->`) has two unbounded quantifiers CodeQL models as polynomial
// (js/polynomial-redos), even when it is provably linear; string scanning sidesteps the query entirely
// and is genuinely O(n). The only regexes left in this file are trivial whitespace SPLIT delimiters.

/** The fence marker a line opens/closes with (e.g. "```"), or null — 3+ backticks/tildes after only
 *  leading whitespace. Pure char scan, no regex. */
function fenceMarker(line: string): string | null {
	let i = 0;
	while (i < line.length && (line[i] === ' ' || line[i] === '\t')) i++;
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

/** Char ranges [start, end) of INLINE code spans (`` `…` ``), so a `_lens` example written in
 *  backticks on a slide is not mistaken for a real directive — and, more sharply, is not EDITED
 *  as one.
 *
 *  `fenceRanges` covers the block form and this covers the inline one; the two are the same rule
 *  applied to the two ways an author quotes code. The gap between them shipped a defect: a slide
 *  reading ``Write `<!-- _lens: ask -->` at the top`` had the example deleted by
 *  `stripExtraLensTags`, leaving two bare backticks and a sentence that no longer parses. Inline
 *  code is a RENDERED surface here — HARD RULE #29 already says so in its own scope note ("a
 *  backticked eyebrow is set on the slide") — so a deck that teaches reader views is exactly the
 *  deck a projection would corrupt.
 *
 *  CommonMark's rule, and no more: a run of N backticks opens a span, and the next run of exactly
 *  N closes it. A run with no matching partner is literal text, so it opens nothing. Backticks
 *  inside a fence are skipped, since the fence already owns them. Char scan, no regex — the same
 *  reason `fenceRanges` is one (js/polynomial-redos). */
export function inlineCodeRanges(src: string, fences?: Array<[number, number]>): Array<[number, number]> {
	const text = String(src ?? '');
	const blocks = fences ?? fenceRanges(text);
	const out: Array<[number, number]> = [];
	let i = 0;
	while (i < text.length) {
		if (text[i] !== '`' || inFence(i, blocks)) { i++; continue; }
		let j = i;
		while (j < text.length && text[j] === '`') j++;
		const n = j - i;
		let k = j;
		let closed = false;
		while (k < text.length) {
			if (text[k] !== '`' || inFence(k, blocks)) { k++; continue; }
			let m = k;
			while (m < text.length && text[m] === '`') m++;
			if (m - k === n) { out.push([i, m]); i = m; closed = true; break; }
			k = m;
		}
		if (!closed) i = j; // an unmatched run is literal text, not an opener
	}
	return out;
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
		if (inFence(open, fences)) continue; // documented example, not a real directive
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
		if (inFence(open, fences)) continue;
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
 * Remove every non-fenced `_lens` comment on a slide EXCEPT the first — returning the slide
 * unchanged when there is at most one, which is every slide Lente itself wrote.
 *
 * `parseSlideTags` and `writeTags` both stop at the first comment, by design: one slide has one
 * membership, and a second tag has no defined meaning. The consequence is that a second tag is
 * READ by nothing and REWRITTEN by nothing — so an export that prunes a deck's tags down to the
 * views it carries could not see it, and a withheld view's id rode into the artifact verbatim
 * (`lib/core/lens-export.mjs`). Deleting it is not a behavior change for any reader: nothing
 * consulted it before.
 *
 * A comment's own line goes with it, on the same rule `writeTags` uses — take the newline only
 * when the comment owned the line, so an inline tag cannot splice the next line onto this one.
 */
export function stripExtraLensTags(slideSrc: string): string {
	let src = String(slideSrc ?? '');
	// QUOTED CODE IS NOT A DIRECTIVE — fenced OR inline. Passing both range sets means a
	// backticked `<!-- _lens: … -->` example is neither mistaken for this slide's tag nor
	// deleted as a duplicate of it. Without the inline half, a slide that documents the syntax
	// lost its example to this sweep (two bare backticks and a broken sentence), and a slide
	// whose example came BEFORE its real tag lost the real tag instead.
	const quoted = (text: string) => {
		const fences = fenceRanges(text);
		return [...fences, ...inlineCodeRanges(text, fences)];
	};
	const first = findDirectiveComment(src, 'lens', quoted(src));
	if (!first) return src;
	// Walk from the end of the first tag, removing each subsequent one. Re-scanning the tail each
	// time keeps the fence ranges honest as the string shrinks.
	let cursor = first.end;
	for (;;) {
		const tail = src.slice(cursor);
		const next = findDirectiveComment(tail, 'lens', quoted(tail));
		if (!next) return src;
		const start = cursor + next.start;
		let end = cursor + next.end;
		if (src[end] === '\n' && ownsItsLine(src, start)) end += 1;
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

/** Is everything between the start of `at`'s line and `at` itself whitespace — i.e. does the comment
 *  starting there OWN its line? Lente always writes the tag on its own line, so this is true for every
 *  tag Lente itself produced; a hand-authored one can sit at the end of a line of prose. */
function ownsItsLine(src: string, at: number): boolean {
	let i = at - 1;
	while (i >= 0 && src[i] !== '\n') {
		if (src[i] !== ' ' && src[i] !== '\t') return false;
		i--;
	}
	return true;
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
		// Removing the tag takes its line's newline WITH it — but only when the tag owned that line.
		// Unconditionally, this ate the author's line break after an INLINE tag and spliced the next
		// line onto the previous one. On prose that silently merged two paragraphs; on a line
		// followed by a ``` fence it spliced the fence opener into the prose, so the fence never
		// opened, its closer became an opener, and a `---` inside the code became a setext underline —
		// one authored slide rendered as two, with another view's slide text on screen. An export
		// (lib/core/lens-export.mjs) re-stamps the approval digest AFTER this rewrite, so the damaged
		// deck certified itself as approved and the fail-closed net could not fire.
		if (!tokens && src[end] === '\n' && ownsItsLine(src, existing.start)) end += 1;
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
