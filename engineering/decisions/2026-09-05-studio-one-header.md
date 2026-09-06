---
status: shipped
summary: The Studio drew TWO top bars — a slim one for desktop Read/Write and a full one for Craft and every compact width — so stepping the posture dial swapped one `<header>` element for another. That is what the owner saw as inconsistent dividers and a shifting shell: the rules were gated on three different widths across the two rows, the deck control changed from a switcher to a dead label at Read, and the tail slid ~15px on Write→Craft before landing back (logged as #1414 and never fixed, because a per-stop row cannot be held still by maintaining two copies of it). The two rows are now one. The dividers are three, each closing a band, all gated on the same 1100px boundary — one fewer than before, because the rule that sat INSIDE the utilities band is gone. Read gets the real deck switcher. And the brand mark is split from the wordmark: the mark is an `<a href>` to the site home, the wordmark and its chevron keep the workspace menu.
---

# The Studio's top bar is one row

**Ask (2026-09-05, the owner, verbatim):**

> in the studio the top nav bar has vertical decider is not consistent between
> read, write and craft. to me we should be consistent. i think we should have
> the dividers but part of me feels like it is off. the shell should also be
> consistent too. there should be zero shift when moving between these views.
> the idea being the shell has the same look. also, read doesn't allow you to
> select a deck which is wrong imo. also, we need to separate the logo and the
> word lattice with the drop down with deck, fabricate. touching or clicking the
> logo should take you to the home page.

Four asks, and the first three have one cause.

## The cause: two headers

`StudioShell` rendered a ternary — `effectiveStop !== 'craft' && !compact` chose
a **slim** header, everything else a **full** one. The slim row was deliberately
calmer: no rule before the deck, a plain title instead of the deck switcher, no
appearance box, no tours launcher.

Two rows is not a styling difference, it is a different **element**. Every dial
step at desktop unmounted one `<header>` and mounted another, so nothing in the
band could be stable by construction — only by two hand-maintained copies
agreeing, which they did not:

| | slim (desktop Read/Write) | full (Craft, and every width < 1100) |
|---|---|---|
| brand \| deck rule | absent | `!compact` |
| deck \| dial rule | `!compact` | `!compact` **and** `xl` |
| deck control | plain title at Read, switcher at Write | switcher |
| appearance box | absent | `xl` |
| tours | absent | `xl` |
| rules in the tail | 1 | 3 |

Read the second row of that table across: the rule between the deck and the dial
turned on at 1100 in one header and at 1280 in the other, so a desktop window at
1200px drew it at Read and Write and not at Craft. That is the "not consistent
between read, write and craft" report, exactly.

`studio-header-fit.spec.ts` already knew about the shift and could only pin the
**tail** — the four trailing controls were the sole thing the two rows had in
common. Its own comment says so: *"the tail DOES slide briefly on Write→Craft
(Present travels ~15px over ~75ms at 1440 as the deck pill reflows into the full
header) … logged rather than folded in: #1414."*

## The change

**One `<header>`, every stop, every width.** The slim branch is deleted. What
still varies by stop is the body below the bar — Craft adds the 52px activity
rail and the docked panels — and nothing in the band itself.

**Three dividers, each closing a band, all gated `!compact`:**

1. brand | deck
2. deck | dial (closing the identity band: which app, which deck, which view)
3. utilities | verbs

The fourth is gone. It sat between the appearance box and the tours button —
*inside* the utilities band — so what it bracketed, with the rule after tours,
was the **tours button**: the appearance box had no rule on its left at all.
That is the "part of me feels like it is off": the banding scheme was not one
rule per boundary, it was four rules at three different width gates with one of
them mid-band, bracketing a once-a-session control.

Rule 2 also lost its `xl` gate. **That is spent width, not recovered width** —
two claims in an earlier draft of this note were wrong. The deleted rule was
`hidden xl:block`, so across 1100–1279 (the band the `xl` gate is about) it
never painted and freed nothing; and a rule at desktop density costs **13px**
(1px + a 12px `sm:gap-3`), not the 7px that applies at compact. The band affords
it — 241px of spare at 1100, no overflow at any sampled width — but it is a
cost.

**The deck switcher renders at Read.** It was a plain label there, on the theory
that managing decks is a Write-and-up concern. A reader whose saved posture is
Read then had no route to their other decks anywhere in the app — not the header,
not the ⋯ menu — and the row's left run changed shape on every dial step.

**The brand mark and the wordmark are two controls.** The mark is a real
`<a href>` to the site home, matching `SiteHeader.astro`'s `sh-brand` (same
destination, same accessible name, so ⌘-click and "copy link address" work); the
wordmark plus its chevron keep the workspace menu (Decks · Fabricate · Import).
They sit in one 2px group rather than as two header children, and that is a
width decision, not a taste one: the header's own gap is 6px at compact (12px at
desktop), so two loose children would cost 4px more than the group does.

