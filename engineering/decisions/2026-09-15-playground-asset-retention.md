---
status: proposed
summary: >
  A docs-site deploy deletes every previous `playground/v/<hash>/` directory, so a page that
  was open when the deploy landed 404s on the first asset it asks for afterwards. Theme CSS is
  fetched lazily per palette, so switching palette in a long-lived tab is exactly that first
  ask — the unexplained `theme crepuscolo (404)` from the original settings-panel report. The
  fetcher caches a 404 negatively on purpose (many palettes ship no `-dark` companion), so the
  palette never recovers for the life of the page. Measured across a simulated deploy: all six
  probed assets under the previous hash return 404. Three options costed here — retain the
  previous N hash dirs (12 MB / 437 files each, and it needs an `assetVersion()` fix first),
  teach the fetcher to recover from a stale base via an unversioned pointer file, or stage an
  unversioned fallback copy of the theme CSS. Not decided — retention is shared state outside
  the branch, so the call is the human's.
---

# A deploy deletes every previous playground asset hash, and an open page 404s

**Symptom.** A tab that has been open across a deploy fails on the next asset it
fetches. The reported instance was `theme crepuscolo (404)` after switching palette
in the Playground. Nothing in the settings panel caused it, which is why it stayed
unexplained through #2217.

**Root cause.** Three mechanisms, each correct on its own, compose into this:

1. `docs/scripts/sync-playground-assets.mjs:280-292` deletes the **whole** `v/` tree
   before staging, so a deploy publishes exactly one hash directory and every
   predecessor stops existing at the origin:

   ```js
   // Rewrite the whole versioned tree so stale hash dirs don't accumulate.
   // … (the "KNOWN CONSEQUENCE" comment this note added) …
   const versionedRoot = join(pgDir, 'v');
   rmSync(versionedRoot, { recursive: true, force: true });
   ```

   "Stops existing at the origin" is a property of how this repo deploys, not of the
   code: both targets publish a complete snapshot of the build output — GitHub Pages
   via an uploaded artifact (`.github/workflows/docs.yml`) and PR previews via
   `wrangler pages deploy docs/dist` (`.github/workflows/docs-preview.yml`) — so a path
   absent from the output is absent at the origin. A host that rsynced additively would
   not behave this way.

2. `docs/src/playground/asset-version.mjs` bakes the hash into each page at **build
   time**. A page therefore references one hash dir forever — the one that existed
   when it was served. That is the whole point of the design (a content change is a
   new URL, so a CDN can never serve stale bytes), and it is not in question here.

3. `docs/src/lib/theme-fetch.ts:63` fetches a palette's CSS **lazily, on first use**:

   ```js
   fetched[name] = fetch(themeBase + name + '.css')
     .then((r) => { if (!r.ok) throw Object.assign(new Error('theme ' + name + ' (' + r.status + ')'), { status: r.status }); … })
   ```

   That `'theme ' + name + ' (' + r.status + ')'` is the reported string, verbatim.

So the eager assets a page already loaded and parsed survive a deploy fine — they
are in memory. A **lazy** one does not: it is requested after the deploy, against a
directory that no longer exists.

**And it does not recover.** The same fetcher negatively caches a 404 deliberately
(`theme-fetch.ts:70-76`): many palettes ship no `-dark` companion, and `ensure(dark)`
fetches it with a swallowing `.catch`, so re-fetching that 404 on every render would
be pure waste. The consequence here is that one 404 pins the palette as broken for
the life of the page. A retry cannot clear it, and neither can switching away and
back.

## Evidence

A deploy simulated locally: stage the assets, change one asset's bytes, re-stage.
Served `docs/public` over HTTP (Astro copies `public/` verbatim into the build
output) and probed both hashes with `curl`.

```
hash A = 472bb1922880   (what a page opened BEFORE the deploy still references)
hash B = 3aa59a241df8   (what the deploy published)

dirs present under public/playground/v/ after the deploy:  3aa59a241df8
```

