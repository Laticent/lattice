---
status: in-progress
summary: Can a `guards: strict` register prevent overflow by ellipsizing the text that does not fit? Measured on the real engine in Chromium, Firefox and WebKit — yes for prose in an HTML text block, no for anything else, and the hard part is not the trimming. An adaptive pure-CSS clamp exists in WebKit alone, so the CSS-only route is a portability trap; a measured pass fits every clipping slide in the corpus at 1-9ms per deck. But the note's original strongest claim was wrong: the existing `probeContentClipped` sees a CLAMP (the lines still lay out) and is blind to a DROP (`display: none` generates no client rects), so a TRIM must emit its own signal instead of inheriting the alarm. Stressed across the whole component gallery, the prototype that fixed the most slides did it by silently deleting 82 elements and left 13 slides losing content with no mark and no alarm. Three of the author's own detectors reported the flattering answer before an independent pass caught them. The ruling stands — TRIM as a fifth Fit-Ladder move, selective, default-off, measured, carried by a `guards:` front-matter register — but the alarm and the decline path are open problems, not details.
---

# Guards — can an ellipsis prevent overflow?

**The proposal.** A deck-level `guards:` register. At `strict`, text that
overflows renders with an ellipsis instead of spilling or being cut mid-line, so
the component keeps its shape and an export carries a clean "…" rather than a
sheared paragraph. At `loose`, nothing changes. **The original framing said the ring, the "Content
clipped" tag and the type-floor warning all stay on either way, so the guard
protects the look without hiding the problem. That is false, and it is this note's
central retraction:** the ring is geometric, so a guard that works turns it off;
the tag is blind to a dropped element (§3); and both can be switched off together
by an existing export setting (§10). A TRIM that keeps the problem visible must
emit its own signal, and that signal does not exist.

**The answer, in one line:** it works, it is not universal, and the boundary is
sharp enough to write down. Trimming can only recover height that TEXT is
occupying, in an HTML box, where losing the tail does not change what the slide
asserts. That is most prose and almost nothing else.

Everything below was measured on this tree at `9522374`, with the real emulator
and three real browser engines — Chromium 131.0.6778.204 (what the export pipeline
runs), Firefox 155.0, and WebKit 26.6 (Safari) — not reasoned from the spec. One
claim in the first draft did not survive that second look; §1 says which and what
it changed.

---

## 1. An adaptive pure-CSS clamp exists — in one engine of three

**This section was wrong in the first draft and is corrected here.** It said flatly
that CSS cannot clamp to available height. Measured across three real engines, that
holds in Chromium and Firefox and is **false in WebKit**, which accepts a line count
derived from a length ratio and draws the ellipsis correctly.

The first hope is that this is a stylesheet change: give every text box
`overflow: hidden` and a clamp, ship it in `lattice.css`, and be done — no
measurement, no JS, and it works on every render path including export-to-Marp.
The blocker is that `-webkit-line-clamp` takes an integer line COUNT, and the
question is whether that count can be derived from the height the box has.

Seven forms, three engines, each row read as a computed value AND as a render:

| Form | Chromium 131 | Firefox 155 | WebKit 26.6 |
|---|---|---|---|
| a. `-webkit-line-clamp: 3` (literal) | clamp + ellipsis | clamp + ellipsis | clamp + ellipsis |
| b. `calc(120px / var(--lh))` | **dropped** (`none`) | **dropped** (`none`) | **`5` — clamp + ellipsis** |
| c. `calc(100cqh / 24px)`, real size container | **dropped** | **dropped** | **`5` — clamp + ellipsis** |
| d. `round(down, 5.9)` (pure number) | `5` — clamp + ellipsis | `5` — clamp + ellipsis | `5` — clamp + ellipsis |
| e. `line-clamp: 3` (CSS Overflow 4) | unsupported | unsupported | unsupported |
| f. `block-ellipsis: auto` | unsupported | unsupported | unsupported |
| g. `-webkit-box` + `max-height`, no count | clip, **no ellipsis** | clip, no ellipsis | clip, no ellipsis |

`CSS.supports()` agrees with the renders: `line-clamp` and `block-ellipsis` are
false in all three; `-webkit-line-clamp` is true in all three. So the difference in
rows b and c is not feature support, it is whether the engine accepts a **length
ratio** where an `<integer>` is required. WebKit does; Chromium and Firefox drop
the whole declaration. Row d shows the barrier is specifically lengths — pure
numeric arithmetic is accepted everywhere.

**Row c is the one that matters, and it is why the correction does not change the
ruling.** With `container-type: size` on the parent, `calc(100cqh / 24px)` is a
genuinely adaptive, JS-free clamp: the box tells the text how many lines it may
have. It is exactly the mechanism this proposal wanted — and shipping it would
mean an ellipsis in Safari and a hard mid-line clip in Chrome and Firefox. **The
same deck would render three ways**, which is the precise failure the engine
exists to prevent, and the export pipeline runs on the engine that drops it. So
the cross-engine result **strengthens** the case for a measured pass rather than
weakening it: the CSS-only route is not merely unavailable, it is a portability
trap that would look like it worked for whoever tested it on a Mac.

`block-ellipsis: auto` is the feature that would settle this properly, and no
engine ships it.

### Re-deriving this table

No dependency and no checkout needed — save this as an `.html` file and open it in
any browser. Each row's verdict is its computed `-webkit-line-clamp` plus whether
the last visible line ends in an ellipsis.

```html
<!doctype html><meta charset=utf-8>
<style>
  body{font:16px/24px sans-serif}
  .frame{width:300px;height:120px;border:2px solid #333;overflow:hidden;margin:8px 0}
  .t{--lh:24px;line-height:var(--lh)}
  #a .t{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;overflow:hidden}
  #b .t{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:calc(120px / var(--lh));overflow:hidden}
  #c .frame{container-type:size}
  #c .t{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:calc(100cqh / 24px);overflow:hidden}
  #d .t{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:round(down, 5.9);overflow:hidden}
  #e .t{line-clamp:3;overflow:hidden}
  #f .t{max-height:120px;overflow:hidden;block-ellipsis:auto}
  #g .t{display:-webkit-box;-webkit-box-orient:vertical;max-height:120px;overflow:hidden}
</style>
<div id=a><b>a literal 3</b><div class=frame><div class=t>PARA</div></div></div>
<div id=b><b>b calc(120px/var(--lh))</b><div class=frame><div class=t>PARA</div></div></div>
<div id=c><b>c calc(100cqh/24px)</b><div class=frame><div class=t>PARA</div></div></div>
<div id=d><b>d round(down,5.9)</b><div class=frame><div class=t>PARA</div></div></div>
<div id=e><b>e line-clamp:3</b><div class=frame><div class=t>PARA</div></div></div>
<div id=f><b>f block-ellipsis:auto</b><div class=frame><div class=t>PARA</div></div></div>
<div id=g><b>g -webkit-box+max-height</b><div class=frame><div class=t>PARA</div></div></div>
<script>
  // PARA must be long enough to overflow a 5-line box, or a "no clamp" row proves nothing.
  const para = 'Lorem ipsum dolor sit amet '.repeat(12);
  for (const t of document.querySelectorAll('.t')) t.textContent = para;
  console.table(Object.fromEntries([...'abcdefg'].map(id => {
    const el = document.querySelector('#' + id + ' .t');
    return [id, { clamp: getComputedStyle(el).webkitLineClamp,
                  boxH: Math.round(el.getBoundingClientRect().height),
                  clipped: el.scrollHeight > el.getBoundingClientRect().height + 1 }];
  })));
  console.log(CSS.supports('line-clamp','3'), CSS.supports('block-ellipsis','auto'));
</script>
```

---

## 2. The measured guard, and what it did to the shipped corpus

The experiment is about 100 lines that run after fonts settle: find the boxes
that overflow, walk their text blocks, find the block that crosses the frame
edge, and set `-webkit-line-clamp` to the number of lines that fit above it.

Run over every deck in the corpus that clips today. **Two prototypes, and the
difference between them is the subject of §2b and §3** — v2 clamps the block that
crosses the frame edge; v3 adds a rule that also hides what follows.

| Deck | Slides | Clipping before | v2: after | v3: after | v3 trims | v3 alarm |
|---|---|---|---|---|---|---|
| `examples/overflow-fix-me.md` | 7 | 2, 3, 5 | 2 | none | 8 | 3 |
| `examples/marker-corner.md` | 7 | 3, 4 | none | none | 2 | 3, 4 |
| `examples/README.md` | 1 | 1 | 1 | none | 1 | **none** |
| `premise.gallery.md` | 8 | none (it trims already) | none | none | 0 | 3 |

v2 fixed four of the six geometrically clipping slides; v3 fixes all six, at 1-9ms
per deck. **Read the last column before reading the others.** On
`examples/README.md`, v3 makes the slide fit and leaves *both* alarm channels
silent — the outcome §9 calls the one thing worse than the clip it replaces. §3
explains the mechanism.

### 2a. Neither of those numbers is the ruling's number

**Both prototypes above are permissive in ways §6 and §4d forbid.** Their
`isTextBlock` accepts any block with inline children, so they trim headings, KPI
values, code and legal text — the classes §6 rules `never` — and v3's fix rate
comes from `display: none` drops that §4d's rule prohibits. **The note recommended
one design and reported the score of another.**

Re-run with the ruling's own constraints applied — never-trim enforced by role,
and decline instead of drop when the mark cannot be visible:

| Deck | Clipping before | AS RULED: after | Why |
|---|---|---|---|
| `overflow-fix-me.md` | 2, 3, 5 | **2, 5** | p3 fixed by trimming one over-long card body |
| `marker-corner.md` | 3, 4 | **3, 4** | the only partly-visible crossing block is a heading — never-trim |
| `examples/README.md` | 1 | **1** | the crossing block is a shell command one line-height from the edge |
| `premise.gallery.md` | none | none | — |

**One of six.** Not four, not all six. **This number is now produced by committed
code**, not by a scratch script: `lib/core/guards-trim.js` measures, plans and
applies, and re-running it over the same four decks gives the same 1 of 6 while
agreeing with `probeSectionOverflow` about which six slides clip. The earlier
disagreement was the measurer's fault and is recorded in that file — a first cut
counted the footer band and the marker berth as content, which made the footer
"the block crossing the edge" on half the corpus and reported twelve overflowing
boxes where the probe reports six. The gallery stress in §2b tells the same
story more gently — 38 of 80 as ruled against 51 of 80 permissive — but the stress
harness inflates `p` and `li` prose specifically, which is the one class the guard
is allowed to trim, so it measures the guard against overflow built to its own
specification. **The corpus is the honest sample, and there the ruled mechanism is
a one-in-six mechanism.**

Look at what actually causes overflow in real authored decks: a heading, a
callout box's chrome, a command line, a mid-column timeline entry. **§6's
`never` list and the actual causes of overflow are nearly the same list.** That
is the finding that should have priced the mechanism fork in §8, and it did not,
because the fork was decided against a fix rate that the ruling forbids.

**Cross-engine parity holds — but read the numbers as v2's, which they are.**
The table below was measured on v2 and its "cut signal after" column reads like
the claim §3 exists to retract. Under v3 the same deck fits on all three engines
and the alarm survives on ONE slide of three, not all three. Parity itself
reproduces for both prototypes; only the printed figures are v2's.

