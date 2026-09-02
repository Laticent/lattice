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

import { applyTag, lensEligibility, parseLensRegistry, parseSlideTags, readerLenses, stripExtraLensTags, upsertLensRegistry } from '@workwel/lente';
import { boundaryParser } from './boundary-parser.mjs';
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

/** A `lenses:` block CHILD line, as Lente's writer emits it: two spaces, an id, an inline map. */
const REGISTRY_CHILD = /^\s+([A-Za-z0-9_-]+):\s*\{/;
/** The `lens-defaults: off` opt-out, which `upsertLensRegistry` strips and does not re-emit. */
const DEFAULTS_OFF = /^\s*lens-defaults:\s*off\s*$/;

/**
 * Rewrite a deck's front matter so its `lenses:` block names ONLY the exported views.
 *
 * THE REGISTRY IS A LEAK CHANNEL, and it was the one left open. A `--lens brief` export
 * withholds every non-member slide from the DOM, the outline, the article and the
 * envelope's slide bodies — and then the same envelope's front matter said, in plain
 * text, that this deck also has an `evidence` view and an `ask` view, with their labels.
 * Measured on `examples/lens-export.md`: a one-view export shipped all three.
 *
 * THE FILTER IS AN ALLOWLIST OVER THE EMITTED BLOCK, not a pattern over the source, and
 * that is the whole design. The first version stripped source lines matching a TOMBSTONE
 * shape (`  id: { drop: true }`) before handing the block to Lente's writer, because
 * `upsertLensRegistry` deliberately re-attaches every tombstone it finds so a dropped
 * workspace starter cannot silently re-inherit. But Lente's PARSER reads `drop: true` out
 * of any inline map, and the regex only matched one spelling of it: `{ drop: true, }` and
 * `{ label: "Project Chimera", drop: true }` both slipped past the strip and were then
 * re-emitted, canonicalized, into the artifact — a withheld view's id in a file whose
 * documentation promised none. Reading the OUTPUT and dropping every child line whose id
 * is not exported cannot have that bug: it does not need to recognize a tombstone, only an
 * id, and Lente's writer has already canonicalized every entry to one shape by then.
 *
 * WHAT IT PRESERVES. `lens-defaults: off` is carried across, because that line is what
 * makes a deck's registry materialized rather than inherited — strip it and a re-import
 * into a workspace with default views re-inherits every starter the author turned off.
 *
 * NO APPROVAL DIGEST IS WRITTEN HERE. See `projectForExport`.
 *
 * @param {string} fm the front-matter block, `---` delimiters included ('' if none)
 * @param {import('@workwel/lente').LensDef[]} defs the exported views' definitions, in order
 * @param {string} defaultId the view the artifact opens on
 * @returns {string} the rewritten block, delimiters included
 */
function pruneRegistry(fm, defs, defaultId) {
	// No front matter at all: the deck carries no registry, so there is nothing to prune —
	// and inventing a block would change a deck the author never annotated.
	if (!fm) return fm;
	const m = /^(---(?:\r\n|\r|\n))([\s\S]*?)((?:\r\n|\r|\n)---[ \t]*(?:\r\n|\r|\n)?)$/.exec(fm);
	if (!m) return fm;
	const defaultsOff = m[2].split('\n').some((l) => DEFAULTS_OFF.test(l));
	const written = upsertLensRegistry(m[2], { lenses: defs, default: defaultId });

	const allowed = new Set(defs.map((l) => l.id));
	const out = [];
	let inBlock = false;
	for (const line of written.split('\n')) {
		if (/^\s*lenses:\s*$/.test(line)) { inBlock = true; out.push(line); continue; }
		if (inBlock) {
			const child = REGISTRY_CHILD.exec(line);
			if (child) { if (allowed.has(child[1])) out.push(line); continue; }
			if (/^\s+\S/.test(line) || line.trim() === '') continue; // still inside, or blank
			inBlock = false;
		}
		out.push(line);
	}
	// A `lenses:` header with every child filtered away is noise; drop it.
	const kept = out.filter((line, i) => !(/^\s*lenses:\s*$/.test(line) && !REGISTRY_CHILD.test(out[i + 1] ?? '')));
	if (defaultsOff) kept.push('lens-defaults: off');
	return m[1] + kept.join('\n') + m[3];
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
/**
 * The block structure of a slide, with its `_lens` directives taken out — the ONE thing a prune is
 * allowed to change.
 *
 * WHY A PARSER AND NOT A RULE. Six commits in a row tried to decide, from the bytes alone, which
 * edits to a markdown document are safe. Every one was wrong in a new way, because the answer is a
 * property of the PARSER and not of the string: deleting a line joins the blocks around it. A tag
 * between two paragraphs merges them; above a `===` it turns the paragraph before it into an `h1`;
 * between two lists it welds them into one. Measured: 152 structural changes across 1,445 fuzzed
 * inputs, on a rule whose docblock called itself "provably safe".
 *
 * So this stops deciding and starts CHECKING, against `boundaryParser` — the shared instance whose
 * block rules are pinned to the engine's own (HARD RULE #1), which is what a reader's renderer
 * actually runs. Token TYPES only: the prune rewrites inline text inside a directive and nothing
 * else, so a `nesting`/`tag` sequence is exactly the invariant, and comparing content would reject
 * the edit for doing its job.
 */
function blockShape(slideSrc) {
	return boundaryParser
		.parse(String(slideSrc ?? ''), {})
		.filter((t) => !(t.type === 'html_block' && t.content.includes('_lens:')))
		.map((t) => `${t.type}:${t.tag}:${t.nesting}`)
		.join('|');
}

/** Every `_lens` directive the RENDERER sees on a slide — its `html_block` tokens, not Lente's read
 *  of them. The two differ: `fenceRanges` opens a fence on an info string carrying a backtick where
 *  markdown-it opens none, so a directive Lente calls "fenced" is one a reader is shown. Asking the
 *  parser is the only way to check disclosure against what actually reaches the recipient. */
function renderedDirectiveBodies(slideSrc) {
	const out = [];
	for (const tok of boundaryParser.parse(String(slideSrc ?? ''), {})) {
		if (tok.type !== 'html_block') continue;
		for (const m of tok.content.matchAll(/<!--\s*_lens:([^>]*?)-->/g)) out.push(m[1]);
	}
	return out;
}

function pruneTags(slideSrc, exported, reg) {
	// A SLIDE CAN CARRY MORE THAN ONE `_lens` DIRECTIVE, and only the first is ever read — so a
	// second was invisible to this prune and rode into the artifact naming a view the recipient
	// was not given. It goes first, before the tokens of the one directive that IS read are
	// pruned. Both steps ask `findDirectiveComment` the same question, so they cannot disagree
	// about which comment is the tag; an earlier version that answered it two ways turned the
	// disagreement itself into a leak.
	let out = stripExtraLensTags(slideSrc);
	const tags = parseSlideTags(out);
	for (const id of new Set([...tags.include, ...tags.exclude])) {
		if (exported.has(id)) continue;
		const base = reg.lenses.find((l) => l.id === id)?.base === 'all' ? 'all' : 'none';
		out = applyTag(out, id, base === 'all', base);
	}
	// AND THE EDIT IS CHECKED, NOT ASSUMED. If any of it moved the slide's block structure, none of
	// it is kept — the author's bytes win over the prune, and the disclosure check below turns the
	// unpruned id into a refusal rather than a leak. Reverting whole is deliberate: attributing the
	// damage to one of several edits would be another derivation, and this file has spent six
	// commits learning what those cost.
	return blockShape(out) === blockShape(slideSrc) ? out : slideSrc;
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
 * @param {{default?: string}} [options] `default` — the view the artifact opens on; must be
 *   one of `requestedIds`. Absent, the DECK's own `lens-default:` wins when it names an
 *   exported view; only then does it fall back to the first id requested.
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
	// NAMING NOTHING IS A REFUSAL, not "project everything". Without this the union of zero
	// views is the empty set, so the function returned `{ok: true, source: ''}` — an empty
	// deck, reported as a success. The CLI guards its own flag, but the Studio and any other
	// direct caller got the silent version, which is the fail-OPEN direction dressed as a
	// no-op.
	if (!ids.length) return { ok: false, lensId: '', reason: 'no-view-named' };

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
	// Falling through to `ids[0]` means ARGV ORDER decides the landing view — and argv order
	// is already spoken for: it is what the switcher lists. A deck that declares
	// `lens-default: evidence` and is exported `--lens brief,evidence` shipped opening on
	// `brief`, discarding a decision the author wrote down. The deck's own default wins over
	// the order the ids were typed in, and only an explicit `--lens-default` wins over that.
	const deckDefault = reg.default && ids.includes(reg.default) ? reg.default : '';
	const defaultId = wanted || deckDefault || ids[0];

	// The union, in AUTHOR order — the reduction the artifact actually ships.
	const kept = [...new Set(resolved.flatMap((v) => v.indices))].sort((a, b) => a - b);
	const position = new Map(kept.map((original, at) => [original, at]));
	const views = resolved.map((v) => ({ ...v, indices: v.indices.map((i) => position.get(i)) }));

	// `--lens full` ALONE IS THE IDENTITY, and it returns BEFORE anything below touches the
	// deck. Ordering is the whole point: an earlier version put this return after the prune,
	// the re-join and the re-split invariant, so a deck whose first slide's entire content was
	// a withheld tag — the exact shape `applyTag` writes when you tag an empty slide in the
	// Studio — pruned to nothing, failed the re-split check, and `--lens full` REFUSED a deck
	// it is supposed to hand back untouched. The CLI then listed `full` as exportable in the
	// same breath as refusing it.
	//
	// The prune exists because naming a view a recipient was not given tells them something
	// about content they were denied. A `full` recipient was denied nothing — they hold every
	// slide — so there is no disclosure to close, and deleting the author's view catalog from
	// an envelope that exists to round-trip into an editable deck is pure loss. `full`
	// alongside a named view (`--lens full,brief`) is a real selection and still prunes.
	if (ids.length === 1 && ids[0] === FULL_VIEW) return { ok: true, source: src, views, kept, total: slides.length, default: defaultId };

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

	// THE EMITTED BODY MUST RE-SPLIT INTO EXACTLY THE SLIDES WE SAID WE KEPT.
	//
	// Everything above operates on a chunk ARRAY; what ships is a STRING, and the two are only
	// the same if every rewrite between them preserved slide structure. That is an assumption,
	// not a fact, and when it broke it broke in the fail-OPEN direction: the baked view map is
	// indexed by position, so one lost or gained slide shifts every view after it and a reader
	// is shown a slide their view excludes. Two separate rewrites have already done it — an
	// inline `_lens` tag whose removal ate a newline and spliced a code fence into prose, and a
	// slide whose ENTIRE content was a withheld tag, which pruned to nothing and was then
	// absorbed by the leading-empty rule (3 slides reported, 2 shipped).
	//
	// So the invariant is CHECKED rather than trusted, against the same splitter every consumer
	// uses, and a mismatch REFUSES. That is the whole point of a fail-closed design: an export
	// that cannot prove it kept what it said it kept must not write a file. The check is O(one
	// re-split) and it generalizes — it catches the next rewrite too, which is worth more than
	// either of the specific fixes.
	const shipped = chunksWithSeparators(body).entries;
	if (shipped.length !== kept.length) return { ok: false, lensId: ids.join(','), reason: 'unsplittable' };

	// AND THE PRUNE IS CHECKED THE SAME WAY, FOR THE SAME REASON. `pruneTags` can only edit a
	// directive that is the WHOLE of its line — see `editableDirective` in Lente's tags.ts, which
	// reached that bound after four different string splices each corrupted a real deck (a spliced
	// fence opener, a bare `-` read as a setext underline, a whitespace-only line turning a tight
	// list loose, and a documented example gutted inside a blockquoted fence). Anything sharing its
	// line is therefore READ and returned untouched — which is safe for the author's bytes and, on
	// its own, a fail-OPEN for disclosure: a withheld view's id in such a tag would ride out in the
	// envelope naming a view the recipient was never given.
	//
	// So do not trust the bound; re-read what was emitted and refuse if a withheld id survived. Same
	// shape as the re-split check above, and the same argument for it: this catches the NEXT gap in
	// the class as well as the four that are known, and `fenceRanges` is known to have at least one
	// left (#2034). An export that cannot prove it withheld what it said it withheld must not write
	// a file.
	//
	// ASKED OF THE PARSER, NOT OF LENTE. The obvious instrument was `unknownLensTokens`, which reads
	// every directive body rather than only the first — but it reads them through the same
	// `fenceRanges` the pruner uses, so it is blind in exactly the places the pruner is blind, and a
	// check that shares its subject's blind spot certifies nothing. Measured: `fenceRanges` opens a
	// fence on ```` ```js` ```` (an info string carrying a backtick) where markdown-it opens none, so
	// a directive Lente called "fenced" reached a real exported envelope naming a withheld view,
	// with `ok: true`. `renderedDirectiveBodies` asks the engine-pinned parser what a READER is
	// shown, which is the only question disclosure has ever been about.
	for (const chunk of shipped) {
		for (const body of renderedDirectiveBodies(chunk.chunk)) {
			for (const raw of body.split(/\s+/).filter(Boolean)) {
				const id = raw.replace(/^[+-]/, '');
				if (id && id !== FULL_VIEW && !exported.has(id)) return { ok: false, lensId: id, reason: 'unprunable' };
			}
		}
	}

	// NO APPROVAL DIGEST IS RE-STAMPED, and that reversal is the most important line in this
	// file.
	//
	// The first version re-derived each surviving view's `approved:` hash over the projected
	// deck, so the view would still open if the artifact were re-imported. Two things were
	// wrong with it, one fatal.
	//
	// FATAL: it made the projection SELF-CERTIFYING. `pruneTags` rewrites the author's slide
	// text, and a digest taken afterwards describes whatever that rewrite produced — damage
	// included. Measured: an inline `<!-- _lens: … -->` at the end of a prose line made
	// Lente's writer eat the author's newline (now fixed in tags.ts), splicing a ``` fence
	// opener into the prose; one authored slide rendered as two, a `brief` reader was shown
	// an `ask`-only slide, and the digest in the shipped file verified. The fail-closed net
	// cannot fire against a hash written after the corruption. Not writing one at all removes
	// the whole class, not just the instance that was found.
	//
	// ALSO WRONG: the digest is a property of the ENVELOPE and was computed four stages too
	// early. The envelope's source is this projection plus `--strip-notes`,
	// `--strip-captions`, `--print` and the mermaid pre-pass; measured, `--lens` with
	// `--strip-notes` shipped views that read `drifted` on re-import — so the property being
	// bought was not even being delivered.
	//
	// WHAT IS LOST is narrow and honest: re-importing a projected artifact reads its views as
	// `unapproved`, and `REFUSAL_REASONS.unapproved` already says the right thing — "a human
	// has to look at it first." A machine reduced this deck; the human's approval described
	// the deck before the reduction. Nothing in the shipped player reads the digest (the
	// carrier bakes its own view map precisely so Lente does not ship), so the artifact a
	// recipient opens is unaffected.
	const fullDef = reg.lenses.find((l) => l.id === FULL_VIEW);
	const keptDefs = [
		...(fullDef ? [fullDef] : []),
		...resolved.filter((v) => v.id !== FULL_VIEW).map((v) => ({ ...reg.lenses.find((l) => l.id === v.id), approved: undefined })),
	];
	const prunedFm = pruneRegistry(fm, keptDefs, defaultId);

	// Identity for everything else: keeping every slide in order, changing no tag AND no view
	// metadata returns the caller's own string rather than a re-assembled copy.
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
	'no-view-named': 'no reader view was named — a projection of nothing is not the whole deck',
	'unsplittable': 'the projected deck does not divide into the slides the view selected — refused rather than shipped with a shifted view map',
	'unprunable': 'a slide still names a view this export does not carry — the tag could not be removed without changing how the slide renders, so nothing was written. Put the tag on a blank line of its own, away from the prose around it',
};
