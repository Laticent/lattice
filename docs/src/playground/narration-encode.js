// The narration encoder lives in lib/core/narration-encode.mjs, so the Studio's bake and the CLI's
// `lattice video deck.md` encode a clip with one module (HARD RULE #1). This path stays for the
// Studio's imports and tests.
export * from '../../../lib/core/narration-encode.mjs';
