# authority-chain

> Provenance chain — statute to regulation to guidance to case, walked in order.

**Function** progression · **Form** timeline · **Substance** structure

**Tags** `regulation` · `citation` · `sequence`

Use when the audience needs to see how a rule descends: what the statute says, how the agency implemented it, what guidance interpreted it, and what cases have applied it. Ordered list because the order is the argument.

## Agent contract

**Capacity** ~4 items (crowds past 5, overflows past 6) — past that, split across slides (auto with autosplit: on) / statute-stack.

**Density** aim ~14 words per item; past ~22 it reads as a wall of text — one clause per tier.

### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `heading` | `h2` | yes | Slide heading naming the rule whose chain is being walked. |
| `tiers` | `ol > li` | yes | Ordered list of authority tiers (Statute, Regulation, Guidance, Case) — not hyperlinks. Each leads with the tier label; nested ul carries the citation (code) and the one-line gloss. |

## When to use

- **Provenance is the argument.** Use when the audience needs to see exactly where a rule comes from and how it has been interpreted. The chain itself is the evidence that the obligation is grounded, not invented.
- **Tier labels carry the read.** Statute, regulation, guidance, case — each tier has a different legal weight. The left-rail label tells the audience what kind of source they are looking at before they read the citation.
- **Three to five tiers, no more.** The chain reads top-to-bottom on a single canvas. Past five rows the connectors compress and the tier labels lose room. Group sub-cases into the parent row's gloss or split into two slides.

## When NOT to use

- **Flat list of citations.** If the rows have no tier hierarchy, use `list-criteria` or `regulatory-update`. authority-chain earns its chrome only when the descent from statute to case is the point.
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
- [`list-criteria`](../../progression/list-criteria/list-criteria.docs.md) — flat enumeration of requirements without tier hierarchy
- [`list-steps`](../../progression/list-steps/list-steps.docs.md) — the rows are procedural steps rather than authority tiers

## Demo deck

See [authority-chain.gallery.light.pdf](./authority-chain.gallery.light.pdf) for rendered examples of every variant.
