# The jank sweep cannot see most of what it would need to, on this family

**`npm run check:jank` has three arms — drift, collision, crowding. On the chart
family, two of them have nothing to measure and the third found one real
defect.** This is the first time the sweep has been pointed at the bucket, and
the first thing it reports is the shape of its own blind spot.

Measured: all 21 members, `wide` (16:9), `indaco`, the default `heading` axis,
24 steps. Raw output in each run's `--json`; the tool is `tools/check-jank.js`
and the method is `engineering/jank.md`.

## What could not be measured, and why

**Drift and collision need an ANCHOR, and no chart has one.** Both arms watch a
positioned pseudo-element — a running mark, a reserved band — and ask whether it
holds its place as content grows. `--anchors` reports the same thing on every one
of the 21:

> none. This component draws no positioned pseudo the walk can place, so there is
> nothing for `--anchor` to name.

**0 of 21.** That is not a failure of the members; a chart's furniture is drawn
inside its own figure rather than pinned to the section. But it does mean the
sweep's headline number — "anchor moved Npx" — is structurally unavailable here,
and a green `check:jank` on a chart is green because nothing was watched.

**The axis that WOULD stress a chart cannot be swept.** A chart's layout responds
to its DATA growing, not its title — more categories, longer labels. Those are
`--axis count` and `--axis words`, and both refuse to run:

```
check-jank: no element builder for 'bar' — add one to tools/lib/calibrate-core.js
BUILDERS, or sweep --axis heading.
```

`BUILDERS` carries **27 entries and not one chart**. The companion list of
components deliberately excluded from a count axis,
`NOT_COUNT_CALIBRATABLE`, names four — `citation-card`, `logo-wall`, `math`,
`content` — and no chart is on it either. So the family is absent from both: an
omission, not a decision. **Closing P6's acceptance test ("no drift / collision /
crowding across the 21 galleries at stress sizes") is blocked on filling that
roster**, and filling it is 21 authoring shapes that each have to be right,
because a wrong builder measures a chart nobody would author.

## What the heading axis did measure

**14 of 21 are vacuous — the ink does not move at all.** The tool says so itself
rather than reporting a clean pass:

> every step laid out in the same place — this axis is not moving the ink, so the
> clean verdicts above are vacuous.

**The 7 that do move all move the same way, and the split is the render nature.**

| | ink top | ink bottom | behavior |
|---|---|---|---|
| `gantt` | 88 → 88 | 476.8 → 566.3 | pushes down 89.5px |
| `journey` | 88 → 88 | 605.2 → 650 | pushes down 44.8px |
| `kanban` | 85 → 85 | 504.5 → 549.3 | pushes down 44.8px |
| `matrix-grid` | 88 → 88 | 520.3 → 565 | pushes down 44.7px |
| `progress` | 85 → 85 | 458.1 → 502.9 | pushes down 44.8px |
| `roadmap` | 88 → 88 | 533.3 → 578.1 | pushes down 44.8px |
| `timeline-list` | 85 → 85 | 485.5 → 530.2 | pushes down 44.7px |

Every one holds its top and grows downward: the heading takes a second and third
line, and the body does not yield, it moves. Cross-tabulated against the
`render` declaration the answer is clean — **all 5 `html` members push down, and
13 of the 14 `svg` members are vacuous**, because an SVG body scales into a
viewBox-sized stage while an HTML body is content-sized.

**`gantt` is the exception and worth naming**: it declares `render: "svg"` and
still pushes down 89.5px, the largest spread in the family, because its figure
height is derived from the lane count rather than from a fixed aspect. It is the
one SVG member whose stage is content-sized.

## The one real defect

**`journey` crowds at a two-line heading.** It is the only member whose ink
crosses out of the frame's safe area and into the section's bottom padding:

| heading | ink bottom | breathing |
|---|---|---|
| 1 line | 605.2 | 0 |
| **2 lines** | **627.6** | **−11.6px** |
| **3 lines** | **650** | **−34px** |

A two-line heading is entirely ordinary, so this is reachable by any author who
writes a real title. And it is exactly the case `engineering/jank.md` says no
other gate catches — the content stays inside the frame and eats its breathing
room, so no overflow channel tags it, no red ring, no autosplit. The sweep marks
it advisory and does not fail.

**Not fixed here, and logged rather than folded in.** Making the journey board
yield to its heading is a layout change to a shipped component — a change a human
sees on a slide, which owes its own demo deck (HARD RULE #9) — and pulling it
into a PR about mark declarations is the widening HARD RULE #17 exists to stop.
It is a pre-existing defect found off the path of the current change, which is
the one case #18 routes to a record instead of a diff. This is that record.

## One finding that is NOT jank, recorded so nobody chases it twice

Seven members — `kanban`, `piechart`, `progress`, `quadrant`, `radar`,
`state-chart`, `timeline-list` — report `breathing: −3px` on the TOP edge. It
looks like a crowding hit and is not one: it is **identical to the pixel at every
one of the 24 steps**, so it never varies with content and nothing about it is
drift. Verified invariant (`min === max === −3` across the sweep) on four of the
seven.

It is also not the tool's universal baseline — `list` and `kpi` report no
crowding at all, and `stats` reports a different edge entirely (`left −71.8px`).
So it is real and shared among those seven, just static: a fixed 3px encroachment
on the top safe band, which is a spacing question for a different instrument than
this one.

## What would close P6

1. **Chart entries in `BUILDERS`** (`tools/lib/calibrate-core.js`), so `--axis
   count` and `--axis words` can run. This is the blocker; everything below
   depends on it.
2. **Re-run the sweep on the data axes**, which is where a chart's layout
   actually moves, and at the three non-`wide` families.
3. **The `journey` bottom-padding fix**, with the demo deck it owes.
4. **A decision on whether a chart should carry an anchor at all** — if the
   answer is no, say so in `NOT_COUNT_CALIBRATABLE`'s spirit, so the next session
   reads a recorded decision instead of re-deriving this file.
