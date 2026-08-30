- **Mermaid diagrams now reach the exported `.html` player with their labels.** The player
  sanitizes its slide DOM, and that sanitizer bars both things a Mermaid SVG leans on: the
  `<style>` mermaid injects into it, and `<foreignObject>` — where every node, edge and cluster
  label lives. Every exported player therefore shipped diagrams as shapes and arrows with no
  words, on both the CLI and the Studio. Each diagram is now baked to a self-styled SVG with
  native `<text>` labels (`flattenSvgStyles(…, { foreignObjectLabels: 'text' })`) before
  assembly, so the sanitizer stays strict and the diagram still reads. Charts are deliberately
  left token-driven — freezing their computed colors would pin them to the export-time scheme
  and kill the player's own light/dark toggle.
- **The Studio's Share → Webpage export renders its diagrams at all.** The browser render leaves
  a ```` ```mermaid ```` fence as a `<pre><code>` for the runtime to inflate, and the player ships
  no runtime — so the exported file froze the un-rendered form: raw Mermaid source on the slide,
  and a wall of it where Read·Article should have shown the diagram. The Studio now bakes the deck
  through the shared capture frame first, the browser-side twin of the CLI's own player capture.
  Runtime-inflated components (state-chart, function-plot) are baked by the same step.
- **The player's light/dark toggle re-themes a pinned deck instead of half-theming it.** A
  deck-wide `color-mode:` is a CLASS the engine stamps on every section, not a token swap — so
  the toggle now adds and removes that class rather than trying to re-resolve tokens underneath
  it. Before, a `color-mode: dark` deck tapped to light left the slide dark while the chrome,
  stage and letterbox went white: a dark rectangle on a white page, reading as a broken
  download, with Read·Article light at the same toggle position. Now the deck renders exactly as
  if it had never been authored dark — bookends on the inverse panel at 11.29:1, content slides
  white at 18.13:1. Only the two PINNING modes are managed; `system`/`inherited` already defer,
  and `print` is a paper band, not a scheme. A one-off `_class: dark` accent slide keeps its
  class in both schemes, as a design choice rather than a color mode.
- **Derived tokens follow a pinned slide's scheme.** Only declarations literally containing
  `light-dark()` were re-emitted, so tokens defined in terms of them — `--cat-on-fill`,
  `--status-*`, the `--seq-*`/`--diagram-*` families — kept resolving at `:root` and inherited a
  light ink onto a dark-pinned surface: 11.97:1 → 2.80:1 on a categorical `.dark` slide. They are
  now re-declared at the pinned scope, verbatim and transitively, so the substitution happens
  where the pin is.
- **A `_class: dark` accent slide keeps its scheme in both player modes.** The player replaces
  `light-dark()` with static CSS, which erased Lattice's per-slide scheme pins — so a dark-pinned
  slide viewed in light got light surfaces under `--text-display`, a constant `#FFFFFF`: white ink
  on a white canvas. The pin is re-emitted, `.light`/`.color-light` keep light values in dark, and
  `.print` keeps its own band in both directions — including a `_class: dark` slide inside a
  `color-mode: print` deck, at 18.88:1. (A deck-WIDE mode no longer relies on this at all; the
  toggle moves its class instead.)
- **`--strip-notes` strips notes again, and the Studio's webpage export keeps them.** Baking the
  deck through the capture frame put every slide through `sanitizeSlideHtml`, which deletes comment
  nodes — and the speaker-note, `describe:` and `caption:` channels ARE comments. So the export lost
  every note and accessible description, and, worse, the empty set left `stripNotesFromSource` with
  nothing to remove: a deck exported with **Strip speaker notes** on shipped the note text verbatim
  in its envelope. The channel is now lifted ONCE at the render boundary (`notesCore.slideNoteRecord`) and read from
  there — as the INDIVIDUAL note bodies (`noteBodies`), not by splitting the display-joined
  `note` back on the blank line: the strip matcher compares a comment's WHOLE trimmed body, so
  a single note that CONTAINS a blank line shattered into fragments that matched nothing and
  shipped verbatim. A first repair did exactly that and narrowed the leak rather than closing
  it. Nothing downstream depends on a comment surviving a DOM round trip. It is split
  DEPTH-AWARE: the flat splitter truncates a slide holding a hand-authored `<section>` at the nested
  close tag, dropping its comments while leaving the slide COUNT correct — so the loss passed a
  count-parity check unnoticed, and a first attempt at this fix still leaked on that deck shape.
  Note that the envelope manifest is base64-encoded, so the leaked note was invisible to a plain
  search of the exported file — only `parseEnvelope` sees it.
