// Say lines — read/write a slide's `<!-- say: … -->` in its source.
//
// A slide's SAY LINE is its read-as TEXT — the exact words a slide narrates
// (read-aloud, the HTML player's Read-Article, the export `.vtt`, a11y, future
// translation). It is the HIGHEST-precedence narration source (say line →
// front-matter say: map → projection) and a SEPARATE channel from both the
// speaker note (what you SAY off-slide) and the `describe:` accessibility text
// (an objective equivalent of what's THERE). The engine consumes `<!-- say: … -->`
// via notes-core (`isSayComment` / `sayLineFromHtml`) and routes it to narration
// only — never to the presenter-note field.
//
// This module is the Studio's source-side read/write, the sibling of
// slide-descriptions.ts: same fence-aware `comments()` scan, same surgical rewrite,
// one classifier (`isSayBody`). Unlike a description, a say line REPLACES the
// slide's narration, so a second one supersedes — read/write the LAST `say:`
// comment. See engineering/decisions/2026-07-11-manifest-speech-contract.md §16.

import { comments, isSayBody, tidyOutsideFences } from './slide-directives';

/** The slide's say line (the LAST `say:` comment, prefix stripped), or ''.
 *  Last-wins: a say line is an override of the whole slide's narration, so a later one
 *  supersedes an earlier one (matching notes-core.sayLineFromHtml). */
export function getSayLine(chunk: string): string {
	let say = '';
	for (const c of comments(chunk)) {
		if (!isSayBody(c.body)) continue;
		const text = c.body.trim().replace(/^say\s*:\s*/, '').trim();
		if (text) say = text; // last-NON-EMPTY-wins — parity with notes-core.sayLineFromHtml
	}
	return say;
}

/**
 * Set (or clear, with an empty string) the slide's say line: strip any existing
 * `say:` comment(s), then append the new one. Speaker notes, `describe:`
 * descriptions, and engine directives are left untouched, and comments inside fenced
 * code blocks are never touched (they're content).
 */
export function setSayLine(chunk: string, say: string): string {
	const text = String(chunk || '');
	// Ranges of existing say comments (outside fences), right-to-left.
	const ranges = comments(text)
		.filter((c) => isSayBody(c.body))
		.map((c) => [c.start, c.end] as [number, number]);
	let out = text;
	for (let i = ranges.length - 1; i >= 0; i--) out = out.slice(0, ranges[i][0]) + out.slice(ranges[i][1]);
	out = tidyOutsideFences(out).trim();
	// Never let the body close the comment early — neutralize BOTH the normal `-->` and the
	// spec-valid abrupt close `--!>` (a real HTML parser treats `--!>` as a comment end).
	const t = say.trim().replace(/--+!?>/g, '->');
	return t ? `${out}\n\n<!-- say: ${t} -->` : out;
}
