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

import { applyTag, approvalHash, lensEligibility, parseLensRegistry, parseSlideTags, readerLenses, upsertLensRegistry } from '@workwel/lente';
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
	let lead = null;
	if (out.length > 1 && leadingEmpty) {
		// KEEP IT, don't drop it. The separator (and the empty chunk in front of it) is real
		// text the author wrote, and re-emitting the body without it deletes a line from their
		// file. It belongs to no slide, so it cannot ride on one — it comes back as a PREFIX,
		// and only when slide 0 survives the projection.
		lead = `${out[0].chunk}\n${out[1].sep}`;
		out.shift();
		out[0] = { chunk: out[0].chunk, sep: null };
	}
	return { entries: out, lead };
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
	const slides = chunksWithSeparators(src.slice(fm.length)).entries.map((c) => c.chunk);
	const reg = parseLensRegistry(fm);
	return readerLenses(slides, reg).map((l) => ({ id: l.id, label: l.label }));
}

/**
 * The `lenses:` TOMBSTONE line shape — `  id: { drop: true }` — as Lente's own writer
 * emits it (registry.ts, `upsertLensRegistry`). It is stripped before the rewrite below,
 * and this is the one place in this file that reads the block's grammar.
 *
 * WHY IT IS STRIPPED RATHER THAN CARRIED. `upsertLensRegistry` deliberately re-attaches
 * every tombstone it finds, so a dropped workspace starter cannot silently re-inherit on
 * the next write. That is right for an EDIT and wrong for an EXPORT: a tombstone names a
 * view id, and an export that carries only `brief` must not also tell the recipient which
 * other views this deck's workspace offers. The re-inheritance it guards against cannot
 * happen here anyway — the exported envelope carries a materialized registry, never a
 * workspace delta.
 */
const TOMBSTONE_LINE = /^\s+[A-Za-z0-9_-]+:\s*\{\s*drop:\s*true\s*\}\s*$/;

/**
 * Rewrite a deck's front matter so its `lenses:` block names ONLY the exported views.
 *
 * THE REGISTRY IS A LEAK CHANNEL, and it was the one left open. A `--lens brief` export
 * withholds every non-member slide from the DOM, the outline, the article and the
 * envelope's slide bodies — and then the same envelope's front matter said, in plain
 * text, that this deck also has an `evidence` view and an `ask` view, with their labels
 * and their approval digests. Measured on `examples/lens-export.md`: a one-view export
 * shipped the names, labels and hashes of all three.
 *
 * THE APPROVAL DIGESTS ARE RE-STAMPED, not copied. The hash binds the view's resolved
 * membership plus its member slide BODIES; projection removes non-members and rewrites
 * foreign tags, so a copied digest would read `drifted` and the view would refuse to
 * open in the artifact that exists to show it. Re-stamping preserves the approval's
 * meaning exactly — every member body is byte-identical, and the human approved those
 * bodies. It does not manufacture an approval: a view that was never approved never
 * reaches here, because `lensEligibility` refuses it first.
 *
 * @param {string} fm the front-matter block, `---` delimiters included ('' if none)
 * @param {import('@workwel/lente').LensDef[]} defs the exported views' definitions, in order
 * @param {string} defaultId the view the artifact opens on
 * @returns {string} the rewritten block, delimiters included
 */
function pruneRegistry(fm, defs, defaultId) {
	const reg = { lenses: defs, default: defaultId };
	if (!fm) {
		// No front matter at all: the deck carries no registry, so there is nothing to
		// prune — and inventing a block would change a deck the author never annotated.
		return fm;
	}
	const m = /^(---(?:\r\n|\r|\n))([\s\S]*?)((?:\r\n|\r|\n)---[ \t]*(?:\r\n|\r|\n)?)$/.exec(fm);
	if (!m) return fm;
	const body = m[2].split('\n').filter((l) => !TOMBSTONE_LINE.test(l)).join('\n');
	return m[1] + upsertLensRegistry(body, reg) + m[3];
}

/**
 * Drop every `_lens` token on a slide that names a view this export does not carry.
 *
 * Membership travels ON the slide, so the tags are the registry's other half: pruning the
 * block alone would still ship `<!-- _lens: ask brief evidence -->` on every kept slide,
 * which names the withheld views AND discloses that this slide was a member of them.
 *
 * Lente is the sole writer of the tag, so the removal goes through `applyTag` rather than a
 * regex of our own. The `member` argument is chosen so the token DISAPPEARS in both bases: a
 * `base: none` view carries an include token only for members (so `false` removes it), and a
 * `base: all` view carries an exclude token only for non-members (so `true` removes it). An
 * id the registry does not declare at all is treated as `base: none`, which drops it either
 * way — `applyTag` clears the opposite set unconditionally.
 */
