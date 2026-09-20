- **Fixed: a chart narrating its own data got no pointer at all.** `chart-narration.js` BUILDS a
  chart's speech from its data model and spells numbers out, so a funnel band rendered as
  `Visitors` + `12,000` narrates as "Visitors: twelve thousand" — words that appear nowhere on the
  slide. Both existing matchers search the slide's TEXT, so they found nothing and the cursor hid:
  `funnel` resolved 15.8% of its cues, `heatmap` 25%. A third tier now matches a cue against the
  DOM's own declared identity — a mark's `data-label` / `data-value` — and turns one spelling into
  the other with `toSpokenText`, the same call the narration used. **`funnel` 15.8% -> 89.1%,
  `heatmap` 25% -> 100%, `state-chart` 88.7% -> 93.5%**, corpus 88.9% -> 89.7% over 10,551 cues.
  Each band now draws the gesture its own shape asks for rather than one underline for all: on the
  real render, `Visitors` an underline across 1107px, `Signups` a circle on 443px, `Paid` a tap on
  103px. The tier runs LAST, so it cannot change an answer the existing two already gave.

- **Fixed: `useWalkthrough` latched `active: true` forever when `run()` threw.** The hook set
  its flag before calling the engine, so on either of `run()`'s two documented synchronous
  throws — the single-flight guard and an accent `resolveTheme` refuses — no handle was ever
  assigned, `onStop` never fired, and `stop()` had nothing to stop. Whatever the host disabled
  on `active` stayed disabled for the life of the component. The throw is re-thrown, not
  swallowed: rejecting an unsafe accent is a feature a host catches by hand. The suite could
  not see this because the only arm that reaches it needs the throw CAUGHT inside `act()` —
  letting it escape makes React discard the pending update and the defect hides.
- **Fixed: two collapsed-whitespace joins on `/vetrina`.** Astro drops the newline between a
  line-ending word and the inline tag opening the next line, so the lede rendered "theater
  over**real state**" and the closing prose ran a comma into `<b>Update</b>`.
- **Added: `npm run sweep:guide` attributes every cue to its COMPONENT.** The sweep answered
  "does the corpus resolve"; it could not answer "does *this component* self-present", which is
  the question a component owner has — a deck at 90% can hide a component at 0%. Misses are
  attributed too, since which component goes dark is the point. It also reports the components
  the corpus never cues at all, so an absent component reads as absent rather than as passing.
- **Added: `/vetrina` shows the library's own knobs, its beat log, and its data model.** The
  page passed no theme at all for its whole life, so the five caption styles, three pointer
  shapes, three speeds, three motion tiers, the hand model and the two pacing models were
  invisible on the one page that exists to show them — including the A/B the `pacing` option's
  own documentation asks for. It now carries live controls that replay the current beat, a
  timestamped log of the verbs the engine actually performed, and the `Step[]` that `scene()`
  compiles to. Two new beats: the four deictic strokes (`underline` · `wash` · `bracket` ·
  `tap`), which had no demo surface anywhere on the site, and the `read()` teaching beat.
