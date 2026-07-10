// The SINGLE choke point every docs-site surface calls the engine's render()
// through — so a future engine-loading gate is ONE edit, not N.
//
// WHY THIS EXISTS. Every docs render surface (single-slide-render.ts,
// playground-engine.ts, theme-studio.js, component-studio.js, share-export.ts
// — the Workbench studios and the Studio's Share/export pipeline) called
// `window.LatticePlayground.render(...)` directly. That's fine as long as
// render() never needs anything ASYNC before it runs — but it does now: KaTeX
// is baked into the engine bundle unconditionally today (~78.5KB gz, 13.5% of
// the bundle, even for decks with zero math — see engineering/decisions/
// 2026-07-10-landing-perf-katex-defer.md §4), and deferring it the way
// Mermaid already is means gating the call with an `await` — load a lazy
// KaTeX provider FIRST, then call the still-synchronous render(). With 7
// independent call sites, that gate would need to be added — and kept correct
// — in 7 places forever after. This module exists so it's added in ONE.
//
// (The Drawing Board's 2 `PG.render()` call sites are NOT migrated here: the
// Drawing Board is frozen — engineering/decisions/2026-07-03-studio-
// succession.md — and ordinary functional/perf work isn't one of its three
// narrow exemptions. See issue #870, which already logged the same pattern
// there for a different fix.)
//
// TODAY this is a thin async pass-through — a pure refactor, no behavior
// change. The KaTeX-defer work lands the actual `await` gate inside
// `renderMarkdown`'s body, touching every call site's OWN code not at all.

import type { LatticePlaygroundEngine } from './playground-global';

export type RenderMarkdownOpts = { baseUrl?: string };
export type RenderMarkdownResult = { html: string; css: string; width?: number; height?: number };

/**
 * Render `source` through the engine. `PG` is passed explicitly (never read
 * off `window` here) so each call site keeps its own "is the engine loaded
 * yet" gating (a `whenReady` poll, `ensureReady()`, a direct `window` check —
 * they genuinely differ) rather than this module reimplementing three
 * different readiness patterns.
 */
export async function renderMarkdown(
	PG: LatticePlaygroundEngine,
	source: string,
	theme: string,
	opts?: RenderMarkdownOpts,
): Promise<RenderMarkdownResult> {
	return PG.render(source, theme, opts);
}
