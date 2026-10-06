# authority-chain

> Provenance chain — statute to regulation to guidance to case, walked in order.

**Function** progression · **Form** timeline · **Substance** structure

**Tags** `regulation` · `citation` · `sequence`

Use when the audience needs to see how a rule descends: what the statute says, how the agency implemented it, what guidance interpreted it, and what cases have applied it. Ordered list because the order is the argument.

## Agent contract

**Capacity** ~4 items (crowds past 5, overflows past 6) — past that, split across slides (automatic) / statute-stack. Five full rows (a one-word tier label, its citation, a one-line gloss) fit a laptop slide and a sixth clips; six fit only as label-and-citation rows with no gloss. Past six tiers the chain overflows a portrait box; a split run carries a derived “governs ↓ / under ↑” signal — a hierarchy, never a temporal “next” (§0b connected members). Pacing stays the authored split.perPage: the signal reads across pages whatever the pacing.

**Density** aim ~14 words per item; past ~22 it reads as a wall of text — one clause per tier.

**By venue** (`venue:`, ~14 words each) it holds laptop ~5 · huddle ~4 · conference ~3 · hall ~2 items. At ~6 words each: 5 · 4 · 4 · 3. Past the room's number the slide still renders at the venue's size, because a venue is a fixed setting the engine never shrinks to fit, so it clips: `lint:deck` warns first (`capacity-scale`), and the export's `⚠ OVERFLOW` line and the Studio's ring name it. Measured at a wide @size by `tools/calibrate-capacity.js`; see engineering/decisions/2026-09-25-font-scale-fit.md.

### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `heading` | `h2` | yes | Slide heading naming the rule whose chain is being walked. |
| `tiers` | `ol > li` | yes | Ordered list of authority tiers (Statute, Regulation, Guidance, Case) — not hyperlinks. Each leads with the tier label; nested ul carries the citation (code) and the one-line gloss. |

### Variant decision rule

- **default (no modifier).** A plain descent from statute to case — the base look for a straightforward, single-line chain.
- **`branching`.** The authority forks — several regulations, guidance, or cases all trace back to the SAME originating statute — shown as one tier with multiple citations instead of a strict one-to-one descent.
- **`trail`.** The descent should read as a lightweight breadcrumb rather than a heavier, chrome-forward chain. Each tier gets a column, so keep citations short or breakable at spaces; a large venue narrows the column (13 characters a word at hall with four tiers).
- **`pyramid`.** The tiers carry different legal weight and that hierarchy of force should be visually apparent, not just their order — tier width narrows from statute down to case.
- **`bracket`.** The tiers should read as one clamped, continuous block — a tighter, seamless rail (zero gap, squared corners, a doubled outer edge) instead of the default's separated cards.

### Common mistakes

- **Reversing the order of the nested citation and gloss lines, or writing the citation as plain text instead of inline code.** The citation chip is matched by `li:first-child:has(> code:only-child)` — it must be the FIRST nested item and contain ONLY inline code; a citation written second, or as plain text, doesn't get the citation-chip treatment.
- **A `trail` citation or tier label with a word longer than its column.** A trail column is the stage split by the tier count, so its limit is the longest WORD. A citation wraps at its spaces, after a hyphen and around a dash (`16 C.F.R.` / `Part 312`); a word between those cannot break. Four tiers hold a 26-character citation word at laptop, 23 at huddle, 17 at conference and 13 at hall, and a tier label two to four characters fewer (it is bold and tracked). A longer word widens its column, squeezes the others, and past their slack pushes the last column off the slide. `lint:deck` names it as `trail-budget`. Break the citation at a space, or use the default chain, whose body runs the full width.

## When to use

- **Provenance is the argument.** Use when the audience needs to see exactly where a rule comes from and how it has been interpreted. The chain itself is the evidence that the obligation is grounded, not invented.
- **Tier labels carry the read.** Statute, regulation, guidance, case — each tier has a different legal weight. The left-rail label tells the audience what kind of source they are looking at before they read the citation. Every row shares one rail: it is the same width down the chain and widens to the longest single word in any label (Enforcement), so every citation starts at the same left edge.
- **Three to five tiers; six only without glosses.** The chain reads top-to-bottom on a single canvas. A full row — a one-word tier label, its citation and a one-line gloss — holds five tiers on a laptop slide, and the sixth clips. Six tiers fit only as label-and-citation rows with no gloss. Keep each label to one word, or a short pair like Case law: a label that wraps in the left rail (Agency guidance) costs every row a line, and the chain then holds four. Past that, group sub-cases into the parent row's gloss or split into two slides. A chain that does not fit runs long at its tail and is reported as clipped; a row never shrinks below its own text, so one card never draws over the next.

