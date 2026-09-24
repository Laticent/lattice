---
origin: 2348
priority: P2
recorded: 2026-09-24
---

# `size:`, `theme:` and the motion keys are not linted, so a typo renders the default silently

why now   — The front-matter reference and the Deck settings guide now have to say "not checked yet" for these keys. A deck with `size: huge`, `theme: nope` and `motion: maybe` gets zero lint warnings (checked on #2348), while every look and accent register gets an `unknown-*` warning naming the valid values. `lib/engine/sizes.js:69-72` already promises that "`lint:deck` is what tells the author about the typo".
where     — lib/authoring/lint-core.js (the `unknown-*` register rules, e.g. unknown-spectrum ~:3870); the value sources: lib/engine/sizes.js SIZES, themes/*.css, docs/src/components/studio/motion-catalog (motion-style / motion-speed), lib/core/resolve-motion.mjs.
done when — `lint:deck` and the Studio editor warn on an unknown `size:`, `theme:`, `motion:`, `motion-style:`, `motion-speed:` and `player-motion:` value, naming the valid ones; the values move into the lint vocab so the reference page reads them from there; the "not checked yet" sentences in docs/src/content/docs/reference/front-matter.mdx and guides/deck-settings.mdx are removed.
evidence  — Fact-check on #2348, scratch decks in the session scratchpad.
verify    — `npm run lint:deck` on a deck with `size: huge` prints one warning listing the sizes.