**The split COSTS width — measure it, don't assume.** A first draft of this note
claimed the opposite ("the split buys width") from arithmetic that dropped a
padding, and it is wrong in both directions it could be. Measured on the built
page in Chromium, the brand group is **62px below 640, 70px at 640–1099, 134px at
≥1100**. The single button it replaced computes, from the class list in this PR's
diff (`gap-1.5 px-1 sm:gap-2 sm:px-1.5`, a 28px mark, a 16px chevron, and a 56px
wordmark measured at ≥1100), to 58 / 64 / 128. So the split spends **+4px below
640 and +6px everywhere above it** — the second box's own padding, which is what
makes it a second target. **Do not cite `MIN_SPARE_AT_FLOOR` as
the proof that it fits** — an earlier draft did, and the guard cannot resolve
6px: `spareAt` measures 246px at 700, of which 188 is the deck pill's own shrink
range (230px down to its 42px floor) rather than row headroom, so a ≥16px
assertion carries ~230px of slack. The numbers that mean something are spare with
the pill **pinned** — 58px at 700, Craft, fonts loaded — and
`scrollWidth === clientWidth` at all nine sampled widths.

## What the guard can assert now that it could not before

`studio-header-fit.spec.ts` compared four tail controls across the three stops,
because that was all two different rows had in common. It now reads the **whole
row** — every button, every link, every separator, in order, with its box — and
demands the three stops be identical. `toEqual` on the array rather than a
per-name loop, because order is part of the contract and a name-keyed comparison
cannot see a reordering. Nine widths × three stops.

Two traps in writing that reader are worth recording, because both produced a
green census that was reading the wrong thing:

- **`hasAttribute('data-slot')` is not "is a separator".** Every shadcn primitive
  carries `data-slot`; the loose test keyed each `Button` as `rule N`, so the
  census compared six rules and a search pill instead of the row. It is
  `getAttribute('data-slot') === 'separator'`.
- **A census that finds nothing agrees with itself.** The floor is pinned by
  NAME — the brand link, the launcher, the deck switcher and the ⋯ menu are in
  the row at every width this spec samples — rather than by a count, which would
  have to be re-derived every time the width ladder moves a control into the menu.

## The pre-paint shell follows

`StudioChromeSkeleton` mirrored the app's split with a `ReadTitle` twin of the
deck pill and two whole tails, picked by `data-ssr-stop` in `studio.astro`'s
inline CSS. All of it is gone: six classes (`ssr-launcher-wrap`, `ssr-craft-lead`,
`ssr-read-title`, `ssr-desktop-tail`, `ssr-craft-tail`, and the already-dead
`ssr-slim-mark`) and the four rules that gated them. The dial is now the last
stop-dependent thing in the shell's top bar.

That deleted a duplicate tail's worth of inline lucide glyphs from the document:
`studio` `htmlRaw` measured **187218 bytes** against a 199200-byte budget, which
the route-budget gate correctly reported as stale.

