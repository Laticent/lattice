---
origin: 2509
priority: P3
recorded: 2026-10-05
---

# Plugin admission: what still does not follow a narrowed set

why now   — the Export-to-Marp bundle and the Studio's lint and slide mapping follow the deck's
            admission since the phase-F PR (spec/LPM.md §3.2.1: the bundle's `pluginsOff`, the
            runtime's `lib/plugins/mark-off.mjs` and, for Marp's own math, the bundle's `marp.config.cjs`
            via `marpConfigCjs`; the Studio's `docs/src/lib/plugin-admission.ts`).
            What is left, found on the way:
            - an AUTHOR's raw HTML `<pre><code class="language-mermaid">` (no fence, so the engine
              never marks it) is still drawn by the pass under a narrowed set — the same
              author-forged markup class as `data-lattice-hydrate`
              (the plugin note §11, "Phase D's residue, decided"); the engine could refuse author-written
              `language-<drawn fence>` classes inside raw HTML;
            - the same class one level up: a deck's own `data-lattice-hydrate`, `data-lattice-settle`,
              `data-lattice-figure` (and `data-lattice-off`) survive the slide sanitizer, so an author
              can forge a pending figure or a figure marker. Bounded today — a forged pending figure
              settles at its plugin's `budgetMs`, and its config is what a fence would hand the same
              plugin — so it was left; the fix is the engine refusing author-written
              `data-lattice-*` in raw HTML, as `lib/core/door-attr.mjs` does for code packages, in
              the same change as the raw-HTML `language-<fence>` refusal above;
            - the PLAYGROUND page's own editor lint (`docs/src/playground/editor-diagnostics.js`)
              still parses on the default set's grammar; it does not call `followDeckAdmission`;
            None of it matters while every shipped host runs on the default set.
where     — the files above.
done when — with a narrowed default set, every reader above agrees with the engine.
evidence  — the Playground's lint on a `$$`-with-`---` deck under `setPluginDefaults([])`; a raw
            HTML Mermaid block under the same, showing source.
verify    — tier 1 checker.
