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
import { blockLines } from './resolve-captions.mjs';
import { frontMatterBlockOf, normalizeSourceText, slideBoundaries } from './slide-boundaries.mjs';
import { splitSections } from './split-sections.js';

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
 * How a slide RENDERS, with its `_lens` comments taken out — the one thing a prune may change.
 *
 * WHY A RENDER AND NOT A TOKEN SIGNATURE. Seven commits tried to decide, from the bytes, which edits
 * to a markdown document are safe. The seventh finally asked the parser — and asked it the wrong
 * question. It compared `type:tag:nesting` per token, which is not "does this render the same", and
 * two mechanisms walk straight through the gap:
 *
 *   · A LINK REFERENCE DEFINITION emits no block token at all. Delete the tag line above one and it
 *     becomes lazy-continuation text of the block before it: the definition dies, every reference
 *     link using it degrades to literal `[label]`, and the URL prints on the face of the slide.
 *     Measured on the real CLI — a projected artifact showed an internal URL the full deck did not.
 *   · A LIST FLIPS LOOSE TO TIGHT. markdown-it marks a tight item's `paragraph_open` `hidden`; the
 *     type, tag and nesting are identical, so a signature comparison is blind to it.
 *
 * Rendered HTML is the property itself rather than a proxy for it. Cost: one extra render per pruned
 * slide, measured at ~1 ms on the demo deck against a ~10 s export. Nothing worth trading correctness
 * for.
 *
 * THE DIRECTIVES COME OUT OF THE TOKEN STREAM, NOT OUT OF THE TEXT, and there are two reasons.
 *
 * The first is CodeQL, which failed this PR on the first draft: a regex stripping `<!-- … -->` reads
 * as an attempt to SANITIZE markup (`js/incomplete-multi-character-sanitization`), and it is right
 * that such a regex cannot do that job. Nothing here sanitizes anything — the output is compared and
 * thrown away, never rendered into a document — but the query cannot know that, and
 * `lib/core/class-directive-scan.mjs` already carries a docblock about the same class of false
 * positive and the same answer: do not spell an HTML-comment pattern as a regex.
 *
 * The second is that it is simply MORE PRECISE. Dropping every comment blinded the check to damage
 * inside an author's ORDINARY comment, which the prune has no business changing. Filtering tokens
 * removes exactly the `_lens` directives and leaves everything else in the comparison.
 *
 * The render is compared whole, not whitespace-collapsed. Output whitespace is a function of the
 * token stream rather than of source spacing, so an exact comparison costs no false refusals — and a
 * collapse would have hidden a real difference inside a `<pre>`.
 */
function renderedShape(slideSrc) {
	const kept = [];
	for (const tok of boundaryParser.parse(String(slideSrc ?? ''), {})) {
		if (tok.type === 'html_block') {
			// TRIM THE DIRECTIVES OUT OF THE BLOCK, DO NOT DROP THE BLOCK. An HTML block runs to a
			// blank line or a closing tag, so it can carry arbitrary author content beside a
			// directive — dropping it whole made two `<pre>` bodies compare equal while a line
			// vanished from one. Scanned rather than matched, for the CodeQL reason above.
			tok.content = withoutLensComments(tok.content);
			if (tok.content.trim() === '') continue;
		}
		if (tok.type === 'inline' && tok.children) {
			tok.children = tok.children.filter((c) => !(c.type === 'html_inline' && c.content.includes('_lens:')));
		}
		kept.push(tok);
	}
	// MATH IS OPAQUE TO THIS RENDERER, so its content joins the comparison by hand. `boundaryParser`
	// installs `math_block` as a BLOCK rule with no renderer rule — every `$$…$$` renders as `<div />`
	// whatever is inside it — so a directive line at column 0 inside display math could be removed
	// with the comparison none the wiser, while the real engine's KaTeX pass typesets the two
	// differently. Narrow to reach and cheap to close; leaving it would have made "there is no weaker
	// question left to ask" false again.
	const math = kept.filter((t) => t.type.startsWith('math')).map((t) => t.content).join('\u0000');
	// NOT TRIMMED, AND THAT ONE CALL WAS TWO DEFECTS. Trailing whitespace is rendered content inside a
	// `<pre>`: `withoutLensComments` leaves the directive's newline behind while the prune deletes the
	// whole line, so with a `.trim()` the difference landed in the trimmed region and the check said
	// "identical" — a projected slide rendered one blank line short of the author's, measured on the
	// real CLI, in the exact class this function exists to catch and against its own docblock.
	//
	// It also silently reversed the direction of the block-trimming above. Over 3,000 randomized decks
	// carrying raw HTML, trimming made the check accept 216 prunes that dropping the block whole would
	// have reverted, and zero the other way — the opposite of the "more precise" it was introduced as.
	// Untrimmed, the leftover newline makes the two sides differ, so the prune reverts and the author's
	// bytes win. Precision here means CONSERVATIVE, not permissive.
	return `${boundaryParser.renderer.render(kept, boundaryParser.options, {})}\u0000${math}`;
}