| Engine | Clipping before | Clipping after | Blocks trimmed | Cut signal after |
|---|---|---|---|---|
| Chromium 131 | 2, 3, 5 | 2 | 4 | 2, 3, 5 |
| Firefox 155 | 2, 3, 5 | 2 | 4 | 2, 3, 5 |
| WebKit 26.6 | 2, 3, 5 | 2 | 4 | 2, 3, 5 |

**That parity does not survive scale, and the claim built on it was mine and was
wrong.** An earlier draft read "byte-for-byte the same verdict" and used this
7-slide deck to carry the portability argument for the whole design. Re-run over
the stressed gallery, the guard performs **193 actions in Chromium, 173 in
Firefox, 193 in WebKit** — 28 actions Chromium takes that Firefox does not, 8 the
reverse — and it disagrees element-for-element about budgets. So the measured pass
makes the **words on the slide** a property of the renderer at roughly 3-8% of
actions, a smaller version of the defect §1 rejects the CSS route for. §1's own
argument is "the same deck would render three ways, which is the precise failure
the engine exists to prevent". The measured pass does that too, just less often.
The mechanism is portable in kind — the literal-integer clamp parses everywhere —
and non-deterministic in degree.

The two slides that did not fit under v2 are the interesting half, and they are
section 4. Under the ruled guard, five of six are that half.

---

## 2b. Stressed across the whole component gallery

Four decks is a small sample, and the corpus is curated clean, so the guard was
run against the full component gallery with every slide's prose inflated until it
overflowed. 116 slides: 29 carry no prose leaf to trim, 6 would not overflow even
at 6 doublings, leaving **81 slides stressed into genuine overflow across the
component catalog**.

Two prototype versions were run over the same 81 slides. **The second was built to
fix the first's worst defect and made it worse**, which is the most useful thing in
this note.

**Read every figure below with its reproducibility in mind.** The harness is
`.scratch/guards/{guard,stress}.mjs` against a rendered `gallery.html`, and
`.scratch/` is gitignored with a 14-day sweep (`npm run clean:scratch`), so unlike
§1 — which inlines its own probe — **none of these numbers can be re-derived from
this branch, and they will not survive a fortnight.** Two rows were already wrong
in earlier drafts (the v2/v3 comparison mixed two different formulas, and the
"no alarm" figure was extrapolated rather than measured); both are corrected here
by an independent re-run. A third prototype, v2 itself, no longer exists in any
form, so its column is unreproducible even in principle — an independent
reconstruction from this note's own definition lands at 44/37/21 against the
43/38/19 printed. **Treat the whole table as one session's measurement, not as a
repository fact.**

| Outcome | v2 (clamp the crossing block) | v3 (+ reach back and hide what follows) |
|---|---|---|
| Guard made the slide fit | 43 (53%) | 53 (65%) |
| Guard declined | 38 | 28 |
| Slides with a clamp whose ellipsis is off-screen | **19 (23%)** | 2 |
| Elements silently DROPPED (`display: none`) | 0 | **82** |
| Slides that lose content at all | 19 | **21** |
| **Slides that lose content with NO visible mark** | 19 | **15** |
| — of those, slides with NO alarm either | not measured | **9** |
| Layouts broken (failure mode 4a) | 0 | 0 |
| `<li>` bullets lost (failure mode 4c) | 74 | 74 |
| SVG `<text>` / `<svg>` figures deleted | 0 | 16 / 3 |
| running `<footer>` bands deleted | 0 | 7 |

**Rule 4c does NOT hold, 74 times over.** `guard.mjs`'s text-block test rejects
only `grid` and `flex`, so `display: list-item` passes it: measured, **all 74
clamped `<li>` elements lost their bullet**, the exact defect §4c names. The
prototype also clamps `<strong>`, a `<td>` and SVG `<text>`. An earlier draft of
this section told the reader 4a was "the only rule here that survived contact"
without mentioning that another rule is broken on every list item the guard
touches.

**The 4a rule holds.** Across 81 stressed slides and every component in the
catalog, neither version turned a grid or flex layout into a `-webkit-box`. The
"only trim a text block" rule does its job, and it is the only rule here that
survived contact.

**v2's defect: the mark exists and nobody can see it.** Failure mode 4d occurs on
**19 of 81** slides, across 17 components. The guard clamps an element sitting
wholly below the visible box: content cut, ellipsis in the DOM, nothing on screen.

**v3's defect is worse, and it is the one I introduced.** The reach-back rule —
when the crossing block sits below the edge, walk back to the last visible block,
cut that one, and hide what follows — takes the off-screen-ellipsis count from 19
to 2 and raises the fix rate to 65%. It does that by setting `display: none` on
**82 elements** across the gallery, and on **13 slides** the result is content
removed with no ellipsis anywhere and, per §3, no alarm either. Among them
`statute-stack` (8 elements) and `authority-chain` — the legal components whose
text §6 classes `never`.

**Three of my own detectors were wrong, each in the direction that flattered the
result.** The first 4d detector asked whether a clamped element's content exceeds
its box — true of every trim — and reported 0 where there were 19. The 4a detector
counted an `inline-flex` chip as a layout child and reported a break the render
cleared. And the corrected 4d detector still only looked at *clamped* elements, so
it scored v3 as a large improvement while v3 was deleting 82 elements outright;
that is how "19 → 2" got written down as a fix. Each number looked plausible, each
was checked only by the person who wanted it to be true, and the third survived
into a committed draft of this note.

**What this changes.** The ruling stands — TRIM, selective, default-off — but the
note can no longer claim the hard part is done. The decline path is not a polish
item and the reach-back shortcut is not available: hiding content to make room is
the failure, not the fix. An implementation must either place a visible mark or
leave the honest clip, and it must emit its own signal (§3) because the existing
probe cannot see what it removed.

## 3. The alarm survives a CLAMP and is blind to a DROP

**The first draft got this wrong, and it was the note's strongest claim.** It said
the existing alarm cannot be disarmed by a guard, and called that "the single
strongest argument that the idea is buildable here." That holds for one of the two
things a guard does and fails for the other.

`probeContentClipped` (`lib/core/overflow-probe.js:876`) exists to catch text lost
with **no geometric spill to see** — its own header names an ellipsis and a
line-clamp as the cases it is for. It works by walking text nodes and measuring
their **Range client rects** against clipping ancestors.

That mechanism decides everything:

| What the guard does to the text | Does it still generate boxes? | Does the alarm see it? |
|---|---|---|
| **Clamp** (`-webkit-line-clamp`) — lines laid out, painted away | yes, `scrollHeight` still exceeds the box | **yes** — measured on fix-me p3/p5 and marker-corner p3/p4 |
| **Drop** (`display: none`) — the element generates nothing | **no: zero client rects** | **no. Nothing to measure, so nothing to report.** |

Measured on `examples/README.md` with the v3 prototype, which does both:

```
clamped:  LI  lines=2  h=64  scrollH=64   <- budget equals content: nothing cut, no ellipsis
dropped:  P   display:none  rects=0       "To render one by hand: node lattice-emul..."
dropped:  P   display:none  rects=0       "Note for tooling: this file is prose, no..."
over: false   cut: false
```

Two whole paragraphs gone, both channels silent, and the slide renders looking
finished. This is not a bug in one prototype. **Any TRIM that drops rather than
clamps is invisible to the existing probe by construction**, and a guard that only
ever clamps cannot recover the height of content that does not fit at all — which
is exactly why the drop path exists.

**So the property this note leaned on has to be built, not inherited.** A TRIM
implementation owes a signal of its own: the guard knows precisely what it removed,
so it should record that on the section and the marker should read it, rather than
hoping a geometric probe re-discovers a loss the guard was careful to erase.

**And the consequence for the ratchet reverses.** The first draft warned that every
strict slide would light the content-cut channel and move `overflow:check`'s
baseline upward. Measured, the risk runs the other way: `examples/README.md` is in
`test/integration/overflow-baseline.json` today and reports clean after the guard,
so the ratchet would be blessed *downward* on a deck that now loses content in
silence. A ratchet that counts a silenced alarm as an improvement is worse than no
ratchet.

---

## 4. Four failure modes, each measured, each producing a rule

Every one of these was a real render, not a hypothesis. They are the invariants
any implementation has to obey.

### 4a. Trimming a layout container destroys the layout

The first version clamped the `<ul>` that IS the card grid. `-webkit-box`
replaced `display: grid`, and a four-up grid collapsed into one column with the
right half of the slide empty.

> **Rule.** Only ever trim a TEXT BLOCK — an element laid out as a block whose
> child boxes are all inline. Never a grid or flex container.

### 4b. Trimming a container of block children clips with no ellipsis at all

Clamping a box whose children are blocks (a heading plus two paragraphs, or a
`<ul>` wrapping one long `<li>`) cuts geometrically and draws nothing. Measured:
the box ended mid-line, no "…" anywhere. The ellipsis is placed on the clamped
box's own last line box, and a box whose children are blocks has none.

> **Rule.** Trim the innermost element that directly contains the text.

### 4c. Trimming an `<li>` kills its bullet

`display: -webkit-box` replaces `display: list-item`, so the marker disappears.
Visible in the comparison panel: the trimmed second bullet lost its dot while
its sibling kept one.

> **Rule.** The trim goes on a wrapper inside the item, not on the item.

### 4d. The worst one — a trim can hide content and mark nothing

**Measured at 19 of 81 stressed slides, and reduced to 2 by the reach-back rule
— see §2b.** This is the dominant defect, not an edge case. On `examples/README.md` the guard clamped two paragraphs that
were already entirely below the frame edge. Both vanished from the render with no ellipsis
anywhere on the slide, because the "…" was drawn on a line that is itself
outside the visible box. The slide now looks perfect and is missing two
paragraphs. **That is strictly worse than the clip it replaced** — a sheared
paragraph at least looks wrong.

> **Rule, and it is the load-bearing one.** The cut must land INSIDE the last
> visible text block, and the rule needs a POST-CONDITION, not just a placement
> heuristic: after clamping, confirm the ellipsis's line box is actually painted
> inside the visible region, and revert if it is not. Without that, an
> implementation can follow every step, believe it complied, and paint a
> mid-glyph shear — measured on `marker-corner` p3, where the clamped `h2` is
> capped by its own layout parent well above the line the budget was computed
> for. **A guard that cannot place a visible ellipsis must decline and leave the
> honest clip.**
> **Reaching back and hiding what follows is NOT the escape**, though it looks
> like one: it trades an unseen ellipsis for silent deletion, and §2b measures
> the cost at 82 dropped elements and 13 unmarked slides.
> One more thing 4d does not cover even with the post-condition: an ellipsis is a
> mark about a SENTENCE. When a whole bullet or card is dropped, a "…" on the
> previous item reads as "this sentence continues" while the truth is "an item is
> gone". Proportionate, correctly attributed marking is unsolved here.

### 4e. And the one that is not fixable

`examples/overflow-fix-me.md` p2 stayed over by 25px after trimming, because
what does not fit is a callout BOX — its padding, its label chip, its border.
Trimming its text to a single line still leaves the box too tall.
**This observation is v2-only and does not reproduce under v3**, which fits p2 by
dropping elements. The rule below still holds on its own terms — an ellipsis
cannot recover non-text height — but the corpus no longer demonstrates it, and a
rule whose only evidence has evaporated is a rule to re-derive before relying on
it.

> **Rule.** Trimming recovers only the height that text occupies. Box-driven
> overflow is out of scope and keeps the ring.

---

## 5. Coverage — what a text guard can never reach

From a full census of all 69 components (`lib/components/*/*/*.styles.css`):

