---
origin: 2509
priority: P3
recorded: 2026-10-05
---

# Plugin admission: what still does not follow a narrowed set

why now   — the Export-to-Marp bundle and the Studio's lint and slide mapping follow the deck's
            admission since the phase-F PR (spec/LPM.md §3.2.1: the bundle's `pluginsOff`, the
            runtime's `lib/plugins/mark-off.mjs`, the Studio's `docs/src/lib/plugin-admission.ts`).
            What is left, found on the way:
            - MATH in the Marp bundle: Marp typesets `$…$` and `$$…$$` itself (marp-core's own
              math), and no marker reaches it, so a bundle whose `pluginsOff` names math still
              typesets it and keeps a `$$` block whole. The bundle's split bake does follow the
              admission (tools/export-marp.js sets the boundary parser first), so the slides are
              right; the fix for the typesetting is a per-export `marp.config.cjs` with
              `math: false` (both producers write the config from `MARP_CONFIG_CJS`, a constant).
              Function-plot and anima show their fences as code in a Marp bundle whatever the set;
            - an AUTHOR's raw HTML `<pre><code class="language-mermaid">` (no fence, so the engine
              never marks it) is still drawn by the pass under a narrowed set — the same
              author-forged markup class as `data-lattice-hydrate`
              (`2509-p5-plugin-phase-d-residue.md`); the engine could refuse author-written
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