| asset (under `playground/v/<hash>/`) | hash A after deploy | hash B after deploy |
|---|---|---|
| `themes/crepuscolo.css` | **404** | 200 |
| `themes/lattice.css` | **404** | 200 |
| `lattice-runtime.js` | **404** | 200 |
| `lattice-playground.js` | **404** | 200 |
| `lattice-katex.js` | **404** | 200 |
| `themes/fonts/caveat-400.woff2` | **404** | 200 |

Every asset under the previous hash is gone. Before the deploy, the same six probes
under hash A returned 200 (`themes/fonts/` was probed once with a wrong filename and
re-probed with a real one).

**Scale, measured on the current tree:** one hash directory is **12 MB / 437 files**;
its `themes/` subtree alone is **1.6 MB / 51 files**.

## What is NOT wrong

The hashing itself. It exists because the fixed-URL assets were served stale by the
browser/CDN after a redeploy — the 2026-06 funnel/pricing incident — and it solved
that. The question is only what happens to the **previous** hash dir, which today is
"it is deleted", a choice the script states but never weighs against the page that is
still pointing at it.

## Options

Costs are measured, not estimated. None of these is applied in the PR that carries
this note.

### Option A — retain the current hash plus the previous N, pruned by mtime

`sync-playground-assets.mjs` stops deleting the tree and instead prunes to the newest
N directories.

- **Cost:** N=3 adds ≈ **24 MB and ~874 files** to the deploy artifact (two extra
  dirs at 12 MB / 437 files each); N=2 adds ≈ 12 MB / 437 files.
- **Covers:** a page that straddles up to N−1 deploys. A tab left open over a busier
  week still breaks.
- **Blocker it trips first:** `asset-version.mjs`'s `assetVersion()` returns
  `dirs[0]` from `readdirSync` — which is not the newest. Measured with four hash dirs
  created in sequence on this filesystem:

  ```
  readdirSync order : 3aa59a241df8 472bb1922880 aa11bb22cc33 ff99ee88dd77
  assetVersion() picks dirs[0] => 3aa59a241df8
  newest by mtime (the CURRENT deploy) => ff99ee88dd77
  MISMATCH — a stale hash would be baked into every page
  ```

  The order here came back lexicographic, which is worse than random rather than
  better: hash names are content-derived, so lexicographic order is uncorrelated with
  recency, and `dirs[0]` is reliably the **lowest hash** — a stale one most of the time,
  deterministically. Today that code is correct only because exactly one directory ever
  exists. Option A **cannot ship without also making the current hash explicit** — the sync script
  writing a pointer file the resolver reads, rather than the resolver guessing from a
  directory listing. Retaining dirs without that fix is strictly worse than the
  present bug: every page would bake a possibly-stale hash.
- **Second cost, and it is not in the byte count: it pushes on the service worker's
  ASSETS cap.** `sw.js` caps that cache at 800 entries and argues the cap "clears one
  deploy's whole immutable **inventory** with headroom" — sized when a deploy staged ~213
  versioned files against ~280 Astro chunks. The staged tree is **437** files today, so
  on that comment's own metric one deploy is ~717 of 800, not ~500, and the cross-deploy
  overlap it budgeted for no longer fits. Retention would double the versioned half.
  **Be careful what this does and does not measure.** 437 is a count of files on the
  origin, while the cap bounds entries a reader's browser actually cached — and most of
  the 437 (157 `hljs/` grammars, 70 plans, 31 samples) no session ever fetches. So it is
  an upper bound, not an occupancy measurement, and "Option A blows the cap" is NOT
  established; what is established is that the headroom argument rests on a number that
  was stale. Sizing this properly needs a real measurement of a warm cache, which nothing
  here has. Treat it as an open cost of Option A, not a priced one. (The stale ~213 is
  corrected in this branch; the cap itself is untouched.)

  **Measured 2026-09-26 — the warm cache is about a quarter of the cap.** Headless
  Chromium drove a production `docs` build (`npm run build`, served by `astro preview`,
  same `sw.js` as the deploy) and read Cache Storage at the end of each session:

  | session | ASSETS entries | of which `/_astro/` | versioned | other | PAGES |
  |---|---:|---:|---:|---:|---:|
  | typical — home, two guides, five components, Playground, Studio (12 pages) | **186** | 139 | 43 | 4 | 13 |
  | every sitemap URL, plus Playground and Studio (132 pages) | **217** | 160 | 47 | 10 | 60 (cap) |
  | one deploy's whole inventory, if a session fetched every file | 755 | 317 | 438 | — | — |

  So Option A's doubling of the versioned half costs about +45 entries in the heaviest
  crawl (217 → ~264 of 800), and the 800 cap is breached only by a session that fetches
  nearly every file in two deploys. Not driven: a Studio session that opens many themes,
  samples and exemplars, which is where the versioned count would grow. **Surface:** a
  local production build, not lattice.style — the sandbox's browser cannot complete TLS
  to the deployed site. The script is `.scratch/perf/sw-occupancy.mjs` on the branch
  that took it (not committed, per `.scratch/`).
