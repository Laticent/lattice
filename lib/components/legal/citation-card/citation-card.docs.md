# citation-card

> Single authoritative reference — heading + citation + verbatim quote + plain-English gloss.

**Function** evidence · **Form** canvas · **Substance** prose

**Tags** `citation` · `quotation` · `contract`

Use when one citation IS the slide. The blockquote carries the verbatim language; the trailing list explains what it means and what we must do about it.

## When to use

- **One citation carries the slide.** When a single statute, contract clause, regulation, or standard is doing the argumentative work. The citation IS the evidence; the slide gives it the room to be read.
- **Verbatim language matters.** Reach for citation-card when the exact wording is load-bearing — definitions, scope clauses, exception language. The blockquote preserves the language unmodified so the gloss can interpret it.
- **Audience needs the 'so what'.** The gloss list translates legalese into plain English and names the concrete action. Without it the slide is a quotation; with it the slide is a decision.

## When NOT to use

- **Multiple citations on one slide.** Stacking two or three statutes? Use statute-stack — citation-card gives canvas weight to a single authority.
- **Paraphrased 'quote'.** Rewriting the source? Drop the citation framing for content or a split-panel pullquote — citation-card is for verbatim language with attribution.
- **Gloss longer than the quote.** When the gloss runs three paragraphs, the citation is no longer the focus. Trim it to one sentence plus a `What we must do` action, or use content.
- **Plain gloss under the pull-quote variant.** The `pull-quote` variant shows only a **bold**-led `**What we must do**` action — a plain 'In plain English …' line silently vanishes. Lead with a bold label, or use the default variant.

## Authoring

```markdown
<!-- _class: citation-card -->

## Headline framing what this citation establishes.

`Citation reference · short name`

> Verbatim quotation of the cited language.

- Plain-English interpretation of what the language covers.
- **What we must do.**
  - The concrete action this citation argues for.
```

## Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `heading` | `h2` | yes | Slide heading framing what the citation establishes. |
| `citation` | `p:first-of-type > code` | yes | Inline-code paragraph with the citation reference (e.g. 'Cal. Civ. Code §1798.140(o) · CCPA/CPRA'). |
| `quotation` | `blockquote` | yes | Verbatim quote of the cited language. |
| `gloss` | `ul > li` | no | Optional plain-English interpretation. Use **What we must do** for the actionable item. |

## Anatomy

```text
┌─────────────────────────────────────────┐
│  header                                 │
│  Single authority heading.              │
│                                         │
│  ┌───────────────────────────────────┐  │
│  │ § Citation reference here         │  │
│  │ — full title of authority         │  │
│  │ Holding or principle gloss        │  │
│  └───────────────────────────────────┘  │
│  footer                           1/19  │
└─────────────────────────────────────────┘
```

## Variants (component-specific)

### `pull-quote` — Pull-quote treatment

Promotes the blockquote to a pull-quote scale — the verbatim language reads as the headline; the gloss compresses to the actionable item.

```markdown
<!-- _class: citation-card pull-quote -->

## "Personal information" includes the household, not just the person.

`Cal. Civ. Code §1798.140(o) · CCPA/CPRA`

> Information that identifies, relates to, describes, is reasonably capable of being associated with, or could reasonably be linked, directly or indirectly, with a particular consumer or household.

- **What we must do.**
  - Audit pixel inventory; treat household IDs as PI in DSAR workflows.
```

### `split` — Split — quote | gloss columns

Puts the verbatim quotation in the left column and the plain-English gloss in the right, with the citation spanning the top. Use when quote and interpretation deserve equal weight.

```markdown
<!-- _class: citation-card split -->

## CCPA defines "sale" broadly.

`Cal. Civ. Code §1798.140(ad) · CCPA/CPRA`

> "Sale" means selling, renting, releasing, disclosing, disseminating, making available, transferring, or otherwise communicating a consumer's personal information to a third party for monetary or other valuable consideration.

- The catch is "other valuable consideration."
  - Data-for-service swaps and ad-tech cookie syncs can qualify as sales even when no money changes hands.
```

### `margin` — Margin — annotated quotation

Sets the quotation as the body with the gloss running as margin notes alongside. Use for close reading where each clause earns its own annotation.

```markdown
<!-- _class: citation-card margin -->

## The GDPR lawful-basis test.

`GDPR Art. 6(1)(f) · legitimate interests`

> Processing is lawful only if and to the extent that processing is necessary for the purposes of the legitimate interests pursued by the controller, except where such interests are overridden by the interests or fundamental rights of the data subject.

- Two-part test.
  - Necessity first, then a balancing exercise against the data subject's rights. Document both halves or the basis fails on audit.
```

### `triptych` — Triptych — three panels

Frames the verbatim quote and the gloss items as three panels, with the citation spanning above, for a formal presentation of a single authority. Keep the quotation short so it sits comfortably in its panel.

```markdown
<!-- _class: citation-card triptych -->

## What "personal data" covers under GDPR.

`GDPR Art. 4(1) · definitions`

> 'Personal data' means any information relating to an identified or identifiable natural person.

- In plain English.
  - Any online identifier that can single out a person — IP address, cookie ID, device fingerprint.
- **What we must do.**
  - Scope notice and retention to cover online identifiers, not just named-person records.
```

## Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [design/design-system.md §6.5](../../../../design/design-system.md#65-universal-variants--three-tiers) for the catalog.

## Related components

- [`statute-stack`](../../legal/statute-stack/statute-stack.docs.md) — two or three citations need to land on one slide
- [`quote`](../../statement/quote/quote.docs.md) — the source is a person, not a document
- [`split-panel`](../../statement/split-panel/split-panel.docs.md) — a quote with three or four implications
- [`content`](../../statement/content/content.docs.md) — the citation is one input among several in a prose argument

## Demo deck

See [citation-card.gallery.light.pdf](./citation-card.gallery.light.pdf) for rendered examples of every variant.