- **14 chart components carry their labels in SVG `<text>`** — bar, bullet,
  funnel, gantt, line, map, piechart, quadrant, radar, scatter, slope,
  stacked-bar, waterfall, word-cloud. CSS `text-overflow` and `line-clamp` do
  not apply to SVG text, so no CLAMP can reach a chart's own labels. **A DROP
  can, and the prototype does: measured, it deleted 16 SVG `<text>` nodes and 3
  whole `<svg>` figures — including a pie chart's every slice label and its "46%",
  "22%", "18%" percentages, which §6 classes `never`.** An earlier draft of this
  bullet said "no guard can reach a chart's own labels" full stop. That sentence
  was false, and it was the most dangerous one in the note: it is exactly what
  would let an implementer scope charts out of the guard. `display: none` is not
  `text-overflow`. Worse, those slides counted as *fixed* in §2b — the harness's
  only defect tests are invisible-clamp, layout-break and drop-without-mark, and a
  slide whose chart was deleted still carries a visible ellipsis on its prose, so
  it scored clean. Those
  components fit by their own scaling and their type floor, which is the right
  answer for a chart.
  **This is a claim about labels, not about chart slides.** A chart slide still
  has HTML around the figure — a heading, a lede, a caption, a narration block —
  and the guard trims those happily: the stress run trimmed ten elements on one
  piechart slide. So "a fifth of the catalog is unreachable" is true of the
  figures and false of the slides they sit on, which is a distinction an
  implementation has to encode rather than assume.
- **51 of 69 carry at least one multi-line prose slot** — so the single-line
  `text-overflow: ellipsis` idiom would be the wrong tool for nearly all of them.
- **One component is single-line labels only** — `contact`. The first draft said
  four, adding `logo-wall`, `obligation-matrix` and `progress`; all three in fact
  carry a multi-line prose slot (`progress` has a subtitle and its own stylesheet
  reasons about "two-line rows", `obligation-matrix` a trailing legend paragraph,
  `logo-wall` an optional caption). The doc contradicted itself on this: two of
  those three appear in §2b's list of components where the guard trimmed a block
  sitting wholly below the frame edge, which cannot happen to a component that is
  single-line labels only.
- **30 components already give their children determinate heights** (a flex
  child with `flex: 1` and `min-height: 0` in the bounded stage, or a chart
  figure pinned to 100%), 11 do so only in named variants, and 28 size to
  content. **These three and the 51 above come from one reading of 69
  stylesheets, not from a committed script**, so treat them as a survey rather
  than a gated count — an independent proxy (stylesheets carrying both `flex: 1`
  and `min-height: 0`) lands at 31 against the stated 30, which corroborates
  without verifying. The load-bearing number is the total reach, not the split. A declared per-slot clamp (section 8, option B) only engages where
  the box height does not grow with its content — so it would reach the 30
  cleanly, the 11 partly, and the 28 not at all.

So the honest coverage claim is: **a trim guard reaches HTML prose in about 55
components and nothing else.** It is not universal and should not be described
as universal.

---

## 6. Selective by role, not by component — and the default is never-trim

This is the half of the design that matters more than the mechanism.

An ellipsis on a sentence says "there is more of this". An ellipsis on a NUMBER
says something false. `$1,234,567` trimmed to `$1,23…` is not an abbreviated
fact, it is a wrong one, and it is wrong on a boardroom slide where somebody
reads it aloud. The same holds for a citation, a statutory reference, a formula,
and a line of code — where `...` is itself valid syntax in several languages.

So a slot's trim behavior is a property of what the text MEANS, and it has to be
declared:

| Trim class | Slots | Why |
|---|---|---|
| **trim** | body prose, card bodies, bullet text, notes, captions | The tail is elaboration. "…" reads correctly as "more of the same". |
| **drop** | repeated collection items (bullets, cards, timeline entries) | Dropping whole items reads better than shearing one, and the ellipsis on the last kept item stands for the rest. |
| **never** | numbers and KPI values, legal and citation text, code, math, headings, attribution | A trimmed one is a false statement, not a shortened one. These keep the clip and the ring. |

**Two entries in that table were unreachable when it shipped**, and a second
review found them by enumerating what the classifier can actually return and
diffing it against the table. `attribution: never` protected nothing — an
attribution line rendered as a plain `<p>` inside a blockquote classified as
`prose` and was trimmable — and `note: trim` was dead in the other direction.
Both are now produced by `trimRoleOf`.

**And the rule applies to the TAIL, which the tag does not see.** §6's argument
against trimming code is an argument about what the cut removes, so a `<p>` ending
in `<code>--with-a-long-flag</code>` is the same case wearing a prose tag. A block
carrying inline code, a `<cite>` or math is now its own `mixed` role, classed
`never`. That is deliberately over-broad — a paragraph with one inline `<code>`
early on becomes untrimmable and the slide rings instead — which is the direction
the asymmetry below already commits us to.

**An unclassified slot defaults to `never`.** A guard that trims a slot nobody
classified is one bad default away from putting a wrong number on a slide, and
the failure is silent by construction — the deck looks better than the truth.
The cost of that default is that `guards: strict` does less on day one and
earns coverage component by component, which is the correct direction of travel.

The three headline questions, answered directly:

- **Can it be universal?** No. Universal over prose; a no-op over SVG charts;
  refused over numbers, law, code and math; powerless against box overflow.
- **Does it survive on all components?** Not yet demonstrated, and this answer
  has been wrong twice. The 65% figure an earlier draft quoted here belongs to
  the prototype §2b and §4d **disavow** — the one that deletes charts, bullets and
  footer bands. The rule-abiding rate is the §2a corpus number, **1 of 6**, and
  the gallery's ~54% under v2 comes with an invisible mark on 19-21 slides in 81.
  It survives the catalog only in the sense that it does not break layouts.
- **Everything or selectively?** Selectively, by declared slot role, defaulting
  to no.

---

## 7. What this contradicts, stated plainly

Five written rulings point the other way, and a sixth precedent points here.

- `design/forms.md:477` rejects a fade at the cut on three grounds and concludes
  "the honest pair for a fixed page is **clip** + **ring**". An ellipsis shares
  the second ground (it hides authored content) and escapes the third (no alpha
  gradient in the PDF).
- `2026-06-22-the-fit-spine.md:131` §3, the sharpest of the four: the Fit Ladder
  is "the only four moves", "there is no fifth move", restated at `:396` as "a
  closed four-move list". TRIM is a fifth move. There is no reading in which the
  proposal and that sentence both stand.
- `2026-06-22-the-fit-spine.md:61` axiom 4: "Delivered content is never silently
  lost." A trim is not silent — the mark is on the slide and both probes still
  report — but it is lost.
- `2026-09-01-autosplit-splits-on-structure.md` — **the most recent and most
  directly analogous, and it was missing from this list until the trio found it.**
  Six days before this note ruled *for* a measured pass, that one removed
  autosplit's measured trigger, on grounds that transfer intact: ":44" the page
  count "became a property of the renderer"; ":55" "Only a browser could answer
  the question. `lint:deck`, the authoring surface, the agent kit and the Studio
  could not say what a deck would become." A measured trim is worse on the first
  count, not better: it makes **the words on the slide** a property of the
  renderer, and `lint:deck` cannot tell an author which sentence a reader will
  see. §10's open problem 4 reduces this to a timing detail. It is not a timing
  detail; it is the same argument this repo accepted a week ago, and the
  measured-versus-declared fork was not argued against it.
- `2026-07-22-structure-derived-split-patterns.md:315` (the `never "…"` is at
  `:317`): overflow is "always more slides, or the honest ring … never '…'".
  A prior review round weakened this citation by noting that ":317-319" makes the
  guarantee conditional on `autosplit: on`. **That weakening is stale and is
  withdrawn here.** `autosplit:` was RETIRED on 2026-07-29
  (`2026-07-29-autosplit-is-not-a-toggle.md`, shipped; `lib/authoring/lint-core.js:257`
  emits `autosplit-retired`), and splitting now fires unconditionally at
  `square`/`tall`/`strip`. So the "never '…'" ruling is **less** conditional than
  the note claimed, not more — it opposes TRIM harder. A review round made this
  note less accurate, and the correction is recorded rather than silently applied.
- Against those: `2026-07-27-footer-band-allocation.md:193` records the owner
  signing off on exactly this trade for the footer, with the survival numbers
  measured, and the note says explicitly that a future reader will assume it was
  an oversight and that it was not. The engine ships an ellipsis in five places
  today, each decided case by case.

So the proposal is not novel in kind. What is new is making it a **deck-wide
author-selectable policy** rather than five local judgments — which is precisely
why it is the owner's call and not a routine change. Adopting it means adding a
fifth move to the Fit Ladder, TRIM, sitting between SPLIT and FLOOR — which means
editing the ladder's own "there is no fifth move" and axiom 4, not just noting
that they disagree.

One more altitude question comes with it. `overflow-marker:` shipped as front
matter for exactly one commit and was moved out
(`2026-07-30-overflow-marker-register.md:85`) on the argument that overflow
presentation is a property of the RENDER TARGET, not of the deck — same as
`autosplit:`. `guards:` asserts the opposite for a neighboring question. Both
answers are defensible; they cannot both be the house rule.

---

## 8. The forks

1. **Is TRIM admitted to the Fit Ladder at all?** If yes, `forms.md` §6 and the
   spine's axiom 4 get edited in the same change, not contradicted quietly.
2. **Measured or declared?**
   - *Measured* (what was tested): one pass after fonts settle, adaptive, cuts
     exactly at the frame, ~6ms per deck. Costs a measure pass on every render
     path, and it is invisible to export-to-Marp, which has no such pass.
   - *Declared*: `line-clamp: N` per component slot in the component's own CSS,
     N chosen for the box at design time. Pure CSS, deterministic, works on every
     path with no measurement — but only engages where the box height does not
     grow with its content, which the census puts at 30 components cleanly and 11
     partly. Note the *adaptive* variant of this (§1 row c) is not on the table at
     all: it renders an ellipsis in Safari and a hard clip in Chrome and Firefox.
   - *Both*: declared budgets carry the fixed-geometry cases; the measured pass
     covers the rest. Two mechanisms for one concern is a HARD RULE #1 smell and
     needs an answer before, not after.
3. **Deck register or export setting?** Section 7's altitude question.

## 9. Recommendation

Admit TRIM, measured, selective, default-off, with `never` as the default trim
class — and treat section 4d as the acceptance test rather than a detail.

**The original recommendation rested on a claim that did not survive review**: that
the alarm already survives the guard for free. It survives a clamp and is blind to
a drop (§3), so the signal is work, not a gift. That does not sink the proposal —
the guard knows exactly what it removed and can say so — but it moves the cheapest
part of the design into the build.

The thing worth NOT doing is shipping a universal `strict` that trims whatever it
finds, and the second thing worth not doing is hiding content to make room. Both
were measured here, and both produce the same artifact: a slide that looks correct,
has lost content, and has nothing on it to say so.

---

## 10. Ruling (2026-09-07)

The owner settled all three forks in one round. Recorded here so a future
session does not re-open them.

| Fork | Ruling |
|---|---|
| Is TRIM admitted? | **Yes — selective, default-off.** A fifth Fit-Ladder move between SPLIT and FLOOR. It fires only on slots declared trimmable; an undeclared slot never trims. |
| Where does the line budget come from? | **A measured pass**, the one tested here. Declared per-slot CSS budgets were considered and not taken: the census puts their reach at 30 components cleanly and 28 not at all. |
| Deck register or export setting? | **A deck front-matter register**, `guards:`. This overrides the 2026-07-30 ruling that overflow presentation belongs to the render target, for this key. That note needs amending in the change that ships `guards:`, not working around. |

