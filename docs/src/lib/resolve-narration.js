// The docs-site binding of the shared narration front-matter parser. The parsing
// LOGIC lives once in the engine at `lib/core/resolve-narration.mjs` (HARD RULE #1),
// so the CLI/export producer and the live Studio Present read-aloud parse the
// `acronyms:`/`say:` keys identically and can never drift. This thin re-export
// gives the docs a clean `@/lib/resolve-narration` import (the `@/lib/sanitize-slide-
// html.js` precedent) without a deep relative path into the engine tree.
export { acronymEntries, acronymSpokenMap, frontMatterLang, frontMatterSayMap, lexiconMap, parseNarrationFrontMatter } from '../../../lib/core/resolve-narration.mjs';
