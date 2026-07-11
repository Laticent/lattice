// Speaker notes — read/write a slide's presenter note in its source.
//
// In LFM (Marp-faithful) a NON-directive HTML comment on a slide IS that slide's
// speaker note; the engine surfaces it in the presenter view / PDF notes / PPTX.
// The Studio authors notes as `<!-- note: … -->` (still a plain note to the
// engine) and, when reading, accepts any non-directive comment so a hand-authored
// note round-trips.
//
// Directive-vs-note classification and fence awareness are SHARED with the slide
// directive editor (slide-directives.ts) — one generated vocabulary, one fence
// mask. The previous hand-rolled directive regex had drifted from the engine and
// silently deleted `_focus` / `_build` / `style` directives, and its comment scan
// was fence-blind (it ate `<!-- … -->` shown inside code fences). Both are fixed
// by routing through `comments()` + `isDirectiveBody()`.

import { comments, isCaptionBody, isDescriptionBody, isDirectiveBody, tidyOutsideFences } from './slide-directives';

/** The slide's speaker note (the first non-directive, non-description, non-caption comment),
 *  or ''. A `describe:` comment is the accessibility description and a `caption:` comment is
 *  the read-as narration text (both separate channels) — never the speaker note. */
export function getNote(chunk: string): string {
	for (const c of comments(chunk)) {
		if (isDirectiveBody(c.body) || isDescriptionBody(c.body) || isCaptionBody(c.body)) continue;
		return c.body.trim().replace(/^note:\s*/i, '').trim();
	}
	return '';
}

/**
 * Set (or clear, with an empty note) the slide's speaker note: strip any existing
 * non-directive note comment(s), then append the new one. Directive comments
 * (`_class`, `_paginate`, `_focus`, …) are left untouched, and comments inside
 * fenced code blocks are never touched (they're content, not notes).
 */
export function setNote(chunk: string, note: string): string {
	const text = String(chunk || '');
	// Ranges of existing note comments (non-directive, non-description, non-caption,
	// outside fences), right-to-left. A `describe:` comment is the accessibility channel
	// and a `caption:` comment is the read-as narration — leave both untouched so setting
	// the note never clobbers them.
	const ranges = comments(text)
		.filter((c) => !isDirectiveBody(c.body) && !isDescriptionBody(c.body) && !isCaptionBody(c.body))
		.map((c) => [c.start, c.end] as [number, number]);
	let out = text;
	for (let i = ranges.length - 1; i >= 0; i--) out = out.slice(0, ranges[i][0]) + out.slice(ranges[i][1]);
	// Tidy only the gaps left behind — collapse a run of blank lines a removed note
	// opened up, and trim the tail — without reflowing a fenced code block's interior.
	out = tidyOutsideFences(out).trim();
	const t = note.trim().replace(/--+>/g, '->'); // never let the body close the comment early
	return t ? `${out}\n\n<!-- note: ${t} -->` : out;
}