**What the ruling commits us to, beyond the register itself.** Five canonical
statements now say something different from what the engine will do, and each
gets edited in the same change that ships the code, never after. **A fifth move
is already spoken for:** `2026-06-25-retire-landscape-locks-portrait-everything.md`
proposes RESHAPE between SHED and SPLIT and is partly implemented
(`test/unit/core/carousel.test.js:342`), so TRIM at "between SPLIT and FLOOR" would
be the **sixth** move, and whoever edits "there is no fifth move" collides with a
pending amendment inserting a different one. An earlier draft of this list cited
that note as reading the ladder as four moves. It does not.

- `design/forms.md` §6 — "the honest pair for a fixed page is clip + ring" gains
  a third member, and the fade rejection stays (its PDF-transparency ground still
  holds and an ellipsis does not share it).
- `2026-06-22-the-fit-spine.md` §3 — **the most directly contradicted text in the
  tree, and missing from the first draft of this list.** `:131` heads it "the only
  four moves"; `:133-135` says "exactly four … there is no fifth move"; `:396-397`
  restates it as an invariant, "a closed four-move list". Admitting TRIM edits
  that heading, that sentence and that invariant, and
  `2026-06-25-retire-landscape-locks-portrait-everything.md:36,101` reads the
  ladder as four moves too. Whoever ships the code owns all of it.
- `2026-06-22-the-fit-spine.md` axiom 4 — "delivered content is never silently
  lost" becomes explicit that a TRIM is not silent: the mark is on the slide and
  `probeContentClipped` still reports it.
- `2026-07-22-structure-derived-split-patterns.md:315` — "never '…'" becomes
  "never '…' without an author asking for it".

**TRIM's stated slot does not work, and the note never mentions why.** The ladder
is ordered — each move fires only when the cheaper one above is exhausted — so
"between SPLIT and FLOOR" defines TRIM by SPLIT. But SPLIT is **family-gated to
`square`/`tall`/`strip` and never fires at `wide`** (the fit spine §3: at `wide`
overflow is a layout defect and pagination produces a worse artifact than the
clip). At `wide` — the boardroom default — TRIM would be the **first and only
content-losing response to overflow**, in exactly the box where this repo ruled
the author owns the fix. This note contains no occurrence of `wide`, `square`,
`tall`, `strip` or `family`.

**Nothing in the four rules requires the guard to achieve fit.** Measured on this
note's own corpus, v2 cuts content on `overflow-fix-me` p2 and `README` p1 and
leaves both still clipping — content destroyed AND the ring still on, worse than
either outcome alone. Gallery-wide that is 46 of 98 touched slides under v2, 27 of
98 under v3. §4d's post-condition asks only whether the ellipsis is painted, never
whether the cut helped. A revert rule is missing.

**§6's `drop` class contradicts §4d and §9 in this same document.** §6 justifies
`drop` with "the ellipsis on the last kept item stands for the rest"; §4d refutes
exactly that reading; §9 says not to hide content to make room. `drop`'s only
mechanism is `display: none`, which §3 measured as invisible to the alarm. Three
sentences that cannot all stand.

**`guards: strict` composes with an existing setting into total silence.**
`overflow-marker:` is a render-target setting with an `off` value. A deck carrying
`guards: strict` exported with `overflow-marker: off` has no ring (it fits), no tag
(setting), and no content-cut alarm (drop-blind): three channels off by
configuration, no bug required.

**The acceptance test is section 4d**, not the happy path. An implementation
that cannot place a visible ellipsis at the cut must decline and leave the
honest clip. A slide that looks finished and is missing two paragraphs is the
one outcome that is worse than the clip this replaces.

**One claim was corrected after the ruling, and it did not move it.** The first
draft asserted that CSS cannot clamp to available height at all. Re-measured in
Firefox 155 and WebKit 26.6 before merge, that is false in WebKit: a length-ratio
line count parses and renders there, with the ellipsis in the right place. The
ruling stands, and for a better reason than the one first given — a CSS-only clamp
would ellipsize in Safari and hard-clip in Chrome and Firefox, so it is a
portability trap, not a missing feature. Recorded rather than quietly fixed,
because the pattern is the point: the flat claim survived a first pass and one
browser, and died on the second engine it met.

**Open before implementation — surfaced by an independent review of this note,
after the ruling.** None of these changes the ruling; all of them are load-bearing
for building it, and the note previously implied the first was already solved:

1. **The signal — CLOSED BY CONSTRUCTION, and the reasoning is worth keeping.**
   The worry was that a guard which makes overflow invisible would let
   `overflow:check` be blessed downward on a deck that lost content. That risk
   lived entirely in the DROP path: `display: none` generates no client rects, so
   `probeContentClipped` cannot see it. **The implementation has no drop path** —
   it clamps or declines, never removes — and a clamp leaves its lines laid out,
   which is exactly what that probe reads.
   Measured on both trimming decks: every trimmed page is reported by the existing
   content-cut channel (`overflow-guards.md` p2, `overflow-fix-me + strict` p3),
   and the corpus ratchet counts a trimmed slide as clipping. A trim is never
   silent. TRIM also stamps `data-lattice-trim` and the export prints a
   `✂ TRIMMED` line naming the pages, so the record exists independently.
   **It reopens the instant anything removes an element from layout.** If a future
   change reintroduces a drop — a shed, a collapse, a `display: none` — the alarm
   goes blind again and the record becomes load-bearing rather than corroborating.
   That is the invariant to defend, not the current green.
   *(The first measurement of this claim was vacuous: the harness read stdout while
   the emulator writes these warnings to stderr, so every channel came back empty
   and the check "passed" having seen nothing. It now carries an anti-vacuity guard.
   Recorded because it is the same defect shape as the three detectors above, found
   for the fourth time.)*
   **The record has a hard mechanical constraint:** `lib/core/overflow-probe.js`
   is `.toString()`-injected into `page.evaluate` and the emulator's inline
   watcher, so everything it needs must travel inside its own source. The trim
   record cannot be a closure or a module import.
2. **The post-condition on the mark** (§4d), and what the guard does when it
   fails — which is decline, not reach back.
3. **Column selection.** In a multi-column layout "the block that crosses the
   edge" is ambiguous; the prototype picks by document order and cut an innocent
   caption while the real offender stayed whole (`overflow-fix-me` p5). None of
   the four rules mentions this.
4. **Determinism.** The pass must state when it runs relative to font settle. The
   corpus numbers moved between prototype versions and the note carried the stale
   set into a committed draft.
5. **Slot classification ownership** — who assigns a trim class, and what catches
   a wrong one. A slot wrongly marked `never` is inert; one wrongly marked `trim`
   is the silent-wrong-number failure §6 exists to prevent, and nothing proposed
   here detects it.
6. **Export-to-Marp, and the harm inverts.** An earlier draft of this list said
   the path "has no measure pass" and that degrading to no guard was the
   defensible answer. **That was false.** `lib/core/marp-bundle.js:50,177` copies
   and script-tags `dist/lattice-runtime.min.js`, and `lib/runtime/index.js`
   re-measures on font settle and on every resize — so a bundle carries the
   runtime and would carry the guard with it. The problem is not adding the guard
   to that path; it is that the trim would run **in the recipient's browser, at
   their window size, with no author present and no record of what was removed**.
   The question to answer is how to suppress it there, not how to add it. This is
   the same class of accident `2026-07-30-overflow-marker-register.md` already had
   to fix once, when the bundle inherited the runtime's authoring default by
   accident.
7. **`kanban` already ships a declared 2-line clamp on a title** — a live instance
   of the option §8 calls untried, on a slot §6 classes `never`. `guards:` owes it
   a ruling.
8. **The trim mutates the DOM that every export serializes, and it leaks into
   surfaces with no fit constraint.** `lib/export/player-core.mjs` projects the
   baked section DOM through `projectDeckToProse`, and `projectGeneric`
   (`lib/transformers/prose-projection.mjs:137,284`) emits `el.outerHTML` with
   inline styles preserved. So a clamp computed for a 1280x720 slide box rides
   into the player's **Read / Article** view — a scrolling prose column with
   unlimited height and no fit problem at all — and a dropped element rides in as
   `display: none`. The reader who switches to article view precisely to read the
   full text gets the truncated text. Name every surface that must strip the trim
   before it ships.
9. **The propagation problem the register inherits.**
   `2026-07-30-overflow-marker-register.md` did not rule on taste; it gave
   reasons, and its second one applies harder here: a re-export carries the
   baked front matter forward, so `guards: strict` set once for one board meeting
   becomes a permanent property of every deck derived from that bundle — and
   unlike `overflow-marker:`, this key removes text. §10's third row overrides
   that note in one line without answering it.

