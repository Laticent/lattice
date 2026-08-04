---
status: shipped
summary: The corpus ratchet went red on main after #1309 and the handoff blamed `--measure-bookend-lede`. It was not the measure — `title`'s lede carries no cap at all, and the heading cap that DID change was widened, not tightened. The 23px of overflow on `examples/marp-export-fidelity.md` p1 was the deck LOGO, hanging off the bottom of the frame. Root cause is `base.finish.css`'s stacking rule, `section.finish > *:not(.backdrop) { position: relative; z-index: 2 }`, in which only the z-index was ever the intent: `position: relative` is inert on a static child and destructive on one that positions ITSELF, and at (0,2,1) it outweighed `img.deck-logo`'s own `position: absolute` and beat `.illegible-tab`, `.lat-split-rail` and `.lattice-bg` on source order. Six pieces of frame chrome were dragged into flow, each breaking twice — `top`/`left` re-based onto the flow position, and flow height consumed that was never budgeted. The running header rendered 88px low and 64px right on 11 of 15 slides of `finish-backdrops.md`; `logo-x`/`logo-y` stopped meaning anything, rendering at 92.2% x on every logo slide in the corpus with a y that drifted 84/87.1/88/100% across all four logo slides, every one declaring 82. #1309 did not cause this — it TIPPED it, by taking one title from two lines to one, re-centering the stack 38px lower and pushing an already-in-flow logo off the frame. The fix withholds `position` from frame chrome via zero-specificity `:where()` exclusions, holding the selector at (0,2,1). The first cut of that list was built from a probe deck and MISSED `.lat-split-rail` and `.lattice-bg` — the latter collapsing the `image` photo panel to height 0 on the spotlight/statement compositions — so alongside the named-chrome gates there is now a DERIVED one: render a deck, toggle `.finish`, and assert no direct child changes its computed position. No list, real cascade. The cause-removing alternative (`.backdrop { z-index: -1 }`, deleting the list) was built and rendered and FAILS: a Lattice section does not reliably form a stacking context, and on `math`/`title` the backdrop escapes behind the section's own opaque background.
builds-on: 2026-08-02-sovereign-bookend-measures.md, 2026-07-01-finish-restraint-controls.md
---

# A finish's stacking rule was quietly re-positioning the slide's frame chrome

## What was reported, and why the report pointed the wrong way

