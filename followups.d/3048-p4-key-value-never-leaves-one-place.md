---
origin: 3048
priority: P4
recorded: 2026-11-06
area: website
severity: low
swimlane: engineering/decisions/2026-11-06-studio-byok-key-lifecycle.md §3
deferred: off-path — the name guard in #3048 covers source; these cover storage sweeps and the shipped bundle, which #3048 did not change
source: https://github.com/Laticent/lattice/pull/3048
---
# Pin that the key's VALUE never reaches a storage sweep or a second bundle chunk

why now   — openrouter-key.test.ts greps docs/src for the key's NAME. A name built at
            runtime, or a prefix sweep such as startsWith('lattice-db-or'), passes it, and
            three modules already enumerate storage (storage-metrics.ts, studio-store.ts,
            workspace-backup-meta.ts). Only the workspace backup is pinned today.
where     — docs/src/lib/openrouter-key.test.ts; the three enumerators; docs/dist/_astro.
done when — a test seeds the key and asserts the enumerators' output never contains its
            value, and a post-build check finds the key name in exactly one shipped chunk.
evidence  — both checks red with a planted leak.
verify    — tier 0.
