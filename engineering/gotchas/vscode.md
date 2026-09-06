# Gotchas — VS Code / marp-vscode

One topic from the [gotchas index](../gotchas.md) — start there to find a symptom;
this file is the detail. Entry shape and the rule for adding one are in the index.

## The VS Code Marp preview runs marp-core directly, without Lattice's markdown-it plugins

- **Symptom:** Lattice's authoring plugins (e.g., `splitPanelCounter`,
  `verdictGridBadges`, `deckClassPropagate`) work in the owned engine
  and the lattice-emulator pipeline but never fire in the VS Code Marp
  preview.
- **Cause:** marp-vscode 3.5.1 has no `markdown.marp.engine` setting.
  It loads themes via `markdown.marp.themes` but uses the bare Marp
  Core engine for rendering. There is no extension point for engine
  plugins from the workspace, so the preview never runs Lattice's
  `lib/integrations/markdown-it/plugins.js`.
- **Mitigation:** Behaviors that need to fire in VS Code preview must
  be mirrored as DOM transforms in
  [lattice-runtime.js](../dist/lattice-runtime.js) (loaded into the
  preview via `<script src="../lattice-runtime.js">` at the end of
  every deck). Maintained as a separate code path; see the
  comments above each `transform*()` function.
- **Triggered by:** Any deck opened in VS Code Marp preview.
- **Removable when:** marp-vscode adds engine config support.
- **Commits:** Original `lattice-runtime.js` design.

## Known preview gaps — transforms shipped without a `lattice-runtime.js` mirror

Since `engineering/workflow.md`'s Two-renderer rule was demoted to opt-in
(2026-07-09, `engineering/decisions/2026-07-09-marp-legacy-audit.md` §5(a)),
a new transform is not required to get a `lattice-runtime.js` DOM mirror —
only add one when an author actually needs it to look right in the VS Code
preview. Nothing automated catches the case where a mirror *would* have been
worth adding and nobody did it, so this register is the discipline-only
substitute: **when you ship a transform engine-only and know it won't render
correctly (or will render differently) in the VS Code preview, add one line
below.** Nothing enforces this — an empty table means either "no known gaps"
or "nobody's logged one," and there's no way to tell which from the table
alone. Don't read empty as reassurance — **and don't wait for a calendar,
because there isn't one.** This paragraph used to say "the real backstop is the
calendar … a fixed 90-day mark"; that was already stale when written. The
90-day/5-row trigger lives inside a `<details>` block the audit marked
"superseded 2026-07-10," and the decision above it retires the timer explicitly
("not as a live plan … **not on a timer**"). Revisiting marp-vscode is
condition-driven — the preview genuinely stops working, or Studio/Playground
readiness becomes a live question on its own merits. So this list has **no**
backstop behind it: a gap nobody logs is a gap nobody knows about. Corrected
2026-08-02 (`engineering/decisions/2026-08-02-marp-reference-register.md` §5).

| Transform | Symptom on a Marp-rendered surface | Added |
|---|---|---|
| whatever `lib/core/marp-fidelity.js` lists as `unmirrored` | The constructs a Marp render genuinely does not reproduce, plus one it renders with a different typesetter. Each is built while the deck is PARSED — earlier than any Marp tool lets a plugin in — so a browser runtime cannot cover for it. **This row deliberately names no list.** It carried one for a day and was wrong within a day: it said five-plus-math while the ledger shipped seven (the imagery `![bg]` gap was found after the row was written), and then imagery was CLOSED by baking the lift, taking it back to six. The ledger is the list: `lib/core/marp-fidelity.js` is the ledger, `test/unit/core/marp-fidelity.test.js` fails when a new markdown-it plugin is added without a coverage verdict, and the generated bundle README prints the gaps from the same rows — so what a recipient is told cannot drift from what the repo knows. | 2026-07-29 |

**Deck-wide front-matter registers: row retired 2026-07-29.** `color-mode:` / `class:` /
`logo:` / `meta:` (and the whole finish / mode / claim / spectrum family) used to be
absent from an exported PDF, because the runtime recovered them by FETCHING the
source `.md` and `fetch` cannot read a `file://` URL — which is how both marp-cli
and a recipient double-clicking the HTML load the deck. The export now BAKES the
front matter into the document (`lib/core/deck-front-matter.js`) and the runtime
reads it from the DOM. Measured on a `file://` open with default Chrome flags:
**0 → 10 of 10** sections carrying the deck's color mode.

