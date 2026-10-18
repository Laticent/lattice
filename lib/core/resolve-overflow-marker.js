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
 * its own surface. lattice.js strips every marker before printing a PDF
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
 * SCOPE. Every EXPORT path HONORS it, by one of exactly two mechanisms — a surface
 * either READS the settings block at view time (the Export-to-Marp bundle, the
 * `--fluid` viewer) or has the resolved state BAKED into it at export
 * (`lattice.js`'s PDF / PNG / PPTX / HTML, and `--player`, which ships no
 * runtime and so can read nothing). There is no third option; "the default there is
 * already correct" is how `--player` spent a commit silently equal to `off`.
 * An AUTHORING surface does neither, and that
 * is a decision rather than an omission: the live preview and the Studio always show
 * `author`, because you are the one who can fix a clipped slide.
 *
 * That was not true at first. The emulator was left hard-wired to the equivalent of
 * `off` plus its stderr warning, on the grounds that this was already the right
 * default — which made `--overflow-marker=author` silently do nothing in the PRIMARY
 * export, and shipped a setting the most-used path ignored. A setting nothing reads
 * is not a setting.
 *
 * The console warning is unconditional at every level, and it is the whole reason
 * `off` is tolerable: the author is always told, even when the artifact says nothing.
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

/**
 * Resolve the overflow-marker level for ONE export — the one place both producers
 * agree, so the CLI and the in-browser Studio cannot ship different defaults
 * (HARD RULE #1).
 *
 * Two inputs, both belonging to the person exporting rather than to the deck:
 *   `chosen`    this export's answer — the CLI's `--overflow-marker`, or the
 *               Studio's export UI. Wins when it is a recognized level.
 *   `workspace` the standing answer for every export — the Studio's workspace
 *               setting (beside `pdfPages`), or `LATTICE_OVERFLOW_MARKER` for the
 *               CLI. Used when this export said nothing.
 *
 * A stale or mistyped WORKSPACE value falls back rather than throwing, because it
 * was stored long ago and must not break today's export; a mistyped FLAG is fatal
 * at the call site, because you just typed it. Neither reads the deck: the level is
 * a render-target property, not an authoring fact
 * (engineering/decisions/2026-07-30-overflow-marker-register.md).
 */
function resolveExportOverflowMarker({ chosen = null, workspace = null } = {}) {
  const norm = (v) => v.trim().toLowerCase();
  // A bad value from EITHER tier is reported, not swallowed. The first cut only
  // looked at `workspace`, and only when nothing else won — so `--overflow-marker=off`
  // beside a stale `LATTICE_OVERFLOW_MARKER=quiet` said nothing about the stale one,
  // which is exactly the case the docstring claimed was covered.
  const ignored = [];
  if (chosen != null && String(chosen).trim() !== '' && !isKnownOverflowMarker(chosen)) {
    ignored.push({ tier: 'this export', value: String(chosen) });
  }
  // `off` is barred from a STANDING default (see STANDING_MARKER_LEVELS): a
  // persistent, invisible silence is the failure mode this whole change exists to
  // prevent, and a workspace setting or an env var is exactly that. Reported rather
  // than silently downgraded, so nobody wonders why their setting did nothing.
  if (workspace != null && String(workspace).trim() !== '' && !isStandingOverflowMarker(workspace)) {
    ignored.push({
      tier: 'standing default',
      value: String(workspace),
      reason: isKnownOverflowMarker(workspace)
        ? `'${norm(String(workspace))}' cannot be a standing default — choose it per export`
        : 'not a known level',
    });
  }

  if (isKnownOverflowMarker(chosen)) return { marker: norm(chosen), source: 'this export', ignored };
  if (isStandingOverflowMarker(workspace)) {
    return { marker: norm(workspace), source: 'workspace setting', ignored };
  }
  return { marker: EXPORT_DEFAULT_MARKER, source: 'default', ignored };
}

/**
 * Strip what a level below `author` must not carry from a BAKED export document — the step
 * every host runs after its watcher has settled and before it takes the slides' markup.
 *
 *   off      clears the ring (`overflow`), the pill (`clip-marked`; the tab keys on it, not
 *            on `overflow`, because a slide can cut content without overflowing) and the tab.
 *   reader   and `off` also drop the §8-rule-8 TYPE-FLOOR alarm (`illegible` + its tab): a
 *            reader cannot resize a figure, so "Text too small · 3pt" is a QA diagnostic in
 *            front of a boardroom. The author's channel for it is the console.
 *
 * ONE COPY FOR BOTH HOSTS (HARD RULE #1). It lived inline in lattice.js's `page.evaluate`,
 * and the Studio's Webpage export ran no equivalent at all, so every player the Studio made
 * shipped `data-lattice-overflow-marker="author"` and the type-floor tab on every slide — a
 * clipped slide reached its reader with the red ring, "OVERFLOWS" and the "Fix Me" chips
 * (engineering/decisions/2026-10-16-player-as-library-audit.md §11.8).
 *
 * SELF-CONTAINED on purpose: lattice.js hands it to puppeteer's `page.evaluate`, which
 * serializes the function's text into the page, so it may touch nothing outside its body.
 *
 * @param {string} lvl a resolved level (`author` | `reader` | `off`)
 * @param {Document|Element} [root] defaults to the page's `document`
 */
function stripMarkerForLevel(lvl, root) {
  const doc = root || document;
  const each = (sel, fn) => Array.prototype.forEach.call(doc.querySelectorAll(sel), fn);
  if (lvl === 'off') {
    each('section.overflow', (s) => s.classList.remove('overflow'));
    each('section.clip-marked', (s) => s.classList.remove('clip-marked'));
    each('.overflow-tab', (t) => t.remove());
  }
  if (lvl !== 'author') {
    each('section.illegible', (s) => s.classList.remove('illegible'));
    each('.illegible-tab', (t) => t.remove());
  }
}

module.exports = {
  OVERFLOW_MARKER_LEVELS,
  STANDING_MARKER_LEVELS,
  isStandingOverflowMarker,
  EXPORT_DEFAULT_MARKER,
  AUTHORING_DEFAULT_MARKER,
  isKnownOverflowMarker,
  resolveOverflowMarker,
  resolveExportOverflowMarker,
  stripMarkerForLevel,
};
