// Build-time asset-version resolver for the playground's runtime-fetched
// assets (the engine bundle, the runtime bundle, and the theme/engine CSS).
//
// THE PROBLEM IT SOLVES. Those three are served from FIXED public/ URLs
// (`playground/themes/lattice.css`, `playground/lattice-runtime.js`,
// `playground/lattice-playground.js`). Astro content-hashes its own page JS,
// so a redeploy refreshes the page — but the fixed-URL assets are cached by
// the browser/CDN and served stale. The visible failure: after a release the
// component list (baked into the fresh page JS) shows a new component, but the
// stale `lattice.css` lacks its rules, so it renders unstyled (a blank funnel,
// a collapsed pricing grid). See the 2026-06 funnel/pricing incident.
//
// THE FIX. `sync-playground-assets.mjs` stages those assets into a
// content-hashed directory `public/playground/v/<hash>/…` each build; this
// resolver returns that `<hash>` so the pages can build cache-busted URLs
// (`playground/v/<hash>/themes/lattice.css`). A content change → a new hash →
// a new URL → a guaranteed cache miss → fresh assets. No change to the fetch
// sites (they only append a filename to `themeBase`).
//
// Build-time only — it reads the filesystem, so it runs in Astro frontmatter
// (SSG, Node), never in a client bundle. Falls back to '' (the legacy
// unversioned base) if sync hasn't run, so an editor/import can't hard-fail.
//
// ANCHOR THE LOOKUP TO THE PROJECT ROOT, NOT `import.meta.url`. Astro/Vite
// BUNDLES this module for the production SSR build and relocates it, so an
// `import.meta.url`-relative path no longer points at `docs/src/playground/` —
// `readdirSync` then throws, the catch swallows it, `assetVersion()` returns
// '', and every page emits the UNVERSIONED fallback URLs
// (`playground/themes/<name>.css`, `playground/lattice-runtime.js`). Those
// files don't exist (sync only writes the *versioned* tree), so the live
// playground + every component specimen 404'd on the engine CSS and the
// runtime. `process.cwd()` is the docs project root under both `astro build`
// and `astro dev` (and any `docs/`-scoped npm script), which survives
// bundling; the `import.meta.url` path stays as a belt-and-braces fallback for
// a plain-Node importer run from elsewhere. See engineering/gotchas.md
// "Playground/specimen previews 404 on the engine CSS + runtime".

import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Candidate `v/` roots, most-reliable first: the cwd-anchored project root
// (correct even after Vite relocates this module), then the legacy
// module-relative path.
const versionedRoots = [
  join(process.cwd(), 'public', 'playground', 'v'),
  join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'public', 'playground', 'v'),
];

/**
 * ONE DIR IS AN INVARIANT HERE, NOT AN ACCIDENT TO LEAN ON. `dirs[0]` is `readdirSync`
 * order, which is not creation order — it is the right answer only because
 * `sync-playground-assets.mjs` deletes the whole `v/` tree each run, so exactly one dir
 * ever exists. Measured with four dirs present, this filesystem returned them
 * lexicographically, which is worse than random rather than better: hash names are
 * content-derived, so `dirs[0]` is reliably the LOWEST hash — deterministically a stale
 * one most of the time. Anything that starts retaining previous hash dirs must make the
 * current hash explicit (a pointer file sync writes) before touching that script, or
 * every page bakes an arbitrary hash. Measured, and costed with the retention options,
 * in engineering/decisions/2026-09-15-playground-asset-retention.md.
 *
 * @returns {string} the content-hash dir name sync created, or '' if none.
 */
export function assetVersion() {
  for (const root of versionedRoots) {
    try {
      const dirs = readdirSync(root).filter((d) => /^[0-9a-f]{8,}$/.test(d));
      if (dirs[0]) return dirs[0];
    } catch {
      // Not at this candidate root — try the next.
    }
  }
  return '';
}

/**
 * The path prefix the playground assets live under, hash-versioned when sync
 * has run. Always ends in a slash, so `prefix + 'themes/'` /
 * `prefix + 'lattice-runtime.js'` compose directly.
 *
 * FAILS LOUD in a production build. `sync:playground` runs before
 * `astro build` in the docs `build` script, so a resolved hash is an
 * invariant there — a miss means the staged `v/<hash>/` tree is missing or
 * unreadable, and emitting the bare `playground/` fallback would ship URLs
 * that 404 (sync only ever writes the *versioned* tree). Throwing fails the
 * deploy instead of silently serving a dead playground — the failure mode of
 * the 2026-06 `import.meta.url` regression, which a silent catch + fallback
 * turned into a green deploy + a site-wide 404. Outside a Vite production
 * build (astro dev, or a bare Node import) it degrades to the legacy
 * unversioned base so tooling and the dev server can't hard-fail.
 * @returns {string}
 */
export function assetBase() {
  const v = assetVersion();
  if (v) return `playground/v/${v}/`;
  if (import.meta.env?.PROD) {
    throw new Error(
      'asset-version: no playground/v/<hash> dir resolved during a production build. ' +
        'Run `npm run sync:playground` before `astro build` — emitting unversioned ' +
        'playground URLs would 404 the engine CSS + runtime.',
    );
  }
  return 'playground/';
}
