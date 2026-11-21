// A slide's four notes: read and write them in its source.
//
// A note is a comment whose whole body is `@name{…}` (engineering/decisions/2026-11-20-four-notes.md):
//
//   @note{…}     speaker notes: Present, the PPTX notes field, the PDF note annotation
//   @say{…}      the voice and the captions: TTS, read-along, the `.vtt` sidecar
//   @alt{…}      alt text: screen readers, PPTX alt text, `aria-describedby`
//   @handout{…}  the handout PDF and the player's read view
//
// Any other comment is the author's own and is never read or touched here: a plain comment, a directive, a record,
// a panes marker. The grammar is the engine's (lib/core/note-grammar.mjs, through slide-directives.ts), and the scan
// is the shared fence-aware `comments()`, so a comment shown inside a code sample is content, never a note.

import { comments, type NoteName, readNoteBody, tidyOutsideFences, writeNoteComment } from '../../lib/slide-directives';

export type { NoteName };

/** How several notes of one name join, as the engine joins them (lib/authoring/notes-core.js `noteTexts`): paragraphs
 *  for `@note` and `@handout`, one line for `@say` and `@alt`, each of which is one string to its reader. */
const JOIN: Record<NoteName, string> = { note: '\n\n', say: ' ', alt: ' ', handout: '\n\n' };

/** The slide's note named `name`: every `@name{…}` on it, in source order, joined as the engine joins them; '' when
 *  it has none. The grammar has already undone the comment escapes (`--\>`, `\{`), so the text is what the author wrote. */
export function getSlideNote(chunk: string, name: NoteName): string {
	const texts: string[] = [];
	for (const c of comments(String(chunk ?? ''))) {
		const n = readNoteBody(c.body);
		if (n?.name !== name) continue;
		const text = n.text.trim();
		if (text) texts.push(text);
	}
	return texts.join(JOIN[name]);
}

/**
 * Set (or clear, with empty text) the slide's note named `name`: remove every `@name{…}` comment on the slide, then
 * append one, written by the engine's `writeNote`. Every other comment (plain comments, the other three notes,
 * directives, records, panes markers) and everything inside a fenced code block is left as it was.
 */
export function setSlideNote(chunk: string, name: NoteName, text: string): string {
	const src = String(chunk ?? '');
	const ranges = comments(src)
		.filter((c) => readNoteBody(c.body)?.name === name)
		.map((c) => [c.start, c.end] as [number, number]);
	let out = src;
	for (let i = ranges.length - 1; i >= 0; i--) out = out.slice(0, ranges[i][0]) + out.slice(ranges[i][1]);
	// Tidy only the gaps a removed note left (a run of blank lines, the tail), never a fenced code block's interior.
	if (ranges.length) out = tidyOutsideFences(out);
	out = out.trim();
	const t = String(text ?? '').trim();
	return t ? `${out}\n\n${writeNoteComment(name, t)}` : out;
}
