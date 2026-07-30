---
status: shipped
summary: >
  Framing text (eyebrow, heading, subtitle) now FILLS the masthead band on every non-sovereign
  component: the `.masthead-lede` grid track — which already reserves the right bay — is the only
  constraint, and how the framing behaves is the deck's call through the `headline:` alignment
  register. Four per-component `max-width` bakes are removed (chart-family's heading + subtitle,
  `content`'s heading, `decision`'s heading), covering 17 components. A full audit measured all 70
  `max-width` declarations on text in the engine across 73 deck-shapes, which is what scoped the
  change: the sovereign bookends keep their caps (their framing IS the content), the 15 autosplit
  cover caps provably never bind, and the body-prose measures are a different concern. Also fixes a
  latent engine↔web split where a slide carrying speaker notes stranded its chart subtitle outside
  the band, silently removing it from `headline:` control.
---

# Masthead framing fills the band; the deck owns its behavior

## The principle

**On a sovereign bookend (`title` / `closing` / `divider`) the heading and subtitle ARE the
slide's content.** Those components get to look different, and a composed measure is theirs to
make.

**On every other component the framing text frames someone else's content.** It is chrome. It is
held to one boardroom standard, and its behavior is controlled by deck-wide and per-slide
configuration — today that means the `headline:` register's `left` / `center` / `right`. A
component has no business making a bespoke width decision there.

That line is what this change enforces. It is not "no constraints anywhere": it is "a component
does not compose its own chrome."

## What was wrong

Four declarations capped framing text on components whose framing is chrome:

| Rule | Value | Reached |
|---|---|---|
| `chart-family.css` `.chart-frame .masthead-lede h2` | `70.3125cqi` | all 14 chart-bucket members |
| `chart-family.css` `.chart-frame .chart-subtitle` | `68.75cqi` | all 14 chart-bucket members |
| `content.styles.css` `section.content h2` | `72cqi` | `content` |
| `decision.styles.css` `section.decision h2` | `70.3125cqi` | `decision`, `compare-prose decision` |

Measured across 73 deck-shapes (all 61 component galleries + the 87-slide baseline gallery + the
bloom deck, landscape; plus a portrait+autosplit pass), these four held **42 framing boxes below
their own band** and cost **30 of them an extra line**. Nothing documented them — the values
appear in no `.docs.md`, no `base.docs.md`, and not in `engineering/typography.md`. An author could
only discover them by rendering a title and noticing it wrapped early.

They also could not see the masthead bay. `section { container-type: size }`
(`lib/base/base.elements.css`) is the only container in the engine, so every `cqi` resolves against
the *slide*, never against the lede — and there is no way to express "a fraction of the lede" in
`cqi` at all, because the lede is not a container. On a chart slide with `meta:` set, measured:

| | lede track | bay | rendered heading |
|---|---|---|---|
| `70.3125cqi` (before) | 885.9px | 234.1px | **810px** — 76px short, uncorrelated |
| no cap (after) | 885.9px | 234.1px | **885.9px** — exactly the track |

**This was a width problem, not a unit problem.** `cqi` is curated and load-bearing: it is what
makes a deck render identically at 8K or 10K, and it is not to be touched. Swapping the unit was
tested and fixes nothing — the same cap as `70.3125%` of the parent renders at **622.9px**, i.e. it
becomes *aware* of the bay and simultaneously narrower. Only removing the cap yields the available
width.

The unit was also not the live issue, though the reason is narrower than a first draft of this
note claimed. That draft said "no shipped deck sets `meta:`" — **false**, and worth recording as a
correction: it generalized "none of the 63 decks in the measured corpus" (61 galleries + the
baseline gallery + the bloom deck) to the whole repo. Five shipped decks do set `meta:` —
`examples/accent-finishes.md`, `examples/marp-export-fidelity.md`, `examples/claim.md`,
`examples/form.md`, `design/forms.gallery.md` — and every one of them uses a component whose cap
this change removes (`content` in all five; plus `matrix-grid`, `piechart`, `radar`). So the bay
*was* present in shipped material, not absent.

