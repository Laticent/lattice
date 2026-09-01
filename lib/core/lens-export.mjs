/**
 * lib/core/lens-export.mjs
 *
 * THE ONE projection an EXPORT applies — "which slides of this deck leave the
 * building, and under which reader views?" — answered by Lente's read path and
 * the engine's own slide splitter, never by a third derivation of either
 * (HARD RULE #1).
 *
 * WHY THIS IS A SOURCE TRANSFORM. Every downstream stage of an export — the
 * render, auto-split, the overflow pass, notes/caption extraction, the CSS and
 * font prune, pagination, the `.html` envelope — is a function of the deck
 * SOURCE. Projecting the source once, at the door, therefore keeps all of them
 * consistent for free: a `--lens brief` PDF paginates 1..4 because it really is
 * a four-slide deck by the time anything measures it. Filtering later (at the
 * DOM, or at the page level) is what the current workaround does with
 * `pdfseparate`, and it is exactly the absolute-page-number coupling reader
 * views exist to remove (#1853).
 *
 * WHAT IT REFUSES, AND WHY IT NEVER FALLS BACK. `lensEligibility` fails CLOSED
 * with one of five named reasons — `unknown` · `hidden` · `unapproved` ·
 * `empty` · `drifted`. A view is often a deliberate REDUCTION, so silently
 * substituting the full deck when a view is unavailable would hand the reader
 * every slide the author kept out — the one failure mode the design explicitly
 * forbids (2026-07-13-lente-reader-lenses.md §6.3, red-team finding M4). This
 * kernel returns the refusal; the caller exits non-zero with the reason.
 *
 * WHAT AN EXPORT CAN DO THAT THE STUDIO CANNOT. The 2026-07-18 correction to
 * that record is exact: client-side projection HIDES, it does not WITHHOLD —
 * filtering an array the client already holds is `display:none`, and a reader
 * who views source sees every non-member slide's bytes. An EXPORT is the first
 * consumer that constructs the bytes, so it is the first one that CAN withhold.
 * That is the whole reason this is worth building, and it is also why the
 * envelope matters: a projected DOM shipped beside a verbatim `source:` in the
 * `application/lattice+json` envelope withholds precisely nothing, because that
 * envelope exists to round-trip back into a full editable deck. Measured on a
 * 16-slide deck, a non-member slide reaches the recipient through FOUR channels
 * — the `<section>` DOM, the article outline, the article body, and the
 * envelope — and the envelope is the worst of them.
 *
 * SEPARATORS ARE PRESERVED, NOT NORMALIZED. A deck may separate slides with
 * `***`, `___`, `- - -`, `----`, or an indented `---`; all of them are `hr` to
 * the engine's parser and none of them is `---`. Re-emitting the projection
 * with a canonical `---` would silently rewrite the author's file inside the
 * artifact, so each kept slide is re-joined under the separator that actually
 * preceded it.
 *
 * IDENTITY IS BY CONSTRUCTION, NOT BY LUCK. When the projection keeps every
 * slide in order — `--lens full`, or a view that happens to contain the whole
 * deck — the ORIGINAL source string is returned unchanged rather than
 * re-assembled from chunks. So `--lens full` is byte-identical to no flag at
 * all, and cannot drift there through some future change to the re-assembly.
 */

import { lensEligibility, parseLensRegistry, readerLenses } from '@workwel/lente';
import { frontMatterBlockOf, normalizeSourceText, slideBoundaries } from './slide-boundaries.mjs';

/** The implicit identity view. Always eligible, never removable, always offered. */
export const FULL_VIEW = 'full';

/**
 * A deck's body cut into chunks, each paired with the separator LINE that
 * precedes it (null for the first). `splitSlideChunks` drops that line — which
 * is right for reading a slide and wrong for re-emitting one, so this derives
 * both from the same `slideBoundaries` call the engine's splitter uses.
 *
 * @param {string} body deck body, front matter already stripped
 * @returns {{chunk: string, sep: string|null}[]}
 */
function chunksWithSeparators(body) {
	const text = normalizeSourceText(String(body ?? ''));
	const { lines: seps, leadingEmpty } = slideBoundaries(text);
	const lines = text.split('\n');
	const out = [];
	let start = 0;
	let sep = null;
	for (const at of seps) {
		out.push({ chunk: lines.slice(start, at).join('\n'), sep });
		sep = lines[at]; // this separator precedes the NEXT chunk
		start = at + 1;
	}
	out.push({ chunk: lines.slice(start).join('\n'), sep });
	// `splitOnHr`'s leading-group rule, in this index space: a body opening with a
	// separator renders N sections from N+1 chunks. Dropping the empty first entry
	// also drops the separator it carried, so entry 0 is again separator-less.
	if (out.length > 1 && leadingEmpty) {
		out.shift();
		out[0] = { chunk: out[0].chunk, sep: null };
	}
	return out;
}

