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
  order?: number;    // picker position; default = registry order
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

The four built-in **archetypes**: `brief` (Bottom line, base none), `story` (The
story, base none), `evidence` (The evidence, base all), `ask` (The ask, base none,
single).

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
share/export channel rather than in the deck, and it is **not built yet**. When it is,
remember what it can honestly claim: client-side projection **hides, it does not
withhold** — a reader who views source sees every non-member slide's bytes. A pin is a
scoping convenience, never a confidentiality control.

## Depth — rungs and cuts (designed, not yet built)

Reader views are two different kinds of thing, and only one of them has a "deeper":

- **Rungs** are altitudes in a single containment-checked chain — each contains the
  one below, so going deeper is always *additive* and a reader never loses a slide
  they just read. Today `brief` ⊂ `evidence` ⊂ `full`.
- **Cuts** are arbitrary subsets with no order and no containment — `ask` (one
  slide) and `story` (a narrative slice that keeps the chapter dividers `evidence`
  drops). You land on a cut or pin it; you never escalate from one.

Nothing in the schema expresses this yet — the model, the containment invariant, and
the delta-authoring form (`includes:`) are specified in
`engineering/decisions/2026-08-25-lens-view-defaults-and-depth.md` §4. Until they
ship, a "deep dive" is authored as an ordinary second view, tagged in full.

---

## Where it lives

- **The library** (pure, framework-free, zero-dependency, no DOM):
  `docs/src/lib/lente/` — `types.ts` (the `LensDef`), `tags.ts` (the `_lens`
  grammar + `applyTag`), `registry.ts` (parse/emit the `lenses:` block — Lente is
  the *sole* writer), `project.ts` (the read path + `lensEligibility` +
  `approvalHash`), `suggest.ts` (the 4 archetype rules), `validate.ts`, `hash.ts`.
- **Studio integration**: `lens-archetypes.ts` (the archetype catalog),
  `workspace-lenses.ts`, `LensesPanel.tsx` (the human-in-the-loop UI),
  `lens-picker.tsx` / `PresentOverlay.tsx` (the reader switchers).
- **Engine touch**: `_lens` is a flag directive — tags are **stripped** from
  exported HTML/PDF, so membership never leaks into output bytes.

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
   `lenses:\n  myview: { label: "My view", base: none }`.
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
  brief:    { label: "Bottom line",  base: none, approved: "sha256:…" }
  ask:      { label: "The ask",      base: none, single: true, hidden: true }
  evidence: { label: "Show the work", base: all, hidden: true }
---
```

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
- [ ] Co-located unit tests green (round-trip `parseLensRegistry(emitRegistry(x)) ≡ x`).

---

## Common mistakes

1. **`approved: true`** instead of a content hash.
2. **Falling open** to the full deck on an unavailable lens.
3. **Renaming a lens id in place.**
4. **Letting the suggester write** or reach a reader.
5. **Guessing** on low-confidence single/`ask` lenses.
6. **Uppercase tags.**
7. **Confusing a lens with a theme/finish/mode** — a lens changes *which slides*,
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
- `docs/src/components/studio/lens-archetypes.ts` — the archetype catalog.
- `engineering/decisions/2026-07-13-lente-reader-lenses.md` — the full design
  rationale (note: its "not started" status line is stale — the feature ships).