`node tools/check-overflow-corpus.js` was red on `main`: `examples/marp-export-fidelity.md`
p1 clipped, against a clean baseline. The handoff into this change had already bisected it
to `7648100` (#1309, *anchor(bookends): measure in em, not cqi*) by swapping
`dist/lattice.css` either side of that commit, and named the suspect:

> `--measure-bookend-lede` is the likely one — the lede wraps to more lines than it did at
> the old `cqi` cap, and p1 overflows by those lines.

The bisect was right and the suspect was wrong, in a way worth recording because the
reasoning was sound at every step:

1. **`title` has no lede cap.** `--measure-bookend-lede` is read by `closing p`,
   `closing li` and `divider.light p`. The failing slide is `<!-- _class: title
   finish-none -->`, and `section.title p` declares no `max-width` at all — measured
   `max-width: none` on the render.
2. **The one cap that did change on `title` was WIDENED.** `title h1` went from `59.4cqi`
   (684px on landscape) to `--measure-bookend-heading: 16em` (1024px). A wider cap cannot
   add lines.
3. **It did not even bind.** The heading measured 729.1px against its 1024px cap.

So the slide's three text boxes accounted for 222.8px inside a 720px frame with
`justify-content: center` — nowhere near an overflow. Measuring the section's children
instead of its text found the 23px immediately:

```
IMG.deck-logo   top 697.0   bottom 743.1   ← frame is 720
H1              top 320.0   bottom 404.8
P (eyebrow)     top 225.6   bottom 274.0
P (lede)        top 404.8   bottom 494.4
```

`overflowPx` was 23; the logo hung 23.1px below the frame. The entire deficit was the logo.

## The defect

`base.finish.css` puts slide content above the finish's backdrop layer:

```css
section.finish > *:not(.backdrop) {
  position: relative;
  z-index: 2;
}
```

**Only the `z-index` was ever the intent.** `position: relative` is there as the mechanism
by which a *static* child becomes positioned so a z-index applies to it at all. On a static
child it is inert in every other respect. On a child that positions **itself**, it is not
inert — it is destructive, and in two independent ways at once:

- **`top`/`left` change meaning.** On an absolutely positioned element they are insets from
  the containing block — the slide frame. On a relatively positioned one they are offsets
  from wherever the element landed in normal flow. The same declaration silently addresses
  a different origin.
- **The element starts taking flow space.** Out-of-flow chrome is designed to cost the body
  nothing. In flow it consumes its own height from the stage, on every slide.

At specificity (0,2,1) that rule outweighed `img.deck-logo { position: absolute }` (0,1,1)
outright, and **tied** `section.illegible > .illegible-tab` (0,2,1) — losing to nothing but
winning on source order, because `base.finish.css` is bundled after `base.modifiers.css`
(dist lines 18239 vs 20649).

### What it cost, measured

Enumerated empirically: for every direct child of every section on a probe deck exercising
`title` / `content` / `image` / `split-compare` / `divider` / `closing` with a header,
footer, logo and background panel, toggle `.finish` off, read the position the element asks
for **itself**, toggle back. Three elements come back re-positioned against their own
declaration:

| element | wants | forced to |
|---|---|---|
| `img.deck-logo` | absolute | relative |
| `header` | absolute | relative |
| `footer` | absolute | relative |

(`div.backdrop` also changes, static → absolute, which is its own rule doing its job.
Everything else is static → relative, which is the rule working as designed — `relative`
costs a static box nothing, since it neither moves it nor changes the space it takes.)

That parenthetical originally continued *"`.lattice-bg` and `.image-scrim` do not appear:
the image component's own rules outrank this one."* **Half of it was false**, and it is the
most expensive thing this note got wrong — see below.

**And that enumeration was wrong, in the way enumerations are always wrong.** A first cut of
this note said "three elements — and exactly three". It is **six**, and the three it
missed are the three a six-layout probe deck structurally cannot reach:

- **`.illegible-tab`**, found by *reading* `base.modifiers.css` rather than by the probe — the
  legibility watcher only attaches it to a slide it judges illegible, which no probe deck was.
- **`.lattice-bg`**, found by the adversarial trio's red team, and the worst of the set: on
  the `image` layout's `spotlight` and `statement` compositions the photo panel was forced
  to `relative`, **collapsed to `height: 0`, and the photograph disappeared entirely.**
  Those two compositions declare only `inset: 0` and lean on the base
  `section.image .lattice-bg { position: absolute }` — (0,2,1), an exact tie with the finish
  rule, losing on source order. The `clean` **default** composition re-declares
  `position: relative` itself at (0,3,1) and is immune, which is precisely what hid it: the
  probe deck used the default, so the component reported clean and this note asserted the
  whole class was. Measured on all five compositions, before and after: `clean` / `gallery` /
  `split` unchanged, `spotlight` / `statement` `absolute h=720` → `relative h=0` → fixed back
  to `absolute h=720`.
- **`.lat-split-rail`**, found by the adversarial trio's inversion lens, and missed by the
  probe because the probe had no **split run**. `lib/core/footer-dock.js` states the shape
  outright: *"Sections with no footer Cell (the re-authored split cover/body pages, sovereign
  frames) get the mark appended at section level, where CSS keeps it absolutely positioned in
  its own reserved berth."* `buildFooterCell` returns nothing when a deck declares neither
  `footer:` nor `paginate:`, so that path is ordinary rather than exotic. Reproduced: on a
  `finish:` deck with `autosplit: on` and no footer chrome, all four section-level rails
  compute `position: relative`, while the same rails on the non-finish cover slide compute
  `absolute`.

