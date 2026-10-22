---
status: shipped
summary: >
  `contact` and `wifi` lost their QR code, phone and URL at huddle and above, and nothing warned,
  because their manifests said `venueCapacity: none` ("a fixed card, nothing to count") and the only
  venue check was a count budget. `npm run check:venue-conformance` now renders every component at
  every venue and canvas and looks. It found 719 failing rows in 175 component/register pairs; after
  this change the whole catalog is at 53 rows, all named in the tool with a reason. The fixes follow
  one rule, "type scales with the venue, geometry does not", plus a per-venue words budget for
  one-block prose components (`venueCapacity.prose`, lint rule `venue-prose`). Remaining decisions
  are the owner's (§8).
builds-on: 2026-09-29-one-reading-size-per-venue.md
---

# Venue conformance: render it, don't count it

**Status:** shipped 2026-10-22 · **Owner:** Sharmarke · **Code:** `tools/check-venue-conformance.js`
(the harness); the card and component fixes in §4

## 1 · What was reported

The `contact` card does not suit a hall or a conference room, it needs to support a telephone, and
the other components should be checked for the same problem with a harness that stops it recurring.

## 2 · What the audit found

**`contact` at hall:** the name alone, at `--fs-hero` x 1.5 = 129pt, filled the card. The QR code,
the email, the phone and the URL were pushed past the frame and clipped. Even the shipped sample
clipped from huddle, and `wifi` failed the same way. On a portrait canvas both failed at laptop.

**Why nothing warned.** The only fit check was a count budget (`venueCapacity`), and `contact` and
`wifi` had opted out with `venueCapacity.none`, a free-text sentence nothing verified. A card has
nothing to count and still clips, because the size of its parts is not a count.

**The same hole, catalog-wide.** The harness renders each component's sample, bare and per register, at
four venues and four canvas families (a 3-minute run) and checks: V1 the engine did not mark the slide
clipped; V2 nothing visible is outside the slide or its clipping ancestor; V3 a QR code is at least a
venue-set share of the slide width.

| | Failing rows | Component/register pairs |
|---|---|---|
| First run (the 13 components in scope plus the rest) | 719 | 175 |
| After the probe fixes in §5 (false positives removed) | 643 | |
| After the fixes in §4 | **53** | 19 |

45 of 79 components had exempted themselves with `none`; 15 of those failed at some venue. The 13
named in the request (`big-number`, `citation-card`, `collage`, `columns`, `gantt`, `image`,
`journey`, `logo-wall`, `math`, `matrix-grid`, `progress`, `redline`, `rows`) plus `contact` and `wifi`
now pass at every venue on the wide canvas, and `contact` and `wifi` pass on all four canvases.

## 3 · The rule the fixes follow

**Type scales with the venue; geometry does not.** A venue multiplies every type role, so any length
written in `em` grows with it. `contact` padded, gapped and sized its QR in `em`, so a hall's 1.5x
step also inflated the card around the text. Every length in the fixed cards is now a share of the
slide (`--_sec-1cqi`, `--_sec-1cqh`), and only the text grows. Two axes stay apart: the **canvas
family** (`data-family`) picks the structure (wide: identity | code; square: ledger beside the code;
tall and strip: one column) and the **venue** picks the type size and the code's floor width.

**Fit has a floor.** Text that must fit a column (a display name, a ledger line, a caption) shrinks to
the smaller of its role and what fits, but never below about its laptop size. Past the floor the card
overflows and the engine flags it, instead of text quietly set too small to read. This is the
contract, because a `venue:` is a fixed setting the engine does not shrink content to meet (owner
ruling 2026-09-27). The two are consistent: a card's text fits its own box within a legible range; a
slide that holds more than its component holds still clips, loudly, and `lint:deck` says so first.

**Count-bound and prose-bound components declare a budget, and a probe.** Measured on the real
slide shape (a heading, its eyebrow, then N items), not a synthetic one.

## 4 · What shipped

- **`contact`, `wifi`** (kernel `_qr-card`): geometry in slide units, family-driven structure, fits with
  floors, code floor `--qr-min` (laptop 0.10, huddle 0.12, conference 0.16, hall 0.22 of the slide
  width, set with the venue in `base.modifiers.css`). `contact` gains typed phone lines (`mobile`,
  `office`, `phone`, each a `TEL;TYPE=` entry), an authored-order ledger, and `qr: vcard | tel | url`
  (a realistic vCard is 55-67 modules wide, a `tel:` code 27, so it scans from about 2.5x further).
- **Budgets and probes** (`venueCapacity`, `venueProbe`): `progress` 9+/6/5/4 rows, `journey`
  6+/6+/3/2 stages, `matrix-grid` 7/4/3/2 rows, `gantt` 3 lanes, `math` 7/6/3/2 legend lines,
  `logo-wall` 8/8/4/4 logos (`dense`: 12/12/12/6). The rig's builder numbers overstated three of them,
  so each was re-measured on the real slide.
