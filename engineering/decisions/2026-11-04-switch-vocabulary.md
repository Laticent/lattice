---
status: shipped
summary: Every on/off a deck or a slide can set is a SWITCH, spelled `no-X` (off) / `with-X` (back on for one slide), with one precedence — `with-X` > `no-X` > `silent` (header, footer, page number, rail) > the layout's default — read from one table (lib/core/switches.mjs) by the engine, the runtime (a Marp bundle), lint and the Studio. Owner's rulings (2026-11-04): one spelling, the `-on`/`-off`/`-none` forms retired by a HARD rename (lint rewrites them), `none` values renamed to `no-X`, front-matter settings keep their plain words (`motion: off`). Adds `with-header`/`-footer`/`-logo`/`-note`; settles each slide's classes (with-X removes no-X, silent expands) so the stylesheets key on `.no-X` alone. Name calls: the pane divider is `no-spine` (its own docs call it the spine) and the heading underline `no-heading-rule`, so the retired `no-rule` maps one way; `tag-none` was never a switch (a bare-text tag), renamed `tag-bare`.
---

# One spelling for every switch

**Ask:** "we should have one semantics no-* and with-*. we should ditch on and off semantics. we need
to support all of these. … get confidence to very high and ensure it works on all surfaces including
marp. ideally they should all have a shared spine." Follows
`2026-11-03-marp-bundle-live-front-matter.md`, whose `with-progress` started the question
"what about the other `no-*` classes?".

## What it was

An inventory (scratch, 2026-11-04) found three spellings of "off" and four of "back on":

| shape | examples |
|---|---|
| `no-X` / `with-X` | `no-pagination` / `with-pagination`, `no-period` / `with-period`, `no-progress` / `with-progress` |
| `no-X` / bare `X` | `no-row-label` / `row-label`, `no-rule` / `rule` (pane spine) |
| `X-off` / `X-on` | `callout-off` / `-on`, `motion-off` / `-on`, `spectrum-off` / `-on`, `spectrum-edge-off`, `spectrum-card-off` / bare `spectrum-card`, `spectrum-trim-off` / bare `spectrum-trim` |
| `X-none` | `finish-none`, `backdrop-none`, `treatment-none`, `rule-none`, `tag-none` |

and no way back at all for `no-header`, `no-footer`, `no-logo`, `no-note` or `silent`'s bands. The
precedence also varied: `no-` beat `with-` for motion, callouts and the row label, so a deck-wide
`class: no-motion` silenced a slide that said `with-motion`.

## The rulings

- **One spelling** (owner): `no-X` / `with-X`, nothing else.
- **Hard rename** (owner): the old spellings do nothing; `lint:deck` reports each (`unknown-class`,
  slide and deck `class:`) with a fix that rewrites it in place, and the repo's own decks are migrated.
- **`none` values become `no-X`** (owner).
- **Front matter keeps plain words** (owner, option A of three): `motion: off`, `spectrum: off`,
  `rule: none` stay; the CLASS they stamp is the switch's. Authors meet "off" at the top and `no-` on a
  slide; the alternative — `class: no-motion` as the only deck-wide spelling — splits a setting that
  has other values (`motion: rise`) across two places.

## The spine

`lib/core/switches.mjs` (with a CJS door, `switches.js`):

- `SWITCHES` — every switch, and which ones `silent` covers.
- `switchOn(name, tokens, fallback)` — the precedence, for JS that decides. Every reader now asks it:
  `pagination.js`, the rail tile, `logoShownOn`, the below-note opt-out, the table row label,
  `calloutsOff`; the Studio and the motion readers order their checks the same way.
