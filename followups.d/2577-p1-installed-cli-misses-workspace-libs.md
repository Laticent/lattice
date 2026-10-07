---
origin: 2577
priority: P1
recorded: 2026-10-07
---

# The published `lattice` CLI fails at start: it requires three workspace packages no install provides

why now   — found driving #2577's pre-merge raise (npm pack → npm i in an empty directory → render).
            On `main` (c5c2a02) AND on #2577, the installed `lattice` exits before rendering anything:
            `Error: Cannot find module '@laticent/segno/read'`. The bundle `dist/lattice-emulator.js`
            requires `@laticent/cadenza`, `@laticent/ltt`, `@laticent/segno/read` and
            `@laticent/segno/values` at run time. All three are npm workspaces under docs/src/lib/,
            never published, and not in `dependencies`, so a consumer install cannot resolve them.
            Every CLI export from an installed package fails today. Pre-existing (Segno joined the
            engine's read path in #2513), not caused by #2577.
where     — tools/build-emulator.js `INLINE_PACKAGES` = ['@laticent/trama', '@laticent/calco']: every
            other bare import stays external. Adding '@laticent/segno', '@laticent/ltt' and
            '@laticent/cadenza' inlines them as it inlines trama and calco. Check the other bundles
            that ship in the tarball for the same externals (grep `require("@laticent/` in dist/).
done when — `npm pack`, `npm i <tarball>` in an empty directory (PUPPETEER_SKIP_DOWNLOAD=1, CHROME_PATH
            set), and `npx lattice <deck> <out.pdf>` renders; and a test fails when a shipped bundle
            requires a package that is neither a dependency nor bundled.
evidence  — that consumer render of the math and diagram galleries, plus the new test's failing arm.
verify    — tier 1 checker, because it changes what the published bundle contains.