10. **The `.html` deliverable does not carry the trim, and the PDF does — SETTLED
    (2026-09-13), and the measurement moved the answer.**
    `lattice-emulator.js` writes `outHtml` from `cleanDocHtml`, a Node-side string,
    BEFORE the page is ever loaded; every browser pass — including this one —
    mutates the live DOM instead. So a `guards: strict` deck exports a PDF whose
    page ends in an ellipsis and an `.html` sidecar beside it that still clips. The
    two disagree, which is the class of defect `engineering/gotchas/overflow.md`
    already catalogues for the marker.

    **Three things were measured before deciding, and two of them were not in the
    problem as written.** Opened in real Chromium at 1280x720:

    | deliverable | carries the trim? |
    |---|---|
    | `.pdf` / `.png` / `.pptx` | yes — rasterized from the live DOM |
    | `--player` `.html` | yes — baked from `inflatedPlayerHtml`, a capture of that DOM |
    | `--fluid` `.html` | **yes** — the viewer inlines the runtime, which re-measures and re-trims at OPEN |
    | plain `.html` sidecar | no |
    | `-o deck.html` | no — **and it is the whole run** |

    So the scope is one file, not "the HTML export": the fluid viewer already solves
    this, by re-measuring rather than by carrying a baked clamp. And the `-o deck.html`
    case is worse than a sidecar disagreement. On `examples/overflow-guards.md` the
    console printed `TRIMMED … pages 2` for a run whose only artifact has no trim in
    it, and the `OVERFLOW` line — measured off the trimmed DOM — left page 2 off a list
    the written file belongs on. The tool asserted the opposite of what it had done,
    about the only file it produced, and the one channel that could have contradicted
    it agreed with it instead. That is not a divergence to document, it is rule 5 ("fit
    or change nothing") violated at the ARTIFACT level: a cut that reaches no
    deliverable is not worth its cost.

    **The ruling.** The guard is SKIPPED when the `.html` is the deliverable and
    neither `--fluid` nor `--player` is set, and says so; a PDF export keeps the trim
    and WARNS that its sidecar does not carry one. Exported bytes are unchanged for
    every deck — the `.html` never had the trim, so declining to compute one removes
    nothing from it — which is why this did not need the Quality Bar export sign-off
    the problem anticipated.

    **Re-serializing the export HTML from the live DOM is still not taken, and the
    reason is no longer just its blast radius.** `-webkit-line-clamp` is a fixed line
    count, and the `.html` is a document the reader can open at any size: a clamp
    computed at 1280x720 is wrong the moment someone resizes the window. Re-computing
    it there instead is precisely what open problem 6 argues against for
    export-to-Marp — a trim running in the recipient's browser, at their window size,
    with no author present and no record of what was removed. **Open problems 6 and 10
    ask for opposite things**, and 6 is the one with the reasoning behind it. `--fluid`
    is the sanctioned form of "trim at the reader's size", opt-in and announced.

    **THE INSTRUMENT THAT WAS MISSING, which is the more useful half.** Every other
    instrument this feature has reads the LIVE DOM — the metamorphic relations model
    it, the adapter test measures it in real Chromium, the 169-deck sweep diffs PDF
    bytes rendered from it. Nothing ever opened a WRITTEN `.html` and asked whether the
    trim was in there, so a whole deliverable could be untrimmed in plain sight and no
    arm could see it. `test/integration/parity/guards-trim-deliverables.test.js` is that
    arm: it renders the real deck three ways, opens each written `.html` in real
    Chromium, and pins the pair — the `.html` deliverable carries no trim AND the
    console neither claims one nor hides the clip; the sidecar carries none AND the
    console declares that; `--fluid` DOES carry it and trims the same page the PDF did.
    The third arm is what stops the first two from being a test of "trim never works".

**AN INDEPENDENT REVIEW OF THE CODE FOUND A REAL CORRECTNESS BUG, and it was the
one the design spends its length preventing.** Recorded because the pattern is the
finding: the NOTE had six review passes, the CODE had none until it was asked for.

- **`applyTrim` could clamp the wrong element, including a never-classed one.**
  `measureTrim` minted `data-trim-id` from a counter that reset per box while the
  section walk also descended into the clip cells, so two elements shared an id and
  the lookup took whichever came first in document order. Reproduced: a plan naming
  a paragraph clamped an `<h2>`. That is rule 3 violated in the DOM without
  `planTrim` ever proposing it, on any section with a clip cell — the common case,
  not a corner. Fixed with one id counter per section, a stamp-once guard, and a
  walk that does not descend into a box measured separately.
- **The planner ignored a block's top padding and border**, so its clamp did not
  fit its own box. Measured 26px still over on a card body with 30px padding.
- **The reflow simulation assumed a single column.** A scalar shift credited one
  column's recovery against another, declaring a two-column box fitting while the
  second column still overflowed by 160px. Recovery is now per block, and only
  blocks strictly above one another displace it.
- **The relations could not have caught any of them**, and the reason matters more
  than the bugs: the generator built every block as exactly the planner's own
  height formula, so `linesBefore` was exact by construction; it never emitted
  overlapping blocks; and the test's "independent" oracle re-stacked blocks with the
  same single-column assumption the planner had. An oracle that shares the code's
  assumption is not an oracle. The generator now emits realistic padding and
  multi-column shapes, and the oracle models layout physics rather than the policy.
- **Every one of those is now mutation-proved**: re-introducing each defect turns
  the suite red. Two took several attempts, and the last one only fell once the
  test BUILT the padded condition instead of hoping a deck produced it.

**That cold-start item is now SETTLED, mechanically rather than by run count.**
125 renders produced byte-identical PDFs and identical stderr, under conditions
that were genuinely cold — `drop_caches`, `/var/cache/fontconfig` removed, a fresh
Chromium profile (the first render then took 4.39s against 1.4s warm) — plus
16-way parallel, single-CPU pinning against four spinners, the built `dist/`
bundle, a clean `git archive` tree, and two historical commits. A negative control
confirmed the revert detector fires when a revert is forced.

The count is the weaker half. **The barrier is in the code**:
`lattice-emulator.js:3360-3365` awaits `[...document.fonts].map(f => f.load())` and
then `document.fonts.ready`, unbounded, before MEASURE runs — the explicit
force-load covering faces only later slides use, which `fonts.ready` alone skips.
Proved by serving the deck's 17 faces through a 1.5s-per-font local server: an
unbarriered measure gives `contentBottom 1616.78` and a 15-line wrap, both the
`load` barrier and the force-load give `1548.78` and 13. An unsettled measurement
really does produce a different model, and the barrier really does stop it. There
is also no warm Chromium state to differ from — `puppeteer.launch` passes no
`userDataDir`, so every run gets a fresh temp profile.

The most likely explanation of the original observation is a working tree rather
than a race: `lattice-emulator.js:3444-3450` records that p4 was once "trimmed AND
still overflowed", which is exactly a `TRIM REVERTED` on this deck. Under every
committed state p4 declines at plan time with `mark-would-be-invisible`.

**Three settle holes DO exist, none reachable by this deck**, and they are recorded
rather than closed: a deck-authored deferred script is counted at `:3203` and warned
about at `:3747` but never awaited; `settleDeferredMedia` is bounded at 10s
(`:3252`); and the runtime path measures on possibly-fallback metrics in its boot
sweep and corrects after a 2s-bounded `settleFonts` (live preview only).

**A SECOND INDEPENDENT REVIEW, of the corrected code, found four more shipping
bugs.** The pattern from the first review repeated exactly once more: every one of
them was in the half nothing exercised.

1. **The guard shipped a sheared card and switched off the alarm about it — the
   defect this whole note exists to prevent.** `planBox` computed the box's content
   bottom as a max over the TEXT BLOCKS it could classify, discarding the measured
   truth. `measureTrim` classifies innermost text blocks, so a card's own bottom
   padding and border are invisible to it: on p2 of the demo deck the model said
   1531.5 and `scrollHeight` said 1548.8. The planner cut against the smaller number,
   the clamp landed 17px short, and the card ended 8px outside its clip cell — enough
   to shear its bottom border and both rounded corners. Because 8px is also inside
   the overflow probe's slack, `guards: strict` then REMOVED page 2 from the OVERFLOW
   warning while leaving it pixel-identical to the untrimmed render. Verified by
   rasterizing both at 300dpi: the strict and loose renders had the same fill runs.
   The slide's own body text reads "the reader sees a finished card rather than a
   sheared one." The fix plans against an EFFECTIVE limit — the real limit less the
   measured tail below the deepest block — and the same slide now cuts to 6 lines
   instead of 7 and measures 0px over. A second, smaller half of the same bug: the
   loop exited as soon as the residual fell under `TRIM_TOLERANCE`, the alarm's
   measurement slack, which is not the same question as "does it fit". Entry
   tolerance and exit target are now separate constants (`FIT_EPSILON`).
2. **The export's revert could not find a block carrying an author `id`.**
   `applyTrim` resolved an id two ways; the emulator's revert loop open-coded only
   one. A failed trim was therefore kept AND reported as a success under "Those
   slides FIT". Resolution is now one kernel function, and the verdict is
   re-measured rather than inferred from leftover marks.
3. **An author `id` containing `"]` aborted the entire export.** The selector was
   built by string concatenation; `querySelector` threw `SyntaxError` and no PDF was
   produced. The finder now compares the attribute instead of building a selector.
4. **The trim rode into the player's Read view**, an unbounded scrolling column with
   no fit problem, so a reader who switched to it precisely to get the full text was
   handed the seven-line truncation. Open problem 8 predicted this surface and
   nothing stripped it. And `data-trim-id` was stamped on every text block of every
   strict slide INCLUDING ones that fit — contradicting MR4's own premise — while
   `data-trim-prior`, a JSON blob of prior inline styles, shipped inside every
   `--player` artifact. Stamping now waits for the overflow check, `finalizeTrim`
   strips the scaffolding on export, and `#lp-article` un-clamps what survives.

**Three more, smaller:** the runtime reverted the whole SECTION where the export
reverted per BOX — the kernel was single-sourced and the POLICY was not, so the same
split-layout deck trimmed in the PDF and reverted in the live preview (HARD RULE #1);
`attribution: 'never'` and `note: 'trim'` sat in the role table unreachable, so an
attribution line classified as trimmable `prose`; and `findUnknownGuards` used a
`$`-anchored regex, so `guards: strct  # for the board pack` resolved to the baseline
with the lint that exists to catch it staying silent — the exact failure mode
`resolve-guards.js`'s own docblock warns about by name.

**What the tests could not catch, and what changed.** `trimRoleOf` — the function
that decides which text may be cut, the entire safety property — could be replaced
with `return 'prose'` and all 28 tests stayed green; its only reference computed a
role from `trimRoleOf` and compared it to a role `measureTrim` produced from
`trimRoleOf`, which can catch a wrong element and never a wrong table. The corpus
generator made every box's `contentBottom` exactly its deepest block, so the tail
that caused bug 1 could not appear. MR6 asserted rule 4 without the padding terms
the rule actually uses. The fixture's docblock claimed the oracle was "independent"
and modeled "physics, not policy" while re-encoding two of the planner's expressions
verbatim; that claim is now corrected in place rather than defended. The adapter's
"idempotent on a real slide" test never called `applyTrim` at all, and nothing
anywhere exercised the revert — despite the adapter file's own header saying it did.

The corpus now emits tails and a trimmable-weighted role draw, and derives each
box's limit from its content rather than an independent draw (the old distribution
put 107 of 254 declines on `mark-would-be-invisible` and produced 34 clamps across
300 seeds; it now produces 87). MR3's exit target is `FIT_EPSILON`, MR6 carries the
padding terms, MR13 asserts the clamped BORDER box, and MR14 is a new effectiveness
canary — the arm every other relation is blind to, because rule 5 discards a
declined box's actions and so hides any slip that turns fits into declines.

**Mutation results, re-run against the corrected code.** Five of six die:

| mutation | verdict |
|---|---|
| plan against the deepest block, ignoring the tail (**the shipped bug**) | killed — metamorphic |
| exit at `TRIM_TOLERANCE` instead of `FIT_EPSILON` | killed — metamorphic |
| `Math.floor` -> `Math.ceil` on the line budget | killed — both tiers |
| drop the bottom-padding reserve | killed — metamorphic |
| `trimRoleOf` returns `'prose'` for everything | killed — adapter |
| weaken rule 4 to `textTop >= limit` | **survives** |

The survivor is reported rather than papered over, and measured rather than
argued: it changes 87 clamps to 88 and produces zero bad fits and zero invisible
marks across the corpus. Rule 4 is **subsumed** by the fit test now that the exit
target is real fit — a clamp whose mark would be invisible leaves its block's bottom
past the limit, so the fit test refuses it anyway. Rule 4 stays as an explicit early
decline with a named reason, and as defense in depth if the exit ever loosens. No
test was manufactured for it; a relation that cannot fail is worse than an honest
gap.

**A THIRD INDEPENDENT REVIEW REFUTED THE FIX ABOVE.** The record is now three
passes and three crops of shipping bugs, each found in code the previous pass had
already corrected, and that pattern is the most useful thing in this note.

1. **The sheared card and the false FIT both reproduced, on a two-up layout.** Two
   causes, both introduced by the repair. The `tail` was ONE GLOBAL SCALAR taken
   from the deepest text block, so chrome belonging to any other vertical stack in
   the same clip cell was invisible to it — the comment claiming it "over-reserves…
   the safe direction" was simply false for that shape. And the post-apply VERIFIER
   still read `TRIM_TOLERANCE`: `planBox`'s exit was tightened to `FIT_EPSILON`
   while the one gate that catches model error went on certifying any residual under
   12px as a fit. The defect was not fixed, it was moved one function along. The
   export printed "Those slides FIT… the frame check below reports them clean" with
   the frame check on the NEXT LINE naming that same page, and destroyed 22 lines of
   copy doing it.
2. **A `data-trim-id` collision reopened, one level up.** `idSeq` restarts at 0 on
   every `measureTrim` call while a stamped element keeps its id across sweeps and
   `clearTrim` does not remove it — so on the runtime's next incremental sweep a new
   paragraph was minted at index 0 onto an id an existing element already held.
   Reproduced: a plan naming a `prose` block clamped a `value` block. That is the
   first review's bug in a new door, and the deferred stamping widened the window.
3. **The Read-view rule broke list markers.** `list-item` is a trimmable role, so
   `#lp-article [data-lattice-trimmed]{display:block}` demoted a clamped `<li>` out
   of `display:list-item`: the bullet vanished and an `<ol>` stopped incrementing, so
   a three-item list read 1, blank, 2. Reproduced on this feature's own demo deck.
4. **`mixed` was shadowed by `caption` and `note`**, both of which return earlier, so
   the role added to stop an ellipsis landing on code protected neither of two of the
   four trimmable roles. The `attribution` regex accepted an ASCII hyphen, so
   `-40% year over year` inside a blockquote classified as `attribution` — `never` —
   and under rule 5 one misfire declines the whole box, making `guards: strict`
   silently inert on any quote or figure slide whose prose opens with a dash.
5. **Two claims written in the previous commit were false at that commit.** `mixed`
   changed the demo deck's p4 decline from `mark-would-be-invisible` to
   `blocked-by-mixed` — because that slide's own paragraphs quote the reason as
   inline code — so both this note and the slide's body text described behavior the
   tree no longer had. The slide is now written without inline code and demonstrates
   rule 4 genuinely again.

**What replaced the global tail.** Chrome is measured PER BLOCK, as accumulated
`paddingBottom + borderBottomWidth` over the ancestors between the block and the
box, stopping where a sibling holds a container open. Two readings were tried and
both were wrong in ways worth recording: a raw `ancestor.bottom - block.bottom`
sweeps up GRID STRETCH (a short row-mate reported 393px of chrome that collapses the
moment its tall neighbor is clamped, so the planner refused a cut that works), and
an unconditional climb to the box sweeps up a SIBLING's height (the two-up left card
credited 531px it does not own). Padding and border are neither: they are what this
block's own containers reserve below it, they move when it moves, and they are what
actually shears.

