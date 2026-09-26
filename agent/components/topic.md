# topic

> Topic anchor inside a section. A horizontal cut: the topic above, the section's topics as a scale below.

**Function** anchor · **Form** split · **Substance** prose

**Tags** `walkthrough` · `agenda-setting` · `board-deck`

Marks a topic WITHIN a section, where `divider` marks the boundary BETWEEN sections. The lower band shows the section's other topics with the current one lit, so the audience knows not just what this is but where it sits and what is still ahead. The track is derived from the deck — every topic slide's own heading — so it is written once and cannot go stale. The track's ceiling is a property of the SECTION rather than of this slide, so it is stated here rather than in `capacity`: four sibling topics is the sweet spot, six is comfortable, and past nine the track stops being countable at a glance and the section wants splitting with a second `divider`. Below two there is no scale to draw and the track is suppressed.

## Agent contract

### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `eyebrow` | `p:first-of-type > code` | no | The section this topic sits in, as inline code. Mono caps, top-left. Usually the divider's own label — `Section 02 · Unit economics`. |
| `heading` | `h2` | yes | The topic's name. Write it as a short noun phrase (`Payback`, `Cost to win`) — two to four words. It is also the label this topic contributes to every sibling slide's derived track, so a full sentence reads as a headline on this slide and overflows its column on the others. |
| `claim` | `h2 + p` | no | One sentence of context under the name. In the default it supports the heading; under `fact` it becomes the slide's display line. |
| `track` | `ul.tile-track > li` | no | DERIVED, not authored — `lib/transformers/topic-track.js` builds it from the headings of every `topic` slide in this section and lights the current one. Override it with the `_track` DIRECTIVE, never with a list: `<!-- _track: Cost to win \| Lifetime value \| [Payback] -->` names the labels outright, pipe-separated, with the topic THIS slide is on in square brackets. Reach for it only where derivation cannot — labels shorter than the headings, or a section whose later topics are not written yet; an overridden slide then contributes no name to its siblings' tracks. Mark nothing and the scale draws with no column lit; mark twice and the first wins. A markdown list on a `topic` slide is NOT a track — it renders as content and the slide still derives its own, which `npm run lint:deck` flags. In the GALLERY every sample names its own track, because a gallery slide has no section around it and derivation needs one — the composition is identical either way. At the nine-topic ceiling a column is about a tenth of the slide, so a single word longer than ~10 characters BREAKS MID-WORD — the track keeps its equal columns rather than letting one word widen them, which is the lesser of the two failures. Keep ceiling-count sections to short labels, or split the section. |
| `basis` | `p:last-of-type > code` | no | What the claim rests on — source, period, method. A trailing inline-code paragraph on a foot rule. Belongs with `fact`, where the slide asserts something; on the default the claim is supporting text and rarely needs provenance. |

### Variant decision rule

- **default (no modifier).** The audience needs to know where they are in the section — the topic named, with its siblings as a scale below.
- **`fact`.** The topic's finding matters more than its name. Drops the track and the cut, promotes the claim to the display line, and adds a provenance line at the foot.

### Common mistakes

