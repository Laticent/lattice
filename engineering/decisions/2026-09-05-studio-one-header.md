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

The fourth is gone. It used to sit between the appearance box and the tours
button — *inside* the utilities band, bracketing a single 58px control with two
rules 19px apart. That is the "part of me feels like it is off": the row's
banding scheme was not one rule per boundary, it was four rules at three
different width gates with one of them mid-band. Rule 2 also lost its `xl` gate;
the 7px that costs at 1100–1279 is paid for by deleting the mid-band rule.

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
makes it a second target. `studio-header-fit`'s ≥16px spare floor at 700px still
passes, which is the only place that 6px could have mattered.

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
the route-budget gate correctly reported as stale. Ratcheted to 192800
(measured + ~3%, per the ledger's own convention).

## Cost, taken knowingly

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
- **Mobile** (< 700px) is untouched except for the brand split, which is 6px
  narrower there than what it replaced.