What is true is that the caps never bound there anyway: rendered fresh and pixel-compared against
their committed PDFs, four of the five are unchanged by this change and the fifth
(`design/forms.gallery.pdf`) differs only because **it was already stale on `main`** — rendered
from `main`'s own code it differs from its committed PDF on 20 pages, and `main`-rendered vs this
branch differs on **0**. Their headings are simply short enough not to reach a cap. So all 207
measured bites did occur with no bay in play, and bay-blindness stayed latent — but by the length
of the headings people happened to write, not by the absence of the bay.

*(`design/forms.gallery.pdf`'s pre-existing staleness is off-path for this change — logged here,
not rebuilt, per HARD RULE #18.)*

## What shipped

- The four caps above are removed. The framing fills `.masthead-lede`, which tracks the bay.
- `section.content p`'s body-prose measure (`72cqi` ≈ 65–75 chars) is **kept** but scoped to
  `section.content > .cell-stage p`. Unscoped it also matched content's eyebrow and subtitle once
  they hoist into the band — measured, a portrait eyebrow ("Context · Competitive Dynamics")
  wrapped to two lines for want of **2.6px**. The typography half of the rule stays unscoped so a
  hoisted subtitle keeps its prose sizing.
- `extractSubtitleP` (`lib/forms/cell/masthead/masthead.transform.js`) now anchors at the offset
  `extractH2` vacated instead of at the start of the section's HTML — the string equivalent of the
  DOM kernel's `h2.nextElementSibling`. See below.
- `lib/base/base.docs.md` documents the rule under the `headline:` register, including the
  sovereign exception.

Verified: **0 binding caps** remain inside `.cell-masthead` across all 14 chart galleries,
`content`, `decision`, `compare-prose`, the baseline gallery and the bloom deck. With a `meta:` bay
docked, the heading fills the 967.3px lede under all three of `head-left` / `head-center` /
`head-right`, while the intrinsically-shorter eyebrow and subtitle align flush-left, centered, and
flush-right respectively — i.e. alignment is the control, as intended.

*Binding*, not *present*, and the distinction is load-bearing: `base.sketch.css` sets
`section.sketch h2 { width: fit-content; max-width: 100% }`, so a sketch-mode deck does carry a
`max-width` on a banded heading. It is a **guard**, not a measure — it exists to stop `fit-content`
overflowing its containing block — and 100% of the lede is exactly the fill this rule asks for, so
it constrains nothing. The sweep above contains no sketch deck, which is why it reported a flat
zero; a maker-checker pass surfaced the rule and the wording was tightened rather than the claim
quietly broadened.

## The anchor split — content above the heading evicts the subtitle from the band

`extractSubtitleP` anchored its match at `^` — the start of the section's HTML — so **any markup
preceding the heading** defeated it and the subtitle stayed in the body, below the hairline. Out of
the band means out of `headline:` control, which is precisely the failure the principle above rules
out.

Measured on two otherwise-identical chart slides under `headline: center`:

| | heading | subtitle |
|---|---|---|
| with a speaker note | in lede, centered | **not in lede**, `text-align: start`, pinned 64px from the left |
| without | in lede, centered | in lede, centered |

**A correction worth recording, because the first draft of this note got it wrong.** The trigger is
*not* the `<aside class="lattice-notes">`. That element does not exist when the masthead lift runs:
notes are materialized **after** `engine.render` returns — `slidesWithNotes` in `lattice-emulator.js`
on the CLI path, `materializeNotes` in `docs/src/components/studio/share-export.ts` on the Studio
path. At lift time the note is still its raw `<!-- … -->` comment node, and *that* is what sat in
front of the heading. The same eviction happens with authored prose or raw HTML above the heading,
so the fix covers a broader class than notes alone. A maker-checker pass caught the mis-attribution;
it mattered because the wrong cause would have pointed a future maintainer at `notes-core.js`, which
is not involved.

The DOM kernel (`lib/transformers/masthead-lift.js`) was always immune because it walks element
siblings, so this was a live HARD RULE #1 engine↔web split — live but **unexercised**: a
differential render of all 173 shipped decks (old kernel vs new) produced 15 whitespace-only file
diffs and zero structural ones, because every corpus deck places its notes after the heading. On the
path of this change, so fixed in place (HARD RULE #18).

## Scoped out, deliberately

- **The sovereign bookends keep their caps.** `title h1` `59.4cqi`, `closing h2` `62cqi`,
  `closing p` `48.4cqi`, `divider h2` `62.5cqi`, `divider.light p` `46.875cqi`. Their framing is
  the payload, so the composition is theirs. Noted for a future look: a fixed measure is a blunt
  instrument for line balance, and these bite *harder* than anything fixed here — `divider h2` on
  15 of 15 measured slides, and in portrait `divider.light p` runs to **10 lines where 4 would do**.
  That is the cap failing at the job it was hired for, not composition. A separate discussion.
- **Autosplit is out of scope.** Fit is autosplit + atomization's job — the machinery that splits a
  slide and may step type down to make it fit — not a width cap's. The 15 `em` caps on generated
  cover pages (`.split-feat-h`, `.split-feat-lede`, `.split-feat-sub`, `.split-pt-b`,
  `.split-pullq` across `base`, `split-panel`, `compare-prose`, `compare-code`, `decision`,
  `list-tabular`) were measured in a portrait+autosplit pass: **89 observations, zero binds** — the
  cover panel is always the binding constraint, so the cap is never reached. Left untouched on
  evidence, not assumption.
- **Body-prose measures stay.** `content`'s stage prose, `imagery`'s `ch` caps, `quote`'s
  blockquote, `big-number`, `math.stats`. A reading measure on body copy is a different question
  from a component composing its chrome.
- **Two latent straddles, both inert on the masthead side**, left as-is: `section.video
  .video-aside` reaches the lede only on the `gallery` variant, where it does not bind.

### Logged, not fixed here: `form: off` gives a chart slide no frame padding

Found while checking whether the removals interact with the Form opt-out. On a `form: off`
(or `no-form`) chart slide the section carries `padding-left: 0`, so framing text runs to the
literal slide edge. Measured on a `radar` slide at 1280px, with **all four caps re-added** —
i.e. the pre-change state:

| | heading | subtitle |
|---|---|---|
| before this change | left-gap 0, right-gap **0** | left-gap 0, right-gap 400 |
| after | left-gap 0, right-gap 0 | left-gap 0, right-gap **0** |

The heading was already edge-to-edge on both sides *before* this change, because its cap
required a `.masthead-lede` ancestor that the opt-out path never builds. The subtitle's cap did
not require the band, so removing it makes the subtitle match the heading. That is a
consistency change on an already-broken surface, not a working surface tipped into failure —
the root cause is the missing frame padding, which belongs to the Form model, not to framing
width. **Off-path pre-existing defect → logged here rather than pulled into this diff**
(HARD RULE #18's on-path/off-path boundary, which is what keeps #17 intact).

Not exercised by anything shipped: no deck in `examples/`, the baseline decks, or the
galleries sets `form: off`, and `no-form` appears only as prose in `examples/form.md`, never as
a live slide directive.

## Audit method

`.scratch/` harnesses (throwaway, not gates): a static pass parsing every `max-width` declaration
in `lib/**/*.css`, joined to a measured pass that renders each deck and asks the CSSOM which
authored rules matched each text box — so a bite is attributed to an exact rule rather than
inferred from a computed px value. For each box it records the container's available width, the
rendered width, the width with the cap lifted, and the line count both ways.

Two findings the measurement produced that reading the CSS would not have:

1. The autosplit `em` caps never bind (89 observations) — 15 declarations correctly left alone.
2. The bookend caps bite hardest of all, which is what turned "should bookends be exempt?" from a
   scoping question into a follow-up with evidence attached.
