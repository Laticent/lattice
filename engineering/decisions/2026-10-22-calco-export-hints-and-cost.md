---
status: proposed
summary: Options for letting components tell the Calco office export what they mean (a resizable tag, a reserved spectrum band) instead of the reader guessing from paint, and where the export spends its time as the component set grows.
---

# Calco export: component hints, and what the export costs as we add components (2026-10-22)

**Status: proposal. Nothing is built; the owner picks an option (§4).**

**The question.** The editable `.pptx`/`.odp` export (#2852) reads the rendered page: computed style and
geometry, never the component manifests. That is why a new component needs no export code, and also why
the reader sees paint but not intent. The owner's desktop check found two cases of missing intent: a tag
is a shape beside its text rather than one shape holding it (so it cannot be dragged larger with the text
staying inside), and slides shift when the spectrum band is present or absent. Both are recorded in
`followups.d/2852-p2-*`. This note asks how to carry intent, and what the export costs as components grow.

## 1. How it works today

- `docs/src/lib/calco/reader.ts` (about 2.6K lines) reads each slide's DOM. It has two structural
  selectors (`.lat-pagination`, `header`/`footer`) and no per-component code. A paint it cannot express
  is refused and becomes a picture, so a new component degrades safely.
- `capture.ts` takes one background screenshot per distinct look (cached by `splitKey`) and one
  foreground shot per slide, then crops the leftover content into sprite pictures.
- The Studio loads Calco, `pptxgenjs`, `jszip` and `html-to-image` by dynamic `import()` on export only.

## 2. What it costs now (measured, 2026-10-22, CLI, one machine)

| Deck (about 10 slides) | Wall time, including browser start | `.pptx` size |
|---|---|---|
| `card-tags` | 8.3 s | 522 KB |
| `chart-finish` | 6.9 s | 822 KB |
| `sample-images` | 7.3 s | 995 KB |

Cost grows with distinct looks (backgrounds) and slides, not with the number of components. The
unmeasured parts, so no claim is made about them: time per phase (read, shoot, write), the Studio's
export time in a real browser, and memory on a 35-slide deck.

## 3. Candidate moves

- **A. Keep guessing, add rules to the reader.** Detect a pill by its paint (inline-block, radius,
  fill) and write it as one shape with its text. Cheap, no contract. The next component that needs
  intent adds another rule, and the reader grows.
- **B. Components declare hints in their manifest.** A component says `export: { resizable-pill: true }`
  or `reserves: spectrum-band`; the reader reads a `data-` attribute the engine already writes from the
  manifest. Intent is explicit and the reader stays generic. It adds a contract between manifests and
  the exporter, and every hint needs a test per format.
- **C. Hints in CSS, not manifests.** A custom property such as `--export-role: pill` on the element.
  Same effect as B without touching manifests, and themes or decks can override it. Harder to find and
  lint than a manifest field.

## 4. Recommendation

**C for the two known cases, promoted to B only if a third appears.** The reader already reads computed
style, so a custom property costs one read and no new pipeline. The hint is inert on every other
surface, which keeps HARD RULE #1 intact. Measure first: add per-phase timing to the export (one
instrumented run per deck above) before optimizing anything, since §2 shows no component-driven cost yet.

**What the owner decides:** A, B or C; and whether the per-phase timing PR comes first.
**Not decided here:** the native tag shape itself (`followups.d/2852-p2-tags-are-not-resizable-shapes.md`),
which every option still has to build.