function pruneTags(slideSrc, exported, reg) {
	const tags = parseSlideTags(slideSrc);
	let out = slideSrc;
	for (const id of new Set([...tags.include, ...tags.exclude])) {
		if (exported.has(id)) continue;
		const base = reg.lenses.find((l) => l.id === id)?.base === 'all' ? 'all' : 'none';
		out = applyTag(out, id, base === 'all', base);
	}
	return out;
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
 * WHAT LEAVES AND WHAT STAYS. The projection is a REDUCTION in two dimensions, not one:
 * the slides no requested view shows are dropped, AND the views themselves are pruned to
 * the ones being exported (`pruneRegistry` + `pruneTags`). An export therefore discloses
 * exactly the views it offers — never the catalog they were picked from.
 *
 * @param {string} source full deck source (front matter included)
 * @param {string[]} requestedIds one or more view ids; `['full']` is the identity
 * @param {{default?: string}} [options] `default` — the view the artifact opens on;
 *   must be one of `requestedIds`. Defaults to the first requested view.
 * @returns {{ok: true, source: string, views: {id: string, label: string, indices: number[]}[], kept: number[], total: number, default: string}
 *          | {ok: false, lensId: string, reason: 'unknown'|'hidden'|'unapproved'|'empty'|'drifted'|'default-not-exported'}}
 */
export function projectForExport(source, requestedIds, options = {}) {
	const src = normalizeSourceText(String(source ?? ''));
	const fm = frontMatterBlockOf(src);
	const { entries, lead } = chunksWithSeparators(src.slice(fm.length));
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

	// The opening view. Naming one this export does not carry is a REFUSAL, not a
	// silent fall back to the first: an author who typed `--lens-default evidence`
	// and got `brief` would ship the wrong artifact without ever being told.
	const wanted = String(options.default ?? '').trim();
	if (wanted && !ids.includes(wanted)) return { ok: false, lensId: wanted, reason: 'default-not-exported' };
	const defaultId = wanted || ids[0] || FULL_VIEW;

	// The union, in AUTHOR order — the reduction the artifact actually ships.
	const kept = [...new Set(resolved.flatMap((v) => v.indices))].sort((a, b) => a - b);
	const position = new Map(kept.map((original, at) => [original, at]));
	const views = resolved.map((v) => ({ ...v, indices: v.indices.map((i) => position.get(i)) }));

	// Prune the per-slide tags first: the approval digests below are computed over the
	// slides as they will actually SHIP, and a digest over the pre-prune bodies would
	// read `drifted` the moment anyone re-opened the artifact.
	const exported = new Set(ids);
	const chunks = kept.map((i) => pruneTags(entries[i].chunk, exported, reg));
	const tagsUnchanged = chunks.every((c, at) => c === entries[kept[at]].chunk);

	// A BLANK LINE BEFORE EVERY SEPARATOR, and it is load-bearing rather than cosmetic.
	//
	// Dropping a chunk changes what the NEXT separator means. `---` after a paragraph LINE is
	// a setext underline, not a thematic break — so when the slide above a kept one is removed
	// and its predecessor now ends mid-paragraph, the separator stops splitting and starts
	// underlining. Measured on the plain PDF path before this: `--lens brief` on a three-slide
	// deck reported "2 of 3 slides ship" and rendered THREE — the kept slide lost its last
	// paragraph, and that paragraph became a phantom slide's heading.
	//
	// The blank line is ADDED ONLY WHERE ONE IS MISSING. An earlier version emitted it
	// unconditionally, which is safe and lossy: almost every deck already ends its slides with
	// a blank line, so every kept slide gained a spurious one and the artifact stopped being
	// the author's text. Checking first costs one `endsWith` and makes the re-join lossless for
	// the ordinary deck — which is also what lets the approval digests below survive a
	// round-trip through a projection that dropped nothing.
	const joined = chunks.reduce((acc, chunk, at) => {
		if (at === 0) return chunk;
		const sep = entries[kept[at]].sep ?? '---';
		return `${acc}${acc.endsWith('\n') ? '' : '\n'}\n${sep}\n${chunk}`;
	}, '');
	// A body that OPENED with a separator gets it back, but only when slide 0 survived —
	// it precedes the first slide, so it is meaningless in front of any other one.
	const body = lead && kept[0] === 0 ? `${lead}\n${joined}` : joined;

	// HASH THE BODY AS WRITTEN, never the chunk array it was built from. The blank line the
	// re-join adds in front of each separator lands at the END of the preceding chunk, so a
	// digest taken over `chunks` covers slides that differ by one newline from the ones the
	// artifact ships — and every view reads `drifted` the moment the recipient opens it. That
	// is a fail-CLOSED failure, so it is loud rather than dangerous, but the artifact is
	// useless. Re-splitting the emitted body is the only way to hash what actually ships.
	const shipped = chunksWithSeparators(body).entries.map((e) => e.chunk);
	const fullDef = reg.lenses.find((l) => l.id === FULL_VIEW);
	const keptDefs = [
		...(fullDef ? [fullDef] : []),
		...resolved.filter((v) => v.id !== FULL_VIEW).map((v) => ({ ...reg.lenses.find((l) => l.id === v.id), approved: undefined })),
	];
	const keptReg = { lenses: keptDefs, default: defaultId };
	keptReg.lenses = keptDefs.map((l) => (l.id === FULL_VIEW ? l : { ...l, approved: approvalHash(shipped, keptReg, l.id) }));
	const prunedFm = pruneRegistry(fm, keptReg.lenses, defaultId);

	// Identity: keeping every slide in order, changing no tag AND no view metadata returns
	// the caller's own string, so `--lens full` on a deck that declares no other view cannot
	// differ from no projection at all.
	const identity = kept.length === slides.length && kept.every((v, i) => v === i);
	if (identity && tagsUnchanged && prunedFm === fm) return { ok: true, source: src, views, kept, total: slides.length, default: defaultId };

	return { ok: true, source: prunedFm + body, views, kept, total: slides.length, default: defaultId };
}

/** The one-line explanation a refusal carries, so the CLI and the Studio say the same thing. */
export const REFUSAL_REASONS = {
	unknown: 'no view with that id is declared in the deck',
	hidden: 'the view is hidden — the author staged it, readers cannot pick it',
	unapproved: 'the view has never been approved — a human has to look at it first',
	empty: 'the view projects no slides',
	drifted: 'the deck changed since the view was approved — re-approve it',
	'default-not-exported': 'the default view is not one of the views being exported',
};
