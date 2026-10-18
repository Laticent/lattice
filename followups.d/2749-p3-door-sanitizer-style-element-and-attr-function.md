---
origin: 2749
priority: P3
recorded: 2026-10-18
area: engine
severity: low
swimlane: engineering/decisions/2026-10-16-npm-plugin-threat-model.md §5.2
---

# Check the door's other address channels the checker did not trace: `<style>` elements, `attr()` and the Studio door.

The checker on #2781 did not verify three adjacent surfaces after the custom-property fix in `cssRefTargets`.

why now   — the canary only attacks what it lists, and the checker named these as not traced.
where     — lib/core/door-attr.mjs (`attrRefTargets` reads attributes; does a plugin's `<style>` element text get its own address check?),
            docs/src/lib/code-packages/door-run.ts (the Studio door: any guard beyond `doorFilterAttr`?), and `attr()` as a way to feed an
            address (Chromium taints `attr()` values for URLs; untested here).
done when — each is either shown closed by a canary vector that fails without the guard, or fixed with one.
evidence  — a markup vector in test/fixtures/npm-plugin-canary.js for each, read in an online page raw and sanitized.
verify    — tier 1 checker, because it changes what a sanitizer accepts.
