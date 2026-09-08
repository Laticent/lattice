---
status: shipped
summary: >
  The overflow and type-floor markers moved out of the slide's top-right corner and now
  berth centered under the spectrum bar, flush against its underside. The corner had four
  absolutely-positioned claimants — the status stamp, the author's `logo:` mark, and the
  two marker tabs — and the engine owned the geometry of only three, so four rounds of
  de-collision arithmetic all shipped broken and all passed every machine gate. Two of the
  four claimants are transient by definition, so they moved instead. That deletes the
  `--slide-radius` berth inset, the `--corner-logo-reserve` / `data-logo-corner` machinery
  with `deckLogoInCorner` and its runtime mirror, and two of the three `--corner-stack`
  grouping rules; one reserve is left, renamed `--stamp-stack`, declared by the one shape
  that paints across the middle of the top edge (`stamp-notch`). The failure direction
  inverts: forgetting a reserve is now safe for every shape that does not cross the middle.
  The reader's pill then took a DIFFERENT berth from the author's tags — bottom-center,
  flush, in the margin below the running footer — because the two registers have different
  neighbors and different populations: a reader receives exactly one marker, so it has no
  second row to place and can take a berth the stacking author tags could not.
  Verified on real emulator exports by computed geometry, and the `elementFromPoint` chart
  measurement was re-derived against the new berth — still 0 of 461 marks under a tab.
---

# The marker berth moves out of the corner (2026-09-08)

**The overflow and type-floor tabs now sit CENTERED under the spectrum bar, flush against
its underside.** They lived in the slide's top-right for the life of the register, which
is the busiest square inch of a Lattice slide: the status stamp paints there, the author's
`logo:` mark sits there, and the two tabs stacked under both. Four rounds of de-collision
arithmetic came out of sharing that corner and every one shipped broken. The berth moved
instead.

The report was one sentence and it is the right frame: *"we have done a lot of work with
content overflow and text-too-small pills by placing them on the top right side where it
clashes with things like WIP annotations/tags. The best place is top center, under and
flush against the spectrum."*

---

## 1. What was actually wrong

Four absolutely-positioned boxes wanted `top: 0; right: 0`:

| occupant | who owns its geometry | permanent? |
|---|---|---|
| status stamp (`section::before`, 14 shapes) | the engine | yes — it ships in the export |
| `img.deck-logo` | **the author** | yes — it is their brand mark |
| `.overflow-tab` | the engine | no — it appears because a slide is broken |
| `.illegible-tab` | the engine | no — same |

The corner has four claimants and the engine owns the geometry of three. Every fix so far
answered *"how far must the marker drop to clear whatever is above it?"*, and that question
has been answered wrong four times, each time silently:

1. the reader pill was moved into the corner on a survey of `lib/components/**` that could
   not see a base modifier — `stamp-notch` then swallowed it whole, a SILENT CLIP, the one
   outcome the register exists to prevent;
2. the first de-collision pushed all 21 stamp CLASS NAMES by a fixed row, measured wrong on
   8 of the 14 SHAPES (six sit ~43px lower and were pushed *into*);
3. the rewrite that fixed that used unitless `calc()` fallbacks, so the whole `transform`
   was invalid and discarded and both tabs landed in the same band again;
4. the logo reserve (#1404) landed the tab at y 23→46 inside a mark occupying y 24→75 —
   opaque, so it sliced the top off the author's brand.

All four passed `npm test`, `build:check`, the pixel gate and CI. The machine gates verify
INTERNAL CONSISTENCY and none of these violated it.

**Two of the four claimants are transient by definition.** They are drawn because a slide
is broken and they leave when it is fixed. The permanent occupants — the stamp and the
mark — were being asked to share a corner with diagnostics, and the diagnostics were
winning by displacing themselves into whatever gap was left. Moving the transient thing is
the cheaper answer, and it is the one that stops the arithmetic rather than re-deriving it.

## 2. Why top-center, and why flush

**Empty of IN-FLOW content by construction.** `section` pads `6.875cqi` at the block start
(`base.elements.css`), so no masthead band, eyebrow, heading or chart mark can paint above
y ≈ 88px at hd. The tab's own box is ~23px. Every stamp shape is anchored to the right (or
lower), the logo sits at the right frame inset, and the paginator and footer sit at the
bottom.

