---
origin: 3126
priority: P1
recorded: 2026-11-10
area: engine
severity: low
swimlane: engineering/decisions/2026-10-16-media-plugins.md §9
deferred: off-path — the `image` slide's DOM wrap on `main`, not the shortcut or the Reading view this PR touches
source: https://github.com/Laticent/lattice/pull/3126
---

# The `image` slide's wrap lifts a `.lattice-bg` out of a quote, a list or a plugin's drawing

why now   — The red team on #3126 found that `wrapImageText` (lib/core/bg-image.js, about lines 182–235)
            collects every `<div class="lattice-bg…</div>` in an `image` slide with a string regex and
            moves it to section level, even one inside a `<blockquote>`, an `<li>` or a
            `[data-lattice-plugin]` root. An author's raw HTML panel in a quote then draws as the
            slide's photo. #3126 closed the Reading view's side (only a panel with the image plugin's
            `data-lattice-media` marker is re-hosted), and the plugin door strips the class from a
            fence today, so nothing reaches the article. The slide itself still draws the lifted panel.
            `main` has this behavior; #3126 does not change it.
where     — lib/core/bg-image.js `wrapImageText`, and its DOM mirror `wrapImageTextToDom` in the runtime.
done when — Only a top-level panel is lifted (never one inside `blockquote`, `li` or
            `[data-lattice-plugin]`), in both the string pass and the DOM mirror, with a test that renders
            a quoted raw panel on an `image` slide and finds it still inside the quote.
evidence  — the red team's repro: `> quoted <div class="lattice-bg" style="background-image:url(…)"></div>`
            on an `image` slide renders that div as a direct child of `section`.
verify    — `node --test test/unit/core/` plus `npm run identity:check` (shipped decks must not move).
