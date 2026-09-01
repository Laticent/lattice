// strip-notes-guard.ts — pick the note scrub that reproduces the author's deck.
//
// LOADED ON DEMAND, from `share-export.ts`'s `--strip-notes` path only. It lives in its own
// module for the reason `architect-model.js` does (docs/route-budget.json's own note): this
// runs when someone exports, never on the way to first paint, so it has no business in the
// studio route's eager bundle. It takes POSITIONAL arguments for the same reason — an object
// literal's keys survive minification, and at this call site they cost more than the code they
// name. Measured: inline, the studio route went 82 bytes past its budget.
//
// What it must NOT own is the candidate list. That is `notesCore.NOTE_SCRUB_BOUNDARIES`, read
// through the injected kernel, because a second hand-kept copy of it is exactly how this path
// and the CLI's came to disagree — and pinned by `test/unit/authoring/notes-core.test.js` plus
// this module's own test.
//
// ── What it is for ───────────────────────────────────────────────────────────
// `--strip-notes` ships the render of the SCRUBBED source rather than a scrubbed render of the
// authored one, because removing a comment NODE from rendered HTML leaves the whitespace it
// occupied and that named which slides carried a note (#1985).
//
// But a comment line is an HTML BLOCK, so removing it can move the deck — and the `text / text`
// case has TWO right answers, which is why this measures instead of deciding:
//
//     Some text                     - Revenue up 12 percent
//     <!-- note -->                   <!-- note -->
//     ---                           - Costs flat
//
// Left, the comment IS the boundary: delete the line and `Some text\n---` becomes a setext H2,
// so the export gains a slide the author never wrote. Right, an empty line turns a TIGHT list
// LOOSE (`<li>Revenue…` becomes `<li><p>Revenue…`) while taking the line reproduces the
// author's list exactly. Same neighbours, opposite correct answers.
//
// So both cuts are rendered and the one that reproduces the authored deck wins. When neither
// does — a note at column 0 between two list items, where the comment is what splits them — the
// caller ships the deck AS WRITTEN and says so: the note text still goes, but that export no
// longer hides which slides carried one, and its embedded source re-imports with that boundary
// changed. Mirrors `strippedSlidesOrAuthored` in lattice-emulator.js; the two paths must not
// diverge, which is the failure class this whole area exists to close.

type NotesKernel = {
	stripNotesFromSource: (source: string, noteBodies: Set<string>, o?: { boundary?: string }) => string;
	stripCommentNodes: (html: string) => string;
	/** The candidate cuts, in the order they are tried. Read from the kernel rather than written
	 *  out here — two hand-kept copies of this list is how the CLI and the Studio diverged. */
	NOTE_SCRUB_BOUNDARIES: readonly string[];
};

export type StrippedCut<R> = {
	/** The render whose source reproduces the authored deck, or `undefined` when neither cut
	 *  did — then the caller keeps the deck it already rendered. */
	out?: R;
	/** `out`'s sections, index-aligned with the caller's own record. */
	sections?: string[];
	/** The scrubbed source to embed. The source that SHIPS is the one that was rendered;
	 *  computing it separately is how a fallback once shipped authored slides beside a
	 *  restructured envelope. */
	source: string;
	/** Set only on the fallback, for the export's own fidelity banner. */
	warning?: string;
};

/**
 * Render each candidate scrub and return the first that reproduces `authored`.
 *
 * The comparison is whitespace-BLIND, necessarily: dropping the comment's leftover whitespace
 * is the entire point of the second pass, so a byte comparison flags every noted slide. And
 * collapsing runs to one space is not enough either — the residue is one space on one side and
 * NOTHING on the other (`</header> <p>` vs `</header><p>`), which collapsing cannot equalize.
 * What must match is the MARKUP, and tags survive dropping whitespace entirely.
 *
 * Generic in the render type so the caller gets its own render back unchanged. An earlier cut
 * narrowed it to `{ html }` and the caller asserted it back up, which typechecked while hiding
 * that it goes on to read `.css`, `.width` and `.height` off the same object.
 *
 * @param src        the deck as the author wrote it
 * @param notes      the shared note kernel (`notesCore`)
 * @param bodies     every note body on the deck, lifted from the render pre-bake
 * @param authored   the authored render's sections, to reproduce
 * @param sectionsOf the caller's depth-aware section splitter
 * @param render     renders one markdown source with the export's engine and theme
 */
export async function stripNotesCut<R extends { html: string }>(
	src: string,
	notes: NotesKernel,
	bodies: Set<string>,
	authored: string[],
	sectionsOf: (html: string) => string[],
	render: (source: string) => Promise<R>,
): Promise<StrippedCut<R>> {
	// Nothing to scrub — no cut, and no second render. The CLI short-circuits here too
	// (`strippedSlidesOrAuthored`); without it a note-free deck exported with the flag on paid a
	// whole extra render on the browser's main thread to arrive at the source it started with.
	if (bodies.size === 0) return { source: src };
	const shape = (sec: string) => notes.stripCommentNodes(sec).replace(/\s+/g, '');
	const want = authored.map(shape);
	for (const boundary of notes.NOTE_SCRUB_BOUNDARIES) {
		const source = notes.stripNotesFromSource(src, bodies, { boundary });
		const out = await render(source);
		const sections = sectionsOf(out.html);
		if (sections.length !== want.length) continue;
		if (sections.some((sec, i) => shape(sec) !== want[i])) continue;
		return { out, sections, source };
	}
	// Neither cut reproduces the deck. Fidelity wins for the SLIDES — a privacy flag must not
	// restructure a deck — and the note TEXT still goes from every copy. What cannot also be had
	// is a matching source: any removal at all restructures this deck, so the embedded source
	// re-imports with that block boundary changed.
	//
	// SAY WHAT TO CHANGE, not just that something went wrong. This is the one path where the
	// author has to edit the deck to get the guarantee back, and the CLI's warning names the
	// cause and the fix — so this one does too, or the two paths differ where it matters most.
	console.warn(
		'lattice: --strip-notes could not remove a note comment without changing this deck, '
			+ 'either by leaving a blank line in its place or by taking the line. A note comment is '
			+ 'acting as a block boundary. The usual cause is a note at column 0 BETWEEN two list '
			+ 'items, where the comment is what splits them into two lists and no removal can keep '
			+ 'that — move the note inside an item, or out of the list. (Adding blank lines around '
			+ 'it does NOT help here, whatever a note above a `---` may need.) Exporting the deck '
			+ 'AS WRITTEN: the note text is still removed from every copy, but this export no longer '
			+ 'hides which slides carried one, and the embedded source will re-import with that '
			+ 'block boundary changed.',
	);
	return {
		source: notes.stripNotesFromSource(src, bodies),
		warning:
			'a note comment was acting as a block boundary, so the export does not hide which slides carried one',
	};
}
