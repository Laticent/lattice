---
origin: 2589
priority: P3
area: engine
severity: medium
swimlane: engineering/decisions/2026-08-17-theme-css-is-a-preview-sink.md
recorded: 2026-10-07
source: engineering/decisions/2026-08-17-theme-css-is-a-preview-sink.md § 13
---

# A `\style` / `\unicode` break-out in a bundle's math is still live in VS Code's Marp preview

why now   — marp-core runs MathJax with its whole package set, and several commands (`\style`,
            `\unicode`, `\toggle`, `\cssId`, `\class`, `\mmlToken`) write an unescaped `"` into a
            `style=` attribute, so `$\style{animation:… 1s" onanimationstart="…}{x}$` adds a handler
            that runs with no click. The marp-cli engine neutralizes this on the output
            (lib/core/marp-bundle-html.js), so `npm run pdf` and the pre-rendered HTML are safe. The
            deck's bytes rename only the link commands (`\href`/`\url`/`\csname`), so a recipient who
            re-renders the bundle's `.md` in VS Code's Marp preview, which reads neither the config
            nor the engine, still meets the break-out there.
where     — the producer (lib/core/live-author-html.js `withoutMathLinks`). A complete deck-bytes fix
            cannot be a command denylist (the package set is large and moves). Options: neutralize any
            math span that carries a raw `"` (command-agnostic, but needs a math-delimiter parser that
            agrees with marp-core); or render the deck's math at export (MathJax in the producer) and
            apply the same output scan the engine uses, rewriting the TeX of any token that fails.
done when — a bundle whose deck carries `$\style{…" onanimationstart="…}{x}$` runs nothing when
            re-rendered in VS Code's Marp preview, or the decision is recorded that the preview is
            out of scope (the engine already covers the paths a recipient normally uses).
evidence  — a click-free run check in the VS Code preview (UNVERIFIED from the sandbox), or a
            producer-side unit test plus a real marp-core render of the producer's output.
verify    — tier 1 checker.
