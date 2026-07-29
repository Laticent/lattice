# Marp independence — living status

> **Living document.** The running scorecard of where Lattice's owned engine
> stands against Marp. Update it whenever the engine gains or loses a capability,
> the benchmark is re-run, or a cost line resolves. **Last verified against the
> engine: 2026-06-14** (architecture settled; L3 invariant coverage 53 / 53 —
> full catalog).
>
> Point-in-time *rationale* lives in
> `engineering/decisions/2026-06-12-p4-regression-gate-retire-marp.md` — link there
> for *why*; keep *this* doc current for *where we are*.

## TL;DR

Marp is gone as a **dependency** and as our **render path** — `lib/engine/`
natively re-implements the Marpit core, `npm install @slidewright/lattice`
pulls **zero** `@marp-team` packages, and the BYO marp-cli config (`marp.config.js`)
is **retired** (no marp-cli render path ships, and nothing of ours uses
marp-core for parity/verification). Lattice is a *superset* of Marp; the
one-way **export target** (`export:marp`, the Drawing Board) is a clean
handoff behind a boundary — its own thing.

**One caveat this scorecard used to omit:** the third-party **"Marp for
VS Code" extension previews `.md` decks by running raw marp-core directly**,
not Lattice's own engine — that's a live author-time surface, not an export
handoff, and it's genuinely load-bearing today (`README.md`,
`engineering/development.md`'s recommended extensions,
`design/theming.md`'s palette-authoring workflow all point authors at it).
Keeping decks looking right there costs a real, standing tax — see §5 Cost —
cataloged in full in
`engineering/decisions/2026-07-09-marp-legacy-audit.md`.

## 1. Is Marp gone? — the dependency / render reality

