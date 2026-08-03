/**
 * render-ids.js — render-scoped id sequences for SVG `<defs>`.
 *
 * WHY THIS EXISTS. An SVG `fill` cannot take a CSS gradient, so several chart kernels emit a
 * per-wedge / per-slot `<linearGradient>` or `<radialGradient>` and reference it by id. Those ids
 * must be unique WITHIN a document (the SVG duplicate-id trap: a second `#pie-wedge-1` in the same
 * document makes every reference resolve to the FIRST one, so wedges silently share a gradient).
 * Each kernel therefore minted them from its own module-level counter.
 *
 * The bug that produced this module: a module-level counter is scoped to the PROCESS, not the
 * render — so it kept climbing across renders and `render(deck)` was not a pure function of its
 * input. Rendering the same deck twice in one process produced different bytes (measured: 24 of
 * 112 committed decks differed on a second render — `gantt-fill-pass-1` → `-2`, `pie-wedge-1` →
 * `-6`). Internally consistent per render, so no visible defect, which is why it survived: ids
 * and the references to them are minted together.
 *
 * It matters because of what it costs to TEST a render cache. Every design in
 * `engineering/decisions/2026-07-15-incremental-per-slide-render-cache.md` is guarded by an
 * `incrementalRender === wholeRender` property test. Such a test is writable against a
 * non-deterministic renderer — but only by normalizing the ids away first, and a normalizer broad
 * enough to hide the id drift also hides real drift of the same shape, which is the one thing the
 * test exists to catch. Determinism is what lets the guard be a plain byte comparison.
 *
 * So: ONE shared sequence registry, reset at the start of each engine render
 * (`renderHtml` in lib/engine/index.js). The ids keep their exact previous SHAPE, and a
 * single-render process (the CLI, the export) is byte-identical to before — its first render
 * always started at 1 and still does. What changes is that the SECOND render now also starts
 * at 1, which is the property that was missing.
 *
 * Pure + fs-free, so the browser-bundled chart kernels share this one implementation
 * (HARD RULE #1) rather than each keeping a counter.
 *
 * THE COST OF DETERMINISM, AND THE GUARD FOR IT. Predictable ids are squattable ids: a deck can
 * write raw HTML on an earlier slide declaring `<radialGradient id="pie-wedge-1">`, and SVG's
 * "first def in tree order wins for every reference" then paints the real chart's wedges with the
 * author's gradient while the legend still reads correctly — a chart that lies. This was already
 * possible before the sequences became render-scoped, but only on a process's FIRST render; from
 * the second on, the climbing module counter moved the real ids out of the way by accident. On the
 * multi-render surfaces this change exists for (the Studio preview, the Playground, the overview
 * grid) that accidental escape is gone, so the collision is now permanent rather than one-shot.
 *
 * So `resetRenderIds(source)` takes the render's UNTRUSTED SOURCE and, when it finds any of the
 * minting families in it, shifts the whole id namespace behind a prefix that provably does not
 * occur there (`renderIdPrefix`). Absent a mention the prefix is EMPTY, so every real deck — none
 * of the 112 committed ones names a family — is byte-identical. Two lessons from
 * `svgA11yNames.uniquePrefix`, which has been broken twice by exactly this shape, are baked in:
 * probe the DECODED id space as well as the raw text (`id="lat&#x2d;r0&#x2d;pie-wedge-1"` parses to
 * a literal), and never return a candidate that was not itself tested — the prefix here is
 * `max(existing lat-r<N>-) + 1`, which is free by construction and needs no bail-out branch.
 *
 * SLIDE SCOPING, and what it fixed. The sequences are keyed by family AND by the shown slide's
 * ABSOLUTE position in the deck (`setRenderSection`, fed by the caller-supplied `page.offset`), so
 * the ids read `pie-wedge-<slide>-<n>`. Without it a slide rendered ALONE numbered from 1 while the
 * same slide inside its deck numbered from wherever the earlier slides left off — invisible, since
 * an id and its references are minted together, but it meant a preview render and an export render
 * of one slide were never the same bytes. Seeding from a COUNT was impossible: a lone slice would
 * have to know how many gradients the earlier slides emitted, which only rendering them reveals.
 * Its POSITION, by contrast, is metadata the caller already holds.
 *
 * KNOWN LIMIT, for whoever builds the incremental render path: two SEPARATELY rendered sections at
 * the SAME deck position (or rendered with no position supplied at all, where both fall back to
 * slide 1) still start at 1, so composing cached sections into one document can collide. Slide
 * scoping narrows that to same-position collisions; it does not remove the need for an
 * assembly-time re-uniquing pass — the shape `svgA11yNames.uniquePrefix` (lib/core/svg-a11y-names.js)
 * already implements for its own ids. Per-render determinism is a prerequisite for that work, not a
 * substitute for it.
 *
 * KNOWN LIMIT 2, unguarded: `renderHtml` must not be RE-ENTERED. The old module counters were
 * monotone, so a nested or interleaved render was harmless — ids kept climbing and stayed unique.
 * A per-render reset makes re-entrancy corrupting: an inner render restarts the sequence and the
 * outer document ends up with two `#pie-wedge-1`. Nothing can reach it today (the whole render
 * path is synchronous, there is no nested `renderHtml` caller, and `md.renderInline` re-enters the
 * PARSER without minting ids), which is exactly why it needs writing down: adding an `await`, a
 * worker, or a nested render to the render path breaks this silently.
 */

