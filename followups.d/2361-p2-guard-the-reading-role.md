---
origin: 2361
priority: P2
recorded: 2026-09-29
---

# Guard the one reading size statically, so a new rule cannot bring back a second size

why now   — `npm run audit:reading-size` proves one reading size per venue today, but it is
            on-demand (it renders every component, about seven minutes) and exits 0. Nothing
            stops a new component or a new variant from setting reading text at
            `--fs-message` or `--fs-body-compact` again, and the exceptions list lives in three
            places (`engineering/decisions/2026-09-29-one-reading-size-per-venue.md` §4, `EXCEPTIONS` in tools/audit-reading-size.js, typography.md §7).
            Found by the inversion review of this change.
where     — tools/check-ownership.js (runs in `build:check`, so no new CI step): a check that
            counts `font-size: var(--fs-message)` / `var(--fs-body-compact)` declarations per
            component stylesheet against a `SANCTIONED_READING_ROLE` allowlist with a reason
            per entry, failing on a stale entry (the SANCTIONED_* pattern). Make
            `EXCEPTIONS` the one list the note and typography.md point at.
done when — adding `font-size: var(--fs-message)` to a list row in any component stylesheet
            fails `npm run build:check` with the allowlist named, and removing a sanctioned
            declaration fails it as stale.
evidence  — the failing and passing `build:check` output for both arms.
verify    — maker-checker (a new gate check).
