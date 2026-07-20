// @ts-check

import fs from 'node:fs';
import path from 'node:path';
import react from '@astrojs/react';
import starlight from '@astrojs/starlight';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'astro/config';

// Emits dist/chunk-graph.json: for every CLIENT-environment JS chunk, its
// facadeModuleId (source entry, if any), moduleIds (bundled sources), static
// `imports` + `dynamicImports` (as chunk fileNames), and associated CSS —
// straight off Rollup's own OutputChunk objects in `writeBundle`, so it works
// regardless of Astro's own `manifest: false` override for the SSR/prerender
// build (vite-build-config.js) and Astro's own internal `.vite/manifest.json`
// (vite-plugin-ssr-assets.js), which it deletes after use and only covers CSS.
// scripts/inject-modulepreload.mjs reads this file after `astro build` to
// resolve each app island's full transitive chunk list (walking only static
// `imports`, never `dynamicImports` — those are intentionally lazy, e.g.
// Fabricate's React.lazy tab) and hint the browser to fetch them in parallel
// instead of discovering them one BFS depth-level at a time via client:only's
// dynamic import() chain. Deleted by that script once consumed — never ships.
/** @returns {import('vite').Plugin} */
function chunkGraphPlugin() {
	return {
		name: 'lattice:chunk-graph',
		// `applyToEnvironment` is marked `@experimental` in Vite's own types, but
		// is already load-bearing for several of Vite's OWN built-in plugins
		// (vite:esbuild-transpile, vite:manifest, …) — unlikely to be casually
		// dropped. `environment.name === 'client'` matches Astro's literal client
		// environment name (ASTRO_VITE_ENVIRONMENT_NAMES.client in Astro's own
		// core/constants.js) for the Astro/Vite majors pinned today; if a future
		// bump silently changes either, this plugin would apply too broadly
		// (writing chunk-graph.json from the SSR/prerender build instead of — or
		// as well as — the client build) rather than erroring, so a version bump
		// across a MAJOR of either package is worth a quick recheck here.
		applyToEnvironment(environment) {
			return environment.name === 'client';
		},
		writeBundle(options, bundle) {
			/** @type {Record<string, {facadeModuleId: string|null, moduleIds: string[], imports: string[], dynamicImports: string[], css: string[]}>} */
			const graph = {};
			for (const [fileName, chunk] of Object.entries(bundle)) {
				if (chunk.type !== 'chunk') continue;
				graph[fileName] = {
					facadeModuleId: chunk.facadeModuleId || null,
					moduleIds: chunk.moduleIds || [],
					imports: chunk.imports || [],
					dynamicImports: chunk.dynamicImports || [],
					css: chunk.viteMetadata ? Array.from(chunk.viteMetadata.importedCss || []) : [],
				};
			}
			const outDir = options.dir || path.dirname(options.file ?? '');
			fs.mkdirSync(outDir, { recursive: true });
			fs.writeFileSync(path.join(outDir, 'chunk-graph.json'), JSON.stringify(graph));
		},
	};
}

