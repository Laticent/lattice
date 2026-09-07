---
status: in-progress
summary: Can a `guards: strict` register prevent overflow by ellipsizing the text that does not fit? Measured on the real engine in Chromium, Firefox and WebKit — yes for prose in an HTML text block, no for anything else, and the hard part is not the trimming. An adaptive pure-CSS clamp exists in WebKit alone, so the CSS-only route is a portability trap; a measured pass fits every clipping slide in the corpus at 1-9ms per deck. But the note's original strongest claim was wrong: the existing `probeContentClipped` sees a CLAMP (the lines still lay out) and is blind to a DROP (`display: none` generates no client rects), so a TRIM must emit its own signal instead of inheriting the alarm. Stressed across the whole component gallery, the prototype that fixed the most slides did it by silently deleting 82 elements and left 13 slides losing content with no mark and no alarm. Three of the author's own detectors reported the flattering answer before an independent pass caught them. The ruling stands — TRIM as a fifth Fit-Ladder move, selective, default-off, measured, carried by a `guards:` front-matter register — but the alarm and the decline path are open problems, not details.
---

# Guards — can an ellipsis prevent overflow?

**The proposal.** A deck-level `guards:` register. At `strict`, text that
overflows renders with an ellipsis instead of spilling or being cut mid-line, so
the component keeps its shape and an export carries a clean "…" rather than a
sheared paragraph. At `loose`, nothing changes. The overflow ring, the "Content
clipped" tag and the type-floor warning all stay on either way — the guard
protects the look, it does not hide the problem.

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

**The same pass, run in all three engines on the same deck, does the same thing:**

| Engine | Clipping before | Clipping after | Blocks trimmed | Cut signal after |
|---|---|---|---|---|
| Chromium 131 | 2, 3, 5 | 2 | 4 | 2, 3, 5 |
| Firefox 155 | 2, 3, 5 | 2 | 4 | 2, 3, 5 |
| WebKit 26.6 | 2, 3, 5 | 2 | 4 | 2, 3, 5 |

Byte-for-byte the same verdict, and the trimmed card grid renders identically in
all three. That matters because the chosen mechanism is the row-a form — a
**literal** integer clamp, which every engine supports — while the tempting CSS-only
mechanism is the row-c form, which only one supports. The measured pass is portable
precisely because the number is computed outside CSS and handed in.

The two slides that did not fit are the interesting half, and they are section 4.

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

| Outcome | v2 (clamp the crossing block) | v3 (+ reach back and hide what follows) |
|---|---|---|
| Guard made the slide fit | 43 (53%) | 53 (65%) |
| Guard declined | 38 | 28 |
| Clamps whose ellipsis is off-screen | **19 (23%)** | 2 |
| Elements silently DROPPED (`display: none`) | 0 | **82** |
| **Slides that lose content with NO mark at all** | 19 | **13** |
| Layouts broken (failure mode 4a) | 0 | 0 |

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
  not apply to SVG text, so **no guard can reach a chart's own labels**. Those
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

**An unclassified slot defaults to `never`.** A guard that trims a slot nobody
classified is one bad default away from putting a wrong number on a slide, and
the failure is silent by construction — the deck looks better than the truth.
The cost of that default is that `guards: strict` does less on day one and
earns coverage component by component, which is the correct direction of travel.

The three headline questions, answered directly:

- **Can it be universal?** No. Universal over prose; a no-op over SVG charts;
  refused over numbers, law, code and math; powerless against box overflow.
- **Does it survive on all components?** Only under the rules in section 4, and
  the measurement is in §2b: stressed across the whole gallery, the rule-abiding
  prototype fits 65% of overflowing slides and breaks no layout, but the naive
  one hid content with no visible mark on 19 slides in 81. It survives the
  catalog; it does not survive being written carelessly.
- **Everything or selectively?** Selectively, by declared slot role, defaulting
  to no.

---

## 7. What this contradicts, stated plainly

Four written rulings point the other way, and a fifth precedent points here.

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
- `2026-07-22-structure-derived-split-patterns.md:315` (the `never "…"` is at
  `:317`): overflow is "always more slides, or the honest ring … never '…'".
  **That note qualifies its own guarantee two lines later** — ":317-319" says it
  "holds only once the author sets `autosplit: on`", off by default. So it opposes
  TRIM less than the sentence alone suggests: it is a promise about what the
  splitter does when asked, not a blanket ban on a mark. The first draft quoted
  the flat half and left the condition out.
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

**What the ruling commits us to, beyond the register itself.** Three canonical
statements now say something different from what the engine will do, and each
gets edited in the same change that ships the code, never after:

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

1. **The signal.** The existing probe cannot see dropped content (§3). TRIM emits
   its own record of what it removed, and the marker and `overflow:check` read
   that. Until then the ratchet can be blessed downward on a silenced deck.
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
6. **Export-to-Marp**, which has no measure pass. Degrading to no guard is a
   defensible answer; it has to be the written one.
7. **`kanban` already ships a declared 2-line clamp on a title** — a live instance
   of the option §8 calls untried, on a slot §6 classes `never`. `guards:` owes it
   a ruling.

**Not built.** This note records the investigation and the ruling. The
implementation — the register, the trim classes, the measured pass on each
render path, the demo deck and the tests — is separate work.
