---
origin: 2749
priority: P3
recorded: 2026-10-18
area: engine
severity: low
swimlane: engineering/decisions/2026-10-16-npm-plugin-threat-model.md §5.2
---

# Check `attr()` as an address channel into the door; the `<style>` element and the Studio door are closed.

Triaged 2026-10-18 on #2781. Closed with evidence: (1) a `<style>` element carrying the variable trick is stripped by the sanitizer (`FORBID_TAGS` includes `style`); the canary's `style-element-var` vector fires raw in an online page and reads zero sanitized, in real Chromium. (2) The Studio door imports the same `door-attr.mjs` and slide sanitizer (`docs/src/lib/code-packages/door-run.ts` lines 11-12), and `docs/e2e/code-packages.spec.ts` now returns the inherited and spaced CSS-variable addresses from a hostile package: green with the fix (2 passed), red with `isAddressString` disabled (1 failed, the preview kept the markup), real Studio, Chromium desktop project. Left:

why now   — `attr()` can feed an address in newer Chromium (`attr(data-u type(<url>))`, Chromium 133 and later). The canary runs Chromium 131, where it does not parse, so its control cannot fire and the door's behavior is UNVERIFIED rather than safe.
where     — lib/core/door-attr.mjs (`attrRefTargets`; a `data-*` value is not listed as an address today); the canary in test/fixtures/npm-plugin-canary.js.
done when — with a Chromium that supports `attr()` as a URL, the canary has a vector whose control fires raw; the sanitized output reads zero, or the door drops it. Stripping every `attr()` is NOT the fix: decks use `content: attr(data-label)`.
evidence  — the vector's raw and sanitized runs in a Chromium that supports it.
verify    — tier 1 checker, because it changes what a sanitizer accepts.
