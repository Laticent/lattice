---
kind: plugin
name: Checks
order: 5
promise: Six answers, drawn the same way on every slide.
intro: 'Write `[x]` at the start of a criterion and Lattice draws a check: yes, partly, no, unknown, open or does not apply, each with its own shape so it reads in grayscale. The full form, `@check{yes, label=Residency}`, puts the check and its words in one pill, anywhere inline code can go. Checks are part of how Lattice draws a slide, so this plugin is always on.'
useWhen: A slide scores options, features or obligations against criteria, and the reader needs each answer at a glance.
syntax: '`[x]` · `@check{pass}`'
facts:
  - { k: You write, v: '`[x]` or `@check{…}`' }
  - { k: Draws with, v: "Lattice's own shapes, in the deck's status colors" }
  - { k: Surfaces, v: Every one — drawn at render time }
  - { k: Loaded, v: "Always. Part of every deck, so it has no off switch" }
reference:
  - label: The plugin's reference
    href: https://github.com/Laticent/lattice/blob/main/lib/plugins/checks/checks.docs.md
    note: The six answers, the full form, and how components place a check in a pill, a row or a cell.
  - label: The conformance cases
    href: https://github.com/Laticent/lattice/blob/main/lib/plugins/checks/checks.fixtures.md
    note: Exactly what each spelling renders to.
  - label: A sample deck
    href: https://github.com/Laticent/lattice/blob/main/examples/checks.md
    note: A verdict grid, a pricing table, an obligation matrix in words, and the full form in a sentence.
  - label: Why it is a plugin
    href: https://github.com/Laticent/lattice/blob/main/engineering/decisions/2026-10-18-checks.md
    note: The design note, including the name, containment, and why statuses share the registry.
examples:
  - key: criteria
    label: Criteria, scored
    caption: Each criterion is a check inside a pill, so the answer and its name read as one.
    sample: |
      <!-- _class: verdict-grid -->

      ## Each criterion is a check inside a pill.

      - Build in-house
        - [x] Residency
        - [-] Speed
        - [!] Audit trail
        - Full control, slow.
      - Vendor West
        - [x] Residency
        - [x] Speed
        - [/] Audit trail
        - No audit tier.
  - key: sentence
    label: In a sentence
    caption: The shortcut draws the disc; the full form names the answer, and with a label becomes a pill.
    sample: |
      ## Where the vendor stands.

      Residency `[x]` · SSO `@check{partly}` · SOC 2 `@check{unknown}`

      The blocker is `@check{no, label="Audit, EU"}`.
---

## The problem

A slide scores three vendors against four criteria. The reader wants each answer at a glance: met, partly met, not met, or not known yet. A typed `✓` and `✗` come out in a different font on every machine, sometimes as a color emoji and sometimes as an empty box. A green row and a red row say nothing in a black-and-white printout, or to a reader who cannot tell the two apart.

- **Typed ticks** take whatever font the machine has, so the same deck looks different in every room.
- **Color alone** disappears in grayscale and for a color-blind reader.
- **Words alone** ("yes", "partial") make a grid read like a form.

What you want is a small drawn shape per answer, the same on every slide, that still reads without color.

## The idea

- **Six answers, one meaning each.** `[x]` yes, `[-]` partly, `[!]` no, `[?]` unknown, `[ ]` open, `[/]` does not apply. An answer means the same thing in every layout.
- **The shape carries the meaning.** A check, a dash, a cross, a question mark, an empty ring and a slash: each still reads in grayscale.
- **One owner.** The plugin draws every check. A verdict grid, a pricing table and an obligation matrix place one in a pill, a row or a cell, and none draws its own.
- **Two spellings.** The brackets are the short form. `@check{…}` is the full form, which names the answer and can carry a label.
- **Always on.** Checks are part of how Lattice draws a slide, so there is nothing to turn on, and nothing can turn them off.

## How to use it

Write a check at the start of a criterion, in a layout that reads them:

```markdown
- Build in-house
  - [x] Residency
  - [!] Audit trail
```

Or in inline code, anywhere:

| You write | You get |
| --- | --- |
| `` `[x]` `` | The disc alone |
| `` `@check{pass}` `` or `` `@check{yes}` `` | The same disc, by name |
| `` `@check{yes, label=Residency}` `` | The check and its words in one pill |
| `` `@check{no, label="Audit, EU"}` `` | A label with a comma goes in quotes |

The answer is one of `pass` `warn` `fail` `unknown` `todo` `skip`, or the word you would say: `yes` `partly` `no` `open` `na`. In the Studio, type `` `@check{ `` for the six answers and what each means.

## Where else it fits

Anywhere a slide answers a yes-or-no question many times: a readiness checklist, a feature comparison, a compliance grid, a scorecard, a status line in a sentence.

## How Lattice uses it

The checklist, verdict-grid, pricing, obligation-matrix and roadmap layouts read the six answers, and any table can with `state-cells`. Each layout says the answer in its own words, so pricing narrates "included" where a checklist says "done", and an obligation matrix's label set renames the words its key, its pills and its narration use.

## What it doesn't do

- **It has no off switch.** Checks are always on.
- **It adds no seventh answer.** Six answers cover what a criterion can be; a status of a piece of work (on track, at risk) is a chart status, which draws with the same shapes.
- **`[X]` with a capital is not a cross.** GitHub reads it as a ticked box. Write `[!]` for no.
- **It doesn't guess.** `@check{maybe}` stays code, and the deck linter says which answers it knows.
