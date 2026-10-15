// Pure, DOM-free helpers shared by the shell and its tests — so the splitting and
// the "unknown component" detection (the engine of the inline-validation badge)
// are property-testable without rendering anything.

import { type LensRegistry, lensPairs } from '@/lib/lente';
import { slideClassDirectives } from '../../../../lib/core/class-directive-scan.mjs';
import { separatorRanges } from '../../../../lib/core/slide-boundaries.mjs';

// WHERE A SLIDE BEGINS — asked once, of the one module that knows.
//
// This used to scan for `\r?\n-{3,}\r?\n` and mask fenced ranges itself. It found the
// separators the ENGINE finds only when they were written as a bare `---`: `***`, `___`,
// `- - -`, `--- ` with a trailing space, `----` and a `---` indented one to three spaces
// are all thematic breaks to markdown-it and were invisible here, while `Interlude` over
// `---` is a HEADING to the engine and was counted as a separator here. So the rail, the
// editor↔preview sync and the supplied page number were all counting a slide list the
// renderer does not have.
//
// `lib/core/slide-boundaries.mjs` reproduces the engine's own `hr` set from source text —
// fences, `$$` math, HTML blocks, blockquotes, lists, tables and setext underlines
// included — and every locator below reads it, so they cannot disagree with each other or
// with the render.
//
// FRONT MATTER IS THE CALLER'S TO STRIP, and every caller does (`splitSlides(stripFrontMatter(src))`).
// This used to strip it a SECOND time, which was harmless until a body opened with a separator: then
// `---\n\n# A\n\n---\n` read as front matter, two slides read as one, and every slide operation
// indexed a different list than the engine renders and the rail shows (found by the Fuoco checker,
// engineering/decisions/2026-10-15-fuoco-focus-sync.md §11). The body is parsed as the engine
// parses it, once.
function separatorPositions(body: string): Array<{ index: number; length: number }> {
	return separatorRanges(String(body ?? '')).ranges;
}

/** Split a deck BODY (front matter already stripped) into trimmed, non-empty slide chunks. */
export function splitSlides(src: string): string[] {
	const text = String(src ?? '');
	const seps = separatorPositions(text);
	const chunks: string[] = [];
	let pos = 0;
	for (const s of seps) {
		chunks.push(text.slice(pos, s.index));
		pos = s.index + s.length;
	}
	chunks.push(text.slice(pos));
	return chunks.map((s) => s.trim()).filter(Boolean);
}

// WHICH `_class` GOVERNS A SLIDE — asked of the ONE module that already knows.
//
// This used to be a regex here, and it was wrong twice in opposite directions. Unanchored,
// it matched a `_class:` comment anywhere on any line, so a stray character after the `-->`
// left the rail naming a component the engine ignores. Anchoring it to column 0 then lost
// every CONTAINER-PREFIXED directive — and `lib/core/class-directive-scan.mjs` had already
// learned that exact lesson and written it down: markdown-it opens the `html_block` INSIDE
// the container, so `- <!-- … -->`, `> <!-- … -->` and `1. <!-- … -->` all render the class.
// Re-verified against `render()` on 2026-09-05: all three emit `kpi form`, as does a running
// global `<!-- class: kpi -->`, while a TAB-indented directive is an indented code block and
// emits `content form`.
//
// So this delegates (HARD RULE #1, #15). The kernel resolves spot directives, running
// globals, container prefixes, fences and the engine's own line geometry — none of which a
// regex here can carry without becoming a fifth copy of a parser that already exists.

/** The COMPONENT of a `_class` payload — its first token, tolerating trailing modifiers
 *  (`kpi dark scale-xl` → `kpi`). A pane layout (`columns ratio-60-40`, `rows`) names no component:
 *  its panes do (lib/core/pane-spec.js `classLayout`). */
function componentOf(payload: string): string {
	const first = String(payload ?? '').trim().split(/\s+/)[0] ?? '';
	return first === 'columns' || first === 'rows' ? '' : first;
}

/**
 * The `_class` component names used in the source, in document order.
 *
 * ONE ENTRY PER DIRECTIVE LINE, not per slide. The kernel answers "what governs this
 * chunk?", so a running global resolves onto every slide below it — and counting that once
 * per slide would multiply a single typo into an issue count of five. Deduping on the
 * winning directive's own line collapses it back to the literal directives an author wrote,
 * which is what this function has always returned and what `issues` counts.
 */
export function usedComponents(src: string): string[] {
	const seen = new Set<number>();
	const out: string[] = [];
	for (const d of slideClassDirectives(String(src ?? ''))) {
		if (!d?.payload || seen.has(d.line)) continue;
		seen.add(d.line);
		const name = componentOf(d.payload);
		if (name) out.push(name);
	}
	return out;
}

/** Component names used in the source that are NOT in the known set. */
export function unknownComponents(src: string, known: Iterable<string>): string[] {
	const set = new Set(known);
	return usedComponents(src).filter((n) => !set.has(n));
}

/** The component label for a single slide — the class the ENGINE would apply to it, or
 *  `text` for a bare-Markdown slide. Drives the slide-navigator chips.
 *
 *  THE LAST directive, not the first, because that is what the engine applies — measured:
 *  `<!-- _class: big-number -->` … `<!-- _class: stats -->` on one slide renders `stats
 *  form`. Not an exotic input: it is exactly what deleting a `---` to merge two slides
 *  leaves behind, after which the rail used to name the slide that had just been absorbed.
 *  The kernel resolves it; this only picks the component out of the payload. */
