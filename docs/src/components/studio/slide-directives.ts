// Per-slide directive editing — the substrate under the "This slide" drawer.
//
// The drawer edits a single slide's `<!-- _class: … -->` token list (and reads its
// speaker note, via slide-notes.ts, which shares this module's fence + directive
// helpers). Every edit is a PURE, SPAN-SURGICAL string transform: it rewrites ONLY
// the `_class:` value's character range and leaves every other byte — other
// directives, the body, whitespace, unknown/hand-authored tokens — untouched. It
// never splits-mutates-rejoins the deck, never normalizes, and never edits inside a
// fenced code block. See engineering/decisions/2026-07-03-slide-context-editor.md §5.

import { KNOWN_KEYS } from '../../../../lib/core/meta-keys.mjs';
import { readMetaField, comments as sharedComments, directiveKey as sharedDirectiveKey, fenceRanges as sharedFenceRanges, writeMeta } from '../../../../lib/core/meta-record.mjs';

// The directive KEYS the engine recognizes as scoped/global directives (a comment whose first
// `key:` is one of these is a DIRECTIVE, not a speaker note). They come from the shared vocabulary
// (lib/core/meta-keys.mjs, derived from the `meta` plugin's manifest), the same list the engine
// reads, so there is no copy here to keep in step. This module used to hold its own and a parity
// test to catch drift (the old slide-notes.ts hand-list HAD drifted, eating `_focus`/`_build`/`style`).
export const DIRECTIVE_KEYS: ReadonlySet<string> = KNOWN_KEYS;

/** The bare `key` of a comment body's FIRST directive line (leading `_` stripped),
 *  or '' when the body opens with prose. `<!-- _focus: row 2 -->` → 'focus';
 *  `<!-- note: … -->` → ''; `<!-- remember to smile -->` → ''. A key alone with no colon is only
 *  a directive if it is a bare-able (flag) key (`<!-- _build -->`). */
export function directiveKey(body: string): string {
	return sharedDirectiveKey(body);
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

/** True when the comment body is the slide's `say:` read-as text — the highest-
 *  precedence narration source, a separate channel from the speaker note (mirrors
 *  notes-core.isSayComment). Kept distinct so the note reader/writer never treats
 *  a say line as a note. */
export function isSayBody(body: string): boolean {
	return /^say\s*:/.test(String(body).trim()); // lowercase only — see notes-core SAY_MATCHER
}

/** True when the comment body is a PANES marker — `_pane: list` (or its `pane:` alias) or the
 *  `panes: 35/65` layout line
 *  (lib/core/pane-spec.js `parseMarker` / `PANES_RE`). Structure, not a speaker note: read as one, the
 *  presenter's notes showed "panes: 35/65", and setting a note on the slide stripped every marker
 *  and turned the panes slide back into one component. Not in DIRECTIVE_KEYS, which is the
 *  engine's directive list; the carve reads these before directives are applied. */
export function isPaneMarkerBody(body: string): boolean {
	const t = String(body).trim();
	// The alias is one component (plus `no-title`), as lib/core/pane-spec.js `parseMarker` reads it:
	// `pane: check the numbers` is a speaker note.
	return /^_pane:[^<>\n]*$/.test(t) || /^pane:\s*[a-z][\w-]*(?:\s+no-title)*$/.test(t) || /^panes:[^<>\n]*$/.test(t);
}

// ── Fence awareness ──────────────────────────────────────────────────────────
// A `---` or a `<!-- … -->` INSIDE a fenced code block is content, not structure.
// The old splitter (lint.ts) and note transform were fence-blind, so a mermaid
// block's `---` front matter split the slide and a `code` slide showing a `_class`
// comment got its example edited. We mask fenced regions before any scan.

/** Char ranges `[start, end)` covered by fenced code blocks (``` / ~~~); see lib/core/meta-record.mjs. */
// The cast: TS infers the untyped `.mjs` kernel's ranges as `number[][]`; each is a `[start, end)` pair.
export const fenceRanges = sharedFenceRanges as (text: string) => Array<[number, number]>;

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
export const comments: (chunk: string) => Comment[] = sharedComments;

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
	const f = readMetaField(chunk, 'class');
	if (!f.present || !f.editable) {
		return f.present
			? { tokens: [], present: true, editable: false, reason: f.reason }
			: { tokens: [], present: false, editable: true };
	}
	return {
		tokens: f.value.split(/\s+/).filter(Boolean),
		present: true,
		editable: true,
		valueSpan: f.valueSpan,
		commentSpan: f.commentSpan,
		soleDirective: f.soleDirective,
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
	return writeMeta(String(chunk ?? ''), { class: tokens.filter(Boolean).join(' ') });
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
