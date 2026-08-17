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
in which case a mirror does not make anything appear there. **Status of this claim: UNVERIFIED and contested.** It originates in this file's CSP entry below and has never been tested against a real VS Code. A field report (2026-07-29) describes structural components rendering correctly in the preview, which would require the runtime to execute. Do not treat either reading as settled; the safe advice is unchanged — render the bundle for anything you need to trust. An empty table
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

## Does the marp-vscode webview execute `<script>`? — UNVERIFIED, and this is the entry that says so

> **Read the status line before the content.** This entry is the ORIGIN of the
> "the preview is a CSS-only surface" claim that the rest of the repo cites, and
> **the claim has never been tested against a real VS Code.** It used to be
> written here as flat fact — Symptom/Cause/Mitigation, no hedge — while the
> preview-gaps register 130 lines above called that same claim "UNVERIFIED and
> contested." A reader who found this entry first got a fact; a reader who found
> the register first got a caveat about a fact they hadn't read yet. Same file,
> two epistemic statuses, and the unhedged one was the one people quoted.
>
> Nothing below is new evidence. The only change is that the entry now carries
> its own status, and tells you how to settle it.

- **Symptom:** A DOM transform authored in `lattice-runtime.js` (or any
  `<script src="...">` tag in the markdown) is *reported* to work in PDF export
  and the browser but not fire in VS Code Marp preview. The slide HTML looks
  correct in the build output and (per this reading) wrong in preview.
- **Claimed cause — UNVERIFIED:** that marp-vscode loads preview content in a
  sandboxed webview with a Content Security Policy disallowing script execution,
  and that even with `enableHtml: true`, relative `<script src="...">` paths do
  not resolve inside the webview context. **No test against a real VS Code
  backs this**, and no marp-vscode issue or doc has been cited for it here.
- **The contradicting evidence:** a field report (2026-07-29) describes
  structural components rendering correctly in the preview pane — which would
  require the runtime to have executed. One report, not a measurement, but it
  points the other way and has never been reconciled.
- **Mitigation — unchanged either way, which is why this stayed unsettled so
  long.** Treat the preview as **palette + CSS layout, and everything the
  runtime builds as UNKNOWN there** — do not promise it, do not rely on it.
  Anything a reader needs to trust gets rendered: `npm run pdf` / `npm run html`
  and marp-cli's own `--pdf`/`--html` DO execute the runtime, because they drive
  a real headless browser. That advice is correct under both readings, so the
  open question costs nothing operationally; what it costs is that
  `lib/runtime/index.js` (2,182 lines) is partly priced against a surface nobody
  has checked.
- **A separate thing that IS settled:** marp-vscode renders with raw marp-core
  and never runs `lib/integrations/markdown-it/plugins.js` (see the entry above),
  so there is no build-time plugin pass on that surface regardless of the script
  question. An earlier version of this entry claimed structural transforms "run
  at build time — before the webview CSP applies," which is wrong for any Marp
  surface, and is why the Export-to-Marp README promised a fidelity it did not
  deliver until #1256. Do not let the two questions merge again: "no plugins"
  is established, "no scripts" is not.
- **HOW TO SETTLE IT — ten minutes, needs a real VS Code (unreachable from a
  headless sandbox, HARD RULE #23).** `dist/marp-kit` exists precisely to be the
  fixture:

  ```sh
  cp -r dist/marp-kit ~/kit-test && code ~/kit-test   # open the FOLDER as workspace root
  ```

  Open `Sample-Deck.md` and turn on the Marp preview. The deck is built so the
  answer is visible rather than inferred — **four of its thirteen slides are
  assembled by `lattice-runtime.min.js` and by nothing else.** Verified against a
  real marp-cli render with JavaScript disabled and re-enabled: all four flip.
  Three of them (`.panel-left`, the drawn progress bars, the matrix cell marks)
  appear nowhere in the static HTML; the fourth, the diagram, is present only as
  an unrendered code fence.

  | Slide | What proves the runtime ran |
  |---|---|
  | `_class: diagram` | a drawn Mermaid flowchart, not a code fence |
  | `_class: split-panel` | two panels — `.panel-left` / `.panel-right` |
  | `_class: progress` | drawn bars, not a bullet list |
  | `_class: obligation-matrix` | drawn cell marks, not literal `[x]` / `[ ]` text |

  Styled slides with all four flat ⇒ the CSS-only reading is right. Any one of
  the four composed ⇒ the webview executes scripts and this entry is wrong.
  Unstyled slides ⇒ neither — the theme did not register, so fix that first
  (workspace root, see the kit README) before reading anything into the rest.

  Whatever it shows, correct **this entry**, the preview-gaps register above,
  `engineering/marp-independence.md` (§Scorecard and §5 Cost 3, both currently
  hedged to match), and the kit README's Fidelity section
  (`tools/build-marp-kit.js` `readme()`) — and record the VS Code and
  marp-vscode versions, because a CSP is a property of a version, not of the
  extension forever.
- **Triggered by:** Any structural transform viewed in the VS Code Marp preview.
- **Removable when:** the experiment above is run — then this becomes either a
  real ceiling entry or a deleted one.
- **Commits:** Split-panel feature commit; corrected in #1256; status made
  honest in the marp-kit render-gate change.

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
  cause as the `:where(:root)` entry above.
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

## marp-cli timeouts under load (60-90s on small fixtures)

- **Symptom:** Rendering an Export-to-Marp bundle with `npx marp ...`
  runs for >60s on a fixture with two slides and times out.
- **Cause:** marp-cli fetches Google Fonts on cold starts (the
  Playfair / Outfit / JetBrains-Mono imports we use). Slow network or
  DNS resolution makes this multiply. The lattice-emulator pre-emits
  the font links the same way but doesn't block on them at render time
  (and self-hosts the woff2 for offline renders — see the offline-font
  entry above), so the owned engine doesn't hit this.
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
