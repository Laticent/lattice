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
// set (never following dynamicImports by default — those are intentionally
// lazy, e.g. Fabricate's React.lazy tab; eagerly preloading them would defeat
// their own code-splitting) PLUS any explicitly allowlisted "eager in
// practice" dynamic imports (see ENTRIES' `eagerDynamicImportSuffixes` —
// Studio's lint-kernel chunk is reached only via a dynamic import() but
// CodeMirror's `linter()` extension loads it automatically shortly after
// every real mount, not gated by user action, so the blanket
// dynamicImports-exclusion rationale doesn't hold for it), and injects
// <link rel="modulepreload"> for the flattened set into the built page's
// <head>. The chunk-graph.json is an internal build artifact — deleted at
// the end, never shipped.
//
// Usage: node scripts/inject-modulepreload.mjs (run after `astro build`)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DOCS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(DOCS, 'dist');
const GRAPH_PATH = path.join(DIST, 'chunk-graph.json');

// Each entry: the built page to inject into, a suffix that identifies its
// island's entry chunk by facadeModuleId (an absolute path, so match by
// suffix — portable across checkout locations/CI), and an optional list of
// dynamic-import source suffixes that are eager IN PRACTICE despite being
// reached only via `import()` (see the header comment above).
const ENTRIES = [
	{
		page: 'studio/index.html',
		sourceSuffix: 'src/components/studio/StudioShell.tsx',
		// Editor.tsx's loadLintCore() dynamically imports this for CodeMirror's
		// linter() extension, which fires automatically on/shortly after mount
		// whenever build-time lintVocab resolves — true in every production
		// Studio load (Editor.tsx: `useRealLint = !!lintVocab?.names`, and
		// studio.astro always passes a real lintVocab). Not a conditional
		// feature a user opts into, unlike Fabricate's lazy tab.
		eagerDynamicImportSuffixes: ['src/playground/authoring-core.generated.js'],
	},
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

/** True if a chunk's facadeModuleId ends with `sourceSuffix` (normalized for Windows paths). */
function chunkMatchesSuffix(chunk, sourceSuffix) {
	return Boolean(chunk.facadeModuleId?.replace(/\\/g, '/').endsWith(sourceSuffix));
}

/** Find the chunk fileName whose facadeModuleId ends with `sourceSuffix`. */
function findEntryChunk(graph, sourceSuffix) {
	for (const [fileName, chunk] of Object.entries(graph)) {
		if (chunkMatchesSuffix(chunk, sourceSuffix)) return fileName;
	}
	return null;
}

/** BFS over a single chunk's STATIC `imports`, merging into the given sets (mutates them). */
function walkStaticClosure(graph, startFileName, jsChunks, cssFiles) {
	const queue = [startFileName];
	const seen = new Set([...jsChunks, startFileName]);
	jsChunks.add(startFileName);
	while (queue.length > 0) {
		const fileName = queue.shift();
		const chunk = graph[fileName];
		// A fileName can be added to jsChunks (below/by a caller) before we get
		// here to look it up — if `graph` never had a matching entry (shouldn't
		// happen: it's built from the same Rollup bundle these references come
		// from), degrade gracefully rather than mirroring findEntryChunk's throw:
		// aborting the WHOLE island's optimization over one stray reference is
		// worse than a slightly-incomplete preload set. processEntry's own
		// integrity check still catches it if that fileName ends up injected
		// as an href with no file on disk.
		if (!chunk) continue;
		for (const css of chunk.css) cssFiles.add(css);
		for (const dep of chunk.imports) {
			if (seen.has(dep)) continue;
			seen.add(dep);
			jsChunks.add(dep);
			queue.push(dep);
		}
	}
}

/**
 * Resolves an entry's transitive STATIC-import closure — INCLUDING the entry
 * itself: it's the one chunk the astro-island's runtime discovers only via
 * the opaque `component-url` attribute (a dynamic import() from inline
 * hydration bootstrap code Vite can't see either), so without it the single
 * highest-value hint — start fetching the entry the instant <head> parses,
 * instead of waiting for the custom element's connectedCallback to even run
 * — would be missing.
 *
 * `eagerDynamicImportSuffixes` (optional): dynamic-import targets, reached
 * from ANY chunk in the static closure, whose facadeModuleId matches one of
 * these suffixes are ALSO walked (their own static closure merged in) —
 * despite being reached via `import()` — because they're known to load
 * automatically in practice, not gated by user action (see ENTRIES' comment
 * for the concrete case). Every other dynamicImport is left alone, so
 * genuinely-conditional code (a lazy tab) stays lazy.
 */
function resolveTransitiveDeps(graph, entryFileName, eagerDynamicImportSuffixes = []) {
	const jsChunks = new Set();
	const cssFiles = new Set();
	walkStaticClosure(graph, entryFileName, jsChunks, cssFiles);

	if (eagerDynamicImportSuffixes.length > 0) {
		// Fixed-point loop: an eager chunk's own static closure could itself
		// dynamic-import another eager-allowlisted chunk. jsChunks.size only
		// ever grows here (walkStaticClosure is additive), so this terminates.
		let grew = true;
		while (grew) {
			grew = false;
			for (const fileName of [...jsChunks]) {
				const chunk = graph[fileName];
				if (!chunk) continue;
				for (const dynDep of chunk.dynamicImports) {
					if (jsChunks.has(dynDep)) continue;
					const dynChunk = graph[dynDep];
					if (!dynChunk) continue;
					if (eagerDynamicImportSuffixes.some((suffix) => chunkMatchesSuffix(dynChunk, suffix))) {
						walkStaticClosure(graph, dynDep, jsChunks, cssFiles);
						grew = true;
					}
				}
			}
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
	// A plain string .replace() only touches the FIRST occurrence — safe today
	// because these 3 pages' only large dynamic content (serialized React-island
	// props) lives in <body>, never <head>, but require exactly one match rather
	// than silently injecting into a coincidental "</head>"-like substring
	// elsewhere (an inline <script> block, a comment) if that invariant ever
	// stops holding.
	const headCount = html.split('</head>').length - 1;
	if (headCount !== 1) {
		console.warn(`inject-modulepreload: ${pagePath} has ${headCount} "</head>" occurrence(s) (expected exactly 1), skipping`);
		return 0;
	}
	html = html.replace('</head>', `${links}</head>`);
	fs.writeFileSync(full, html);
	return jsChunks.length + cssFiles.length;
}

/**
 * Resolve + inject one entry, then read the page back and verify every
 * injected href actually resolves to a real file in `distDir` — an
 * end-to-end integrity check against the exact thing that would silently
 * degrade if a future Astro/Vite/Rollup change altered chunk naming/shape
 * without tripping the earlier findEntryChunk guard. Throws (does NOT return
 * a partial/best-effort result) on either failure mode, so both are covered
 * by whatever calls this — including a future Vite/Rollup upgrade that
 * changes chunk-graph shape in a way nothing else here would catch.
 *
 * @throws {Error} if no chunk matches `entry.sourceSuffix`, or if an injected
 *   href doesn't resolve to a real file on disk.
 */
function processEntry(graph, entry, distDir = DIST) {
	const entryFileName = findEntryChunk(graph, entry.sourceSuffix);
	if (!entryFileName) {
		// Fail loudly, not a silent skip: a future rename/move of an island's
		// entry component (or a Vite chunking-strategy change that stops
		// giving it its own facade chunk) must not quietly regress this
		// optimization to zero with nothing but a log line to notice it by.
		throw new Error(`inject-modulepreload: no chunk found for ${entry.sourceSuffix} (${entry.page}) — did the component move, or does it no longer get its own facade chunk?`);
	}
	const { jsChunks, cssFiles } = resolveTransitiveDeps(graph, entryFileName, entry.eagerDynamicImportSuffixes);
	const count = injectIntoPage(entry.page, jsChunks, cssFiles, distDir);
	for (const f of [...jsChunks, ...cssFiles]) {
		if (!fs.existsSync(path.join(distDir, f))) {
			throw new Error(`inject-modulepreload: injected href for ${entry.page} references ${f}, which doesn't exist in ${distDir} — chunk-graph.json and dist/ have drifted apart`);
		}
	}
	console.log(`inject-modulepreload: ${entry.page} ← ${jsChunks.length} chunk(s), ${cssFiles.length} css`);
	return count;
}

function main() {
	const graph = loadGraph();
	let totalHints = 0;
	try {
		for (const entry of ENTRIES) {
			totalHints += processEntry(graph, entry);
		}
	} finally {
		fs.rmSync(GRAPH_PATH, { force: true });
	}
	console.log(`inject-modulepreload: done, ${totalHints} hint(s) injected total`);
}

// Export pure helpers for unit tests; only run main() as a CLI.
export { ENTRIES, findEntryChunk, injectIntoPage, MARKER, processEntry, resolveTransitiveDeps };

if (import.meta.url === `file://${process.argv[1]}`) {
	main();
}
