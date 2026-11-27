---
size: portrait
theme: indaco
pagination: true
footer: "Auto-split coverage"
---

<!-- @meta{layout=title} -->

# Split coverage

`Auto-split · every component, every variant`

A component's declared reader is one shape. A variant that renders another still has a seam, and this deck is where each newly-reachable one is rendered and read.

---

<!-- @meta{layout=content} -->

## What this deck is for

- Every slide after this one is a component or variant that could not split before
  - Each is the verification record the split oracle asks for: render it at a portrait size and read the pages
- The pages you see are the export, not a preview
  - Nothing here is measured at render time; the cut comes from the markup

---

<!-- @meta{layout=code, footer=code · one block} -->


## A listing past the wall splits by line-run.

```js
// `code` had a treatment
// and no processor.
import { read } from 'node:fs';

export function load(path) {
  const src = read(path);
  const fm = split(src);
  if (!fm) return bare(src);
  const front = {};
  for (const l of fm.lines) {
    const at = l.indexOf(':');
    if (at < 0) continue;
    front[key(l)] = val(l);
  }
  return { front, body: fm.rest };
}

export function pages(body) {
  return cut(body).length;
}
```

---

<!-- @meta{layout=code, footer=code · two blocks} -->


## Two fenced blocks take a page each.

```js
const before = cut(deck).length;
```

```js
const after = pages(deck).length;
```

---

<!-- @meta{layout=list-tabular, class=register, footer=list-tabular · register} -->


## A register with no clause still paginates.

1. cards-grid `{stable}`
2. split-panel `{stable}`
3. radar `{beta}`
4. word-cloud `{preview}`

---

<!-- @meta{layout=compare-prose, class=axis, footer=compare-prose · axis} -->


## The second axis: how far it reaches.

The verb is one axis — how you think. **Reach** is the other — how far what you make travels.

1. Own the verb
   - You can do the cognitive work — correct, clear, complete. It reaches only you.
2. Widen the reach
   - The work travels: team, org, field. Documented, adopted, durable.

*Most engineers stall on making it travel, not on the thinking.*

---

<!-- @meta{layout=roadmap, class=horizons, footer=roadmap · horizons} -->


## The rollout, by horizon.

| Workstream | Horizon 1 `{Now}` | Horizon 2 `{Next}` | Horizon 3 `{Later}` |
| --- | --- | --- | --- |
| Signal intake | Connector v1 | Two more sources | Streaming |
| Scoring | Equal weights | Tuned weights | Learned weights |
| Review | Manual | Sampled | Exception only |

---

<!-- @meta{layout=obligation-matrix, footer=obligation-matrix} -->


## Duties, regime by regime.

| Regulation | Notice | Consent | Retention | Breach |
| --- | :---: | :---: | :---: | :---: |
| GDPR | [x] | [x] | [x] | [x] |
| CCPA/CPRA | [x] | [~] | [x] | [/] |
| LGPD | [x] | [x] | [~] | [x] |

---

<!-- @meta{layout=matrix-2x2, footer=matrix-2x2} -->


## Effort against impact.

- High impact · Low effort
  - Quick wins
  - Ship these first
- High impact · High effort
  - Strategic bets
  - Fund deliberately
- Low impact · Low effort
  - Habit fillers
  - Prune here
- Low impact · High effort
  - Time sinks
  - One suffices

---

<!-- @meta{layout=split-panel, class=pullquote, footer=split-panel pullquote} -->


> A split page should look like the slide it came from, one element at a time.

`split-panel pullquote · the seam holds`

- The quote keeps its half
  - The dark panel ends where it ends unsplit.
- The column reserves the band
  - Only the panel the pointer reaches gives up space.
- Every page reserves it
  - The last page has no pointer and holds it anyway.
