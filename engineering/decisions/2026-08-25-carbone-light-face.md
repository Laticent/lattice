---
status: in-progress
summary: >
  Carbone had no light face. Resolved rather than assumed, 289 of its 303 tokens were
  IDENTICAL across the two color schemes, because the palette declared them flat and pinned
  `color-scheme: dark` at zero specificity; the header claimed the opposite. What moved were
  FOURTEEN strays — the status trio and its dependents — carrying light arms tuned for an
  off-white canvas the palette never presented, which is why `--fail` read 2.34:1 and twelve
  `carbone|light|*` entries sat in KNOWN_SUB_THRESHOLD. Carbone is curated a real light face
  and takes the house two-file shape, so `theme: carbone` now resolves LIGHT (breaking) and
  `carbone-dark` carries the byte-identical graphite values. The electric lime is 1.48:1 on
  an off-white canvas and cannot carry text, so `--accent`'s light arm holds the SAME hue at
  95% of the chroma and 60% of the lightness (#037829, 5.22:1); the bright value stays the
  brand axis and the spectrum, and `--surface-inverse` stays graphite on both faces so the
  code block keeps its terminal register. The trio had to be solved TOGETHER against AA on
  the self-tinted composed band, twelve frozen CVD ratchets and an absolute AA gate on the
  card — no solution exists with hues fixed; small rotation found one at +0.0024 margin. The
  last KNOWN_BELOW_AA sanction (`errorTextColor`) retires as a side effect, without the CVD
  trade the recorded alternative required, because the light arms finally land on the canvas
  they were written for.
---

# Carbone's light face

## 1 · What was actually wrong

Carbone shipped as the one palette that did not use `light-dark()` switching. Its
manifest said `modes: ["dark"]`, it pinned `color-scheme: dark` at zero specificity,
and its header told authors that "an author needing a light carbone should pick a
different palette".

The header also claimed that a `color-mode: light` deck "renders fully styled: every
token this palette leaves to the engine resolves to the engine's LIGHT arm, so the
canvas, the text tiers and the status trio all come out legible."

Resolved rather than assumed, the opposite was true. Across base plus palette, **289
of 303 tokens are IDENTICAL in the two schemes** — carbone declared them flat, so the
canvas did not go light and the text tiers did not move. What moved were **fourteen
strays**: the status trio and its dependents, carrying light arms tuned for an
off-white canvas that did not exist.

That is why `--fail` read 2.34:1, why `--pass` read 3.90:1, and why twelve
`carbone|light|*` entries sat in `KNOWN_SUB_THRESHOLD`. They were not
light-mode bugs. They were light-tuned inks measured on a canvas that stayed dark.

The seam is real, not theoretical: `section.light` / `section.print` set
`color-scheme` on the ELEMENT and govern their own subtree past a `:where(:root)`
pin, so a `_class: light` slide flipped the status ink while the canvas held.

## 2 · The lime, which is the whole problem

Carbone's identity is `#7DE38A` on graphite — 10.95:1, and genuinely good.

The same lime is **1.48:1 on an off-white canvas**. There is no canvas lightness a
light mode would accept where it carries text. That is the real reason the palette
punted, and any light face has to answer it.

The answer is to move the lime along ONE axis. `--accent`'s light arm is `#037829`:

| | hue (OKLCH) | chroma | L | on canvas |
|---|---|---|---|---|
| dark arm | 146.8 | 0.156 | 0.832 | 10.95:1 |
| light arm | **146.8** | **0.148** | 0.500 | **5.22:1** |

Same hue, **95% of the chroma**, at 60% of the lightness. A darker *electric* green,
not a desaturated forest one — the distinction the curation turns on. An early
hand-picked candidate (`#2F6B39`) cleared AA at 5.96:1 with barely half the chroma
and read as a muddy pine; solving in OKLCH instead of by eye is what kept the hue.

Three things carry the identity across the split rather than the lime alone:

- `--brand-accent` stays `#7DE38A` on both faces — it is the axis, not a use;
- `--spectrum` keeps the same GESTURE rather than the same values — canvas, structural
  mid, accent — flipped per stop, because `light-dark()` is a color function and cannot
  wrap a gradient. Measured against each face's own canvas the two arms are the same
  shape (start 1.11/1.19, mid 1.54/2.56, end 10.95/5.22). Shipping shared stops, which
  is what the first cut did, put a near-black bar across every light slide; the lime tip
  survived, which is exactly what made it easy to miss;
- `--surface-inverse` is graphite on **both** faces, so the code block keeps its
  terminal register and all twelve `--hljs-*` values stay valid, unchanged.

## 3 · The trio, solved together

The status trio could not be moved one token at a time. Three constraints bind it at
once, and any two are easy:

1. **AA on the composed band**, not on the canvas — `--pass-bg` is an 18% tint of the
   ink itself over the card, and `.stacked` puts that over a 5% own-hue card. The
   ground moves with the ink, so only the ink can move.
2. **Twelve frozen CVD distances** (`cvd-trio-floor.test.js`), ratcheted: a pair frozen
   at or above 0.15 must still clear 0.15; one frozen below must not drop further.
3. **AA on `--bg-alt`** for warn, which `theme-surface-aa.test.js` gates absolutely —
   there is no exemption list.

Holding all three with hues fixed has **no solution**. The search found one only after
allowing small hue rotation, which the CVD gate's own guidance anticipates ("solve the
trio TOGETHER — magnolia needed `--warn` lifted with `--fail`"):

| token | light arm | rotation | on card |
|---|---|---|---|
| `--pass` | `#19531F` | −6° | 7.72:1 |
| `--warn` | `#A55400` | +8° | 4.59:1 |
| `--fail` | `#580006` | 0° | 7.84:1 |

CVD margin over the binding frozen pair: **+0.0024**. Thin, and worth saying so: this
trio is close to the boundary of what the three constraints jointly permit.

`--warn` sits at the 3:1 graphical floor on its own pill rather than AA. That is not a
new concession — carbone's warn pills were already sanctioned sub-AA on **both** faces
before this change.

## 4 · What retired on its own

`errorTextColor` was the last entry in `KNOWN_BELOW_AA`, and the previous PR
deliberately declined to force it: pinning the trio flat fixed the pair but dropped
`warn^fail` under deuteranopia through the 0.15 collapse floor. It was raised with the
measurement rather than taken.

Curating a real light face resolves it **from the other side**. The light arms now land
on the off-white canvas they were always written for, so the pair clears without the CVD
trade ever being made. `KNOWN_BELOW_AA` is empty, and the sanction's stale arm is what
reported it — the gate deleted its own last excuse.

Twelve `carbone|light|*` composed sanctions went to five for the same reason.

## 5 · One baseline taken down by hand

`carbone|light|kpi/warn-pill` moved 4.07 → 3.45, which `palette:bless` refuses to do on
its own and correctly held.

The 4.07 is not a comparable baseline: it measured a light-arm ink on a **dark** canvas.
The proof is in the same table — `carbone-dark|light|kpi/warn-pill` resolves through the
same import chain to the same CSS and, having no frozen entry to hold, recorded today's
measurement of 3.45. Two keys for one rendering cannot both be right, and the one that
was never rendered is the one that moves.

## 6 · What this cost elsewhere

- **`paired-token-parity`** exempted carbone wholesale as a single-canvas palette. That
  exemption is gone, and the test now finds real overrides in carbone for the first time.
  One is deliberate: `--panel-edge-mark` is pinned to the bright lime because the split
  panel it sits on is `--surface-inverse`, graphite on both faces. It is recorded in a
  new `SANCTIONED_FLAT_OVERRIDES` map that fails BOTH ways — an unlisted override, and a
  listed entry that stops being flat. Both arms were watched red before the entry landed.
- **`texture-ramp`** pinned "carbone's single ramp is dark and gets the dark arm".
  Carbone was the only shipped palette exercising that branch. The assertion is kept,
  driven by a synthetic ramp, rather than deleted with its last exerciser.
- **`portal-color-scheme`** used carbone as its always-dark example. It is a normal
  flipping palette now; the a11y set still covers the edge the test is named for.
- **`bless-palette-baselines`** pins the table sizes. `CVD_FROZEN` is 792, up from 768:
  33 themes × 2 modes × 3 pairs × 4 conditions.

## 7 · What is NOT verified here

The gates are green (7183/7183, `build:check` OK), but a palette is a visual artifact and
the gates measure numbers, not taste. The rendered gallery in both faces is the evidence
that matters for the QUALITY BAR, and it is a separate artifact from this note.

Goldens and example PDFs that resolve `theme: carbone` will re-render LIGHT after this
change. They are re-blessed as part of the same change; any that are not are a defect.
