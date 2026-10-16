---
origin: 2417
priority: P5
recorded: 2026-10-06
area: engine
severity: low
swimlane: engineering/decisions/2026-09-27-plugin-system.md
---

# A plugin's `tokens` should list what the host supplies, not what its sheet declares itself

why now   — phase F's inversion lens: `chart-family.manifest.json` lists 104 tokens because the
            resolver requires `tokens` to equal EVERY `var(--…)` read in the stylesheet
            (`lib/plugins/resolve.js`, STYLES and TOKENS). 53 of them are custom properties the
            sheet declares itself (`--chart-cat-N-*` and the like); only 51 are host or theme
            tokens. So every edit to the sheet needs a manifest edit, and the list does not say
            what a host must supply. The token-vocabulary check §4.9 of the plugin-system note
            promises does not exist yet; when it does, the self-declared half would fail it.
where     — `lib/plugins/resolve.js` (subtract the sheet's own declarations from its reads before
            comparing), `spec/LPM.md` §3.4 (`tokens` wording), the four plugin manifests.
done when — `tokens` means "read and not declared by this sheet", the spec says so, and the
            vocabulary check (§4.9) runs over it. A spec MEANING change, so settle it before
            phase G freezes LPM 1.0.
evidence  — the resolver's unit arms; `build:check`.
verify    — tier 1 checker.
