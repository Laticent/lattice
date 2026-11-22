// Per-slide lens tags — the carrier of membership. A slide declares the lenses it belongs to in a
// single lowercase `<!-- _lens: … -->` HTML comment (mirroring the `_class` grammar authors know).
// Membership travels ON the slide, so reordering never corrupts it. Case is LOCKED to lowercase so a
// stray `_Lens` can't both leak into exported HTML and silently drop membership (design doc §7).

import type { LensBase, SlideTags } from './types.js';

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

// ── The slide's class, from a `_class` comment OR a `@meta{…}` record ──────────────────────────────────
// A slide can name its layout two ways: `<!-- _class: kpi -->` or `<!-- @meta{layout=kpi} -->` (the record the engine
// reads through lib/core/meta-door.mjs `readRecord`; engineering/decisions/2026-10-17-meta-record.md §15). This package
// is zero-dependency and cannot import lib/core, so it carries its own STRICT read of the record's class words: it takes
// the class only from a record the engine also reads, and gives up (null) on any shape it is unsure of, so it can miss
// a class but never invent one. `tags.test.ts` holds it equal to `readRecord` on every case it names.

/** The record's text from `{` to its matching `}` (quote- and nesting-aware), or null when it does not close or a
 *  quoted value crosses a newline. Mirrors meta-door.mjs `recordEnd`. */
function recordBraces(body: string, from: number): string | null {
	let depth = 0;
	let quoted = false;
	for (let i = from; i < body.length; i++) {
		const c = body[i];
		if (quoted) {
			if (c === '\\') i++;
			else if (c === '"') quoted = false;
			else if (c === '\n') return null;
			continue;
		}
		if (c === '"') quoted = true;
		else if (c === '{' || c === '[') depth++;
		else if (c === '}' || c === ']') {
			depth--;
			if (depth === 0) return body.slice(from, i + 1);
			if (depth < 0) return null;
		}
	}
	return null;
}

/** Split the inside of a record on top-level commas (outside quotes and brackets). */
function recordItems(inside: string): string[] {
	const out: string[] = [];
	let depth = 0;
	let quoted = false;
	let start = 0;
	for (let i = 0; i < inside.length; i++) {
		const c = inside[i];
		if (quoted) {
			if (c === '\\') i++;
			else if (c === '"') quoted = false;
			continue;
		}
		if (c === '"') quoted = true;
		else if (c === '{' || c === '[') depth++;
		else if (c === '}' || c === ']') depth--;
		else if (c === ',' && depth === 0) {
			out.push(inside.slice(start, i));
			start = i + 1;
		}
	}
	out.push(inside.slice(start));
	return out;
}

const CLASS_FIELD_ORDER = ['layout', 'variant', 'universal', 'modifiers'];

/** The class words a `@meta{…}` comment body carries, space-joined, or null when it is not a record, does not read,
 *  or names no class. Typed fields first (layout, variant, universal, modifiers), then `class`, as `readRecord` orders
 *  them; registers (`headline=`, `icon=`) are left out, and they never come first there either. */
export function recordClassWords(inner: string): string | null {
	const body = String(inner ?? '');
	const lead = body.length - body.trimStart().length;
	if (!body.startsWith('@meta{', lead)) return null;
	const braces = recordBraces(body, lead + 5);
	if (!braces) return null;
	const inside = braces.slice(1, -1).replace(/\n[ \t]*/g, ' ');
	if (!inside.length || inside[0] === ' ' || inside[0] === '\t') return null; // the engine's grammar refuses a lead space
	const typed: Record<string, string> = {};
	const cls: string[] = [];
	for (const raw of recordItems(inside)) {
		const item = raw.trim();
		if (!item) return null; // `a,,b` and a trailing comma do not read
		const eq = item.indexOf('=');
		if (eq < 0) continue; // a bare word: a flag or a marker, never a class
		const name = item.slice(0, eq).trim().toLowerCase();
		let value = item.slice(eq + 1).trim();
		if (!name) return null;
		if (value.startsWith('[') || value.startsWith('{')) continue; // a list or a record is not one value
		if (value.startsWith('"')) {
			try {
				value = String(JSON.parse(value));
			} catch {
				return null;
			}
		}
		if (CLASS_FIELD_ORDER.includes(name)) typed[name] = value;
		else if (name === 'class') cls.push(...value.split(/[ \t]+/).filter(Boolean));
	}
	const words: string[] = [];
	for (const f of CLASS_FIELD_ORDER) if (typed[f]) words.push(...typed[f].split(/[ \t]+/).filter(Boolean));
	for (const w of cls) if (!words.includes(w)) words.push(w);
	return words.length ? words.join(' ') : null;
}

/** The first non-fenced comment that names the slide's class, a `_class` or `class` comment or a `@meta{…}` record,
 *  with its span and the class words. A record that names no class is skipped. */
export function slideClassSite(src: string): { start: number; end: number; words: string } | null {
	const text = String(src ?? '');
	const fences = fenceRanges(text);
	let i = 0;
	for (;;) {
		const open = text.indexOf('<!--', i);
		if (open < 0) return null;
		const close = text.indexOf('-->', open + 4);
		if (close < 0) return null;
		i = close + 3;
		if (inFence(open, fences)) continue;
		const inner = text.slice(open + 4, close);
		// `_class:` (this slide) or `class:` (a running global, which applies from its own slide on). Later slides that
		// the global carries onto are not read here, in either form.
		const marker = inner.indexOf('_class:') >= 0 ? '_class:' : 'class:';
		const k = inner.indexOf(marker);
		if (k >= 0 && isBlank(inner.slice(0, k))) return { start: open, end: close + 3, words: inner.slice(k + marker.length).trim() };
		const words = recordClassWords(inner);
		if (words) return { start: open, end: close + 3, words };
	}
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

/** Render the two token sets to the shortest canonical, deterministically-ordered token string.
 *  Includes first (sorted), then `-`excludes (sorted). Empty => ''. */
function emitTokens(tags: SlideTags): string {
	const inc = [...tags.include].sort();
	const exc = [...tags.exclude].sort().map((id) => `-${id}`);
	return [...inc, ...exc].join(' ');
}

/** Write the `<!-- _lens: … -->` comment for a slide from its token sets. Replaces the slide's first
 *  NON-fenced `_lens` comment (a fenced example is left untouched); removes it when empty; inserts a
 *  new one right after the comment that names the slide's class, `_class` or a `@meta{…}` record (or at the top),
 *  when none exists. */
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
	const cls = slideClassSite(src);
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