/**
 * An HTML block's content with its `_lens` DIRECTIVE comments removed and every other byte kept.
 *
 * Scanned with `indexOf`, not matched with a regex, and that is not a style preference: CodeQL reads
 * an HTML-comment pattern as an attempt to SANITIZE markup and failed this PR for it
 * (`js/incomplete-multi-character-sanitization`, high). `lib/core/class-directive-scan.mjs` carries
 * the same note for the same reason. Only whitespace may precede the `_lens:` marker inside the
 * comment, matching what every reader in the chain treats as a directive.
 */
function withoutLensComments(text) {
	let out = '';
	let i = 0;
	for (;;) {
		const open = text.indexOf('<!--', i);
		if (open < 0) return out + text.slice(i);
		const close = text.indexOf('-->', open + 4);
		if (close < 0) return out + text.slice(i);
		const inner = text.slice(open + 4, close);
		const k = inner.indexOf('_lens:');
		out += k >= 0 && inner.slice(0, k).trim() === '' ? text.slice(i, open) : text.slice(i, close + 3);
		i = close + 3;
	}
}

/**
 * Every `_lens` directive the RENDERER puts on a slide — the parser's tokens, not Lente's read of
 * them. The two differ: `fenceRanges` opens a fence on an info string carrying a backtick where
 * markdown-it opens none, so a directive Lente calls "fenced" is one a reader is shown.
 *
 * BOTH TOKEN KINDS, and the body match crosses `>`. Two holes an independent checker found in the
 * first draft, each measured reaching a real exported envelope:
 *   · `html_inline` — a comment written mid-sentence is not an `html_block`, and reading only blocks
 *     let `Revenue is up. <!-- _lens: internal -->` ride out in the envelope source, which this
 *     file's own docblock calls the worst of the four channels.
 *   · `[^>]*?` cannot cross a `>`, so `<!-- _lens: a>b -secret -->` matched NOTHING and the withheld
 *     id was invisible to the check. Deleting the `>` alone flipped the same deck to a refusal.
 */
