---
origin: 3411
priority: P1
recorded: 2026-11-21
area: website
severity: medium
swimlane: engineering/decisions/2026-11-21-fleet-command-pattern.md §8
deferred: large — three new perf-torture cycles, each needing a local stand-in first
source: https://github.com/Laticent/lattice/pull/3411
---

# perf-torture has no Live, export or chat cycle, so those cannot be tortured

why now   — Live, export and chat are what an author leaves running longest, and export already crashed an
            iPhone once (the #2904 regression); the torture desk cannot reach any of them today.
where     — `tools/perf-torture/scenarios/studio.mjs` (cycle table, lines 115-135); `engine.mjs` throws
            `unknown cycle <name>` for any other name.
done when — three cycles exist: `live` (join, edit, leave, between two browser contexts over
            the in-process relay `docs/e2e/live-relay.ts`, never Live's public connection servers), `export` (export the
            same deck to PDF and back to the editor) and `chat` (send, stream, cancel, against a fake model
            via request interception, never a paid key); each runs with `--k 40 --cpu 4` and the
            README lists it.
evidence  — the checker's round 3 on #3411: `--cycle live` fails at once with `unknown cycle live`.
verify    — `npm run torture -- --scenario studio --cycle live,export,chat --k 5` completes and prints a
            verdict per cycle; the idle check passes on a clean build.