**One absolutely-positioned occupant is NOT cleared, and it is the running header.** See §5
— it is a known, measured limitation of this berth, not an oversight, and the first draft of
this note claimed the opposite.

**Flush costs nothing to keep flush.** `top: 0` resolves against the PADDING box, and the
spectrum is the section's `border-top`. So `0` *is* the underside of the bar, with no token
to keep in step — and it stays correct on a deck that moves the bar to another edge or
turns it off (`spectrum-edge:`), where the padding box simply starts at the frame top.

**Bottom-center is the one band it may not take.** That is the running footer's, and the
pill shipped there once: an opaque capsule across the confidentiality line on every page of
any deck carrying an ordinary `footer:`. That history is in
`2026-07-30-overflow-marker-register.md` and is not revisited here.

### The reader's pill takes its own berth — bottom-center

The first cut moved BOTH registers to the top band, on the register doc's line that `reader`
is "the SAME text-labeled tab restyled". Rendered, that was the wrong reading of a sentence
about TONE. The two registers have different neighbors and, decisively, different
populations:

| | author | reader |
|---|---|---|
| markers drawn | up to three (`clip`, `illegible`, `fixme`) | exactly one — the pill |
| rows needed | two in the top band, stacked | **one** |
| what shares its band | `section header`, `y 28 → 75.9` when it wraps | `section footer`, `y 672 → 696` |
| where the berth lands | `y 4 → 27` and `y 27 → 50` | **`y 697 → 720`** — below the footer |

`.illegible-tab` and `.fixme-tab` are author-only (`policy.authorTags`), so at `reader`
there is nothing to stack. **The stacking problem that makes the top band awkward does not
exist for the pill** — which is why the pill can take a berth the author tags could not:
the strip below the running footer, which is frame margin no component writes into.

That also confines §5's header collision to an authoring surface. Nothing a recipient
receives goes near the running header or the footer.

**This is not the placement that was pulled in #1300, and the difference is the whole
argument.** That pill sat INSIDE the footer band and painted an opaque capsule across the
confidentiality line on every page. The footer sits at `bottom: var(--frame-inset-y)`;
`bottom: 0` is below it. Asserted geometrically rather than trusted to this paragraph —
`content-clipped-pill.test.js` renders a deck with a 211-character `footer:` plus a
body-content cut and fails on any intersection, on the pill being above the footer, on it
not being flush, and on it not being centered. Confirmed non-vacuous against the previous
CSS.

Two mechanics that are load-bearing and easy to undo by accident:

- **`top: auto` releases the author berth.** The author rule sets `top`; a box with both
  `top` and `bottom` resolved is over-constrained, `bottom` is ignored, and the pill stays
  at the top.
- **The pill restates its own `transform`.** The author stack declares
  `translate(-50%, var(--stamp-stack, 0%))` on `section > .overflow-tab`, and
  `--stamp-stack` reserves a row for `stamp-notch` — a band across the TOP edge, nothing to
  do with the bottom of the slide. The pill's rule is (0,3,1) against that rule's (0,1,1),
  so specificity decides it rather than source order.

## 3. What this deletes

Three mechanisms existed only to survive the corner, and all three are gone:

- **The `--slide-radius` berth inset.** A rounded deck cuts its arc at the CORNERS; the
  middle of the top edge is never inside one. (`.fixme-tab` keeps its inset — it is the one
  berth left on a corner, bottom-right, and it did not move because the stamp and the mark
  do not reach there.)
- **`--corner-logo-reserve` and `data-logo-corner`**, with `deckLogoInCorner` and its
  mirror in the runtime. A mark ~80px wide at the right frame inset cannot meet a centered
  tab, so there is no width to reserve and nothing to keep in step with the logo's own
  tokens. The `--logo-*` properties stay declared on the `<section>` — the reason they were
  moved there generalizes past the reserve that prompted it.
- **Two of the three `--corner-stack` grouping rules.** The reserve is now `--stamp-stack`
  and exactly one shape declares it: `stamp-notch`, the full-width hairline band at
  `top: 0`. Measured in-page against a `1cqi` probe at hd (1cqi = 11.5156px): the notch is
  17.83px = **1.548cqi** and the tab 22.97px = **1.995cqi**, so one row clears it with room.
  Every other shape reserves nothing — ten are anchored to the right edge, and the two
  full-bleed washes cover the marker from the plane above, deliberately.

