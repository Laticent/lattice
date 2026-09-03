# Skill — Create a lens

> Define a reader lens (Lente): a saved, author-approved *subset* of one deck's
> slides, projected at a chosen altitude (bottom-line / story / evidence / the-ask)
> without editing the source.

> **Two words, one feature — and which to use where.** The MACHINE register is
> `lens`: the front-matter `lenses:` block, `lens-default:`, the per-slide `_lens`
> tag, and every name in `@workwel/lente`. The HUMAN register is **view**: every
> string a person reads says "reader view" (the panel is titled *Reader views*, not
> *Lenses*). Write prose in the human register; write keys and identifiers in the
> machine one. Neither migrates into the other — see
> `engineering/decisions/2026-08-25-lens-view-defaults-and-depth.md` §2. (Unrelated
> homonym, so a grep does not mislead you: the components-reference browser's
> `lens` is a catalog *facet*, nothing to do with readers.)

**Read this when** you are asked to create a reader view, an exec summary view, a
"show me just the ask" projection, or any saved subset of a deck. **You'll produce**
a `LensDef` in the deck's front-matter `lenses:` block, per-slide `_lens` tags, and
an approval hash — usually via the Studio Lenses panel.

---

## The 10/10 bar

A lens changes **which slides are shown**, never their look or content. A 10/10
lens:

- **Fails closed.** An unavailable lens (unknown / unapproved / drifted / empty /
  hidden) shows *nothing extra* — never a silent fall-through to the full deck. An
  unavailable lens means **nobody has vetted this projection**, and showing more
  than the reader asked for substitutes the tool's guess for the author's approval.
  (This is a UI-integrity guarantee, not confidentiality — see *What it is not*.)
- **Is content-bound.** Approval is a **content hash**, not a boolean. Any later
  edit, reorder, or retag changes the hash, so the lens de-approves itself for
  every consumer until re-approved. It detects **drift**, which is the useful
  property; it is not a forgery proof — see *What it is not*.
- **Stores membership as a diff from its base** — a slide carries a tag only where
  it *differs* from the lens's base, so the real deck stays clean.
- **Keeps the read path and the suggest path apart** — the projector never imports
  the suggester; the suggester only proposes and writes nothing; the only bridge is
  a human pressing Approve.

Bad looks like: `approved: true` (staleness-blind — it survives every later edit, so
it certifies content nobody looked at); falling open to the full deck when a lens is
unavailable (shows slides the author never approved for that view); renaming a lens
`id` in place (orphans every tag); a lens that guesses membership with low confidence
instead of emitting nothing.

### What it is not

**Two claims about this feature were withdrawn on 2026-07-18 and must not come back**
(`engineering/decisions/2026-07-13-lente-reader-lenses.md` § Correction;
`docs/src/lib/lente/README.md`):

- **The content hash detects DRIFT, not FORGERY.** `approvalHash` is an *unkeyed*
  SHA-256, so anything that can write the deck source can recompute a matching
  digest. It de-approves a lens on any edit, reorder or retag — genuinely useful,
  and the reason to prefer it over a boolean — but it does not answer "did a human
  vet *this* deck?". The human-in-the-loop assurance is the **Approve gate itself**
  (a person looked and clicked), not a cryptographic property of the hash. A keyed
  HMAC or signature would be needed for a real forgery proof, and none is claimed.
- **Client-side projection HIDES, it does not WITHHOLD.** Filtering an array the
  client already holds is `display:none`, not redaction: a `brief` reader who views
  source sees every non-member slide's bytes. Real confidentiality needs the host to
  project server-side and never ship the non-member slides — outside this pure,
  no-network library.

Nothing about the *behavior* changes: still fail closed, still a content hash, still
never `approved: true`. Only the stated reason changes. Do not describe a lens as a
redaction, and do not describe the hash as resisting forgery.

---

## Mental model

A lens is a `LensDef` — a small record in front matter — plus tags on slides:

```ts
interface LensDef {
  id: string;        // stable machine id; every _lens tag references it — NEVER renamed in place
  label: string;     // reader-facing name; relabel freely
  base: 'none' | 'all';  // additive vs subtractive (see below)
  single?: boolean;  // render only the first member in author order (the "ask")
  hidden?: boolean;  // defined + suggestible but kept out of the reader's picker (staging)
  order?: number;    // picker position; default = registry order — NOT the ladder order
  kind?: 'rung' | 'cut'; // depth: a rung nests in a ladder, a cut stands alone. Absent = cut
  approved?: string; // a content hash "sha256:…" written on human Approve — the reader gate
}
```

