---
origin: 2509
priority: P3
recorded: 2026-10-05
---

# Plugin admission: the two surfaces that do not run the engine's admission yet

why now   — the browser half honors admission through the engine's `data-lattice-off` marker
            (spec/LPM.md §3.2.1), so a host may narrow its default set for every surface that shows
            the ENGINE's render. Two readers do not, found by the HARD RULE #25 inversion lens:
            - the EXPORT-TO-MARP bundle (`shareMarp`, `lib/core/marp-bundle.js`): Marp's own
              markdown-it renders it, so no marker is written, and the bundled runtime draws every
              ```mermaid fence. The bake could mark or strip an unadmitted plugin's fences in the
              source it writes;
            - the STUDIO's source-side readers (lint, `slide-boundaries`, `section-source-split` in
              the docs bundle): they read the default set's grammar, and `setPluginDefaults` does
              not reach them. Under a narrowed set with math off, a `---` inside `$$` is one slide
              there and two in the engine, which shifts editor ↔ preview mapping after it. The CLI's
              readers follow its admission (`setBoundaryPluginsOff`); a per-deck door for a bundle
              (a parser per `off` set, like the engine's memo) is the shape for a host with many decks.
            - an AUTHOR's raw HTML `<pre><code class="language-mermaid">` (no fence, so the engine
              never marks it) is still drawn by the pass under a narrowed set — the same author-forged
              markup class as `data-lattice-hydrate` (`2509-p5-plugin-phase-d-residue.md`); the engine
              could refuse author-written `language-<drawn fence>` classes inside raw HTML.
            - the STUDIO's deck-wide admission on a slide rendered ALONE (a plain ```mermaid beside a
              `diagram` slide, under `setPluginDefaults([])`) is proved by unit test against the
              playground bundle (`browser-admission.test.js`), not on the real Studio: extend
              `docs/e2e/plugin-admission.spec.ts` with a two-slide deck driven in the single-slide
              view (the slice route), the fence drawn in both views.
            None of it matters while every shipped host runs on the default set.
where     — the files above; `lib/core/boundary-parser.mjs`, `docs/src/components/studio/share-export.ts`.
done when — with a narrowed default set, a Marp export and the Studio's lint and slide mapping
            agree with the engine about every unadmitted plugin.
evidence  — a Marp export of a deck that does not load Mermaid, showing source; a lint run and a
            slide mapping of a `$$`-with-`---` deck under `defaults: []`.
verify    — tier 1 checker.
