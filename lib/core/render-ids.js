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
 * KNOWN LIMIT, for whoever builds the incremental render path: resetting per render means two
 * SEPARATELY rendered sections both start at 1, so composing cached sections into one document
 * can collide. That composition step needs an assembly-time re-uniquing pass — the shape
 * `svgA11yNames.uniquePrefix` (lib/core/svg-a11y-names.js) already implements for its own ids.
 * Per-render determinism is a prerequisite for that work, not a substitute for it.
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
	let max = -1;
	for (const m of probe.matchAll(/lat-r(\d{1,9})-/g)) max = Math.max(max, Number(m[1]));
	return `lat-r${max + 1}-`;
}

/**
 * The next sequence number for `family` within the current render (1-based).
 * Callers own their id template, so the emitted id keeps its exact previous shape.
 */
function nextRenderSeq(family) {
	const n = (seqs.get(family) || 0) + 1;
	seqs.set(family, n);
	return n;
}

/**
 * Start a fresh render's id space. Called once per engine render, before any transform runs.
 * `source` is the render's untrusted markdown; passing it enables the anti-squat prefix. Omitting it
 * keeps today's behaviour (empty prefix), which is what the browser DOM path relies on.
 */
function resetRenderIds(source) {
	seqs.clear();
	prefix = safePrefix(source);
}

/**
 * The namespace prefix every minted id must carry. Empty in the ordinary case, so callers can
 * template it in unconditionally without changing a byte.
 */
function renderIdPrefix() {
	return prefix;
}

module.exports = { nextRenderSeq, resetRenderIds, renderIdPrefix };
