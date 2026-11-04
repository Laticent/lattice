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

The same mask reaches four component looks that are not switches (a collage's, a statement image's
and a claim-bleed slide's hidden page number, and half of `mark-asterisks`). Off this change's path;
recorded in `followups.d/3023-p3-marp-masks-component-pagination-and-asterisks.md`.

## Also fixed on the way

- A deck-wide `class: no-row-label` was silently ignored on the engine path (its rule runs before deck
  classes reach the slide); the rule now reads the deck's `class:` itself.
- A deck-wide `class: no-period` was ignored on the engine path for the same reason: the period rules
  were anchored straight after the slide containers, which put them BEFORE `deck_class_propagate`. They
  now run after it (`afterDeckClass`, lib/integrations/markdown-it/plugins.js).
- The Studio's Chrome tab hid its three band rows on a `silent` slide, so a band could not be brought
  back there; each row now shows what the slide actually shows and writes `no-X` or `with-X`. A logo
  row was added.
