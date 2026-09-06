---
status: proposed
summary: >
  `kpi` and `inventory` declare `capacity` (items) and `density` (words per item) as
  INDEPENDENT budgets, and each is only true while the other is unspent. kpi's briefing
  fits 3 metrics at 15 words, and 4 only by dropping to one status pill — a slot no field
  carries — so 4 metrics at the documented 8 words overflows by 69.5px. inventory's ledger
  declares hard 6 / 22 words; measured it is hard 4, and at 4 the word ceiling is 18.
  One declared number covers five kpi modifiers and four inventory looks: it is wrong for
  two of the five (briefing, compliance) and three of the four. Separately, the box is not filled: kpi's hero holds 15.2% of its 748px
  column while the 340px rail runs at 66-81% and wraps, so narrowing the rail would make it
  worse; inventory's cards and timeline looks leave 41-43% of the stage empty and editorial
  reserves 77.6% of a column for one sentence. Four rules do not do what they say — the
  compliance status pill's `grid-column: 3` is inert (65-67% of every row empty), spotlight
  and trajectory strand the rule that heads each number, trajectory reserves a 4th column a
  sweet-count slide never fills, and the briefing rail still draws the closing outer-edge
  border `2026-09-03-table-outer-edge-rules.md` retired. `check:jank` reports DRIFT on both
  and both are false leads: the marks hold position and the stage moves under them.
---

# kpi and inventory: the budget is only true one number at a time, and the box is not filled

`kpi` and `inventory` both feel wrong to author and both waste their stage, and
the two symptoms share one cause. Each component declares a `capacity` (how many
items) and a `density` (how many words per item) as INDEPENDENT numbers, and each
is measured on its own. Spend both at once and the slide overflows. On top of
that, three of the four `inventory` looks and every `kpi` modifier center a
content-sized block inside a stage that is taller and wider than the block, so
the ink that survives the budget lands in a fraction of the room it was given.

Ordered by what a reader hits first: the false lead, the budgets, the wasted box,
three inert or stranded rules, and the duplication question.

Every number below is from a real Chromium render at `wide` / `indaco`. The
re-derivation for each is in § How to re-derive.

---

## 1. `check:jank` finds no jank here, and that is the finding

Run `--anchors` on either component and it names a mark and says it does not hold
position. Both are false leads, and it is worth writing down why, because the
tool warns about exactly this case and someone will hit it again.

**kpi.** The only generated box the walk can place is `li::after`, the hero
tile's spark. Over a 1-to-3-line heading sweep it moves **89.6px** vertically and
the run reports `DRIFT ... it does not hold position`.

It does hold position. The spark's offset inside the hero tile is a constant
`32px` on every step. What moves is the whole stage: the masthead grows **44.8px
per heading line**, so the stage top drops 89.6px over three lines and the stage
loses the same 89.6px of height. The mark rides its host, the host rides the
masthead, and that is the Form working as designed.

**inventory.** `li::before` (the row ordinal) reports 170.5px, matching nine
boxes per slide — the tool tells you to narrow it. Narrowed to
`li:first-child::before` the first row's ordinal still moves 170.5px across a
1-to-8 item sweep, and NOT monotonically: 352.3, 307.1, 311.1, 266.0, 230.8. That
is the stage's `justify-content: safe center` re-centering a growing ledger, not
a mark drifting inside its row.

No sweep on either component, on any axis, at any count, produced a COLLISION.

So the two rungs that can fail a `check:jank` run — DRIFT and COLLISION — report
nothing actionable on either component. What the runs DO produce is the advisory
CROWDING row and the `probe` column, and those are where the real defects are.
`engineering/jank.md` § "What a green run does NOT mean" already says a green run
is narrower than the word suggests; this is a worked example of the other half:
a RED run that is not a defect.

---

## 2. The joint budget: capacity and density are only true one at a time

Both manifests declare a count budget and a word budget as if they were
independent. They are not, and neither the manifest nor the docs carry the joint
number an author actually needs.

### kpi (briefing, the bare default)

Declared: `adapt.capacity.wide` sweet 3 / soft 4 / hard 4, `density` soft 8 /
hard 14.