const seqs = new Map();
let prefix = '';
// The absolute 0-based position, within the WHOLE deck, of this document's first section. 0 for a
// deck render (it starts at the deck's first slide); the caller-supplied `page.offset` for a slice.
let slideBase = 0;
// The absolute 1-based slide number currently being transformed, or null when nothing has said.
let slide = null;

// The five families that mint document-scoped `<defs>` ids through this module. Keep this in sync
// with the call sites (`grep -rn nextRenderSeq lib/`) — a family missing here is a family whose ids
// can be squatted.
//
// Cost of the probe, since it runs on every render over the whole source: 0.112ms for the 117-slide
// gallery (59.6KB), 0.022ms for a 5.3KB deck. It scales with source size the way the render does, so
// it is ~0.5% of the whole-deck render it accompanies. One alternation rather than five `includes`
// scans is only a marginal win (0.112 vs 0.126ms measured) — it is written this way for clarity, not
// for the speed. The decode branch is the expensive one (0.52ms on the same deck) and never fires on
// real content: none of the 112 committed decks contains a numeric character reference at all.
const FAMILIES = /pie-wedge|radar-area|chart-spine|gantt-fill|q-tint/;

/** Decode NUMERIC character references — `&#DDD;` and `&#xHH;` are the whole syntax. */
function decodeNumericRefs(text) {
	return text.replace(/&#(?:x([0-9a-f]+)|(\d+));/gi, (_m, hex, dec) =>
		String.fromCodePoint(parseInt(hex || dec, hex ? 16 : 10)));
}

/**
 * A namespace prefix that provably does not occur in `text`, or `''` when `text` never mentions a
 * minting family (the case for every real deck, which is why the empty prefix keeps output bytes
 * unchanged). Probing beats guessing: `max(lat-r<N>-) + 1` is absent by construction.
 */
function safePrefix(text) {
	if (!text) return '';
	// Decoding is the expensive half, so it is skipped unless the text can contain a reference at
	// all. The family test itself runs on the decoded space too — an ENCODED family name has to
	// move us as surely as a literal one.
	const probe = text.includes('&#') ? `${text}\n${decodeNumericRefs(text)}` : text;
	if (!FAMILIES.test(probe)) return '';
	// BIGINT, so there is no width at which this stops being exact. `\d{1,9}` originally capped what
	// the probe could SEE, which let `lat-r999999999-` force a ten-digit prefix invisible to the same
	// probe — squattable. The first repair widened to `\d+` with a `Number` guard that fell back to a
	// TIMESTAMP, and that was worse: it made `render()` non-deterministic for the same input, which is
	// the one property this whole module exists to provide. BigInt needs neither a cap nor a fallback,
	// so `max + 1` stays free BY CONSTRUCTION at any width — which is the rule this function's header
	// states and both earlier versions broke.
	let max = -1n;
	// `\d+`, NOT `\d{1,9}`. The cap meant a deck mentioning `lat-r999999999-` forced the prefix to
	// `lat-r1000000000-` — ten digits, which the capped probe then could NOT see — so squatting that
	// exact id collided with the real chart's first gradient and SVG's first-def-wins painted it with
	// the author's fill while the legend still read correctly. Exactly the "chart that lies" this
	// module's header describes, reachable through the one candidate the probe could not test.
	// `Number.MAX_SAFE_INTEGER` bounds the arithmetic; beyond it we decline rather than return a
	// candidate we cannot reason about, which is this function's own stated rule.
	for (const m of probe.matchAll(/lat-r(\d+)-/g)) {
		const n = BigInt(m[1]);
		if (n > max) max = n;
	}
	return `lat-r${max + 1n}-`;
}

