// Captions — read/write a slide's `<!-- caption: … -->` in its source.
//
// A slide's CAPTION is its read-as TEXT — the exact words a slide narrates
// (read-aloud, the HTML player's Read-Article, the export `.vtt`, a11y, future
// translation). It is the HIGHEST-precedence narration source (caption →
// front-matter caption → note → projection) and a SEPARATE channel from both the
// speaker note (what you SAY off-slide) and the `describe:` accessibility text
// (an objective equivalent of what's THERE). The engine consumes `<!-- caption: … -->`
// via notes-core (`isCaptionComment` / `captionFromHtml`) and routes it to narration
// only — never to the presenter-note field.
//
// This module is the Studio's source-side read/write, the sibling of
// slide-descriptions.ts: same fence-aware `comments()` scan, same surgical rewrite,
// one classifier (`isCaptionBody`). Unlike a description, a caption REPLACES the
// slide's narration, so a second one supersedes — read/write the LAST caption
// comment. See engineering/decisions/2026-07-11-manifest-speech-contract.md §16.

import { comments, isCaptionBody, tidyOutsideFences } from './slide-directives';

/** The slide's read-as caption (the LAST `caption:` comment, prefix stripped), or ''.
 *  Last-wins: a caption is an override of the whole slide's narration, so a later one
 *  supersedes an earlier one (matching notes-core.captionFromHtml). */
export function getCaption(chunk: string): string {
	let caption = '';
	for (const c of comments(chunk)) {
		if (!isCaptionBody(c.body)) continue;
		const text = c.body.trim().replace(/^caption\s*:\s*/i, '').trim();
		if (text) caption = text; // last-NON-EMPTY-wins — parity with notes-core.captionFromHtml
	}
	return caption;
}

/**
 * Set (or clear, with an empty string) the slide's caption: strip any existing
 * `caption:` comment(s), then append the new one. Speaker notes, `describe:`
 * descriptions, and engine directives are left untouched, and comments inside fenced
 * code blocks are never touched (they're content).
 */
export function setCaption(chunk: string, caption: string): string {
	const text = String(chunk || '');
	// Ranges of existing caption comments (outside fences), right-to-left.
	const ranges = comments(text)
		.filter((c) => isCaptionBody(c.body))
		.map((c) => [c.start, c.end] as [number, number]);
	let out = text;
	for (let i = ranges.length - 1; i >= 0; i--) out = out.slice(0, ranges[i][0]) + out.slice(ranges[i][1]);
	out = tidyOutsideFences(out).trim();
	const t = caption.trim().replace(/--+>/g, '->'); // never let the body close the comment early
	return t ? `${out}\n\n<!-- caption: ${t} -->` : out;
}
