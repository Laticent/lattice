---
origin: 2739
priority: P3
recorded: 2026-10-16
area: website
severity: medium
swimlane: engineering/decisions/2026-10-16-player-as-library-audit.md §11.4
source: https://github.com/Laticent/lattice/pull/2739
---

# Let the Studio's Webpage export declare consent origins, as the CLI's --player-consent does

why now   — viewer consent for remote pictures lives in the shared assemblePlayer (`consentOrigins`), but only the CLI can set it; the Studio's export has no setting, a host-parity gap (HARD RULE #1).
where     — the Studio's Share → Webpage options and share-export.ts `shareHtmlPlayer` (pass `consentOrigins`); offer the origins the deck's web pictures actually use.
done when — a Studio export with a declared origin shows the banner, loads only after Load pictures, and loads nothing with scripting off, in Chromium, WebKit and Firefox.
evidence  — screenshots before/after Load pictures in three engines, and a request count of zero before consent.
verify    — tier 1 checker (the policy and runtime are already trio-reviewed; this adds a setting).
