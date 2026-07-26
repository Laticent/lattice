# regulatory-update

> Change log against a baseline — numbered list of statutes/cases/rules with citation, summary, and effective date.

**Function** progression · **Form** ledger · **Substance** structure

**Tags** `changelog` · `compliance` · `regulation`

Use when a quarter's regulatory motion needs a single-slide digest. Each row carries the change name, the citation (inline code), the summary, and the effective-date marker (inline code).

## Agent contract

**Capacity** ~4 items (crowds past 5, overflows past 6) — past that, split across slides (auto with autosplit: on) / list-tabular.

**Density** aim ~14 words per item; past ~22 it reads as a wall of text — one clause per item.

### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `heading` | `h2` | yes | Slide heading framing the period or theme of the changes. |
| `scope` | `p:first-of-type > code` | no | Optional inline-code scope label (e.g. 'Federal · State · International'). |
| `items` | `ol > li` | yes | Ordered list of changes. Each item leads with a plain text name; nested ul carries citation (code), summary, and effective date (code). |

### Variant decision rule

- **default (no modifier).** A plain numbered ledger of changes — the base look, order as authored.
- **`timeline`.** The changes should be read in effective-date order rather than authored or arbitrary order.
- **`priority`.** Only the changes with the highest exposure or impact matter and should be visually ranked, not just listed.
- **`cards`.** Each change deserves its own tile rather than a flowing numbered list — a more scannable, less document-like look.
- **`diff-bands`.** The changes fall into distinct categories of motion (Added/Amended/Repealed/Enforced) that should be visually grouped, not just listed chronologically.

### Common mistakes

- **Placing the scope label after the heading instead of before it, or leaving it unwrapped in backticks.** The scope label matches `p:first-of-type > code` — it must be the section's first line, wrapped in backticks, or it won't render as the kicker above the ledger.
- **Using `diff-bands` without grouping items under `### ` category subheadings.** `diff-bands` expects the items split into separate ordered lists, each preceded by an `### Added`/`### Amended`/`### Repealed`/`### Enforced` subheading — a single flat list under `diff-bands` has no band to shade into.

## When to use

- **Period-bounded digest.** When a quarter or half of regulatory motion needs to land as a single scannable ledger. The audience sees what moved, when it took effect, and where to read it — without flipping through a multi-page memo.
- **Citation is the proof.** Each row anchors on its inline-code citation chip. Without the citation the row reads as opinion; with it, the row earns its place in a compliance brief.
- **Effective-date pill closes the row.** The trailing `Effective Mon YYYY` chip tells the audience whether the change is live, imminent, or final. The pill is the row's call-to-action signal.

## When NOT to use

- **Single rule's lineage.** If the slide walks one rule from statute through case, use `authority-chain`. regulatory-update is a period digest.
- **Past six rows.** More than six items compresses the row gap and the citation chips run out of room. Split by jurisdiction.
- **Missing summary or citation.** Each row needs all three sub-items — citation, summary, effective date. Otherwise the row reads as rumor.

## Authoring

```markdown
<!-- _class: regulatory-update -->

## Headline naming the period or theme.

`Scope label · jurisdiction tier`

1. Change name
   - `Citation reference`
   - Summary in one sentence.
   - `Effective Mon YYYY`
2. Change name
   - `Citation reference`
   - Summary in one sentence.
   - `Effective Mon YYYY`
3. Change name
   - `Citation reference`
   - Summary in one sentence.
   - `Effective Mon YYYY`
```

## Anatomy

```text
┌─────────────────────────────────────────┐
│  header                                 │
│  Regulatory update heading.             │
│                                         │
│  01  Name   §cite   gloss   [eff]       │
│  02  Name   §cite   gloss   [eff]       │
│  03  Name   §cite   gloss   [eff]       │
│                                         │
│  footer                           1/19  │
└─────────────────────────────────────────┘
```

## Variants (component-specific)

### `timeline` — timeline

Ordered by effective date.

```markdown
<!-- _class: regulatory-update timeline -->

## timeline orders the changes by effective date.

`Federal · State · International`

1. EU AI Act
   - `Title III`
   - Conformity-assessment pre-market obligation took effect.
   - `Effective Feb 2026`
2. Colorado AI Act
   - `SB 24-205`
   - Developer and deployer duties for consequential-decision systems.
   - `Effective Feb 2026`
3. FTC v. Avast
   - `§5 unfairness`
   - $16.5M consent order; clarifies the deception standard for privacy branding.
   - `Final Mar 2026`
4. Texas DPSA
   - `§541.151`
   - DSAR opt-out portal mandatory; small-business safe-harbor narrowed.
   - `Effective Mar 2026`
```

### `priority` — priority

Ranked by exposure.

```markdown
<!-- _class: regulatory-update priority -->

## priority ranks the changes by exposure.

`Top three · by ARR at risk`

1. EU AI Act
   - `Title III`
   - High-risk system inventory due before April.
   - `Effective Feb 2026`
2. Colorado AI Act
   - `SB 24-205`
   - Deployer disclosures required; copy in flight.
   - `Effective Feb 2026`
3. Texas DPSA
   - `§541.151`
   - DSAR opt-out portal mandatory.
   - `Effective Mar 2026`
```

### `cards` — cards

One tile per change.

```markdown
<!-- _class: regulatory-update cards -->

## cards deals each change its own tile.

`Federal · State · International`

1. EU AI Act
   - `Title III`
   - Conformity-assessment pre-market obligation took effect.
   - `Effective Feb 2026`
2. Colorado AI Act
   - `SB 24-205`
   - Developer and deployer duties for consequential-decision systems.
   - `Effective Feb 2026`
3. FTC v. Avast
   - `§5 unfairness`
   - $16.5M consent order; clarifies the deception standard for privacy branding.
   - `Final Mar 2026`
4. Texas DPSA
   - `§541.151`
   - DSAR opt-out portal mandatory; small-business safe-harbor narrowed.
   - `Effective Mar 2026`
```

### `diff-bands` — diff-bands

Changed versus stayed.

```markdown
<!-- _class: regulatory-update diff-bands -->

## diff-bands shades what changed versus stayed.

### Added

1. Colorado AI Act
   - `SB 24-205`
   - New developer and deployer duties for consequential-decision systems.

### Amended

2. CCPA regulations
   - `§7027`
   - Opt-out preference signal handling clarified and tightened.

### Repealed

3. Small-business carve-out
   - `§541.107`
   - The blanket exemption was narrowed and partially repealed.

### Enforced

4. FTC v. Avast
   - `§5 unfairness`
   - $16.5M consent order finalized against deceptive privacy branding.
```

## Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [design/design-system.md §6.5](../../../../design/design-system.md#65-universal-variants--three-tiers) for the catalog.

## Related components

- [`authority-chain`](../../legal/authority-chain/authority-chain.docs.md) — single rule walked statute → regulation → guidance → case
- [`list-criteria`](../../progression/list-criteria/list-criteria.docs.md) — flat enumeration of requirements without dates or citations
- [`list-steps`](../../progression/list-steps/list-steps.docs.md) — lighter dots-on-a-spine sequence — the `timeline` variant
- [`list-tabular`](../../inventory/list-tabular/list-tabular.docs.md) — structured metadata per row but no regulatory framing

## Demo deck

See [regulatory-update.gallery.light.pdf](./regulatory-update.gallery.light.pdf) for rendered examples of every variant.