// Production home: https://lattice.style — a GitHub Pages site on a CUSTOM
// DOMAIN, so it serves at the ROOT (base '/'), not under the old project-page
// /lattice/ path. Cloudflare Pages PR previews serve at the root of their
// *.pages.dev host too. So the base is '/' in EVERY environment now — the
// /lattice project-page base is retired (slidewright.github.io/lattice/ 301-
// redirects to the custom domain once it's attached in repo Settings → Pages).
//
// `site` is the canonical origin used for sitemap / og:url / absolute links.
// Precedence: an explicit SITE_URL wins (set this in the Cloudflare project's
// env vars so a preview's canonical URLs can point at the domain rather than
// the *.pages.dev deployment host); otherwise fall back to the per-deployment
// CF_PAGES_URL on Cloudflare, or the lattice.style production origin.
const onCloudflare = Boolean(process.env.CF_PAGES);
export default defineConfig({
	site: process.env.SITE_URL || (onCloudflare ? process.env.CF_PAGES_URL : 'https://lattice.style'),
	base: '/',
	// The Form model moved out of /spec/ into the new "The model" group (it is the
	// engine's design model, not part of the LFM standard) — redirect the old URL
	// so existing links (forms.md §11, the form-manifest ADR) don't 404. The site
	// serves at the root base in every environment, so the destination is a plain
	// root-relative path.
	redirects: { '/spec/form-model': '/model/form-model/' },
	// HTML navigation is cheap, so warm it everywhere: every internal <a>
	// prefetches its destination on hover/focus (the `hover` strategy). The one
	// expensive asset — the ~554KB-gz engine bundle — is NOT covered here; it
	// has its own connection-first policy (src/lib/prefetch-engine.ts, wired via
	// <EngineWarm>) so we never speculatively spend it on a constrained link.
	prefetch: { prefetchAll: true, defaultStrategy: 'hover' },
	// `server.fs.allow: ['..']` lets the dev server resolve repo files above the
	// docs root (e.g. map-complete.js's lib/components basemap JSON). The pure
	// authoring engines (lint-core/review-core/scorecard) and the Theme/Layout
	// Studio cores are CommonJS that Vite's dev server can't transform when a
	// source file is fetched over /@fs — its module.exports reads as no `default`
	// export and the importing <script> block dies. So the browser consumes them
	// through committed esbuild bundles (authoring-core / theme-core /
	// layout-core .generated.js) that load in dev AND ship in the build; no
	// CJS→ESM build nudge is needed. See tools/build-authoring-core.js.
	vite: {
		server: { fs: { allow: ['..'] } },
		// Module (ESM) workers, not the default IIFE: the PDF export worker
		// (src/playground/pdf-export-worker.js) bundles jspdf, whose internal
		// dynamic imports force a code-splitting worker build — which Rollup
		// refuses under IIFE. Every browser that has OffscreenCanvas (the worker
		// path's feature gate) also has module workers, and the main thread falls
		// back to the in-thread build elsewhere.
		worker: { format: 'es' },
		// Tailwind v4 via its first-party Vite plugin. The entry stylesheet
		// (src/styles/tailwind.css) imports only the theme + utilities layers —
		// Preflight is OFF on purpose (see that file's header + the migration
		// decision doc §0). It carries the shadcn ↔ Lattice token bridge.
		plugins: [tailwindcss(), chunkGraphPlugin()],
	},
	integrations: [
		starlight({
			title: 'Lattice',
			// Browser-tab icon: the 1.3KB vector mark (replaced a 26KB 512² PNG).
			// Both this and the in-page header/footer logo (an <img> →
			// lattice-mark-min.svg) are light/dark adaptive via
			// @media(prefers-color-scheme:dark). See design/logo/README.md.
			favicon: '/favicon.svg',
			// Webfonts are self-hosted (src/styles/fonts.css → the vendored woff2),
			// so there is no Google Fonts host to preconnect to and nothing
			// render-blocking on the critical path. (Was a preconnect pair here +
			// in <ResourceHints> for the old google-fonts @import.)
			components: {
				// Re-skin the docs zone as part of the one website (not a bolted-on
				// subsite). Header becomes the site topbar (brand · global nav ·
				// search · palette · light/dark); ThemeProvider sets palette+mode
				// pre-paint from the shared localStorage keys; Sidebar prepends a
				// mobile-only "Site" nav group so the hamburger never dead-ends at
				// the logo; MobileMenuFooter is emptied to leave one control surface.
				Header: './src/components/Header.astro',
				ThemeProvider: './src/components/ThemeProvider.astro',
				Sidebar: './src/components/Sidebar.astro',
				MobileMenuFooter: './src/components/MobileMenuFooter.astro',
			},
			logo: { src: './public/favicon.svg', alt: 'Lattice' },
			description:
				'A slide-deck engine that renders boardroom-ready PDFs from plain Markdown. Themed layouts, Mermaid diagrams, WCAG AA throughout.',
			customCss: ['./src/styles/lattice.css'],
			// Code blocks (Expressive Code). The frame/chrome already tracks the
			// palette because `useStarlightUiThemeColors` binds it to --sl-color-*
			// (which we remap to the site tokens). The default syntax theme
			// (night-owl) is a saturated cool blue that fights the warmer palettes,
			// so swap in the restrained, low-saturation Vitesse pair: it sits
			// calmly inside ANY of the 14 palettes. We keep the UI-theme-colour
			// binding ON (it defaults off once `themes` is set) so the frame stays
			// palette-bound; only the token hues come from Vitesse. The accent-
			// driven bits (focus ring, copy button, active-tab indicator, selection,
			// scrollbar) are bound to var(--accent) in lattice.css (.expressive-code).
			expressiveCode: {
				themes: ['vitesse-light', 'vitesse-dark'],
				useStarlightUiThemeColors: true,
			},
			social: [
				{ icon: 'github', label: 'GitHub', href: 'https://github.com/slidewright/lattice' },
			],
			// The docs sidebar is now docs-only: one coherent learning track,
			// Introduction → Get started → Guides. The apps (Playground, Drawing
			// Board, Workbench) and the Components reference live in the primary
			// nav (src/lib/nav.mjs) — they were previously duplicated here as a
			// "Tools" group, which (together with the old "Get started"/"Guides"
			// top links) is what made the mobile menu stack two overlapping navs.
			// Principles now sits up front under Introduction, and the "Docs"
			// nav entry lands on the Overview hub that also cards into it.
			sidebar: [
				{
					label: 'Introduction',
					items: [
						{ label: 'Overview', slug: 'overview' },
						{ label: 'What is Lattice?', slug: 'introduction' },
						{ label: 'The mental model', slug: 'mental-model' },
						{ label: 'Principles', slug: 'principles' },
						{ label: 'The story', slug: 'story' },
					],
				},
				{
					label: 'Get started',
					items: [{ label: 'Getting started', slug: 'getting-started' }],
				},
				{
					label: 'Guides',
					items: [
						{ label: 'Authoring decks', slug: 'guides/authoring' },
						{ label: 'Themes & palettes', slug: 'guides/themes' },
					],
				},
				{
					// The engine's design MODEL — distinct from the LFM standard below.
					// The concept map is the umbrella over the whole four-axis system;
					// the Form model is the structural detail of one axis (Form). Both
					// mirror in-repo design docs (design/concepts.md, design/forms.md)
					// with a canonical-source banner, like every authored docs page.
					// Kept out of "Specification" so that group reads purely as the LFM
					// standard, not "the standard AND the model".
					label: 'The model',
					items: [
						{ label: 'The concept map', slug: 'model/concepts' },
						{ label: 'The Form model', slug: 'model/form-model' },
					],
				},
				{
					// The owned LFM standard, published as its own group so it reads as
					// a standard, not internal docs. Two registers: the plain-words
					// front door first (authored prose), then the normative specs
					// (generated from spec/*.md by tools/build-spec-docs.js — never
					// hand-edited here, so the site can't drift from the canonical spec).
					label: 'Specification',
					items: [
						{ label: 'Understanding LFM', slug: 'spec/understanding-lfm' },
						{ label: 'LFM 1.0 (spec)', slug: 'spec/lfm' },
						{ label: 'Diagnostic Protocol', slug: 'spec/diagnostics' },
					],
				},
			],
		}),
		// React renderer for the shadcn/ui islands. Astro stays the page-shell
		// owner; React hydrates only where a `client:*` directive marks an
		// interactive island (see the migration decision doc §0/§4.3).
		react(),
	],
});
