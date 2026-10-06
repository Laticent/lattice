---
origin: 2509
priority: P4
recorded: 2026-10-06
---

# The Export-to-Marp bundle still carries an author's forged figure markers and raw drawn fences

why now   — the engine now renames the plugin host's figure markers (`data-lattice-hydrate`,
            `-config`, `-settle`, `-final`, `-off`) in an author's raw HTML
            (`lib/plugins/author-markup.js`, spec/LPM.md §3.2.1). An Export-to-Marp bundle is
            rendered by Marp with `html: true` (`lib/core/marp-bundle.js`), not by the engine, so
            the same markup reaches the bundled runtime there, and its hydrator draws a forged
            pending figure from the config the author packed. Bounded as before — the figure
            settles at its plugin's `budgetMs`, and its config is what a fence would hand the same
            plugin — and pre-existing. ALSO: the bundle's `mark-off.mjs` marks a drawn fence by the
            WHOLE class word (`code[class~="language-<fence>"]`), while the pass draws by substring
            (`class*=`), so an author's raw `<pre><code class="language-mermaid-source">` of an
            unloaded plugin is not marked and is still drawn (checker, jsdom). Fences Marp renders
            itself carry the exact word, so they are covered.
where     — `tools/export-marp.js` (the producer, which holds the deck's Markdown) or the bundled
            runtime's first step (`lib/runtime/index.js`, beside `markOff`).
done when — under real marp-cli, a bundle whose deck forges `data-lattice-hydrate` renders no
            figure, and a raw `language-mermaid-source` block of an unloaded plugin stays code.
evidence  — a case in `test/integration/export/marp-admission.test.js` (real marp-cli + Chromium).
verify    — tier 1 checker.
