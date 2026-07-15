---
marp: true
theme: indaco
size: hd
paginate: true
header: "Lattice · radar narration"
footer: "read-aloud narrates the radar chart"
---

<!-- _class: title -->
<!-- _paginate: false -->
<!-- _footer: '' -->
<!-- _header: '' -->

# Read-aloud that reads the radar.

`Mermaid radar-beta narration`

*The last first-wave Mermaid type. A radar chart's meaning is its authored numbers on named axes — so read-aloud states the scale, then each curve's value on each axis, pairing them exactly as the chart plots them (design 2026-07-14, radar fast-follow).*

---

<!-- _class: diagram -->

`01 · Positional values`

## Values pair to axes in order.

```mermaid
radar-beta
  title Team skills
  axis d["Delivery"], q["Quality"], s["Speed"]
  curve a["Alice"]{85, 90, 70}
  curve b["Bob"]{70, 80, 95}
  max 100
```

> The reading opens with the scale, then walks each curve axis by axis in declaration order: "A radar chart, Team skills, on a scale of zero to one hundred. Alice: Delivery, eighty-five; Quality, ninety; Speed, seventy. Bob: Delivery, seventy; Quality, eighty; Speed, ninety-five."

---

<!-- _class: diagram -->

`02 · Keyed values`

## Named values pair by axis, not by position.

```mermaid
radar-beta
  axis a["Alpha"], b["Beta"], c["Gamma"]
  curve x["Series X"]{ b: 5, a: 10, c: 15 }
```

> A curve can name each value by its axis id, in any order. The reading still pairs each to the right axis and speaks them in axis order — so "b: 5, a: 10, c: 15" reads "Series X: Alpha, ten; Beta, five; Gamma, fifteen." The value always lands on the axis the author named.

---

<!-- _class: diagram -->

`03 · The scale, stated`

## Read the bounds the author set — or the fit the chart uses.

```mermaid
radar-beta
  axis a["Reach"], b["Depth"], c["Cost"]
  curve p["Plan"]{3, 7, 4}
```

> A radar chart is unreadable by ear without its scale, so the reading always states it. With `min`/`max` it reads those bounds; without a `max` it reads the same extent the chart draws — the outer ring sitting exactly at the largest value: "A radar chart on a scale of zero to seven. Plan: Reach, three; Depth, seven; Cost, four."

---

<!-- _class: diagram -->

`04 · When it's a lot`

## A wall of numbers becomes a shape.

```mermaid
radar-beta
  axis s["Speed"], c["Cost"], q["Quality"], u["Support"], e["Security"]
  curve alpha["Alpha"]{85, 40, 90, 70, 60}
  curve beta["Beta"]{60, 80, 70, 55, 95}
  curve gamma["Gamma"]{50, 65, 55, 80, 60}
```

> Fifteen values read one after another would drown a listener and lose the point — which curve leads where. So past about a dozen values the reading summarizes with the counts and each curve's peak, the one fact a listener can hold: "A radar chart on a scale of zero to ninety-five, with three curves across five axes. Alpha peaks on Quality, at ninety. Beta peaks on Security, at ninety-five. Gamma peaks on Support, at eighty." The summary names itself, so nothing is silently dropped.

---

<!-- _class: diagram -->

`05 · Honest bail`

## A reading it can't pair faithfully, it doesn't guess.

```mermaid
radar-beta
  axis a["A"], b["B"], c["C"]
  curve x["X"]{5, 8}
```

> When a positional curve's value count doesn't match the axes — or a keyed value names an axis that doesn't exist — the values can't be paired without guessing, so the slide falls back to its heading and this caption. No value is ever read against the wrong axis.

---

<!-- _class: closing -->
<!-- _footer: '' -->

# The radar is spoken now.

`radar-beta · scale + per-axis values · positional or keyed · read-aloud + exported captions`
