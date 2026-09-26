---
origin: 2361
priority: P3
recorded: 2026-09-25
---

# Decision notes carry a status but no type, and statuses rot

why now   — 71 notes from May–July still read `proposed`, and some say "decided" in the body.
            Proposals, records, specs and scoping notes share one lifecycle, so nothing expires a
            proposal or flags a record edited into agreement (audit §10).
where     — `engineering/decisions/README.md` §Status lifecycle, `tools/build-decisions-index.js`.
done when — the owner decides whether to add a `type:` field, and the stale statuses are swept.
evidence  — the index diff.
verify    — owner decision for the field (a canonical doc's meaning); the sweep is tier 0.
