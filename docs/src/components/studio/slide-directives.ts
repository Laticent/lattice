// Per-slide directive editing — the substrate under the "This slide" drawer.
//
// The drawer edits a single slide's `<!-- _class: … -->` token list (and reads its
// speaker note, via slide-notes.ts, which shares this module's fence + directive
// helpers). Every edit is a PURE, SPAN-SURGICAL string transform: it rewrites ONLY
// the `_class:` value's character range and leaves every other byte — other
// directives, the body, whitespace, unknown/hand-authored tokens — untouched. It
// never splits-mutates-rejoins the deck, never normalizes, and never edits inside a
// fenced code block. See engineering/decisions/2026-07-03-slide-context-editor.md §5.

// The directive KEYS the engine recognizes as scoped/global directives (a comment
// whose first `key:` is one of these is a DIRECTIVE, not a speaker note). This
// mirrors `KNOWN_DIRECTIVES` in lib/engine/directives.js and is held in lock-step by
// a parity test (slide-directives.test.ts) — the SAME drift-gate discipline as the
// autocomplete-parity test, so this list can never silently fall behind the engine
// (the old slide-notes.ts hand-list HAD drifted, eating `_focus`/`_build`/`style`).
export const DIRECTIVE_KEYS: ReadonlySet<string> = new Set([
	'theme', 'paginate', 'header', 'footer', 'class', 'backgroundColor',
	'backgroundImage', 'backgroundPosition', 'backgroundRepeat', 'backgroundSize',
	'color', 'size', 'style', 'lang', 'marp', 'logo',
	'focus', 'focusStyle', 'focusSteps', 'build', 'debug',
]);

/** The bare `key` of a comment body's FIRST directive line (leading `_` stripped),
 *  or '' when the body opens with prose. `<!-- _focus: row 2 -->` → 'focus';
 *  `<!-- note: … -->` → ''; `<!-- remember to smile -->` → ''. */
export function directiveKey(body: string): string {
	const m = String(body).trim().match(/^_?([A-Za-z][\w-]*)\s*(?::|$)/);
	if (!m) return '';
	// A key alone with no colon is only a directive if it's a bare FLAG directive
	// (`<!-- _build -->`). Otherwise `<!-- remember … -->` would misread as 'remember'.
	const key = m[1];
	const hasColon = /^_?[A-Za-z][\w-]*\s*:/.test(String(body).trim());
	if (!hasColon && key !== 'build' && key !== 'debug') return '';
	return DIRECTIVE_KEYS.has(key) ? key : '';
}

/** True when the comment body is an engine directive (not a speaker note). */
export function isDirectiveBody(body: string): boolean {
	return directiveKey(body) !== '';
}

/** True when the comment body is the slide's `describe:` accessibility description
 *  — a separate channel from the speaker note (mirrors notes-core.isDescriptionComment).
 *  Kept distinct so the note reader/writer never treats a description as a note. */
export function isDescriptionBody(body: string): boolean {
	return /^describe\s*:/i.test(String(body).trim());
}

// ── Fence awareness ──────────────────────────────────────────────────────────
// A `---` or a `<!-- … -->` INSIDE a fenced code block is content, not structure.
// The old splitter (lint.ts) and note transform were fence-blind, so a mermaid
// block's `---` front matter split the slide and a `code` slide showing a `_class`
// comment got its example edited. We mask fenced regions before any scan.

/** Char ranges `[start, end)` covered by fenced code blocks (``` / ~~~). An
 *  unterminated fence masks to end-of-string (matching how a renderer reads it). */