That is the fourth in-repo comment asserting the invariant this rule breaks, after
`math.styles.css`, `split-panel.styles.css` and `base.modifiers.css`. It is also the second
time in this one change that an empirical sweep under-counted — which is the argument for the
gate below, and it is not a hypothetical argument: **the exclusion list would have shipped
stale on the day it was written.**

The consequences on the shipped corpus:

- **The running header sat 88px low and 64px right.** Its berth is `top: var(--frame-inset-y)`
  / `left: var(--frame-inset-x)` = 28px / 30px. In flow it landed at the section's padding
  edge and *then* took those as offsets: 116px / 94px. Measured on **11 of the 15 slides**
  of `examples/finish-backdrops.md`. Two components are written against the invariant it
  broke and say so in their own comments — `math.styles.css` excludes header/footer from its
  body grid-row specifically so "the header/footer resolve against the section box and sit
  at the top/bottom berths like every slide", and `split-panel.styles.css` reasons about the
  chrome being "absolutely positioned to the slide's LEFT inset".
- **`logo-x` / `logo-y` stopped meaning anything.** The documented contract is "the logo
  CENTER as a % of the slide". Every logo slide in the corpus declares `logo-x: 50`, and
  every one rendered at **92.2%**; the y drifted with content height — **84 / 87.1 / 88 /
  100%** across all four, every one declaring `logo-y: 82`. The y varying per slide is
  the tell: an absolute placement cannot depend on how much copy is above it.
