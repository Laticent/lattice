---
origin: 2578
priority: P3
recorded: 2026-10-07
source: engineering/decisions/2026-08-17-theme-css-is-a-preview-sink.md § 13
---

# A `\href{javascript:…}` in a bundle's math is still a live link in VS Code's Marp preview

why now   — marp-core typesets math itself, and MathJax's `\href` writes a live `<a href>` that no HTML
            filter sees. The bundle's marp-cli engine now drops a link that could run
            (lib/core/marp-bundle-html.js), but VS Code's preview renders the same deck with its own
            marp-core and reads neither marp.config.cjs nor its engine. One click on an invisible,
            slide-sized link runs it there.
where     — the producer (lib/core/live-author-html.js, beside the strip): neutralize `\href` / `\url`
            with a scheme that can run inside math spans, or the deck's math as a whole; TeX macros
            (`\def`) can build the scheme, so a text match is not enough on its own.
done when — a bundle whose deck carries `$$\href{javascript:…}{…}$$` runs nothing when clicked in VS Code's
            Marp preview, or the decision is recorded that the preview is out of scope.
evidence  — a click test in the VS Code preview (UNVERIFIED from the sandbox), or a producer-side
            unit test plus the real marp-core render of the producer's output.
verify    — tier 1 checker.