- `settleSwitches(tokens)` — rewrites a class list so a switch carries at most one token
  (`with-X` removes `no-X`; `silent` adds the `no-X` of each band it covers that the slide did not
  bring back). The engine runs it once every class source has landed (`switchSettle`, after
  `componentSpectrum`); the runtime runs it inside the deck stamper (so a re-stamp cannot add back a
  token the settle removed, which would trade the token on every pass) and once per content pass.
  The stylesheets key on `.no-X`; the `silent` rules also say `:not(.with-X)` for a host that runs no
  script (VS Code's default preview level).
- `REGISTER_SWITCHES` + `registerToken` / `registerValue` — which front-matter setting's off/on word
  stamps which switch. The register factory applies the same rule to any setting with an `on`/`off`
  word (so a plugin register — `callout:` — needs no code); the Studio and lint map values ↔ classes
  through it instead of `prefix + value`.
- `RETIRED_SWITCHES` — old → new, read by lint.

## Name calls taken under the rulings

- **`no-spine` / `with-spine`** for the pane divider, **`no-heading-rule` / `with-heading-rule`** for the
  heading underline. Reusing `no-rule` for the heading underline would have silently changed every
  existing `columns no-rule` slide from "no spine" to "no heading underline", with no lint able to
  tell which the author meant. The pane docs already call the divider the spine.
- **`tag-bare`** for `tag-none`: it never hid the tag (it draws it as bare text), so `no-tag` would
  have said the wrong thing. The front-matter word is `tag: bare`.
- **`silent` keeps hiding the rail.** The code always did; a Studio comment said otherwise. Kept what
  renders; corrected the text.
- **Multi-value settings:** `with-X` is the setting's default "on" value, as the retired restore tokens
  were (`with-spectrum` = the rainbow, `with-spectrum-edge` = the top bar, `with-heading-rule` = auto).

## Marp: what a stylesheet cannot do there

Two switches never worked in a Marp render, and a class-parity check would not have shown it, because
the class was on the slide and the CSS rule was in the bundle:

- **The page number.** Marp's CSS pipeline (marpit's `postcss/pagination`) comments out every `content`
  declaration on a selector shaped `section…::after` with no whitespace or combinator, so
  `section.no-pagination.no-pagination::after { content: none }` reached the page with an empty body
  (measured in the bundle marp-cli writes). Marp draws the number from its own `data-marpit-pagination`
  attribute, so the fix speaks that: the export already wrote Marp's `_paginate` lines
  (`lib/core/marp-bundle-scope.js`), but read a slide's `_class` as REPLACING the deck's `class:`; it now
  adds the two, as the engine does. The runtime (`syncMarpPagination`) keeps a slide's attribute in step
  with its switch, so a `with-pagination` typed after the export, in the VS Code preview, also lands.
- **The heading period.** The engine adds or strips it while it parses; Marp runs no engine code, and
  the fidelity ledger listed both rows as `unmirrored`. The runtime now applies the same rule
  (`syncHeadingPeriods`, from `lib/core/heading-period.js`, which the engine plugins also use) in a Marp
  render only. Both rows are `mirrored` and probed in `marp-fidelity-render.test.js`.

The same mask reached three more rules that hide the page number: on a collage, a statement image and
a claim-bleed slide. The card grader judged them on this change's path (the same mask, on the export
this PR fixes), so they are fixed here. Each of those rules, and the `no-pagination`/`silent` one, now
ends `:where(:not(* > .lat-never))` before `::after`: always true, no specificity, and the `>` puts it
outside the mask. A leading `:is(section)` would have been tidier, but `tools/build-css.js` distributes
a leading `:is()` back to `section`. `test/unit/export/marp-pagination-mask.test.js` runs marpit's own
test over the shipped `dist/lattice-min.css`, so a new masked `content` rule fails CI.

`mark-asterisks` was the last masked rule, and the one with a real conflict: it draws its second
cluster on `section::after`, which in Marp IS the page number, so only one of them can paint there. The
options were (a) the asterisks win, (b) the page number wins, (c) redraw both clusters inside `::before`.
**The owner picked (a)** (2026-11-04): the rule carries the same suffix, so a Marp render of a
`mark-asterisks` slide draws both clusters as Lattice does and shows no page number. The engine draws its
page number as a real element, so its render is pixel-identical before and after. The test's allowlist
is now empty.

## Also fixed on the way

- A deck-wide `class: no-row-label` was silently ignored on the engine path (its rule runs before deck
  classes reach the slide); the rule now reads the deck's `class:` itself.
- A deck-wide `class: no-period` was ignored on the engine path for the same reason: the period rules
  were anchored straight after the slide containers, which put them BEFORE `deck_class_propagate`. They
  now run after it (`afterDeckClass`, lib/integrations/markdown-it/plugins.js).