export function slideClass(slideSrc: string): string {
	const src = String(slideSrc ?? '');
	const found = slideClassDirectives(src).filter((d) => d?.payload);
	// A panes slide (lib/core/pane-spec.js) is two components, neither of them the slide's: its
	// `_class` names a `columns` / `rows` layout, or it carries two pane markers.
	const panes = (src.match(/^<!--\s*_?pane:[^<>\n]*-->$/gm) || []).length >= 2;
	if (found.length) {
		const payload = found[found.length - 1].payload;
		if (/(?:^|\s)(?:columns|rows)(?:\s|$)/.test(payload)) return 'panes';
		return componentOf(payload) || (panes ? 'panes' : 'text');
	}
	return panes ? 'panes' : 'text';
}

const HEADING_RE = /^[ \t]{0,3}#{1,6}[ \t]+(.+?)[ \t]*#*[ \t]*$/m;
/** The slide's human title — its first Markdown ATX heading, stripped of inline
 *  emphasis/code/link syntax — for a READER-facing navigator (the Read stop, where
 *  a component-class label like `big-number` is jargon the newcomer can't read).
 *  Empty string when the slide has no heading; the caller falls back to "Slide N". */
export function slideTitle(slideSrc: string): string {
	const m = HEADING_RE.exec(String(slideSrc ?? ''));
	if (!m) return '';
	return m[1]
		.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // [text](url) → text
		.replace(/[*_`~]/g, '') // emphasis / code / strike marks
		.trim();
}

// The caret ↔ slide locators (`slideIndexAt`, `slideStartOffset`, `slideEditableOffset`) that
// lived here moved into the slide index, docs/src/lib/fuoco/deck-index.ts (`chunkAt`,
// `sectionStart`, `sectionEditableOffset`), which every pane now shares. Their history — the
// front-matter and empty-chunk defects, the blank-line gap — is pinned by the cases in
// lint.test.ts and slide-sync.test.ts, which now run against the index.

/** A reader-lens id. Any string so a deck-defined `lenses:` registry (projected by @laticent/lente)
 *  can name its own lenses. `full` is always the identity; every other id is a registry (tag-driven,
 *  author-approved) lens. The old author-blind `exec`/`onepager` heuristics are RETIRED. */
export type PresentLens = string;

/** The slides to present under a reader lens, EACH PAIRED with its original 0-based deck index (the
 *  author's slide order) — so a filtered/reordered lens still maps every shown slide back to the number
 *  the author wrote, which the front-matter `say:` map is keyed on. Pure; always non-empty for a
 *  non-empty deck under `full` (falls back to the full deck for an unknown lens rather than nothing).
 *
 *  Projection source: when `registry` defines `lens`, the deterministic, tag-driven @laticent/lente
 *  read path (`lensPairs`) owns it. `full` (or an unknown lens with no registry entry) is the whole deck. */
export function presentationPairs(slides: string[], lens: PresentLens, registry?: LensRegistry): Array<{ slide: string; index: number }> {
	const all = (Array.isArray(slides) ? slides : [])
		.map((slide, index) => ({ slide, index })) // index = ORIGINAL author position (survives the lens filter)
		.filter((p) => typeof p.slide === 'string');
	if (lens === 'full' || all.length === 0) return all;
	// Registry (tag-driven) lens → the library projects it deterministically from approved tags.
	// HONEST projection: an empty lens returns an EMPTY set, NOT the whole deck — a fail-OPEN fallback
	// to `all` would show a scoped reader everything the author kept out of that view, on the one
	// path where nobody vetted the result. (Not a confidentiality claim: client-side projection hides,
	// it does not withhold — design §6.3 as corrected 2026-07-18.) The
	// reader path (PresentOverlay) gates through lensEligibility and renders an explicit "unavailable"
	// state; the author preview shows the real (possibly empty) membership.
	if (registry?.lenses.some((l) => l.id === lens && l.id !== 'full')) {
		return lensPairs(slides, registry, lens);
	}
	return all; // unknown lens with no registry entry → safe fallback to the whole deck
}

/** The slides to present under a reader lens (plan §17: "meet the reader where
 *  they are"). Pure; always non-empty when given a non-empty deck (falls back to the
 *  full deck rather than nothing). */
export function presentationSet(slides: string[], lens: PresentLens, registry?: LensRegistry): string[] {
	return presentationPairs(slides, lens, registry).map((p) => p.slide);
}

/** The ORIGINAL 0-based deck index of each slide in `presentationSet(slides, lens)`,
 *  positionally aligned: `presentationIndices(...)[i]` is the author slide index of the
 *  i-th presented slide. So a number-keyed front-matter say: entry resolves under ANY lens —
 *  `fmSayMap.get(presentationIndices(slides, lens)[i] + 1)` — not just `full`. */
export function presentationIndices(slides: string[], lens: PresentLens, registry?: LensRegistry): number[] {
	return presentationPairs(slides, lens, registry).map((p) => p.index);
}

// NOTE: the toy `scoreDeck` heuristic (a 3-check 0–10 score) was DELETED here — the
// Studio Coach now renders the engine's REAL scorecard (`scorecard.scoreDeck` over
// lint + review findings) via coach/coach-core.ts, so there is one deck assessment,
// not two that drift (HARD RULE #1; succession doc §2.1).
