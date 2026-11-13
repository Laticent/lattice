---
origin: 3165
priority: P3
recorded: 2026-11-13
area: website
severity: medium
swimlane: engineering/decisions/2026-11-12-device-capability-tiers.md §6 and §7 (slice 5)
deferred: large — a new full-page surface that turns users away, plus a Workspace setting; it needs the required-feature list verified by disabling each feature in a real browser first (§6), and calibrated CPU cut-offs (P5)
source: https://github.com/Laticent/lattice/pull/3165
---

# The decline screen, "continue anyway", and the Auto / Full / Lite setting

why now   — `classify()` already returns UNSUPPORTED with reasons, and `?tier=unsupported` pins it, but no screen
            shows it, so a declined device runs the full app.
where     — Studio, Playground and Present (owner's scope, §7.3); docs/src/lib/device-profile.ts (`continueAnyway`,
            `override` already supported); WorkspaceSheet.tsx for the setting.
done when — UNSUPPORTED paints the decline screen naming the failed check, with "Copy system report" and "continue
            anyway" (runs LITE, persistent banner); the setting overrides FULL/LITE and never lifts a decline.
evidence  — owner decisions §7.1–7.4 (2026-11-12).
verify    — e2e on all six projects with `?tier=unsupported` and with each required feature stubbed off; the decline
            never shows on any project unpinned; screenshots at three widths.