- **PowerPoint exports carry their accessible descriptions again.** The PPTX alt text was read
  out of the same sanitized capture frame, so a screen reader got `Slide 1` while the author's
  `describe:` text sat intact one step upstream. Same root cause as the lost notes; both now read
  a per-slide record lifted from the engine render, before any frame exists.
- **Speaker notes no longer ship as narration.** The narration bake was handed the RAW source, not
  the scrubbed one, and its chain reads the slide note — so a deck exported with **Strip speaker
  notes** ON *and* narration on shipped every note as visible caption text, and as synthesized
  audio the recipient could play aloud. Third channel, same flag.
- **A failed diagram bake is reported rather than swallowed.** It shipped the un-inflated fence in
  silence — the exact defect the bake exists to fix — and the two most likely failures (the bake
  returning nothing usable, and a slide-count mismatch) did not even reach the `catch`, because
  neither throws. All three paths now warn, AND the reason reaches the completion toast: a
  degraded export reads "Webpage ready — but diagrams ship as source, not as drawings." The
  status line alone was not enough — it is replaced by the next message and gone by the time the
  file lands, so the only durable thing the author saw was a toast saying the file was fine.
- **`waitForDiagrams` waits for the fences the runtime has not reached yet.** It counted only
  existing `.mermaid` boxes, and an untagged fence has none — so on the very deck it exists to
  wait for it saw nothing pending and returned at once. It now gates on the runtime's own
  `data-mermaid-state`, which also makes the PPTX/PDF raster of a diagram-heavy deck less racy.
