---
status: shipped
summary: >
  `<ins>`/`<del>` are the right tags and authors write them by hand, but a listener hears the old
  wording and the new wording run together with nothing marking which is which. Measured in
  Chromium's accessibility tree — the thing a screen reader consumes — the elements DO expose roles
  `insertion`/`deletion`, so the semantics are present; what is missing is text a reader announces
  without role support switched on. The obvious fix, a visually-hidden `::before`/`::after` pair, is
  the pattern the accessibility literature recommends and it SHIPS A VISIBLE DEFECT here: a
  pseudo-element makes the inline box open on the previous line, and that empty first fragment still
  paints redline's wash across `<ins>`'s horizontal padding — a 2.7px colored sliver hanging off the
  line end, 28,135 changed pixels, plainly visible at 4x. Every way of hiding the pseudo produces it
  identically (absolute, fixed, zero-size, float, `content: '' / 'alt'`), because the cause is the
  fragment, not the hiding; `box-decoration-break: clone` cuts it to 651px but is itself an
  87,857px redesign of the wash. A SIBLING span sits outside the padded box, has nothing to paint,
  and measures 0 changed pixels with the reading order coming out correct. So the labels are a
  registry transformer (`lib/transformers/tracked-changes.js`) rather than four lines of CSS.
---

# Tracked changes have to say where they start and stop — and it cannot be done in CSS

**Date:** 2026-08-26 · **Status:** shipped
**Trigger:** the owner's question — *"our goal is to leverage best practices and we want to use html
tags that is accessibility friendly so readers can read. it seems to me `<ins>`/`<del>` and figure
are right approach but i could be wrong. authors also author `<ins>`/`<del>` right?"*

## 1. The premise checks out, and so does most of the current state

**Authors do write them by hand.** `redline.docs.md` documents
`<del>old wording</del> <ins>new wording</ins>` as the component's contract, and Markdown has no
insertion syntax, so raw HTML is the only way to write one. `~~text~~` renders `<s>`, which redline
styles identically to `<del>`.

**`<figure>`/`<figcaption>` is already right** where it applies — `video.transform.js:105` emits a
real `<figure>` with an optional `<figcaption>`, and the chart family is careful in a way that is
worth not disturbing: `radar.transform.js:499` documents why a decorative radar is `aria-hidden`
while a small-multiples mini is `role="img"` with an accessible name, because moving its caption
inside an aria-hidden `<svg>` had taken four option names out of the tree with nothing left to read.

**The visual distinction is not color-alone.** `redline.styles.css` gives `<ins>` an underline plus
`--pass` plus a tinted band, and `<del>` a line-through plus `--fail` plus a band. WCAG 1.4.1 holds
for a reader who cannot perceive the hues, and it holds unstyled too, on browser defaults.

**`compare-code`'s column labels are real DOM text** (`<p><code>Before…</code></p>`), so a listener
already hears them. There was no gap there.

## 2. The gap, measured rather than asserted

The gap is announcement. Read out, a redline blockquote becomes:

> "A business that collects collects, sells, or shares consumers' personal information shall provide
> two or more at least one designated method…"

— the amendment and the text it replaces, run together, with nothing marking the boundary. That is
`pdftotext` on the shipped gallery PDF, not a hypothetical.

Chromium's accessibility tree, read over the real rendered artifact via CDP `Accessibility.getFullAXTree`:

| what | result |
|---|---|
| `<ins>` / `<del>` roles | `insertion` / `deletion`, 26 and 20 of them, present |
| generated content in the tree | yes — `::before`/`::after` text appears as real `StaticText` |
| clipped generated content | still present (the clip does not remove it) |

So the semantics ARE exposed. What role support does not give you is spoken output by default, and
that is what the labels add.

