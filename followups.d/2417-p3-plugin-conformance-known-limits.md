---
origin: 2417
priority: P3
recorded: 2026-09-27
---

# Close the plugin harness's two known limits

why now   — `engineering/decisions/2026-09-27-plugin-system.md` §11 records two gaps. Once a
            second plugin exists, either one can let a wrong plugin pass the build.
            (1) The detect-superset arm in `test/unit/plugins/conformance.test.js` parses with a
            bare commonmark instance, not the engine's own parser.
            (2) `lib/plugins/resolve.js` checks trigger collisions only against the triggers a
            manifest DECLARES; nothing proves a rule fires only on them.
where     — `test/unit/plugins/conformance.test.js` (`pluginTokens`), `lib/plugins/resolve.js`,
            `lib/engine/index.js` (the parser memo, which may need a test-only seam).
done when — the superset arm parses with the engine's real parser, and a test feeds every
            plugin rule each non-trigger ASCII character at a token start and fails if the rule
            claims it. Mutation-prove both: a rule that fires on an undeclared character, and a
            case only the engine's parser tokenizes differently.
evidence  — the two mutation runs, red then green, pasted into the PR body.
verify    — tier 1 checker, because a harness that cannot fail is worse than no harness.