**Then the editor toolbar below put more back than the tail took out.** Drawing
eleven controls where the shell had drawn one costs their inline lucide glyphs:
the route measures **195679 bytes** as it ships, so the branch is **net +8461**
on `studio` `htmlRaw`, not the −6182 the first ratchet recorded. The budget is
201600 (measured + ~3%, the ledger's own convention). Worth stating plainly
because the intermediate ratchet is still in the ledger's own note chain and
reads, on its own, like a saving. It was one, for two commits.

## Two more hand-off shifts, found by looking at the real thing

Unifying the header removed the shift *between stops*. The owner then reported a
shift that survives it — the one from the **pre-paint shell to the hydrated app**
— twice, and both reports were right about a different cause.

**The deck pill was ~42px too wide until the webfonts landed.** The shell paints
immediately in the fallback stack, and the pill sizes itself to its text, so the
divider and the dial after it slid when Outfit 600 and Playfair 700 arrived and
the text re-measured. `font-display: swap` is what makes that visible: it is the
right choice for body copy and the wrong one for a control whose width IS its
text. The fix is a `<link rel=preload>` for exactly those two faces in
`studio.astro` — the two the bar actually paints with, not the eleven in
`fonts.css`. Metric-adjusted fallbacks (`size-adjust`, `ascent-override`) were
the alternative and were not taken: they shrink the shift rather than removing
it, and they need a per-face measurement that nothing in the tree re-derives when
a font is swapped. `docs/e2e/font-preload.spec.ts` pins the preloads to faces the
route really requests, so a preload for a font nobody loads — a pure regression,
two extra round trips — fails rather than sits there. Measured on a throttled
connection: the title settles at its final width immediately, against **41.9px**
of shift before.

**The editor's sub-bar was a single placeholder against the app's eleven
controls.** The shell drew one generic pill where the hydrated app draws Add
slide, Reshape slide, Fix all issues, Version history, Slide settings, the
Markdown/Compose segment and Collapse editor — so the whole band under the header
filled in at hand-off, and grew. The shell's own rule says to draw a control
wherever its presence is a function of width or `data-ssr-stop`; every one of
these qualifies, and the sub-bar had simply never been held to it. Three things
were needed to make the shell's copy land in the same place as the app's:

- `.ssr-editpane` needed `container-type: inline-size`, because the app's
  toolbar hides controls with container queries (`@[36rem]`, `@[34rem]`,
  `@[21rem]`) resolving against the editor pane, not the viewport.
- `ReshapePicker` had to render **disabled** rather than not render, so that a
  deck with no variants does not change the row's control count between shell
  and app.
- `Slide settings` is width-gated in the app but not by a container query, so
  the shell gates it with a plain `@media (min-width: 1100px)` on
  `.ssr-slide-settings` — the app's own boundary, not Tailwind's `xl`.

Verified on iPad Air 4 metrics (820 x 1180 and 1180 x 820, DPR 2, touch), which
is the device the report came from: **12/12** controls in portrait and **11/11**
in landscape, worst positional delta **1px**, against a shell that drew **1**
control before. `studio-shell-parity` now censuses both sub-bars
(`[data-slot="edit-bar"]`, `[data-slot="preview-bar"]`) in addition to the three
roots it already had — the guard could not have caught this, because it had never
been pointed at the band that broke.

## The shift that survived all of it: fitted slot widths

The owner reported, after the two fixes above shipped, that the hand-off still moved. It did,
and neither of the guards could see it — one because it had been **widened to admit it**.

**What was wrong.** Two things in the chrome are per-deck content the shell cannot know before
React runs: the deck pill's slide-count meta ("7 slides") and the preview bar's counter
("Slide 1 / 7"). Each was drawn as a skeleton bar whose pixel width had been FITTED to the
welcome deck's own string and measured once — `w-[53px]` against "7 slides", `w-12` against
"Slide 1 / 7", each carrying a comment quoting the app box it was fitted against. A fitted
width is right for exactly one deck, and neither was right even for that one:

| slot | shell drew | app renders | error |
|---|---|---|---|
| deck meta | 53px | 56px | **3px**, and it moves the rule and all three dial buttons |
| reader-view label | 48px (a bar) | 46px ("Full deck") | 2px, and it moves the `‹` after it |

The 3px is the shift a reader sees: at every width from 1280 up, the posture dial and the whole
tail slid sideways the moment React took over.

**Why the guards were green.** `studio-shell-parity` *measured* the 3px and conceded it. It
carried a `PILL_TOL = 6` for the deck pill, plus a second exemption widening the posture dial's
`left` to the same 6px "as inherited from the pill" — both commented as structural variance owed
to "the reserved slide-count slot the shell must not draw". That reasoning is wrong in one
place: the slot must not draw the *count*, but nothing forced its *width* to be a guess. A guard
widened to fit the defect it is watching reports only that the defect has not grown.

**How it was found: a metamorphic relation, not a bigger checklist.** Every oracle in this area
compares the shell against a list somebody wrote down — which is why each new defect has been in
a control nobody listed. The relation needs no list and no expected values:

> for every point in the input space, the geometry the pre-paint shell draws equals the
> geometry the hydrated app draws.

The app is the oracle; the shell is the system under test. Swept over 22 widths x 3 stops x 2
device profiles (132 points), pairing controls **by position in the row** rather than by name —
the app's shadcn primitives carry `data-slot` and tooltip wrappers the shell's copies do not, so
any attribute-keyed pairing reports dozens of phantom rows and buries the real deltas under
them. A second, identity-free oracle diffs the chrome band's pixels.

Three of the first four "findings" were the harness, and saying so matters more than the two
that were real: the 62% skeleton fade dominated the pixel signal until it was neutralised; a
44% Craft "violation" was the full-height activity rail dragging the editor and preview PANES
into the clip, whose content is legitimately unknowable; and a 1px red line across every wide
point was the clip's own height rounding up into the row below the bar. An oracle with no
expected values still has a frame, and the frame can be wrong.

**The fix.** Neither slot is measured any more. Both take a fixed, content-independent width
from one shared constant per slot — `DECK_META_SLOT`, `SLIDE_COUNTER_SLOT` in
`chrome-parts.tsx` — which the app's chrome and the shell's skeleton both spread, so parity
holds by construction for every deck instead of by re-measurement for one. `min-w` rather than
`w`, so a deck past the reserved range grows its slot honestly instead of clipping its own
count. The reader-view label needed no reservation at all: the active lens is not persisted, so
every load starts on `full`, and the shell now draws the real string from `LENSES[0].label`.

It also fixes a shift that has nothing to do with the shell: the app's own counter used to
widen as you paged from slide 9 to 10. No shell-vs-app comparison could ever have caught that,
because both sides were wrong the same way.

**Result across the 132 points: geometry violations 0, worst delta 0px** (from 3px), and 68 of
132 at exactly 0.00% pixel difference outside the two declared-unknowable regions. The residual
is confined to widths under 700 in Write and Craft, at most 1.24%, and it is `mobileBarH: 49`
against a real 49.391px action bar — a frozen constant whose correction is the measure-and-
republish race that `preview-rect.ts` documents and that produced the intermittent
`rotation into cinema` failures (#2070). It is sub-pixel and it is deliberately left alone.

**What is now gated.** `PILL_TOL` and the dial exemption are deleted, so `studio-shell-parity`
compares everything at `TOL = 2`. `studio-reserved-slots.spec.ts` adds the relation itself in
three arms — the two surfaces agree on the slot width, the reservation holds the real text, and
**the slot does not resize when its content does**, walked across the digit boundaries the
reservation exists to absorb. All three were mutation-proved: with the reservation deleted and
the docs rebuilt, all three fail. The first cut of the third arm survived that mutation, because
the two shipped decks both have single-digit counts and "7 slides" and "9 slides" are the same
width in a mono face — which is why it now transforms the content directly instead of trusting
the decks that happen to ship.

## The one capability the unification drops

**At desktop Read between 1100 and 1279, the slide count is gone.** The slim
header drew `metaFor(source)` at `sm:inline` (≥640); the surviving deck pill
draws its meta at `xl:inline` (≥1280). Below 1100 nothing changes (the slim
header never rendered there) and at ≥1280 the pill covers it, so the delta is
that one desktop band, at that one stop. Found by an independent checker, not by
me — it is the only element-for-element difference between the deleted header and
the survivor, which is otherwise a strict superset (it even *adds* the
`data-demo="present" / "share" / "mode" / "show-me"` hooks that previously
resolved to nothing at desktop Read/Write, so the tour toolkit now finds them).

**It is not being restored in this PR, and the reason is a real cascade, not
convenience.** Showing the meta from 1100 would put the pill's non-shrinking
content at ~123px (2 border + 20 padding + 3 gaps + an 8px dot + a 53px meta +
a 16px chevron) against its declared `min-w-[62px]` desktop floor. That floor is
asserted against the pill's own rigid content by `readPill` in
`studio-header-fit.spec.ts`, which exempts `≥ xl` precisely *because* the meta
makes the floor unreachable there — so lowering the meta means either raising the
desktop `min-width` to ~123px, which changes how the whole row absorbs pressure,
or moving the exemption boundary down to 1100 and leaving the desktop floor
unchecked at every width. Both are changes to the row's shrink model, which is
not what this PR is about.

**What ships instead is the full row's own documented policy** — the meta "shows
only when the bar has room (≥xl); on a tight desktop/tablet the deck title takes
priority" — now applied at every stop rather than at two of three. That is the
unification working as intended: Read stops being special. But it is a loss
against the base, it was not in the original write-up, and the owner should get
to overrule it.

## Cost, taken knowingly

**Below desktop the brand block reads as ONE control whose left half leaves the
app.** The wordmark is gone at compact, so what is left is the logo plus a bare
24 x 32 chevron 2px away — and nothing says they are two targets there, where at
desktop the wordmark does. Tapping the logo then navigates to the marketing site,
which is a surprise. The `pagehide` flush above removes the *data-loss* half of
that surprise (whatever you had typed survives), but not the surprise itself.
Making the split legible at compact — a wider gap, a divider, a different
affordance — is a design call worth putting to the owner rather than picking
here. Not reproduced on a real touch device; this is a desktop-Chromium reading
of a phone-width layout, which #23 says is not the surface.

**The workspace menu's touch target shrinks below desktop.** It used to be the whole
64px brand button; it is now the chevron alone — 28 x 32px at 640–1099, 24 x 32 below
that. That clears WCAG 2.5.8's 24 x 24 minimum and matches every other icon control in
this row (all 32px, `BAR_CONTROL`), but it is smaller than what shipped. Growing it back
to a square 32 costs the header 4px per side, and `studio-header-fit` leaves 16px of
spare at the 700px floor — the split has already spent ~6px of that, so the square is not
free and it is not obviously worth it for a menu whose three doors (Decks, Fabricate,
Import) are all once-a-session. Re-derive the floor before spending it, don't assume.

Desktop Read and Write are **busier** than they were: they now carry the leading
rule, the appearance box and the tours launcher that only Craft had. The calm was
real and it is being spent. It buys the thing that was asked for — a shell that
does not move — and it hands Read two controls it had no business lacking: a way
to change theme or color mode while reading, and a way to open another deck.

## What this does NOT change

- The **body** is still stop-dependent: Read is chromeless preview, Craft adds
  the activity rail and the docked panels. `data-ssr-read` is still published and
  still drives the shell's band rules. The ask was about the bar.
- The **width ladder** is untouched: what overflows into the ⋯ menu is still
  decided by width alone (theme + tours at `xl`, feedback at `lg`, Present/Share
  at `md`), so a resized desktop window and a tablet at the same width still draw
  the same row.
- **Mobile** (< 700px) is untouched except for the brand split, which is **4px
  WIDER** there than what it replaced (62px against 58px) — see the measured
  table above. An earlier draft of this line said "6px narrower", which had the
  sign backwards on the one line a reader skims for "does this cost the phone
  anything".
