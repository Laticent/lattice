# policy-recommendation

> A legislative recommendation — a stance verdict beside the recommendation, its evidence, and the specific ask to lawmakers.

**Function** statement · **Form** panel · **Substance** structure

**Tags** `recommendation` · `regulation` · `risk` · `takeaway`

Use to put ONE policy recommendation before lawmakers. The stance variant (`adopt` / `amend` / `oppose` / `defer`) colors the verdict badge and the rail; the `## ` heading states the recommendation as a claim; a framing line names the stakes; two-to-four evidence-grounded reasons substantiate it; and a closing blockquote carries the specific legislative ask (sponsor / vote / amend, with the bill reference). For weighing options before landing a pick, use `split-compare`; for a flat requirements list, `list-criteria`.

## Agent contract

**Capacity** ~3 items (crowds past 3, overflows past 4) — past that, list-criteria / split across slides.

**Density** aim ~20 words per item; past ~28 it reads as a wall of text — one reason + its cited evidence per row, ~18-20 words; the citation rides a nested inline-code chip.

### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `eyebrow` | `p:first-of-type > code` | no | Inline-code bill or docket reference above the recommendation (e.g. `HB 214 · Consumer Data Protection`). |
| `recommendation` | `h2` | yes | The recommendation as a complete declarative sentence — the action you want taken, not a topic label. |
| `impact` | `p` | no | One-sentence framing of the problem or stakes the recommendation addresses. |
| `rationale` | `ul > li` | yes | Two-to-four evidence-grounded reasons. Each li leads with the reason (rendered bold automatically — no `**…**`); a nested `- ` line carries the evidence, ideally ending in an inline-code citation chip. |
| `ask` | `blockquote` | no | The specific legislative action — the closing call to action (e.g. 'Vote YES on HB 214 § 3, or sponsor the floor amendment'). Rendered as the accent ask bar. |

### Variant decision rule

- **`adopt`.** The recommendation is in support of the measure — green verdict badge and rail.
- **`amend`.** Support is conditional on a specific change — amber badge and rail.
- **`oppose`.** The recommendation is against the measure — red badge and rail.
- **`defer`.** The evidence base is incomplete and the ask is to study first, not decide yet — neutral badge and rail.

### Common mistakes

- **Writing a reason's evidence line without a trailing inline-code citation chip.** Without the trailing citation chip, the evidence line reads as unsupported assertion rather than record-grade evidence — the nested evidence bullet should end in an inline-code citation, not just prose.
- **Placing the bill/docket eyebrow after the heading instead of before it, or leaving it unwrapped in backticks.** A code-only paragraph immediately before the heading is lifted into the masthead and picked up by the shared mono-caps eyebrow rule — it must be the section's first line, wrapped in backticks, or it either stays a plain paragraph (if unwrapped) or becomes an italic subtitle instead (if placed after the heading).

## When to use

- **One recommendation, put to lawmakers.** When a brief must land a single policy ask — adopt, amend, oppose, or defer — with the evidence that earns it and the exact legislative move to make. The stance badge is the verdict; the ask is the call to action.
- **The stance sets the color.** Pick the variant by the posture: `adopt` (support, green), `amend` (conditional, amber), `oppose` (against, red), `defer` (study first, neutral). The badge, rail, and ask bar all take the stance color, so the reader sees the position before reading a word.
- **Reasons carry a citation.** Each reason leads with a bold claim and a nested evidence line ending in an inline-code citation chip. Without the chip the reason reads as opinion; with it, it earns its place in a legislative record.

## When NOT to use

- **Weighing two options.** If the slide compares alternatives before choosing, use `split-compare` — its right zone is a 2-option grid plus a verdict card. policy-recommendation states one already-chosen position.
- **More than four reasons.** Past four the panel reads as a memo and the ask loses force. Keep the three strongest reasons here and move the full evidence to `list-criteria`.
- **A recommendation with no ask.** Omitting the closing blockquote leaves the reader with a position but no action. Always name the specific legislative move — the bill, the section, the vote.
- **A topic-label heading.** `## Breach Notification` is a topic, not a recommendation. Say the action: `## Adopt a 30-day breach-notification deadline.`

## Authoring

```markdown
<!-- _class: policy-recommendation adopt -->

`Bill reference · Domain`

## The recommendation as a complete sentence.

One line naming the problem or the stakes.

- First reason
  - The evidence for it, with a `Citation` chip.
- Second reason
  - The evidence for it, with a `Citation` chip.
- Third reason
  - The evidence for it, with a `Citation` chip.

> The specific legislative ask — sponsor, vote, or amend, with the section.
```

## Variants (component-specific)

### `adopt` — adopt

Support — green verdict badge and rail.

```markdown
<!-- _class: policy-recommendation adopt -->

`HB 214 · Consumer Data Protection`

## Adopt a 30-day deadline for breach notification.

Consumers now learn of a breach 78 days late on average.

- Faster notice cuts identity-theft losses
  - 22% lower per-victim costs where the rule exists `FTC 2025`.
- Already industry practice
  - 14 of the top 20 processors notify within 30 days `IAPP`.

> Vote YES on HB 214 § 3.
```

### `amend` — amend

Conditional support — amber badge and rail.

```markdown
<!-- _class: policy-recommendation amend -->

`SB 88 · Algorithmic Hiring`

## Amend SB 88 to require bias audits before deployment.

Post-hoc audits catch discrimination only after applicants are screened out.

- Pre-deployment testing is preventive
  - Later audits cannot un-reject filtered candidates `EEOC 2025`.
- The change is one clause
  - Move the trigger from § 4(b) to § 3 `Leg. counsel`.

> Adopt the § 4(b) to § 3 move in the committee substitute.
```

### `oppose` — oppose

Against — red verdict badge and rail.

```markdown
<!-- _class: policy-recommendation oppose -->

`AB 402 · Encryption Backdoors`

## Oppose AB 402's mandated key-escrow provision.

A state-held decryption key is a single point of failure for every resident's data.

- It weakens security for everyone
  - A mandated backdoor is exploitable by any attacker who finds it `NIST`.
- It won't stop determined actors
  - Open-source encryption stays available outside the state's reach `EFF`.

> Vote NO on AB 402, or strike the § 5 escrow mandate.
```

### `defer` — defer

Study first — neutral badge and rail.

```markdown
<!-- _class: policy-recommendation defer -->

`HR 19 · Municipal Facial Recognition`

## Defer HR 19 pending an independent accuracy study.

Error rates for the proposed system are unpublished for the populations it would scan.

- The evidence base is missing
  - No demographic accuracy audit exists for this vendor `GAO request`.
- A study is already funded
  - The oversight office can report within one session `fiscal note`.

> Refer HR 19 to interim study; revisit with the audit in hand.
```

## Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [design/design-system.md §6.5](../../../../design/design-system.md#65-universal-variants--three-tiers) for the catalog.

## Related components

- [`split-compare`](../../comparison/split-compare/split-compare.docs.md) — two options weighed before a verdict card
- [`decision`](../../comparison/decision/decision.docs.md) — naming a chosen path among options already presented
- [`list-criteria`](../../progression/list-criteria/list-criteria.docs.md) — a flat enumeration of requirements without a stance or an ask
- [`regulatory-update`](../../legal/regulatory-update/regulatory-update.docs.md) — a period digest of what changed, not a recommendation on one measure

## Demo deck

See [policy-recommendation.gallery.light.pdf](./policy-recommendation.gallery.light.pdf) for rendered examples of every variant.
