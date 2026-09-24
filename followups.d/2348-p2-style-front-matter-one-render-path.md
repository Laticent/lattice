---
origin: 2348
priority: P2
recorded: 2026-09-24
---

# `style:` front matter applies on the CLI render path only

why now   — A deck's `style:` block reaches the command-line render but not the engine the Studio preview and Studio exports use, so the same deck looks different depending on where it is rendered — the render-path split HARD RULE #1 exists to prevent. The #2348 docs now have to tell authors "the Studio ignores it".
where     — lattice-emulator.js:2326-2332 applies it; lib/engine/directives.js parses a one-line `style` value but nothing in lib/engine applies it. Probe: `require('./lib/engine').render('---\nstyle: |\n  section { outline: 7px solid rgb(1,2,3); }\n---\n\n## Probe.\n')` returns css without the rule.
done when — Either the shared kernel applies `style:` on every render path (through `sanitizeStyleText`, HARD RULE #22 — this is a whole-document style sink), or `style:` is retired with a lint warning; the front-matter reference row and guides/deck-settings.mdx say which.
evidence  — The probe above, run on #2348 at 9411fd9.
verify    — The probe's css contains the rule, or `lint:deck` warns on `style:`.
