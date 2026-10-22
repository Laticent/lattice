---
status: proposed
summary: Proposal that component manifests declare export hints (a resizable tag, a reserved spectrum band) as design-time specification, so the Calco reader stops guessing from paint, plus where the export spends its time as components grow.
---

# Calco export: component hints, and what the export costs as we add components (2026-10-22)

**Status: proposal, owner leans B (§4). Nothing is built.**

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
  Rejected: CSS is a presentation layer that themes and decks override, so design intent stored there can
  drift away from what the component means, and nothing audits it.

## 4. Recommendation

**B.** Intent is a design-time specification, so it belongs where design is specified: the component
manifest. The manifest declares a hint from a closed vocabulary (`pill`, `reserves-band`,
`group-with-text`); the engine writes it onto the rendered element as a `data-export-role` attribute,
a marker with no styling; the reader reads that one attribute and stays generic. Other surfaces ignore
it, which keeps HARD RULE #1 intact. Guardrails: a lint rejects any hint outside the vocabulary, each
hint has one writer test per format in the conformance harness, and an unknown paint still falls back
to a picture (the refusal ratchet). Measure first: add per-phase timing to the export before
optimizing anything, since §2 shows no component-driven cost yet.

**What the owner decides:** whether to mandate B, and whether the per-phase timing PR comes first.
**Not decided here:** the native tag shape itself (`followups.d/2852-p2-tags-are-not-resizable-shapes.md`),
which every option still has to build.
