---
marp: true
theme: indaco
paginate: true
header: "Lattice · #1715"
---

<!-- _class: title silent -->

# The muted tier, split

`Declared contracts · what they paint`

Four color tokens whose declared contract did not match what they painted.

---

<!-- _class: split-compare -->
<!-- _footer: "Part 2 · --text-muted gained AA; --muted-mark took the decoration" -->

## One token was doing two jobs with two different floors.

- Muted text
  - Captions, table headers, slide chrome. Was sub-AA on 44 of 72 pairs, worst 2.11:1. Now clears 4.5:1 on both surfaces, everywhere.
- Muted decoration
  - Rules, hairlines, skipped marks, low-alpha washes. Moved to a mark token at the 3:1 graphical floor; 32 of 36 values unchanged.

---

<!-- _class: list-tabular -->
<!-- _footer: "Part 2 · the muted text tier at its new floor, on --bg-alt" -->

## Muted text still reads as muted — and now it reads.

| Palette | Muted text was | Now | Separation from body |
| --- | --- | --- | --- |
| magnolia / light | 2.11:1 | 4.67:1 | 0.240 |
| cuoio / light | 2.43:1 | 4.65:1 | 0.038 |
| concrete / dark | 2.95:1 | 4.67:1 | 0.065 |
| indaco / dark | 3.68:1 | 4.66:1 | 0.230 |

---

<!-- _class: checklist -->
<!-- _footer: "Part 2 · skipped marks and rules now read --muted-mark" -->

## The decoration tier keeps its quiet.

- Empty and skipped state marks
- Card rules and table hairlines
- Low-alpha cell washes
- Radar bands and grid lines

---

<!-- _class: code -->
<!-- _footer: "Part 3 · the slide code panel — re-theme this deck to an a11y palette" -->

## Syntax colors are grouped by what survives the condition.

```js
// Six groups, not twelve: a twelve-way color distinction does not
// survive a dichromacy, and none of it survives achromatopsia.
function separationUnder(condition, roles) {
  const seen = simulate(roles, condition);   // the reader's actual colors
  const worst = minPairwiseDistance(seen);   // not the authored ones
  return worst >= (condition === 'achromatopsia' ? 0.048 : 0.11);
}
```

---

<!-- _class: finish finish-halo -->
<!-- _footer: "Part 1 · the finish-halo vignette rim, now a neutral ink" -->

## The rim is ink again, not the brand hue.

A token declared nowhere means the fallback wins on every theme, forever — and this rim was landing in the same hue family as the wash it exists to seat against.

---

<!-- _class: finish finish-nimbus -->
<!-- _footer: "Part 1 · finish-nimbus, the same repair" -->

## Same phantom, same repair.

Both rims now read a contract token directly, so they need no fallback at all — which also removes the chain the contract ledger was tracking.

---

<!-- _class: decision -->
<!-- _footer: "#1715 · what the gates now hold" -->

## Three gates, each one bitten before its green was trusted.

- Phantom reads
  - A token nothing declares and nothing writes. Runtime-set is proven by a write.
- Muted tier floors
  - 4.5 for the text half, 3.0 for the mark half. Fails closed on an unreadable value.
- Syntax separation
  - The a11y families under simulation — contrast alone passed the whole time.
