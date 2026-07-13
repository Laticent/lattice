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
		if (!tokens && src[end] === '\n') end += 1; // drop the now-empty tag's trailing newline
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