The failure direction inverts, and that is the part worth keeping. Under the old scheme a
new corner-sitting shape that forgot to join a list **silently reserved nothing and the tab
landed inside it**. Under this one a new shape needs an edit only if it paints across the
middle of the top edge; forgetting is safe for every shape that does not.

The two full-bleed washes (`stamp-mark`, `stamp-veil`) still cover the tab, deliberately:
they sit on `--z-mark` above `--z-alarm`, and inverting that once punched a reader pill
through a redaction in a delivered PDF. Unchanged, and not to be re-inverted.

## 4. Verified

Real emulator exports at hd, computed geometry and rasterized pages — not eye alone.

| case | clip tab | what it proves |
|---|---|---|
| plain slide | y 4→27, centered on x 640 | flush under the bar, on the frame's own center |
| `confidential` (corner tab) | **unchanged** | a right-anchored stamp no longer displaces the marker at all |
| `confidential stamp-flag` / `stamp-pin` | **unchanged** | the shapes that needed a 200% reserve now need none |
| `confidential stamp-notch` | y 27→50 | the one full-width shape still pushes both tabs clear |
| `logo:` / `logo-style: brand` / repositioned | **unchanged**, disjoint from the mark on both axes | no reserve, and none needed |
| both registers on one slide | clip y 4→27, legibility y 27→50 | `--clip-stack` still stacks them |

`test/integration/parity/content-clipped-pill.test.js` carries all of it (13 tests, real
export + computed style). Most rows now assert **independence** — the stamp and the logo
must not move the tab by a pixel — where they used to assert clearance, because that is
what the move bought and it is the thing a half-revert would break first.

**The absolute-berth canary is still the load-bearing one.** Every relative assertion in
that file once passed while both tabs had fallen out of the corner entirely and were
printing across the headline, 92px down and 1040px in — a unitless `--slide-radius: 0`
reaching `calc()` (#1649). That inset is gone from these two berths, but the transform they
share now carries BOTH the centering (`translate(-50%, …)`) and the stack term, so an
invalid stack term drops the centering with it. Same class of failure, one property along.
The canary therefore asserts the berth's absolute position — centered on x 640, top ≤ 12px —
not only that the two tabs are disjoint.

### The `elementFromPoint` measurement, re-derived

`.illegible-tab` is hit-testable (`pointer-events: auto`, it carries the fix hint), and
`docs/src/playground/chart-interact.js` resolves a pointer to a chart slice with
`elementFromPoint(...).closest(MARK_SEL)`. A mark under the tab would stop revealing on
hover. `2026-09-06-type-floor-tab-plain-words.md` measured that at zero for the top-right
corner; moving the berth invalidates the measurement, so it was re-run against the new one —
every shipped chart gallery emitting `[data-mark]`, real emulator at hd, `.illegible` +
`.clip-marked` forced onto every slide so both tabs paint at full size:

| gallery | slides | interactive marks | under a tab | closest gap |
|---|---|---|---|---|
| funnel | 8 | 31 | 0 | 162px |
| gantt | 8 | 44 | 0 | 259px |
| map | 13 | 178 | 0 | 139px |
| piechart | 9 | 40 | 0 | 213px |
| quadrant | 14 | 84 | 0 | 196px |
| radar | 14 | 84 | 0 | 158px |
| **total** | **66** | **461** | **0** | **139px** |

Zero by rect intersection *and* by `elementFromPoint`. The closest any mark comes is 139px
below the tab's bottom edge (was 162px in the corner — a different mark, in `map`, not a
regression in kind). The clearance argument is now **structural rather than empirical**: the
block-start padding keeps in-flow content out of the band, and every one of these marks is
in flow. What would change it is a component that draws interactive marks into the top
chrome band.

## 5. What this leaves open

