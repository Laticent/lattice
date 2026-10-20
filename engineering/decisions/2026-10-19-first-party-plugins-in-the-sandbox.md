---
status: in-progress
summary: >
  Math, Mermaid and function-plot draw behind a wall for every CLI export, with byte-identical output and no extra
  browser: KaTeX in QuickJS-in-WebAssembly in the CLI's own process, function-plot in an isolated context of the
  export's own browser, Mermaid in the locked page. D-A closed itself (the wall is synchronous, so the library API uses
  it too); the live previews will use the code door's existing frame pool (D-B, owner 2026-10-20).
---

# First-party plugins in the sandbox: math, Mermaid and function-plot (2026-10-19)

## 1. The answer

The owner's rule is that a plugin renders in the sandbox and the host sanitizes what it returns, with no first-party
exception. This comes from the threat-model note `2026-10-16-npm-plugin-threat-model.md` §6: rows 3 and 4, and decisions 14 to 16. The
owner's second rule (2026-10-20) is speed: **starting a browser to get there is not allowed.** For the CLI both now
hold. Every first-party library that draws from an author's text runs behind a wall, and what it returns is checked or
sanitized before it reaches an export:

| Plugin | Before | CLI now | The wall |
|---|---|---|---|
| math | KaTeX inside the CLI's own Node process | KaTeX in QuickJS, compiled to WebAssembly, in the same process (`lib/core/katex-wall.js`) | WebAssembly: nothing but its own memory; 64 MB, 5 s, 1 MB of stack |
| function-plot | `function-plot.js` inside the page that holds the whole deck, for the PDF, PNG, PPTX, `--player` and `--read` | a locked page in a fresh context of the export's own browser (`lib/export/locked-figures.js`); the capture page loads no copy. The plain `.html` keeps the library and its zoom (decision 16) | a synthetic origin, every other request refused, a strict CSP, no network |
| Mermaid | `mermaid.min.js` on a `file:` page with `--no-sandbox` | the locked page (`lib/plugins/mermaid/shared/render-worker.js`), in the bake's own browser, which `main` starts too (no added launch; `followups.d/2800-p3-mermaid-bake-one-browser.md`) | the same, plus Chromium's OS sandbox where the machine allows it |

Every export the change touches is byte-identical to the one before it, so there was nothing for the owner to sign
off. The live previews (decision 15) are not moved yet; that is §5.

## 2. Why the first cut was replaced

The first cut (2026-10-19) ran KaTeX and function-plot in the code sandbox's own browser, launched for the purpose. It
was secure and byte-identical, and it cost a browser: +1.3 s on every math deck and +0.8 s on every export with a plot
(`math-form-frame.md` went from 3.1 s to 4.4 s). The owner's answer was that a browser start is not an acceptable price
(2026-10-20), so the question became whether Node could be fast and secure on its own. Measured, for 80 formulas:

| How KaTeX runs | Time | A wall? |
|---|---|---|
| in-process (`main`) | 75–140 ms | none |
| a Node worker thread | 150–220 ms | no: it can be killed on a timeout, and reaches what Node reaches |
| **QuickJS in WebAssembly** | **~250–300 ms**, ~125 ms of it loading once per process | **yes** |
| the locked browser page | ~1,300 ms | yes |

Mermaid and function-plot need a real layout engine to measure text, so they stay in a browser, but no longer one of
their own: the export already starts one to take its picture.

## 3. How each one works

**math.** `math.render.js` requires `lib/core/katex-wall.js` where it required KaTeX, and nothing else in the engine
changed. The wall loads synchronously (`new WebAssembly.Module` and `Instance` handed to emscripten's
`instantiateWasm`; quickjs-emscripten 0.31.0, the last release whose factory can finish without an `await`), so the
library API's `render()` stays synchronous and needs no fallback. Three limits:

- **memory:** the build imports its WebAssembly memory, so the instance gets one with a hard 64 MB maximum. QuickJS's
  own `setMemoryLimit` cannot be the limit: this build has no `malloc_usable_size`, so it counts nothing (2 GB of
  strings went through a 64 MB setting).
- **time:** QuickJS's interrupt handler stops a formula after 5 s.
- **stack:** 1 MB.

A formula that hits one shows its source, and the whole WebAssembly instance is dropped and rebuilt (~125 ms) before the
next, because QuickJS asserts when a runtime that hit a limit is freed piece by piece.