/**
 * The next sequence discriminator for `family`, as a STRING the caller templates into its id.
 *
 * WITH a slide in scope (`setRenderSection`) it is `"<slide>-<n>"`, where `<slide>` is the shown
 * slide's ABSOLUTE 1-based position in the deck and `<n>` counts that family within THAT slide.
 * Without one it is the bare `"<n>"` counting from the document start, exactly as before.
 *
 * WHY THE SLIDE IS IN THE ID. The counter numbers from the start of the document being rendered, so
 * the same chart is `pie-wedge-1` when its slide is previewed alone and `pie-wedge-3` inside the
 * deck. Nothing breaks — each document is internally consistent, and an id is minted together with
 * every reference to it — but it means a preview render and an export render of one slide are not
 * the same bytes, which is what a per-slide render cache's `incremental === whole` guard has to be
 * able to assert (2026-07-15-incremental-per-slide-render-cache.md), and it was 87 of the 97
 * residual slides in `npm run equiv`.
 *
 * A SEED CANNOT COME FROM THE CALLER. To emit `pie-wedge-3` a lone slice would have to know how many
 * gradients the two slides before it produced — a property of what the chart kernels emitted,
 * knowable only by rendering them, which is the whole-deck parse the slice path exists to skip. The
 * slide's POSITION is caller-held (the same `page.offset` the page number already rides on), so the
 * id is scoped by it instead of seeded from a count. Uniqueness within the document is preserved by
 * construction: slide number × per-slide ordinal.
 *
 * A STRING, not a number, so every call site keeps its template verbatim
 * (`` `${renderIdPrefix()}pie-wedge-${nextRenderSeq('pie-wedge')}` ``) and the shape stays readable
 * in an export diff, which is why these were ordinals rather than hashes in the first place.
 */
function nextRenderSeq(family) {
	// Keyed by family AND slide, so the per-slide sequence restarts at 1 for each slide — which is
	// exactly what makes a slice rendered at offset k emit the same ids as section k of the deck.
	// `\0` WRITTEN AS AN ESCAPE, never as a raw byte. A literal NUL in the source makes this file
	// BINARY to grep/ripgrep — `rg nextRenderSeq lib/` then silently omits the very file that defines
	// it, which is the command this module's own FAMILIES comment tells maintainers to run. It also
	// renders as a space in a diff, so review cannot see it. (That happened here and shipped as far as
	// the red team.) NUL is still the right SEPARATOR — a family name cannot contain one — so only the
	// encoding changed.
	const key = slide === null ? family : `${family}\0${slide}`;
	const n = (seqs.get(key) || 0) + 1;
	seqs.set(key, n);
	return slide === null ? String(n) : `${slide}-${n}`;
}

/**
 * Start a fresh render's id space. Called once per engine render, before any transform runs.
 * `source` is the render's untrusted markdown; passing it enables the anti-squat prefix. Omitting it
 * keeps today's behavior (empty prefix), which is what the browser DOM path relies on.
 *
 * `slideOffset` is the caller-supplied `page.offset` — where this document's FIRST section sits in
 * the real deck. Absent (every export and CLI render, which hand over no position) it is 0, so a
 * whole-deck render numbers its slides 1..N off its own sections and is unaffected.
 */
function resetRenderIds(source, slideOffset) {
	seqs.clear();
	prefix = safePrefix(source);
	slideBase = Number.isInteger(slideOffset) && slideOffset > 0 ? slideOffset : 0;
	slide = null;
}

/**
 * Enter section `i` of the document being rendered (0-based), so ids minted from here on are scoped
 * to its absolute slide number. Call it for EVERY top-level section, chart-bearing or not — the
 * index has to be the document's section ordinal, not a count of the interesting ones, or a slice
 * and its deck section stop agreeing.
 *
 * `setRenderSection(null)` leaves slide scope; the browser DOM path never enters it at all, so its
 * ids keep the bare document-start ordinal they have always had (there is no deck there to be
 * positioned within, and the climbing module counter is what keeps them unique in a live document).
 */
function setRenderSection(i) {
	slide = Number.isInteger(i) && i >= 0 ? slideBase + i + 1 : null;
}

/**
 * The namespace prefix every minted id must carry. Empty in the ordinary case, so callers can
 * template it in unconditionally without changing a byte.
 */
function renderIdPrefix() {
	return prefix;
}

module.exports = { nextRenderSeq, resetRenderIds, renderIdPrefix, setRenderSection };