- The pane spine read only the slide's own `no-spine`: `with-spine` did nothing and a deck-wide
  `class: no-spine` never reached the pane parser. `classLayout` (lib/core/pane-spec.js) now decides
  it over the deck's tokens and the slide's by the switch rule, restated inline because pane-spec.js
  stays require-free for the Studio (a test pins it to `switchOn`); the alias layout
  (`<!-- panes: 40/60 -->`) gets the deck's switch in lib/core/panes.js (the maker-checker passes).
- `no-period` strips a LONE trailing period, never an ellipsis: `To be continued...` keeps its dots.
  The old one-dot strip ate an ellipsis a dot per runtime pass (the maker-checker pass).

## What the checker pass changed

- **A host's callout switch is not a switch an author can override.** A Marp bundle whose plugin
  admission left callouts off used to stamp the author's `no-callout`, which a slide's `with-callout`
  now beats. The runtime writes the engine-internal `lat-callouts-off` instead
  (`HOST_CALLOUTS_OFF`, lib/core/legend.js), which `calloutsOff` reads as the host's.
- **The Studio's page-number row** reads what the engine renders when the slide names no switch: the
  deck's `paginate:` and the layout's default (`slidePaginates`). The rail and logo rows read the switch
  itself, because `with-progress` cannot make a rail in a deck with no divider.

## What the adversarial trio changed (red team, Munger inversion, second checker)

- **One grammar for the settings block.** Two folds and the runtime each had their own idea of where a
  block ends; a block closed mid-line made the line fold run to a later `</script>` line inside a fenced
  example and swallow a slide. `settingsBlockAt` (lib/core/settings-block-fold.js) is now the one
  reader both folds use: open tag alone on its line, no script tag in the body, `</script>` alone on its
  line. The runtime reads a block only in the FIRST slide, so one an author wrote on slide 7 stays theirs.
- **Every slide reads the deck's `class:`.** Three more readers saw only the slide's own classes: the
  engine's page-number rule (`paginates`, lib/engine/slides.js), the callout reader the narrator and the
  `legend-off` lint share (`calloutsOff`, lib/core/legend.js), and the retired-`_paginate` lint. All three
  now add the deck's tokens. test/unit/core/switch-parity.test.js pins it for every switch: deck `no-X`
  renders as the slide's own `no-X`, and deck `no-X` plus slide `with-X` renders as the slide's `with-X`.
- **A switch removed after export brings the page number back in Marp.** With the deck's `paginate:`
  visible, `syncMarpPagination` decides every slide by `slidePaginates`, not only the slides that name a
  switch.
- **The hard rename is loud where authors look.** The CLI render warns on every retired spelling by name,
  four of which a reserved prefix used to hide; lint's message no longer says the slide "renders as a plain
  slide"; a bundle's top `class:` is fixable in place.
- **The pane spine follows the switch rule in both spellings** (`with-spine no-spine` in an alias marker
  no longer lets the last word win), and its words stay on the slide as classes, as a deck-wide one does.
- **The heading period is not wedged before trailing code or math** (`Use .npm`); a heading that ends in
  either gets none, in the engine and the Marp mirror alike; `no-period` never empties a heading.

## What the third look changed (a checker on everything after the trio)

- **Slide 1 is the slide's container, not its first `<section>`.** A Marp `![bg]` puts a background
  layer before the content layer in the same slide `<svg>`, so the first-section test ignored the deck's
  block. `readSettingsBlock` scopes to the first `svg[data-marpit-svg]`.
- **A heading that IS a period keeps it, judged on the whole heading.** The guard had sat on the last
  text run, which after `*today*` is a lone `.`, so `no-period` stopped stripping it.
- **The VS Code saved-top fetch syncs the page numbers when it lands**, and a stale fetch (a re-render
  while it was in flight) no longer overwrites a newer block (`deckFrontMatterGen`). Pinned by a jsdom
  test of the VS Code path.
- The CLI's retired-spelling warning names only what lint reports (a fenced example is not a class).

## Bytes

The first push measured the engine route budget (`engineJsGz`, docs/route-budget.json) 2.9 KB past
its ceiling. Measured against `main` (esm/engine.js closure plus `lattice-runtime-min.js`, gzip 6):
this change added 6.9 KB. Given back, each by moving code to where it is read, with nothing removed:

