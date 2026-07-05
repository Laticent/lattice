# lib/shared — semi-universal CSS modifiers

`shared.styles.css`: the `compact` and `accent` modifiers — opt-in classes
that compose with most (not all) layouts. One tier below `lib/base/` (which
is universal). See `shared.docs.md` for the contract and history.

**Gotcha:** these work by tightening tokens (`compact` shrinks the `--sp-*`
scale); a layout that hard-codes spacing instead of reading `var(--sp-*)`
silently ignores them.
