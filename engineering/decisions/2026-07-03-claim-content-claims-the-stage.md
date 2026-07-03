# `claim` — one way to give content the stage

**Date:** 2026-07-03
**Status:** design proposal (design-before-code; no CSS/transform written yet)
**Branch:** `claude/frame-spacing-concept-lh41kw`
**Supersedes/absorbs (proposed):** the ad-hoc chart `cover` modifier and the
deck-wide `form: minimal` toggle. **Leaves untouched:** the `image` component's
`spotlight` / `statement` / `split` compositions (see §9, *Carve-outs*).

---

## 1. The problem, in plain language

Every Lattice slide is two things:

- **The edges** — the title strip along the top and the footer strip along the
  bottom (page number, the row of section dots, a running label, sometimes a
  logo). The frame around the painting. In code this is the **chrome** — the
  masthead and footer Cells and their Tiles (`lib/forms/cell/*`,
  `lib/forms/tile/*`).
- **The middle** — the author's actual content: the chart, the bullets, the
  photo. In code this is the **stage** Cell (`lib/forms/cell/stage/`).

When an author wants the content to **take over the slide** — push the edge
strips out of the way so a chart or an image gets the whole wall — there is no
single way to say it. There are instead six unrelated tricks, each glued to one
component or mode, and they neither share a name nor behave alike:

| Trick | Where | What it does |
|---|---|---|
| `cover` | chart family (`chart-family.css:685`) | full-bleed chart + a caption band |
| `spotlight` / `statement` / `split` | `image` only (`image.styles.css`) | full-bleed photo + scrim or card |
| `silent` | universal (`base.variants.css:28`) | hides the top **and** bottom strips |
| `no-header` / `no-footer` / `no-paginate` | universal | hides one strip each |
| `form: minimal` | deck-wide (`plugins.js:456`) | hides **only** the row of section dots |
| sovereign frames (`exemptFromChrome`) | Frame manifests | a whole layout with no chrome at all |

Three consequences make this worth fixing:

1. **"cover" means three unrelated things** — the chart modifier, Marp's
   `layout: cover`, and the auto-generated overflow `*-cover` accent slides. An
   author reading "cover" cannot predict which they'll get.
2. **Whole component families have no option at all.** Step-lists
   (`progression`), math, and plain stats cannot give content the stage by any
   author-typed switch. The capability simply doesn't exist there.
3. **The one deck-wide dial is dead.** A usage census of every real deck
   (`examples/`, `exemplars/`, the baseline decks) found `form: minimal` used
   **zero** times in real content, and `no-header`/`no-footer`/`no-paginate`
   **zero** times. `silent` and `compact`, by contrast, are load-bearing
   (hundreds of uses). The blunt dial is unused *because* it's blunt and hidden;
   the surgical switches get used.

---

## 2. What we want

**One idea — "let the content claim the stage" — that works on any component,
and can be set for a whole deck or for a single slide.** That is the whole
requirement. The name for it is **`claim`** (the docs already describe a
full-bleed slide as one that "claims the whole canvas," `forms.md:222`).

---

## 3. The one real design question: a slider, or a few switches?

The first draft of this concept made `claim` a **single slider** with four
notches — a little room → more → lots → edge-to-edge. An adversarial review
(§12) killed that shape with one concrete example:

> A slide that is one big photo. You want the photo to run to all four edges —
> **and** you still want the page number in the corner so the audience knows
> where they are.

On a single slider, "run to the edge" and "keep the page number" sit at
**opposite ends**. You cannot have both. But wanting both is entirely
reasonable. The review proved the three things a slider fuses together are
actually **independent**:

- **how much chrome shows** (all / just the page number / none),
- **how close content sits to the edge** (the inset),
- **whether content spills off the edge** (bleed).

Today's `form: minimal` is the proof in the codebase: it hides the section dots
but **keeps** the inset and **keeps** the meta chips. That combination is not a
point on any "less room → more room" line. Chrome, inset, and bleed don't move
together.

