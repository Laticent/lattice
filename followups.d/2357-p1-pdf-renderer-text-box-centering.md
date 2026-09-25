---
origin: 2357
priority: P1
recorded: 2026-09-25
source: https://github.com/Laticent/lattice/pull/2357
---
# Let exported PDFs center pill labels exactly: a renderer Chrome with `text-box`

why now   — PDFs are the boardroom artifact, and they are the one surface still on the
            approximate path. Inline pills center on their capitals through
            `text-box: trim-both cap alphabetic` (lib/base/base.modifiers.css § Inline pills),
            which Chrome shipped in 133. The export renderer is the Chrome 131 puppeteer pins
            (`CHROME_PATH=…/linux-131.0.6778.204`), so every PDF takes the `@supports not`
            fallback, a 0.05em nudge measured at worst 0.68px and mean 0.30px off. Current
            Chrome, Firefox and Safari measure 0.2–0.6px worst.
where     — the puppeteer/Chrome pin in package.json and lattice-emulator.js's browser
            resolution (~line 1460); CI's setup-chrome step in .github/workflows/ci.yml.
done when — the export Chrome is ≥ 133, `CSS.supports('text-box', 'trim-both cap alphabetic')`
            is true in the renderer, and the pill ink-diff probe (PR #2357's method: render
            each pill with and without `color: transparent`, diff, compare the ink center to
            the inner box at 384 dpi) reads ≤ 0.6px worst in the PDF.
evidence  — a before/after PDF of examples/inline-pills.md sent for sign-off in dark and
            light mode (an EXPORT change: CLAUDE.md's Quality Bar requires the author's
            inspection), plus the probe numbers.
verify    — tier 1 independent checker, because a renderer bump changes the bytes of every
            exported PDF, well beyond pills. It is also the author's decision before any work
            starts.