**And the verdict now uses the warning's own oracle.** `measureTrim` asks whether a
box's scroll extent exceeds its client height; `probeSectionOverflow` asks whether
the slide exceeds its frame, and it is what prints the OVERFLOW line. A trim must
satisfy BOTH or every clamp comes off — rule 5 at the slide, distinct from the
per-box revert, and it is what the two-up case needed: every clip cell measured
clean while the frame still overflowed, so nothing was "still over" for the per-box
revert to undo. The reverted `strict` render of that deck is now **byte-identical**
to its `guards: loose` baseline, which is rule 5 stated as an artifact rather than
an intention.

**THE WHOLE-CORPUS SWEEP — the first evidence in this line of work that is not the
author marking their own homework.** Every shipped deck (169) was forced into
`guards: strict` and rendered, then rendered again at `guards: loose` and compared
byte for byte:

| | result |
|---|---|
| decks rendered | 169, **zero crashes**, zero non-zero exits |
| decks where TRIM fired | **3** — `overflow-fix-me` p3, `overflow-guards` p2, `q-and-a` p7 |
| trims reverted | **0** |
| pages both trimmed AND named in the OVERFLOW warning | **0** — the self-contradiction the third review reproduced does not occur anywhere in the corpus |
| `strict` output identical to `loose` | **166 of 169**; the three that differ are exactly the three where TRIM fired |

Two things are worth separating there. The byte-identity result is a strong safety
statement — `strict` changes nothing it does not deliberately change, at artifact
level, across the whole corpus — and it is the artifact-level form of MR4, which
until now was only asserted over a model. The zero-crash result matters more than it
looks: the third review found an author `id` containing `"]` could abort an export
outright, and a corpus sweep is the cheapest instrument that would have caught a
survivor of that class.

The fire rate is the other half and it is not new: **3 of 169 decks**, consistent
with §2a's 1-of-6-clipping-slides. The blocks that most often cause overflow are
largely the ones §6 refuses to touch. That is the feature working as designed, not
underperforming, and any future claim that TRIM "fixes overflow" should be read
against this number.

**THE LAYOUT-SHAPE CORPUS — built because the deck corpus is structurally blind.**
The 169-deck sweep is clean and *cannot* catch the class of bug this feature keeps
producing: every one of the three reviews' findings lived in a layout shape the
shipped decks do not contain. So a second corpus was built from the shapes
themselves — 27 decks across the families where the bugs actually were — and each
was rendered at `strict` and at `loose` and checked against three invariants: no
crash, no page both TRIMMED and named in the OVERFLOW warning, and byte-identity
with `loose` wherever TRIM did not fire.

Shapes: two-up flex with chrome on the left / right / both columns, three-up, flex
`justify-content: center` and `space-between`, grid with stretched row-mates, grid
with fixed rows, an absolutely positioned bottom decoration, `position: sticky`, an
author `id`, an author `id` containing `"]`, ids chosen to collide with the
synthetic namespace (`tb0`, `tb1`), nested clip cells, `line-height: normal`, a 24px
bottom border, a float container, an inline-`code` tail, an ordered list, table
cells, `transform: scale`, an image-driven height, and deep nesting.

**All 27 pass all three invariants. Zero crashes, zero contradictions, zero no-op
violations.** Ten of the first batch trimmed, five declined and changed nothing, and
`author-id-quote-bracket` — which aborted the export outright before the third
review — now renders and trims.

**One result needed a second look rather than a victory lap.** Three two-up shapes
REVERTED, which would mean the guard going inert on exactly the split layouts it
exists for. It is an artifact of the test, not the feature: those shapes join lines
with `<br>` inside one `<p>`, and `-webkit-line-clamp` shrinks the BOX without
removing descendant boxes from layout — so the `<br>`s keep reporting rects past the
frame and `probeSectionOverflow` correctly still sees them. Rebuilt as real wrapping
prose, **all five multi-column shapes trim cleanly**, including the grid-stretch case
that produced the 393px-chrome bug and a three-up. Rendered and inspected: the card
is whole — full border, both rounded corners, an ellipsis — where `loose` shears it
mid-sentence.

That `<br>` interaction is worth keeping: a clamp is a VISUAL truncation, so any
probe that walks descendant rects still sees clamped-away children. Nothing in the
shipped decks writes paragraphs that way, and the failure direction is safe (the
guard reverts and clips honestly), but a deck that does will find `guards: strict`
inert on that slide.

**A cosmetic blemish, recorded not fixed:** a clamped paragraph whose last visible
line ends in a full stop renders as `limit....` — the sentence's own period plus the
ellipsis glyph. Stripping it would mean editing the author's text rather than
clamping it, which this design refuses to do.

