/**
 * lib/authoring/legacy-meta-rules.js
 *
 * The two old-spelling lint rules of the clean break to `@meta` records (engineering/decisions/2026-10-17-meta-record.md
 * §15): `legacy-directive-comment` (`<!-- _class: … -->` and the other directive comments) and `meta-bare-record` (the
 * retired bare `<!-- {…} -->` record). Both are warnings while the engine still reads the old forms, and the old forms
 * render the same, so until the sweep (slice D) rewrites the committed decks three readers set them aside:
 *   · `lint:deck --strict` (tools/lint-deck.js), so the pre-commit hook and `lint:deck:all` do not block every deck edit;
 *   · the Coach's Contract score (lib/authoring/scorecard.js), which counts what renders wrong;
 *   · the tests that hold the corpus lint-clean.
 * One list, read by all three (HARD RULE #1). The sweep deletes the exemptions; the cut raises the rules to errors
 * (lint-core `LEGACY_META_SEVERITY`). Pure, fs-free.
 */
const LEGACY_META_RULES = Object.freeze(['legacy-directive-comment', 'meta-bare-record']);

module.exports = { LEGACY_META_RULES };