**UNVERIFIED, and stated as such (HARD RULE #23):** no screen reader is reachable from this sandbox.
Every claim above is about the accessibility tree — what a reader consumes — never about any
particular reader's spoken output.

## 3. The CSS answer is the recommended one and it is wrong here

A visually-hidden `::before`/`::after` pair on `ins`/`del` is the standard pattern. It was built
that way first. It produces a **visible colored sliver** at the end of any line an `<ins>` wraps
from, and the continuation line loses its left inset.

The mechanism, from measuring the inline fragments rather than guessing:

```
without labels   INS "direct the bus…"   100.0+376.6@347.7
with labels      INS "direct the bus…"   1168.5+2.7@311.4   100.0+374.0@347.7
                                         ^^^^^^^^^^^^^^^^ an EMPTY fragment on the previous line
```

The pseudo-element makes the inline box open where the pseudo fits — the end of the previous line,
since it is zero-width. With the default `box-decoration-break: slice`, that empty fragment still
paints the element's background across its horizontal padding (`0 0.234375cqi` ≈ 2.7px), and it
consumes the "first fragment" that would otherwise have given the real text its left inset.

Every hiding technique was measured against the rendered pixels, not the rect list:

| hiding technique | changed pixels | labels in a11y tree |
|---|---|---|
| `position: absolute` + clip | 28,135 | 9 |
| `position: absolute`, explicit offsets, positioned host | 28,135 | 9 |
| `position: fixed`, off-viewport | 28,135 | 9 |
| `position: absolute`, zero size | 28,135 | 9 |
| `float` + absolute | 28,135 | 9 |
| `content: '' / ' [insertion start] '` (renders nothing at all) | 28,135 | 9 |

They are identical because **the cause is the fragment, not the hiding.** Nor does the wash
treatment rescue it:

| wash treatment | labels cost | its own cost vs today |
|---|---|---|
| today (`slice` + padding) | 28,135 px | — |
| `box-decoration-break: clone` | 651 px | 87,857 px |
| `clone` + `background-clip: content-box` | 651 px | 89,245 px |
| no horizontal padding | 28,247 px | 117,066 px |

`clone` is a 43× improvement on the label cost — the continuation line keeps its inset — and it is
still a sliver, bought with a redesign of the wash nobody asked for.

## 4. What shipped

A **sibling span** either side of the element. It sits outside the padded box, carries no padding
and no background, and therefore has nothing to paint:

- **0 changed pixels** across the redline gallery and the two-slide probe, on both slides.
- Reading order comes out
  `"A business that " → "[deletion start]" → "collects" → "[deletion end]" → "[insertion start]" →
  "collects, sells, or shares" → "[insertion end]" → " consumers' personal information…"`.
- **0 occurrences in the PDF's extractable text** — the labels are clipped, so they are never
  painted and copying a verbatim clause is unaffected.
- Verified on the runtime path too (`dist/lattice-runtime.js` loaded into a real page): 4 edges,
  correct labels, each clipped to nothing.

That requires a transform, so it is a registry transformer with the usual two forms —
`lib/transformers/tracked-changes.js`, string kernel for `lib/engine` and DOM walk for
`lattice-runtime`. It runs last: it is purely additive inline markup, and every structural transform
above should decide about trailing elements and label paragraphs on unadorned content.

`<s>` is included **only inside redline**, because `<s>` means "no longer accurate", which is not the
same claim as "deleted". redline is the one component that redefines it, and the label follows that
promise exactly as far as it is made.

## 5. A defect found on the way, and fixed

The redline manifest's own description said ``inline <ins>/<del> tracking the amendment`` with the
tags unescaped, so the engine parsed them as live empty elements and the gallery cover rendered
"verbatim language with inline / tracking the amendment" — the words "ins" and "del" eaten out of
the sentence. Every other component's docs backtick a tag they mention; redline was the outlier.
Backticked at the manifest, which regenerates `redline.docs.md`, `redline.gallery.md` and the VS Code
snippet.

It is worth recording *how* it surfaced: it was invisible in the prose and in the rendered PDF for as
long as nobody read the slide out loud, and it turned up the moment the accessibility tree was
printed in reading order, because two empty tracked-change elements announced boundaries around
nothing. Printing the reading order is a cheap check that finds a class of content bug the eye does
not.

## 6. The lesson worth more than the feature

The recommended pattern for a problem is not automatically the right pattern for YOUR instance of it.
The `::before`/`::after` technique is correct and widely cited — for unstyled prose. Applied to a
padded, washed inline chip it is a defect generator, and no amount of care about *how* the pseudo is
hidden helps, because the hiding was never the issue.

What caught it was rendering the artifact and diffing the pixels. What nearly let it through was a
`getBoundingClientRect()` check that came back identical — the union box does not change, only the
fragment list does. **When the question is "did this change what a person sees", measure the pixels;
a geometry probe answers a different question and answers it reassuringly.**
