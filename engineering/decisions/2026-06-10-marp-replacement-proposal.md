---
status: superseded
summary: Full proposal to replace Marp with the owned lattice-engine — Marp now fully retired as dependency and render path
superseded-by: ../marp-independence.md
---

# Replacing Marp — full proposal

**Status:** shipped / superseded. Marp is fully retired — gone as both a
dependency and a render path; the owned engine is canonical (CLAUDE.md HARD
RULE #1). For the current state of record see
[`engineering/marp-independence.md`](../marp-independence.md); the sections
below are kept as the rationale of record for how we got there. Supersedes
and expands the "Own the engine — bootstrap with Marp" section of
[`2026-05-10-tauri-exploration.md`](2026-05-10-tauri-exploration.md), which
first committed to owning the engine but framed it around the Tauri desktop
WebView. This note is repo-scoped: it audits exactly what Marp does for
Lattice *today*, what an owned engine has to absorb, and a sequenced plan to
get there without regressing the gallery baselines, the VS Code loop, or the
docs site.

> **P1 status (2026-06-10): landed (experimental).** `lib/engine/` ships the
> markdown-it-based core behind the `@laticent/lattice/engine` export. It
> reproduces Marpit's slide/directive token contract, runs the existing plugins
> + transformer registry unchanged, and matches marp-core's per-section HTML
> across **55/55** gallery decks (twemoji intentionally dropped). Decisions
> locked: **Scope 1** (keep marp-vscode as the external VS Code preview host);
> engine home **`lib/engine/` + `/engine` export**; **drop twemoji +
> auto-scaling** (both unused). Verified by `test/unit/engine/engine.test.js`
> (contract + in-process differential parity vs marp-core). Not yet done: the
> emitted scaffold/theme `css` (P1.1), Marpit advanced-background split
> containers for the PDF path, and the P2–P5 path migrations. The sections
> below are the original proposal, kept as the rationale of record.

> **Parity update (2026-06-11): engine ↔ marp-core at pixel parity.** A
> standalone visual-parity harness (`tools/engine-parity.mjs`, `npm run parity`)
> now rasterises every gallery slide through both engines and pixel-diffs them; a
> tinybench benchmark (`npm run bench`) tracks render cost. A full-corpus sweep
> (65 galleries + jargon, light/dark) drove the owned engine to **exact pixel
> parity with marp-core except the one intentional twemoji→font emoji
> difference.** Five real divergences were found and closed: fenced-code syntax
> highlighting (wire highlight.js into the markdown-it instance), soft line
> breaks (`breaks: true`), inline-math `$…$` delimiter guards (currency prose no
> longer mathified), `_paginate: false` slide counting (absolute position +
> whole-deck total), and a playground front-matter bug (forced theme is now
> injected *inside* the YAML, not via a leading comment that displaced the fence).
> The benchmark confirms the engine's own HTML is cheap (~15 ms / jargon); the
> render-time gap vs marp is the **marp CSS packer the lattice path still borrows**
> — i.e. P1.1's emitter remains shelved (it broke mobile WebKit). The parity
> harness is the gate for un-shelving it (P5): the owned CSS emitter can return
> once it pixel-matches across the corpus.

> **Default-flip update (2026-06-11): the owned engine + owned CSS are now the
> docs-site default.** P5's emitter cleared the parity gate and shipped behind
> `?css=engine`; this flip promotes the whole owned path to the default. The
> playground module (`active='lattice'`, `ownCss=true`) and the Drawing Board
> `renderEngine` workspace pref (`def:'lattice'`) both default to the owned engine;
> `?engine=marp` / `?css=marp` are the escape hatches and marp-core stays bundled
> as the live A/B oracle. Desktop verified (Drawing Board renders verdict-grid
> identically; Architect label reads `lattice-engine`). **GATE CLEARED
> (2026-06-12):** the iOS Safari on-device pass is confirmed. On a real iPhone /
> iOS Safari, against the **live production bundle** (`?css=engine`;
> `laticent.github.io/lattice/playground/lattice-playground.js` md5-verified
> byte-identical to `main`, so it was the owned emitter, not a stale-deploy marp
> fallback): `big-number`'s `cqi`-sized numeral renders full-size and
> `list-steps`' CSS counters fire — the exact two failure modes the P1.1 shelving
> bug (collapsed cqi / dropped counters) produced, both clean. The owned CSS
> default is now validated on **every** surface: headless-Chromium parity (CI),
> the 66-deck engine↔marp gate, and live iOS WebKit. This makes path #4 (docs
> playground) the first surface defaulted off marp-core; dropping the bundled
> `@marp-team/marp-core` import entirely is a later phase.

**Recommendation in one line:** build `lattice-engine` on `markdown-it`
directly — keep the markdown-it/GFM core Marp already wraps, drop the
Marpit/marp-core *slide layer* (splitting, directives, theme registration,
section emission) and reimplement that thin layer ourselves. The emulator
already proves the layer is small; it's currently built on a hand-rolled
regex parser that is the real source of fragility, so the engine work is as
much *consolidation* as it is *replacement*.

