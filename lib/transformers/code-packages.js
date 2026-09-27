/**
 * THE SLOT CODE PACKAGES RUN IN (portable-packages phase 6; contract note §9).
 *
 * A code package is a component whose `transform.js` someone else wrote. It runs sandboxed and
 * asynchronously (the CLI in a locked Chromium page, the Studio in a sandboxed iframe), and the
 * engine's render is synchronous, so this slot runs nothing itself: it hands the deck HTML to a
 * hook the CALLER supplies (`ctx.codePackages`), with the two facts only the render knows at this
 * point, each section's deck position and the render's id prefix. Without a hook it returns its
 * input, so a render that uses no code package is byte-identical to one before this slot existed.
 *
 * WHY HERE, right after `chartFamily` and before everything else that rebuilds or wraps a section
 * (split panels, the masthead lift, the cell builders):
 *   - it is where 22 of the 29 shipped transforms run (every chart), so a package receives the
 *     section in the shape our own charts do, and the masthead lift frames its output the way it
 *     frames a chart's;
 *   - it runs inside panes too: a pane renders as a one-slide deck through this same registry, so
 *     a package in a pane runs, where a door after the render would have skipped it in silence
 *     (the inversion lens).
 * `coda` still runs first, so a package, like a chart, gets the slide with its trailing beats
 * already lifted into `.cell-coda`.
 *
 * The CALLERS run each package twice around this slot: a first render CAPTURES the sections the
 * packages claim (the hook returns its input), the packages run, and a second render SUBSTITUTES
 * their sanitized output here (lib/packages/code-door.js; the Studio's docs/src/lib/code-packages/).
 */
const { slideIndexFor, renderIdPrefix } = require('../core/render-ids');

module.exports = {
  name: 'code-packages',
  selector: '',
  applyToHtml(html, ctx) {
    if (typeof ctx?.codePackages !== 'function') return html;
    return ctx.codePackages(html, { slideIndex: slideIndexFor, idPrefix: renderIdPrefix() });
  },
};
