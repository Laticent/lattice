// Static-analysis regression net for scripts/inject-modulepreload.mjs's ENTRIES
// list: finds every `client:only` island under src/pages/ and flags any whose
// source component isn't covered by an ENTRIES entry.
//
// WHY: the modulepreload injector (engineering/decisions/2026-07-10-landing-
// perf-katex-defer.md §6) only helps the 3 islands explicitly listed in
// ENTRIES today (Studio/Workbench/Playground). Nothing stops a FUTURE page
// from adopting the same zero-SSR client:only pattern without anyone adding it
// to that list — the build wouldn't fail (client:only islands work fine
// without modulepreload, just slower), so this wouldn't be caught by
// inject-modulepreload.mjs's own build-time integrity check, only by a human
// noticing. `client:only` specifically (not `client:load`) is what this
// checks: it's the zero-SSR, whole-page-blank-until-hydrated pattern the
// original investigation was about — client:load islands (Workbench,
// Playground) at least paint a site header first, and smaller client:load/
// client:idle/client:visible islands elsewhere (the landing page) already use
// the proven static-shell + skeleton pattern instead, so blanket-flagging
// every client:load usage would be noisy without being more useful.
//
// This is advisory, not a build gate (see .github/workflows/
// modulepreload-coverage-nightly.yml — nightly, opens/appends a tracking
// issue on a miss, same shape as perf-nightly.yml). A missing entry is a
// missed optimization, not a broken build, so it doesn't belong on the PR
// critical path.
//
// Usage: node scripts/check-modulepreload-coverage.mjs [--md <path>]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ENTRIES } from './inject-modulepreload.mjs';

const DOCS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PAGES_DIR = path.join(DOCS, 'src/pages');

/**
 * Find every `<ComponentName client:only ...>` usage in an .astro file, and
 * resolve each to its source path via the frontmatter's `import Name from
 * '...'` statement. Returns [{ componentName, sourcePath }] — sourcePath is
 * absolute, or null if no matching import was found (e.g. a namespace/default
 * export pattern this simple regex doesn't cover — reported as unresolved
 * rather than silently skipped).
 */
export function findClientOnlyIslands(astroSource, astroFilePath) {
	const results = [];
	const usageRe = /<([A-Z][A-Za-z0-9_]*)\b[^>]*\bclient:only\b/g;
	const seen = new Set();
	let m;
	while ((m = usageRe.exec(astroSource))) {
		const componentName = m[1];
		if (seen.has(componentName)) continue;
		seen.add(componentName);
		const importRe = new RegExp(`import\\s+${componentName}\\s+from\\s+['"]([^'"]+)['"]`);
		const importMatch = astroSource.match(importRe);
		const sourcePath = importMatch ? path.resolve(path.dirname(astroFilePath), importMatch[1]) : null;
		results.push({ componentName, sourcePath });
	}
	return results;
}

/** True if `sourcePath` is covered by some ENTRIES item's sourceSuffix. */
export function isCovered(sourcePath, entries = ENTRIES) {
	if (!sourcePath) return false;
	const normalized = sourcePath.replace(/\\/g, '/');
	return entries.some((e) => normalized.endsWith(e.sourceSuffix));
}

/** Scan every .astro file directly under src/pages/ (not nested route dirs — those are per-component specimen pages, a different pattern) for uncovered client:only islands. */
export function findUncoveredIslands(pagesDir = PAGES_DIR, entries = ENTRIES) {
	const uncovered = [];
	const files = fs.readdirSync(pagesDir).filter((f) => f.endsWith('.astro'));
	for (const file of files) {
		const full = path.join(pagesDir, file);
		const source = fs.readFileSync(full, 'utf8');
		for (const island of findClientOnlyIslands(source, full)) {
			if (!isCovered(island.sourcePath, entries)) {
				uncovered.push({ page: file, ...island });
			}
		}
	}
	return uncovered;
}

function main() {
	const uncovered = findUncoveredIslands();
	const mdFlagIdx = process.argv.indexOf('--md');
	if (uncovered.length === 0) {
		console.log('check-modulepreload-coverage: clean — every client:only island under src/pages/ is covered.');
		return;
	}
	const lines = [
		'## Uncovered `client:only` islands',
		'',
		'These pages hydrate a component with `client:only` but have no matching entry in `docs/scripts/inject-modulepreload.mjs`\'s `ENTRIES` — they get zero `<link rel=modulepreload>` hints, the exact pattern that motivated that fix in the first place.',
		'',
		'| Page | Component | Resolved source |',
		'|---|---|---|',
		...uncovered.map((u) => `| \`${u.page}\` | \`${u.componentName}\` | ${u.sourcePath ? `\`${path.relative(DOCS, u.sourcePath)}\`` : '_unresolved — check the import statement_'} |`),
		'',
		'Add an entry to `ENTRIES` in `docs/scripts/inject-modulepreload.mjs` (see the existing 3 for the shape), or if this island is intentionally excluded, note why so a future run doesn\'t re-flag it.',
	];
	const report = lines.join('\n');
	console.log(report);
	if (mdFlagIdx !== -1 && process.argv[mdFlagIdx + 1]) {
		fs.writeFileSync(process.argv[mdFlagIdx + 1], report);
	}
	process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
	main();
}
