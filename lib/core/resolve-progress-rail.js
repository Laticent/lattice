/**
 * lib/core/resolve-progress-rail.js
 *
 * The deck front-matter `progress-rail:` register: the section rail (lib/forms/tile/progress) on
 * ONE line, up to one word per axis (the `logo-finish:` / `image-card:` shape), and the editor
 * completes each word:
 *
 *   progress-rail: center           → `progress-rail-center`                    the middle of the footer band
 *   progress-rail: edge bar         → `progress-rail-edge progress-rail-bar`    a vertical bar down the right edge
 *   progress-rail: off              → `no-progress`                             no rail on any slide
 *
 * Three axes, each one's default first:
 *   placement  `right` sits beside the page number (the default); `center` sits in the middle of the
 *              footer band; `edge` stands the rail upright on the slide's right edge, at mid-height,
 *              clear of the footer.
 *   style      `dots`: one dot per section, the current one stretched into a pill (the default).
 *              `bar`: one thin segment per section, the current one filled.
 *   show       `on` (the default) / `off`. `off` stamps the rail's existing SWITCH token,
 *              `no-progress` (lib/core/switches.mjs), so `progress-rail: off` is exactly the old
 *              deck-wide `class: no-progress`, and a slide's own `with-progress` still brings one
 *              slide back. `on` stamps `progress-rail-on`, which no rule reads: it is the DEFAULT, and
 *              writing the default must change nothing. It once stamped `with-progress`, which is
 *              the explicit "show it anyway" switch and beats `silent` and a deck-wide
 *              `class: no-progress` — so a deck that merely spelled out the default lost the
 *              silencing on every `silent` slide. As a word on the `show` axis it still does the
 *              one thing a default should: a slide's `_class: progress-rail-on` evicts the deck's
 *              `off` on that slide, and nothing more.
 *
 * WHY ONE KEY. Where the rail sits and what it looks like are one decision about one mark, so
 * they are one line, completed word by word, the way `logo-finish:` styles the logo. A slide's own
 * word on an axis (`_class: progress-rail-edge`) evicts the deck's word on THAT axis only, like
 * every axis register (lib/core/register-factory.js). The words are class tokens on the section,
 * so both render paths and the runtime read the one register (HARD RULE #1), and CSS does the
 * rest (lib/forms/cell/progress-center/progress-center.css, lib/forms/tile/progress/progress.css).
 *
 * What the rail MEANS is not on this line, because it is not a style choice: one mark per section,
 * drawn only when the deck has at least two, and drawn on each `divider` lit on the section it opens
 * (progress.transform.js). Pure and dependency-free but for the factory, so it bundles into the
 * browser runtime.
 */

const { makeRegister } = require('./register-factory');

const PLACEMENTS = Object.freeze(['right', 'center', 'edge']);
const STYLES = Object.freeze(['dots', 'bar']);

const REGISTER = makeRegister('progress-rail', [
  { axis: 'placement', names: PLACEMENTS },
  { axis: 'style', names: STYLES },
  // `off` is the rail's own switch token rather than `no-progress-rail`: one switch per mark, so
  // `progress-rail: off` and `class: no-progress` are the same token and settle by the one
  // precedence. `on` is inert (see the header): the default must not out-rank `silent`.
  { axis: 'show', names: ['on', 'off'], classes: ['progress-rail-on', 'no-progress'] },
]);

module.exports = { PROGRESS_RAIL_REGISTER: REGISTER, PROGRESS_RAIL_PLACEMENTS: PLACEMENTS, PROGRESS_RAIL_STYLES: STYLES };