**So `claim` is a small set of composable switches, with named presets on top —
not a slider.** The presets are shorthand for the common combinations; the
switches underneath let you override any one axis. "Edge-to-edge photo *with* a
page number" is `claim-hero` (drop the bands) + keep-pagination — expressible,
because the page number is its own switch, not a notch on a dial.

---

## 4. The switches (the primitives)

`claim` does not invent new machinery for these — it **names and completes**
switches that already exist:

| Switch | Values | Mechanism today | Gap `claim` fills |
|---|---|---|---|
| **chrome** | full · quiet · none | hide-tokens `silent`, `no-progress`, `no-header/-footer/-paginate` (`base.variants.css`, tile `hideToken`s) | none — reuse as-is |
| **inset** | normal · tight · flush | `--frame-x` (5cqi) / `--frame-y` (6.875cqi) padding on the stage (`stage.css:59-60`) | **new** — no author way to tighten it today |
| **bleed** | off · on | zero the inset + let content fill to the edge | **new** for non-image/chart components |

Two facts that make this safe to build (both verified against the code):

- The inset is **`padding`, not `margin`** (`stage.css:80`), so tightening it
  never touches the banned-margin gate (HARD RULE #20).
- The chrome-band inset (`--frame-inset-x/-y`, 2.34/1.875cqi,
  `base.tokens.css:145`) is a **different** token from the content inset
  (`--frame-x/-y`). `claim`'s inset switch moves the content padding; it must be
  written to stay clear of the chrome berths so tightened content never collides
  with a kept page number (a real hazard the review flagged).

---

## 5. The presets

Four named presets. Each expands to a specific combination of the §4 switches,
and each is **named for a purpose**, not a magnitude — this is deliberate (see
§8, doctrine). A preset can be set deck-wide or per-slide; individual switches
override it.

### `framed` — the default (today's `standard`)
Full chrome, generous inset, no bleed. The matted boardroom look. This is what
every deck already gets; naming it just puts it on the map. **Zero change to any
existing deck.**

### `quiet` — recede the secondary chrome, keep wayfinding
Drop the section-dot rail and the meta bay; **keep** the title, the running
footer, and the page number. Tighten the inset one step. This is the honest,
completed version of what `form: minimal` gestured at.
*Cost: the fine-grained "where am I in this section" signal (the dots) and the
meta chips recede. Coarse wayfinding (page number) stays.*

### `hero` — the visual is the message
Drop the top and bottom bands. Content fills the stage to a hairline safe zone.
Optionally keep a single caption line and/or the page number reading through the
content. This is what chart `cover` does today, generalized to every component
that wants it.
*Cost: no title-in-place, no running footer, no deck identity (logo), no
section wayfinding. The slide can't be located in the deck unless you keep the
page number back on.*

### `bleed` — true edge-to-edge
Zero inset; content touches all four edges. Its own distinct preset, never a
flag on `hero` — reaching the true edge is a deliberate, risky choice and gets a
deliberate word (no magic). **Guard-railed** (§8): a component that can't safely
bleed opts out via its existing `excludes` list (§7), and prose-dense layouts
that try it are warned and clamped to `hero`. In practice `bleed` is for
self-contained media/canvas (chart, diagram, big-number, video — **not** image,
which owns its own bleed, §9).
*Cost: the safe margin itself. Content at the true edge risks being cropped by a
projector or a printer's trim. Legibility becomes the author's responsibility.*

---

## 6. The cost, priced — the spine of the whole design

The original question was *"we can collapse or hide or shrink things — but at
what cost?"* The answer is the point of the concept: **each step up spends a
specific, named resource, and `claim` makes the price legible instead of burying
it in per-component CSS.**

| Moving from → to | You gain | You spend |
|---|---|---|
| `framed → quiet` | ~1 step tighter, calmer edges | the **section-dot rail** + **meta chips** (fine-grained in-section wayfinding) |
| `quiet → hero` | the whole stage minus a hairline | the **bands**: title-in-place, running footer, **deck identity (logo)**, and **page-number wayfinding** — unless you switch the page number back on |
| `hero → bleed` | the last hairline of safe margin | **projector/print safety** and the **legibility guarantee** (transferred to the author) |

The design's value is not that it hides chrome — it's that it **prices** hiding
chrome, and (via §8) refuses the prices that produce a broken boardroom slide.

---

## 7. How you invoke it

`claim` is a **universal** concept — the four presets mean the same thing on
every component, exactly like `dark` or `silent`. There is **no per-component
`claim` setting and no manifest sweep**: everything defaults to `framed`
(today's look), so a deck that says nothing is unchanged. Two author surfaces,
mirroring how `finish:` / `mode:` already work:

- **Deck-wide:** `claim: quiet` in front-matter → applied to every eligible
  slide, propagated the way `class:` / `finish:` / `mode:` are today
  (`deckClassPropagate`, `plugins.js:190`). Per-slide setting wins over the deck
  default — the same override guard that already exists for `finish-*` / `mode`.
- **Per-slide:** a `claim-hero` token in `_class` (prefixed family, like
  `tint-*` / `tone-*` / `checks-*` — avoids the bare-word collisions that sank
  `full` / `cover`).

The **only** per-component data the system needs is a single safety fact:
*can this component safely reach `bleed`?* A dense table or heavy-prose layout
run to the true edge is a broken slide (the outer content is cropped, no safe
margin), so it opts **out** of `bleed` — using the `excludes` list it already
has (the exact mechanism a component uses today to opt out of `compact`). Most
components exclude nothing and get the full universal behavior; a handful add
one word. **No new field, no new mechanism, no 50-file edit.**

---

## 8. Guard rails — chrome-stripping stays coupled to purpose

The sharpest objection in the review was an **inversion**: making it *easy* to
strip chrome could degrade the median deck. Lattice doctrine treats chrome as
**navigation, not clutter** — "a long deck needs dividers and sub-topics for
orientation" (`design-principles.md:249`), and chrome consistency is "a designed
feature" (`:169`). A free-floating "strip intensity" any slide can crank is a
footgun: an author cranks it, loses wayfinding, and the deck reads like a
template.

`claim` answers this by **keeping the strip coupled to a purpose**, three ways:

1. **Presets are named for intent** (`hero`, `quiet`), not magnitude. You ask
   for a hero slide; you don't ask to "remove 60% of chrome."
2. **The `bleed` safety opt-out** (§7) means a component that shouldn't reach the
   true edge *can't* — it lists `claim-bleed` in its existing `excludes`, the
   same way some components already exclude `compact`. Prose-dense layouts top
   out at `hero`.
3. **Two lint rules** (feasible in the pure, fs-free `lib/authoring/lint-core.js`):
   - `bleed` on a prose-dense component → warn + clamp to `hero`.
   - wayfinding lost on more than *N* consecutive slides → warn ("the audience
     can't tell where they are"). This is the doctrine encoded: you may strip
     chrome, but not silently strip *navigability* across a run of slides.

`bleed`'s print/projector risk is real enough that its guard should be a
**hard export check**, not just a warning — which also brings it under the
existing export sign-off gate (a bytes-of-the-artifact change; QUALITY BAR).

---

## 9. Carve-outs — what `claim` does *not* touch

- **`image` stays exactly as it is.** Its `spotlight` / `statement` / `split`
  compositions are genuinely special: a photo has unknown brightness, so keeping
  the title legible needs an injected scrim or a solid text card — ~400 lines of
  bespoke, luminance-aware CSS (`image.styles.css:260-395`) that a generic
  "recede the chrome" mechanism cannot and should not replicate. Image is the
  one component where "the visual is the slide" is the *default*, not a claim
  level. **We leave it alone.** (Conceptually, `image` behaves as if permanently
  at `hero`/`bleed`; we simply don't route it through `claim`.)
- **Chart `cover` is absorbed and purged, not aliased.** Unlike a photo, a
  chart's background luminance is known, so its caption band is safe and its
  behavior *is* the generic `hero`. Fold `cover` into `claim-hero`, and delete
  the `cover` name outright — no one-release alias. The only decks that type it
  are a handful of our own chart demos (radar, piechart); we do the one-word edit
  in those as part of the change. Pre-GA, a dead synonym earns nothing. (This is
  the one real consolidation; the image consolidation the first draft proposed is
  explicitly dropped — the review showed chart and image full-bleed share ~5
  lines and diverge on 100+.)
- **`silent` and the `no-*` hide-tokens stay** as the surgical, per-Tile
  switches. `claim` presets are *defined in terms of* them; they remain
  available for one-off overrides. One mechanism underneath, two levels of
  surface (coarse presets, fine switches).

---

## 10. Where it lives in the model

**`claim` is not a new axis, and not a new "register."** The review corrected an
early framing here: "register" is a **Finish-axis-only** term (`theme:` /
`mode:` / `finish:`); the **Form** axis resolves into *nouns* — Frame · Cell ·
Tile (`concepts.md:93`, `forms.md:42`) — it does not take registers. And "how
much chrome vs content" is already a Form decision: it lives in the **Frame's**
`kind: root | sovereign` + `suppresses[]` + `exemptFromChrome`
(`lib/forms/schema/frame.schema.json`).

So `claim` is the **author-facing name and preset layer over the Frame catalog +
the chrome switches** — the friendly surface for a decision the Frame model
already owns, made universal and given the two missing pieces (inset control;
bleed for the components that lack it). Concretely:

- The presets map onto Frames: `framed` = the `standard` frame; `quiet` = the
  `minimal` frame (reclaimed and completed); `hero` / `bleed` = sovereign
  behavior applied to a component that keeps its own layout.
- **No new manifest field.** `claim` is universal (default `framed` everywhere);
  the only per-component fact is the `bleed` safety opt-out, which reuses the
  existing `excludes` list (§7). This still touches the canonical docs —
  `concepts.md`, `forms.md`, `design-system.md` §6.5 — because `claim` is a new
  universal concept, and that edit must land in the same change (the §2.5
  "same-sweep" hazard); it just adds no schema field.
- **Vocabulary law (§2.5):** one system word + one human word = **"Claim."** No
  third synonym. The stop names (`framed`/`quiet`/`hero`/`bleed`) are the
  preset vocabulary, added to `MODIFIER_PREFIXES` / `isKnownModifier` in
  `lib/authoring/lint-core.js` (this is where the token vocab actually lives —
  **not** `check-ownership.js`, a misattribution the review caught).

---

## 11. What we delete (dead weight, flagged as separate work)

The census found tokens with ~zero real use. Retiring them shrinks the surface
`claim` has to reconcile with. Per HARD RULE #17 (one feature, one branch) and
#8 (gallery isolation), these are **follow-up commits/PRs**, not smuggled into
the `claim` change:

- `no-header` / `no-footer` / `no-paginate` as author tokens — 0 deck uses.
  (Keep the underlying CSS the presets rely on; retire the author-facing tokens.)
- `loose` — 2 uses; a spacing modifier orthogonal to `claim`, demote or fold.
- `form: minimal` — 0 real uses; retire into `claim: quiet`. Because it's unused
  in real decks, this is a near-free breaking change (only fixtures/galleries
  reference it) — record it in `CHANGELOG` under **Breaking** anyway (HARD RULE
  #10).

---

## 12. The review that shaped this (what changed and why)

This design is the *second* draft. The first draft — a single universal 4-stop
ordinal scale, with the chart and image bleed systems consolidated into shared
CSS — was put through five independent adversarial passes (a red team, an
inversion analysis, an independent fact-checker, and two peer sessions doing a
doctrine check and a real-deck usage census). They converged, and they changed
the design in four load-bearing ways:

1. **Slider → switches + presets.** The stops were not ordinal; chrome/inset/
   bleed are independent (the photo-with-page-number example, §3).
2. **New register → Frame-coupled name layer.** "How much chrome" is already
   Frame selection; a parallel register would be a second system answering the
   same question (§10).
3. **Consolidation dropped for image, kept for chart.** Chart and image
   full-bleed share ~5 lines and diverge on 100+; merging image would risk
   pixel drift across every composition for near-zero gain (§9).
4. **The `minimal → quiet` migration is honest about being a change, not a
   silent alias** — `quiet` does more than `minimal` did, so it's a documented
   breaking change, not a drop-in (§11). Because `minimal` is unused, the cost
   is near-zero.

The premise — content legitimately claiming the frame — survived every pass; it
is, after all, the defect the Form model was built to fix ("content with chrome
bolted on," `forms.md:27`). Only the *shape* changed.

### Rejected alternatives
- **A single fused ordinal scale.** Cannot express valid mixed states
  (bleed + keep page number). Rejected in favor of switches + presets.
- **A new front-matter register on Form.** Layer mismatch; duplicates the Frame
  model. Rejected in favor of a name layer over the existing Frame catalog.
- **Consolidating image `spotlight`/`statement` into the shared mechanism.**
  Near-zero shared code, large regression surface, and image's luminance-aware
  legibility contract is genuinely special. Rejected; image is carved out.
- **Do nothing / just rename + document.** The cheapest option, and it captures
  the naming and matrix wins — but it leaves the real gaps (progression/math
  have no option) unfilled and gives authors no single concept. Rejected as the
  *whole* answer, but its wins (kill collisions, publish the valid-combination
  matrix, delete dead tokens) are folded in as §11 + the doc work.

---

## 13. Decisions (resolved at sign-off, 2026-07-03)

1. **Four presets.** `bleed` is its own preset with its own word — never a flag
   on `hero`. Reaching the true edge is a deliberate, risky choice; it earns a
   deliberate name, no magic.
2. **`cover` is retired and purged**, not aliased. The chart-only `cover` name
   is deleted outright when `claim` lands; the handful of in-repo chart demos
   using it are edited in the same change. Pre-GA, no dead synonym.
3. **`claim` is universal; no per-component field.** Every component defaults to
   `framed`; the concept means the same thing everywhere. The only per-component
   data is the `bleed` safety opt-out, carried on the *existing* `excludes` list
   — no new schema field, no manifest sweep.

Remaining for the implementation branch (not blockers to this proposal): the
precise inset ratios for `quiet` (§4), and whether the "wayfinding lost across N
slides" lint (§8) is warn-only or a soft gate.

---

## 14. File map (for whoever implements)

- **Presets → switches:** `lib/forms/cell/stage/stage.css` (inset vars, the
  shared `claim-*` rules — must live in shared CSS, not per-component, or the
  `checkVariantDeclaration` gate fires).
- **Chrome switches (reused):** `lib/base/base.variants.css`,
  `lib/forms/tile/*/*.manifest.json` (`hideToken`s).
- **Deck-wide propagation:** `lib/integrations/markdown-it/plugins.js`
  (`deckClassPropagate` + a `claim` branch mirroring the `finish-*`/`mode`
  override guard; the binary `applyFormToggleToHtml` path cannot carry a graded
  value as-is).
- **Frame mapping:** `lib/forms/frame/{standard,minimal}/*.manifest.json`,
  `lib/forms/schema/frame.schema.json`, `lib/forms/index.js` (`frameToggleSkip`).
- **`bleed` safety opt-out:** the existing `excludes` mechanism (Tier-2 opt-out,
  `lib/components/index.js` `SEMI_UNIVERSAL_VARIANTS` + per-manifest `excludes`)
  — reused, not a new field.
- **Vocab + lint guard rails:** `lib/authoring/lint-core.js`
  (`MODIFIER_PREFIXES`, `isKnownModifier`, the two new `claim` checks).
- **Chart `cover` to absorb:** `lib/components/chart/_chart-family/chart-family.css:673-773`.
- **Carve-out (do not touch):** `lib/components/imagery/image/image.styles.css`.
- **Docs to update in the same change:** `design/concepts.md`, `design/forms.md`
  (§2.5 same-sweep), `design/design-system.md` (§6.5 modifier tiers),
  `CHANGELOG.md`.