- **THE RUNNING HEADER SHARES THE AUTHOR BAND, and row 2 sits on it. AUTHOR-ONLY** — the
  delivered pill berths at the other end of the slide and never meets a header. `section header`
  (`base.modifiers.css`) is `position: absolute` at `top: var(--frame-inset-y)`, spanning
  the full width between the frame insets — measured `y 28 → 75.9` at hd for a header long
  enough to wrap. Row 1 clears it (`y 4 → 27` against a header starting at 28). Row 2 does
  not: the legibility tab at `y 27 → 49.9`, and the clip tag when `stamp-notch` pushes it
  down. Both of those are `author`-level registers, and the delivered pill is at the
  opposite end of the slide, so **nothing a recipient receives is affected** — which is
  what downgrades this from a shipping defect to an authoring annoyance.

  **This is older than the berth and was made worse by it, which is why it is written down
  rather than filed quietly.** The top-right corner sat in the same band and covered the
  header's TAIL; centering moved the overlap to the middle of the line — **27 characters
  covered against 21**, measured on the same render with each berth injected in turn.

  **The exposure, measured rather than assumed.** Across the 40 shipped `examples/` decks
  carrying `header:` — 283 header-bearing slides — **111 (39%)** have header ink reaching
  this band's x-window and **104 wrap to two lines**. It only bites when such a slide also
  draws a marker, which is by definition a broken slide, and only at `author` level. Re-derive with the probe in
  `.scratch/probe/hdr-ink.mjs` (a `Range` over each `> header`, max `getClientRects().right`
  against the band's 505–775 window at hd).

  **Three fixes were costed and all cost more than an author-only annoyance is worth** —
  and the audience split above is why the bar moved: these were priced against a defect
  that reached delivered slides, and it no longer does.

  | option | what it buys | what it costs |
  |---|---|---|
  | ellipse the running header to one line, as the footer already is, then reserve its known height | both rows clear, permanently | changes DELIVERED content on 104 shipped slides — a deck-wide behavior change |
  | wrap the three berths in a flex rail so both markers share the single 24px strip above the header | both rows clear with no header change | rewrites the berth contract markup (`lib/core/fit-berth.js`, both adapters), every `section.x > .y` reveal selector, both watchers, and the `off` sweep derivation |
  | push `section header` down one tab-height on every slide, reserving the strip permanently | simple, robust | spends 23px of top chrome on every deck whether or not a marker is ever drawn, and moves a fixed element on every existing deck |

  Anchor positioning (`top: anchor(--header bottom)`) would express it exactly and is the
  thing to revisit; it is unproven across this repo's three render paths and the header's
  height is content-dependent, so it is not a drop-in.

- **A logo parked at top-center.** `logo-x: 50` with `logo-y: 3` puts the author's mark
  under the bar in the middle, where it would collide. The old machinery did not handle
  this either — it *released* the reserve for any repositioned mark — so this is not a
  regression, and an author who parks their mark in the marker's band has chosen that. Not
  reserved for, deliberately: a reserve that follows a freely-placed element is the
  arithmetic this change exists to stop.
- **`stamp-flag` / `stamp-pin` versus the logo**, carried forward unresolved from #1404.
  Both hang from the top edge at `right: 8%` / `11%`, near the mark's own column,
  independently of the marker tabs. Still not addressed here — it is a stamp/logo question
  with no marker in it.
- **`.fixme-tab`'s dead `title`.** Unreachable under `pointer-events: none` since it was
  written, logged in `2026-09-06-type-floor-tab-plain-words.md` and still off the path of
  this change.
- **`check-overflow-corpus` is RED on the merge base, and it is not this change's.** Nine
  decks clip more slides than `test/integration/overflow-baseline.json` allows:
  `examples/overflow-guards.md` (p2, p4), `examples/q-and-a.md` (p7),
  `team-profile.gallery` (p7), and the `bar` / `bullet` / `line` / `slope` / `stacked-bar` /
  `waterfall` chart galleries (p3–p6). Logged rather than fixed, per HARD RULE #18: this
  diff moves a marker and touches no layout or fit path.
  **Established, not assumed** — a clean worktree at the merge base (`30ffa6e`, the
  `guards: strict` commit) reports byte-identical output on the same four-deck subset. So
  it arrived with something before this branch; the likeliest suspect is `guards: strict`
  itself (#2131), which changed how prose is trimmed, but that is a suspicion and not a
  bisect. Re-derive with
  `node tools/check-overflow-corpus.js <deck.md> …` — the gate takes deck paths, so one
  deck answers in a minute where the full 316-deck sweep takes twenty.