**Three rows retired 2026-07-29 (#1256)**, all closed by adding the mirror
rather than by dropping the transform: `matrixGridCells` (cells rendered as raw
`[x]`/`[-]`/`[ ]` text; now the shared kernel `lib/core/matrix-grid-cells.js`,
run on both paths) and `premise` (the claim never grouped, so the ledger
collapsed; now `lib/core/premise.js` `applyToDom`), plus the auto-glossary (its
generated slide was missing from the export outright; now baked at source like
splits, with `lib/core/glossary-slide.js` mirroring its table + range pill). All
were found by rendering a real deck through the export rather than by anyone
logging them here — which is the standing caveat above, demonstrated.

**Read this register with the CSP entry below in mind.** A mirror makes a
transform work on the *runtime* route — the exported HTML, `npm run pdf`,
`npm run html`. The marp-vscode PREVIEW pane is believed to execute no scripts,
in which case a mirror does not make anything appear there. **Status of this claim: SETTLED 2026-09-06 — it holds at the DEFAULT preview security level and not otherwise.** Measured against a real VS Code (see the entry below): the deck's `<script>` tags carry no CSP nonce, so at the default they never run and the register is right; set the level to Disable and they all run and it is wrong. The 2026-07-29 field report describing structural components rendering in the preview is reconciled by that — it was a Disable preview. The safe advice is unchanged, and now for a stated reason: the default is Strict and you cannot assume a reader has changed it, so render the bundle for anything you need to trust. An empty table
means "no gap logged for the runtime route", never "the preview is complete.

- **Removable when:** never fully — it's a living list, not a one-time
  migration. Individual rows retire if the underlying transform is dropped
  or a mirror is later added for it.

## `git worktree` doesn't share `node_modules`

- **Symptom:** Inspecting a historical commit via
  `git worktree add ../inspect <sha>` and opening the deck in
  preview, mermaid never renders. The same commit checked out in
  the main directory works fine.
- **Cause:** Worktrees share `.git` but not working files. `node_modules/`
  isn't tracked, so the worktree has no installed deps. The script
  tag `<script src="../node_modules/mermaid/...">` 404s.
- **Mitigation:** Mermaid is now vendored at the repo root as
  `mermaid-v11.min.js` and committed. Worktrees and fresh clones see
  it at the right relative path without `npm install`. See
  [engineering/decisions/2026-04-30-mermaid-theming.md](decisions/2026-04-30-mermaid-theming.md)
  for the full rationale.
- **Triggered by:** Any worktree or clone where `npm install` hasn't
  been run; any deck not under `examples/`.
- **Removable when:** Never — worktrees are designed not to share
  build deps.
- **Commits:** `8607e65`.

## Does the marp-vscode webview execute `<script>`? — SETTLED: it depends on the preview security level

> **Status: settled 2026-09-06, by opening a real VS Code.** Every earlier version
> of this entry said the answer was unknown and unreachable. Both halves were
> wrong: the answer is "it depends on a setting nobody had named", and the host
> IS reachable from a headless sandbox. The earlier attempt tried **code-server**,
> whose GitHub release this sandbox's egress policy answers with a 403; the VS
> Code **desktop** tarball is a different route and it runs fine under `xvfb-run`.

**The answer.** The webview carries `script-src 'nonce-…'`. The extension's own
scripts carry that nonce; **the deck's do not** — `mermaid-v11.min.js` and
`lattice-runtime.min.js` both read back with `nonce: null`. So at the default
security level the deck's scripts sit in the DOM and never execute. Set the level
to **Disable** and they all run.

It is not a settings-file key. It is a per-resource memento reached only through
the command palette: **Markdown: Change Preview Security Settings**.

**The four markers, both ways.** This is the entry's own protocol, run as written —
`cp -r dist/marp-kit <ws>`, open the folder as workspace root, preview
`Sample-Deck.md` — against VS Code 1.136.1 / marp-vscode 3.6.1 / Chromium 148 /
Electron 42.10.0:

| marker | Strict (the default) | Disable |
|---|---|---|
| `<html data-lattice-runtime>` | `null` | `"loaded"` |
| `typeof window.mermaid` | `undefined` | `object` |
| `_class: diagram` — a drawn flowchart | **0 SVGs**, fence VISIBLE | **0 SVGs**, fence hidden |
| `_class: split-panel` — `.panel-left` / `.panel-right` | 0 / 0 | **1 / 1** |
| `_class: progress` — drawn bars | 0 | **present** |
| `_class: obligation-matrix` — literal `[x]` / `[ ]` still in the text | **yes** | **no** (marks built) |
| theme registered (`--accent` resolves) | yes | yes |

So the decision rule this entry used to end on — "all four flat ⇒ CSS-only; any
one composed ⇒ the webview executes scripts" — **returns both answers, selected by
the security level.** At Strict all four are flat and the CSS-only reading is
right. At Disable three of the four compose and it is wrong. Any future run of
this protocol has to record the level, or it is measuring a coin flip.

- **Mitigation — unchanged, and now for a stated reason.** Treat the preview as
  **palette + CSS layout, and everything the runtime builds as UNKNOWN there** —
  because the default is Strict and you cannot assume a reader has changed it.
  Anything a reader must trust gets rendered: `npm run pdf` / `npm run html` and
  marp-cli's own `--pdf`/`--html` DO execute the runtime, because they drive a
  real headless browser.
- **A separate thing that IS settled:** marp-vscode renders with raw marp-core and
  never runs `lib/integrations/markdown-it/plugins.js` (see the entry above), so
  there is no build-time plugin pass on that surface regardless of the script
  question. Do not let the two questions merge again.
- **The 2026-07-29 field report is reconciled.** It described structural
  components rendering in the preview, which the CSS-only reading could not
  explain. It is explained now: that reporter's preview was at Disable, or their
  workspace was trusted into it. It was not wrong, and neither was the register.
- **AND THE DIAGRAM MARKER IS A DEFECT, not a data point.** At Disable the fence
  reaches `data-mermaid-state="rendered"` with an EMPTY `.mermaid` container:
  source hidden, box 0×0, zero SVGs. The author gets a blank where the diagram
  belongs. The frame is capable — calling `window.mermaid.render()` in it by hand
  returns an 11.6KB SVG — so this is our runtime marking a fence rendered and
  landing nothing. Reproduced independently twice on two builds. Mechanism not
  chased. One clue: with `bierner.markdown-mermaid` also installed, our render
  DOES land (21KB, one SVG, deck face) — n=2 each way, cause unknown.
- **`bierner.markdown-mermaid` installs no `window.mermaid` at 1.32.1** — not a
  stub with `.render` missing, no global at all, in both preview hosts. Three
  comments in `lib/runtime/index.js` said otherwise; they are corrected. The
  guards were always safe either way.

**HOW TO REPRODUCE IT — about forty minutes, and it needs no VS Code you do not
already have access to.** Download the official Linux tarball
(`https://update.code.visualstudio.com/latest/linux-x64/stable`, ~354MB), extract,
install the extension from **Open VSX** (`npm view @marp-team/marp-vscode` is a
404 — it is a VSIX, never published to npm), then:

```sh
xvfb-run -a --server-args="-screen 0 1600x1200x24" ./VSCode-linux-x64/bin/code \
  --no-sandbox --disable-gpu --disable-workspace-trust \
  --user-data-dir=<ud> --extensions-dir=<ed> \
  --remote-debugging-port=9333 --new-window <workspace>
```

Then `puppeteer.connect({ browserURL })` and find the frame whose
`document.body.classList` contains `marp-vscode`. **`browser.targets()` does not
surface the webview; `page.frames()` does** — the webview is out-of-process, which
is also why a parent-page screenshot of it comes back black. Read the DOM, not a
picture. Opening the preview needs a command (`markdown.showPreviewToSide`), which
a twenty-line development extension can issue on `onStartupFinished`.

None of this is committed. Whether it should become a harness or a CI job is a
CI-contract decision, not one to take on the way past.

## `enableHtml` / `html: true` is required or the runtime `<script>` tags print as TEXT

- **Symptom:** The last slide of a deck (or an Export-to-Marp bundle) shows a
  literal `<script src="mermaid-v11.min.js"></script> <script
  src="lattice-runtime.min.js"></script>` across the page, and no
  runtime-built component renders anywhere in the deck.
- **Cause:** marp-core defaults to `html: false`, which ESCAPES raw HTML
  rather than dropping it — so the tags survive as visible text and the
  runtime is never fetched. The owned engine parses with `html: true`
  (`lib/engine/index.js`), so nothing on our own render path ever showed it.
- **Mitigation:** marp-cli needs `html: true` in the config (the generated
  `marp.config.cjs` sets it) or `--html` on the command line; marp-vscode
  needs `markdown.marp.enableHtml: true` (the generated
  `.vscode/settings.json` sets it, and so does the repo's own). Note this is
  necessary but NOT sufficient in the vscode preview — the webview still
  won't execute the scripts (entry above).
- **Triggered by:** Any Marp render of a deck carrying the runtime tags.
- **Removable when:** Never — it's marp-core's documented default.
- **Commits:** #1256.

## A rule that LEADS with `:is(section…)` is dead in every Marp render

- **Symptom:** A whole component renders unstyled through marp-cli or the
  marp-vscode preview while looking perfect on the owned engine — the chart
  family especially (matrix-grid cells with no swatch, a roadmap with no
  track, `--map-base` undefined so every map/quadrant/radar fill falls back
  to SVG's black initial value).
- **Cause:** Marpit scopes a theme rule off its LEFTMOST compound: a literal
  leading `section` IS the slide and is root-replaced (`… > section.foo`);
  anything else is treated as a slide DESCENDANT and prefixed. Lattice's
  dual-surface head `:is(section.x, figure.x)` is not a literal `section`, so
  marp-core emits `… > section :is(section.x, …)` — a slide nested inside a
  slide, which cannot exist. Roughly **835 rules** died this way. Same root
  cause as "`:where(:root)` token blocks are dropped from every rendered slide"
  in `mermaid.md`.
- **Mitigation:** the distribution runs at BUILD time —
  `tools/build-css.js` `bundle()` pipes the assembled sheet through
  `distributeLeadingIs` (`lib/core/leading-is.js`), so **every stylesheet dist/
  ships is already scopable**: `lattice.css`, `lattice.min.css`, the
  `lattice-default` pair, and `dist/themes/*`. `lib/engine/css.js` distributes
  again at pack time (harmless — the pass is idempotent), and the
  Export-to-Marp bundle's `marpScopableCss` is now a belt-and-braces no-op for
  a current dist. Authors keep writing the readable dual-surface
  `:is(section.x, figure.x)` head in source; only the artifact is rewritten.
  **This started as an export-only rewrite and that was wrong** — it left the
  manual marp-vscode recipe (`markdown.marp.themes` pointing straight at
  `dist/lattice.css`, which is what this repo's own `.vscode/settings.json`
  does) still carrying every dead rule. Measured against real marp-core: **835
  dead selectors across 518 blocks**, of which 465 are `:is(section, figure)`
  heads over MERMAID diagram internals and the rest are the chart bucket. Only
  the chart half shows without a diagram on the slide — hence the misleading
  "only the charts are broken" symptom. Gated by
  `test/unit/core/shipped-css-marp-scopable.test.js`, which asserts the
  ARTIFACT. `:where()` heads are deliberately NOT rewritten: unwrapping them
  would change the zero specificity they're chosen for, and distributing them
  wouldn't help.
- **Triggered by:** Any engine CSS rule whose selector STARTS with
  `:is(section…)`. A mid-selector `:is()` is already in descendant position
  and scopes fine.
- **Removable when:** marp-core distributes leading `:is()` itself.
- **Commits:** #1256 (export-only, incomplete) → #1259 follow-up (build-time,
  every shipped stylesheet); engine-side fix predates both (the `--map-base` bug).

## Custom `logo:` front-matter directive shows nothing in marp-vscode preview

- **Symptom:** A deck with `logo: ./acme-logo.svg` in front matter
  builds a correct PDF (logo visible top-right of every slide) and
  appears correctly in exported HTML viewed in a browser, but the
  marp-vscode preview pane shows no logo at all.
- **Cause:** The convenience `logo:` directive is handled by
  `applyDeckLogoToHtml` in `lib/integrations/markdown-it/plugins.js`
  (run by the owned engine) plus the post-render hook in
  [lattice-emulator.js](../lattice-emulator.js) and the runtime
  mirror `applyDeckLogoFromFrontMatter` in
  [lattice-runtime.js](../dist/lattice-runtime.js). The owned-engine and
  emulator paths run at build time; the runtime path fetches the
  source `.md` from the same origin as the rendered HTML. The VS Code
  Marp preview runs marp-core directly, without Lattice's markdown-it
  plugins, so the build-time hook never fires there, AND the runtime's
  `fetch()` can't reach workspace files in
  the `vscode-webview://` sandbox — same limitation
  `applyDeckClassFromFrontMatter` documents at
  [lattice-runtime.js:3463-3465](../dist/lattice-runtime.js#L3463-L3465).
  Net result: no path works in the marp-vscode preview.
- **Mitigation:** None inside marp-vscode preview today. The author
  sees the logo only when they build the PDF or view the exported
  HTML in a browser. Authors who need live-preview validation can
  manually add `<img class="deck-logo" src="…" style="--deck-logo-src:url('…')">`
  as the first child of a single slide for spot-checking.
- **Triggered by:** Any `logo: <path>` in deck front matter when
  authoring inside marp-vscode.
- **Removable when:** marp-vscode adds workspace-config plugin
  loading. Unlikely in the near term.
- **Commits:** This branch.

## marp-cli timeouts under load (60-90s on small fixtures)

- **Symptom:** Rendering an Export-to-Marp bundle with `npx marp ...`
  runs for >60s on a fixture with two slides and times out.
- **Cause:** marp-cli fetches Google Fonts on cold starts (the
  Playfair / Outfit / JetBrains-Mono imports we use). Slow network or
  DNS resolution makes this multiply. The lattice-emulator pre-emits
  the font links the same way but doesn't block on them at render time
  (and self-hosts the woff2 for offline renders — see "A rendered PDF shows
  serif/fallback type" in `fonts.md`), so the owned engine doesn't hit this.
- **Mitigation:** Run with longer timeouts (`timeout 90`) when testing a
  marp-cli render. For a deterministic owned-engine render, the fonts are
  already vendored and inlined.
- **Triggered by:** Cold marp-cli runs against an Export-to-Marp bundle,
  slow networks.
- **Removable when:** N/A for the owned engine (fonts already vendored);
  inherent to marp-cli's CDN font fetch.
- **Commits:** Observed in dev; not yet addressed.

## VS Code's built-in PDF preview hue-shifts our gradients (pink/magenta)

- **Symptom:** A chart-frame's accent-tinted gradient header (or any
  CSS gradient using `color-mix(in oklab, …)` and `transparent` stops)
  reads pink/magenta in VS Code's built-in PDF preview, in both light
  and dark mode. Same PDF in Chrome / Firefox / macOS Preview /
  Acrobat looks correct (blue-tinted).
- **Cause:** VS Code's built-in preview is PDF.js. PDFs don't carry
  CSS — Chromium resolves gradients at print time to PDF shading
  objects (Type 2/3 axial-radial, plus soft-mask groups when stops
  are transparent). PDF.js implements those operators in pure
  JavaScript with no native color management. Wide-gamut color spaces
  (oklab, p3) and alpha across shading boundaries hit known gaps —
  the bytes get sRGB-misread and produce hue shifts. We're not doing
  anything wrong; we're using standards-compliant CSS that produces
  a standards-compliant PDF a behind-the-spec viewer can't render.
- **Mitigation:** Don't review in VS Code's built-in preview. Open
  the PDF in Chrome, install the "vscode-pdf" extension (different
  renderer), or use the marp-vscode preview pane for visual checks
  (CLAUDE.md's documented inner loop). The chart-frame's lucent-strip
  gradient was retired for design reasons (treatments are opt-in via
  the universal `tint-*` / `mark-*` modifiers); that incidentally
  removed one source of the symptom, but other gradients in the
  codebase (`--spectrum`, `.below-note::before`, the `tint-*`
  treatments themselves) keep exercising the same PDF.js gap.
- **Triggered by:** Any CSS gradient that uses `color-mix(in oklab,
  …)` or `transparent` stops. Affects only PDF.js-based viewers.
- **Removable when:** PDF.js gains real color-management and improves
  shading + transparency rendering. Don't hold your breath.
- **Commits:** `39e3351` (chart-header refactor that incidentally
  removed one source).

## Mermaid on a 4K deck renders at HD size in the VS Code preview

- **Filed under Lattice internals, on purpose.** The full entry is
  [Mermaid diagrams render at HD size inside 4K slides in VS Code
  preview](lattice-internals.md#mermaid-diagrams-render-at-hd-size-inside-4k-slides-in-vs-code-preview).
- **Why it is not here:** it is one finding with one cause shared with the docs-site
  4K entry — `GEOM` globals plus a fixed-box FIT scale — and the trap catalog cites
  the two as a pair. Splitting them across the surface files where each was *observed*
  costs more than the mis-filing does
  (`engineering/decisions/2026-08-17-gotchas-topic-refile.md`). This stub exists so the
  VS Code section of the symptom index still names it, which was the one thing that
  decision gave up.
