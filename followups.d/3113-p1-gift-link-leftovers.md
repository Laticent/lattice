---
origin: 3113
priority: P1
recorded: 2026-11-22
area: website
severity: medium
swimlane: engineering/decisions/2026-11-06-gift-link-cli.md §6
deferred: blocked — the first part is the owner's own account chore; the rest are small but off-path to the PR that records them, and the last needs a live minted key
source: https://github.com/Laticent/lattice/pull/3113
---

# Gift links: four leftovers from #3113

why now   — Four items from #3113, checked against main (164ecfa):
            1. Owner chore: delete the OpenRouter management key used for #3113's live run, on openrouter.ai
               (Settings → Management API Keys). A management key can mint keys, so it should not outlive the test.
            2. Pick-list headroom: test/unit/cli/build-pick-list.test.js asserts `md.length < 24_000`. Today the
               pick list is 23,972 characters (dist/docs/components.pick.md), so 28 are left. The next
               component's line will fail the test.
            3. A capped key's reply that is clamped and then cut off gets the generic note "pick a model with more
               output room" (`TRUNCATION_NOTE`), when the real limit is the key's cap.
            4. OpenRouter's activation delay for a freshly minted key was never seen live (the `minted: true`
               path). The sandbox proxy could not show a minted key's first model call.
where     — openrouter.ai settings (1); test/unit/cli/build-pick-list.test.js:266 and tools/build-docs-portal.js
            `renderPickMd` (2); docs/src/components/studio/architect.ts `TRUNCATION_NOTE` and the note near line
            830 (3); the Studio's `writeOpenRouterKey(key, { minted: true })` path (4).
done when — (1) the owner confirms the key is deleted; (2) the ceiling is re-justified with measured headroom, or
            the list is trimmed; (3) a clamped reply's note names the key's limit; (4) a minted key's first call is
            seen on a real browser and the delay is handled or measured as none.
evidence  — the character count above; the `TRUNCATION_NOTE` text on main.
verify    — `node --test test/unit/cli/build-pick-list.test.js`; a real minted gift link redeemed on the deployed
            site and its first chat turn.