---

## 1. TL;DR

- Marp is **one runtime dependency**: `@marp-team/marp-cli@^4.3.1`
  (`package.json`), which bundles `@marp-team/marp-core` → `@marp-team/marpit`
  → `markdown-it`. The docs playground additionally imports
  `@marp-team/marp-core` directly (`lib/playground/index.js:25`).
- Of the **four** places Lattice turns markdown into slides, **two are
  already Marp-free** (the `lattice-emulator.js` CLI — our shipped `bin`/`main`
  — and `dist/lattice-runtime.js`), and **two still ride Marp** (the
  `marp-cli` build/test/CI path via `marp.config.js`, and the browser
  playground that powers the entire docs site).
- Everything that gives Lattice its *identity* — the markdown-it plugins
  (`lib/integrations/markdown-it/plugins.js`), the shared transformer registry
  (`lib/transformers/`), `lattice.css`, the 25 palettes — is **already ours**.
  Marp/Marpit contributes a comparatively thin layer: GFM markdown parsing,
  `---` slide splitting, front-matter/comment directive parsing, `@theme` /
  `@size` registration, `<section>` emission with pagination/header/footer
  chrome, the `![bg]` background-image grammar, KaTeX wiring, and a handful of
  marp-core extras (twemoji, auto-scaling, the `<marp-pre>` custom element).
- The emulator already reimplements **all of that thin layer** well enough to
  pass the 89-page baseline at page-count parity with marp-cli — but on a
  **bespoke regex markdown parser** (`parseInline` / `parseSlide` in
  `lattice-emulator.js`), not markdown-it. That parser is the gap the owner of
  this branch correctly flagged: it covers what the galleries use, not GFM.
- **Hardest surface is not the CLI — it's VS Code.** The marp-vscode extension
  *is* Marp Core; our live-preview inner loop depends on it. Replacing Marp on
  the engine side does **not** remove that dependency, and nothing in-repo can
  re-host the VS Code preview pane. This needs an explicit decision (§6).
- The website is tractable: it has exactly one coupling point —
  `window.LatticePlayground.render()` — which today wraps `marp.render()`. Swap
  the bundle's core and every docs surface follows (§7).

---

## 2. What Marp does for us today — the surface to replace

### 2.1 The dependency surface

