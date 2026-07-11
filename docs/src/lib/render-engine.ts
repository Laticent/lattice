// The SINGLE choke point every docs-site surface calls the engine's render()
// through — so an engine-loading gate is ONE edit, not N.
//
// WHY THIS EXISTS. Every docs render surface (single-slide-render.ts,
// playground-engine.ts, theme-studio.js, component-studio.js, share-export.ts
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
// (The Drawing Board's `PG.render()` call sites are NOT migrated here: the
// Drawing Board is frozen — engineering/decisions/2026-07-03-studio-
// succession.md — and ordinary functional/perf work isn't one of its three
// narrow exemptions. Its page shell instead eagerly loads the KaTeX provider
// unconditionally, same as its pre-existing behavior — see drawing-board.astro
// and issue #870, which logged the same call-site-migration exemption for a
// different fix.)

import { sourceHasMath } from '../../../lib/engine/math-detect.mjs';
import { deriveKatexProviderUrl, ensureKatexProvider } from './ensure-katex';
import type { LatticePlaygroundEngine } from './playground-global';

export type RenderMarkdownOpts = { baseUrl?: string; stats?: boolean };
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
	if (sourceHasMath(source)) {
		const katexUrl = deriveKatexProviderUrl();
		if (katexUrl) await ensureKatexProvider(katexUrl).catch(() => {});
	}
	return PG.render(source, theme, opts);
}
