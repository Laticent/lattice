// Accessible descriptions — read/write a slide's `<!-- describe: … -->` in its source.
//
// A slide's DESCRIPTION is its WCAG SC 1.1.1 text alternative — an objective
// equivalent of what the slide shows, for someone who can't see it. It is a
// SEPARATE channel from the speaker note (opposite register: the note is what you
// SAY; the description is what's THERE) and must never be spoken or land in the
// presenter-notes field. The engine consumes `<!-- describe: … -->` via notes-core
// (`isDescriptionComment` / `descriptionFromHtml`) and routes it to the image
// alt-text (PPTX) and an aria description (HTML) — never to the note.
//
// This module is the Studio's source-side read/write, the sibling of slide-notes.ts:
// same fence-aware `comments()` scan, same surgical rewrite, one classifier
// (`isDescriptionBody`). See engineering/decisions/2026-07-04-accessible-descriptions.md.

import { comments, isDescriptionBody, tidyOutsideFences } from './slide-directives';

/** The slide's accessibility description (the first `describe:` comment, prefix
 *  stripped), or ''. */
export function getDescription(chunk: string): string {
	for (const c of comments(chunk)) {
		if (!isDescriptionBody(c.body)) continue;
		return c.body.trim().replace(/^describe\s*:\s*/i, '').trim();
	}
	return '';
}

/**
 * Set (or clear, with an empty string) the slide's accessibility description:
 * strip any existing `describe:` comment(s), then append the new one. Speaker
 * notes and engine directives are left untouched, and comments inside fenced code
 * blocks are never touched (they're content).
 */
export function setDescription(chunk: string, description: string): string {
	const text = String(chunk || '');
	// Ranges of existing describe comments (outside fences), right-to-left.
	const ranges = comments(text)
		.filter((c) => isDescriptionBody(c.body))
		.map((c) => [c.start, c.end] as [number, number]);
	let out = text;
	for (let i = ranges.length - 1; i >= 0; i--) out = out.slice(0, ranges[i][0]) + out.slice(ranges[i][1]);
	out = tidyOutsideFences(out).trim();
	const t = description.trim().replace(/--+>/g, '->'); // never let the body close the comment early
	return t ? `${out}\n\n<!-- describe: ${t} -->` : out;
}
