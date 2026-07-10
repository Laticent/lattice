// Post-build step: hint the browser to fetch an app island's FULL dependency
// chunk list in parallel, instead of discovering it one BFS depth-level at a
// time via client:only/client:load's dynamic import() chain.
//
// WHY: Vite/Rollup can't statically see past a dynamic import() (that's the
// whole point of code-splitting), so it can't auto-emit <link rel=modulepreload>
// for what an island will need — confirmed true for client:only (studio.astro)
// AND client:load (workbench.astro, playground.astro) alike; this isn't a
// client:only-specific gap. A real unthrottled trace of a cold Studio load
// showed the module graph resolving in ~6 sequential network round-trips (one
// per import depth-level); on a real connection each round-trip's latency
// compounds. See engineering/decisions/2026-07-10-landing-perf-katex-defer.md
// for the investigation this follows on from.
//
// HOW: astro.config.mjs's `chunkGraphPlugin` emits dist/chunk-graph.json at
// build time (Rollup's own OutputChunk.imports/dynamicImports/viteMetadata —
// see that plugin's comment for why Astro's own manifest can't be reused).
// This script reads it, resolves each entry's TRANSITIVE STATIC-import chunk
// set (never following dynamicImports — those are intentionally lazy, e.g.
// Fabricate's React.lazy tab; eagerly preloading them would defeat their own
// code-splitting), and injects <link rel="modulepreload"> for the flattened
// set into the built page's <head>. The chunk-graph.json is an internal build
// artifact — deleted at the end, never shipped.
//
// Usage: node scripts/inject-modulepreload.mjs (run after `astro build`)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DOCS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(DOCS, 'dist');
const GRAPH_PATH = path.join(DIST, 'chunk-graph.json');

// Each entry: the built page to inject into, and a suffix that identifies its
// island's entry chunk by facadeModuleId (an absolute path, so match by
// suffix — portable across checkout locations/CI).
const ENTRIES = [
	{ page: 'studio/index.html', sourceSuffix: 'src/components/studio/StudioShell.tsx' },
	{ page: 'workbench/index.html', sourceSuffix: 'src/components/workbench/WorkbenchApp.tsx' },
	{ page: 'playground/index.html', sourceSuffix: 'src/components/playground/PlaygroundApp.tsx' },
];

const MARKER = '<!-- lattice:modulepreload -->';

function loadGraph() {
	if (!fs.existsSync(GRAPH_PATH)) {
		throw new Error(`${GRAPH_PATH} not found — did astro build run with chunkGraphPlugin active?`);
	}
	return JSON.parse(fs.readFileSync(GRAPH_PATH, 'utf8'));
}

/** Find the chunk fileName whose facadeModuleId ends with `sourceSuffix`. */
function findEntryChunk(graph, sourceSuffix) {
	for (const [fileName, chunk] of Object.entries(graph)) {
		if (chunk.facadeModuleId?.replace(/\\/g, '/').endsWith(sourceSuffix)) {
			return fileName;
		}
	}
	return null;
}

/**
 * BFS over STATIC `imports` only (never `dynamicImports` — those are
 * intentionally lazy). Returns the transitive chunk fileName set — INCLUDING
 * the entry itself: it's the one chunk the astro-island's runtime discovers
 * only via the opaque `component-url` attribute (a dynamic import() from
 * inline hydration bootstrap code Vite can't see either), so without it the
 * single highest-value hint — start fetching the entry the instant <head>
 * parses, instead of waiting for the custom element's connectedCallback to
 * even run — would be missing. Plus the union of every visited chunk's
 * associated CSS.
 */
function resolveTransitiveDeps(graph, entryFileName) {
	const jsChunks = new Set([entryFileName]);
	const cssFiles = new Set();
	const queue = [entryFileName];
	const seen = new Set([entryFileName]);
	while (queue.length > 0) {
		const fileName = queue.shift();
		const chunk = graph[fileName];
		if (!chunk) continue;
		for (const css of chunk.css) cssFiles.add(css);
		for (const dep of chunk.imports) {
			if (seen.has(dep)) continue;
			seen.add(dep);
			jsChunks.add(dep);
			queue.push(dep);
		}
	}
	return { jsChunks: [...jsChunks], cssFiles: [...cssFiles] };
}

function injectIntoPage(pagePath, jsChunks, cssFiles, distDir = DIST) {
	const full = path.join(distDir, pagePath);
	if (!fs.existsSync(full)) {
		console.warn(`inject-modulepreload: ${pagePath} not found, skipping`);
		return 0;
	}
	let html = fs.readFileSync(full, 'utf8');
	if (html.includes(MARKER)) return 0; // already injected — don't double up
	const links =
		MARKER +
		jsChunks.map((f) => `<link rel="modulepreload" href="/${f}">`).join('') +
		cssFiles.map((f) => `<link rel="stylesheet" href="/${f}">`).join('');
	if (!html.includes('</head>')) {
		console.warn(`inject-modulepreload: ${pagePath} has no </head>, skipping`);
		return 0;
	}
	html = html.replace('</head>', `${links}</head>`);
	fs.writeFileSync(full, html);
	return jsChunks.length + cssFiles.length;
}

function main() {
	const graph = loadGraph();
	let totalHints = 0;
	for (const entry of ENTRIES) {
		const entryFileName = findEntryChunk(graph, entry.sourceSuffix);
		if (!entryFileName) {
			// Fail loudly, not a silent skip: a future rename/move of an island's
			// entry component (or a Vite chunking-strategy change that stops
			// giving it its own facade chunk) must not quietly regress this
			// optimization to zero with nothing but a log line to notice it by.
			fs.rmSync(GRAPH_PATH, { force: true });
			throw new Error(`inject-modulepreload: no chunk found for ${entry.sourceSuffix} (${entry.page}) — did the component move, or does it no longer get its own facade chunk?`);
		}
		const { jsChunks, cssFiles } = resolveTransitiveDeps(graph, entryFileName);
		const count = injectIntoPage(entry.page, jsChunks, cssFiles);
		totalHints += count;
		console.log(`inject-modulepreload: ${entry.page} ← ${jsChunks.length} chunk(s), ${cssFiles.length} css`);
	}
	fs.rmSync(GRAPH_PATH, { force: true });
	console.log(`inject-modulepreload: done, ${totalHints} hint(s) injected total`);
}

// Export pure helpers for unit tests; only run main() as a CLI.
export { ENTRIES, findEntryChunk, injectIntoPage, MARKER, resolveTransitiveDeps };

if (import.meta.url === `file://${process.argv[1]}`) {
	main();
}
