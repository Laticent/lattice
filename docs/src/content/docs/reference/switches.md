---
title: Switches
description: Every on/off a deck or a slide can set, spelled no-X to turn it off and with-X to turn it back on for one slide.
---

A **switch** is anything a slide can show or hide: the page number, the section
rail, callouts, motion, the spectrum accent and so on. Every switch is spelled
the same way:

- `no-X` turns it **off**.
- `with-X` turns it back **on** for one slide.

Turn a switch off for the whole deck with `class: no-X` in the front matter (or,
for a setting that has its own key, its plain word, such as `motion: off`). A
deck's `class:` reaches every slide, including one that sets its own
`<!-- _class: … -->`. One slide then brings it back:

```markdown
---
class: no-progress
---

<!-- _class: content with-progress -->

# This slide keeps its section rail
```

**The rule, everywhere:** a slide's `with-X` wins over a `no-X`, which wins over
`silent`, which wins over the layout's own default. It holds the same in the
Studio, the Playground, the command line and an exported Marp bundle.

## Chrome — the frame around the slide

| Switch | Off | Back on | Notes |
|---|---|---|---|
| Running header | `no-header` | `with-header` | `silent` turns it off too. |
| Running footer | `no-footer` | `with-footer` | `silent` turns it off too. |
| Page number | `no-pagination` | `with-pagination` | Also `paginate: false` for the deck. Title, divider and closing slides have none unless `with-pagination`. `silent` turns it off too. |
| Section rail | `no-progress` | `with-progress` | Appears once the deck has a `divider`. `silent` turns it off too. |
| Deck logo | `no-logo` | `with-logo` | Appears once the deck sets `logo:`. |

`silent` is the one word for a clean slide: it turns the header, footer, page
number and rail off together. Any one comes back with its own `with-X`:
`<!-- _class: content silent with-pagination -->`.

## Content

| Switch | Off | Back on | Notes |
|---|---|---|---|
| Below-note | `no-note` | `with-note` | Keeps a trailing paragraph as body copy instead of a ruled note. |
| Heading period | `no-period` | `with-period` | `no-period` removes a trailing period from the headings; `with-period` adds one. |
| Table row label | `no-row-label` | `with-row-label` | Overrules the measured first-column label, either way. |
| Pane spine | `no-spine` | `with-spine` | The line between the panes of a `columns` or `rows` slide. An exported Marp bundle stacks the panes, so it draws no spine. |
| Callouts | `no-callout` | `with-callout` | Also `callout: off` for the deck. |
| Motion | `no-motion` | `with-motion` | Also `motion: off` / `motion: on` for the deck. |

## Look

| Switch | Off | Back on | Notes |
|---|---|---|---|
| Spectrum accent | `no-spectrum` | `with-spectrum` | Also `spectrum: off` for the deck. `with-spectrum` is the rainbow default. |
| Spectrum edge bar | `no-spectrum-edge` | `with-spectrum-edge` | Also `spectrum-edge: off`. `with-spectrum-edge` is the default top bar. |
| Spectrum card rail | `no-spectrum-card` | `with-spectrum-card` | `spectrum-card: auto` stamps `with-spectrum-card`. |
| Spectrum trim | `no-spectrum-trim` | `with-spectrum-trim` | `spectrum-trim: on` stamps `with-spectrum-trim`. |
| Heading rule | `no-heading-rule` | `with-heading-rule` | Also `rule: none` for the deck. |
| Finish | `no-finish` | `with-finish` | Also `finish: none` for the deck. |
| Finish backdrop | `no-backdrop` | `with-backdrop` | Keeps the finish, drops its backdrop. |
| Tints and marks | `no-treatment` | `with-treatment` | Clears every `tint-*` and `mark-*` on the slide. |

## Old spellings

These were renamed, and the old spelling no longer does anything.
`npm run lint:deck` flags each one and fixes it in place, and the Studio offers
the same fix.

| Old | New |
|---|---|
| `callout-off` · `callout-on` | `no-callout` · `with-callout` |
| `motion-off` · `motion-on` | `no-motion` · `with-motion` |
| `spectrum-off` · `spectrum-on` | `no-spectrum` · `with-spectrum` |
| `spectrum-edge-off` | `no-spectrum-edge` |
| `spectrum-card-off` · `spectrum-card` | `no-spectrum-card` · `with-spectrum-card` |
| `spectrum-trim-off` · `spectrum-trim` | `no-spectrum-trim` · `with-spectrum-trim` |
| `row-label` | `with-row-label` |
| `no-rule` (pane spine) | `no-spine` |
| `rule-none` (heading rule) | `no-heading-rule` |
| `finish-none` | `no-finish` |
| `backdrop-none` | `no-backdrop` |
| `treatment-none` | `no-treatment` |
| `tag-none`, `tag: none` | `tag-bare`, `tag: bare` (the tag's bare-text style, not a switch) |