**The output check, not a re-spelling.** parse5 (the spec parser a browser's parse agrees with) reads each result, and
every node must be on `KATEX_VOCABULARY`: the tags, attributes and style properties KaTeX's own source emits with
`trust` off. `href`, `src` and the elements that carry them are not on it. A result that passes keeps its bytes, so
exports do not move; one that does not goes through the full slide sanitizer (DOMPurify on jsdom), loaded only then,
because jsdom alone costs ~0.75 s.

**function-plot.** `lattice.js` serves the capture page a copy of the export without the library (`capturePageOf`), and
the plugin's hydrator is marked `drawnByHost`, so its placeholders wait. The export opens a plotter in a fresh context of
its own browser while the capture page loads (`openPlotter`), so the setup is off the critical path. `awaitPluginFigures`
then:

1. reads each placeholder's config and drawn size;
2. draws every plot in the locked page by running the plugin's own `hydrate` on placeholders rebuilt in the same order,
   at the capture page's pixel ratio, so the seeded ids and d3's half-pixel offsets come out the same;
3. writes each drawing back through `WRITE`, which sanitizes it with the slide sanitizer as it inserts it. The sanitizer
   runs in the capture page (`SANITIZER`: DOMPurify in a closure, one global function), where DOMPurify parses into an
   inert document of its own; a separate sanitizer page cost a renderer process and ~150 ms.

What the one-browser rule gave up: the capture browser launches with `--no-sandbox` on every platform, so the plots'
locked page no longer has Chromium's OS sandbox under it, where the first cut's own browser did on macOS, Windows and
an unprivileged Linux. It keeps every other wall, and it is more confined than `main`, where function-plot drew inside
the capture page itself. `followups.d/2800-p2-capture-browser-os-sandbox.md` gives the whole capture browser that layer.

**The sanitizer, kept byte-exact.** For Mermaid, `sanitizeKeeping` (`lib/packages/code-door-worker.js`) keeps the
drawing's own bytes only when the same markup, parsed in that page, serializes to exactly what the sanitizer returned.

## 4. Evidence

| What | Result |
|---|---|
| math, every shipped formula | 91 formulas × 3 output modes, byte-identical to KaTeX in Node, and every one passes the output check as it is (`test/unit/core/katex-wall.test.js`) |
| math, the wall | inside it `require`, `process`, `fetch`, timers and `WebAssembly` are undefined; a loop stops at 5 s, 1 MB buffers, strings and one 512 MB string each stop in under 0.4 s, recursion stops at once, and the next formula typesets |
| math, the CLI | `math-walled.test.js`: the `.html` holds KaTeX's own typeset, `KATEX_IN_PROCESS=false`, one browser (the layout check's) |
| Mermaid, every gallery and fixture diagram | 32 / 32 SVGs byte-identical; PDFs of `examples/mermaid-diagram-surface.md`, `dark-diagram-fills.md`, `mermaid-init-merge.md` identical |
| function-plot | PDF, PNG and `--player` of `examples/plugin-system-phase-b.md`, `math-form-frame.md`, `marp-export-fidelity.md` identical to `main`'s; PPTX but its timestamp; the plain `.html` differs only by the runtime's `if (h.drawnByHost) continue;` and its comment |
| one browser | `function-plot-locked.test.js`: the PDF export launches one browser; `--player` two, the second being the player prune pass's own, as on `main` |

## 5. Open for the owner

**D-A. The library API with no browser.** Closed by §3: the wall is synchronous, so the library API, the docs build
and the CLI all typeset behind it. There is no in-process fallback and no exception.

**D-B. The previews (decision 15). Decided (owner, 2026-10-20): the existing pool.** "Don't give each their own
iframe. Use the available pool we already have." Math, Mermaid and function-plot run in the Studio and the Playground
through the code door's own sandboxed frames (`docs/src/lib/code-packages/door-run.ts` `frameFor`, `runner.ts`), the
ones a zip plugin already runs in, and come back as drawings the host sanitizes. No frame per library.

The design step the previews PR starts with: that pool runs a package in a WORKER inside the frame, which has no DOM.
KaTeX's `renderToString` needs none, so math fits as it is. Mermaid and function-plot measure text in a layout, so they
need the pool's frame document (or a DOM the worker can measure with) rather than its worker, without loosening the
frame's policy. Measure the preview latency before and after, at 1440, 820 and 390 px.