/**
 * The reader views an export may offer for this deck — `full` plus every view
 * that is eligible RIGHT NOW. This is what a Studio export picker lists and what
 * the CLI validates `--lens` against.
 *
 * @param {string} source full deck source (front matter included)
 * @returns {{id: string, label: string}[]}
 */
export function exportableViews(source) {
	const src = normalizeSourceText(String(source ?? ''));
	const fm = frontMatterBlockOf(src);
	const slides = chunksWithSeparators(src.slice(fm.length)).map((c) => c.chunk);
	const reg = parseLensRegistry(fm);
	return readerLenses(slides, reg).map((l) => ({ id: l.id, label: l.label }));
}

/**
 * Project a deck source down to the slides the requested views show.
 *
 * The result's `source` is a real deck — front matter intact, slides in AUTHOR
 * order — so every downstream stage treats it as one. `views` carries each
 * requested view's membership as indices into the PROJECTED slide list, which
 * is what a carrier bakes in so a reader can switch between views inside one
 * file without the reader path (and therefore without Lente) shipping with it.
 *
 * Ineligibility is reported for the FIRST requested view that fails, in the
 * order the author asked for them, so the message names the view they typed.
 *
 * @param {string} source full deck source (front matter included)
 * @param {string[]} requestedIds one or more view ids; `['full']` is the identity
 * @returns {{ok: true, source: string, views: {id: string, label: string, indices: number[]}[], kept: number[], total: number}
 *          | {ok: false, lensId: string, reason: 'unknown'|'hidden'|'unapproved'|'empty'|'drifted'}}
 */
export function projectForExport(source, requestedIds) {
	const src = normalizeSourceText(String(source ?? ''));
	const fm = frontMatterBlockOf(src);
	const entries = chunksWithSeparators(src.slice(fm.length));
	const slides = entries.map((c) => c.chunk);
	const reg = parseLensRegistry(fm);
	const ids = [...new Set((Array.isArray(requestedIds) ? requestedIds : []).filter(Boolean))];

	// Every requested view goes through the SAME gate a reader does. `full` passes it
	// too (it is always eligible), so there is no branch here that skips the check.
	const resolved = [];
	for (const id of ids) {
		const view = lensEligibility(slides, reg, id);
		if (view.status !== 'ok') return { ok: false, lensId: id, reason: view.reason };
		const def = reg.lenses.find((l) => l.id === id);
		resolved.push({ id, label: def?.label ?? id, indices: view.pairs.map((p) => p.index) });
	}

	// The union, in AUTHOR order — the reduction the artifact actually ships.
	const kept = [...new Set(resolved.flatMap((v) => v.indices))].sort((a, b) => a - b);
	const position = new Map(kept.map((original, at) => [original, at]));
	const views = resolved.map((v) => ({ ...v, indices: v.indices.map((i) => position.get(i)) }));

	// Identity: keeping every slide in order returns the caller's own string, so a
	// full-deck projection cannot differ from no projection at all.
	const identity = kept.length === slides.length && kept.every((v, i) => v === i);
	if (identity) return { ok: true, source: src, views, kept, total: slides.length };

	// A BLANK LINE BEFORE EVERY SEPARATOR, and it is load-bearing rather than cosmetic.
	//
	// Dropping a chunk changes what the NEXT separator means. `---` after a paragraph LINE is
	// a setext underline, not a thematic break — so when the slide above a kept one is removed
	// and its predecessor now ends mid-paragraph, the separator stops splitting and starts
	// underlining. Measured on the plain PDF path before this: `--lens brief` on a three-slide
	// deck reported "2 of 3 slides ship" and rendered THREE — the kept slide lost its last
	// paragraph, and that paragraph became a phantom slide's heading.
	//
	// A blank line makes the separator unambiguous in every context: setext underlines cannot
	// follow one, and a thematic break does not care. `--lens full` is untouched because the
	// identity shortcut above returns the caller's own string before reaching here.
	const body = kept.map((i, at) => (at === 0 ? entries[i].chunk : `\n${entries[i].sep ?? '---'}\n${entries[i].chunk}`)).join('\n');
	return { ok: true, source: fm + body, views, kept, total: slides.length };
}

/** The one-line explanation a refusal carries, so the CLI and the Studio say the same thing. */
export const REFUSAL_REASONS = {
	unknown: 'no view with that id is declared in the deck',
	hidden: 'the view is hidden — the author staged it, readers cannot pick it',
	unapproved: 'the view has never been approved — a human has to look at it first',
	empty: 'the view projects no slides',
	drifted: 'the deck changed since the view was approved — re-approve it',
};
