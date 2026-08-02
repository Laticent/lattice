// The SINGLE choke point every docs-site surface calls the engine's render()
// through — so an engine-loading gate is ONE edit, not N.
//
// WHY THIS EXISTS. Every docs render surface (single-slide-render.ts,
// playground-engine.ts, the Studio's Fabricate faculties, share-export.ts
// — the Workbench studios and the Studio's Share/export pipeline) used to call
// `window.LatticePlayground.render(...)` directly. That stopped being enough
// once KaTeX needed to load lazily (~78.5KB gz, was 13.5% of the engine bundle
// unconditionally, even for decks with zero math — see engineering/decisions/
// 2026-07-10-landing-perf-katex-defer.md §4): deferring it means gating the
// call with an `await` — load the KaTeX provider FIRST, then call the still-
// synchronous render(). With 7 independent call sites, that gate would need
// to be added — and kept correct — in 7 places forever after. This module
// exists so it's added in ONE: tools/build-playground.js aliases math.js's
// `katex` import to lib/engine/katex-browser-stub.js, so lattice-playground.js
// no longer bundles KaTeX at all — a separate on-demand bundle
// (lib/playground/katex-provider.js → lattice-katex.js) carries it instead,
// loaded here only when a pre-scan (lib/engine/math-detect.mjs's
// sourceHasMath, KaTeX-free by construction) finds math syntax in the source.
//
// (The Drawing Board used to carry an un-migrated `PG.render()` call site here,
// exempted while that surface was frozen; it retired with the route in the Studio
// succession — engineering/decisions/2026-07-03-studio-succession.md P5 — so the
// exemption is moot and every remaining call site goes through this module.)

import { appendAutoGlossary } from '../../../lib/core/glossary-auto.mjs';
import { sourceHasMath } from '../../../lib/engine/math-detect.mjs';
import { deriveKatexProviderUrl, ensureKatexProvider } from './ensure-katex';
import type { LatticePlaygroundEngine } from './playground-global';

export type RenderMarkdownOpts = {
	baseUrl?: string;
	stats?: boolean;
	/** Caller-supplied DECK POSITION for a document holding only part of the deck:
	 *  `offset` slides precede it, the deck holds `total`. Lets a preview render the
	 *  shown slide ALONE and still print a true page number, instead of re-parsing the
	 *  whole deck to recompute a position the caller already knows. */
	page?: {
		offset: number;
		total?: number;
		/** Which divider-delimited section the slide sits in, and how many the deck has —
		 *  what the progress rail and watermark glyph would otherwise recount by walking
		 *  every section of the whole deck. */
		deckSection?: { index: number; total: number };
	};
};
export type RenderMarkdownResult = { html: string; css: string; width?: number; height?: number; stats?: import('@/playground/render-metrics').RenderStats };

/**
 * Render `source` through the engine. `PG` is passed explicitly (never read
 * off `window` here) so each call site keeps its own "is the engine loaded
 * yet" gating (a `whenReady` poll, `ensureReady()`, a direct `window` check —
 * they genuinely differ) rather than this module reimplementing three
 * different readiness patterns.
 *
 * Best-effort KaTeX preload: a failed/slow provider load never blocks or
 * fails the deck render — it just means that render's math falls through
 * math.js's own existing fallback (escaped source text) for THIS pass, the
 * same graceful-degradation contract math.js already promises for a
 * malformed formula. A later render (retry, edit) tries again.
 */
export async function renderMarkdown(
	PG: LatticePlaygroundEngine,
	source: string,
	theme: string,
	opts?: RenderMarkdownOpts,
): Promise<RenderMarkdownResult> {
	// Auto-glossary (#920): the SAME source transform the CLI/export runs, applied at the one
	// chokepoint every docs render surface passes through — so a `glossary: auto` deck grows its
	// reference-appendix slide live in the Studio exactly as it does in the export (HARD RULE #1).
	// A no-op unless the deck opts in and defines terms; idempotent (strips its own trigger).
	const rendered = appendAutoGlossary(source);
	if (sourceHasMath(rendered)) {
		const katexUrl = deriveKatexProviderUrl();
		if (katexUrl) await ensureKatexProvider(katexUrl).catch(() => {});
	}
	return PG.render(rendered, theme, opts);
}