- **Authoring the sibling list by hand on every topic slide.** Don't — it is derived. `lib/transformers/topic-track.js` reads the `## heading` of every `topic` slide in the section and builds the track, so renaming a topic is a one-slide edit. Where the derived labels genuinely are not what you want, override the whole scale with one directive — `<!-- _track: Cost to win | [Payback] -->` — and that slide then stops contributing its name to its siblings' tracks.
- **Expecting a track on a topic slide that sits before the deck's first `divider`.** The track is scoped to a section, and a section starts at a `divider` — any divider, `light` included, matching how the section progress rail counts. A topic slide with no divider above it renders as a single dark canvas — the band, the seam and the shelf reserve are all dropped, so it composes rather than reserving room for a track that is not there. It keeps the DEFAULT type hierarchy; it does NOT become `fact`.
- **Reaching for `fact` and leaving the claim as a fragment or a label.** `fact` puts the claim at display size, so it must be a whole sentence that states something — and one sentence, not three. Start it with the number (`Fourteen months blended, …`) rather than bolding the figure; two typographic registers inside one display line is one too many.
- **A long single-word topic name in a section at or near the nine-topic ceiling.** The track's columns are equal by construction, so at nine a word over ~10 characters breaks mid-word rather than widening its column (the gallery's stress slide shows it on `Postmortems`). Either shorten the name — the heading register is two to four short words anyway — or split the section, which is what a nine-topic section usually wants.
- **Writing the override as a markdown list, the way it used to work.** A list on a `topic` slide is content now, not the track: the slide renders your list AND derives its own track below it. Move the labels into `<!-- _track: Cost to win | Lifetime value | [Payback] -->` and delete the list. The bracketed label is the topic this slide is on — bold does nothing, and an override that marks none draws with no column lit. `npm run lint:deck` flags both shapes.
- **Putting `_track` on a `topic fact` slide.** `fact` is one flat canvas and drops the track, so the directive draws NOTHING there — and it still opts the slide out of derivation, which quietly removes this topic's name from every sibling's scale. Measured: a three-topic section whose `fact` slide carries `_track` leaves its two siblings showing a two-topic track. Drop the directive and the slide goes back to contributing its heading; drop `fact` if what you wanted was the scale. `npm run lint:deck` flags it.
- **Expecting the two-band composition under `color-mode: dark` or in a dark-mode export.** It flattens, and that is the whole anchor family's behavior rather than this component's quirk: the deck-wide `dark` canvas replaces a sovereign anchor's own field, so `divider` loses its spectrum rail and `title` and `closing` lose `--surface-inverse` in exactly the same way (measured in Chromium; the committed `divider.gallery.dark.pdf` shows it). The track still draws and still lights the current topic, so the slide keeps saying where you are — it says it on one flat field instead of across a cut. If you need the cut, that is light mode.

## When to use

- **A topic inside a long section.** A section that runs more than a handful of slides loses the audience between its dividers. A `topic` re-anchors them without spending a full section break, and shows what is still ahead.
- **When the room needs the finding, not the label.** The `fact` variant promotes the claim to the display line and demotes the name to a label, so the audience leaves the anchor already knowing the answer and the following slides show the work.
- **Serialized or reviewed decks.** A board pack read asynchronously benefits most: the derived track means a reader who opens at slide 30 can see the shape of the section they landed in.

## When NOT to use

- **A section with one topic, or with ten.** Below two there is no scale to draw and the track is suppressed, leaving a slide that is a `divider light` with extra chrome — use `divider light`. Past nine the track has ramped its labels down twice and still runs out of room; a section with ten topics is two sections, so split it with another `divider`. If what you want is the deck's contents rather than one section's, that is `agenda`.
- **A full sentence as the heading.** The heading is also this topic's label in every sibling slide's track. A sentence reads as a headline here and overflows its column there. Short noun phrase; put the sentence in the claim.
- **More than one per two or three content slides.** A topic anchor is a breath, not a separator. Firing it between every slide makes it chrome and costs it the authority that makes it work.
- **Carrying a fact that appears nowhere else.** An anchor is deletable without losing information — the section proves the claim on the slides that follow. If the number lives ONLY on this slide, it is a `big-number`, not a `topic`.

## Authoring

```markdown
<!-- _class: topic -->

`Section 02 · Unit economics`

## Payback

Fourteen months blended, against a nine-month plan.
```

## Anatomy

```text
┌─────────────────────────────────────────┐
│            [dark background]            │
│  SECTION 02 - UNIT ECONOMICS            │
│                                         │
│                                         │
│  Topic name                             │
│  One sentence of context.               │
│                                         │
│  -------------------------------------  │
│  Cost to win   Lifetime   [Payback]     │
└─────────────────────────────────────────┘
```

## Variants (component-specific)

### `fact` — fact

One flat canvas. The claim becomes the display line, the name a label on a rule, and a mono basis line states what the claim rests on.

```markdown
<!-- _class: topic fact -->

`Section 02 · Unit economics`

## Payback

Fourteen months blended, against a nine-month plan.

`CAC ÷ monthly gross margin · 14 cohorts · FY26 actuals`
```

## Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [the universal modifier catalog](../authoring/modifiers.md) for the catalog.

## Related components

- [`divider`](./divider.md) — the boundary BETWEEN sections, rather than a topic inside one
- [`agenda`](./agenda.md) — the deck's sections, listed once, as a contents page
- [`big-number`](./big-number.md) — the metric IS the slide, not an anchor before the evidence

## Demo deck

Every variant rendered, with a live preview and an in-browser editor:
<https://lattice.style/components/anchor/topic>