function renderedDirectiveBodies(slideSrc) {
	const out = [];
	const scan = (text) => {
		for (const m of String(text).matchAll(/<!--\s*_lens:([\s\S]*?)-->/g)) out.push(m[1]);
	};
	for (const tok of boundaryParser.parse(String(slideSrc ?? ''), {})) {
		if (tok.type === 'html_block') scan(tok.content);
		if (tok.type !== 'inline' || !tok.children) continue;
		for (const child of tok.children) if (child.type === 'html_inline') scan(child.content);
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
	// `callerVerifies` — this function re-renders and reverts, which is what earns the permissive
	// edit scope. A caller without a parser (the Studio) gets the narrow one by default.
	let out = stripExtraLensTags(slideSrc, { callerVerifies: true });
	const tags = parseSlideTags(out);
	for (const id of new Set([...tags.include, ...tags.exclude])) {
		if (exported.has(id)) continue;
		const base = reg.lenses.find((l) => l.id === id)?.base === 'all' ? 'all' : 'none';
		out = applyTag(out, id, base === 'all', base, { callerVerifies: true });
	}
	// AND THE EDIT IS CHECKED, NOT ASSUMED. If any of it moved the slide's block structure, none of
	// it is kept — the author's bytes win over the prune, and the disclosure check below turns the
	// unpruned id into a refusal rather than a leak. Reverting whole is deliberate: attributing the
	// damage to one of several edits would be another derivation, and this file has spent six
	// commits learning what those cost.
	return renderedShape(out) === renderedShape(slideSrc) ? out : slideSrc;
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
	const prunedFm = pruneCaptions(pruneRegistry(fm, keptDefs, defaultId), kept);

	// Identity for everything else: keeping every slide in order, changing no tag AND no view
	// metadata returns the caller's own string rather than a re-assembled copy.
	const identity = kept.length === slides.length && kept.every((v, i) => v === i);
	if (identity && tagsUnchanged && prunedFm === fm) return { ok: true, source: src, views, kept, total: slides.length, default: defaultId };

	return { ok: true, source: prunedFm + body, views, kept, total: slides.length, default: defaultId };
}

/**
 * Front-matter `captions:` renumbered onto the slides this export keeps.
 *
 * A SECOND INDEX-KEYED CHANNEL, AND THE PRUNE SAW ONLY THE FIRST. `pruneRegistry` prunes `lenses:`;
 * everything else in the front matter rode out untouched. `captions:` is a map keyed by 1-BASED
 * AUTHOR SLIDE NUMBER (`lib/core/resolve-captions.mjs`), so leaving it alone did two things at once,
 * both measured on the real CLI:
 *
 *   · DISCLOSURE. A withheld slide's caption shipped verbatim in the `application/lattice+json`
 *     envelope — "LEAKED CAPTION - we expect to lose the Acme suit" in a `--lens brief` export that
 *     withheld the slide it belonged to. That envelope is the channel this file calls the worst of
 *     the four, because it is designed to round-trip losslessly.
 *   · MISNARRATION. With `--captions`, key `2` still addressed the SECOND slide — which after the
 *     projection is a different slide. The withheld slide's caption was spoken over a kept one.
 *
 * So the block is projected like the registry: entries for withheld slides are dropped, and the ones
 * that survive are renumbered to their new position. The block rule comes from `blockLines`, exported
 * from the parser that owns it, rather than restated here (HARD RULE #1) — a second copy of "where
 * does a front-matter block end" is precisely the duplication this branch has already paid for.
 */
function pruneCaptions(fm, kept) {
	if (!fm) return fm;
	const m = /^(---(?:\r\n|\r|\n))([\s\S]*?)((?:\r\n|\r|\n)---[ \t]*(?:\r\n|\r|\n)?)$/.exec(fm);
	if (!m) return fm;
	const entries = blockLines(m[2], 'captions');
	if (!entries.length) return fm;

	const renumber = new Map(kept.map((authored, at) => [authored + 1, at + 1]));
	const entryIndent = Math.min(...entries.map((l) => l.indent));
	const drop = new Set();
	const rewrite = new Map();
	let anyKept = false;
	for (const line of entries) {
		if (line.indent !== entryIndent) continue; // a deeper stray line is not an entry
		const kv = line.text.match(/^(\d+)\s*:\s*([\s\S]*)$/);
		if (!kv) continue;
		const to = renumber.get(Number(kv[1]));
		if (to === undefined) drop.add(line.at);
		else {
			anyKept = true;
			if (to !== Number(kv[1])) rewrite.set(line.at, line.raw.replace(/^(\s*)\d+/, `$1${to}`));
		}
	}
	if (!drop.size && !rewrite.size) return fm;
	// A `captions:` header whose every entry was withheld is left dangling, so it goes too.
	if (!anyKept) drop.add(entries[0].keyAt);

	const body = m[2]
		.split('\n')
		.map((line, at) => (drop.has(at) ? null : (rewrite.get(at) ?? line)))
		.filter((line) => line !== null)
		.join('\n');
	return m[1] + body + m[3];
}

/**
 * WHAT A SHORTER DECK LEGITIMATELY RENDERS DIFFERENTLY — the normalizer the two comparisons below
 * run over every section before diffing it.
 *
 * Each entry is here because a MEASURED comparison refused a correct render on it, and the list was
 * built by diagnosing every refusal over the 147 example decks this repo ships rather than by
 * guessing what might move. It is deliberately narrow: everything NOT listed — `data-footer`,
 * `data-header`, `class`, `style` (which carries the footer and header TEXT), `data-background-color`,
 * and all body markup — is content, and a difference there is the defect the check exists to find.
 *
 * The bound this buys, stated plainly: a withheld slide that changes nothing about a kept slide
 * except its page number, its section number, its accent hue or an SVG defs id passes silently. All
 * four are presentation, none is disclosure, and the alternative was refusing a third of real decks.
 */
const POSITION_ATTRS =
	/\s(?:id|data-lattice-slide|data-authored-slide|data-lattice-pagination|data-lattice-pagination-total)="[^"]*"/g;

