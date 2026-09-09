# Lattice layouts — legal, connect



> Citation-aware legal layouts, and the cards a room can scan.



**Contents:** `authority-chain` · `citation-card` · `obligation-matrix` · `policy-recommendation` · `regulatory-update` · `statute-stack` · `contact` · `wifi`



## authority-chain

> Provenance chain — statute to regulation to guidance to case, walked in order.

**Function** progression · **Form** timeline · **Substance** structure

**Tags** `regulation` · `citation` · `sequence`

Use when the audience needs to see how a rule descends: what the statute says, how the agency implemented it, what guidance interpreted it, and what cases have applied it. Ordered list because the order is the argument.

### Agent contract

**Capacity** ~4 items (crowds past 5, overflows past 6) — past that, split across slides (automatic) / statute-stack. Past six tiers the chain overflows a portrait box; a split run carries a derived “governs ↓ / under ↑” signal — a hierarchy, never a temporal “next” (§0b connected members). Pacing stays the authored split.perPage: the signal reads across pages whatever the pacing.

**Density** aim ~14 words per item; past ~22 it reads as a wall of text — one clause per tier.

#### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `heading` | `h2` | yes | Slide heading naming the rule whose chain is being walked. |
| `tiers` | `ol > li` | yes | Ordered list of authority tiers (Statute, Regulation, Guidance, Case) — not hyperlinks. Each leads with the tier label; nested ul carries the citation (code) and the one-line gloss. |

#### Variant decision rule

- **default (no modifier).** A plain descent from statute to case — the base look for a straightforward, single-line chain.
- **`branching`.** The authority forks — several regulations, guidance, or cases all trace back to the SAME originating statute — shown as one tier with multiple citations instead of a strict one-to-one descent.
- **`trail`.** The descent should read as a lightweight breadcrumb rather than a heavier, chrome-forward chain.
- **`pyramid`.** The tiers carry different legal weight and that hierarchy of force should be visually apparent, not just their order — tier width narrows from statute down to case.
- **`bracket`.** The tiers should read as one clamped, continuous block — a tighter, seamless rail (zero gap, squared corners, a doubled outer edge) instead of the default's separated cards.

#### Common mistakes

- **Reversing the order of the nested citation and gloss lines, or writing the citation as plain text instead of inline code.** The citation chip is matched by `li:first-child:has(> code:only-child)` — it must be the FIRST nested item and contain ONLY inline code; a citation written second, or as plain text, doesn't get the citation-chip treatment.

### When to use

- **Provenance is the argument.** Use when the audience needs to see exactly where a rule comes from and how it has been interpreted. The chain itself is the evidence that the obligation is grounded, not invented.
- **Tier labels carry the read.** Statute, regulation, guidance, case — each tier has a different legal weight. The left-rail label tells the audience what kind of source they are looking at before they read the citation.
- **Three to five tiers, no more.** The chain reads top-to-bottom on a single canvas. Past five rows the connectors compress and the tier labels lose room. Group sub-cases into the parent row's gloss or split into two slides.

### When NOT to use

- **Flat list of citations.** If the rows have no tier hierarchy, use `list-criteria` or `regulatory-update`. authority-chain earns its chrome only when the descent from statute to case is the point.
- **Missing citation chip.** The inline-code citation is the row's anchor; without it the gloss reads as opinion. Always cite, even for guidance and case rows.
- **Out-of-order tiers.** The chain reads as a descent: statute first, case last. Reversing it or skipping a tier breaks the metaphor the audience is using to follow you.

### Authoring

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

### Anatomy

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

### Variants (component-specific)

#### `branching` — branching

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

#### `trail` — trail

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

#### `pyramid` — pyramid

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

#### `bracket` — bracket

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

### Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [the universal modifier catalog](../authoring/modifiers.md) for the catalog.

### Related components

