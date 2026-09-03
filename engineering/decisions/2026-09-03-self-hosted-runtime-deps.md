---
status: shipped
summary: >
  Mermaid and KaTeX were self-hosted everywhere that remembered to ask for them, and fetched
  from jsdelivr everywhere that did not — because the CDN URL was the DEFAULT sitting behind
  four `options.x || CONSTANT` reads. The landing page was live on that path: index.astro
  gates its `diagram` field card on ```mermaid (via CARD_COMPONENTS) and passed no mermaidUrl, so the
  most-visited page executed `mermaid@11` — a FLOATING major, whatever 11.x jsdelivr served
  that day — with no `integrity`, inside the preview frame, on the surface holding the user's
  OpenRouter key. share-export's fallback was worse in kind: it made an EXPORT reach a third
  party at export time to bake bytes into a file the author then hands someone. Fix: every
  host passes the locally-vendored copy sync-playground-assets already stages, the three CDN
  constants are deleted, and a missing URL now means "do not inject the tag" — a visible local
  failure instead of an invisible remote dependency. Pinned by a test that bars the host names
  outright, because the failure mode was a default nobody notices. Required-ness was measured
  and scoped: on the landing island props (where the bug was) it costs 3 test edits; on the
  shared SingleSlideOptions it costs 202, so that half is deliberately not taken.
---

# Self-hosting the runtime dependencies, and why the fallback was the bug

**Date:** 2026-09-03 · **Status:** decided, implemented

## The question

*"We should not be using CDN for anything, we should be self hosting and using min versions
of external dependencies right?"*

Mostly yes — and the repo was already about 90% there, which is what made the remaining 10%
dangerous. The self-hosting was real but *optional*, and the option's default was a CDN.

## What was already right

Three patterns were already correct and are untouched here:

- **Build-time fetch, vendored output.** `lib/components/chart/map/map.basemap.json` is a
  committed 21KB file carrying its `sourceUrl` as PROVENANCE metadata and
  `generator: tools/build-basemap.js`. `tools/fetch-emoji-font.js` does the same for the
  emoji font. Fetching a CDN at build time and committing the result is the *wanted* shape.
- **The exported player is contained.** `default-src 'none'; script-src 'sha256-…';
  img-src data:; font-src data:` — hash-pinned inline script, zero outbound.
- **The assets were already staged.** `sync-playground-assets.mjs` puts
  `export/mermaid-v11.min.js` and `katex/katex.min.css` (with its fonts) under the
  content-hashed `playground/v/<hash>/` dir, and `studio.astro`, `playground.astro` and
  `CraftLab.astro` already passed them.

## The defect: a default, not a usage

Nothing *chose* a CDN. `deck-preview.js` exported `MERMAID_URL` / `KATEX_URL` pointing at
jsdelivr, `single-slide-render.ts` held a `MERMAID` constant, and four places read
`options.x || <constant>`:

| site | what it did |
|---|---|
| `deck-preview.js` `buildSrcdoc` | default parameter values |
| `single-slide-render.ts` | `opts.mermaidUrl \|\| MERMAID` |
| `studio-stage.ts` | `options.katexUrl \|\| KATEX_URL` (×2) |
| `share-export.ts` | `options.katexUrl \|\| deck.KATEX_URL`, then `await fetch(katexUrl)` |

A host that simply did not pass a URL got the CDN, silently, and **it worked** — so nothing
ever failed in a way that revealed it.

### Who was actually on that path

Auditing the seven `.astro` hosts that build these option objects:

| host | mermaidUrl | katexUrl |
|---|---|---|
| `pages/studio.astro` | yes | yes |
| `pages/playground.astro` | yes | yes |
| `components/craft/CraftLab.astro` | yes | **no** |
| `pages/index.astro` | **no** | **no** |
| `components/Specimen.astro` | **no** | **no** |
| `components/site/EngineWarm.astro` | n/a | n/a |
| `components/site/RuntimeWarm.astro` | n/a | n/a |

**The landing page was the live one.** `index.astro:98` defines
`needsMermaid = (s) => /```mermaid/.test(s || '')` and passes `mermaid: needsMermaid(…)` to
every island — so the most-visited page on the site renders diagrams, and it passed no URL.
It therefore executed `mermaid@11` from jsdelivr: a **floating major**,
so whatever 11.x was current that day, with **no `integrity` attribute**, inside the preview
frame, on the surface that holds the user's OpenRouter key.

