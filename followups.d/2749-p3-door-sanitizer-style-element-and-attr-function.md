---
origin: 2749
priority: P3
recorded: 2026-10-18
area: engine
severity: low
swimlane: engineering/decisions/2026-10-16-npm-plugin-threat-model.md §5.2
---

# Re-test `attr()` as an address channel when a browser starts loading URLs from it.

Triaged 2026-10-19 on #2781. Closed with evidence: (1) a `<style>` element carrying the variable trick is stripped by the sanitizer (`FORBID_TAGS` includes `style`); the canary's `style-element-var` vector fires raw in an online page and reads zero sanitized, in real Chromium. (2) The Studio door imports the same `door-attr.mjs` and slide sanitizer (`docs/src/lib/code-packages/door-run.ts` lines 11-12), and `docs/e2e/code-packages.spec.ts` returns the inherited and spaced CSS-variable addresses from a hostile package: green with the fix, red with `isAddressString` disabled, real Studio, Chromium desktop project. (3) `attr()` is not an address channel in any engine we can run: with a control that fires (plain `url()`), `image-set(attr(data-u type(<url>)) 1x)` and `background-image: attr(data-u type(<url>))` reached the listener in none of Chromium 141.0.7390.37 (which supports `attr()` as a type and taints URLs built from it), WebKit 26.0 and Firefox 142.0.1.

why now   — nothing today. This item exists so the day a browser starts fetching an `attr()` URL is caught by a vector, not by a report.
where     — lib/core/door-attr.mjs (`attrRefTargets`; a `data-*` value is not listed as an address); the canary in test/fixtures/npm-plugin-canary.js (add the `attr()` vectors with a Chromium whose control fires).
done when — a browser release in the nightly matrix fires an `attr()` URL in the canary's raw control; the sanitized output then reads zero, or the door drops it. Stripping every `attr()` is NOT the fix: decks use `content: attr(data-label)`.
evidence  — the vector's raw and sanitized runs in that browser.
verify    — tier 1 checker, because it changes what a sanitizer accepts.