| move | what the boot bundles stop carrying |
|---|---|
| the switch table keeps names only; `RETIRED_SWITCHES` moves to `switches-retired.mjs` (lint only) | 1.5 KB raw in each of engine and runtime |
| the settings block splits into `front-matter-groups.js`, `settings-block.js` (runtime), `settings-block-fold.js` (engine, lint) and `lib/export/bundle-front-matter.js` (export, lazy) | the export half in both, the fold in the runtime |
| the runtime's two helpers from plugins.js (`deckLogoTintVars`; the Frame helpers via `form-default.js`) move to `deck-logo-tint.js` and `form-frame.js` beside it | all of `plugins.js` (23 KB raw) from the runtime |

Net: the PR leaves `engineJsGz` about 4.9 KB BELOW `main` (measured locally, 2026-11-04).
- The Studio's Chrome tab hid its three band rows on a `silent` slide, so a band could not be brought
  back there; each row now shows what the slide actually shows and writes `no-X` or `with-X`. A logo
  row was added.

## Studio controls (follow-up, 2026-11-05)

The owner asked that every switch have a Studio control at the deck AND the slide level, organized one
way (followup `3023-p2`, now deleted). The owner was away, so the session took the followup's own
suggested grouping, trimmed to the tabs both panels already had plus one new one.

**Where each switch lives.** `docs/src/components/studio/switch-controls.ts` `SWITCH_HOMES` holds it,
one row per `SWITCHES` name. `switch-controls.test.ts` fails when a switch has no home, when a home
names a tab or row label the panel does not draw, or when a home names a name that is not a switch.

| tab (both panels) | switches | control |
|---|---|---|
| Chrome | header, footer, pagination, progress, logo | deck: text rows, Page numbers, Section rail, Logo; slide: the Hide rows, unchanged |
| **Content** (new) | note, period, row-label, spine, callout | deck: a toggle, or Auto / On / Off for a switch with a measured default (period, row label); slide: Auto / On / Off |
| Accent | spectrum, spectrum-edge, spectrum-card, spectrum-trim, heading-rule | the existing pickers; Off / None is the switch's `no-X` |
| Look | finish | Finish ▸ None writes `no-finish` |
| Marks (slide) | treatment | "Hide the deck's tints", which writes `no-treatment`; shown when the deck's `class:` stamps a tint or mark |
| Motion | motion | Play |

**Two switches have no control at one scope, on purpose.** `backdrop` has none at either: `no-backdrop`
is the old spelling of `no-finish`, and both clear the finish, so Finish ▸ None (which writes `no-finish`)
is its control. The two are not byte-identical: `no-backdrop` also matches the treatment compositor's
reset in `base.treatments.css`. `treatment` has none at the deck: a
tint or a mark is set slide by slide, and a deck that stamps one in `class:` edits it in General ▸ Default
slide class.

**The Content rows are drawn from one list**, `CONTENT_SWITCHES`, by both panels, so a label, its option
words and the token it writes cannot drift between scopes. The deck writes `class: no-X` / `with-X`,
except callouts, which keep their front-matter word (`callout: off`, the "front matter keeps plain
words" ruling). The slide's Auto writes neither token, and its hint names the deck's word when the deck
set one. On or Off writes the token even when the deck says the same, so the slide keeps its choice if
the deck changes later. A slide row shows only where the layout takes the switch (the catalog's
`effectiveVariants`, so Pane spine shows on `columns`). Table row label shows on a slide with a
markdown table, and Callouts on a chart or a slide that writes a callout. The Default slide class field hides the Content tokens, as it already hid
`no-progress`, so a stray edit there cannot flip a toggle.

**A deck's On cannot be undone by a slide's Off.** The precedence is `with-X` > `no-X`, and the deck's
`class:` reaches every slide, so a slide's `no-X` beside a deck's `with-X` loses (the checker rendered
it: deck `with-period`, slide `no-period`, the period stays). Only the tri-state switches (period, row
label) let the deck write `with-X`, and a hand-written deck `with-X` or `callout: on` does the same. So
when the deck says On, the slide's Off is disabled and the row says to set the deck to Auto. Changing the
precedence for this case is the owner's call, and was not taken here.

**Not moved:** the Accent and Look rows stay where they are. Moving the heading rule into Content would
split the Accent tab's family of rules and bars, and its control is a picker with five values, not a switch.
