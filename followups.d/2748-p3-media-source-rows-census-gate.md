---
origin: 2748
priority: P3
recorded: 2026-10-17
area: infra
severity: low
swimlane: engineering/decisions/2026-10-16-media-plugins.md §4.11
source: https://github.com/Laticent/lattice/pull/2748
---

# Nothing yet holds the media source rows to a census

why now   — §4.11 says only in-tree rows may declare `local`, and that `check-ownership` keeps a census of rows that fails
            on a stale entry. PR #2748 has six in-tree rows and no gate. It is vacuous until a plugin can contribute a row
            (slice 2), which is when it must exist. Adding a gate changes the CI contract, so it goes to the owner first.
where     — `lib/core/media-sources.js` (`SOURCES`); `tools/check-ownership.js` (a new `SANCTIONED_*` list with its justification).
done when — a `check-ownership` check fails when `SOURCES` gains or loses a row without a census entry, and a contributed row
            declaring `local` fails the build; the allowlist fails on a stale entry like the others.
verify    — add a seventh row on a scratch branch and see the gate fail.
