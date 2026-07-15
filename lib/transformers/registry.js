/**
 * Shared transformer registry — the central plugin list consumed by all
 * render paths (the engine — emulator + playground — and the runtime).
 *
 * Before this module existed, each renderer hand-rolled its own ordered
 * dispatch list and reimplemented the per-transform logic inline. Adding a
 * new transform required editing three files in lock-step; drift between
 * them was caught only by visual diff of the gallery PDFs. The registry
 * inverts the dependency: each transformer declares itself, and the
 * renderers iterate the registry. See engineering/decisions/2026-05-17-shared-
 * transformer-registry.md for the migration plan.
 *
 * Transformer module shape:
 *
 *   module.exports = {
 *     name: 'chart-family',                   // unique, stable, used for ordering + logs
 *     selector: 'section.progress, ...',      // CSS selector identifying applicable sections;
 *                                             // informational for HTML adapters, used as a fast
 *                                             // scope filter by DOM adapters
 *     applyToHtml(html, ctx?) { ... },        // string rewrite — full rendered HTML in, rewritten
 *                                             // HTML out (the engine render path + the
 *                                             // emulator via lib/engine). May append marker
 *                                             // classes to a <section> tag — e.g. chart-family
 *                                             // appends 'chart-frame'.
 *     applyToDom(root, ctx?) { ... },         // optional live-DOM walk (lattice-runtime bundle)
 *   };
 *
 * Order in TRANSFORMERS is significant. Adding a transformer that
 * depends on the output of an earlier one (e.g. compare-prose lifting
 * before split-compare structuring) goes AFTER its dependency.
 *
 * Idempotence rule: every transformer MUST be safe to run twice. The
 * engine path and the runtime path may both fire on the same DOM
 * during preview refreshes; an early-return guard
 * (checking for the layout's marker class) is the standard pattern.
 */

const splitPanels    = require('./split-panels');
const chartFamily    = require('./chart-family');
const imageScrim     = require('./image-scrim');
const imageAdaptive  = require('./image-adaptive');
const pillTag        = require('./pill-tag');
const belowNote      = require('./below-note');
const mastheadLift   = require('./masthead-lift');
const compareCode    = require('./compare-code');
const wifi           = require('./wifi');
const contact        = require('./contact');
const qrGeneral      = require('./qr-general');
const video          = require('./video');
const focus          = require('./focus');
const build          = require('./build');
const logoMarks      = require('./logo-marks');