export function fenceRanges(text: string): Array<[number, number]> {
	const ranges: Array<[number, number]> = [];
	const src = String(text ?? '');
	let pos = 0;
	let open: { char: string; len: number; start: number } | null = null;
	for (const line of src.split('\n')) {
		const lineStart = pos;
		const lineEnd = pos + line.length;
		const fm = line.match(/^[ \t]*(`{3,}|~{3,})(.*)$/);
		if (fm) {
			const char = fm[1][0];
			const len = fm[1].length;
			if (!open) open = { char, len, start: lineStart };
			else if (open.char === char && len >= open.len && fm[2].trim() === '') {
				ranges.push([open.start, lineEnd]);
				open = null;
			}
		}
		pos = lineEnd + 1; // + the '\n'
	}
	if (open) ranges.push([open.start, src.length]);
	return ranges;
}

const inRanges = (ranges: Array<[number, number]>, idx: number) => ranges.some(([a, b]) => idx >= a && idx < b);

/** Collapse blank-line runs and strip trailing spaces, but ONLY outside fenced code
 *  blocks — so a note edit never disturbs meaningful whitespace (hard breaks, blank
 *  runs) inside a code sample. */
export function tidyOutsideFences(text: string): string {
	const src = String(text ?? '');
	const clean = (s: string) => s.replace(/\n{3,}/g, '\n\n').replace(/[ \t]+\n/g, '\n');
	const fences = fenceRanges(src);
	if (!fences.length) return clean(src);
	let out = '';
	let pos = 0;
	for (const [a, b] of fences) {
		out += clean(src.slice(pos, a));
		out += src.slice(a, b); // fence interior — verbatim
		pos = b;
	}
	return out + clean(src.slice(pos));
}

export type Comment = { start: number; end: number; body: string; bodyStart: number };

/** Every HTML comment in `chunk` that is NOT inside a fenced code block, in order. */
export function comments(chunk: string): Comment[] {
	const text = String(chunk ?? '');
	const fences = fenceRanges(text);
	const re = /<!--([\s\S]*?)-->/g;
	const out: Comment[] = [];
	let m: RegExpExecArray | null;
	while ((m = re.exec(text))) {
		if (inRanges(fences, m.index)) continue;
		out.push({ start: m.index, end: m.index + m[0].length, body: m[1], bodyStart: m.index + 4 });
	}
	return out;
}

// ── The `_class` directive: read, and surgically write ───────────────────────

export type ClassDirective = {
	/** The ordered tokens of the FIRST `_class` directive comment. */
	tokens: string[];
	/** True when a `_class` comment exists in the chunk. */
	present: boolean;
	/** False when the shape can't be round-tripped losslessly (YAML array, or a
	 *  duplicate `_class` comment) — the drawer goes read-only ("edit in markdown"). */
	editable: boolean;
	/** Why editable is false, for the UI hint. */
	reason?: 'array-form' | 'duplicate';
	/** Absolute [start, end) of the token VALUE to splice (present + editable only). */
	valueSpan?: [number, number];
	/** Absolute [start, end) of the whole comment, for removal. */
	commentSpan?: [number, number];
	/** True when the comment holds ONLY the `_class` directive (safe to remove whole). */
	soleDirective?: boolean;
};

/** Locate and parse the slide's `_class` directive (the first such comment). */
export function readClassDirective(chunk: string): ClassDirective {
	const text = String(chunk ?? '');
	const carriers = comments(text).filter((c) => /(?:^|\n)\s*_?class\s*:/.test(c.body));
	if (!carriers.length) return { tokens: [], present: false, editable: true };
	if (carriers.length > 1) return { tokens: [], present: true, editable: false, reason: 'duplicate' };

	const c = carriers[0];
	// The `_class:` line within the comment body: value runs to end-of-line (or the
	// end of a single-line comment body). Other lines (`_paginate: false`) are left be.
	const line = c.body.match(/(?:^|\n)([ \t]*)_?class\s*:[ \t]*([^\n]*)/);
	if (!line) return { tokens: [], present: false, editable: true };
	const rawValue = line[2];
	if (/^\[/.test(rawValue.trim())) return { tokens: [], present: true, editable: false, reason: 'array-form' };

	// Value offset inside the whole chunk. line.index is within the body; the value
	// starts after the matched prefix (`\n` + indent + `_class:` + spaces).
	const matchStartInBody = (line.index ?? 0) + line[0].length - rawValue.length;
	const absValueStart = c.bodyStart + matchStartInBody;
	// Trim trailing whitespace from the value span so we never disturb the ` -->` gap.
	const trimmed = rawValue.replace(/[ \t]+$/, '');
	const absValueEnd = absValueStart + trimmed.length;
	const tokens = trimmed.split(/\s+/).filter(Boolean);
	// Sole directive ⇔ the body has no OTHER directive line beyond this `_class`.
	const otherDirectiveLines = c.body
		.split('\n')
		.some((l) => l.trim() && !/^\s*_?class\s*:/.test(l) && directiveKey(l) !== '');
	return {
		tokens,
		present: true,
		editable: true,
		valueSpan: [absValueStart, absValueEnd],
		commentSpan: [c.start, c.end],
		soleDirective: !otherDirectiveLines,
	};
}

/** The slide's `_class` tokens (first directive), or []. */
export function getClassTokens(chunk: string): string[] {
	return readClassDirective(chunk).tokens;
}

/** True when the drawer may edit this slide's class (not a duplicate/array shape). */
export function canEditClass(chunk: string): boolean {
	return readClassDirective(chunk).editable;
}

/**
 * Set the slide's `_class` tokens to EXACTLY `tokens`, span-surgically:
 *   • present + editable → splice the value range, touching nothing else;
 *   • empty tokens + sole-directive comment → remove the whole comment (+ a blank line);
 *   • empty tokens + compound comment → drop just the `_class:` line;
 *   • absent + non-empty → prepend `<!-- _class: … -->` as the chunk's first line;
 *   • not editable → returned unchanged (caller gates on canEditClass()).
 * Tokens are written verbatim in the given order — the caller preserves unknown /
 * hand-authored tokens by reading getClassTokens() first and mutating that array.
 */
export function setClassTokens(chunk: string, tokens: string[]): string {
	const text = String(chunk ?? '');
	const dir = readClassDirective(text);
	if (!dir.editable) return text;
	const value = tokens.filter(Boolean).join(' ').replace(/--+>/g, '->'); // never close the comment early

	if (!dir.present) {
		if (!value) return text;
		const lead = `<!-- _class: ${value} -->`;
		return text.trim() ? `${lead}\n\n${text.replace(/^\n+/, '')}` : lead;
	}

	if (value) {
		const [s, e] = dir.valueSpan as [number, number];
		return text.slice(0, s) + value + text.slice(e);
	}

	// Clearing to empty. Rebuild the comment from its remaining directive lines; if
	// nothing is left, remove the whole comment (and one trailing blank-line gap).
	const [cs, ce] = dir.commentSpan as [number, number];
	const inner = text.slice(cs + 4, ce - 3); // between `<!--` and `-->`
	const kept = inner.split('\n').map((l) => l.trim()).filter((l) => l && !/^_?class\s*:/.test(l));
	if (kept.length) return `${text.slice(0, cs)}<!-- ${kept.join('\n')} -->${text.slice(ce)}`;
	let end = ce;
	const gap = text.slice(ce).match(/^[ \t]*\r?\n(?:[ \t]*\r?\n)?/);
	if (gap) end += gap[0].length;
	return (text.slice(0, cs) + text.slice(end)).replace(/^\n+/, '');
}

/** Add or remove a single token, preserving order and all other tokens. */
export function toggleToken(chunk: string, token: string): string {
	const tokens = getClassTokens(chunk);
	const i = tokens.indexOf(token);
	if (i >= 0) tokens.splice(i, 1);
	else tokens.push(token);
	return setClassTokens(chunk, tokens);
}

/**
 * Set (or clear, with `token === null`) the chosen member of a mutually-exclusive
 * GROUP: remove every token in `groupMembers`, then append `token` if given. Order
 * of the untouched tokens is preserved; the new token lands at the end. `groupMembers`
 * comes from the generated vocabulary (never a hand-list) so groups can't drift.
 */
export function setGroupToken(chunk: string, groupMembers: readonly string[], token: string | null): string {
	const members = new Set(groupMembers);
	const kept = getClassTokens(chunk).filter((t) => !members.has(t));
	if (token) kept.push(token);
	return setClassTokens(chunk, kept);
}
