# cycle

> A closed loop of 3-6 stages that returns to its start — for a process with no beginning or end, where the last stage feeds the first.

**Function** progression · **Form** timeline · **Substance** structure

**Tags** `process` · `workflow` · `retrospective`

Use when the sequence is CIRCULAR: a natural cycle, a feedback loop, a recurring phase. A linear process with a real start and finish is list-steps; a cycle's whole point is the return.

## Agent contract

**Capacity** ~4 items (crowds past 5, overflows past 6) — past that, list-steps / split across slides.

**Density** aim ~12 words per item; past ~18 it reads as a wall of text — a stage is a name plus one clause, not a paragraph.

### Slots

| Slot | Selector | Required | Description |
|---|---|---|---|
| `title` | `h2` | yes | Slide heading naming the cycle. |
| `eyebrow` | `p > code` | no | Optional label above the heading. |
| `stages` | `ul > li` | yes | Each list item is one stage in the loop. Top bullet = stage name (auto-bold); one nested bullet = a single clause of body. Read clockwise; the last stage returns to the first. |

### Common mistakes

- **Authoring stages as a numbered list (`1.`) instead of a bullet list (`-`).** The stage-node styling and connector chevrons are scoped to `ul > li` (`section.cycle > .cell-stage > ul`) — an `ol` doesn't match the selector, so stages render as a plain, unstyled numbered list with no ring, no chevrons, no return arc.
- **Assuming the eyebrow follows the after-heading pattern used by `title`/`closing`.** cycle has no eyebrow-specific CSS — it inherits the shared before-heading rule (base.modifiers.css): the inline-code eyebrow paragraph must sit directly BEFORE the `## heading`, not after it, or the masthead lift re-seats it as the italic, secondary-color subtitle instead of the intended mono kicker.

## When to use

- **The sequence is circular.** When the last stage feeds the first and there is no true beginning — a natural cycle, a feedback loop, a recurring season. The return is the point; a layout with a start and end would misrepresent it.
- **Three to six stages.** Under three there is no loop to trace; past six the ring crowds and the return arc loses force. Merge adjacent stages or move to list-steps.
- **Each stage is a name plus a clause.** A stage carries a short name (auto-bold) and one clause of body. Richer per-stage descriptions belong in list-steps; a bare list of names belongs in list.

## When NOT to use

- **A linear process.** If the sequence has a real start and a real end, use list-steps — the numbered spine promises exactly that order. The cycle's closed loop mis-cues a one-way process as recurring.
- **More than six stages.** Past six the ring crowds and the descriptions shrink below legibility. Keep the six load-bearing stages here and push the detail to list-steps or a second slide.
- **Parallel options.** If the items are alternatives the audience weighs rather than stages that flow into each other, use cards-grid or verdict-grid. The arrows here read as causation, not choice.

## Authoring

```markdown
<!-- _class: cycle -->

## The heading names the loop.

- First stage
  - One clause saying what happens here.
- Second stage
  - One clause saying what happens here.
- Third stage
  - One clause saying what happens here.
- Fourth stage
  - One clause saying what happens here.
```

## Universal modifiers

This component accepts all universal variants (`dark`, `compact`, `accent`, state markers, treatments). See [design/design-system.md §6.5](../../../../design/design-system.md#65-universal-variants--three-tiers) for the catalog.

## Related components

- [`list-steps`](../../progression/list-steps/list-steps.docs.md) — the process is linear — a real start and finish, not a loop
- [`timeline-list`](../../chart/timeline-list/timeline-list.docs.md) — events fixed to dates rather than a repeating cycle
- [`diagram`](../../diagram/diagram/diagram.docs.md) — the loop has branches or feedback into non-adjacent stages

## Demo deck

See [cycle.gallery.light.pdf](./cycle.gallery.light.pdf) for rendered examples of every variant.
