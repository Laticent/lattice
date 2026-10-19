---
status: in-progress
summary: >
  Math, Mermaid and function-plot now draw in the LOCKED page for every CLI export, with byte-identical output.
  Two choices remain the owner's: whether the library API keeps in-process KaTeX as its fallback (D-A), and how the
  live previews sandbox the three libraries (D-B).
---

# First-party plugins in the sandbox: math, Mermaid and function-plot (2026-10-19)

## 1. The answer

The owner's rule is that a plugin renders in the sandbox and the host sanitizes what it returns, with no first-party
exception. This comes from the threat-model note `2026-10-16-npm-plugin-threat-model.md` §6: rows 3 and 4, and decisions 14 to 16. For
the CLI the rule now holds. Every first-party library that draws from an author's text runs in a **locked page**:

- the code sandbox's browser (`launchCodeSandbox`), with Chromium's OS sandbox wherever the machine allows it;
- no network;
- a synthetic origin, or the code door's own locked page, serving Lattice's files and nothing else;
- a strict CSP.

What the page returns is sanitized before it reaches an export. Every export the change touches is
byte-identical to the one before it, so there was nothing for the owner to sign off.

The live previews (decision 15) are not moved yet, and the library API without a browser has one choice left open.
Both are in §5.

## 2. Where each library ran, and where it runs now

| Plugin | Before | CLI now |
|---|---|---|
| Mermaid | `mermaid.min.js` on a `file:` page with `--no-sandbox` | the locked page (`lib/plugins/mermaid/shared/render-worker.js`) |
| function-plot | `function-plot.js` inside the page that holds the whole deck, for the PDF, PNG, PPTX, `--player` and `--read` | the locked page (`lib/export/locked-figures.js`); the capture page loads no copy. The plain `.html` keeps the library and its zoom (decision 16) |
| math | KaTeX inside the CLI's own Node process | the locked page (`lib/export/math-typeset.js`, `math-typeset-worker.js`); KaTeX never loads in the CLI process |

## 3. How each one moved

**Mermaid.** The render worker launches through `launchCodeSandbox`, serves its page from
`https://mermaid.lattice.invalid`, and sends a CSP that admits only that origin. A flowchart image node names a `file:`
picture, which a web origin cannot load. The worker therefore re-addresses each picture onto the origin as base64url,
answers it through the same file confiner the old page used, and restores the address in the SVG.

**function-plot.** `lattice.js` serves the capture page a copy of the export without the library (`capturePageOf`), and
the plugin's hydrator is marked `drawnByHost`, so its placeholders wait. `awaitPluginFigures` then:

1. reads each placeholder's config and drawn size;
2. draws every plot in the locked page by running the plugin's own `hydrate` on placeholders rebuilt in the same order,
   so the seeded ids come out the same;
3. sanitizes each drawing with the slide sanitizer in a separate page;
4. writes the drawing back and settles it.

**math.** `math.render.js` gained a seam, `setTypesetter`. Before a deck's real render, the CLI renders it once to
collect its formulas, and one worker typesets them all. The worker runs KaTeX as a fence renderer in `openPackageSandbox`,
with the same options as the Node path. Every render then reads the results. A formula seen for the first time later
(a display formula reflowed only after its first typeset) is typeset on its own.

**The sanitizer, kept byte-exact.** A serializer re-spells what it keeps: `&#x27;` becomes `'`, and `<path/>` becomes
`<path></path>`. For 11 of the 80 shipped formulas, that alone changed the bytes. `sanitizeKeeping`
(`lib/packages/code-door-worker.js`) keeps the drawing's own bytes only when the same markup, parsed in that page,
serializes to exactly what the sanitizer returned. That means the sanitizer removed nothing. Otherwise the
sanitized markup is used.

## 4. Evidence

| What | Result |
|---|---|
| Mermaid, every gallery and fixture diagram | 32 / 32 SVGs byte-identical; PDFs of `examples/mermaid-diagram-surface.md`, `dark-diagram-fills.md`, `mermaid-init-merge.md` identical |
| function-plot | PDF and `--player` files of `examples/plugin-system-phase-b.md`, `math-form-frame.md`, `marp-export-fidelity.md` identical; a debug run read `window.functionPlot` as undefined in the capture page |
| math | every shipped formula identical (`math-sandbox-parity.test.js`); `.html` of `math.fixtures.md`, the gallery and `math-form-frame.md` identical; their PDFs identical except the gallery's, which differs run to run on `main` as well |
| KaTeX out of the CLI process | `math-locked.test.js` loads a `require.cache` probe: `KATEX_IN_PROCESS=false` |
| Cost | Mermaid: no measurable change. Math: +1.3 s on `math-form-frame.md` (3.1 s to 4.4 s), the locked page's launch. function-plot: about 0.8 s per export that captures a page |

## 5. Open for the owner

**D-A. The library API with no browser.** `createEngine().render()` is synchronous, and thousands of tests and every
library caller use it. With no typesetter set, it typesets in its own process, as before. The CLI also falls back to
that, with a warning, when the locked page cannot start.

- **A1 (built, recommended):** keep that fallback for the library API and for a CLI with no browser.
  - Plus: nothing breaks.
  - Minus: it is the one recorded exception.
- **A2:** no fallback. With no typesetter, math renders as its source with a diagnostic.
  - Plus: no exception.
  - Minus: every library caller that renders math breaks, including the docs site's build, and a CLI with no
    browser shows TeX source.

**D-B. The previews (decision 15).** The Studio and the Playground still run KaTeX, Mermaid and function-plot in the
page that holds the deck. Both options below make the preview's draw asynchronous where it is synchronous today.
Measured cost goes on the card once a shape is chosen.

- **B1 (recommended):** one warm `sandbox="allow-scripts"` frame per library per tab. This is the shape the code door's
  Studio runner already has (`docs/src/lib/code-packages/runner.ts`). It takes figures by message and returns
  drawings, which the host sanitizes.
- **B2:** one frame per figure.
  - Plus: simpler isolation.
  - Minus: each figure parses its library afresh, and Mermaid alone is 1.6 MB.
