# Skill — Create a component

> Add a new `<!-- _class: X -->` layout to the catalog: a manifest, palette-blind
> CSS, an optional transform, and the generated docs/galleries that flow from them.

**Read this when** an existing component can't express a slide's shape and you
need a genuinely new layout. **You'll produce** a component folder under
`lib/components/<bucket>/<name>/` whose manifest is the contract everything else
generates from. (For a data visualization, use `chart-component.md` instead.)

---

## The 10/10 bar

A 10/10 component:

- Sits on a **sanctioned `function.form` coordinate** — it doesn't invent a shape.
- Has a **tight capacity + density contract** with a real `escalateTo` target and a
  `stressDoc` proving the ceiling.
- CSS is **fully palette-blind** (`var(--token)` only), **margin-free**
  (padding/gap), **unlayered** (no `@layer` wrapper — see cascade.md), anchored on `> .cell-stage`, and
  **covers all render paths in one file**.
- Ships **rich prose**: 3–4 `whenToUse`, 3–4 concrete `antiPatterns` (naming the
  escalation target), `related` with `when` clauses, and **a `variantDocs` entry
  for every declared variant**.
- **Reuses shared kernels** rather than cloning (HARD RULE #15).

Mediocre / gate-violating looks like: hex in the CSS; `margin` for spacing; a
variant with no `variantDocs`; tags that restate the axis; a capacity axis you
can't actually count in the sample; CSS landed on only one render path; hand-edited
generated docs.

---

## Mental model — Frame · Cell · Tile

**A component is the four-axis grammar one scale down.** Read this carefully — it
is the load-bearing idea:

- **Form** resolves into a tree: a **Frame** is a *slicer* that carves a box into
  **Cells**; each **Cell** is a *typed slot* (empty, sized, positioned); a **Tile**
  is the *filler* that fills one Cell.
- A component **selects a Frame** (its `form:` value — `grid`, `split`, `panel`,
  `ledger`, …), and **binds Substance into the Cells** that Frame produces.
- Its **slots ARE Cells**; the author's markdown is the **Tile** that fills each.
  The component renders into the slide's main stage Cell (`.cell-stage`).
- Frames do **not** nest inside content cells — recursion was considered and
  rejected. A component's internal layout is CSS within its stage Cell.

So building a component is: declare which Frame you select, which slots (Cells) you
expose, and write CSS that lays those slots out inside `.cell-stage` — palette-blind
and margin-free, because the stage Cell's height math (the overflow probe) depends
on clean `padding`/`gap` measurement.

**Substance** decides whether you need code beyond CSS:

- `prose` — pure CSS on native markdown DOM. No transform.
- `structure` — nested lists with conventions. Often *still CSS-only* (the CSS
  targets `> .cell-stage > ul > li`); only add a transform if you must *rebuild*
  the DOM.
- `series` / `graph` — SVG output; see `chart-component.md`.

---

## Where it lives

A component is self-contained in `lib/components/<bucket>/<name>/`:

```text
<name>.manifest.json      ← the contract (schema-validated); source of truth
<name>.styles.css         ← palette-blind CSS, UNLAYERED (no @layer; cascade.md)
<name>.transform.js       ← ONLY if you must rebuild DOM (structure/series)
<name>.docs.md            ← GENERATED from the manifest — never hand-edit
<name>.gallery.md         ← GENERATED — never hand-edit
<name>.gallery.light.pdf  ← rendered
<name>.gallery.dark.pdf   ← rendered
```

The 13 buckets: `anchor, statement, inventory, comparison, progression, evidence,
imagery, chart, diagram, math, code, legal, connect`. Seven match the function
families; the rest are substance- or domain-defined.

- **Commands**: `npm run new:component -- <name> --bucket <b> --function <f>
  --form <f> --substance <s>` (scaffolds the manifest + CSS stub — the `--`
  separator is required so npm forwards the flags); `npm run build`
  (regenerates docs, galleries, `dist/docs/components.json`, snippets);
  `npm run build:check` + `npm test` (gates).

---

## Recipe

1. **Decide the axes.** "What does the audience leave knowing?" → **Function**.
   "How is it laid out?" → **Form**. "What does the author write?" → **Substance**.
   Pick the disk **bucket**. The `function.form` coordinate must be **sanctioned** —
   pick a form your function already uses (from design-system.md §4's "Used by"
   column); a new combination is a design decision, not a default:

   | Function | Sanctioned forms |
   |---|---|
   | Anchor | bookend, divider |
   | Statement | canvas, panel |
   | Inventory | grid, stack, ledger |
   | Comparison | grid, ledger, matrix, split |
   | Progression | ledger, matrix, timeline |
   | Evidence | canvas, ledger, matrix, scatter, spatial |
   | Imagery | canvas |
2. **Scaffold**: `npm run new:component -- <name> --bucket <b> --function <f>
   --form <f> --substance <s>` (the `--` separator is required, or npm swallows the
   flags and the tool bails). This writes just two files — the manifest (with
   TODOs) and a palette-blind CSS stub.
3. **Fill the manifest** (see the contract below). The empty `tags[]` and any
   declared variant without a `variantDocs` entry **hard-block the build** — fill
   them.
4. **Write the CSS** in `<name>.styles.css`: **unlayered** (no `@layer` wrapper —
   it's inert here and a layered rule loses to unlayered base rules; cascade.md),
   anchor every selector on `section.<name> > .cell-stage`, palette-blind, `padding`/`gap` only.
   Cover the native markdown path *and* the post-processed path in the one file.
   Add `@container lattice (aspect-ratio <= 1.05) { … }` if `adapt.mode: "reflow"`.
5. **If structure/series** and you must rebuild DOM: add `<name>.transform.js` as a
   pure, idempotent string-in/string-out function, and register it in
   `lib/transformers/registry.js` in the right order — wired identically across the
   engine, emulator, and runtime (HARD RULE #1).
6. **Ship a demo deck** `examples/<name>.md` (6–10 slides) + committed PDF (HARD
   RULE #9).
7. **`npm run build`** to regenerate everything, then `npm run build:check` +
   `npm test`.
8. **Graduate** exemplar slides into `test/integration/baseline-decks/gallery.md`
   in a **separate post-review commit** (HARD RULE #8); pixel-check for zero drift.

---

## The contract / skeleton

The manifest is the single source of truth. Required fields: `name`, `function`,
`form`, `substance`, `tags`, `description`, `skeleton`. The rich shape:

```jsonc
{
  "name": "cards-grid",
  "function": "inventory",
  "form": "grid",              // the Frame this component selects
  "substance": "structure",
  "description": "2–4 parallel items, similar weight, scannable in a grid.",
  "purpose": "Use when the audience needs to scan a small parallel set at a glance.",
  "tags": ["overview", "showcase", "summary"],       // 3–5, from the controlled
                                                     // vocabulary; must NOT restate
                                                     // name/function/form/substance
  "capacity": { "axis": "item", "sweet": 3, "soft": 4, "hard": 4,
                "escalateTo": ["list-tabular"], "note": "loses scannability past four" },
  "density":  { "axis": "item", "soft": 15, "hard": 24, "note": "aim ~15 words/card" },
  "adapt":    { "mode": "reflow" },
  "slots": {
    "title":  { "selector": "h2",         "required": true,  "description": "Slide heading." },
    "cards":  { "selector": "ul > li",    "required": true,
                "description": "Each list item is one card. Top bullet = title; nested bullet = body." },
    "insight":{ "selector": "blockquote", "required": false, "description": "Key-insight panel." }
  },
  "skeleton": "<!-- _class: cards-grid -->\n\n## Slide heading.\n\n- First card title\n  - Body text, one sentence.\n",
  "sample":   "…a real prose demo slide…",
  "stressDoc":{ "summary": "at the hard budget", "sample": "…four dense cards…" },
  "variants": ["four", "three"],   // layout-specific ONLY — never universal ones
  "variantDocs": { "four": { "label": "Four", "summary": "…", "sample": "…" } },
  "whenToUse":    [{ "title": "Scan a parallel set", "body": "…" }],
  "antiPatterns": [{ "title": "More than four", "body": "escalate to list-tabular" }],
  "related":      [{ "name": "cards-stack", "when": "when order matters" }],
  "anatomyBlock": "T7-card-grid-2x2"
}
```

The CSS anchors on the stage Cell and stays palette-blind + margin-free. Component
files are **UNLAYERED** — no `@layer` wrapper — because `@layer` is inert here and a
layered rule LOSES to an unlayered base rule regardless of specificity (a layered
`section.X > blockquote` silently loses to the base KEY INSIGHT rule). Match every
other component file: bare selectors, no wrapper. (`engineering/cascade.md`.)

```css
section.cards-grid > .cell-stage { display: flex; flex-direction: column; gap: var(--sp-md); }
section.cards-grid > .cell-stage > ul { display: flex; flex-wrap: wrap; gap: var(--sp-md); }
section.cards-grid > .cell-stage > ul > li {
  width: calc(50% - var(--sp-md) / 2);
  padding: var(--sp-md);                 /* padding, never margin (#20) */
  background: var(--bg-alt);             /* var(--token), never hex (#3) */
  border: 1px solid var(--border);
  color: var(--text-body);
}
@container lattice (aspect-ratio <= 1.05) {
  section.cards-grid > .cell-stage > ul > li { width: 100%; }
}
```

**Variant tiers** — know which is which so you don't list the wrong ones:

- **Tier 1 Universal (46)** — `dark`, `silent`, state markers, tone, insight labels, claim, etc.
  Added automatically; **manifests must NOT list them.**
- **Tier 2 Semi-universal** — `compact`, `accent`, `claim-bleed`. Accepted by
  default; opt out via `excludes`.
- **Tier 3 Family** — `state-markers` (opt in via `families`), `chart` (per
  bucket).
- **Tier 4 Layout-specific** — the manifest's `variants` field (`four`, `numbered`,
  …). Each needs a `variantDocs` entry.

---

## What good looks like

`cards-grid`: `form: grid`, capacity sweet 3 / hard 4 escalating to `list-tabular`,
a `stressDoc` at four dense cards, CSS anchored on `> .cell-stage`, a `@container`
reflow rule that matches its `adapt.mode: "reflow"`, every variant documented, tags
(`overview`, `showcase`, `summary`) that the axes can't carry.

---

## What bad looks like

- `section.cards-grid li { margin: 12px }` — HARD RULE #20; the overflow probe
  can't measure it. Use `gap`/`padding`.
- `background: #f4f4f4` — HARD RULE #3; use `var(--bg-alt)`.
- Declaring `capacity` but no `stressDoc` — the validator rejects it.
- `tags: ["grid", "cards"]` — restates form/name; tags must be complementary.
- Listing `dark` or `compact` in `variants` — those are universal/semi-universal,
  added automatically.
- Landing a transform in `lattice-emulator.js` only — HARD RULE #1; it must run in
  all three paths via the shared kernel.
- Editing `<name>.docs.md` by hand — it's generated; edit the manifest and rebuild.

---

## Ship checklist

- [ ] `function.form` is sanctioned in design-system.md §4.
- [ ] Manifest complete: real `description`, 3–5 complementary tags, `slots`,
      `skeleton`, `sample`, `stressDoc`, `capacity`+`density`, `whenToUse`,
      `antiPatterns`, `related`, a `variantDocs` entry per variant.
- [ ] CSS: **unlayered** (no `@layer` wrapper — cascade.md), anchored on
      `> .cell-stage`, palette-blind, margin-free; covers native + post-processed
      paths; `@container` matches `adapt.mode`.
- [ ] Transform (if any) is pure, idempotent, registered, wired in all three paths.
- [ ] `examples/<name>.md` demo deck (6–10 slides) + committed PDF.
- [ ] `npm run build` run; **no generated file hand-edited**.
- [ ] `npm run build:check` + `npm test` green (validator, page-count assertions,
      stale-output gates).
- [ ] Gallery pages rendered light + dark and looked at.

---

## Common mistakes

1. **`margin` for spacing** (HARD RULE #20) — use `padding`/`gap`.
2. **Hex in CSS** (HARD RULE #3) — use `var(--token)`.
3. **Listing universal variants** in the manifest's `variants`.
4. **A declared variant with no `variantDocs`** — hard build failure.
5. **`capacity` without `stressDoc`**, or a capacity axis you can't count in the
   sample.
6. **Transform on one render path only** (HARD RULE #1).
7. **Hand-editing `<name>.docs.md` / `.gallery.md`** (HARD RULE #2).
8. **Inline `- **Title.** body`** in the sample/skeleton on a card layout (HARD
   RULE #5).
9. **Graduating into `gallery.md` in the same commit** as the feature (HARD RULE
   #8) — do it in a separate post-review commit.

---

## Canonical sources

- `design/design-system.md` — the four axes, §4 the `function.form` matrix, §6.5
  variant tiers, §8.3 the layout-designer procedure, §9 disk layout.
- `design/forms.md` — Frame · Cell · Tile, the slot→Cell map, the flex cell-tree.
- `lib/components/manifest.schema.json` + `lib/components/index.js` — the contract
  and the validator checks.
- `lib/components/inventory/cards-grid/` — the exemplar component (all files).
- `lib/transformers/registry.js` — the transform plugin list and ordering.
- `AGENTS.md`, `dist/docs/components.json` — the machine catalog and agent loop.