**THE LIVE-PREVIEW PATH IS NOW DRIVEN ON THE REAL SURFACE.** `guards: strict` ships
on two render paths, and until this point every piece of evidence in this note came
from the export. The runtime was only ever exercised by injecting
`dist/lattice-runtime.js` into an already-exported page in headless Chromium — a
proxy for the Studio, not the Studio (HARD RULE #23), and the last load-bearing claim
resting on one.

`docs/e2e/guards-trim-live.spec.ts` closes it: the real built site, the real Studio,
the real editor, the real preview frame. It pins the PAIR rather than the pixel — a
strict deck whose body overflows gets clamped in the live preview, and the same deck
at `guards: loose` does not. The second arm is what makes the first mean anything; a
single-arm test would pass just as well if the register were ignored on both sides.

**Mutation-proved, because a passing e2e test proves nothing until it can fail.**
Disabling the register in the runtime (`if (false && guardsEnabled(...))`), rebuilding
the engine and the site, and re-running turns it red; restoring turns it green with
the runtime byte-identical to HEAD. The overflow ring is deliberately not asserted
there — whether a trimmed slide still rings is the export's policy, and pinning it in
a live-preview spec would couple this test to a decision that lives elsewhere.

**Mutation, re-run after the repair — and two of the fixes were themselves
unpinned.** `chrome += 0` in the measurer and the removal of the id-collision guard
both survived the whole suite on the first pass: the model tier never runs the
measurer, and no test replayed two sweeps. Both are now covered by adapter arms, and
the corpus generator emits per-block chrome so the PLANNER's half is caught by MR3
(deleting `chromeOf` turns it red). Every mutant below now dies:

| mutation | killed by |
|---|---|
| `FIT_EPSILON` 0.5 -> 12 (the shipped bug) | MR3 + MR0 |
| planner ignores per-block chrome | MR3 |
| measurer computes no chrome | adapter |
| id-collision guard removed | adapter |
| `idPrefix` argument ignored | adapter |
| `padBottom` loses its bottom border | adapter |
| deck header band dropped from `isChrome` | adapter |
| `trimRoleOf` returns `'prose'` for everything | adapter |
| `Math.floor` -> `Math.ceil` on the line budget | both tiers |
| plan against the deepest block, ignoring chrome | MR3 |

**Four mutants that survived the whole suite are now covered**: `FIT_EPSILON`
restored to 12 (MR3 and MR13 imported the constant from the module under test, so
widening it widened the assertions in lock-step — they use a literal now, and MR0
pins the constant itself), the `idPrefix` argument ignored, `padBottom` losing its
bottom border, and the deck header band dropped from `isChrome`. Writing that test
also surfaced a latent kernel bug nothing had hit: `querySelectorAll('')` throws, so
`measureTrim` with no clip selector died before measuring anything.

**BUILT, as of this branch.** The kernel (`lib/core/guards-trim.js`), the register
(`lib/core/resolve-guards.js`), both render-path call sites, the `unknown-guards`
lint rule, the register docs and `examples/overflow-guards.md` have landed. What
the implementation added to this note's findings, both from real renders:

- **The model is a prediction, not a measurement, and it was wrong on a real
  slide.** `planTrim` guarantees fit-or-nothing over its model; applied to the
  page, `examples/overflow-guards.md` p4 came back trimmed AND still overflowing —
  precisely the outcome rule 5 exists to prevent. Both call sites now APPLY, then
  RE-MEASURE, then REVERT a cut that did not buy the fit, and report it as
  `TRIM REVERTED`. The metamorphic relations could not have caught this: they test
  the policy, and this was the gap between the policy and the DOM.
- **The measured corpus result, from shipped code:** one of six clipping slides.
  The other five are blocked by a heading, a callout's chrome, or a shell command.
- **`overflow:check` is NOT re-blessed by this branch, deliberately.** The new demo
  deck legitimately clips two pages, so the ratchet reports it — but a full sweep
  found **nine** decks clipping more than the baseline, and stashing this branch's
  changes reproduced all nine unchanged. The drift is pre-existing and on `main`,
  not caused by TRIM. `--bless` re-records the WHOLE corpus by design and refuses a
  per-deck bless, so blessing here would bury nine decks of unrelated drift under
  this change (HARD RULE #18: a pre-existing defect found off the path is logged,
  not swept into the diff). `overflow:check` is on-demand rather than a CI gate, so
  nothing is red; the baseline needs its own pass.

---

## 11. A FOURTH INDEPENDENT REVIEW (2026-09-13) — the pattern held a fourth time

Two checkers were run in parallel over the two regions nobody but the author had
read: `planBox`'s per-block chrome model with its measurer, and the emulator's
two-oracle verdict. **Both found shipping defects, and both independently found
the same one** — which is the finding worth leading with.

### The one both reviews found: the two render paths ran different policies again

`verifyTrim` did not exist. The export open-coded a per-box revert AND a
slide-level one; the runtime open-coded only the per-box half and nothing after it
reverted. `--fluid` inlines that runtime, so **the written `.html` re-trimmed at
open under a policy the export had just refused.** Reproduced on a deck whose
paragraph is joined with `<br>`: the console printed `✂ TRIM REVERTED — … they
clip unchanged`, and the delivered viewer, opened in real Chromium, carried
`data-lattice-trim="1"` with 9 of 21 lines removed **on a slide still showing the
overflow ring**. Trimmed AND still overflowing, in a shipped artifact, with the
tool asserting the opposite — HARD RULE #1 and #18 in one file.

This is verbatim the fork the third review closed for `clearTrim` vs
`clearTrimBoxes`, moved one function along: **the kernel was single-sourced and
the POLICY was not, twice.** The verdict now lives in one kernel function with both
arms and their scoping written down, and both call sites call it. Mutation-proved:
drop the frame arm from the runtime's call, rebuild, and the viewer ships the
refused clamp again.

### Every gate could see an UNDER-cut and none could see an OVER-cut

The single most useful sentence out of this pass. `planTrim`'s exit test, the
per-box revert, the frame check and the corpus ratchet all ask *does it still
overflow*. A clamp that removes twice the lines it needed to satisfies every one of
them. Three separate defects lived in that blind spot:

| defect | measured |
|---|---|
| **`transform: scale(k)` mixes coordinate spaces.** `getBoundingClientRect` is VISUAL px; `clientHeight`, `getComputedStyle` and `scrollHeight` are LAYOUT px. `docs/src/playground/deck-preview.js` scales every `<section>` by the pane width and runs the runtime in the same document. | Identical DOM, identical text: **22 lines kept at scale 1, six at 0.5, ONE at 0.35** — the author's copy shortening as a reader drags the preview pane, and the PDF showing a different truncation again. |
| **`line-height: normal` was guessed at `fontSize * 1.4`.** `parseFloat('normal')` is `NaN`. | 16px Arial, real line box 18px: the planner budgeted `floor(600/22.4)` = 26 lines where 33 fit — **seven lines destroyed, 132px of the box left empty**, both revert gates green. |
| **`round(height / lineHeight)` for the line COUNT.** | Up to half a line of phantom lift per action, credited to every block below it. |

All three are fixed by measuring instead of deriving: one scale per box, and the
block's real line boxes read from a `Range` — trusted only where the geometry is
unambiguous (every rect the same height, one uniform step apart), because a line
carrying a taller inline face is exactly the shape the computed value is already right
for.

**THE FIRST CUT OF THE SCALE FIX WAS WRONG IN TWO WAYS, AND A MAKER-CHECKER ON THE
DIFF CAUGHT BOTH.** Recorded because the pattern is now five for five: every pass on
this feature has found a defect in what the previous pass had just corrected.

- **It normalized the QUANTITY and left the THRESHOLD.** Everything was converted to
  VISUAL px while `TRIM_TOLERANCE` (12) and `FIT_EPSILON` (0.5) stayed layout-px
  constants, so the effective entry threshold became `12 / k`. Measured: a box 20 layout
  px over entered the planner at scale 1 and was **ignored at 0.5** — `guards: strict`
  going inert on the preview while the ring it exists to clear still fired. The fix
  normalizes to **LAYOUT px**, which is not a free choice: it is what
  `lib/core/overflow-probe.js` already does, for this same surface, in a header note
  that predates this work. Two kernels answering "how far over is this box?" in
  different units is the thing the whole section is about.
- **It read the scale with a `DOMMatrix` walk over `transform`,** which is strictly
  weaker than the probe's `rect.height / offsetHeight`: it returns `none` for the
  individual `scale:` property and for `zoom:` (both of which really do scale), and
  `cos θ` for a rotation. The measurer now uses the probe's expression, deadband
  included, pinned by an arm asserting the two agree.
- **And a third, from the same review:** the normalization made `contentBottom` and
  `deepestOuter` two independently-rounded floats, so at any scale that is not an exact
  binary fraction ~1e-5 landed on the effective limit and `Math.floor` turned it into a
  whole LINE. Measured at 0.7, 0.62 and 0.83. Nothing could revert it — it is on the
  over-cut axis. A deadband on the remainder and a `FLOAT_SLACK` on the budget close it;
  they overlap on the one measured shape and neither is separately pinned, which is said
  out loud in the constant's docblock rather than papered over.

**The test arm that asserts this could not see any of it**, which is the fifth
flattering detector in this note. `a SCALED slide plans the same cut as an unscaled one`
was green on all three defects, because its fixture uses `line-height: normal` — a
non-integral line box, so the budget never lands on an integer boundary where a
one-line error shows. It is now joined by a round-line-height arm at seven scales
including 0.7, 0.62 and 0.83, and by an arm asserting the model and the probe read the
same unit.

**The instrument is `test/integration/parity/guards-trim-measurement.test.js`,**
and its centre is a post-condition nothing in the tree had: *a clamp never leaves a
whole line of its box empty.* It is mutation-proved against all three defects plus
a deliberate two-line over-cut as a control — and the control earned its place,
because the FIRST version of that arm measured empty room as
`clientHeight - scrollHeight`, which can never be positive, and passed all three.
A relation that cannot fail is worse than an honest gap; this note has now said
that about its own tests four times.

### `shiftOf` credited one column's recovery to another

`other.bottom <= b.top` is a VERTICAL-ORDER test, not a same-flow test: a block in
a different column that merely ends higher satisfies it. On a real two-up the left
card's 28px of recovery was credited to the right column's second paragraph, which
was budgeted two lines where one fits, and the box `planTrim` had declared FITTING
came back **16px over** in the DOM. The third review fixed the SCALAR form of this;
the per-block form kept the same hole. The net below caught it, so the harm is a
fit that WAS available being refused — on exactly the two-up family the per-block
chrome work was built for.

**MR3 asserts precisely this and could not fail**, because `makeBox` pinned every
`col > 0` block to `colTop`: no second block ever sat below a first inside a
non-first column, so the shape simply was not in the corpus. The model now carries
each block's branch of the box (`path`) and whether each level stacks vertically
(`vstack`), the generator stacks within columns, and the oracle models the same
physics — reverting the planner to the vertical-order form now turns MR3 red.

### Four more, smaller, each fixed

- **An author `id` in the synthetic namespace shadowed a minted one.** The collision
  guard seeded only from `data-trim-id`, while a block's id can BE an author `id` and
  `trimBlockEl` resolves `data-trim-id` first. Reproduced three ways on `<p id="s1tb0">`:
  the wrong paragraph cut and reported under "Those slides FIT"; an `<h3>` clamped, i.e.
  rule 3 violated in the DOM without `planTrim` ever proposing it; and `recovered` keyed
  on the shared id, skipping a legitimate cut. **This is the first review's bug and the
  third review's bug in a THIRD door** — each fix closed a doorway, this one closes the
  namespace.
- **`frameOver()`'s catch did the opposite of its own comment.** `catch { return false }`
  under a comment reading "a throwing probe must not silently keep a bad cut" — `false`
  is *not over*, so a throw KEPT the cut and reported it under "Those slides FIT".
- **The emulator open-coded `guardsEnabled` with a looser matcher.** `\b` matches at a
  hyphen, so `no-guards-strict` and `guards-strict-x` enabled the trim on the export and
  not in the runtime, and `x-guards-loose guards-strict` the reverse. "May this slide be
  cut?" now has one answer, injected from the kernel like "may this BLOCK be cut?".
- **A box with no text block reported `fitted: true`.** The reduce seeds with `limit`, so
  an empty `blocks` array made a figure-only cell 300px over come back as fitting.
  Latent — both call sites gate on `actions.length` — but `fits` is what a reporting
  consumer reads, and "Those slides FIT" is that consumer in spirit.

### Four more from the maker-checker, all fixed

- **`table-row` was classified as a vertical stack.** A `<tr>` stacks its cells
  HORIZONTALLY, so one cell's recovery was credited to the next — the cross-column
  over-credit above, in the one container the fix forgot.
- **`verifyTrim` had no direct test at all.** The highest-blast-radius function in the
  change — it decides whether the author's content survives, on both paths — was
  exercised only by the parity arm, which asserts the two paths AGREE rather than that
  either verdict is right. It now has arms for a kept cut, for arm 1 catching a residual
  the frame probe cannot see (an 8px shear is inside the probe's own slack, so the
  fixture uses an 8px line to land there deliberately), and for a throwing probe.
- **`reverted` reported the PLANNED count, not the undone one.** `clearTrimBoxes` skips
  an action whose element it cannot resolve, so the field said a revert succeeded on a
  block it never found. It returns the real count, pinned by a forged plan carrying a
  bogus action.
- **MR3's kill was one violation in 93 fit boxes, and the oracle had re-encoded the
  planner.** `sameFlowAbove` was a line-for-line copy of `liftsAbove`, so a wrong
  `stacksVertically` would have been wrong in both — the "the test's oracle re-stacked
  blocks the same wrong way" retraction this note already carries, one level deeper. The
  oracle now judges by `col`, a fact the generator WRITES DOWN and the planner never
  reads, and the corpus draws two and three ragged columns instead of round-robin ones,
  so a cross-column credit in either direction is produced. Reverting the planner's flow
  test, or dropping its `vstack` check, now turns MR3 red.

**And the ragged corpus surfaced a pre-existing narrowing worth writing down:** the
planner only cuts blocks that THEMSELVES cross the limit, so it never clamps an earlier
block to lift a later one into view. Raising a limit can therefore take the earlier
block out of the candidate set and leave the later one where rule 4 refuses to mark it —
seed 1797626, one box in 300 seeds. It is an under-trim, the safe direction, so MR7a
names the exemption narrowly (the decline must be a mark-visibility reason, and must have
discarded nothing) rather than being weakened to accept any decline.

### Declined, with reasons

- **The per-box revert arm was dead, and it is now live rather than deleted.** Both
  reviews proved it: the slide arm required ZERO over boxes at `FIT_EPSILON`, so any box
  still over — including one the planner never entered, over by 3px, inside its own entry
  tolerance — reverted the whole slide, and a box the per-box arm had just reverted was
  over again by construction. Rather than delete it, the two arms were given distinct
  scopes: the box arm asks *did the cut fit in the boxes we cut* (plan-touched only, at
  real fit — the sheared-card arm), and the frame arm asks *does the reader still see a
  clipped slide* (the probe's own oracle, at its own tolerance). Either failing reverts
  the whole plan, because rule 5's unit is what the reader sees. The export's old comment
  promising per-box SURVIVAL is retired: the code never did that, and the adapter test
  that certified it tested `clearTrimBoxes` in isolation rather than the composition.
- **`did-not-converge` is unreachable** and is kept anyway. Each iteration adds exactly
  one key to `recovered` and every candidate is filtered on it, so the loop cannot run
  past its bound; 200,000 randomized models never produced it. It stays as the honest
  terminal if the loop is ever changed, and is recorded here rather than left for a
  fifth review to re-derive.
- **The verifier stamps scaffolding on boxes it did not plan against.** `measureTrim`
  called with `FIT_EPSILON` takes its stamping branch for any box over by ≥1px. The
  export strips it (`finalizeTrim`); the live preview accumulates `data-trim-id` on
  fitting boxes, which is cosmetic — `data-trim-prior` is written only by `applyTrim`.
  Recorded, not restructured: separating "measure" from "stamp" is a signature change to
  the kernel's most-called function for no measured harm.
- **`overflow: clip` excludes its own `padding-bottom` from `scrollHeight` where
  `overflow: hidden` includes it** (measured: 522 vs 532 on identical content). So
  `contentBottom` understates a clip cell's real content bottom by its bottom padding,
  and `.compare-right` is such a cell with real padding. The bias is in the SAFE
  direction — the planner reserves less room than exists, so it under-trims — and both
  the model and the verifier share it, so nothing certifies a shear. Left as a known
  narrowing with the number written down.

### THE REAL PLAYGROUND, DRIVEN — the step HARD RULE #23 was owed

Everything above was measured on synthetic pages that reproduce `deck-preview.js`'s
transform shape. That is a mechanism, not a surface. The docs site was then built and the
**real Playground** opened in real Chromium, a `guards: strict` deck pasted into the real
editor, and the filmstrip iframe read at two pane widths — then the whole thing rebuilt
with `scaleOf` pinned to 1 (the shipped bug) and re-run.

| `.lattice` width | scale | with the bug | fixed |
|---|---|---|---|
| 532px | 0.4156 | clamped to **3 lines** | clamped to **12 lines** |
| 422px | 0.3297 | **no clamp at all, and the slide RINGS** | clamped to **12 lines**, no ring |

Both halves of the defect, on the surface a user touches. At one pane width the guard cut
**nine lines of the author's copy it did not need to**; at a narrower one it went
**inert** — the guard silent, the overflow ring on, which is `guards: strict` failing
in exactly the way it exists to prevent. The same deck at `guards: loose` clamps nothing
at either width, which is what stops the fixed reading from being a test of nothing.

The line count is now **identical across a 42% and a 33% scale**, which is the invariant:
what a slide says is not a property of how wide the reader's pane is.

**AND THE STUDIO EXPORT CAPTURE FRAME IS NOT AT SCALE 1 — measured, 0.94375.** That was
left as an open question one paragraph ago; it is answered, and the answer moves the
defect's severity rather than the fix's. `deck-export.js` sizes its iframe to the geom box
(1280) and `buildSrcdoc` puts `padding: 18px` on BOTH `html` and `body`, so `.lattice`
measures **1208** and the fit agent scales every section by 1208/1280. The frame's own
comment says the rest: *"The FIT agent still scales + reveals against the real width;
`rasterizeSection` undoes the scale (`transform: none`) per slide."* So the runtime trims at
0.94375 and the raster is taken at full size — the wrong LINE COUNT is baked. With the
coordinate-space bug that reached **exported bytes**, not only a preview. That sentence was
an inference when it was written; §13 drove the real Studio export twice and made it a
measurement — the bug costs the delivered PDF **sixteen words, one whole line of the
author's copy**, and leaves the room it cut them from empty.

**The CLI export was never affected, and an earlier draft of this paragraph said the
opposite.** It cited `inflatedPlayerHtml` as what "the export bakes". That symbol lives only
in `lattice-emulator.js` — it is the CLI's own player capture — and the CLI sets
`page.setViewport({ width: slideW, height: slideH })` (`:3235`), so its sections carry no
transform and `scaleOf` reads 1 there. The citation pointed a reader at the one export path
the defect could not reach, as evidence that it reached exported bytes. Caught by a checker
reading this very paragraph; recorded rather than quietly corrected, because a PR whose
subject is claims nobody re-derives had shipped one.

**0.94375 is a measurement, not a pin, and calling it a pin was the second wrong claim
here.** It is a bare literal in the measurement suite's scale list, fed to a synthetic
`transform: scale(k)`; nothing in that file reads `deck-export.js`, `buildSrcdoc` or the
padding, so changing `padding = 18` to `24` moves the real frame to 0.925 and leaves the
suite green. What the entry actually buys is worth keeping on its own terms —
`0.94375 = 151/160` is another non-binary fraction, in the same family as 0.7, 0.62 and
0.83, so it exercises the float-residue path. Re-derive the number from two places when it
matters: `deck-preview.js`'s `padding` default and `deck-export.js`'s geom sizing.

**And it is scrollbar-dependent.** 0.94375 was measured in headless Chromium, which uses
zero-width overlay scrollbars. The capture frame's content runs about three times its
height, so on a Chrome with classic scrollbars — the Windows/Linux desktop default, where
the Studio actually runs — the agent reads roughly 1193 and the scale is about 0.932. Not 1
in either configuration, which is all the severity argument needs; stated because "0.94375"
read as a property of the frame when it is a property of the frame plus a scrollbar
setting.

**What is still not driven:** a real Studio export of a `guards: strict` deck, end to end,
with its PDF diffed against the CLI export of the same deck. The mechanism is the same one
verified on the Playground and the frame's scale is now measured, but that last instance has
no artifact of its own.

---

## 12. A FIFTH PASS, on the commits the fourth never saw (2026-09-13)

The fourth review signed off on one commit, and three more landed after it — including a
change to `verifyTrim`'s policy. Nobody independent had read them. A checker scoped to that
89-line delta found **no correctness defect in the kernel change** and four wrong CLAIMS,
three of them in this note. That split is the finding: by the fifth pass the code was
holding and the prose was not.

- **The paragraph above cited the one export path the defect could not reach.** It said the
  Studio frame's DOM "is what `inflatedPlayerHtml` captures and the export bakes".
  `inflatedPlayerHtml` is the CLI's own player capture, and the CLI runs at scale 1. The
  conclusion survives through `rasterizeSection`; the citation pointed at evidence against
  it. Corrected in place, with the retraction kept.
- **A measurement was recorded as a pin.** "A change to that frame's padding cannot move it
  back without turning three arms red" — the suite reads no padding, no builder and no
  frame, so it would stay green; and the count was two arms, not three.
- **The measured scale is scrollbar-dependent** (0.94375 with overlay scrollbars, ~0.932
  with classic ones), which the flat number hid.
- **"26% and a 33% scale"** contradicted its own table one line above (0.4156 is 42%).

**And one real hole, one layer inside the fix that closed the last one.** `818b460` made a
MISSING probe count as over; the checker showed a probe that RETURNS nothing does the same
damage — `{}`, `false`, `0` and `''` all make `!!result.over` false, so the cut stands
unverified, while `null` and `undefined` threw and failed safe. Incoherent, and wrong in the
dangerous direction for the four that did not throw. Latent rather than shipping: the only
probe in the tree always returns `{ over, … }`. `verifyTrim` now requires the answer to BE
an answer — a boolean `over` — or it counts as over, and the seven shapes are pinned.

**The pattern, restated because it changed shape.** Passes one through four each found a
defect in the previous pass's CODE. The fifth found the code sound and the prose wrong. A
note that exists to stop claims being re-derived had accumulated four of its own, three
written the same evening they were retracted.


## 13. THE STUDIO EXPORT, DRIVEN END TO END — fix against bug, on the delivered PDF (2026-09-14)

Everything §11 measured about the coordinate-space bug was measured in the **live preview**.
The severity claim — that the bug reached *exported bytes*, not only a preview — was an
inference from two facts read in code: the Studio's capture frame scales sections by 0.94375,
and `rasterizeSection` undoes the scale per slide, so the wrong line count is baked. §12
retracted the citation that inference leaned on. It stayed the PR's one open caveat.

**It is now an artifact.** #2199 gave the exported PDF a real text layer, which collapsed the
cost of the oracle: `pdftotext` instead of a pixel-signature harness. The same `guards: strict`
deck was exported through the **real Studio Share → PDF flow**, twice — once from a site built
on the fix, once from a site built with `scaleOf` pinned to `1` — plus a `guards: loose`
control.

| build | body words in the delivered PDF | last line of copy |
|---|---|---|
| **fixed** | **205** | `Sentence 12 … past its limit.` — complete |
| **`scaleOf` pinned to 1** (the shipped bug) | **189** | `Sentence 11 … past its limit.`, and a **whole empty line below it** |
| `guards: loose` (control) | 205 | `Sentence 12 …` hard-clipped mid-line, no trim |

**The bug removes sixteen words — one full line of the author's copy — from the bytes the
reader receives, and leaves the room it cut them from empty.** That is the over-cut class
verbatim: `verifyTrim` is satisfied (the slide no longer overflows), every gate in the tree is
satisfied, and a line of the deck is gone. The raster confirms it by eye — eleven lines and a
blank band where the twelfth belongs.

The capture frame was instrumented during the export itself, so the mechanism is not inferred
either:

```
--- capture-frame states during strict.pdf ---
    s0:trim=1,clamped=1,cls=content.guards-strict.form.clip-marked,sc=1.0000
    s0:trim=1,clamped=1,cls=content.guards-strict.form,sc=0.9437
    s0:trim=1,clamped=1,cls=content.guards-strict.form.clip-marked.lattice-exporting,sc=0.9437
--- capture-frame states during loose.pdf ---
    s0:trim=null,clamped=0,cls=content.form.overflow.clip-marked.fit-marked,sc=1.0000
```

The trim fires inside the export's own frame, at 0.9437 — the scale §11 measured on a replica,
now read off the real export.

**Why this is not a Studio-vs-CLI diff, which is what the pre-merge card's raise path named.**
The CLI sets `page.setViewport({ width: slideW, height: slideH })` and runs at scale 1, so the
CLI export was never affected (§12). Diffing the two paths would have conflated the trim with
every other difference between two renderers. Fix-against-bug on the **one** path, same deck,
same flow, isolates the variable — and it is the comparison that actually answers the
question, because `guards: strict` against `guards: loose` does not: at this frame's scale the
correct trim lands on the same line the clip already cuts, so the two agree at 205 words and
say nothing about whether the trim ran.

**What this changes for the reader of §11.** Nothing in the fix; everything in the severity.
The bug was not a preview artifact that a correct export papered over. It shipped in the PDF.

### And the instrument, because nothing in the tree could see this

`docs/e2e/guards-trim-export.spec.ts` (new) drives the same two exports and asserts the
post-condition at the **artifact** level: **a `guards: strict` export never delivers less
copy than the untrimmed one.** `loose` clips at the box edge and the PDF's text layer
carries only what is visible, so the loose export is exactly *everything that fit*; a
correct clamp lands on that same last fitting line, so the two come back **equal** — and an
over-cut comes back shorter. There is no line count in the assertion, so it does not have
to know this deck fits twelve.

Anti-vacuity at both ends, because the comparison has two ways to be trivially true: an
export that painted nothing makes `0 >= 0` pass, and a deck that does not overflow makes
both exports whole. The control's count is pinned strictly inside `(0, 14)`.

Mutation-proved by rebuilding the site with `scaleOf` pinned to 1: **green on the fix,
red on the bug with `strict delivered 11 sentences and the untrimmed control delivered
12`.** Runtime 34s.

**The oracle needed a CI step, which was not the agent's to add — and the owner authorized
it.** `pdftotext` comes from poppler, and `studio-e2e-nightly.yml` — the only job that runs
this suite — provisioned Node, the browsers and the site, and no poppler. Adding a step to a
workflow is the repo owner's call (CLAUDE.md § SECOND FILTER, row 2), so the arm was written
to **skip with a message saying the export path is uncovered on that runner** rather than
quietly passing, and the step was put to the owner with its cost. Authorized and added, so
the skip is now the fallback rather than the nightly's actual state. The root integration
tier already depends on poppler the same way (`ci.yml`, `integration-nightly.yml`), so this
adds a dependency the repo already carries rather than a new one.
