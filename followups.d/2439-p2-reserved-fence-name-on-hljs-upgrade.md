---
origin: 2439
priority: P2
recorded: 2026-09-27
---

# A highlight.js upgrade that adds a plugin's fence name fails every build

why now   — `tools/build-plugin-registry.js` `reservedFenceNames()` reads the INSTALLED
            highlight.js, and the resolver refuses a plugin fence that a language owns. If a
            highlight.js release adds a language named `math`, `anima` or `functionplot`, the
            Dependabot bump fails `npm run build` with no way out but renaming a fence authors
            already write — a third-party change breaking decks. Nothing is taken today (checked
            2026-09-27 by the HARD RULE #25 inversion lens on #2439).
where     — `tools/build-plugin-registry.js` (`reservedFenceNames`), `lib/plugins/resolve.js`
            (`checkFenceClaims`).
done when — a collision between a NEW highlight.js name and an EXISTING shipped plugin fence
            is grandfathered (the plugin fence keeps winning, the build warns), while a new
            plugin claiming a taken name still fails; a test proves both with a synthetic set.
evidence  — the test, red then green.
verify    — tier 0 gates.