| metrics | pills per row | measured ceiling |
|---|---|---|
| 3 | 2 | fits to **15** words per label; 16 overflows |
| 4 | 2 | **never fits** — overflows at 3 words, the shortest the rig emits |
| 4 | 1, one-line title, no eyebrow | **fits**, 0.0px overflow |

Read the second and third rows together. `hard: 4` is reachable, but only by
spending a slot the manifest has no field for — the PILL COUNT. `kpi.docs.md`
says so in prose ("a fourth needs everything terse — one status pill, no eyebrow,
a one-line title") and that sentence is correct. Nothing machine-readable carries
it, so an agent that reads `hard: 4` and `density.soft: 8` and writes four
metrics at eight words each produces a slide that overflows by **69.5px**. The
two numbers in the same manifest cannot both be spent.

First overflow per modifier, at the documented soft density of 8 words and the
documented two-pill row:

| modifier | first overflow | so the real hard count is |
|---|---|---|
| briefing (bare) | 4 | 3 |
| compliance | 4 | 3 |
| ops | 5 | 4 |
| trajectory | 5 | 4 |
| spotlight | 5 | 4 |

One declared `hard: 4` covers all five, and it is wrong for **two** of them —
briefing and compliance, whose real ceiling is 3. For ops, trajectory and
spotlight the declared 4 is exactly right. An earlier draft called it
"pessimistic for three", which its own table above refutes: a first overflow at 5
means a hard count of 4, which is what the manifest already says.

### inventory (ledger, the bare default)

Declared: `capacity` min 2 / sweet 4 / soft 5 / hard 6, `density` soft 14 /
hard 22.

| items | measured ceiling |
|---|---|
| 3 | no overflow through 30 words |
| 4 | **18** words per item; 19 overflows |
| 5 | **never fits** — overflows at 3 words |
| 6 | never fits |

So the declared `soft: 5` and `hard: 6` are both unreachable at any word count,
the real hard count is **4**, and at 4 the word ceiling is **18**, not the
declared 22. An author writing to the documented contract — 4 items, 22 words —
overflows. This is the "the word budget seems off" complaint, and it is off by
about four words at the count the docs recommend and by two entire items at the
count they permit.

First overflow per look, at the documented soft density of 14 words:

| look | first overflow | so the real hard count is |
|---|---|---|
| editorial | 4 | 3 |
| ledger (default) | 5 | 4 |
| cards | 7 | 6 |
| timeline | none through 8 | see below — the probe is blind here |

One declared `hard: 6` covers all four looks. It is right for `cards` alone. And
`inventory.docs.md` singles out "the cards/timeline looks past four" as the tight
ones, which is backwards: `cards` and `timeline` are the roomy two and
`editorial` is the tightest by a wide margin.

### The timeline look fails in a direction nothing measures

`inventory timeline` never trips the overflow probe because adding items makes
the columns NARROWER, not the block taller. Its failure mode is horizontal, and
its budget is on the LEAD, not the item.

At the gallery's own four items the columns are 264px and the display-face lead
wraps to two lines on **three of the four** entries; the widest lead is 248.4px
in a 264px column, 94% of the track. Bodies then start at different heights
across the run — visible in `inventory.gallery.light.pdf` today. The measured
lead budget at four columns is about **three words**, and no field anywhere
expresses a per-slot budget, only a per-item one.

`check:jank` cannot see this either: the ink height does not move, so the sweep
reports clean and the vacuity warning does not fire. Neither can
`check:overflow-corpus`. It is invisible to every instrument we have.

### tall, stated with its caveat

Sweeps at `--family tall` render `--no-split`, so these are PRE-SPLIT ceilings:
they measure the shape a tall slide has BEFORE the structural splitter runs.

Measured, on a 3-item `inventory` deck at `size: portrait`: the splitter fires
(`auto-split (structural): 1 slide(s) split to one element per page`) and BOTH
outputs paginate. The PDF does, and so does the emulator's own HTML — four
sections, one item each, the list clearing the stage bottom by 64.7px, 64.7px and
0.0px. So neither of the two
surfaces this tool writes shows a clipped page, and these ceilings do not predict
one there.

**Where a pre-split ceiling would bite is NOT re-verified here.**
`kpi.styles.css`'s #1277 note names two surfaces where nothing re-paginates —
the live preview and an export-to-Marp bundle — and that is the repo's own
record, not a measurement taken for this note. Neither was driven. Treat the
tall table as a description of the pre-split shape and nothing more until
someone drives one of those two surfaces (#23).

| component | declared tall hard | measured pre-split (max fitting count) |
|---|---|---|
| kpi | 5 | 3 |
| inventory | 8 | 2 |

Both cells are the last count that FITS, not the first that overflows — kpi first
overflows at 4 and inventory at 3. An earlier draft put 4 in the kpi row, which
was the first-overflow number sitting beside inventory's max-fitting one.

These are not stated as defects. `adapt.capacity.tall.hard` may legitimately be
describing POST-split behavior — 8 items in a tall deck become 8 pages, and that
is a reasonable thing for the field to mean. What the table shows is that the
tall numbers and the wide numbers are not measuring the same thing, and nothing
in the manifest or the docs says which. Deciding what `tall.hard` is FOR is a
prerequisite to correcting it; the wide numbers in § 2 need no such decision,
because at wide the splitter does not run and the declared number and the
measured ceiling are directly comparable.

---

## 3. The box is not filled

Fill is the readable ink's area over its container's area, both measured from the
render.

### kpi: the hero hoards the room and the rail runs out of it

The briefing grid is `minmax(0, 2.2fr) minmax(0, 1fr)` with an `--sp-2xl` gap. In
a 1152px stage that resolves to **hero 748px (64.9%), gap 64px (5.6%), rail 340px
(29.5%)**.

| tile | box | ink | fill |
|---|---|---|---|
| hero | 748 x 438.2 | 215.5 x 231.8 | **15.2%** |
| support (gallery labels) | 340 x 146.1 | ~203 x 134.3 | **54-56%** |
| support (stress-test labels) | 340 x 146.1 | ~299 x 134.3 | **66-81%** |

The hero holds 14-15% of its box on the briefing default and its universal
variants — 14.1% under `compact`, 15.1% under `dark` — and stays low, though not
that low, elsewhere: 21.3% under `spotlight`, 22.2% under `trajectory`, 25.0%
under `ops`. It
is the emptiest tile on the slide and it has 2.2 times the width of the tile
beside it.

That inverts the complaint. The rail is not stealing room from the hero: at full
word weight the RAIL is the constrained one, at 66-81% and wrapping, while the
hero sits at 19.6% with 68px of left inset and 403.1px of empty to the right of
its own status pill. (Those two figures are from the stress slide, the one the
sentence is about; on the default slide, where the hero is at 15.2%, they are
68px and 464.5px.) The hero's content is `justify-content: center` — vertical only
— and left-aligned, so a short block in a 748 x 438 box reads as parked in the
upper left rather than composed.

So "narrow the rail" on its own would make it worse: it would take room from the
tile that is running out and give it to the tile that already wastes 85%. What
makes the split feel right is the hero using its box — centering its content on
both axes and letting the number take the scale the space implies. Then the split
can move.

### inventory: three looks huddle in the middle of the stage

| look | list height | stage height | dead space |
|---|---|---|---|
| ledger (default) | 368.0 | 400.4 | **8.1%** |
| timeline | 235.3 | 400.4 | **41.2%** |
| cards | 226.5 | 400.4 | **43.4%** |
| editorial | 395.9 | 400.4 | **1.1%** (see below) |

`cards` is the clearest: 87px empty above and 87px below a 226.5px grid, in a
stage that is 400.4px tall. The default ledger, which is the one look the user did
not complain about, is also the only one that fills its stage.

The cause is deliberate and recorded in the CSS: the `ul` deliberately does NOT
take `flex: 1`, so a trailing insight blockquote is never pushed past the stage
clip, and the stage `safe center`s the group. That fixes a real bug and creates
this one — the list sizes to its rows and the leftover height goes to padding on
both ends.

`editorial` wastes its stage on the OTHER axis, which is why its row above reads
1.1% and means nothing: its item column is nearly stage-tall, so the table's
measure — how much of the stage's HEIGHT the list leaves unused — is the wrong
question for it. The waste is a whole column. The stage is `1fr 1.25fr`, so the
insight column takes 483.5px and the items 604.5px; the insight itself is an
89.6px block in a 400.4px-tall stage, leaving **77.6% of that column's height
empty** while the component overflows at four items. Half the slide's width is
reserved for one sentence.

(Read that 77.6% as 89.6px against the stage's 400.4px height. It is NOT 89.6
against the column's 483.5px width — those are different axes, and dividing them
gives 81.5%, a number that describes nothing.)

---

## 4. Three rules that do not do what they say

**The compliance status pill is inert.** `kpi.styles.css` puts the pill in a
right-hand status column:

```css
section.kpi.compliance > .cell-stage > ol > li > ul > li code:first-of-type {
  grid-column: 3; grid-row: 1 / 3; align-self: center;
}
```

The row's `<ul>` is `display: contents`, so the inner `<li>`s become grid items.
The `<code>` is a child of one of THOSE, so it is a grandchild of the grid
container and not a grid item at all. The declaration computes and has no effect.
Measured: the pill's right edge lands at 438.6-464.5px on a 1152px row, leaving
**751-777px of empty right column — 65-67% of every compliance row**. The
reserved status column is never used and the pill trails the meta text instead.
This is the single largest instance of "pill placement leaves lots of space".
**Fixed:** the third track is gone and the status column is built where the pill
actually lives — the meta line is a flex row with `space-between`, so the label holds
the left and the pill takes the row's right edge (`space-between`, not
`margin-left: auto`, so #20 needs no allowlist entry). Measured after: the pill's
slack to the row's right edge is **0.0px**, and a compliance row's ink goes from
274.8 x 85 to **1026.3 x 85** — fill 17.6% to **66.4%**.

**The spotlight supports strand their own rules.** `kpi.styles.css` already
documents this defect and fixes it — for briefing, at one count only:

> With a SINGLE support the row is the whole column, so centering strands that
> hairline ~157px above the number it introduces — a rule heading nothing.

The fix is `ol:not(:has(> li:nth-child(3))) > li:not(:first-child) {
justify-content: start }`, scoped to briefing and explicitly excluding
`.spotlight`. `spotlight` centers its supports at every count and has no
equivalent, so on a 3-metric spotlight slide each support's ink sits **37.3px**
below the rule that heads it, in a 187.1px row at 21-23% fill. **Fixed:** the
spotlight supports top-align under their own rules — unconditional there rather than
count-aware, because the hero sets the rail's height, so a spotlight support's row is
always taller than its content.

**The trajectory grid is fixed at four columns.** `repeat(4, minmax(0, 1fr))`,
so a 3-metric slide — which is `sweet` — leaves the fourth column, 270px and 23%
of the stage, completely empty. **Fixed:** the column count follows the metrics
authored, the way the briefing grid's ROW count already did. The gallery's 3-metric
slide now lays out `368px 368px 368px` and fills the stage.

**What is NOT a defect, corrected from an earlier draft.** This section used to add
`trajectory`'s **110.2px** alongside spotlight's 37.3px as a second stranded rule. It
is not one. Spotlight's border-top is a hairline heading the number directly beneath
it, so a gap leaves a rule heading nothing. Trajectory's is a 4px categorical stripe
along the top EDGE of a filled card whose content is centered — the same composition
`ops` uses, and deliberate. That 110.2px is a tall card holding short content, which
is § 3's fill question, not § 4's. Nothing was changed there. The geometry number
alone could not tell the two cases apart; only looking at what the mark IS could.

**And the closing rule on the rail is one the repo already retired elsewhere.**
The briefing rail brackets itself: row 1 takes a 1.5px `--text-heading`
border-top, interior rows take 1px `--border`, and the LAST row takes a 1.5px
`--text-heading` **border-bottom**. That bottom rule separates nothing — it is
the ledger's floor. `inventory.styles.css` removed exactly this, deliberately,
citing #2055 and `2026-09-03-table-outer-edge-rules.md`:

> It used to ride `border-bottom` on every row, which put one under the LAST row
> too — where it stops separating anything and becomes the ledger's floor.

kpi never got that pass. The rail read as a closed table frame rather than a set
of separated rows, which is what made it feel heavier than the three numbers in it
justify. **Fixed**, on the briefing rail, on `spotlight`'s rail, and on
`compliance`'s rows — which carried the identical defect one modifier over, a bottom
border under every row and a heavy one under the last.

---

## 5. Does inventory duplicate other components?

Largely, yes, and the corpus has already voted.

**Usage.** Counted as SLIDES — a `<!-- _class: X … -->` directive whose first token
is the component — over the committed decks that actually render: `examples/`, the
baseline decks, and the component and integration galleries. Not `.docs.md`
(authoring examples set in prose) and not manifests (skeleton strings inside JSON),
neither of which is a slide anyone sees. The script is reproduced in full in § How
to re-derive; run it and the table reproduces.

| component | slides | distinct decks |
|---|---|---|
| cards-stack | 102 | **70** |
| cards-grid | 101 | **45** |
| glossary | 42 | 23 |
| list | 39 | 18 |
| list-tabular | 48 | 12 |
| agenda | 25 | 10 |
| **inventory** | **15** | **5** |

**The deck column is the one that matters**, and it is the one an earlier draft did
not have. Slide count rewards a component with a long gallery; deck count says how
many separate decks reached for it. `inventory`'s five are `examples/inventory.md`
(its own demo deck), its own component gallery, its bucket's survey gallery,
`test/integration/baseline-decks/gallery.md` (the catalog), and
`examples/split-envelope.md`. Four of the five exist to exhibit the component. **One
deck uses it for its own sake.** `cards-stack` is in seventy.

An earlier draft of this paragraph gave seven counts — 25 for inventory, 105 for
cards-grid, and so on — that no single grep reproduces; each needed a different
file filter, and the one that yielded 25 excluded the very manifest the next
sentence said was inside it. They were measured by a command nobody wrote down,
which is the failure `tools/lib/calibrate-core.js`'s own `premise` note warns about.
The numbers above replace them and ship with the script.

**Classification.** `inventory` and `cards-grid` share a bucket, a function
(`inventory`), a substance (`structure`) and the same three tags — `overview`,
`summary`, `showcase` — differing only in Form (`ledger` vs `grid`). And
`inventory cards` renders a two-column card grid, which is `cards-grid`'s Form,
not its own.

**And the two cannot share source.** `cards-grid` is in `CARD_STYLE_LAYOUTS`, so
HARD RULE #5's gate requires the nested `- Title` / `  - body` shape. `inventory`
is deliberately NOT in that set and its docs mandate the inline `- **Lead.**
body` shape, listing the nested form as an anti-pattern. That is not a rule
violation — inventory does not auto-bold its `li`, so the ransom-note bug the gate
exists to catch does not apply — but it does mean the one promise the component
is built on ("write the items once, switch the variant, no re-authoring") stops at
its own boundary. An author on `cards-grid` who wants inventory's timeline look
must re-author every item, which is the exact cost inventory says it removes.

The honest read: `inventory`'s default ledger is a good, well-behaved layout — it
is the only look here that fills its stage. Its three variant looks are a card
grid that duplicates `cards-grid`, a horizontal run that duplicates part of
`list-steps timeline`, and a magazine split that overflows at four items while
wasting 77.6% of its own sidebar.

---

## 6. Candidate moves

**Moves 1-4 are DONE, in this note's own branch.** The rest are not, and are grouped
by what they cost.

**Cheap and self-contained — all shipped.**
1. ~~Delete the closing `border-bottom` on the briefing and spotlight rails~~ —
   **done**, and it went further than the line proposed: the rail's heavy border-TOP
   above the first support was the same outer edge and went with it, and `compliance`
   carried the identical defect one modifier over. Separators between rows only, on
   all three.
2. ~~Fix or delete the compliance status column~~ — **done**, though not the way this
   line proposed. `display: contents` on the inner `<li>` does NOT work: it would make
   the label's text an anonymous grid item that no selector can place. The third track
   is gone and the meta line is a flex row with `space-between` instead, which puts the
   pill on the row's right edge with 0.0px of slack.
3. ~~Extend the `justify-content: start` fix to `spotlight` and `trajectory`~~ —
   **done for `spotlight`, and deliberately NOT for `trajectory`**: measuring said two
   marks, looking said one defect. See § 4's correction.
4. ~~Size the trajectory grid to the metrics authored~~ — **done**.

Two of those four shipped in a different shape than this list proposed, which is the
argument for writing the mechanism down rather than only the intent.

**The real design question — kpi's split.**
5. Center the hero's content on both axes and let the value scale with the box,
   THEN reconsider the column ratio. Doing them in the other order makes the rail
   worse.

**The budgets.**
6. Correct the declared numbers to the measured ones (kpi briefing hard 3 at
   documented density; inventory hard 4, word ceiling 18), and declare them
   per-variant, since one number is wrong for two of five kpi modifiers and three
   of four inventory looks.
7. Give the contract a joint budget rather than two independent ones, and a slot
   budget for kpi's pills and inventory timeline's lead.

**The duplication.**
8. Decide whether `inventory` keeps its variant looks at all, or narrows to the
   ledger and points `cards` at `cards-grid` and `timeline` at `list-steps`.

---

## How to re-derive

```sh
# The sweeps. --advisory keeps a red CROWDING row from masking the table.
node tools/check-jank.js kpi --anchors
node tools/check-jank.js kpi --anchor 'ol > li:nth-child(1)::after'   # the false DRIFT
node tools/check-jank.js kpi --axis count --max 6 --advisory
node tools/check-jank.js kpi --axis words --count 4 --max 14 --advisory
node tools/check-jank.js "kpi spotlight" --axis count --max 6 --advisory
node tools/check-jank.js inventory --axis count --max 8 --advisory
node tools/check-jank.js inventory --axis words --count 4 --max 28 --advisory
node tools/check-jank.js "inventory editorial" --axis count --max 8 --advisory
node tools/check-jank.js inventory --axis count --max 9 --family tall --advisory

# The geometry (fill ratios, column widths, pill slack, dead space) is measured
# off the component's own gallery render. Render it, then read the boxes in
# Chromium:
node lattice-emulator.js lib/components/evidence/kpi/kpi.gallery.md out.pdf
```

The usage table in § 5 is this, in full — paste it into a file and run it. There is
no committed tool for the question, and the whole point of § 5 is that its numbers
must be re-runnable:

```js
const { execSync } = require('node:child_process');
const fs = require('node:fs');
const files = execSync('git ls-files "examples/*.md" "test/integration/baseline-decks/*.md"'
  + ' "lib/components/**/*.gallery.md" "lib/integrations/**/*.gallery.md"',
  { encoding: 'utf8' }).split('\n').filter(Boolean);
const slides = new Map(); const decks = new Map();
for (const f of files) {
  for (const m of fs.readFileSync(f, 'utf8').matchAll(/<!--\s*_class:\s*([^>]+?)\s*-->/g)) {
    const first = m[1].trim().split(/\s+/)[0];
    slides.set(first, (slides.get(first) || 0) + 1);
    if (!decks.has(first)) decks.set(first, new Set());
    decks.get(first).add(f);
  }
}
for (const n of ['inventory', 'cards-grid', 'cards-stack', 'list', 'list-tabular',
                 'glossary', 'agenda']) {
  console.log(n.padEnd(14), String(slides.get(n) || 0).padStart(4),
              (decks.get(n) || new Set()).size);
}
```

It scanned 241 files at the commit this note landed on. The counts move as decks are
added, so re-run it rather than quoting these numbers forward.

The fill and dead-space figures came from ad-hoc Chromium measurements over
`kpi.gallery.md` and `inventory.gallery.md`. They are not yet a committed
instrument; if any of these moves ships, the fill ratio is the number to pin,
because it is the one thing that distinguishes "the layout is balanced" from
"the layout is empty" and nothing in the tree measures it today.

## Canonical sources

- `engineering/jank.md` — the method, and § "What a green run does NOT mean".
- `engineering/decisions/2026-09-03-table-outer-edge-rules.md` — the outer-edge
  rule decision kpi has not had applied.
- `lib/components/evidence/kpi/kpi.styles.css` — the briefing row-count and
  stranded-hairline notes, which already name half of § 4.
- `lib/components/inventory/inventory/inventory.styles.css` — the `li + li`
  separator note, and the `flex: 1` note that explains § 3's dead space.
