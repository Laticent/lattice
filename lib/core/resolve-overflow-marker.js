/**
 * lib/core/resolve-overflow-marker.js
 *
 * The `overflow-marker` EXPORT SETTING decides WHO the overflow signal is addressed
 * to. It does not decide whether overflow is detected — the probe
 * (lib/core/overflow-probe.js) always runs and the author is always told on the
 * console; this only chooses what a person looking at the rendered slide sees.
 *
 *   author   the authoring signal — the red ring, an "Overflows" tab, the per-cell
 *            "Fix Me" culprit overlays, and the §8-rule-8 type-floor alarm. What
 *            every authoring surface shows, because you are the one fixing it.
 *   reader   the reader signal — no red ring, and the same text-labeled tab
 *            restyled into a calm "Content clipped" pill; no QA overlays, no
 *            type-floor alarm. The EXPORT default: a clipped slide still says so,
 *            but the artifact is not a bug report.
 *   off      no marker at all. The clip is silent on the page — the console
 *            warning is the only channel.
 *
 * WHY A SETTING AND NOT A CONSTANT. Two shipped policies disagreed, each correct on
 * its own surface. lattice-emulator.js strips every marker before printing a PDF
 * and warns the author on stderr ("The export stays clean — no overflow marker is
 * printed"). The browser runtime draws the marker so a reader never gets a silent
 * clip. An Export-to-Marp bundle renders through the RUNTIME inside marp-cli's
 * browser, so it inherited the authoring default by accident — a recipient opening a
 * delivered deck saw "Overflows" and per-cell "Fix Me" tags. Neither policy is
 * wrong, and neither is right for every artifact, so the choice belongs to the
 * person exporting. `reader` is the least-bad default: a deck that clips is not
 * passed off as fine, and a deck that is delivered is not covered in QA chrome.
 *
 * WHY IT IS NOT A DECK REGISTER. It shipped as `overflow-marker:` front matter for
 * one commit and was moved. One deck source is previewed while authoring, exported
 * to a bundle for a recipient, and printed to PDF for the record — three surfaces,
 * three different correct answers, decided entirely by which command you ran. That
 * makes it a property of the RENDER TARGET, and this repo ruled the same way one day
 * earlier on `autosplit:`
 * (engineering/decisions/2026-07-29-autosplit-is-not-a-toggle.md). It is now chosen
 * at export time (`--overflow-marker`, or the Studio's workspace setting beside
 * `pdfPages`) and carried into the artifact in its own generated block
 * (lib/core/export-settings.js), never in the author's front matter.
 *
 * Pure + dependency-free so it bundles into the browser runtime (esbuild) and is
 * unit-testable in isolation.
 */

/** The recognized levels, loudest first (for the CLI/UI vocabulary and docs). */
const OVERFLOW_MARKER_LEVELS = Object.freeze(['author', 'reader', 'off']);

/**
 * What an export defaults to when nobody says otherwise. Named rather than inlined,
 * because it is the one value the "no good choice, just a less-bad one" decision
 * actually turns on.
 */
const EXPORT_DEFAULT_MARKER = 'reader';

/** What an authoring surface (live preview, Studio) shows. Not configurable: you
 *  are the one fixing the deck, so you get the signal that helps you fix it. */
const AUTHORING_DEFAULT_MARKER = 'author';

/** True if `value` is a recognized level name. */
function isKnownOverflowMarker(value) {
  return typeof value === 'string'
    && OVERFLOW_MARKER_LEVELS.includes(value.trim().toLowerCase());
}

/**
 * Resolve a raw value to a level, falling back when it is absent OR unrecognized.
 * An unknown value falls back rather than throwing: a stale setting or a typo in an
 * env var must not decide the artifact by accident. (The CLI flag is stricter — it
 * DIES on a bad value, because a flag you just typed is a mistake worth stopping
 * for, where a stored setting is one worth surviving.)
 *
 * @param {string|null|undefined} value
 * @param {string} fallback level to use when `value` is absent/unknown
 */
function resolveOverflowMarker(value, fallback = EXPORT_DEFAULT_MARKER) {
  const safeFallback = isKnownOverflowMarker(fallback)
    ? fallback.trim().toLowerCase()
    : EXPORT_DEFAULT_MARKER;
  if (!isKnownOverflowMarker(value)) return safeFallback;
  return value.trim().toLowerCase();
}

/**
 * The levels a STANDING default may take — `off` is deliberately not among them.
 *
 * `off` is the one level that lets a broken slide look finished, and the whole point
 * of the deck-key removal was that a persistent, invisible silence is the failure
 * mode to prevent. A standing `off` is worse than the deck key ever was: the key was
 * narrow, textual, greppable, lintable and visible in a diff, where a workspace
 * setting or an env var is none of those and silences every export from that Studio
 * or checkout indefinitely. So `off` is available only where it is a decision about
 * ONE artifact — the `--overflow-marker` flag and the Studio's per-export step, both
 * of which leave a record (a console warning, and the level in the artifact itself).
 */
const STANDING_MARKER_LEVELS = Object.freeze(['author', 'reader']);

/** True if `value` may be used as a standing default (see above). */
function isStandingOverflowMarker(value) {
  return typeof value === 'string'
    && STANDING_MARKER_LEVELS.includes(value.trim().toLowerCase());
}

module.exports = {
  OVERFLOW_MARKER_LEVELS,
  STANDING_MARKER_LEVELS,
  isStandingOverflowMarker,
  EXPORT_DEFAULT_MARKER,
  AUTHORING_DEFAULT_MARKER,
  isKnownOverflowMarker,
  resolveOverflowMarker,
};
