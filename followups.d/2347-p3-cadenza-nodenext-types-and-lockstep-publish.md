---
origin: 2347
priority: P3
recorded: 2026-09-24
source: https://github.com/Laticent/lattice/pull/2347
---

# Cadenza's published types fail under `moduleResolution: nodenext`, and no workflow publishes the libraries

why now   — `@laticent/cadenza` now depends on `@laticent/ltt`, and its README says they publish
            in lockstep. Nothing does that, and a nodenext consumer of Cadenza fails to typecheck.
where     — docs/src/lib/cadenza/package.json points `types` at `./index.ts`, whose relative
            imports have no extension (TS2835 under nodenext; `skipLibCheck` does not help, it is
            a .ts file). PR #2347 fixed the same thing in `@laticent/ltt` by adding `.js`
            extensions. Suono, Lente and Vetrina share the pattern. `release-publish.yml` and
            tools/release.js publish none of the workspace packages.
done when — each library's published types compile in a `nodenext` consumer (a test packs the
            package and runs tsc), and a publish path exists for Cadenza and ltt together, or the
            READMEs stop promising one.
evidence  — the packed-consumer tsc run, before and after.
verify    — maker-checker (it touches five packages' published surface).