| Surface | State | Evidence |
|---|---|---|
| `dependencies` | **marp-free** | `ls node_modules/@marp-team` → absent after `npm ci` |
| Source imports | **zero** real `@marp-team` / `marpit` imports | repo-wide grep; remaining marp strings are comments citing the porting source |
| First-party render (CLI · emulator · playground) | **owned engine** | `lib/engine/` |
| `marp.config.js` (BYO marp-cli render path) | **retired** | deleted; the owned engine is the only render path |
| Export-to-Marp (#250 / #257) | **stays — generates recipient bundles** | the bundle pins marp-cli for the *recipient*, not for us; its generated config ships no engine — the deck is **rendered by the recipient's Marp**, and the bundle carries the minified `lattice.css` + themes, the browser runtime, and Mermaid for fidelity. There is **no bundled emulator** (`lib/core/marp-bundle.js`). |
| VS Code live preview | **clean handoff, KNOWN CEILING** | the Export-to-Marp bundle is self-contained — anyone who wants Marp tooling exports it and runs Marp on the far side of the boundary. What the handoff delivers is now measured, not assumed: `npm run pdf` / `npm run html` in the bundle are FULL fidelity (marp-cli drives a real headless browser, so the runtime executes); the marp-vscode PREVIEW pane is palette + CSS only, because its webview executes no scripts. See §5 Cost 3 and `engineering/gotchas.md`. |

**Marp is fully externalized.** We render every first-party path; Marp is an
optional *export target* a user hands off to (VS Code, marp-cli) — its own thing,
behind a clean boundary. Nothing of ours uses Marp, especially not verification.

## 2. The foundation we own (`lib/engine/`)

The full Marpit pipeline, re-implemented as 7 modules:

| Module | Replaces (Marpit) |
|---|---|
| `slides.js` | slide tokenizer (`---` → sections) |
| `directives.js` | front-matter / comment directive parser |
| `css.js` | `ThemeSet.pack` + `scaffold.js` + `printable.js` — selector scoping, `@page` / print, `@import` / `@size` |
| `background-image.js` | `![bg]` plugin |
| `themes.js` | theme registry |
| `math.js` | marp-core math → KaTeX (ours) |
| `index.js` | the orchestrator |

On top sits the value-add Marp never had: 53 components, native charts, Mermaid, the
token design system. Output formats (PDF / PPTX / PNG / HTML) flow through the
owned CLI.

## 3. Performance (`npm run bench`)

Last run **2026-06-13**, marp-core still installed (the final apples-to-apples):

| corpus | slides | marp-core | owned engine | speedup |
|---|---|---|---|---|
| normal (jargon) | 79 | 207.7 ms | 39.3 ms | **5.3×** |
| charts | 14 | 192.3 ms | 34.7 ms | **5.5×** |
| stress (jargon ×6) | 469 | 407.8 ms | 129.1 ms | **3.2×** |

**3–5× faster.** Refresh with `npm run bench`. The marp baseline is retired
post-#263; the benchmark now tracks the engine over time.

## 4. Footprint

−**42M** off a consumer install: `marp-cli` 40M + `marp-core` 736K + `marpit`
348K (+ `marpit-svg-polyfill`) = **4 packages**. (`puppeteer` and `markdown-it`
are shared and stay — the honest delta is the marp tree only.)

## 5. Scorecard

### Better (7)

1. **Speed** — 3–5× faster render.
2. **Weight** — marp-free install, −42M.
3. **Control** — we fix our own browser-compat (e.g. the iOS `:root` cqi bug, P5) instead of waiting upstream.
4. **Capability** — structural components stock marp-core literally cannot render.
5. **CSS fidelity** — we drive selector scoping / specificity; the owned engine's own render never loads a competing Marp scaffold, so nothing there needs to fight one. (`scaffold.css` still carries a defensive `!important` for the one context where it DOES compete — real marp-core, in the Export-to-Marp bundle; see `cascade.md` § "What that means for Lattice today".)
6. **No upstream coupling** — marp's version / roadmap / abandonment can't break us.
7. **Output ownership** — PDF / PPTX / PNG / HTML through our CLI.

### Cost — 3 permanent, accepted

1. **Maintenance burden** — we own every Marpit bug marp-team used to fix.
2. **Ecosystem labor** — community, plugins, docs, and browser-compat are ours alone.
3. **Marp-compatibility tax** — marp-core is a genuinely different renderer,
   and every difference is ours to absorb. A `lattice-runtime.js` DOM mirror
   is the only way to make a transform look right on any Marp surface (~800
   lines, a dozen dual-kernel test files, a permanent CSS-selector ban, a
   Chromium-91 feature ceiling on the whole runtime bundle) — all still real,
   still paid. **Corrected 2026-07-29 (#1256):** this line used to say the
   mirror makes a transform look right "in the vscode preview." It does not —
   that webview executes no scripts, so the preview is CSS-only no matter how
   many mirrors we write. What a mirror actually buys is the exported HTML and
   marp-cli's `pdf`/`html` output. The same audit found two further taxes
   nobody had priced: marp-core escapes raw HTML by default (so the bundle's
   own runtime `<script>` tags printed as text), and its selector scoper
   cannot handle a leading `:is(section…)` (so ~835 rules — the whole chart
   bucket and the shared Form layer — matched nothing in every Marp render).
   Both are export-side fixes now; neither was visible from our own render. What's *no longer*
   true: `engineering/workflow.md`'s "Two-renderer rule" used to require a
   mirror for every new transform, by name, forever; as of 2026-07-09 it's
   opt-in — add one only when actually needed, logged in
   `engineering/gotchas.md`'s "Known preview gaps" register when skipped on
   purpose. Full inventory + the fix:
   `engineering/decisions/2026-07-09-marp-legacy-audit.md`.

One thing that *looked* like a cost is a settled **design choice**, not a
regret: **owned verification is the whole bar.** We deliberately keep **no**
second (marp) renderer as a cross-check — the per-component semantic-invariant
suite is the floor and we raise it ourselves (§6). Re-introducing marp for
parity is explicitly off the table.

**Export-to-Marp is the boundary that's clean** — the one-way bundle handoff
(VS Code opening a recipient's own marp-cli render, or a direct marp-cli
invocation) has no cost line here because it never runs on our side. **Clean
is not the same as free, and it is not self-verifying:** the bundle was
shipping a deck that rendered wrong for months (#1256) precisely because
nothing on our side renders it. Nothing automated closes that gap today —
exporting a real deck and LOOKING at the result is the only check. The **live
vscode preview is a different thing** — it's cost 3 above, not part of the
export boundary.

## 6. Owned verification — the standing work

The semantic-invariant suite (`test/integration/invariants/`) is our whole visual
gate, so we deepen it ourselves rather than wish for a second renderer:

- **Layers 1–2** (manifest-driven slot contract + overflow/contrast) auto-cover
  **all 53 components** the moment a manifest lands.
- **Layer 3** (per-component semantic truths — `.chart-body` rendered, `table`
  rows, `.katex` math, `.badge` states, …) now covers the **full catalog —
  53 / 53 components** as of 2026-06-14. Transform components assert their
  rendered output (a chart frame, a table, code panels, a compiled mermaid SVG);
  plain list/heading components — already contract-guaranteed by Layers 1–2 —
  carry a lighter STRUCTURAL lock (a KPI's figure⇄caption pairing, a decision's
  two reasoned options, an ordered step sequence, a flat-vs-nested list, the
  optional eyebrow kicker layer 1 skips). The bar to raise from here is depth on
  individual rules, not breadth — every component now has a rule.

The bar is ours to raise — never marp's to validate.

## Update log

- **2026-07-29 (#1256)** — Cost 3 renamed + corrected (a runtime mirror never
  helped the vscode preview; it helps the exported HTML and marp-cli), the
  scorecard's VS Code row given its measured ceiling, and the "clean boundary"
  claim narrowed after a real exported deck was rendered and found broken four
  ways (escaped runtime `<script>` tags, ~835 CSS rules dead to marp-core's
  selector scoper, no bundled fonts, two transforms with no DOM mirror).

- **2026-07-09 (b)** — Cost item 3 updated: the Two-renderer rule it
  describes was demoted from mandatory to opt-in the same day
  (`engineering/workflow.md`, `engineering/decisions/2026-07-09-marp-legacy-audit.md`
  §5(a)) — the preview-compatibility tax itself is unchanged (existing
  mirrors stay, marp-core still can't run our plugins), only the policy
  requiring *new* transforms to pay it did.
- **2026-07-09 (a)** — Added Cost item 3 (preview-compatibility tax) and narrowed
  the TL;DR's "nothing of ours uses Marp" claim after a full-repo audit
  (`engineering/decisions/2026-07-09-marp-legacy-audit.md`) found this doc
  overstated independence: the vscode Marp preview runs raw marp-core, not
  our engine, and a binding policy (the Two-renderer rule) required ongoing
  duplicate-path maintenance to keep it working. The narrow dependency claim
  (zero `@marp-team` packages) held up; the broader "fully externalized"
  framing did not.
- **2026-06-14 (c)** — L3 invariant coverage completed **32 → 53 / 53** (full
  catalog). Added the 21 remaining components: the `diagram` mermaid→SVG compile
  (a real transform, like the chart family); KPI/stats figure⇄caption tiles;
  compare-prose/decision two-option structure; cards-grid/cards-stack/q-and-a
  title⇄body pairings; list-tabular meta column; the `list` flat-vs-nested lock;
  ordered-sequence locks for agenda/list-steps/list-criteria; legal label⇄citation
  rows (authority-chain, regulatory-update, statute-stack); big-number figure (the
  one focal element the contrast pass can't reach); content prose body; and the
  minimal-anchor lock (heading + kicker, no list body) for title/divider/closing.
  Plain components carry deliberately lighter structural locks — Layers 1–2 already
  guarantee their contract; breadth is done, depth is the ongoing work.
- **2026-06-14 (b)** — architecture settled: Marp fully externalized as an export
  target behind a clean handoff (the VS Code "gap" dissolved); scorecard reframed
  to 2 permanent costs. L3 invariant coverage grown **14 → 32 / 53** components
  (roadmap/state-chart folded into the chart-family frame check; bespoke rules for
  code, compare-table, matrix-2x2, pricing, split-compare, verdict-grid, redline,
  image, actors, checklist, logo-wall, obligation-matrix, citation-card, math,
  quote, split-panel).
- **2026-06-14 (a)** — created alongside PR #263 (marp-cli retired, `engine-parity`
  gate removed, playground marp-core A/B dropped). Engine verified
  zero-marp-import; benchmark + footprint recorded above.