- **Side effect:** it makes `sw.js`'s version-eviction comment true again (see below).

### Option B — the fetcher recovers from a stale base

`sync` also writes a small **unversioned** pointer (`playground/v/current.json`,
holding the current hash). On a 404 for a palette the page knows is real, the fetcher
reads the pointer, re-points `themeBase` at the live hash, and retries once.

- **Cost:** one tiny file in the deploy artifact; a code path in `theme-fetch.ts`
  plus tests. No added bytes at rest.
- **Covers:** every deploy depth, not just N. It is the only option that fixes a tab
  left open for a month.
- **Care required:** the negative-404 cache must stay for the `-dark`-companion case,
  so the recovery path has to key on "this palette is in the catalog the page was
  built with" rather than on the status alone. The pointer file is itself a
  fixed-URL asset, so it must be served no-store or it reintroduces the staleness the
  hashing exists to prevent — but it is one small JSON, not 12 MB of CSS.
- **Scope note:** recovery is per-asset-kind. This fixes the lazy theme fetch, which
  is the reported failure; a lazily-loaded runtime or KaTeX bundle would each need the
  same treatment, or a shared resolver.

### Option C — stage an unversioned fallback copy of the theme CSS

Keep the delete, and additionally stage the palette CSS at the legacy unversioned
`playground/themes/<name>.css`. The fetcher falls back there on a 404.

- **Cost:** **1.6 MB / 51 files** added to the deploy artifact — the cheapest of the
  three in bytes.
- **Covers:** every deploy depth, for theme CSS only.
- **Why it is listed last:** the fallback copy is a fixed-URL asset again, which is
  the exact shape the 2026-06 incident punished. It is reached only after a versioned
  404, so a CDN-stale copy would be served only to a page that would otherwise get
  nothing — better than a 404, but it quietly re-opens the door the hashing closed,
  and a future reader would have to re-derive why that is acceptable.

## Recommendation

**Option B.** It is the only one that bounds the failure rather than deferring it,
and it costs bytes-at-rest of roughly zero. Option A's retention number is a guess
about how long a tab stays open dressed up as a setting, and it carries a mandatory
prerequisite fix (`assetVersion()`) that is the more dangerous of the two bugs.
Option C is cheapest to write and leaves the worst explanation behind.

**This is not decided here.** Retention changes what the deploy publishes — shared
state outside any one branch — so the call belongs to the human (CLAUDE.md, the
second filter). Whichever way it goes, it wants a tier-1 checker: the change is
invisible until a deploy has already happened.

## What this note DID change

**One false claim corrected, plus pointers — no behavior.** The correction is in
`docs/public/sw.js`. Its version-eviction comment asserted that an evicted hash is
recoverable —

> "online, its evicted hash is a miss → re-fetched"

— which the table above refutes. The origin has deleted it. The service worker is
not the cause of the reported failure (the delete is; a page with a cold cache 404s
identically), but the claim was wrong where it sat, so it is corrected in place with
a pointer here. The same file's stale deploy-inventory figure (~213 versioned files,
now 437) is corrected with it, because Option A's cost depends on it.

The pointers are additions, not corrections: the `rmSync` that causes this, the
`assetVersion()` docblock that explains why `dirs[0]` is safe only while one directory
exists, and a symptom entry in `engineering/gotchas/studio-playground.md` — a reader
who meets this is looking at a palette error with no reason to suspect a deploy.

Retention is unchanged. So is every fetch path.