**WHICH island, precisely — an earlier draft of this section named the wrong two.** It said the
hero and restyle samples were the ones gating on ```mermaid. Decoding the island props out of
the built `dist/index.html` shows both carry `"mermaid": false`. The island actually on the CDN
path was **`FieldCardsLive`**, through `CARD_COMPONENTS`'s `diagram` entry
(`index.astro:103`) — the only one of the seven field cards whose sample contains a fence:

```
hero    → "mermaid":[0,false]      restyle → "mermaid":[0,false]
cards.diagram → "mermaid":[0,true]  ← the only one
```

The conclusion was right and the pointer was wrong, which is the more dangerous half: a reader
chasing "which surface had the bug" would have been sent to the two islands that did not.

That is HARD RULE #22's threat model — script execution in the preview frame → key theft —
arriving through a **default value** rather than through a sanitizer hole, which is why #22's
apparatus did not catch it. #22 asks whether untrusted *content* is sanitized. It never asks
where the *frame's own dependencies* come from.

### The export case is different in kind

`share-export.ts` fetches the KaTeX stylesheet to **inline into the exported artifact**. With
the fallback, an export with no `katexUrl` reached a third party at export time to bake bytes
into a file the author then hands to someone else. The preview harm is a beacon; this one is a
supply-chain step inside a document's construction.

## What shipped

1. **Every host passes the vendored URL.** `index.astro` and `Specimen.astro` gained both,
   `CraftLab.astro` gained `katexUrl`, and the four landing islands
   (`HeroPreview`, `FieldCardsLive`, `RestyleShowcase`, `StudioPreview`) plus
   `playground/specimen.js` thread them through.
2. **The three CDN constants are deleted**, and the four fallbacks now resolve to `''`.
3. **`''` now means "omit the tag" at every injection site — it did not before, and this
   record claimed otherwise.** Only two of the five gated on the URL (`stage-window.js:409`,
   `:325`, which are `url ? tag : ''`). The other three gated on CONTENT alone
   (`deck-preview.js:352`, `:396`, `single-slide-render.ts:871`), so a math or diagram deck
   meeting a caller with no URL emitted `<link href="">` / `<script src="">` — not "no tag".
   Measured in real Chromium, neither empty attribute produces a request, so the harm was dead
   markup rather than a bad fetch. The reason it mattered anyway: the safety property this
   record leans on — *a missing URL is a visible local failure* — was false at the majority of
   the sites it was quoted about, in a change whose entire subject is claims nobody re-derives.
   The three guards now require content AND url, which makes the sentence true rather than
   softening it, and all three are mutation-proved in `deck-preview.test.ts` and
   `single-slide-render.asset-gating.test.ts`.
4. **A gate bars the host names outright** — `test/unit/docs/no-cdn-runtime.test.js`, with a
   second arm asserting the vendored files are actually staged, since removing the fallback
   makes a rename in `sync-playground-assets.mjs` the difference between a rendered diagram
   and a blank one.

### Required-ness: measured, then scoped

The instinct was to make `mermaidUrl` / `katexUrl` **required** so a forgetful host fails at
typecheck. Measured both placements:

| where | typecheck errors | of those, production |
|---|---|---|
| shared `SingleSlideOptions` | **206** | 4 |
| the landing island props (`HeroData`, `RestyleData`, `StudioPreviewData`) | **3** | 0 |

The 206 are 202 mechanical test-fixture edits for 4 real findings — and a 200-file diff on
tests is a merge-conflict magnet in a repo running parallel sessions
(`2026-06-14-drift-watch-rebase-thrash.md`). The 4 production errors were exactly the landing
islands, so **required-ness was applied narrowly, where the bug was**, at a cost of 3 test
edits. `SingleSlideOptions` keeps both fields optional; the *gate*, not the type, is what
prevents the CDN coming back.

## On "min versions"

Worth separating, because it is not the lever it looks like. Both CDN URLs were already
`.min`, and our own builds ship min. What moves bytes is compression: `mermaid.min.js` is
**3,164,970 raw → 870,851 gzipped**. Ensure gzip/brotli on the wire; do not chase min.

That 851KB gz is also a standing warning worth recording: it is **larger than the entire
studio eager bundle** (633.2KB gz). Self-hosting Mermaid is right, but it must never drift
onto an eager path. It currently does not — it is injected per-slide, only for a slide that
has a diagram.

## Verified

Counts below are quoted **at the commit that produced them**, because a bare suite total is a
moving number: this branch alone took the root suite from 8036 to 8141 as it added its own
arms, and a later reader diffing against today's total would conclude the record was wrong.

- `npm run lint` — clean at `fa993da` (1 pre-existing warning at the earlier commits, in
  `coda-fallback-union.test.js`, untouched here and since fixed on `main`).
- `docs` typecheck — **0 errors**.
- `docs` suite — **276 files / 3653 tests at `a63e586`**, **277 / 3659 at `fa993da`** once the
  asset-gating arms landed.
- Root unit suite — **8036 at `a63e586`**, **8141 at `fa993da`**. The one failure it surfaced
  was mine: a new `test/unit/docs/` scope needs a `test:docs` script + a `SCRIPT_META` entry,
  both added.
- `npm run build:check` — OK.
- **The real surface** (HARD RULE #23): `docs && npm run build`, then read the built
  `dist/index.html`. All four landing islands now serialize
  `"mermaidUrl":"/playground/v/346595f5a341/export/mermaid-v11.min.js"` and
  `"katexUrl":"/playground/v/346595f5a341/katex/katex.min.css"` — our own origin.

### What the built site still contains, and why each is fine

Auditing `docs/dist/` rather than only the source, three classes of hit remain and none is a
runtime dependency of ours:

- **`us-atlas` `sourceUrl`** (in `editor.js`, `lattice-playground.js`, `lattice-runtime.js`) —
  the provenance string inside the vendored basemap JSON, bundled as data. Never fetched.
- **`pdfobject.min.js` from cdnjs** (in `jspdf.es.min.*.js`, `pdf-export-worker-*.js`) —
  inside **jsPDF's own minified bundle**, not our code. A third-party library carrying a CDN
  reference in one of its output paths. Logged, not fixed here.
- **`fonts.gstatic.com` / `fonts.googleapis.com` in `sw.js`** — `cacheFirst` /
  `staleWhileRevalidate` *hostname branches*, i.e. the service worker reacting to such a
  request, not making one. **Verified vestigial**: nothing under `themes/`, `lib/`,
  `docs/public/playground/` or any built HTML references Google Fonts, because
  `fetch-emoji-font.js` vendors it at build time. Dead code, pre-existing and off the path of
  this change, so logged rather than pulled into the diff (HARD RULE #18).

## What this does not do

- **Does not close `script-src` in the preview CSP.** `preview-csp.js:32` deliberately omits
  `default-src` so *"script, style and worker loading are exactly as unrestricted as they
  [were]"* — and the CDN fallback is what made that necessary. Removing the fallback makes
  tightening it *possible*, and that is the real prize here. It is deliberately a separate
  change: it modifies a shipped security posture whose own record
  (`2026-09-01-preview-remote-subresource-posture.md`) measured its cost with the CDN in
  place, so the cost needs re-measuring.
- **Does not remove the dead `sw.js` font branches**, or touch jsPDF's internal reference.
- **Does not add SRI anywhere**, because after this there is no third-party script left on the
  docs site to attach `integrity` to. If one is ever added back, it needs both.
