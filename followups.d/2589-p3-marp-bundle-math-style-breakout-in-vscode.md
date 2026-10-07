---
origin: 2589
priority: P3
area: engine
severity: high
swimlane: engineering/decisions/2026-08-17-theme-css-is-a-preview-sink.md
recorded: 2026-10-07
source: engineering/decisions/2026-08-17-theme-css-is-a-preview-sink.md § 13
---

# A bundle's math can run a deck's own script click-free; the regex guard is only partial

why now   — marp-core typesets math with MathJax (its whole package set), and the output bypasses
            the bundle's HTML allowlist entirely (it is emitted by the math renderer, not an
            `html_block` token). Several commands write an unescaped `"` into an attribute, so a deck
            can break out and add a handler or a resource load. #2589 added a regex scan over the math
            output (lib/core/marp-bundle-html.js) and a deck-byte rename of the link commands
            (lib/core/live-author-html.js `withoutMathLinks`). A red team then broke the scan on the
            recipient's real `npm run pdf` path, CLICK-FREE, with two vectors it does not catch:
              1. `$x\style{animation:lattice-paint-lay 1s"/onanimationstart="…}{y}$` — the HTML
                 tokenizer treats `/` after a quoted value as an attribute separator, so the handler
                 is not whitespace-preceded and the scan's `/\son…=/` misses it. Verified: the handler
                 fired in Chromium from a real marp-cli render.
              2. `$a\style{background:url(http://host/beacon)}{b}$` — a plain CSS `url()` loads a
                 remote resource with no break-out at all; the scan has no rule for resource-loading
                 CSS. Verified: a network beacon fired click-free.
            BOTH ARE PRE-EXISTING ON `main` (same MathJax output, no guard there), so #2589 does not
            worsen them; it reduces but does not close the exposure. VS Code's preview reaches neither
            the config nor the engine, so the deck-byte rename is its only partial cover there.
where     — the right fix is NOT another regex (the red team's point: regex cannot match the browser's
            parser, and SMIL `<set/animate>` and the CHTML output path are unexplored). Either run the
            MathJax output through a real HTML/CSS parser and reject non-math elements/attributes
            (a tag+attribute allowlist for MathJax's own vocabulary — svg, g, path, rect, text, tspan,
            use, defs, mjx-* …), dropping handlers, remote `url(`, and foreign tags; OR configure
            marp-core's MathJax to disable the HTML-injecting packages (`\href`, `\style`, `\unicode`,
            `\class`, `\cssId`, `\mmlToken`, …) so the commands never reach an attribute. The second is
            simpler if marp-core exposes the MathJax config; check `@marp-team/marp-core` math options.
            Code: lib/core/marp-bundle-html.js (the `marp_math_*` wrapping), lib/core/live-author-html.js
            (`withoutMathLinks`). Decide first whether to keep the partial scan as defense-in-depth or
            remove it with the parser-based fix.
done when — a deck carrying each of the two vectors above runs nothing and fires no network request
            when its bundle is rendered by real marp-cli (`npm run pdf`) and opened in Chromium, and
            (if in scope) in VS Code's Marp preview; the 118 shipped decks that use math render the
            same; a case per vector in test/integration/export/marp-bundle-author-script.test.js.
evidence  — the red team's two decks, before and after, under real marp-cli + Chromium, with a local
            listener for the beacon; the per-deck render diff over the math decks.
verify    — tier 2 trio: it is a security boundary on exported bytes.