// Order matters. chart-family runs first so its `chart-frame` class
// addition is visible to anything later in the chain that filters by
// section class. Subsequent transformers operate on disjoint section
// classes, so their relative order doesn't affect correctness — but
// we preserve the historical engine render-hook order to
// keep cross-renderer parity easy to reason about.
//
// (Half-canvas image-text wrapping is done by the engine/emulator's own
// bg-image pass — lib/core/bg-image.js wrapImageText — not a registry
// transformer.)
const TRANSFORMERS = [
  chartFamily,
  splitPanels,
  // `contact` REBUILDS its whole section from the raw postfix-key list
  // (renderCard replaces the section inner with a fresh `.qr-card`), so it must
  // run BEFORE mastheadLift — like the other structural rebuilders chartFamily /
  // splitPanels above. Once contact opted into `conformance:"strict"`
  // (model-driven frame render §4) mastheadLift wraps its finished card in the
  // frame's `.cell-stage` cell; if contact ran AFTER mastheadLift it would wipe
  // that wrapper (and the `.cell-footer`) when it rebuilds. The frame stays the
  // sole cell-builder (HARD RULE #1) — contact only builds the card that fills
  // the stage. wifi/video are canvas but NOT strict, so mastheadLift never wraps
  // them and their position (still below) is immaterial.
  contact,
  // Lifts the eyebrow + title into a .cell-masthead band on `form`-opted
  // sections, then wraps the flow/strict body into the `.cell-stage` cell. It
  // must run AFTER the section-rebuilding structural transforms above so it
  // wraps their FINAL body (see contact, chartFamily, splitPanels); for the
  // remaining disjoint prose sections its position is immaterial.
  mastheadLift,
  // Adaptive image: stamps data-img-bucket / data-img-composition on the live
  // DOM by MEASURING the asset (browser only — applyToDom). The build/export
  // path stamps the same attributes from the file header (lattice-emulator.js).
  // Runs before image-scrim so a resolved `statement` has its composition set
  // when the scrim pass looks (though scrim keys off the class, which is
  // author-set for statement). applyToDom-only; no-op on the HTML string path.
  imageAdaptive,
  imageScrim,
  // Rewrites `logo-wall` marks from `<img>` to token-coloured `.logo-mark`
  // mask spans (palette fill, AA on both grounds). Disjoint section set
  // (section.logo-wall) from every other transformer, so position is immaterial
  // to correctness; grouped with the image transforms it's conceptually near.
  logoMarks,
  // Component-coupled structural transforms migrated out of parseSlide (the
  // engine + runtime paths rendered a flat code sequence before). Disjoint
  // section class (section.compare-code) from every other transformer, so
  // position is immaterial to correctness.
  compareCode,
  // QR-card component (connect bucket): parse a postfix-key list into a payload,
  // encode a palette-blind QR, emit the card. Disjoint section set
  // (section.wifi) from every other transformer, so position is immaterial to
  // correctness. (`contact` shares this kernel but runs earlier — above
  // mastheadLift — because it is `conformance:"strict"` and must be wrapped in
  // its stage cell by the frame.)
  wifi,
  // General `qr` variant — injects a QR figure into a host component
  // (closing/divider/split-panel). MUST run after split-panels (above) so a
  // split-panel section is already restructured into .panel-left/.panel-right
  // when this injects into the right zone. Disjoint from wifi/contact.
  qrGeneral,
  // `video` component (imagery bucket): parses the authored video-URL bullet
  // into a static poster + play badge + provider label + scannable QR (never an
  // iframe). Reuses the QR-card kernel; disjoint section set (section.video)
  // from every other transformer, so position is immaterial to correctness.
  video,
  // Focus resolver — tags `.lat-focus` / `.lat-recede` on the ordinal target of
  // a `_focus:` directive. Runs AFTER the structural transforms above so the
  // collection it counts (list `<li>`, table `<tr>`) is in its final shape; the
  // CSS treatment is keyed on the tags it stamps. Disjoint from pill/below-note.
  focus,
  // Narrative build — stamps `data-build-step` on the steppable units of a
  // `_build:` directive (and `data-build-steps` on the section). Like focus, runs
  // AFTER the structural transforms so the collection is in its final shape; it
  // only TAGS (reveal is CSS gated on a consumer-set `data-build-at`). Disjoint
  // section set (section[data-build]) from focus and everything else.
  build,
  // Runs last: tags genuine trailing-`code` pills (code immediately before a
  // nested list) after all structural transforms have settled the li/code
  // shape. The CSS gates on `li > code.lat-pill`, so order vs the image
  // transformers is immaterial — last keeps the dependency story simple.
  pillTag,
  // Truly last: wraps a layout's trailing `<p>` (the hairline note) only
  // after every structural transform above has settled what the section's
  // final trailing element is. Whole-document walk (applyToHtml/applyToDom)
  // only. See lib/transformers/below-note.js.
  belowNote,
];

// `stats`, when supplied (the perf overlay's opt-in path), is populated with a
// per-transform timing map: stats.transforms[name] = ms. Without it the loop is
// byte-identical to before — a normal render pays nothing. `performance.now()`
// only runs inside the `if (stats)` branch, which the engine sets solely on the
// browser overlay path.
function applyAllToHtml(html, ctx = {}, stats) {
  let out = html;
  for (const t of TRANSFORMERS) {
    if (typeof t.applyToHtml !== 'function') continue;
    if (stats) {
      const t0 = performance.now();
      out = t.applyToHtml(out, ctx);
      stats.transforms[t.name] = (stats.transforms[t.name] || 0) + (performance.now() - t0);
    } else {
      out = t.applyToHtml(out, ctx);
    }
  }
  return out;
}

function applyAllToDom(root, ctx = {}) {
  for (const t of TRANSFORMERS) {
    if (typeof t.applyToDom === 'function') t.applyToDom(root, ctx);
  }
}

function getByName(name) {
  return TRANSFORMERS.find(t => t.name === name);
}

module.exports = {
  TRANSFORMERS,
  applyAllToHtml,
  applyAllToDom,
  getByName,
};
