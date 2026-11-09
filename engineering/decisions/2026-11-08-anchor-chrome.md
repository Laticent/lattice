---
status: shipped
summary: >
  Which chrome bands an anchor slide (title, divider, topic, closing) keeps, decided by one rule: a band stays unless
  the slide already does its job. The title drops the header; every anchor keeps the footer (a deck's "Confidential"
  lives there); the page number gives way on all four. Defaults live in each manifest's `chrome` and land as the
  band's existing `no-X` switch, so `with-X` overrides one slide. The divider's section marker moves to where the rail
  sits. `empty-section` becomes a lint warning. No new front-matter key.
---

# Anchor chrome: which bands an anchor slide keeps

**Date:** 2026-11-08 · **Decided by:** the owner, after #3056 ("placement of rails on anchor slides and what we
consider anchor slides … I think we need a systematic approach and polish that doesn't astonish people") ·
**Code:** `lib/core/component-chrome.js`, `lib/packages/chrome.generated.js` (from each manifest's `chrome`),
`lib/components/anchor/*/*.manifest.json`, `lib/components/anchor/divider/divider.styles.css`,
`lib/forms/tile/progress/progress.css`, `lib/base/base.modifiers.css`, `lib/authoring/lint-core.js`
(`findEmptySections`) · **Demo:** `examples/anchor-chrome.md`

## What was wrong

- **Anchors treated chrome three ways.** Title, divider and closing dropped the page number and kept the deck's
  header and footer. `divider numbered` alone hid the header and footer too. Topic kept everything. Nothing said why.
- **The divider's marker sat in a different place from the rail it teaches.** It was drawn mid-slide above the name
  on every `progress-rail:` placement, and left-aligned under the numeral on `divider numbered`, while the footer rail
  sat bottom-right, bottom-center or on the right edge.
- **The first rail a reader saw could say `2/4`.** `examples/gallery-jargon.md` opened its first section with two
  dividers in a row, so section 1 held no slide; its agenda listed five sections against four dividers and lit item 2
  before the deck began. `empty-section` caught the first part, but only as a review suggestion, which
  `lint:deck --all` skips.

## The rule

**A band stays on a slide unless that slide already does the band's job.** Each band has one job:

| Band | Its job | Title | Divider | Topic | Closing |
|---|---|---|---|---|---|
| Header | which deck this is | off: the title names the deck | on | on | on |
| Footer | the deck's standing note (Confidential, ©, a caption) | on | on | on | on |
| Page number | where you are, page by page | off | off: its marker does this | off: its track does this | off |
| Rail | which section | off: no section yet | as its marker, where the rail sits | off: its track does this | off |
| Logo | whose deck | on | on | on | on |

The footer is the case that decided the design. Most real decks put a "Confidential" or copyright line in a
deck-wide `footer:`, and a firm's policy usually wants it on every page. No slide does that job for it, so no
anchor drops it by default. An earlier proposal dropped header, footer and page number on every anchor ("quiet
stage"); it would have removed the confidential line from exactly the slides that open each section.

## How it is built

**No new key, no new mechanism.** Every chrome band was already a switch (`no-header` / `with-header`, `no-footer`,
`no-pagination`, `silent`; `lib/core/switches.mjs`). What was missing was a principled default per component:

- A manifest declares the bands its slides drop: `"chrome": { "pagination": false, "header": false }`. The schema
  is `lib/components/manifest.schema.json`; `tools/build-packages-index.js` compiles the fields to
  `lib/packages/chrome.generated.js` (`NO_PAGINATION`, `NO_HEADER`), so nothing names a component in code.
- The page number keeps its own reader (`lib/core/pagination.js`), because the engine counts pages.
- Every other band is stamped as its `no-X` switch by `applyComponentChrome` (`lib/core/component-chrome.js`). The
  engine runs it in `componentSpectrum`'s pass and the runtime in `applyComponentSpectrumToSections`, both before
  the switches settle, so `with-X` on the slide still wins (HARD RULE #1).
- An author overrides one slide with the switch: `<!-- _class: title with-header -->`,
  `<!-- _class: divider no-footer -->`. Deck-wide, `class: no-footer` as before.
- **Export to Marp writes Marp's own.** A host that runs no script (VS Code's default preview) never sees
  the stamped class, so `lib/core/marp-bundle-scope.js` writes `<!-- _header: '' -->` on a slide whose
  component drops the header, as it writes `_paginate` for the page number. This closes
  `followups.d/2789-p1-bookend-header-footer-via-manifest.md`.
- **The starter text stops blanking chrome.** The title, divider and closing manifests' `skeleton` (what
  the Studio inserts for a new slide) wrote `_header: ''` and `_footer: ''`, which would have deleted a
  deck's "Confidential" on every anchor an author added. They write neither now.

**`divider numbered` follows the rule.** It hid its header and footer because "the masthead owns the top band".
Rendered with the header on, the numeral sits below the header's line and the two do not meet, and `check:jank
"divider numbered" --anchor 'h2::after'` with a header and footer reports the same numbers as `main` (no drift, no
collision; the one advisory crowding line is unchanged). So the exception is gone.

**The marker sits where the rail will be.** `.divider-marker` is now out of flow in the bottom band, docked
bottom-right (`divider.styles.css`), moved to the band's center or upright on the right edge by the deck's
`progress-rail:` placement (`progress.css`, where the rail's other placements live; the ownership gate reads a
register token in a component's own CSS as an undeclared variant). The 11-06 note rejected an out-of-flow marker
because, in the TOP band, it drew over the header. The bottom band is different: a divider has no page number, so
the marker takes that corner, and the footer yields it a berth (`--_marker-w`, the rail's own 34-unit berth) and
ends in an ellipsis. With the marker out of flow, the `divider qr` cap at conference and hall, which existed only
because the marker took a row, is removed.

## One line in the bottom band

The owner's review of the first renders set the band's typography: the footer, a divider's count and the
page number are one face at one size and weight (`--chrome-fs`, weight 500, the footer's tracking, line
height 1), and they and the marks share one center line.

- The footer cell aligns its items on their **baseline** (`stage.css`), not their line boxes: a line box
  carries room below the baseline the figures never use, which put the footer's capitals, the page number
  and the marks 2 px apart each at 200 dpi.
- The rail, and the marker's marks, are a box **one cap tall** standing on that baseline, the marks
  centered in it, so every mark centers on the figures' middle. Measured on the HTML render at 2x: all
  within one device pixel. The `cap` is the footer's own: the rail takes the footer's font for it.
- One spacing unit: the gap between two marks (`0.6` slide units, times the mark scale). The count sits
  two units from the first mark; the content rail and the agenda legend use the same unit, so the
  legend, the marker and the rail share one rhythm. The count is written `2/4`, no spaces: the footer's
  tracking sets the figures apart, so it reads as one label in a monospaced face. A CSS `word-spacing`
  pull-in looked the same in the browser and the PDF, but an editable PPTX or ODP keeps letter tracking
  and drops word spacing, and the count spread wide there.
- Under `edge` the marker is **marks only**. A count beside an upright column read as odd, set across
  it ran off the slide, and set sideways or stacked it was still a label hanging off a scale.
- The marker yields where the rail does: hidden under a bottom-right logo, bottom-right instead of
  center under a bottom-center logo, and short of the page number on a `divider with-pagination`.

## The page-number column

The default `right` placement laid the footer band out as a flex row, so the rail sat against the page
number and moved with it: about 10 px left when the count reached two digits, and 50 px right on a slide
with no number (measured on `main`, 2026-11-08). A flex row can only reserve space for an element that
exists, and a missing page number left none.

The band is now a grid of four columns (`stage.css` `.cell-footer`): the footer text (`minmax(0, 1fr)`,
ends in an ellipsis), the split counter (`auto`, only on a split slide), the rail (`auto`), and the page
number's column (`--footer-pag-col`, six characters of the chrome face, `104.12`),
reserved whether or not a number is drawn. The split counter sits before the rail so its appearance takes
the footer's room, not the rail's place. `center` keeps its five symmetric columns and reads the same
token. A divider's marker ends where the content rail ends, short of that column, so the mark a reader
learns on the divider does not move on the next slide. Measured on the HTML render: the rail's right edge
holds at one value on one-digit, two-digit and unnumbered slides, under `right` and `center` alike.

The hairline that #3056 drew on the page number's start edge is gone, on the owner's call: it split
`• ━ • • 8` while the number sat against the rail, and the reserved column now keeps the band's gap
plus the column's own slack between them, about three characters for a one-digit number. Left at the column's edge, a gap away from a lone digit, it looked detached;
moved next to the digits, it would move with them. Space does the job with nothing that moves.

The band's column gap is `--footer-gap`, set in the band's own type (1.6 × `--chrome-fs`), not
`--sp-md`: `compact` redefines the spacing scale, and a `compact` slide's rail sat 6 px (hd) to 24 px
(portrait) off every other slide's. The divider's marker reads the same token. `footer-band.test.js`
asserts the resolved columns (only the footer's flexes; the page column is one width) and that the
rail's inset from the band's end is one number across a deck that includes an unnumbered page and a
`compact` page.

**One baseline on every frame.** A title, divider or closing set its footer, page number and section
marker in a `line-height: 1` box, the content band in a 1.45 line height inside a 1.6em box, so the
sovereign frames' digits sat about 5 px lower (0.375em: the box's 0.15em slack plus half the extra
leading, whatever the font). Both were so before this change. Every chrome text box now takes the band's
shape (`section footer` as a minimum, so a long footer still wraps upward; the section-level
`.lat-pagination`; the divider's marker), so the digits and the footer share one baseline on every frame
and the boxes keep one berth (pagination-one-mark.test.js).

**Nothing in the footer's text can move the band.** An inline image was drawn at its own size (a hundred
pixels tall on a divider, clipped with the words after it in the band) and a `<sup>` raised the line:
both moved the shared baseline, so the rail and the page number dropped 3 to 6 px on that slide. A footer
image is now a glyph, one cap tall on the baseline, and `sup` / `sub` take zero line height.
`footer-band.test.js` asserts the rail's lift off the band is one number across a deck with an image
footer and a superscript footer.

The column is reserved in a deck with `paginate: false` too, as `center` always did: the rail then sits a
column in from the edge on every slide, which is consistent, and saves a deck-level switch.

## The top band

The same audit, at the other edge. Every top-band text was already one face and one size (the chrome
face at `--chrome-fs`, as the footer) and the eyebrow and the meta line already share a baseline, but
the two CHROME lines spoke differently: the running header at 0.10em in the muted ink, the meta at 0.08em
in `--text-label`, an accent-tinted label ink that made a date and an owner read as content. The owner
chose one chrome voice: the header and the meta at weight 500, 0.08em, uppercase, in the header's own
ink (`--marp-slide-header-color`, so the meta follows a layout that recolors the header, split-panel's
field and print). The eyebrow keeps its own voice (600, 0.18em): it is the slide's label, part of the
heading cluster, not running chrome. The footer keeps the author's case.

## Title and agenda

- **The title is an anchor**: it drops header and page number and draws no rail (no section has started).
- **The agenda is not**: it is a working content slide people refer back to by page number. It keeps its role as
  the rail's legend when its item count matches the section count.

## The empty first section

- `empty-section` moved from the review tier (`review-core.js`, suggestions only, skipped under `--all`) to
  `lint-core.js` as a **warning** (HARD RULE #7). `lint:deck:all --strict` now fails on it.
- `examples/gallery-jargon.md` was restructured: its `divider light` opens section 1 ("Why This Exists"), the
  agenda has one item per divider (so it draws the legend) and no longer pre-lights item 2, and every section
  eyebrow agrees with its divider. `examples/state-chart.md`'s prose slide stopped wearing a `divider light` class.
- Five decks stack dividers on purpose and are sanctioned in `tools/lint-subject-decks.js`, each with its reason:
  the divider's specimen gallery, `examples/divider-numbered.md`, `examples/deck-logo-canvas.md`, the baseline
  gallery (HARD RULE #8) and the legal specimen gallery.
- Engine counting is unchanged. Skipping empty sections in the rail would hide the authoring mistake and make the
  numbered divider's numeral disagree with the rail; making `divider light` a non-section would reverse the owner's
  11-06 call and renumber existing decks.

## What we did not do

- No `notice:` key for legal lines. The owner rejected it: the footer already carries that job, and the rule keeps it.
- No deck-wide per-anchor-kind knob (`anchor-chrome:`). Anchors are few, and the per-slide switches cover the
  exceptions; the defaults come from the rule, not from a setting.
- Full-bleed and other sovereign layouts outside the anchor bucket were not reviewed. Whether a confidential line
  belongs on a photo slide is a separate question.