- **An author-colored Mermaid label keeps its color in the player.** Rewriting labels into
  native `<text>` brought them under `mermaid.css`'s theme rule — `.label tspan { fill:
  var(--text-heading) !important }` — for the first time. That rule is RIGHT for an ordinary
  label (the chips re-theme from tokens and the ink has to follow) and wrong for one an author
  set via `classDef … color:`, which the live render honors and the rule silently took back:
  white-on-black authored, dark-on-black shipped, 1.04:1, while the PDF beside it was legible.
  The bake now emits the theme TOKEN for a default label — so it keeps following — and the
  literal plus an opt-out marker only where the author actually chose a color.
- **`vector-effect` and `dominant-baseline` survive the sanitizer.** DOMPurify's default profile
  drops both, the engine emits both, and no CSS backstops either. `journey`'s sentiment curve
  rides a `preserveAspectRatio="none"` viewBox with a 2.5-unit `non-scaling-stroke`, so stripping
  it scaled the stroke ~77x and painted the whole chart area as one solid slab — in every Studio
  artifact and in the exported player, while the CLI PDF of the same deck was correct.
  `dominant-baseline` is attribute-only on quadrant, radar, gantt and state-chart; stripping it
  drops a centered label ~35% of its font-size and reintroduces the phantom-box overlap
  `quadrant`'s placement pass exists to avoid. Both are enumerated-keyword presentation
  attributes with no URL or script grammar, so the allowlist widening costs the threat model
  nothing; `<script>` and `<foreignObject>` remain barred. Measured across the 75 gallery decks:
  543 and 66 dropped respectively.
- **The derived-token closure reads `:root` only.** The first cut of it scanned the WHOLE
  stylesheet and re-emitted what it found at section scope — but the hoist drops the original
  selector, which is sound only for tokens declared at `:root`. The engine also declares custom
  properties inside COMPONENT rules (`--elevation-card` on `section.lifted`, `--pill-border` on
  an nth-child arm, the entire `--fs-*` type scale on size classes), and at `(0,7,1)` the hoisted
  copy outranked the rule it was read from: `_class: flat` got the lifted card's shadow back,
  and a pill border recolored to a categorical mark — in the DEFAULT light view, no toggle
  needed. Measured on `dist/lattice.css` + `themes/indaco.css`: 281 of 435 candidate tokens had
  a declaration outside `:root`. The scan now takes only blocks whose SUBJECT is `:root`
  (`:root[…] .lattice-bg` does not qualify), and takes the LAST declaration of a token rather
  than the first, as the cascade does — 203 tokens carry more than one.
- **The prune gate identifies the deck stylesheet by id, not by size.** The dual-mode block
  carries the token body once per scheme scope, so it is not necessarily smaller than the
  PRUNED deck CSS beside it; once it overtook it, the integration gate silently measured the
  wrong block and went red. It ships as `<style id="lattice-dual-mode">` and is excluded by id,
  the same way the embedded-font block already was.
- **A diagram that fails to bake now says so on both hosts.** The per-diagram `catch` was
  silent, and an unbaked diagram keeps its `<foreignObject>` — which the sanitizer strips,
  shipping the wordless diagram this whole change exists to prevent. Silence there is
  indistinguishable from success, which is how the original defect stayed unnoticed. Both the
  CLI and the Studio now count the failures and warn with the count.
- **The `.vtt` caption export uses the depth-aware split too.** `shareCaptions` still ran the
  flat splitter, so on the same nested-`<section>` deck shape the rest of this change fixes, a
  slide's `<!-- caption: -->` and note fell outside its chunk and it narrated the DOM projection
  instead — with the slide count correct, so parity could not catch it.
- **The PowerPoint alt text checks its parity before binding.** The description record and the
  rasterized sections come from two different splits and were bound BY INDEX with no length
  check; any divergence would have given every later slide someone else's description, silently.
  A mismatch now warns and falls back to neutral alt text.
- **Size.** These fixes make the exported file bigger, and that is worth stating plainly for a
  file whose purpose is being emailed around. Measured against `main` on the same decks:
  `color-mode.md` 461,749 → 492,216 bytes (+6.6%), `mermaid-diagram-surface.md` 601,524 →
  730,767 (+21.5%). The first is the dual-mode block (the scheme-pin fix); the second is mostly
  the baked diagram text, which IS the feature. Scoping the derived closure to `:root` took the
  dual-mode block from ~68.6 KB to ~38.6 KB.
- **The deck-wide toggle no longer stamps over a slide that pins the opposite scheme.** The
  deck-wide color mode is a default and a per-slide pin outranks it — but `applyDeckMode`
  added the class to every section, including one the author marked `light`. The token rules
  restored the light VALUES correctly (the canvas went white), and every CLASS-keyed engine
  rule still fired: `section.dark …{color:var(--on-dark-secondary)}` paints from a constant
  with no light/dark pair, so nothing in the dual-mode block could undo it. Measured on
  `examples/mermaid-diagram-surface.md` slide 4 — whose own headline is "A slide that pins
  `light` still renders light" — the eyebrow was **1.0:1, white on white, in the exported
  file's DEFAULT state**, no toggle required. The same white-on-white this change exists to
  remove, reintroduced through a class instead of a token.
- **A light-pinned slide inside a `color-mode: print` deck keeps the print band.** The two
  pin-restore rules were missing the `:not(.print)` their `.dark` sibling carries and calls
  load-bearing. A slide can hold both classes (the engine allows it — print is non-droppable),
  and at (0,4,1) these outranked `section.print` (0,1,1), so a toggle to dark silently swapped
  the B&W-safe band for the theme's light colors. A contract break rather than a legibility
  one, which is the kind that ships unnoticed.
- **A themed diagram label is no longer mistaken for an author's own color.** The "did the
  author choose this ink?" test compared against `--text-heading` alone, but a container or
  subgraph label is painted from `--c-on-container` and a categorical chip from the
  `--cat-on-*` pair. So 18 labels on the gallery deck — which contains no `classDef` anywhere
  — were judged author-owned, frozen to their dark-mode literal and opted out of re-theming,
  putting `#E4EDF5` ink on a light card at 1.12:1 after a toggle. The check now covers the
  whole set of label inks and emits whichever token matches; only a color matching none of
  them is the author's, and that case still keeps its literal and its opt-out marker.
