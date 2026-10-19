/**
 * The extra directives the CLI's plain `.html` export carries so a script already running in it cannot
 * load another script, a frame, a stylesheet or `@import`, or prefetch from anywhere but the file itself:
 * `default-src`, `script-src`, `style-src` and `frame-src`, each limited to the file, inline content,
 * `data:` and `blob:` (`frame-src 'none'`). `'unsafe-inline'` stays: the export's own runtime, styles and
 * Mermaid output are inline.
 *
 * Measured on real exports in Chromium 131, WebKit 26.0 and Firefox 142.0.1
 * (test/integration/export-nightly/npm-plugin-export-check.test.js): `<script src>`, `<iframe>`, CSS
 * `@import`, `<link rel=stylesheet>` and `<link rel=prefetch>` stop reaching a listener. Navigation,
 * `window.open`, WebRTC, a meta refresh and a `target=_blank` link still do, here AND in `--player` (which has
 * `default-src 'none'`): no content-security directive governs them. They are accepted, in writing, in
 * engineering/decisions/2026-10-16-npm-plugin-threat-model.md §5.4 (owner, 2026-10-18).
 *
 * A MODULE OF ITS OWN, NOT AN OPTION ON `subresource-csp.mjs`: that file ships in the Studio and
 * Playground bundles (docs/src/playground/preview-csp.js), where the preview frame loads KaTeX's stylesheet
 * from a remote origin and a `style-src 'self'` would starve it. Adding the constants there cost 69 bytes of
 * eager JavaScript on three routes (#2785's first CI run). Only the CLI requires this file.
 */
const { subresourceCspPolicy } = require('./subresource-csp.mjs');

const LOCK_LOADS = Object.freeze([
  "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob:",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob:",
  "style-src 'self' 'unsafe-inline' data:",
  "frame-src 'none'",
]);

/** The plain export's whole policy: the shared subresource policy, then the four load directives. */
function lockedCspPolicy(opts) {
  return [subresourceCspPolicy(opts), ...LOCK_LOADS].join('; ');
}

/** The `<meta http-equiv="Content-Security-Policy">` tag for the plain export; emit it first in `<head>`. */
function lockedCspMeta(opts) {
  return `<meta http-equiv="Content-Security-Policy" content="${lockedCspPolicy(opts)}">`;
}

module.exports = { LOCK_LOADS, lockedCspPolicy, lockedCspMeta };
