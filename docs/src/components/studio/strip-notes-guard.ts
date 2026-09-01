// strip-notes-guard.ts — pick the note scrub that reproduces the author's deck.
//
// LOADED ON DEMAND, from `share-export.ts`'s `--strip-notes` path only. It lives in its own
// module for the reason `architect-model.js` does (docs/route-budget.json's own note): this
// runs when someone exports, never on the way to first paint, so it has no business in the
// studio route's eager bundle. It takes POSITIONAL arguments for the same reason — an object
// literal's keys survive minification, and at this call site they cost more than the code they
// name. Measured: inline, the studio route went 0.1KB past its budget.
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

type Rendered = { html: string };

type NotesKernel = {
	stripNotesFromSource: (source: string, noteBodies: Set<string>, o?: { boundary?: 'preserve' | 'drop' }) => string;
	stripCommentNodes: (html: string) => string;
};

export type StrippedCut = {
	/** The render whose source reproduces the authored deck, or `undefined` when neither cut
	 *  did — then the caller keeps the deck it already rendered. */
	out?: Rendered;
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
 * @param src        the deck as the author wrote it
 * @param notes      the shared note kernel (`notesCore`)
 * @param bodies     every note body on the deck, lifted from the render pre-bake
 * @param authored   the authored render's sections, to reproduce
 * @param sectionsOf the caller's depth-aware section splitter
 * @param render     renders one markdown source with the export's engine and theme
 */
export async function stripNotesCut(
	src: string,
	notes: NotesKernel,
	bodies: Set<string>,
	authored: string[],
	sectionsOf: (html: string) => string[],
	render: (source: string) => Promise<Rendered>,
): Promise<StrippedCut> {
	const shape = (sec: string) => notes.stripCommentNodes(sec).replace(/\s+/g, '');
	const want = authored.map(shape);
	for (const boundary of ['preserve', 'drop'] as const) {
		const source = notes.stripNotesFromSource(src, bodies, { boundary });
		const out = await render(source);
		const sections = sectionsOf(out.html);
		if (sections.length !== want.length) continue;
		if (sections.some((sec, i) => shape(sec) !== want[i])) continue;
		return { out, sections, source };
	}
	// Neither cut reproduces the deck, so the SLIDES ship as the author wrote them and the note
	// text still goes from every copy. What cannot also be had is a matching source: on such a
	// deck any removal restructures it, so the embedded source re-imports with that one block
	// boundary changed.
	console.warn('lattice: --strip-notes changed this deck; exporting as written.');
	return {
		source: notes.stripNotesFromSource(src, bodies),
		warning:
			'a note comment was acting as a block boundary, so the export does not hide which slides carried one',
	};
}