/** The PAGE NUMBER the pagination cell prints. Stripping the attribute alone left the rendered text,
 *  which made a shorter deck look like a drifted one: 7 of 15 view subsets of the demo deck reported
 *  drift on nothing but `<span class="lat-pagination">7</span>` becoming `1`. */
const POSITION_TEXT = /(<span class="lat-pagination[^"]*">)[^<]*(<\/span>)/g;

/** The dot rail counts the deck's dividers, so a projection that drops one renders a shorter rail —
 *  or no rail at all. It is dropped from both sides rather than blanked, because "absent" and
 *  "present but empty" are different strings. 23 of 147 decks refused on this alone. */
const PROGRESS_RAIL = /<div class="tile-progress"[^>]*>[\s\S]*?<\/div>/g;

/** The section-number ghost behind a `form watermark` slide, same story: it is the divider count. */
const WATERMARK = /<div class="tile-watermark"[^>]*>[^<]*<\/div>/g;

/** …and the same count stamped on a numbered divider's heading. */
const SECTION_NO = /(\sdata-lat-section=")[^"]*(")/g;

/** The categorical accent CYCLES down the deck, so slide 5 of 9 is `cat-3` and slide 5 of 5 is
 *  `cat-2`. A hue, not a fact about the slide. */
const ACCENT_CYCLE = /\bcat-\d+/g;

/** SVG defs ids are namespaced by SLIDE POSITION — `url(#chart-spine-3-1)`, `pie-wedge`, `radar-area`,
 *  `q-tint`, and the `aria-labelledby` pair every chart carries. The defining `id="…"` is already gone
 *  with POSITION_ATTRS; these are the REFERENCES to it, which are not attributes and so survive. */
const SCOPED_REF = /((?:url\(#|\baria-(?:labelledby|describedby)=")[A-Za-z][\w-]*?-)\d+(-\d+)?/g;

/** Mermaid numbers its own stylesheet scope the same way: `#lattice-mmd-3 .node { … }`. */
const MERMAID_ID = /\blattice-mmd-\d+/g;

const normalize = (s) =>
	String(s)
		.replace(POSITION_ATTRS, '')
		.replace(POSITION_TEXT, '$1$2')
		.replace(PROGRESS_RAIL, '')
		.replace(WATERMARK, '')
		.replace(SECTION_NO, '$1$2')
		.replace(ACCENT_CYCLE, 'cat-N')
		.replace(SCOPED_REF, '$1N$2')
		.replace(MERMAID_ID, 'lattice-mmd-N');

/**
 * Rendered sections grouped by the authored slide they belong to.
 *
 * A single authored slide renders as several sections when it heading-splits or overflows, so the
 * GROUP is the unit of comparison. The walk is `splitSections` — the repo's depth-aware splitter —
 * and not a regex, because `/<section[\s\S]*?<\/section>/` stops at the first `</section>` in the
 * markup and an author may write one: a `<section class="aside">` inside a slide truncated the
 * comparison at that point, so everything after it on that slide went unchecked.
 */
function sectionsByAuthored(html) {
	const by = new Map();
	for (const piece of splitSections(String(html))) {
		if (piece.type !== 'section') continue;
		const m = piece.openTag.match(/data-authored-slide="(\d+)"/);
		if (!m) continue;
		const at = Number(m[1]);
		by.set(at, (by.get(at) ?? '') + normalize(`${piece.openTag}${piece.inner}</section>`));
	}
	return by;
}

/**
 * Every `<style>` in the document, concatenated — the SECOND channel, and the one a section-by-section
 * comparison cannot see.
 *
 * A `<style>` on a withheld slide is document CSS: it governs slides it does not live on. Measured,
 * `section[data-authored-slide="0"] p:nth-of-type(2) { display: none }` written on slide 1 hid a
 * paragraph on slide 0 — so the author previewed a deck with that paragraph hidden, the projection
 * dropped the rule with the slide that carried it, and the paragraph came BACK in the file that was
 * sent. The section markup is byte-identical on both sides; only the stylesheet moved. This is a
 * disclosure, not a presentation difference, and it is the reason the check has two channels.
 */
function documentStyle(html) {
	let out = '';
	for (const m of String(html).matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)) out += m[1];
	return normalize(out);
}

/**
 * Does the RENDER agree with the projection about how many authored slides there are?
 *
 * ENUMERATING THE WAYS TO BREAK AN INVARIANT LOSES TO CHECKING IT. The carrier bakes a view→slides
 * map indexed by authored slide, and every rule that turns one authored slide into several rendered
 * pages has to mark its own breaks so the numbering survives. Two did. A third, `_focusSteps`, did
 * not — and it is defined a few lines from one that does, in the same file. The result was a `brief`
 * reader shown a slide the view excludes while one of its own members was unreachable, on a deck
 * this repo ships, with every gate green.
 *
 * So rather than trust that the fourth one will remember, ask the render: the authored numbers it
 * stamps must be exactly `0 … kept-1`, each appearing at least once. Any new page-multiplier that
 * forgets its mark fails here instead of shipping a shifted map, and it costs one pass over the
 * section tags the caller already has.
 *
 * @param {string} html   the rendered projected deck
 * @param {number} kept   how many authored slides the projection said it kept
 * @returns {{ saw: number[] } | null} the numbers actually stamped, when they disagree
 */
export function authoredIndexDrift(html, kept) {
	const saw = [...new Set([...String(html).matchAll(/data-authored-slide="(\d+)"/g)].map((m) => Number(m[1])))].sort(
		(a, b) => a - b,
	);
	const want = Array.from({ length: kept }, (_, i) => i);
	return saw.length === want.length && saw.every((v, i) => v === want[i]) ? null : { saw };
}

/**
 * The deck at its ORIGINAL LENGTH, with every withheld slide's body emptied.
 *
 * THE MIDDLE TERM OF THE COMPARISON BELOW, and the reason that comparison can be trusted. Diffing a
 * kept slide against its render in the FULL deck sounds right and is not: a projected deck is
 * SHORTER, and plenty about a slide legitimately depends on deck length — the dot rail counts
 * sections, the accent cycles, chart SVGs derive defs ids from slide position. Measured, that
 * comparison refused 52 of 146 shipped example decks: 36%, essentially all of them correct renders
 * that differed only because the deck got shorter. A guard that refuses a third of real decks is not
 * a guard, it is an outage.
 *
 * Emptying instead of removing fixes it by construction. Slide count, positions, rails, ids and
 * pagination are identical between the full deck and this one, so the only thing that CAN differ on
 * a slide the view keeps is what a withheld slide was contributing to it — which is exactly the
 * question. What it drops is precisely the withheld bodies: their `footer:` directives, their
 * `<style>` blocks, their link definitions.
 *
 * The withheld bodies become a single blank line rather than nothing, so the separators around them
 * still read as separators and the split is stable.
 */
export function emptyWithheld(source, kept) {
	const src = normalizeSourceText(String(source ?? ''));
	const fm = frontMatterBlockOf(src);
	const { entries, lead } = chunksWithSeparators(src.slice(fm.length));
	const keep = new Set(kept);
	let body = lead ? `${lead}\n` : '';
	entries.forEach((entry, at) => {
		if (at > 0 || (lead && at === 0)) body += entry.sep === null ? '' : `\n${entry.sep}\n`;
		body += keep.has(at) ? entry.chunk : '\n';
	});
	return fm + body;
}

/**
 * Does any KEPT slide render differently once the deck around it is gone?
 *
 * THE PRUNE'S CHECK IS PER-SLIDE, AND A DECK HAS DOCUMENT-WIDE STATE. `renderedShape` compares one
 * slide before and after its own tags are edited, which is the right question for the edit and blind
 * to everything else. Dropping a slide is not an edit to the slides that remain — and it changes them
 * anyway, through at least four mechanisms measured on the real CLI:
 *
 *   · MARP GLOBAL DIRECTIVES apply "from here on". `<!-- footer: CONFIDENTIAL - do not distribute -->`
 *     on a slide a view excludes governs every kept slide after it. Drop that slide and the stamp
 *     disappears from the file that is actually SENT — measured: 6 occurrences in the full export, 0
 *     in `--lens brief`, exit 0, no warning. The sender previewed it with the marking on. `class:`,
 *     `backgroundColor:`, `header:` and `paginate:` do the same, and `examples/slide-class-forms.md`
 *     — a deck this repo ships — carries a live `<!-- class: diagram dark -->` that a later slide
 *     inherits. This check finds it.
 *   · LINK REFERENCE DEFINITIONS resolve document-wide. `[pk]: https://…` on a dropped slide turns
 *     every reference on kept slides into the literal text `[board pack][pk]`.
 *   · A `<style>` BLOCK is document CSS — see `documentStyle` above, where a withheld slide's rule
 *     was hiding a paragraph on a kept one, and dropping the slide UNHID it.
 *   · Anything else with the same shape. A fuzz over 6,000 adversarial decks put this class at ~4%
 *     of projections, and found nothing else — but "nothing else today" is not a rule.
 *
 * TWO HOPS, BECAUSE ONE COMPARISON CANNOT HOLD BOTH ENDS. The full deck and the projection differ in
 * two unrelated ways at once — the deck got shorter, AND the withheld content is gone — and only the
 * second is a defect. `emptyWithheld` splits them: it holds deck length fixed and removes only the
 * content. So
 *
 *   hop 1 — full vs proxy      : did losing the withheld CONTENT change a kept slide? (the question)
 *   hop 2 — proxy vs projection: does what actually SHIPS differ from the proxy on a kept slide?
 *
 * Hop 2 is what keeps this a statement about the artifact rather than about a stand-in for it. It is
 * not free of false alarms by assumption: over the 147 example decks it fires 0 times, so the proxy
 * is MEASURED to stand for the projection rather than assumed to. When it does fire, the projection's
 * own edits changed a kept slide's render, which is equally a refusal.
 *
 * THE CALLER SUPPLIES THE RENDERER, and that is deliberate: a capability, not a promise. `lib/core`
 * must not depend on `lib/engine`, and the alternative — a boolean saying "I checked" — is the shape
 * this file already regrets elsewhere.
 *
 * @param {string} fullSource   the author's deck, unprojected
 * @param {string} projected    what `projectForExport` emitted
 * @param {number[]} kept       authored indices, in shipped order (`result.kept`)
 * @param {(src: string) => string} render  the engine's render, returning HTML
 * @returns {{ authored: number, channel: 'style'|'section', hop: 1|2 } | null} the first drift, or null
 */
export function crossSlideDrift(fullSource, projected, kept, render) {
	const full = render(normalizeSourceText(String(fullSource ?? '')));
	const proxy = render(emptyWithheld(fullSource, kept));
	const ship = render(String(projected ?? ''));

	if (documentStyle(full) !== documentStyle(proxy)) return { authored: -1, channel: 'style', hop: 1 };
	if (documentStyle(proxy) !== documentStyle(ship)) return { authored: -1, channel: 'style', hop: 2 };

	const before = sectionsByAuthored(full);
	const middle = sectionsByAuthored(proxy);
	const after = sectionsByAuthored(ship);
	for (let at = 0; at < kept.length; at++) {
		if (before.get(kept[at]) !== middle.get(kept[at])) return { authored: kept[at], channel: 'section', hop: 1 };
		if (middle.get(kept[at]) !== after.get(at)) return { authored: kept[at], channel: 'section', hop: 2 };
	}
	return null;
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
	'unprunable': 'a slide still names a view this export does not carry, in a tag this export will not rewrite — either it shares its line with other text, or removing it would change how the slide renders. Give the tag a line of its own with a blank line above and below, clear of any list',
	'authored-index': 'the rendered deck does not number its slides the way the projection did — some rule turned one authored slide into several pages without marking the break, so the view map would point at the wrong slides. Refused rather than shipped',
	'cross-slide': 'a slide this view KEEPS renders differently once the slides around it are gone — usually a `footer:`, `header:`, `class:` or `paginate:` directive, a [link]: definition, or a `<style>` block, set on a slide the view excludes. Move it to a slide the view keeps, or into the deck front matter',
};
