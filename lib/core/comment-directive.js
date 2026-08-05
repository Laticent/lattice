/**
 * lib/core/comment-directive.js — the CJS door onto `comment-directive.mjs`.
 *
 * The grammar itself lives in the `.mjs` sibling; this file exists so that every
 * `require('./comment-directive')` call site in the render path keeps working
 * unchanged. Read the `.mjs` for what the grammar is and why it is shared.
 *
 * WHY THE IMPLEMENTATION MOVED. `lib/core/class-directive-scan.mjs` is ESM on
 * purpose — the docs editor imports it as source, because Vite serves a source
 * CJS module untransformed and its `module.exports` reads as no `default` export
 * (`docs/astro.config.mjs` states this rule; the `*.generated.js` esbuild bundles
 * exist to work around it). That makes a CJS dependency anywhere in that ESM
 * graph a build failure, not a style preference: importing this grammar from the
 * scanner failed the docs build, `studio-smoke`, and `preview` with
 * `commentDirective is not defined` at the import site. ESM is the format both
 * kinds of consumer can read, so it is where the source of truth sits, and the
 * direction of this shim is the whole point — CJS wraps ESM, never the reverse.
 *
 * `require()` of an ES module is unflagged from Node 22.12, which is the floor
 * `package.json` `engines` already declares for the same reason.
 */

module.exports = require('./comment-directive.mjs');
