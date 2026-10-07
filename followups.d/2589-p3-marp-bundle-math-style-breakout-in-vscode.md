---
origin: 2589
priority: P3
area: engine
severity: high
swimlane: engineering/decisions/2026-08-17-theme-css-is-a-preview-sink.md
recorded: 2026-10-07
source: engineering/decisions/2026-08-17-theme-css-is-a-preview-sink.md § 13
---

# Bake or sanitize a bundle's math: it can run a deck's own script click-free (pre-existing)

why now   — marp-core typesets math with MathJax (it imports `AllPackages`, so the risky commands
            are always loaded and there is no config switch to drop them). The output reaches the
            page WITHOUT passing the bundle's HTML allowlist — it is emitted by the math renderer,
            not an `html_block` token. Several commands (`\style`, `\unicode`, `\cssId`, `\href`, …)
            write an unescaped `"` into an attribute, so a deck can break out and run a handler, or
            load a remote resource with a CSS `url()`, click-free. Two vectors a red team confirmed
            live on the recipient's real `npm run pdf`, and BOTH EXIST ON `main` TODAY (the bundle
            does not change math):
              1. `$x\style{animation:lattice-paint-lay 1s"/onanimationstart="…}{y}$` — the HTML
                 tokenizer treats `/` after a quoted value as an attribute separator, so a regex
                 looking for a whitespace-preceded handler misses it. Verified: the handler fired in
                 Chromium from a real marp-cli render.
              2. `$a\style{background:url(http://host/beacon)}{b}$` — a plain CSS `url()` loads a
                 remote resource, no break-out needed. Verified: a network beacon fired click-free.
            #2589 tried a regex guard (deck-byte rename + an engine output scan) and the red team
            defeated it; the partial code was REMOVED from #2589 rather than shipped as tech debt
            (the owner's call), so math is exactly as on `main`.
where     — a regex cannot win this (the red team's point, and MathJax's command surface is large).
            Two sound shapes:
              A. BAKE math at export: render each math token to SVG in the producer, sanitize the SVG
                 with a real parser against MathJax's own tag/attribute vocabulary (a parse5 allowlist
                 scan catches all known vectors with no false positives on the 118 shipped math decks
                 — prototype in the #2589 session), and write the sanitized SVG into the bundle's `.md`.
                 Then NO live MathJax reaches the recipient, so marp-cli, the exported HTML, VS Code and
                 the Studio are all safe from one deck-byte transform. Cost: the producer must render
                 math (marp-core in the CLI; the Studio renders in-browser, so weigh route budget).
              B. A parser-based output sanitizer run wherever math is rendered — but that cannot reach
                 VS Code's own marp-core, so (A) is preferred.
            Code touched today, for reference: lib/core/marp-bundle.js, lib/core/marp-bundle-html.js,
            lib/core/live-author-html.js, tools/export-marp.js, docs/src/components/studio/export/.
done when — a deck carrying each of the two vectors above runs nothing and fires no network request
            when its bundle is rendered by real marp-cli (`npm run pdf`) and opened in Chromium, and
            in VS Code's Marp preview; the 118 shipped decks that use math render the same (pixel
            diff); a case per vector in test/integration/export/marp-bundle-author-script.test.js.
evidence  — the two red-team decks, before and after, under real marp-cli + Chromium, with a local
            listener for the beacon; the per-deck render diff over the math decks.
verify    — tier 2 trio: a security boundary on exported bytes.