**`base` is the core idea:**

- `base: 'none'` (**additive**) — a slide is OUT unless it opts IN with
  `<!-- _lens: brief -->`. Used by `brief`, `story`, `ask`.
- `base: 'all'` (**subtractive**) — every slide is IN unless it opts OUT with
  `<!-- _lens: -evidence -->`. Used by `evidence`.
- `full` is neither — the implicit identity lens, always present, un-removable, and
  the fallback a reader lands on whenever the deck's landing view is unavailable
  (safe because it's the whole deck).

The **read path** (`project.ts`) computes a reader's view from approved tags +
registry via one predicate filter over the author-ordered slides. The **suggest
path** (`suggest.ts`) is a transparent, no-AI rule table over each slide's `_class`
that *proposes* membership and writes nothing. A human pressing **Approve** in
Studio is the only thing that writes tags and stamps the content hash.

The four built-in **archetypes**: `brief` (Bottom line, base none, **rung**),
`story` (The story, base none, cut), `evidence` (The evidence, base all, **rung**),
`ask` (The ask, base none, single, cut).

---

## The landing view — and the one thing it is not

`lens-default:` names the view a reader **starts** in. It is not a lock on what
they may see: the picker still offers every reader-eligible view, and a reader can
switch to the full deck at any time.

That is why it **fails soft.** If the landing view is unapproved, edited since
approval, staged, empty, or names nothing at all, Present opens the full deck
instead. That reveals nothing that was not already one click away — the picker
offered `full` anyway. Eligibility
is resolved *before* the view is selected, so an ineligible id never becomes the
active view and the fail-closed projection below is never asked to fall open.

**Do not confuse this with a pin.** A pinned handoff — "send the exec a link that
shows only the brief" — is a different lever with the opposite failure behavior: it
withholds the picker and must fail **closed**, because the sender chose that scope on
purpose and a fall-through would silently override them. It travels on the
share/export channel rather than in the deck. The **export half of that channel now
exists**; a pinned *link* does not.

## Exporting a view — the one consumer that can withhold

`lattice deck.md --lens brief out.pdf` renders the `brief` view: its members, in
author order, and nothing else. Several views at once need `--player`, which carries
them behind a switcher in one file — a PDF is one linear sequence, so handed two views
it could only show the union with nothing telling the reader which slide belongs to
which, and it refuses instead.

It **fails closed**, exactly as the reader path does. An unavailable view — `unknown`,
`hidden`, `unapproved`, `empty`, `drifted` — exits non-zero naming the reason and writes
no file. There is no fall-through to the full deck, because a view is often a deliberate
reduction and a fall-through hands the reader every slide you kept out.

**This is where the "hides, not withholds" limit finally moves — halfway.** Inside the
Studio, projection is `display:none` over an array the browser already holds; a reader
who views source sees every non-member slide. An export *constructs* the bytes, so the
slides it leaves out are genuinely not in the file. Two things follow, and the split is
the useful part:

- **What the export leaves out is withheld.** Slides outside the union of the views you
  exported are not in the artifact at all — not in the slide DOM, not in the article, and
  not in the re-importable envelope.
- **What a multi-view carrier switches between is only hidden.** Every view in that one
  file is in that one file. Send one file with `brief` and `evidence` in it and the
  `brief` reader can reach the `evidence` slides. If a recipient must not have them, send
  them their own file.

**An export freezes an approval, and a sent file cannot be un-approved.** Inside the Studio
approval is revocable: edit the deck and the view de-approves itself, hide it and readers lose
it. None of that reaches a file you already sent. The vocabulary here — approved, eligible,
de-approves itself — describes a live check, and an exported artifact only carries the answer
that check gave on the day it was baked.

**The envelope is the channel people forget.** A `--player` export embeds the deck source
for lossless re-import, so it round-trips back into a fully editable deck. With `--lens`
it carries only the slides that shipped; `--lens-source full` restores the whole deck,
which is a real choice with a real cost — the recipient can then recover every slide no
view showed them, and the `lenses:` block naming the views they were not given.

**The views themselves are pruned too, not just the slides.** A `--lens brief` export
carries `brief` and nothing else: the front matter's `lenses:` block names only the views
you exported, and each kept slide's `_lens` tag names only those views. So a withheld
view's id, its human label (which is prose you wrote — "Board only — restructuring"), its
approval digest and its per-slide membership are all absent from the file, not merely
absent from the switcher. `--lens-source full` is one exception, and it is you asking
for the whole deck by name; `--lens full` on its own is the other, for the same reason.

**A `_lens` you QUOTED is prose, not membership.** A comment is a directive only when it
opens its line — which is exactly when the renderer makes one of it — so a backticked
`` `<!-- _lens: ask -->` `` example, a fenced one, or one written mid-sentence is left
alone by every reader in the chain, and by the export that rewrites tags. A slide teaching
the syntax exports intact. (It did not always: three attempts to detect quoted text
directly each shipped something worse, including one that gutted the example to two bare
backticks. Adopting the renderer's own rule removed the shape instead of guarding it.)

**Write the membership tag on a blank line of its own.** Not for style — because a tag wedged
into surrounding text usually cannot be removed. Deleting a line joins the blocks around it:
a tag between two paragraphs merges them, a tag above a `===` turns the paragraph before it
into a heading, a tag between two lists welds them into one. Six attempts to decide from the
text alone which removals are safe each corrupted a real deck, so the export stopped
deciding: it renders the slide with the engine's own parser before and after, keeps the
prune only if the two renders match, and otherwise leaves your text exactly as you wrote
it. (A seventh compared parse TOKENS instead of the render, which is a weaker question —
a link reference definition emits no token at all, so deleting the line above one killed
the definition and printed the URL on the slide while the check reported no change.)

**And then it refuses rather than leaking.** A tag it could not remove still names a view the
recipient is not getting, so nothing is written:

> `error: reader view 'internal' is unavailable (unprunable) — a slide still names a view
> this export does not carry, in a tag this export will not rewrite — either it shares its
> line with other text, or removing it would change how the slide renders. Give the tag a
> line of its own with a blank line above and below, clear of any list`

A blank line above and below the tag is the shape most likely to survive, and it is where
Lattice itself writes one — though not a guarantee: a comment at column 0 also TERMINATES a
list, so a tag blank-wrapped between two lists cannot be removed without welding them into
one and renumbering the second, and that refuses. Up to three spaces of indent and any
trailing space are fine; **four spaces or a tab is not** — CommonMark makes that an
indented code block, so the tag is typeset rather than read, and it neither prunes nor
counts as membership. A tag naming only views you ARE exporting is left alone and ships as
written — the refusal is about disclosure, not tidiness.

**Two more things an export refuses, both about the deck AROUND a slide.** A slide you keep
can render differently once the slides you dropped are gone: a `footer:`, `header:`,
`class:`, `paginate:` or `backgroundColor:` directive applies *from that slide onward*, a
`[ref]: url` link definition resolves across the whole deck, and a `<style>`, `<script>` or
`<link>` reaches every slide wherever you wrote it. Set one of those on a slide a view
excludes and the kept slides silently change — a `CONFIDENTIAL` footer disappearing from the
very file you are sending, or, with `<style>`, a paragraph you had hidden coming back in it.
The export renders the deck both ways, compares each kept slide against itself, and refuses
rather than shipping the difference. Put deck-wide settings in the front matter, or on a
slide every view keeps.

**And a third: a deck that carries CSS of its own cannot be projected at all.** Write
`section:nth-of-type(3) p { display: none }` — hide the paragraph on slide 3 — and export a
view that drops slides before it, and the slide that *becomes* number 3 is a different one.
A paragraph you had hidden can come back in the file you send; a classification marking can
land on a slide you never marked. This is the one thing comparing the two renders cannot
show you, because nothing textual moves: the stylesheet is identical in both files, and so
is every slide's markup. Only which slide the rule counts to has changed.

So a reducing view refuses when your deck carries any CSS of its own — a front-matter
`style:`, a `<style>` anywhere in the deck, or a `<link rel="stylesheet">`.

**That is deliberately blunt, and it is blunt because the sharp version does not work.**
Three checks were built to tell dangerous CSS from harmless CSS. One read the rules and
asked how they were spelled; it refused `p:not(:last-child)` and missed `section[id="3"]`.
One asked a browser which slides each rule selects; it was walked past by CSS nesting,
`@scope`, `@import`, a `<link>` and a `<style>` inside an inlined SVG. One compared what a
reader sees in both renders; it was walked past by `display:none` on a wrapper element, by
`color: transparent`, by `font-size: 0`, and by a hidden image. Each of those checks had to
enumerate something with no end to it. "Does this deck carry CSS?" has an end to it, because
you cannot write a positional rule without writing CSS.

**The cost, measured:** 2 of the 150 decks this repo ships carry CSS of their own, and both
were already refused for unrelated reasons. `--lens full` is unaffected — it keeps every
slide in place, so nothing can land anywhere new.

**The fix, when it refuses:** move the CSS into a theme, or style the slide through a class
you set on it — `<!-- _class: hushed -->` and `section.hushed …`. A class travels with the
slide instead of counting to it.

**And your `captions:` travel with the slides.** The block is keyed by slide number, so a
projection renumbers it: entries for withheld slides are dropped, and the rest are
renumbered to their new positions. Before that, a withheld slide's caption shipped in the
file and — with `--captions` — was read aloud over a different slide.

**Two things the prune deliberately does NOT do.** It never writes an approval digest: the
views in a projected deck ship without `approved:`, so re-importing the artifact reads them
as `unapproved` — which is true, because a machine reduced the deck and your approval
described it before the reduction. (An earlier version re-stamped them, which made the
projection self-certifying: the prune rewrites your slide text, so a hash taken afterwards
would have blessed a damaged deck as approved.) And `--lens full` on its own is the
identity — it changes nothing, registry included. A `full` recipient was denied nothing, so
there is no disclosure to close; naming views alongside it (`--lens full,brief`) is a real
selection and does prune.

**A projection that cannot re-split refuses.** The baked view map is indexed by position,
so a slide lost or gained between the projection and the emitted file shifts every view
after it — the failure that shows a reader a slide their view excludes. The export
re-splits what it wrote, checks it against what it said it kept, and writes nothing on a
mismatch.

**`--lens-default <id>` picks the view the file opens on.** Without it the deck's own
`lens-default:` decides, and only if the deck names no default (or names one you are not
exporting) does it fall back to the first id you typed. Argv order is already spoken for —
it is what the dropdown lists — and the opening view is a real editorial choice (the board
gets the brief, the analyst gets the evidence), so the order you happened to type is the
last thing consulted, not the first. Naming a view the export does not carry is a refusal,
not a fallback: otherwise you would ship a correct-looking file that opens on the wrong
view and never be told.

**The switcher is a dropdown, not a row of buttons.** A view's name is your own noun and
there is no icon that could stand for one, so the control has to show words — and a button
per view sizes the whole top bar to how many views you declared and how long you named
them. One `<select>` costs one control however many views ship, keeps the full names in
the platform's own picker (a full-screen list on a phone), and flexes with the bar instead
of budgeting it.

## Depth — rungs and cuts

Reader views are two different kinds of thing, and only one of them has a "deeper":

- **Rungs** are altitudes in a single containment-checked chain — each contains the
  one below, so going deeper is always *additive* and a reader never loses a slide
  they just read. Today `brief` ⊂ `evidence` ⊂ `full`.
- **Cuts** are arbitrary subsets with no order and no containment — `ask` (one
  slide) and `story` (a narrative slice that keeps the chapter dividers `evidence`
  drops). You land on a cut or you are handed one; you never escalate from one.

`kind: rung` on a `LensDef` is what declares an altitude. **Absent means `cut`** — a
view that never claimed to nest promises nothing, so a custom view, or one a deck
already wrote out for itself, is never enrolled in a ladder it was not designed for.
`full` is always the top rung whatever its record says; read the effective value
through `lensKind`, never off the field.

**That default does not mean "nothing changes for anyone."** The workspace starters
ship `kind: rung`, because `brief` and `evidence` are exactly the pair that provably
nests — so a deck inheriting the default reader views is in a ladder from the moment
this landed, and a rewrite writes `kind: rung` into its block. If its hand-tagged
membership happens to break the nesting, the panel now reports it where it was
silent before. That is the validator doing its job, not a regression — but it *is* a
real change for the default population, and an earlier draft of this page claimed
otherwise.

**Altitude is derived, not declared.** `ladderRungs` orders the rungs by what they
actually project — narrowest first, `full` last — because containment *is* the
order: a lower rung is a strict subset, so it is strictly smaller. `order:` is a
picker position and deliberately not this, so re-numbering the panel never re-orders
the depth chain, and a half-tagged rung sits low and rises as it fills instead of
being wrong until some separate number is updated.

**Containment is the invariant, and `validateLadder` enforces it.** Every rung must
contain the rung below it; a slide that escapes is an `error`-level
`ladder-containment` diagnostic naming that slide, because the fix is per slide (tag
it into the deeper view, or drop it from this one). The Reader views panel shows
these on the offending view. This is the same rule that neutralizes the finding
which deferred `includes:` — a cross-polarity include that balloons a low rung is
not a case to be restricted, it is a ladder violation the validator reports.

**A "go deeper" step is `deeperLens`, and it fails closed.** It walks up the ladder
and returns the first rung that is reader-eligible *and* strictly contains the
current view — so an unapproved or non-nesting middle rung is stepped over rather
than switching the affordance off, and a broken ladder makes the step go quiet
rather than lie. A cut, `full`, and an unknown id all return `undefined`. **The
affordance itself is not built yet** — `deeperLens` is the read-path primitive it
will be built on; nothing in Present offers a deeper step today.

Still specified but unbuilt: **`includes:`**, the delta-authoring form where a rung
declares its parent and tags only what it *adds*
(`engineering/decisions/2026-08-25-lens-view-defaults-and-depth.md` §4.2). Until it
ships, a rung is tagged in full like any other view.

**The cost of a ladder, stated plainly.** Each rung is its own approval unit with
its own hash, and because a rung contains its parent, editing a slide in `brief`
de-approves `brief` *and every rung above it*. That is correct — the approved
content genuinely changed — and it is a real tax that argues for two or three rungs,
never five.

---

## Where it lives

- **The library** (pure, framework-free, zero-dependency, no DOM):
  `docs/src/lib/lente/` — `types.ts` (the `LensDef`), `tags.ts` (the `_lens`
  grammar + `applyTag`), `registry.ts` (parse/emit the `lenses:` block — Lente is
  the *sole* writer), `project.ts` (the read path + `lensEligibility` +
  `approvalHash` + the ladder: `lensKind` / `ladderRungs` / `lensEscapees` /
  `deeperLens`), `suggest.ts` (the 4 archetype rules), `validate.ts` (including
  `validateLadder`, the containment check), `hash.ts`.
- **Studio integration**: `lens-archetypes.ts` (the archetype catalog),
  `workspace-lenses.ts`, `LensesPanel.tsx` (the human-in-the-loop UI),
  `lens-picker.tsx` / `PresentOverlay.tsx` (the reader switchers).
- **Engine touch**: `_lens` is a flag directive — tags are **stripped** from
  exported HTML/PDF, so membership never leaks into output bytes.
- **Export**: `lib/core/lens-export.mjs` — the bake-time projection behind `--lens`,
  over the same `lensEligibility` read path and the engine's own slide splitter.

---

## Recipe

**The normal path — via the Studio Lenses panel:**

1. **Add** a reader view from the archetype menu → it arrives empty + unapproved.
2. **Suggest** → the rule table proposes members (instant, no AI); accept all or
   toggle slides by hand.
3. **Preview** the reader's actual deck — this is the approval gate; Approve stays
   locked until you've previewed the *current* membership.
4. **Approve** → binds the content hash into the `lenses:` block. Only now is the
   view reader-eligible. Status flows Empty → Draft → Approved, flips to Edited on
   any change, Staged when hidden.

**By hand — defining a custom lens type:**

1. Add the block to front matter:
   `lenses:\n  myview: { label: "My view", base: none }`. Add `kind: rung` **only**
   if it is a genuine altitude — a strict superset of the rung below it — because
   `validateLadder` will hold you to that.
2. Tag member slides: `<!-- _lens: myview -->` (or `-myview` on a `base: all`
   lens).
3. To ship a suggester for it, add an entry to `SUGGESTERS` in `suggest.ts` keyed
   by the id, and (for Studio) an archetype in `lens-archetypes.ts` — the id must
   match across both.
4. Approve through Studio so `approvalHash` stamps it — a guessed or copied digest
   will not match the projection it is supposed to bind, and the lens stays
   unavailable. This is ergonomics, not a barrier: the hash is unkeyed, so anything
   holding the source can compute the right one. What makes the stamp mean something
   is that a person pressed Approve, not that the digest was hard to produce.

---

## The contract / skeleton

Front matter — the registry block:

```yaml
---
title: Q3 Board Review
lens-default: brief          # the LANDING view — where a reader starts (default: full)
lenses:
  brief:    { label: "Bottom line",  base: none, kind: rung, approved: "sha256:…" }
  ask:      { label: "The ask",      base: none, single: true, hidden: true }
  evidence: { label: "Show the work", base: all, kind: rung, hidden: true }
---
```

`kind: rung` enrolls a view in the depth ladder; omit it and the view is a cut,
which is the right default for anything that is not a strict superset of the rung
below it.

Per-slide tags mirror the `_class` grammar (lowercase, space-separated tokens):

```markdown
<!-- _class: kpi -->
<!-- _lens: brief ask -->
# Revenue up 38% YoY
```

```markdown
<!-- _class: appendix-detail -->
<!-- _lens: -evidence -->     ← opt this slide OUT of the base:all evidence lens
```

Programmatic read (host code): `parseLensRegistry(fm)` →
`lensSlides(slides, reg, 'brief')` / `readerLenses(slides, reg)` /
`lensEligibility(...)`.

---

## What good looks like

- A `brief` lens of 5 slides — the two bookends, the headline metric, the ask —
  approved, and set as the deck's landing view via `lens-default: brief`.
- An `evidence` lens (`base: all`) that drops only the logistics and imagery slides
  via `-evidence` tags, so it stays clean as slides are added.
- Every reader consumer routed through `lensEligibility`, so a drifted lens shows an
  honest "unavailable" state rather than the wrong slides.

---

## What bad looks like

- `approved: true` — blind to staleness. It survives every later edit, so it keeps
  asserting a human vetted content that has since changed. Use the content hash.
- A reader landing on the full deck when their lens is unavailable — shows slides the
  author never approved for that view, on the one path where nobody vetted the result.
- Renaming `brief` → `summary` in place — orphans every `_lens: brief` tag. Ship a
  migration instead.
- The suggester writing tags or reaching a reader directly.
- An `ask`/single lens guessing a member when confidence is low — it should emit
  nothing.
- Uppercase `_Lens` — the grammar is locked to lowercase; wrong case both leaks and
  drops membership.

---

## Ship checklist

- [ ] `id` stable and referenced by every tag; only `label` edited over time.
- [ ] Membership stored as the shortest correct diff from `base`.
- [ ] Every reader consumer goes through `lensEligibility` (fail-closed).
- [ ] `approved` is a content hash written by Approve; re-checked at read.
- [ ] `lensPairs` stays a predicate filter over author order (keeps number-keyed
      captions correct under reorder).
- [ ] A custom lens's suggester id matches across `suggest.ts` + `lens-archetypes.ts`.
- [ ] `kind: rung` claimed only where containment actually holds — `validateLadder`
      silent on the deck.
- [ ] Co-located unit tests green (round-trip `parseLensRegistry(emitRegistry(x)) ≡ x`).

---

## Common mistakes

1. **`approved: true`** instead of a content hash.
2. **Falling open** to the full deck on an unavailable lens.
3. **Renaming a lens id in place.**
4. **Letting the suggester write** or reach a reader.
5. **Guessing** on low-confidence single/`ask` lenses.
6. **Uppercase tags.**
7. **Declaring a rung that does not nest** — a "deeper" that drops a slide the
   reader just read is the exact failure containment exists to prevent. If the two
   views merely overlap, they are cuts.
8. **Confusing a lens with a theme/finish/mode** — a lens changes *which slides*,
   never their look. (`tier:` short/standard/full is a separate, adjacent
   progressive-disclosure feature, not Lente.)

---

## Canonical sources

- `docs/src/lib/lente/README.md` — the mental model + a 60-second programmatic
  example.
- `docs/src/lib/lente/types.ts` — the `LensDef` anatomy.
- `docs/src/lib/lente/project.ts` — the read path, eligibility, content hash (the
  safety core).
- `docs/src/lib/lente/tags.ts` — the `_lens` tag grammar and `applyTag`.
- `docs/src/lib/lente/suggest.ts` — the four archetype rules.
- `docs/src/components/studio/lens-archetypes.ts` — the archetype catalog (and each
  view's `kind`).
- `docs/src/components/studio/lens-containment.test.ts` — proves the rungs/cuts
  split against the real suggester and the real component catalog, and that the
  declared kinds match it.
- `engineering/decisions/2026-07-13-lente-reader-lenses.md` — the full design
  rationale (note: its "not started" status line is stale — the feature ships).
- `engineering/decisions/2026-08-25-lens-view-defaults-and-depth.md` — the register
  split, the landing view vs. a pin, and §4 the depth model.
