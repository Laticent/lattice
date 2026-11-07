/**
 * lib/core/resolve-progress-rail.js
 *
 * The deck front-matter `progress-rail:` register: the section rail (lib/forms/tile/progress) on
 * ONE line, up to one word per axis (the `logo-finish:` / `image-card:` shape), and the editor
 * completes each word:
 *
 *   progress-rail: center           → `progress-rail-center`                    the middle of the footer band
 *   progress-rail: edge bar         → `progress-rail-edge progress-rail-bar`    a vertical bar down the right edge
 *   progress-rail: off              → `progress-rail-off`                       no rail on any slide
 *
 * Three axes, each one's default first:
 *   placement  `right` sits beside the page number (the default); `center` sits in the middle of the
 *              footer band; `edge` stands the rail upright on the slide's right edge, at mid-height,
 *              clear of the footer.
 *   style      `dots`: one dot per section, the current one stretched into a pill (the default).
 *              `bar`: one thin segment per section, the current one filled.
 *   show       `on` (the default) / `off`. Both stamp the register's OWN tokens, `progress-rail-on` and
 *              `progress-rail-off`, never the rail's switch tokens (`no-progress` / `with-progress`,
 *              lib/core/switches.mjs). `off` hides the rail on every slide; `on` lowers the rail's floor
 *              to two sections and any length (progress.transform.js `railWanted`). A slide's own
 *              `_class: progress-rail-on` evicts the deck's `off` on that slide, like any axis word.
 *
 *              WHY NOT THE SWITCH TOKENS. An earlier cut stamped `no-progress` for `off` and an inert
 *              token for `on`, so the register's `show` axis and the switch shared a token. Where a
 *              deck's tokens arrive at different times (the VS Code preview applies the saved file's
 *              settings after the first render), a `progress-rail-on` already on the slide then read as
 *              the slide's own word on that axis and EVICTED a deck-wide `class: no-progress` that
 *              landed later — so `progress-rail: on` plus `class: no-progress` drew the rail.
 *              bundle-settings-live.test.js caught it. Two mechanisms, two token sets: the switch keeps
 *              `no-progress` / `with-progress` / `silent` exactly as before, and the transform honors
 *              `progress-rail-off` beside them. `with-progress` on a slide still wins over both.
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
  // The register's own tokens, never the switch's (see the header).
  { axis: 'show', names: ['on', 'off'], classes: ['progress-rail-on', 'progress-rail-off'] },
]);

module.exports = { PROGRESS_RAIL_REGISTER: REGISTER, PROGRESS_RAIL_PLACEMENTS: PLACEMENTS, PROGRESS_RAIL_STYLES: STYLES };
