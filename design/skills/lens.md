# Skill — Create a lens

> Define a reader lens (Lente): a saved, author-approved *subset* of one deck's
> slides, projected at a chosen altitude (bottom-line / story / evidence / the-ask)
> without editing the source.

**Read this when** you are asked to create a reader view, an exec summary view, a
"show me just the ask" projection, or any saved subset of a deck. **You'll produce**
a `LensDef` in the deck's front-matter `lenses:` block, per-slide `_lens` tags, and
an approval hash — usually via the Studio Lenses panel.

---

## The 10/10 bar

A lens changes **which slides are shown**, never their look or content. A 10/10
lens:

- **Fails closed.** An unavailable lens (unknown / unapproved / drifted / empty /
  hidden) shows *nothing extra* — never a silent fall-through to the full deck,
  because a scoping lens can be a deliberate redaction.
- **Is content-bound.** Approval is a **content hash**, not a boolean. Any later
  edit, reorder, or hand-forgery changes the hash, so the lens de-approves itself
  for every consumer until re-approved.
- **Stores membership as a diff from its base** — a slide carries a tag only where
  it *differs* from the lens's base, so the real deck stays clean.
- **Keeps the read path and the suggest path apart** — the projector never imports
  the suggester; the suggester only proposes and writes nothing; the only bridge is
  a human pressing Approve.

Bad looks like: `approved: true` (forgeable, staleness-blind); falling open to the
full deck when a lens is unavailable (leaks redacted slides); renaming a lens `id`
in place (orphans every tag); a lens that guesses membership with low confidence
instead of emitting nothing.

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
  approved?: string; // a content hash "sha256:…" written on human Approve — the reader gate
}
```

**`base` is the core idea:**

- `base: 'none'` (**additive**) — a slide is OUT unless it opts IN with
  `<!-- _lens: brief -->`. Used by `brief`, `story`, `ask`.
- `base: 'all'` (**subtractive**) — every slide is IN unless it opts OUT with
  `<!-- _lens: -evidence -->`. Used by `evidence`.
- `full` is neither — the implicit identity lens, always present, un-removable, the
  only lens a reader lands on by default (safe because it's the whole deck).

The **read path** (`project.ts`) computes a reader's view from approved tags +
registry via one predicate filter over the author-ordered slides. The **suggest
path** (`suggest.ts`) is a transparent, no-AI rule table over each slide's `_class`
that *proposes* membership and writes nothing. A human pressing **Approve** in
Studio is the only thing that writes tags and stamps the content hash.

The four built-in **archetypes**: `brief` (Bottom line, base none), `story` (The
story, base none), `evidence` (The evidence, base all), `ask` (The ask, base none,
single).

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
4. There is no way to legitimately hand-type the approval hash; approve through
   Studio so `approvalHash` stamps it. A hand-typed hash won't match and the lens
   stays unavailable.

---

## The contract / skeleton

Front matter — the registry block:

```yaml
---
title: Q3 Board Review
lens-default: brief          # the lens a shared/pinned link opens in (default: full)
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
  approved, opening by default via `lens-default: brief`.
- An `evidence` lens (`base: all`) that drops only the logistics and imagery slides
  via `-evidence` tags, so it stays clean as slides are added.
- Every reader consumer routed through `lensEligibility`, so a drifted lens shows an
  honest "unavailable" state rather than the wrong slides.

---

## What bad looks like

- `approved: true` — a forgeable boolean, blind to staleness. Use the content hash.
- A reader landing on the full deck when their lens is unavailable — leaks slides a
  redaction lens deliberately hid.
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
