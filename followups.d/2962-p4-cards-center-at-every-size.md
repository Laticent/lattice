---
origin: 2962
priority: P4
recorded: 2026-10-29
area: inventory
severity: medium
swimlane: engineering/decisions/2026-09-01-card-stack-vertical-alignment.md §13
deferred: off-path — the card-alignment defaults in component manifests; this PR changes tooling and docs only
---

# Cards should center by default at every size, as they do at HD and 4K

why now   — the owner's call from the fit-everywhere work (#2962): a card row should sit at its content height, centered on the stage, at every box, not only on the wide family (HD, 4K, which resolve to `center`). Today the default depends on the slide's shape, so the same deck composes differently on a phone than on a screen. From lib/core/cards-catalog.generated.js:
            cards-grid — `spread` on the strip and tall families;
            cards-stack, list, statute-stack — `spread` on the square, strip and tall families;
            matrix-2x2, split-compare — `stretch` everywhere; q-and-a — `stretch` except strip and tall;
            every governed component with a key-insight panel (`withCoda`) — `stretch`;
            and a member alone on a split page fills the page (`flex: 1 1 auto` in lib/base/base.modifiers.css, the `.lat-split-native` lone-member rules).
where     — the `cards` field of each manifest above (`byFamily`, `default`, `withCoda`), regenerated into lib/core/cards-catalog.generated.js by `npm run build`; resolved by lib/core/resolve-cards.js and applied by the `[data-cards]` rules in lib/base/base.tokens.css.
done when — with no `cards:` front matter or `_class: cards-*`, these components resolve to `center` at square, portrait and story as they do at HD and 4K; the owner has said whether `withCoda`, the equal-row designs (matrix-2x2, split-compare, split-panel `proof`/`capstone`) and the lone split page change too, and the card-alignment note records the decision; authors can still ask for `stretch` or `spread`.
evidence  — renders of each changed component at HD, square, portrait and story before and after, in both modes; the split golden (`npm run split:golden:check`) and the fit ratchet re-blessed with the reason; a demo deck (HARD RULE #9).
verify    — npm run build:check; npm test; npm run test:integration