## When NOT to use

- **Flat list of citations.** If the rows have no tier hierarchy, use `list takeaway numbered` or `regulatory-update`. authority-chain earns its chrome only when the descent from statute to case is the point.
- **Missing citation chip.** The inline-code citation is the row's anchor; without it the gloss reads as opinion. Always cite, even for guidance and case rows.
- **Out-of-order tiers.** The chain reads as a descent: statute first, case last. Reversing it or skipping a tier breaks the metaphor the audience is using to follow you.

## Authoring

```markdown
<!-- _class: authority-chain -->

## Rule name — the chain, tier by tier.

1. Statute
   - `Citation reference`
   - One-line gloss naming the body that issued it and what it does.
2. Regulation
   - `Citation reference`
   - One-line gloss naming the agency rule.
3. Guidance
   - `Citation reference`
   - One-line gloss naming the staff guidance.
4. Case
   - `Citation reference`
   - One-line gloss naming the precedent.
```

## Anatomy

```text
┌─────────────────────────────────────────┐
│  header                                 │
│  Authority descent heading.             │
│                                         │
│  ┌────────────┐                         │
│  │ TIER 1     │  § Statute — citation   │
│  │ TIER 2     │    Regulation — cite    │
│  │ TIER 3     │    Case law — cite      │
│  └────────────┘                         │
│  footer                           1/19  │
└─────────────────────────────────────────┘
```

## Variants (component-specific)

### `branching` — branching

The chain forks.

```markdown
<!-- _class: authority-chain branching -->

## branching forks the chain where authority splits.

1. Statute
   - `15 U.S.C. §6501` COPPA, 1998
   - `16 C.F.R. Part 312` FTC implementing rule
   - `FTC Six-Step Compliance Plan` staff guidance
   - `In re Epic Games · 2022` $245M consent order
   - `In re YouTube/Google · 2019` $170M consent order
```

### `trail` — trail

A breadcrumb walk.

```markdown
<!-- _class: authority-chain trail -->

## trail walks the chain as a breadcrumb.

1. Statute
   - `15 U.S.C. §6501`
   - Verifiable parental consent for under-13 data.
2. Regulation
   - `16 C.F.R. Part 312`
   - FTC implementing rule.
3. Guidance
   - `FTC Six-Step Plan`
   - Cited in every consent order.
4. Case
   - `Epic Games · 2022`
   - $245M consent order.
```

### `pyramid` — pyramid

Tiers weighted by force.

```markdown
<!-- _class: authority-chain pyramid -->

## pyramid weights the tiers by force.

1. Statute
   - `15 U.S.C. §6501`
   - Congress, 1998 — consent for under-13 data.
2. Regulation
   - `16 C.F.R. Part 312`
   - FTC implementing rule.
3. Guidance
   - `FTC Six-Step Plan`
   - Staff guidance, non-binding.
4. Case
   - `In re Epic Games · 2022`
   - $245M consent order.
```

### `bracket` — bracket

Tiers grouped by actor.

```markdown
<!-- _class: authority-chain bracket -->

## bracket groups the tiers by actor.

1. Treaty
   - `Charter of Fundamental Rights, Art. 8`
   - EU primary law — protection of personal data is a fundamental right.
2. Regulation
   - `GDPR (EU) 2016/679`
   - Directly applicable across all member states; sets the Art. 83 fine tiers.
3. Guidance
   - `EDPB Guidelines 04/2022`
   - Harmonized methodology for calculating administrative fines.
4. Decision
   - `DPC v. Meta · 2023`
   - €1.2B fine — the largest GDPR penalty to date.
```

## Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [design/design-system.md §6.5](../../../../design/design-system.md#65-universal-variants--three-tiers) for the catalog.

## Related components

- [`regulatory-update`](../../legal/regulatory-update/regulatory-update.docs.md) — period-bounded changelog rather than a single rule's lineage
- [`list`](../../inventory/list/list.docs.md) — `takeaway numbered`: flat enumeration of requirements without tier hierarchy
- [`list-steps`](../../progression/list-steps/list-steps.docs.md) — the rows are procedural steps rather than authority tiers

## Demo deck

See [authority-chain.gallery.light.pdf](./authority-chain.gallery.light.pdf) for rendered examples of every variant.