- **A words budget for one-block prose** (`venueCapacity.prose`, a schema shape beside `byWords`,
  baked into `venue-capacity.generated.js`, printed in the docs and pick list): `big-number` caption
  36/24/16/12, `redline` 84/84/72/20 (with rows per register; `three-col` holds none from conference),
  `image` 72/60/44/30, `collage` 52/36/30/20, `citation-card` 117/79/55/31 across quote, gloss and action.
  Lint rule `venue-prose` (`lib/authoring/venue-prose.js` reads the slot) warns past it; registered in
  `spec/diagnostics.md`.
- **Layout fixes found by the harness:** `journey`'s mood band and curve were full size at every
  venue while its legend grew, so conference and hall held **zero** stages: a venue now tightens one
  variable (`--journey-mood-row`) that the band, faces and plumb lines all read. `collage`'s text
  column (a fixed 30%) widens to 33/38/44% with the venue. `progress`'s track was shorter than its
  own percentage plate at hall. `matrix-grid`'s rotated row-axis title was cut on a short grid; the
  figure now has a minimum height for its own title. `closing qr` and `divider qr` put the code beside
  the heading on wide and share the floor.
- **Hosts** (`columns`, `rows`): a probe of small panes, since they hold what their panes hold.

## 5 · The harness, and how it was made honest

`check-venue-conformance` reuses `audit-reading-size`'s rig. Its first run was noisy; each source of noise
was fixed in the probe, not hidden: a clip is per axis; an out-of-flow box is clipped only by an overflow
box at or above its containing block; a text run's glyph padding is not content (the middle 60% across
the line is tested, and rotated text is detected from its computed style); screen-reader-only text is
skipped; a register uses its own sample (`variantDocs`); a host that the engine paginates is reported as
"not judged" rather than failing.

**What it cannot see.** CSS-generated content (a `::before` label) has no DOM text, so the harness and
the engine's own clip detector both missed `matrix-grid`'s cut axis title; a person found it from the
demo deck. Anything drawn only by a pseudo-element needs a look.

**The contract per kind of component.** A component with a count or prose budget is judged on its
`venueProbe` at the **wide** canvas, because its budget is measured there; its laptop-size sample is
over budget at hall by design and `lint:deck` says so. A component with none is judged on sample and
probe on all four canvases.

## 6 · Open, named in the tool (`KNOWN`)

53 rows, each with a reason; `--strict` fails on an unnamed row or a stale entry.

- **Display text on a portrait canvas at hall or conference** (`title`, `quote`, `content`, `topic fact`,
  `closing`, `divider qr`, `scene`, `video`, `piechart donut`, `state-chart`): the type scales twice and a
  portrait slide is read on a phone, not in a room. The venue contract is a landscape one; recorded, not
  designed for.
- **`video qr`:** its code is a fixed `8rem` (10% of the slide at every venue), under the floor from
  huddle, and its caption is clipped under the poster. Moving it onto the shared sizing made it clip at
  laptop, so that edit was backed out; it needs its own layout.
- **`pricing` at laptop:** a footnote clipped by its list item; predates venues.
- **Not yet contracted:** a count or prose budget is measured at the wide canvas only. The same
  components clip at hall on portrait canvases, and lint cannot say so, because the budget has no
  per-canvas row.

## 7 · Cost, measured

The harness takes about 3 minutes for the whole catalog on a 6-way pool and about 4 seconds for one
component. The hook suite for this change ran to about 400 seconds because it touches the manifest
schema and a generated table.

**Bytes.** The `venue-prose` rule and its slot readers cost about 485 bytes gzipped in the Studio's live-lint
bundle, which had 203 bytes of headroom under its hard ceiling. After two rounds of trimming the rule's own
code and the generated rows, the bundle measures 112,922 bytes; the owner raised the ceiling by 1,024 bytes
(112,640 to 113,664) on 2026-10-22 (`docs/route-budget.history.md`).

## 8 · Calls for the owner

1. **CI.** The harness is on demand. A ratcheted CI step (a committed baseline that may only fall,
   like `overflow:check`) is now cheap, since the baseline would be the 53 named rows. Adding a CI step
   changes the CI contract, so it is yours.
2. **`venueCapacity.none`.** Recommended: the manifest schema requires a `none` component to carry a
   `venueProbe`, so the sentence is verified instead of trusted. Today it is convention.
3. **The code floors** (10 / 12 / 16 / 22%) are my estimate from "a phone reads a code from about ten
   times its width"; they are the first thing to measure on a real projector.
4. **Per-canvas budgets.** Extending `venueCapacity` and `venue-prose` to carry a row per canvas family
   would let lint speak for portrait decks at a venue. It is a schema and generator change.