- [`regulatory-update`](#regulatory-update) — period-bounded changelog rather than a single rule's lineage
- `list-criteria` — flat enumeration of requirements without tier hierarchy
- `list-steps` — the rows are procedural steps rather than authority tiers

### Demo deck

Every variant rendered, with a live preview and an in-browser editor:
<https://lattice.style/components/legal/authority-chain>


## citation-card

> Single authoritative reference — heading + citation + verbatim quote + plain-English gloss.

**Function** evidence · **Form** canvas · **Substance** prose

**Tags** `citation` · `quotation` · `contract`

Use when one citation IS the slide. The blockquote carries the verbatim language; the trailing list explains what it means and what we must do about it.

### Agent contract

#### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `heading` | `h2` | yes | Slide heading framing what the citation establishes. |
| `citation` | `p:first-of-type > code` | yes | Inline-code paragraph with the citation reference (e.g. 'Cal. Civ. Code §1798.140(o) · CCPA/CPRA'). |
| `quotation` | `blockquote` | yes | Verbatim quote of the cited language. |
| `gloss` | `ul > li` | no | Optional plain-English interpretation. Use **What we must do** for the actionable item. |

#### Variant decision rule

- **default (no modifier).** The default full treatment — heading, citation, quote, and gloss all get equal room.
- **`pull-quote`.** Only the single most operative phrase within a longer clause needs to be lifted and emphasized, not the whole provision.
- **`split`.** The quote and its plain-English reading should sit side by side rather than stacked.
- **`margin`.** The citation itself is secondary — hangs it in the gutter so the quote and gloss can dominate the canvas.
- **`triptych`.** Three distinct pieces — citation, plain reading, and required action — each deserve their own visual panel.

#### Common mistakes

- **Placing the citation paragraph BEFORE the heading instead of after it.** Immediately after the heading (the documented placement) the citation paragraph stays in the flow and gets the dedicated accent-mono citation styling. Before the heading, it's captured as the shared masthead eyebrow (mono-caps kicker) instead — a different, generic treatment. Keep it after the heading, matching the skeleton.

### When to use

- **One citation carries the slide.** When a single statute, contract clause, regulation, or standard is doing the argumentative work. The citation IS the evidence; the slide gives it the room to be read.
- **Verbatim language matters.** Reach for citation-card when the exact wording is load-bearing — definitions, scope clauses, exception language. The blockquote preserves the language unmodified so the gloss can interpret it.
- **Audience needs the 'so what'.** The gloss list translates legalese into plain English and names the concrete action. Without it the slide is a quotation; with it the slide is a decision.

### When NOT to use

- **Multiple citations on one slide.** Stacking two or three statutes? Use statute-stack — citation-card gives canvas weight to a single authority.
- **Paraphrased 'quote'.** Rewriting the source? Drop the citation framing for content or a split-panel pullquote — citation-card is for verbatim language with attribution.
- **Gloss longer than the quote.** When the gloss runs three paragraphs, the citation is no longer the focus. Trim it to one sentence plus a `What we must do` action, or use content.
- **Plain gloss under the pull-quote variant.** The `pull-quote` variant shows only a **bold**-led `**What we must do**` action — a plain 'In plain English …' line silently vanishes. Lead with a bold label, or use the default variant.

### Authoring

```markdown
<!-- _class: citation-card -->

## Headline framing what this citation establishes.

`Citation reference · short name`

> Verbatim quotation of the cited language.

- Plain-English interpretation of what the language covers.
- **What we must do.**
  - The concrete action this citation argues for.
```

### Anatomy

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

### Variants (component-specific)

#### `pull-quote` — pull-quote

The operative phrase, lifted.

```markdown
<!-- _class: citation-card pull-quote -->

## pull-quote lifts the operative phrase.

`Cal. Civ. Code §1798.140(o) · CCPA/CPRA`

> Information that identifies, relates to, describes, is reasonably capable of being associated with, or could reasonably be linked, directly or indirectly, with a particular consumer or household.

- **What we must do.**
  - Audit pixel inventory; treat household IDs as PI in DSAR workflows.
```

#### `split` — split

Quote beside plain reading.

```markdown
<!-- _class: citation-card split -->

## split pairs the quote with its plain reading.

`Cal. Civ. Code §1798.140(ad) · CCPA/CPRA`

> "Sale" means selling, renting, releasing, disclosing, disseminating, making available, transferring, or otherwise communicating a consumer's personal information to a third party for monetary or other valuable consideration.

- The catch is "other valuable consideration."
  - Data-for-service swaps and ad-tech cookie syncs can qualify as sales even when no money changes hands.
```

#### `margin` — margin

The cite in the gutter.

```markdown
<!-- _class: citation-card margin -->

## margin hangs the cite in the gutter.

`GDPR Art. 6(1)(f) · legitimate interests`

> Processing is lawful … only if necessary for the purposes of the legitimate interests pursued by the controller, except where such interests are overridden by the interests or fundamental rights … of the data subject.

- Two-part test.
  - Necessity first, then balancing against the data subject's rights. Document both halves.
```

#### `triptych` — triptych

Three authorities abreast.

```markdown
<!-- _class: citation-card triptych -->

## triptych sets three authorities abreast.

`GDPR Art. 4(1) · definitions`

> 'Personal data' means any information relating to an identified or identifiable natural person.

- In plain English.
  - Any online identifier that can single out a person — IP address, cookie ID, device fingerprint.
- **What we must do.**
  - Scope notice and retention to cover online identifiers, not just named-person records.
```

### Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [the universal modifier catalog](../authoring/modifiers.md) for the catalog.

### Related components

- [`statute-stack`](#statute-stack) — two or three citations need to land on one slide
- `quote` — the source is a person, not a document
- `split-panel` — a quote with three or four implications
- `content` — the citation is one input among several in a prose argument

### Demo deck

Every variant rendered, with a live preview and an in-browser editor:
<https://lattice.style/components/legal/citation-card>


## obligation-matrix

> Regulation × obligation grid — state-marker cells encode applies / partial / exempt at a glance.

**Function** comparison · **Form** matrix · **Substance** structure

**Tags** `compliance` · `regulation` · `stoplight`

Use when many regimes need comparing across the same obligations. Cells carry the universal state-token grammar ([x] applies, [-] partial, [ ] exempt, [/] out of scope) shared with checklist / verdict-grid / roadmap.

### Agent contract

#### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `heading` | `h2` | yes | Slide heading framing what the matrix compares. |
| `matrix` | `table` | yes | Markdown table — rows are regulations, columns are obligations. Use state markers ([x] / [-] / [ ] / [/]) in cells. |
| `legend` | `p` | no | Optional trailing paragraph explaining the state-marker meanings or what to take from the matrix. |

#### Variant decision rule

- **default (no modifier).** Neutral, data-first cell chrome with no additional emphasis — reference tone.
- **`heat`.** The matrix should read as exposure — applies (`[x]`) reads as alarm — not just coverage for reference. Exempt (`[ ]`) cells resolve to a neutral state that `heat` does NOT re-color; they keep their default neutral ring rather than turning 'relief' green.
- **`asymmetric`.** The regimes genuinely differ in kind and each deserves body-level breathing room as its own card rather than a strict grid cell.
- **`pills`.** The state should read as a word — a status label — rather than an iconographic mark. This requires authoring literal text (inline code or bold) per cell instead of the `[x]`/`[-]`/`[ ]` state-marker grammar — `pills`' word-styling only targets literal text, so a table still written with bracket markers keeps its icon-only marks (no word appears), though the cell padding and row-zebra shift anyway since `pills` restyles every cell regardless of content.
- **`lanes`.** Each regime should read as its own horizontal band, emphasizing that it's a distinct regime rather than a rank in a list.

#### Common mistakes

- **Explicitly left-aligning table columns (`:---`) instead of leaving alignment unspecified or writing `:---:`.** The matrix unconditionally centers every cell, so a plain column with no alignment markers still centers state-marker glyphs fine. Only an EXPLICIT `:---` left-align syntax breaks it — that emits an inline left-align style, which (being inline) overrides the component's own centering rule regardless of specificity.

### When to use

- **Many regimes, shared obligations.** Three or more regulations or jurisdictions compared across the same set of duties. The grid lets the reader scan a row to know a regime and a column to know an obligation.
- **State markers, not values.** Cells are pass/partial/fail/skip — the universal `[x]` / `[-]` / `[ ]` / `[/]` grammar. For textual cell values use `compare-table`.
- **Risk axis with heat.** The `heat` variant flips the palette so applies (`[x]`) reads as alarm. Exempt (`[ ]`) cells resolve to the neutral state and are NOT recolored — they don't turn 'relief' green. Use when the matrix is read for exposure, not for coverage.

### When NOT to use

- **Two regimes only.** Past one row vs another the grid loses its purpose. Use `compare-prose` or `compare-table` for two-regime comparisons.
- **Mixed cell content.** Don't mix state markers with prose values in the same matrix — the cell width has to grow to fit prose and the marker grid collapses. Pick one cell type.
- **Missing legend.** The trailing paragraph naming filled/half/empty is what onboards a first-time reader. Skipping it forces the audience to guess the mapping.

### Authoring

```markdown
<!-- _class: obligation-matrix -->

## Headline framing what the matrix compares.

| Regulation | Obligation A | Obligation B | Obligation C |
| ---------- | :----------: | :----------: | :----------: |
| Regime 1   | [x]          | [x]          | [-]          |
| Regime 2   | [x]          | [-]          | [x]          |
| Regime 3   | [x]          | [ ]          | [x]          |

Filled = applies, half = partial, empty = exempt.
```

### Anatomy

```text
┌─────────────────────────────────────────┐
│  header                                 │
│  Regulation × duty heading.             │
│                                         │
│  ┌───────────┬───────────┬───────────┐  │
│  │           │ Duty A    │ Duty B    │  │
│  ├───────────┼───────────┼───────────┤  │
│  │ Reg 1     │ ✓         │ ✕         │  │
│  │ Reg 2     │ ✓         │ ✓         │  │
│  │ Reg 3     │ ⚠         │ ✓         │  │
│  └───────────┴───────────┴───────────┘  │
│  footer                           1/19  │
└─────────────────────────────────────────┘
```

### Variants (component-specific)

#### `heat` — heat

Cells shaded by burden.

```markdown
<!-- _class: obligation-matrix heat -->

## heat shades the cells by burden.

| Regulation | Notice | Consent | Retention | Breach | DSAR  |
| ---------- | :----: | :-----: | :-------: | :----: | :---: |
| GDPR       | [x]    | [x]     | [x]       | [x]    | [x]   |
| CCPA/CPRA  | [x]    | [-]     | [x]       | [x]    | [x]   |
| LGPD       | [x]    | [x]     | [x]       | [x]    | [x]   |
| PIPEDA     | [x]    | [x]     | [-]       | [x]    | [-]   |
| HIPAA      | [x]    | [x]     | [x]       | [x]    | [-]   |
| GLBA       | [x]    | [-]     | [-]       | [x]    | [ ]   |

Red = applies (exposure). Exempt cells stay neutral — heat marks burden, not relief.
```

#### `asymmetric` — asymmetric

Regimes differ in kind.

```markdown
<!-- _class: obligation-matrix asymmetric -->

## asymmetric admits the regimes differ in kind.

| Regulation | Notice | Consent | Retention | Breach | DSAR  |
| ---------- | :----: | :-----: | :-------: | :----: | :---: |
| GDPR       | [x]    | [x]     | [x]       | [x]    | [x]   |
| CCPA/CPRA  | [x]    | [-]     | [x]       | [x]    | [x]   |
| LGPD       | [x]    | [x]     | [x]       | [x]    | [x]   |

Each row promotes to a card with body-level breathing room.
```

#### `pills` — pills

Cells as status words.

```markdown
<!-- _class: obligation-matrix pills -->

## pills spell each cell as a status word.

| Regulation | Notice | Consent | Retention | Breach | DSAR  |
| ---------- | :----: | :-----: | :-------: | :----: | :---: |
| GDPR       | [x]    | [x]     | [x]       | [x]    | [x]   |
| CCPA/CPRA  | [x]    | [-]     | [x]       | [x]    | [x]   |
| LGPD       | [x]    | [x]     | [x]       | [x]    | [x]   |
| PIPEDA     | [x]    | [x]     | [-]       | [x]    | [-]   |
| HIPAA      | [x]    | [x]     | [x]       | [x]    | [-]   |
| GLBA       | [x]    | [-]     | [-]       | [x]    | [ ]   |

Same data, neutral chrome — the state pills carry the meaning without the heat-map alarm.
```

#### `lanes` — lanes

One regime per band.

```markdown
<!-- _class: obligation-matrix lanes -->

## lanes walks one regime per band.

| Regulation | Notice | Consent | Retention | Breach | DSAR  |
| ---------- | :----: | :-----: | :-------: | :----: | :---: |
| GDPR       | [x]    | [x]     | [x]       | [x]    | [x]   |
| CCPA/CPRA  | [x]    | [-]     | [x]       | [x]    | [x]   |
| LGPD       | [x]    | [x]     | [x]       | [x]    | [x]   |
| PIPEDA     | [x]    | [x]     | [-]       | [x]    | [-]   |
| HIPAA      | [x]    | [x]     | [x]       | [x]    | [-]   |
| GLBA       | [x]    | [-]     | [-]       | [x]    | [ ]   |

Each lane stripe signals that the row is its own regime, not a rank.
```

### Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [the universal modifier catalog](../authoring/modifiers.md) for the catalog.

### Related components

- `compare-table` — cells are textual values, not state markers
- `verdict-grid` — options scored against criteria with a per-card layout instead of a table
- `matrix-2x2` — two axes, four cells, qualitative placement
- `checklist` — one set of obligations against one regime, not many
- `matrix-grid` — the grid marks one position on two ordered axes, not a pass/partial/exempt status per cell

### Demo deck

Every variant rendered, with a live preview and an in-browser editor:
<https://lattice.style/components/legal/obligation-matrix>


## policy-recommendation

> A legislative recommendation — a stance verdict beside the recommendation, its evidence, and the specific ask to lawmakers.

**Function** statement · **Form** panel · **Substance** structure

**Tags** `recommendation` · `regulation` · `risk` · `takeaway`

Use to put ONE policy recommendation before lawmakers. The stance variant (`adopt` / `amend` / `oppose` / `defer`) colors the verdict badge and the rail; the `## ` heading states the recommendation as a claim; a framing line names the stakes; two-to-four evidence-grounded reasons substantiate it; and a closing blockquote carries the specific legislative ask (sponsor / vote / amend, with the bill reference). For weighing options before landing a pick, use `split-compare`; for a flat requirements list, `list-criteria`.

### Agent contract

**Capacity** ~3 items (over 3 overflows) — past that, list-criteria / split across slides. Past three reasons the panel reads as a memo, not a recommendation — move the evidence to list-criteria and keep the recommendation slide to its strongest three.

**Density** aim ~20 words per item; past ~28 it reads as a wall of text — one reason + its cited evidence per row, ~18-20 words; the citation rides a nested inline-code chip.

#### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `eyebrow` | `p:first-of-type > code` | no | Inline-code bill or docket reference above the recommendation (e.g. `HB 214 · Consumer Data Protection`). |
| `recommendation` | `h2` | yes | The recommendation as a complete declarative sentence — the action you want taken, not a topic label. |
| `impact` | `p` | no | One-sentence framing of the problem or stakes the recommendation addresses. |
| `rationale` | `ul > li` | yes | Two-to-three evidence-grounded reasons. Each li leads with the reason (rendered bold automatically — no `**…**`); a nested `- ` line carries the evidence, ideally ending in an inline-code citation chip. |
| `ask` | `blockquote` | no | The specific legislative action — the closing call to action (e.g. 'Vote YES on HB 214 § 3, or sponsor the floor amendment'). Rendered as the accent ask bar. |

#### Variant decision rule

- **`adopt`.** The recommendation is in support of the measure — green verdict badge and rail.
- **`amend`.** Support is conditional on a specific change — amber badge and rail.
- **`oppose`.** The recommendation is against the measure — red badge and rail.
- **`defer`.** The evidence base is incomplete and the ask is to study first, not decide yet — neutral badge and rail.

#### Common mistakes

- **Writing a reason's evidence line without a trailing inline-code citation chip.** Without the trailing citation chip, the evidence line reads as unsupported assertion rather than record-grade evidence — the nested evidence bullet should end in an inline-code citation, not just prose.
- **Placing the bill/docket eyebrow after the heading instead of before it, or leaving it unwrapped in backticks.** A code-only paragraph immediately before the heading is lifted into the masthead and picked up by the shared mono-caps eyebrow rule — it must be the section's first line, wrapped in backticks, or it either stays a plain paragraph (if unwrapped) or becomes an italic subtitle instead (if placed after the heading).

### When to use

- **One recommendation, put to lawmakers.** When a brief must land a single policy ask — adopt, amend, oppose, or defer — with the evidence that earns it and the exact legislative move to make. The stance badge is the verdict; the ask is the call to action.
- **The stance sets the color.** Pick the variant by the posture: `adopt` (support, green), `amend` (conditional, amber), `oppose` (against, red), `defer` (study first, neutral). The badge, rail, and ask bar all take the stance color, so the reader sees the position before reading a word.
- **Reasons carry a citation.** Each reason leads with a bold claim and a nested evidence line ending in an inline-code citation chip. Without the chip the reason reads as opinion; with it, it earns its place in a legislative record.

### When NOT to use

- **Weighing two options.** If the slide compares alternatives before choosing, use `split-compare` — its right zone is a 2-option grid plus a verdict card. policy-recommendation states one already-chosen position.
- **More than four reasons.** Past four the panel reads as a memo and the ask loses force. Keep the three strongest reasons here and move the full evidence to `list-criteria`.
- **A recommendation with no ask.** Omitting the closing blockquote leaves the reader with a position but no action. Always name the specific legislative move — the bill, the section, the vote.
- **A topic-label heading.** `## Breach Notification` is a topic, not a recommendation. Say the action: `## Adopt a 30-day breach-notification deadline.`

### Authoring

```markdown
<!-- _class: policy-recommendation adopt -->

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

### Variants (component-specific)

#### `adopt` — adopt

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

#### `amend` — amend

Conditional support — amber badge and rail.

```markdown
<!-- _class: policy-recommendation amend -->

`SB 88 · Algorithmic Hiring`

## Amend SB 88 to require bias audits before deployment.

Post-hoc audits catch bias only after applicants are screened out.

- Pre-deployment testing is preventive
  - Later audits cannot un-reject candidates `EEOC 2025`.
- The change is one clause
  - Move the trigger from § 4(b) to § 3 `Leg. counsel`.

> Adopt the § 4(b) to § 3 move in the committee substitute.
```

#### `oppose` — oppose

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

#### `defer` — defer

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

### Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [the universal modifier catalog](../authoring/modifiers.md) for the catalog.

### Related components

- `split-compare` — two options weighed before a verdict card
- `decision` — naming a chosen path among options already presented
- `list-criteria` — a flat enumeration of requirements without a stance or an ask
- [`regulatory-update`](#regulatory-update) — a period digest of what changed, not a recommendation on one measure

### Demo deck

Every variant rendered, with a live preview and an in-browser editor:
<https://lattice.style/components/legal/policy-recommendation>


## regulatory-update

> Change log against a baseline — numbered list of statutes/cases/rules with citation, summary, and effective date.

**Function** progression · **Form** ledger · **Substance** structure

**Tags** `changelog` · `compliance` · `regulation`

Use when a quarter's regulatory motion needs a single-slide digest. Each row carries the change name, the citation (inline code), the summary, and the effective-date marker (inline code).

### Agent contract

**Capacity** ~4 items (crowds past 5, overflows past 6) — past that, split across slides (automatic) / list-tabular. Past six changes the vertical list overflows a portrait box.

**Density** aim ~14 words per item; past ~22 it reads as a wall of text — one clause per item.

#### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `heading` | `h2` | yes | Slide heading framing the period or theme of the changes. |
| `scope` | `p:first-of-type > code` | no | Optional inline-code scope label (e.g. 'Federal · State · International'). |
| `items` | `ol > li` | yes | Ordered list of changes. Each item leads with a plain text name; nested ul carries citation (code), summary, and effective date (code). |

#### Variant decision rule

- **default (no modifier).** A plain numbered ledger of changes — the base look, order as authored.
- **`timeline`.** The changes should be read in effective-date order rather than authored or arbitrary order.
- **`priority`.** Only the changes with the highest exposure or impact matter and should be visually ranked, not just listed.
- **`cards`.** Each change deserves its own tile rather than a flowing numbered list — a more scannable, less document-like look.
- **`diff-bands`.** The changes fall into distinct categories of motion (Added/Amended/Repealed/Enforced) that should be visually grouped, not just listed chronologically.

#### Common mistakes

- **Placing the scope label BEFORE the heading instead of after it, or leaving it unwrapped in plain text.** Immediately after the heading (the documented placement) the scope label stays in the flow and gets the component's own dedicated styling. Before the heading, it's captured as the shared masthead eyebrow instead — a different, generic treatment. It must also be backtick-wrapped, or it isn't recognized as a label at all. Keep it after the heading, matching the skeleton.
- **Using `diff-bands` without grouping items under `### ` category subheadings.** `diff-bands` expects the items split into separate ordered lists, each preceded by an `### Added`/`### Amended`/`### Repealed`/`### Enforced` subheading — a single flat list under `diff-bands` has no band to shade into.

### When to use

- **Period-bounded digest.** When a quarter or half of regulatory motion needs to land as a single scannable ledger. The audience sees what moved, when it took effect, and where to read it — without flipping through a multi-page memo.
- **Citation is the proof.** Each row anchors on its inline-code citation chip. Without the citation the row reads as opinion; with it, the row earns its place in a compliance brief.
- **Effective-date pill closes the row.** The trailing `Effective Mon YYYY` chip tells the audience whether the change is live, imminent, or final. The pill is the row's call-to-action signal.

### When NOT to use

- **Single rule's lineage.** If the slide walks one rule from statute through case, use `authority-chain`. regulatory-update is a period digest.
- **Past six rows.** More than six items compresses the row gap and the citation chips run out of room. Split by jurisdiction.
- **Missing summary or citation.** Each row needs all three sub-items — citation, summary, effective date. Otherwise the row reads as rumor.

### Authoring

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

### Anatomy

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

### Variants (component-specific)

#### `timeline` — timeline

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
   - Developer and deployer duties for covered systems.
   - `Effective Feb 2026`
3. FTC v. Avast
   - `§5 unfairness`
   - $16.5M consent order; clarifies the deception standard.
   - `Final Mar 2026`
4. Texas DPSA
   - `§541.151`
   - DSAR opt-out portal mandatory; safe-harbor narrowed.
   - `Effective Mar 2026`
```

#### `priority` — priority

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

#### `cards` — cards

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
   - Developer and deployer duties for covered systems.
   - `Effective Feb 2026`
3. FTC v. Avast
   - `§5 unfairness`
   - $16.5M consent order; clarifies the deception standard.
   - `Final Mar 2026`
4. Texas DPSA
   - `§541.151`
   - DSAR opt-out portal mandatory; safe-harbor narrowed.
   - `Effective Mar 2026`
```

#### `diff-bands` — diff-bands

Changed versus stayed.

```markdown
<!-- _class: regulatory-update diff-bands -->

## diff-bands shades what changed versus stayed.

### Added

1. Colorado AI Act
   - `SB 24-205`
   - New duties for consequential-decision systems.

### Amended

2. CCPA regulations
   - `§7027`
   - Opt-out signal handling clarified.

### Repealed

3. Small-business carve-out
   - `§541.107`
   - The blanket exemption was narrowed.

### Enforced

4. FTC v. Avast
   - `§5 unfairness`
   - $16.5M consent order finalized.
```

### Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [the universal modifier catalog](../authoring/modifiers.md) for the catalog.

### Related components

- `timeline-list` — dated entries with a status read and a sentence each, but no citation per row
- [`authority-chain`](#authority-chain) — single rule walked from statute to regulation to guidance to case
- `list-criteria` — flat enumeration of requirements without dates or citations
- `list-steps` — lighter dots-on-a-spine sequence — the `timeline` variant
- `list-tabular` — structured metadata per row but no regulatory framing

### Demo deck

Every variant rendered, with a live preview and an in-browser editor:
<https://lattice.style/components/legal/regulatory-update>


## statute-stack

> Citation hierarchy — federal / state / local rows with citation, headline obligation, and status.

**Function** inventory · **Form** ledger · **Substance** structure

**Tags** `citation` · `reference` · `compliance`

Use when three or four parallel jurisdictions need to read at a glance: each row carries the jurisdiction label, the citation, the obligation summary, and an effective-date marker.

### Agent contract

**Capacity** ~3 items (crowds past 4, overflows past 5) — past that, split across slides (automatic) / list-tabular. Past four jurisdictions the three-column rail collapses.

**Density** aim ~16 words per item; past ~24 it reads as a wall of text — one obligation line per statute.

#### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `heading` | `h2` | yes | Slide heading framing what the three rows compare. |
| `rows` | `ul > li` | yes | One li per jurisdiction. Lead with the jurisdiction label as a plain text first line; nested ul items carry the citation (inline code), obligation summary, and status (inline code). |

#### Variant decision rule

- **default (no modifier).** Three parallel jurisdictions in a compact rail — the base look, with the status pill split to the opposite corner from the citation.
- **`hierarchy`.** The rows should visually communicate legal supremacy — ordered explicitly by which law controls.
- **`bands`.** The jurisdictions read better as full-width horizontal strips than as a narrow column rail.
- **`preemption`.** The relationship between jurisdictions is the point — which law yields to which — rather than just parallel listing.
- **`lane`.** More than four jurisdictions need to fit, or the citation/obligation/status structure reads better as a literal table than as cards.

#### Common mistakes

- **Placing both the citation and status chip on the header line under the default rail look.** Pill placement follows the card shape — the DEFAULT narrow rail splits citation (header line) and status (nested, opposite corner); `hierarchy`/`bands`/`preemption` keep BOTH trailing codes on the header line together. Using the row-variant's two-chip header under the default look misplaces the status chip.

### When to use

- **Three parallel jurisdictions.** Federal / state / local — or any three peer regimes — that the room must hold side-by-side. The hue rotation cues which row is which without a legend.
- **Citation plus obligation plus status.** Each card is a three-part record: a citation pill, the headline obligation in prose, and a status pill — pill placement follows the card shape (row variants keep both on the header line; the narrow default splits them to opposite corners). Use when all three matter; for citation-only, reach for list-tabular.
- **Compliance briefings.** Reach for statute-stack when the deck reads as a regulatory memo — counsel and operations need the same view of the same record at the same time.

### When NOT to use

- **More than four rows.** The three-column rail collapses past four jurisdictions. For longer registers move to `lane` (table form) or split across two statute-stack slides by topic.
- **Citation without obligation.** Without the headline obligation sentence, the layout reads as a citation list. Use list-tabular spec when only the citation matters.
- **Mixed entry shapes.** Every row needs the same three parts — citation, obligation, status. A row missing the status pill or with prose instead of a citation breaks the visual contract.

### Authoring

```markdown
<!-- _class: statute-stack -->

## Jurisdiction comparison framing the three obligations.

- Federal `Citation`
  - Headline obligation in one sentence.
  - `Status or effective date`
- State `Citation`
  - Headline obligation in one sentence.
  - `Status or effective date`
- Local `Citation`
  - Headline obligation in one sentence.
  - `Status or effective date`
```

### Anatomy

```text
┌─────────────────────────────────────────┐
│  header                                 │
│  Statute stack heading.                 │
│                                         │
│  ┌───────────────────────────────────┐  │
│  │ FEDERAL · cite        [in effect] │  │
│  │ Obligation prose for tier.        │  │
│  └───────────────────────────────────┘  │
│  ┌───────────────────────────────────┐  │
│  │ STATE · cite          [pending]   │  │
│  └───────────────────────────────────┘  │
│  footer                           1/19  │
└─────────────────────────────────────────┘
```

### Variants (component-specific)

#### `hierarchy` — hierarchy

Ordered by supremacy.

```markdown
<!-- _class: statute-stack hierarchy -->

## hierarchy orders the stack by supremacy.

- Federal `15 U.S.C. §6501` `In effect since 2000`
  - Verifiable parental consent for under-13 personal data.
- State `Cal. Civ. §1798.120` `Enforced 2023`
  - Opt-in for selling or sharing under-16 data; opt-out for over-16.
- Local `NYC §22-1201` `Effective 2023`
  - Bias-audit obligation for AEDTs used in employment decisions.
```

#### `bands` — Horizontal bands

Full-width strips.

```markdown
<!-- _class: statute-stack bands -->

## bands strips each jurisdiction full-width.

- Federal `15 U.S.C. §6501` `In effect since 2000`
  - Verifiable parental consent for under-13 personal data.
- State `Cal. Civ. §1798.120` `Enforced 2023`
  - Opt-in for selling or sharing under-16 data; opt-out for over-16.
- Local `NYC §22-1201` `Effective 2023`
  - Bias-audit obligation for AEDTs used in employment decisions.
```

#### `preemption` — preemption

Which law yields.

```markdown
<!-- _class: statute-stack preemption -->

## preemption marks which law yields.

- Federal `15 U.S.C. §6501` `Preempts state rules`
  - Sets the floor for under-13 personal data collection.
- State `Cal. Civ. §1798.120` `Survives preemption`
  - Stricter opt-in regime on top of COPPA's baseline.
- Local `NYC §22-1201` `Independent of preemption`
  - Bias-audit obligation distinct from privacy preemption scope.
```

#### `lane` — Markdown table

One column stack.

```markdown
<!-- _class: statute-stack lane -->

## lane runs the stack in one column.

| Jurisdiction | Citation              | Headline obligation       | Status      |
| ------------ | --------------------- | ------------------------- | ----------- |
| Federal      | 15 U.S.C. §6501       | Parental consent <13 data | In effect   |
| State        | Cal. Civ. Code §1798  | Notice + opt-out + DSAR   | Enforced    |
| Local        | NYC §22-1201          | Annual AEDT bias audit    | Effective   |
```

### Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [the universal modifier catalog](../authoring/modifiers.md) for the catalog.

### Related components

- `list-tabular` — the rows are citation-only references, no obligation prose
- [`obligation-matrix`](#obligation-matrix) — obligations cross-tab against actors or controls
- [`authority-chain`](#authority-chain) — the rows are a delegation lineage, not parallel jurisdictions
- `compare-table` — the comparison is across criteria, not jurisdictions

### Demo deck

Every variant rendered, with a live preview and an in-browser editor:
<https://lattice.style/components/legal/statute-stack>


## contact

> An identity card that encodes a vCard: name, title and contact lines beside a QR that saves the presenter to a phone.

**Function** statement · **Form** panel · **Substance** structure

**Tags** `reference` · `onboarding` · `kickoff`

Use as the "scan to add me" close or a speaker-intro slide. The QR encodes a vCard the audience saves in one tap; the card shows the name as hero with title/org and a contact ledger. Author the fields as a postfix-key list.

### Agent contract

#### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `title` | `h2` | no | Optional framing heading; the person's name is the visual hero, drawn from the `name` field. |
| `fields` | `ul > li` | yes | One field per bullet in postfix-key form — value first, trailing inline-code names the field: `- Sharmarke Aden `name``. Keys: name (required), title\|role, org\|company, email, phone\|tel, url\|web. Optional key: `caption` (CTA under the QR). |
| `caption` | `ul > li` | no | Optional call-to-action under the QR, as a postfix-key bullet: ``- Scan to add me `caption` ``. |

#### Common mistakes

- **No field is tagged with the `name` key.** Every contact card needs exactly one field trailing `` `name` `` — without it the vCard has no identity and the hero name area renders empty.
- **The trailing key doesn't match a supported alias, e.g. `` `position` `` instead of `` `title`/`role` ``.** Only the documented keys are recognized (name, title|role, org|company, email, phone|tel|mobile, url|web|site, caption) — an unrecognized key isn't mapped to any card field, so the whole bullet is silently dropped from both the rendered card and the vCard, not merely misplaced.

### When to use

- **The scan-to-add-me close.** End a pitch or intro with a code the audience scans to save your contact, instead of trading business cards.
- **Show what you choose, encode the rest.** Every non-empty field goes into the vCard; the card foregrounds the name, title and org and lists email/phone/url beneath.

### When NOT to use

- **Not a team roster.** One card is one person. For a set of people use an inventory layout; a contact card is a single identity.
- **Don't bold the field values.** The value leads and the key trails as a small tag — name last, never first. Writing the key first, bolded, breaks the transform's postfix read.

### Authoring

```markdown
<!-- _class: contact -->

## Add me.

- Full Name `name`
- Title `title`
- Organization `org`
- name@example.com `email`
- Scan to add me `caption`
```

### Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [the universal modifier catalog](../authoring/modifiers.md) for the catalog.

### Related components

- [`wifi`](#wifi) — the card is a network to join rather than a person

### Demo deck

Every variant rendered, with a live preview and an in-browser editor:
<https://lattice.style/components/connect/contact>


## wifi

> A network join card: readable Wi-Fi credentials beside a QR a phone scans to connect in one tap.

**Function** statement · **Form** panel · **Substance** structure

**Tags** `reference` · `onboarding` · `kickoff`

Use to get a room onto the Wi-Fi without reading a password aloud. The QR encodes the standard WIFI: payload; the same details render legibly for anyone typing them by hand. Author the fields as a postfix-key list.

### Agent contract

#### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `title` | `h2` | yes | The card heading (e.g. "Join the room."). |
| `fields` | `ul > li` | yes | One field per bullet in postfix-key form — value first, trailing inline-code names the field: `- Offsite-Guest `ssid``. Keys: ssid\|network (required), password\|pass, security\|auth. Omit the password for an open network. Optional keys: `caption` (CTA under the QR); the security row shows exactly what you write. |
| `eyebrow` | `p:first-child > code` | no | Optional kicker above the heading, authored as an inline-code first line: `` `Room Wi-Fi` ``. |
| `caption` | `ul > li` | no | Optional call-to-action under the QR, as a postfix-key bullet: ``- Scan to connect `caption` ``. |

#### Common mistakes

- **Eyebrow written as plain or bold text instead of inline code.** The card is reassembled from its recognized parts, so the eyebrow's SOURCE position doesn't matter — but it must be backtick-wrapped: unwrapped plain or bold text matches nothing and is silently dropped from the rendered card, not shown as a stray paragraph.
- **Using `` `pass` `` as a shorthand for the security TYPE (e.g. `` WPA2 `pass` ``), or using a genuinely unrecognized key like `` `encrypt` ``.** `pass` IS recognized, but as an alias for `password`, not `security` — `` WPA2 `pass` `` routes "WPA2" into the password field (and into the scannable QR payload as the actual password), not the security-type field. For the security type use `security`/`auth`/`encryption`. A genuinely unrecognized key isn't mapped to any card field at all, and the whole bullet is silently dropped from the rendered card — it doesn't just land in the wrong place.

### When to use

- **Get the room connected.** Guests scan to join instead of squinting at a password on the slide — the credentials are still shown for anyone who prefers to type.
- **Open networks are one field short.** Drop the password bullet and the card renders an open network; the QR encodes it as `nopass`.

### When NOT to use

- **Not for secrets that outlive the room.** A rendered deck is persistent and shareable. Use it for guest/offsite networks, not for credentials that must not leak.
- **Don't bold the field values.** The value leads and the key trails as a small tag — ssid last, never first. Writing the key first, bolded, breaks the transform's postfix read.

### Authoring

```markdown
<!-- _class: wifi -->

`Room Wi-Fi`

## Join the room.

- Network-Name `ssid`
- network-password `password`
- WPA2 `security`
- Scan to connect `caption`
```

### Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [the universal modifier catalog](../authoring/modifiers.md) for the catalog.

### Related components

- [`contact`](#contact) — the card is a person's identity rather than a network

### Demo deck

Every variant rendered, with a live preview and an in-browser editor:
<https://lattice.style/components/connect/wifi>