| Where | Marp dependency | Kind |
|---|---|---|
| `package.json` | `@marp-team/marp-cli@^4.3.1` | only declared Marp runtime dep; bundles marp-core + marpit + markdown-it |
| `marp.config.js` | configures marp-cli; `import('@marp-team/marp-cli')` is a **JSDoc type only** (no runtime import) | build/test/CI render path (#2) |
| `lib/playground/index.js:25` | `import { Marp } from '@marp-team/marp-core'` | browser playground / docs site |
| `lattice-emulator.js` | **none** (requires `marp.config` only for the HTML-stage `applyDeckLogoToHtml` plugin) | shipped CLI (#1) |
| `lib/runtime/index.js` | **none** (post-processes the DOM marp-vscode/marp-core already produced) | VS Code + web runtime (#3) |
| marp-vscode extension | *is* Marp Core; not a package dep, an editor extension | live preview pane |

### 2.2 What Marp / Marpit actually provides

Decomposed into what we'd have to own:

1. **Markdown → HTML (GFM).** Marpit composes `markdown-it`
   (CommonMark + GFM tables, the full inline/block grammar, escapes, entities,
   reference links, loose/tight lists, HTML blocks). This is the part the
   emulator's regex parser only partially covers.
2. **Slide splitting.** `---` (and front-matter fencing) → one `<section
   data-lattice-slide="N">` per slide. Our plugins hook
   `markdown.core.ruler.after('marpit_slide_containers', …)` — i.e. they
   depend on Marpit's token-stream slide boundaries.
3. **Directive parsing.** Global vs spot directives: `theme:`, `paginate:`,
   `header:`, `footer:`, `size:`, `class:` / `_class:`, `style:`, plus the
   comment form `<!-- _class: … -->` / `<!-- _backgroundColor: … -->`.
   Survey of the decks shows a *small, fixed* directive set actually in use:
   `theme` / `paginate` / `marp` / `header` / `size` / `footer`, plus our
   custom `logo:`.
4. **Theme registration.** Marpit reads `@theme <name>` and `@size <name> W H`
   from the CSS (`lib/_theme.css` declares `@theme lattice` + the hd/HD/4K/
   standard sizes; each palette re-declares its own). `themeSet` in
   `marp.config.js` registers all 25 palettes.
5. **Section chrome.** Pagination (`section::after`), header/footer paragraph
   emission, `data-marpit-*` attributes. `scaffold.css` is the *only*
   `!important` file in the engine, written specifically to win the cascade
   fight against marp-core's scaffold defaults (see `marp.docs.md`).
6. **Background-image grammar.** `![bg]`, `![bg right]`, `![bg left]`,
   `![bg fit]` — Marpit's image directives, used across `gallery.md` and
   `gallery-jargon.md` for the `image` component. (The emulator already
   reimplements this — `lattice-emulator.js` "Marp background image syntax".)
7. **Math.** `math: 'katex'` — KaTeX, chosen over MathJax for synchronous
   render under headless-Chromium PDF. The emulator already calls
   `katex.renderToString()` itself for parity.
8. **marp-core extras we currently inherit (and would have to decide on):**
   - **twemoji** — marp-core rewrites unicode emoji to `<img class="emoji">`;
     `lattice.css` carries `:not(.emoji)` carve-outs because of it
     (`gotchas.md` "Marp Core wraps emoji").
   - **auto-scaling** custom elements (`<marp-auto-scaling>` fit headers).
   - **`<marp-pre>` vs `<pre is="marp-pre">`** — marp-vscode and marp-cli
     disagree on the fence wrapper element; lattice.css uses
     `:is(pre, marp-pre)` to cover both (`gotchas.md`).
   - **HTML allowlist** (`html: true`) — Lattice uses raw HTML sparingly for
     slot-label lifts.

### 2.3 What is already ours (carries over unchanged)

- **`lib/integrations/markdown-it/plugins.js`** — every Lattice-specific transform
  (deck-class propagation, `logo:`, verdict-grid / obligation-matrix /
  checklist state badges, slot-label lift, glossary table + range,
  heading-period adjustment, latticeplot fences, Mermaid hljs registration).
  These are markdown-it token manipulators with no Node-only deps — they bind
  to markdown-it's token model, **not** to marp-core specifically, so they
  survive a swap to a markdown-it-based engine almost verbatim.
- **`lib/transformers/registry.js`** — the HTML/DOM-stage registry (chart-
  family, split-panels, roadmap, journey, word-cloud) already abstracted
  across all three paths via `applyAllToHtml` / `applyAllToSection` /
  `applyAllToDom`.
- **`lattice.css` + `themes/*.css`** — the entire visual contract. Unchanged
  by definition: the engine's job is to emit the same `<section>` HTML the
  CSS already targets.

**Implication:** the replacement is narrower than "rebuild Marp." It is
"own the ~thin slide layer (§2.2 items 1–6) and keep everything in §2.3."

---

## 3. The render paths and their Marp coupling

| # | Path | Entry | Markdown engine | Marp-coupled? |
|---|---|---|---|---|
| 1 | Shipped CLI (`bin`/`main`) | `lattice-emulator.js` → `dist/lattice-emulator.js` | **hand-rolled regex** (`parseInline`/`parseSlide`) | **No** — independent reimplementation |
| 2 | Build / test / CI | `marp.config.js` via `npx marp` (`test/helpers/render.js`) | marp-core (markdown-it) | **Yes** — load-bearing |
| 3 | Web + VS Code runtime | `lib/runtime/index.js` → `dist/lattice-runtime.js` | none — **DOM post-processor** | **No** itself, but in VS Code it post-processes marp-vscode's output |
| 4 | Docs playground | `lib/playground/index.js` → `docs/public/playground/lattice-playground.js` | marp-core (markdown-it), bundled client-side | **Yes** — powers every live preview on the site |

The **cross-renderer parity gate** (`test/integration/parity/parity.test.js`)
asserts paths #1 and #2 agree on `gallery.md` page count (±1 for Chromium's
trailing blank). **It does not invoke marp-vscode** — no test does
(`grep marp-vscode test/` → none). Path #3/#4 parity is *by construction*:
they share `lib/transformers/` and (for #4) `lib/integrations/markdown-it/plugins.js`.

So today's reality: **path #2 is the authoritative reference** the emulator is
checked *against*. The replacement's core structural move is to **invert that**
— make an owned engine the reference, and either retire path #2 or keep
marp-cli around only as a temporary differential oracle.

---

## 4. The emulator: how far it already gets us, and the gaps

The emulator is the strongest evidence the slide layer is small — it renders
the full 89-page baseline at page-count parity with marp-cli, handles `![bg]`
backgrounds, the directive set in use, KaTeX, Mermaid (via `mmdc`), and runs
the *same* `lib/transformers/` registry and an inlined mirror of the plugins.

**But its markdown core is a regex chain, not a parser.** `parseInline`
(`lattice-emulator.js:1017`) is literally:

```
![alt](url) → <img>      // inline images only
**x** → <strong>         // naive, non-nesting
*x* / _x_ → <em>
`x` → <code>             // with HTML-escape
```

and `parseSlide` is line-by-line block handling (tables via one regex,
fenced code, blockquotes, nested `<ul>`/ordered lists, task checkboxes).

Concrete GFM gaps versus markdown-it (what "needs a lot more polish" means):

- **No inline links.** `[text](url)` is not handled at all (only `![]()`
  images). Any prose link renders literally.
- **Non-nesting emphasis.** `**a _b_ c**`, `***bold italic***`, intraword
  rules, and `**`-inside-`` ` `` interactions are fragile.
- **No strikethrough** (`~~x~~`), **no autolinks**, **no reference links**,
  **no footnotes**, **no hard line breaks** (two-space / backslash).
- **No HTML entity / numeric-entity handling**, partial **escape** support
  (`\*` etc.).
- **Tables** are a single permissive regex (`/((?:\|.+\|\n?)+)/`) — no
  alignment rows beyond a basic check, no escaped pipes, no inline block
  content in cells beyond `parseInline`.
- **Loose vs tight lists**, multi-paragraph list items, and blockquote
  nesting are approximations.
- **CommonMark edge cases** (setext headings, indented code, lazy
  continuation, HTML blocks) are unsupported.

None of these bite the curated galleries because the galleries are authored to
the emulator's subset. They *would* bite real authored decks — which is
exactly why we should not promote the regex parser to "the engine." The
decision in §5 is about which core replaces it.

---

## 5. Design decision — which markdown core wins?

Two honest options for the engine's parser:

**Option A — `lattice-engine` on `markdown-it` (recommended).**
This is the Tauri note's plan. Use `markdown-it` directly (the same library
Marpit wraps), add our own thin slide layer (splitting, directives, `<section>`
emission, `![bg]`, `@theme`/`@size` reads, KaTeX, pagination chrome) as
markdown-it plugins, and keep `lib/integrations/markdown-it/plugins.js` essentially
**as-is** — they already speak markdown-it tokens.

- **+** GFM correctness for free; we stop chasing CommonMark edge cases.
- **+** Our plugins (the hard, Lattice-specific part) port with minimal change;
  they currently hook `marpit_slide_containers`, so we provide an
  equivalently-named ruler boundary.
- **+** One engine can back **all four paths** — Node (emulator), browser
  (playground), and the runtime's needs — killing the
  three-reimplementation drift problem the registry only partially solves.
- **−** Adds `markdown-it` (+ plugins) to the bundle. It's ~?? KB but it's the
  same code marp-core already ships, so the *net* dependency footprint after
  dropping marp-cli/marp-core goes **down**, not up.

**Option B — polish the emulator's regex parser to GFM.**
- **−** Reimplementing CommonMark by regex is a known tar pit; we'd be
  rebuilding markdown-it badly. Rejected except as a stopgap.

**Recommendation: Option A.** Treat the emulator's parser as the *proof the
layer is small*, not the foundation. Build `lattice-engine` as a markdown-it
host, then point the emulator at it (replacing `parseInline`/`parseSlide`),
point the playground at it (replacing marp-core), and retire marp-cli.

---

## 6. The VS Code question (the hardest, decide first)

**marp-vscode *is* Marp Core.** Our documented fastest inner loop
(`CLAUDE.md`: "the marp-vscode preview pane is the fastest inner loop") depends
on a third-party extension we don't control and can't re-host from this repo.
`lib/runtime/index.js` is a **passenger**: it assumes marp-vscode already
produced `<section>` slides, `<marp-pre><code class="language-mermaid">`
fences, theme-scoped CSS vars, and pagination chrome, then upgrades/transforms
that DOM. Remove marp-vscode and there is **no in-repo preview pane** to fall
back to.

This means **"replace Marp" has two very different scopes**:

- **Scope 1 (engine ownership):** retire `@marp-team/marp-cli` and
  `@marp-team/marp-core` from *our* dependency tree (paths #1, #2, #4). VS Code
  authors keep using marp-vscode; we keep `scaffold.css`, the
  `:is(pre, marp-pre)` carve-outs, and the twemoji `:not(.emoji)` rules as
  "marp-vscode compatibility shims." **Fully achievable in-repo.**
- **Scope 2 (preview ownership):** stop depending on marp-vscode for the live
  loop. This is only really answered by the **Laticent desktop app** (the
  Tauri note's `PreviewPane` + incremental `SlideSegmenter`/`RenderCache`),
  or by a `lattice-engine`-powered VS Code preview/extension we'd have to
  build and ship separately. **Not a Lattice-repo change.**

**Recommendation:** this proposal targets **Scope 1**. Keep the marp-vscode
loop working unchanged (it's free, external, and good), and treat the
compatibility shims as a small, documented tax. Sunsetting marp-vscode is a
Laticent-app decision, tracked there, not a blocker here. The CLAUDE.md
framing ("Marp is the foundation") should be softened once Scope 1 lands:
Marp becomes "the VS Code preview host + a retired build dependency," not the
engine.

---

## 7. The website question

The docs site has a **single render seam**: `window.LatticePlayground.render(
markdown, theme)`, built from `lib/playground/index.js` by
`tools/build-playground.js` (esbuild IIFE → `docs/public/playground/
lattice-playground.js`). Every live surface — landing-page hero + field cards,
component `Specimen` previews, the Playground page, and the Drawing Board
(editor filmstrip, practice mode, focus editor) — calls that one function. The
runtime bundle runs alongside it for Mermaid + registry transforms but does not
render markdown.

So the website migration is mechanical: **reimplement `LatticePlayground.render`
on `lattice-engine` instead of `marp.render`.** Because the playground already
composes "marp-core + `lib/integrations/markdown-it/plugins.js` + `lib/transformers/`"
specifically for render parity with path #2, and Option A keeps the plugins and
registry, the swap is core-for-core. Nothing in the Astro/CodeMirror/Drawing-
Board layer changes — they only know `render()`.

Risk to watch: marp-core extras the site renders that the engine must match —
**twemoji** (or we drop emoji-as-image and let the font render), **KaTeX**
(bundle it client-side), and **auto-scaling** headers (decide keep/drop). These
are the same §2.2-item-8 decisions, surfaced in the browser.

---

## 8. What it would take — scope & risk

**Build:** `lattice-engine` (markdown-it host) implementing the §2.2 layer:

1. markdown-it instance (GFM preset) + KaTeX plugin.
2. Slide-splitting plugin emitting `<section data-lattice-slide>` with the
   `marpit_slide_containers`-equivalent ruler boundary our plugins hook.
3. Directive layer: front-matter + `<!-- _class: -->` comment directives, the
   in-use set (§2.2.3) first; global-vs-spot semantics matching
   `deckClassPropagate`.
4. `@theme` / `@size` reader + theme registry (port `themeSet` from
   `marp.config.js`).
5. `![bg …]` background-image grammar.
6. Pagination / header / footer chrome emitter to match what
   `scaffold.css` currently corrects — ideally emit it *correctly* so we
   can **delete** the `!important` scaffold file (a real cleanup win).
7. Decisions on twemoji / auto-scaling / `<marp-pre>` element name.

**Reuse unchanged:** `lib/integrations/markdown-it/plugins.js`,
`lib/transformers/registry.js`, `lattice.css`, all palettes, the KaTeX
extraction, the Mermaid pipeline.

**Risk register:**

- **Render parity regressions.** Mitigated by the existing baselines: keep
  marp-cli installed as a *differential oracle* and run engine-vs-marp-cli page
  count + HTML-structure diffs across `gallery.md`, the 53 component galleries,
  and the 12 bucket galleries until clean, *then* drop marp-cli.
- **markdown-it version skew** with whatever marp-core pins (so the oracle is
  apples-to-apples). Pin deliberately.
- **The §2.2.8 extras.** Each needs an explicit keep/replace/drop call;
  twemoji and auto-scaling have CSS carve-outs that must move in lockstep.
- **VS Code drift (Scope 2).** Out of scope here but must be named so the
  compatibility shims aren't deleted prematurely.

---

## 9. Phased plan

1. **P0 — invert the oracle (no new engine).** Decide §5 (Option A) and §6
   (Scope 1). Document the §2.2.8 extras decisions. *No code beyond docs.*
2. **P1 — `lattice-engine` core.** Stand up the markdown-it host + slide
   splitting + directives + `![bg]` + KaTeX behind a `render(markdown, {theme})`
   façade matching today's playground signature. Port the plugins onto it.
   Gate: passes `gallery.md` structure diff vs marp-cli.
3. **P2 — emulator onto the engine.** Replace `parseInline`/`parseSlide` in
   `lattice-emulator.js` with `lattice-engine`. The emulator stops being a
   second markdown implementation. Gate: parity test stays green; full
   component + bucket gallery page counts unchanged.
4. **P3 — playground onto the engine.** Reimplement `LatticePlayground.render`
   on `lattice-engine`; drop `@marp-team/marp-core` from
   `lib/playground/index.js`. Gate: docs-site visual spot-check across hero,
   specimens, Drawing Board.
5. **P4 — retire marp-cli.** Replace the `runMarp` build/test path with the
   engine; keep marp-cli installed but quarantined as the differential oracle
   for one release; then remove `@marp-team/marp-cli` from `package.json`,
   collapse `marp.config.js` into the engine config, and rewrite
   `parity.test.js` to assert engine-internal invariants (or engine-vs-emulator
   if they remain separate processes).
6. **P5 — cleanup + docs.** Try to delete `scaffold.css` (if P1's chrome
   emitter is correct), keep the marp-vscode compat shims with a comment
   pointing here, and update `CLAUDE.md` / `marp.docs.md` / the "three render
   paths" framing. Update `CHANGELOG.md` (`### Removed` for the dep →
   **breaking** if any consumer imported `./config`).

Each phase is independently shippable and leaves the baselines green.

---

## 10. What we lose / risks we accept

- **marp-vscode stays** (Scope 1). We keep external compatibility shims. That's
  the honest cost of not building our own preview host in this repo.
- **Marp's discovered edge cases.** We rediscover or re-import fixes as the
  galleries surface them — same posture the Tauri note already accepted.
- **Native PPTX** (marp-cli's experimental path) is forfeited; deferred
  indefinitely per the Tauri note (standard PPTX goes PNG-per-slide +
  `pptxgenjs`).

## 11. Open questions

1. **Scope confirmation:** is this branch Scope 1 (engine ownership, keep
   marp-vscode) or are we also committing to a Lattice-owned VS Code preview
   (Scope 2)? Recommend Scope 1.
2. **twemoji:** keep emoji-as-`<img>` (port the plugin) or drop to font
   rendering and delete the `:not(.emoji)` carve-outs?
3. **auto-scaling headers:** does any shipped layout rely on marp-core's
   fit-scaling, or is it dead weight we can drop?
4. **`lattice-engine` home:** new top-level `lib/engine/`, or fold into
   `lib/core/`? (It's coupled to nothing component-specific — `lib/core/`
   precedent fits, but its size may warrant its own bucket.)
5. **Separate package?** The Tauri app wants `lattice-engine` in a WebView;
   should it ship as its own `exports` subpath from day one?
6. **Front-matter precedence override (§12.4):** do we ship the
   `background-precedence`-style inversion knob, or hold the line on a single
   predictable cascade? Recommend the latter.
7. **Remote-resource policy (§12.10):** which front-matter values may be URLs,
   and what is the fetch/cache/allow-list posture for the build (`--allow-local-files`
   today) vs the browser (CORS) vs the Tauri WebView?

---

## 12. The front-matter / deck-config contract

This section specifies the deck-configuration surface `lattice-engine` owns —
the YAML front-matter block plus the per-slide directive comments that override
it. It is a **superset of Marp's** directive set (so existing decks keep
working) with Lattice-native additions. It is the engine's public authoring API;
treat changes here as breaking.

### 12.1 Principles

1. **Zero-config is a great deck.** Every key has a sensible default. A file
   with *no* front matter at all — just markdown — renders a correct, on-brand
   deck (default palette, `hd` size, `---` splitting, pagination on, title
   inferred from the first `#`). Front matter is for overriding, never for
   *enabling*.
2. **One predictable cascade.** Precedence is always **per-slide directive >
   deck front matter > theme default > engine default** — specific beats
   general, the same direction CSS and Marp already train authors to expect. We
   do *not* ship a knob that inverts it (see §12.4).
3. **Lint-clean by construction.** The authoring surface must survive a standard
   markdown linter (markdownlint) with default rules. That drives the
   heading-split mode (§12.3); the variable grammar (§12.5) is itself
   lint-driven — a `$` *inside inline code*, never a bare sigil in prose.
4. **Marp-superset.** `marp: true`, `theme`, `paginate`, `header`, `footer`,
   `class`, `style`, `size`, and the `_`-prefixed per-slide spot directives keep
   Marp's exact semantics. New keys are additive; a Marp deck imports unchanged.
5. **Resources can be remote (§12.10).** `theme`, `fonts`, `logo`, background
   images, and data sources accept a URL as well as a repo-relative path, so a
   deck can pull its brand kit from the web.

### 12.2 The key table

`scope` = where it may appear: **D** deck front matter, **S** per-slide
directive (the `<!-- _key: … -->` spot form, or its non-`_` global form).

| Key | Type | Default | Scope | Notes |
|---|---|---|---|---|
| `theme` | name \| URL | default palette (`cuoio`) | D, S | Registered palette name, or a URL/path to a `@theme` stylesheet (§12.10). |
| `size` | preset \| `WxH` | `hd` (1280×720) | D | Named preset (§12.7) or explicit `1920x1080`. |
| `split` | `rule`\|`h2`\|`hybrid` | `rule` | D | How the body divides into slides (§12.3). |
| `paginate` | bool | `true` | D, S | Page numbers. `_paginate: false` skips one slide; deck `false` is opt-out. |
| `pagination` | object | — | D | Optional `{ start, format, total }` for the number's text. |
| `header` / `footer` | string (interpolated) | — | D, S | Chrome text; supports `$name` variables (§12.5). Empty string clears. |
| `logo` | path \| URL \| object | — | D, S | Deck mark. Object form: `{ src, position, scale, link }`. `_logo: none` suppresses. |
| `background` | string \| object | theme bg | D, S | Deck-wide background; precedence in §12.4. |
| `fonts` | object | theme fonts | D | `{ display, body, mono }` → the three font tokens (§12.6). |
| `vars` | map | `{}` | D | Author-defined interpolation variables (§12.5). |
| `title` | string | first `#` text | D | Deck title → PDF `/Title`, OG tag, `$deck.title`. |
| `author` | string \| list | — | D | → PDF `/Author`, OG, `$deck.author`. |
| `description` | string | — | D | → PDF `/Subject`, OG `description`. |
| `tags` | list | `[]` | D | → PDF `/Keywords`, OG `keywords`, `$deck.tags`. |
| `date` | date \| `auto` | `auto` (build date) | D | `$now.date`; `auto` resolves at render. |
| `class` | string | — | D, S | Deck-wide / per-slide layout class (Marp parity). |
| `style` | css string | — | D | Inline `<style>` escape hatch (Marp parity). |
| `lang` / `dir` | string | `en` / `ltr` | D | Document language + direction. |

### 12.3 Deck splitting — `split`

> **Shipped (2026-06-13):** `split:` landed as a **binary** key — `rule`
> (default) and `headings` — not the three modes sketched below. The shipped
> `headings` folds `h2` + `hybrid` into one eyebrow-aware, `---`-honouring mode.
> See `engineering/decisions/2026-06-13-split-frontmatter.md`.

Marp splits only on a `---` thematic break. markdownlint's `MD035`/heading rules
and many house styles dislike bare `---` in prose, and authors routinely *forget*
it. So the engine offers three modes:

- **`rule` (default, Marp-compatible).** `---` between blocks starts a new slide.
- **`h2`.** Every `##` opens a new slide. The block **before the first `##`** —
  typically a single `#` H1 plus a tagline — becomes the **title slide**, auto-
  classed `title` (§"title" component). This yields a fully lint-clean document
  with a normal heading outline and *no* `---` at all: `#` = deck title, each
  `##` = a slide heading. H1 is reserved for the title slide; a second `#` in the
  body is an authoring error the linter (`lib/authoring/lint-core.js`) should flag.
- **`hybrid`.** Split on *either* `##` or `---`, for decks that mix a heading
  outline with explicit breaks (e.g. two slides under one `##`).

Per-slide front matter inside a heading-split deck is still the `<!-- _key -->`
comment form, attached to the slide whose heading it follows. Explicit
`<!-- _class: title -->` always wins over the inferred title detection.

### 12.4 Backgrounds & precedence

A background can be a color token, a gradient, or an image, set at three levels.
The cascade is the standard one — **most specific wins**:

```
per-slide  ![bg …](url)  or  <!-- _background: … -->     ← highest
   ▲
deck       front-matter  background:
   ▲
theme      the palette's section background               ← lowest (default)
```

`background` accepts a shorthand string (`background: "#0b1020"`,
`background: url(cover.png)`, `background: linear-gradient(...)`) or an object:

```yaml
background:
  image: https://cdn.example.com/cover.jpg   # path or URL (§12.10)
  color: "#0b1020"        # shows through / behind the image
  fit: cover              # cover | contain | tile  (maps to ![bg fit])
  position: center
  opacity: 0.9
  filter: blur(2px)       # passthrough to the bg layer
```

A slide opts out of the deck background with `<!-- _background: none -->`
(falls back to the theme), or overrides it with the existing Marp `![bg]`
image syntax. **We deliberately do not ship a precedence-inversion key** (the
"redefine who overrides whom" idea): inverting the cascade per deck makes a
slide's appearance non-local and unpredictable, and every real need is already
served by *explicit* per-slide overrides. Captured as Open Question 6 in case a
concrete use case argues otherwise; the bar is high.

### 12.5 Variables & interpolation

**Lattice already has a locked variable grammar** — do not invent another.
[`2026-05-11-inline-code-directives.md`](2026-05-11-inline-code-directives.md)
(decisions-locked, not-yet-implemented) defines a variable as **backtick inline
code with a `$` sigil**: `` `$client` `` → the value of `client` from
front-matter `vars:`. The rules already decided there hold verbatim:

- **`$` is the only sigil**, bare not braced (`` `$client` ``, never
  `` `${client}` ``). Sigils `:` `@` `#` `!` are forbidden because CSS-themed
  decks routinely write `` `:root` ``, `` `@media` ``, `` `#id` ``, `` `!important` ``.
- **Dotted paths** are part of the grammar: `^\$[A-Za-z_][\w.]*$`
  (`` `$client.legal_name` ``).
- **No composition** — a variable is the *entire* code span; `` `$a report` ``
  is not a thing. Surrounding prose is plain markdown.
- **Plain inline code is untouched** — only a leading `$` triggers a variable.

Because header/footer/title are markdown-rendered, the same `` `$name` `` form
works there as in the body:

```yaml
vars:
  client: Northwind
  quarter: Q3 FY26
footer: "`$client` · `$quarter` · `$slide.page`/`$slide.total`"
```

**Built-in variables (a proposed *extension* to that grammar).**

> **SUPERSEDED 2026-09-06 on the SPELLING — the forms below are BRACED:
> `` `{$now.date}` ``, `` `{$deck.title}` ``, `` `{$slide.page}` ``.** Everything else in
> this table stands: the namespaces, what each resolves to, render-time resolution after
> the split, and unknown-renders-literal-plus-lint-warn.
>
> The bare `` `$now.date` `` written below would be a THIRD opening character beside the
> `{` and `[` that shipped in #2066 (`{LABEL}` pills, `[x]` marks). One brace pair
> dispatches everything, with `$` as a NAMESPACE inside it rather than an opener — so the
> grammar is braces-dispatch / brackets-mark, two characters with one rule each. The `$`
> is kept rather than collapsing to `` `{now.date}` `` because dropping it would put
> built-ins in the same namespace as author pill labels and require reserved words inside
> that namespace — the mechanism deliberately refused for `{x}`.
>
> Reasoning and the measurement behind it:
> `2026-05-11-inline-code-directives.md` § AMENDMENT 2026-09-06.

The inline-code note covers only author `vars:`; the engine should also expose render-time
built-ins. They slot into the existing dotted-path syntax under **reserved
namespaces** (so they can't collide with a user `vars:` key, which is a bare
identifier):

| Built-in | Resolves to |
|---|---|
| `` `$deck.title` `` `` `$deck.author` `` `` `$deck.description` `` | the metadata keys (§12.2) |
| `` `$deck.theme` `` `` `$deck.size` `` `` `$deck.tags` `` | active palette / size preset / joined tags |
| `` `$slide.page` `` `` `$slide.total` `` | current slide number / deck total |
| `` `$now.date` `` `` `$now.time` `` `` `$now.datetime` `` `` `$now.year` `` | render-time clock; `$now.date` honors `date:` if set, else build date |

Resolution is at render time, after the split, so `` `$slide.page` `` is correct
per slide. An unknown `` `$x` `` renders literally and the linter
(`lib/authoring/lint-core.js`) warns — the same typo guard the inline-code note
specifies for unknown directives. **When the inline-code grammar ships, this
built-in namespace table folds into it** (and into `templates.md`); it lives
here only as the engine-side requirement.

### 12.6 Fonts — `fonts`

Maps directly onto the three typography tokens (`--font-display`, `--font-body`,
`--font-mono`); unset roles inherit the theme.

```yaml
fonts:
  display: "Fraunces"                         # bare name → resolve from CDN
  body:    "Inter"
  mono:    https://example.com/Berkeley.css   # a @font-face stylesheet URL
```

A bare family name resolves through the configured webfont provider (Google
Fonts by default) and the engine injects the `@import`; a URL to a `.css`
`@font-face` sheet or a font file is used directly (§12.10). The emoji fallback
chain (`Noto Color Emoji`, …) is always appended so emoji render in color
regardless of the chosen families.

### 12.7 Sizes — `size`

Named presets resolve to `@size` geometry; `WxH` is taken verbatim. Beyond the
deck sizes Lattice ships today (`hd`, `4K`, `16:9`, `standard`), the engine adds
social, print, and mobile presets so one deck source can target many surfaces:

| Group | Presets |
|---|---|
| Slides (today) | `hd` 1280×720 · `4k` 3840×2160 · `16:9` · `standard` 960×720 |
| Social | `og` 1200×630 · `linkedin` 1200×627 · `x` 1600×900 · `ig-square` 1080×1080 · `ig-portrait` 1080×1350 · `ig-story` 1080×1920 |
| Print | `a4-landscape` · `a4-portrait` · `letter-landscape` · `letter-portrait` (at print DPI) |
| Mobile | `mobile` 390×844 · `tablet` 834×1112 |

Presets live in the theme's `@size` block (engine-resolved, §"P1.1"), so a theme
can add brand-specific sizes. cqi-based layouts reflow proportionally across any
size with no per-size rules.

### 12.8 Header / footer / logo / pagination

These are deck chrome with Marp-compatible toggling: a deck-level value sets the
default; the `_`-prefixed per-slide form overrides or clears one slide
(`_footer: ""`, `_paginate: false`, `_header: "Confidential"`, `_logo: none`).
`title silent` and the `silent` modifier remain the one-token way to suppress all
three on a title/section slide. `logo` renders through the existing
`applyDeckLogoToHtml` path; its object form adds `position` (corner),
`scale`, and an optional `link`.

### 12.9 Zero-config defaults (the out-of-the-box deck)

With an empty (or absent) front matter the engine resolves:

```yaml
theme: <default palette>     size: hd            split: rule
paginate: true               header/footer: none  logo: none
background: <theme section>  fonts: <theme>       title: <first “# …”>
date: auto                   lang: en             dir: ltr
```

— i.e. exactly today's good-looking default. No key is *required*; front matter
only ever narrows or rebrands.

### 12.10 Remote resources & migration

`theme`, `fonts`, `logo`, and background images accept an absolute URL in
addition to a repo-relative path. Posture per host (Open Question 7):

- **Build / emulator (Chromium):** today's `--allow-local-files` covers local
  paths; remote URLs need an explicit network fetch with an allow-list + an
  on-disk cache (so a build is reproducible and offline-friendly once warmed).
- **Browser playground / Drawing Board:** subject to CORS; document which
  providers send permissive headers (Google Fonts does, arbitrary image hosts
  may not). Fetched theme/font text is registered via the existing `addThemes`
  path.
- **Tauri WebView:** uses the app's CSP allow-list.

**Migration:** a Marp deck's front matter is already valid input — `theme`,
`paginate`, `header`, `footer`, `size` (via theme `@size`), `class`, `style`,
and the `_` directives are honored unchanged; `marp: true` is accepted and
ignored. The new keys (`split`, `vars`, `fonts`, object `background`/`logo`,
the metadata block) are purely additive, so adoption is incremental.