- **A baked diagram follows the player's toggle instead of freezing at export.** Inlining each
  diagram's computed paint is right for a scheme-PINNED slide and wrong for an unpinned one in
  a file whose viewer owns a light/dark switch: the paint stayed at its export-time value while
  the surface under it flipped. Measured on an ordinary unpinned `_class: diagram` slide, the
  connector strokes stayed `#1A1A1A` on a `#001D33` canvas — **1.09:1** — while their
  arrowheads re-themed through a `!important` rule in `mermaid.css`, so the diagram read as
  floating arrowheads with no lines between them. This is the same shape as the bug that opened
  this whole change: correct to the sender, broken for the recipient. A paint whose value equals
  a scheme-varying token's current resolution now rides as that TOKEN — the same trick the label
  ink already used for `--text-heading`, generalized to `fill`/`stroke` over the `--diagram-*`
  family. Verified across the toggle: `#1A1A1A` → `#CBD9E8`, edges matching their arrowheads.
  Pinned decks are unaffected in either direction.
- **The note boundary reads a comment the way the browser does.** `--!>` closes an HTML comment
  (as a parse error, but it closes) and the kernel regex only knew `-->`, so a one-character typo
  merged a note with whatever followed it into a single body — which then entered the
  `--strip-notes` scrub set, so the whole span was deleted from the envelope source. Aligning the
  terminator splits them again.
- **A directive can no longer be deleted from the author's own source.** `stripNotesFromSource`
  removes any comment whose body was lifted as a note, and its directive safety rested on the
  ENGINE having consumed every directive before the extractor ever saw the HTML. That is the
  engine's property, not the extractor's, and it does not hold when a directive survives into the
  rendered section — one malformed neighboring comment is enough. `<!-- _class: title -->` was
  then lifted as a note and scrubbed out of the verbatim source the envelope carries, so the
  recipient re-imported a deck whose slide had silently lost its class. `noteBodiesFromHtml` now
  classifies directives itself (`isDirectiveComment`, mirroring the engine's `KNOWN_DIRECTIVES`
  with a parity test), so the guarantee is local and unconditional. The classifier requires EVERY
  line to be a directive line, which keeps the two failure modes apart: looser matching would
  hold a genuine note like `Note: mention the caveat` OUT of the scrub set, which is a leak — the
  worse direction.
- **`--strip-notes` now audits its own output, fail-closed.** Every leak this contract has had
  was a new way for the two sides of the scrub to disagree — bodies lifted from the RENDER
  against comments present in SOURCE. An empty set, a joined-then-split body, a `--!>`
  terminator, a flat splitter, a directive-shaped note: five mechanisms, one shape, and
  matching is open-ended by nature. So the export now checks the OUTPUT instead of trusting
  the matcher: `auditStrippedSource` re-scans the scrubbed envelope and reports any comment
  still standing that is not a directive, a tooling pragma, a `describe:` or a `caption:`. It
  is independent of the matcher, so it catches a failure OF the matcher rather than sharing
  its assumptions, and it can only report — never delete. Wired into both hosts: the CLI
  warns with the offending text, the Studio puts it in the completion toast.
- **The directive classifier no longer swallows a note that opens like a directive.** It
  matched the deck-scope form too (`color:`, `class:`, `footer:`), which is real directive
  syntax AND exactly how a speaker note might start — so `<!-- color: we should discuss the
  palette -->` was classified as a directive, held out of the scrub set, and shipped. Only the
  unambiguous `_`-prefixed SPOT form is protected now; the deck-scope form is treated as a
  note, which is what the engine's own model says an unconsumed comment is. Leaking is the
  worse direction: a scrubbed directive costs the author a class on re-import, a leaked note
  costs them the room.
- **An unterminated `<!--` is now an authoring error instead of a silent leak.** The comment
  matcher requires a terminator, so an unclosed comment yields no note body at all,
  `--strip-notes` finds nothing to remove, and the text ships verbatim in the shared file's
  embedded source — the exact opposite of what the author asked for. New lint rule
  `unterminated-comment` (error), reported against the right slide (it used the raw chunk
  index, which counts the two front-matter chunks and so named every slide two too high on
  every deck that has front matter — i.e. all of them). Deliberately a lint finding rather than a scrub: making the
  strip match to EOF would delete the rest of the deck from the author's own source, which is
  worse than the leak it fixes. The rule neutralizes comment markers inside fenced blocks and
  inline spans rather than deleting indented lines — the first cut ran against a helper that
  strips any line indented four spaces or more, which ate the terminator of an ordinary
  hanging-indent note and reported a well-formed comment as unterminated, at error severity,
  claiming the author's notes would ship. Swept: 898 markdown files in the repo, zero findings.
