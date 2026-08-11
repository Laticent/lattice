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
  there, so nothing downstream depends on a comment surviving a DOM round trip. It is split
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
  neither throws. All three paths now warn. The signal is still weaker than it should be: the
  status line is transient and the export's own completion toast still says the file is ready, so
  a durable failure indicator is outstanding.
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