- **`.illegible-tab` perturbs the measurement it exists to report.** `base.modifiers.css`
  states "Both tabs are position:absolute, so neither can perturb the height math the
  watcher itself is measuring." True of `.overflow-tab`, which asserts
  `position: absolute !important` — and the comment there records why, having already been
  bitten by *this same rule* ("on a `finish:` deck this 'corner flag' rendered as a
  full-width in-flow red BAND that pushed content down and cost a line of copy"). False of
  `.illegible-tab`, which never got the same treatment. The precedent existed; it was
  applied to one of the two tabs and to neither of the three chrome elements.

**Count it by the class, not by the register** — and a first draft of this note did not, which
undercounted its own blast radius. The rule keys on the `.finish` **class**, which a deck earns
either from front-matter `finish:` or from a per-slide `_class: finish finish-<name>`. Of the
255 decks on `main`, **5** render at least one `.finish` section — 2 deck-wide
(`finish-backdrops`, `marp-export-fidelity`) and 3 per-slide only (`finish-per-slide`,
`slide-context-editor`, `finish-override`) — and **4 of the 5 carry a header, footer or logo**.
All four have changed PDFs in this diff; `finish-override` is the one with a finish and no
chrome, and it is byte-identical. Counting only the front-matter register gives "2 affected"
and is contradicted by this change's own PDF diff.

Five decks out of 255 is still why something this categorical stayed invisible. It also means
**no shipped deck has ever rendered `logo-x`/`logo-y` correctly**: both decks that use those
directives also use a finish.

### #1309 did not cause this — it tipped it

The bisect was accurate and the blame it implied was not, and the distinction matters for
HARD RULE #18. Before #1309, `title h1` capped at 684px, so *"What survives the export"*
(729.1px natural) broke to **two** lines. Widening the cap to 1024px took it to **one**.
That removed ~77px from a `justify-content: center` column, so the whole stack — including
the already-in-flow logo — re-centered ~38px **lower**. The logo was at 659px; it moved to
697px; the frame ends at 720px and the logo is 46px tall.

So #1309 shipped a correct change onto a latent fault and converted it into a visible one.
Under HARD RULE #18 that still makes it a window somebody has to fix — "even when the root
cause is a *pre-existing* latent fragility your change merely *tipped into failure*" — and
the fix belongs at the fault, not at the trigger. **The bookend measure tokens are not
changed by this note**, and the handoff's instruction not to widen a token until the deck
fits is upheld in the strongest form available: the token needed no widening at all.

## What shipped

The stacking rule is split, so the intent (`z-index`) applies to everything while the
mechanism (`position`) is withheld from chrome that positions itself:

```css
section.finish > *:not(.backdrop) {
  z-index: 2;
}
section.finish > *:not(.backdrop,
  :where(header, footer, img.deck-logo, .illegible-tab, .lat-split-rail)) {
  position: relative;
}
```

**The exclusions sit inside `:where()` so the selector's weight does not move.** `:not()`
takes the specificity of its most specific argument; with the new names at zero, that
argument is still `.backdrop` (0,1,0) and the selector still computes **(0,2,1)** — the
same weight as the `z-index` rule above it, and the same weight `.overflow-tab`'s
`!important` note is written against. Written as a plain list (`:not(.backdrop,
img.deck-logo)`) it would have climbed to (0,2,2) and started winning contests it does not
today.

Both halves of that were verified on real surfaces rather than inferred (HARD RULE #23):

- **Specificity** — two same-weight rules declared in a known order, reading the computed
  value off a live render: the later rule wins on an element both match (so they tie, rather
  than the `:where()` form winning), and the excluded `header` keeps the earlier value (so
  the exclusion applies).
- **Theme scoping** — run through the real `packTheme` (`lib/engine/css.js`), which emits
  `article.lattice > section.finish > *:not(.backdrop, :where(...))` intact. `gotchas.md`
  §"Marpit theme prefixer mangles `:is(...)`/`:where(...)`" applies only to a selector that
  *leads* with the function; this one leads with `section`.

`!important` was available — it is what `.overflow-tab` used — and was declined. A second
counterweight would leave the wrong rule wrong, and the next author to add absolutely
positioned chrome under a finish would rediscover this from scratch, as the `.illegible-tab`
author did.

### The alternative that would have deleted the list, and why it does not work

The strongest objection to an exclusion list is that it is an enumeration of victims rather
than a removal of the cause — and this one proved the objection by shipping incomplete. The
proposed replacement removes the cause outright:

```css
section.finish > .backdrop { z-index: -1; }   /* and delete BOTH child rules */
```

A negative-z-index child paints at **step 3** of the painting algorithm — after the element's
own background and border, before every in-flow descendant. Content would sit above the
backdrop by construction, no rule would touch a child, and `.lat-split-rail` plus all future
chrome would be correct for free. It is the better shape, and it was built and rendered
rather than reasoned about.

**It fails.** The escape only holds *inside a stacking context*, and a Lattice `section` does
not reliably form one. Measured on `examples/marp-export-fidelity.md`, reading computed style
on a real render:

| section | `isolation` | `contain` | stacking context? |
|---|---|---|---|
| the six `form` sections | `isolate` | `none` | yes |
| `math`, `title` | **`auto`** | `none` | **no** |

`container-type: size` does **not** contribute one here — `contain` computes `none` on all
eight. On the two sections that are not stacking contexts, the backdrop escapes into the
parent context and paints **behind the section's own opaque `--bg`**: page 6's finish
disappeared completely — grid texture and wash both gone — for **87,430 differing pixels**
against the shipped rule's render. The other three finish decks pixel-diffed to 0 or near it,
which is exactly what makes this dangerous: it looks correct almost everywhere.

Recorded so it is not re-proposed on the strength of the painting-order argument alone, which
is sound and insufficient. Making it work needs every section to carry an unconditional
stacking context — a wider change than this one, and one that would want its own note.

### The list is gated, both ways

An ungated enumeration in this repo rots, and this one demonstrably would have. So
`checkFinishChromeExclusions` (`tools/check-ownership.js`, via `build:check`) **derives** the
candidate set from the CSS — every rule that absolutely positions a hook that can be a direct
child of `section` — and compares it to the `:where()` list, failing on:

- **a missing entry** — chrome that engine CSS positions absolutely and this rule would drag
  into flow, including chrome nobody has written yet;
- **a stale entry** — a name nothing positions any more.

Same contract as `SANCTIONED_MARGINS` / `SANCTIONED_HEX` / `SANCTIONED_LAYER_BLOCKS`.
`.overflow-tab` is the one deliberate exemption, because it asserts
`position: absolute !important` at its own rule; a unit test pins that `!important` so the
exemption cannot outlive its reason.

**Verified to bite in both directions**: removing `.lat-split-rail` from the list — the exact
miss that motivated the gate — fails with *"1 out-of-flow section chrome element(s) are NOT
excluded"*; adding a name nothing positions fails with *"stale frame-chrome exclusion"*.

### Measured result

| | before | after |
|---|---|---|
| `marp-export-fidelity.md` p1 | logo centre 92.2% / **100%**, 23px overflow | **50% / 82%**, 0px |
| `finish-backdrops.md` header | 116px / 94px on 11 of 15 slides | **28px / 30px** on those same 11 |
| `finish-backdrops.md` logo | 92.2% x; y = 84 / 87.1 / 88% | **50% / 82%** on all three |
| corpus ratchet | 1 deck above baseline | at baseline |

## The gate

`test/integration/invariants/frame-chrome-out-of-flow.test.js` — a real emulator render of
CONTROL/SUBJECT slide pairs that differ only in carrying a finish.

**The assertion is a comparison, not a coordinate:** frame chrome must land in the same
berth with and without the treatment. That states the invariant itself, so it holds against
any future treatment reaching for the same `position` shortcut, and it does not need
re-blessing when a theme changes its frame insets. It also asserts the `logo-x`/`logo-y`
contract directly, since that is the piece that silently became meaningless.

**Two frame shapes, and that detail was earned.** On a Form `content` slide the running
footer is migrated into `.cell-footer`, so it is *not* a direct child and
`section.finish > *` can never reach it — a single-shape test would have asserted the footer
on the one shape where it was already safe. On a sovereign frame (`divider`) it is a direct
child and was displaced. The gate runs both and reads whether the element is a direct child
rather than assuming.

**A third deck covers the split rail**, because it needs a configuration the other two cannot
produce: `autosplit: on` plus a deck that declares neither `footer:` nor `paginate:`, so
`buildFooterCell` emits nothing and the rail docks at section level. It carries its own
vacuity guard — *"the deck actually produces section-level rails (else this suite asserts
nothing)"* — which is not ceremony: the first draft of that deck did **not** split, so the
positional assertion passed over an empty set and reported green. It needed `size: portrait`,
matching `examples/auto-split.md`. A test that can pass vacuously is a test that will.

**The gate was verified to bite.** Reverting the CSS to the pre-fix rule and rebuilding
fails **12 of its 14** frame-chrome assertions — and the 2 that still pass are precisely the
Form-nested footer cases that were genuinely never affected. Dropping only
`.lat-split-rail` from the exclusion list fails the rail assertion alone. A gate that only
passes on a fixed tree is not evidence it would have caught anything.

## Why nothing caught this before

- **The corpus ratchet is a clip oracle.** It fires when content leaves the frame. Four of
  the five wrong logo placements, and all 11 wrong headers, were merely in the *wrong place*
  — a displacement no oracle in the repo measures. Only the fifth, where the logo left the
  frame entirely, was ever visible to it, and it surfaced as a red gate blamed on an
  unrelated typography token.
- **`chrome-suppression.test.js` asserts the chrome is HIDDEN when a token says so.**
  Nothing asserted where it sits when it is shown.
- **Pixel goldens cover the galleries, and no gallery sets `finish:` with chrome.** The two
  decks that do are `examples/`, which the golden tier does not diff.

This is the same lesson as #1322's trio: the gates are a clip oracle, an ink oracle and a
pixel oracle, and *placement* has no oracle at all. It was found by rendering the slide and
reading the boxes.

## Cross-references

- `engineering/decisions/2026-08-02-sovereign-bookend-measures.md` — #1309, the change that
  tipped this, and which this note clears of the regression.
- `engineering/decisions/2026-08-02-default-slide-layout.md` §"The corpus ratchet is RED on
  this branch" — where the red was first recorded and correctly left off-path.
- `engineering/decisions/2026-07-01-finish-restraint-controls.md` — the `.backdrop`
  compositor whose stacking need created this rule.
- `lib/base/_logo/logo.docs.md` — the logo contract ("CSS positions it absolutely
  top-right") this restores.
