/**
 * The ONE check a package from someone else passes before the CLI installs it, lists it as
 * usable, or renders from it (engineering/decisions/2026-09-23-portable-packages.md §3.5).
 *
 * The same refusing rules as the Studio's Library import (lib/packages/import-gate.js) and
 * the same theme registry: the gate's default, the base theme alone, which is what the
 * Studio's `refuseImportedTheme` passes. So the two front doors refuse the same packages,
 * and a package one accepts the other accepts.
 *
 * Run at RENDER time as well as at `add`: `~/.lattice/packages` is a plain folder, and a
 * package unzipped into it by hand, or a `--packages` folder, never went through `add`.
 */

const { firstRefusal } = require('./import-gate.js');
const { gateThemeCss } = require('../theme/gate.js');
const { gateCss } = require('../layout/gate.js');
const { galleryFindings } = require('./gallery-gate.js');
const { parseJsonCapped, MAX_JSON_VALUES } = require('./json-guard.js');

const TOO_MANY = `more than ${MAX_JSON_VALUES.toLocaleString('en-US')} values`;

/**
 * Why a package is refused, or null when it may be used. `pkg` is a spine read (read.js).
 *
 * `forRender` skips a component's sample slide. The render path embeds an installed
 * component's CSS and never its gallery, and rendering every installed gallery through the
 * engine on every deck render would cost the deck for nothing. `add`, `check` and `list`
 * check it, so nothing is installed or listed as usable with a gallery that fetches.
 * @param {object} pkg
 * @param {{ forRender?: boolean }} [opts]
 * @returns {string|null}
 */
function refusePackage(pkg, { forRender = false } = {}) {
  if (pkg.code) return 'it carries code (a script file), and code packages are not supported yet — they need a consent prompt and a sandbox (portable-packages §3.5)';
  const text = (role) => {
    const f = pkg.roles[role];
    const v = f ? pkg.files[f] : '';
    return typeof v === 'string' ? v : v ? Buffer.from(v).toString('utf8') : '';
  };
  let no = null;
  if (pkg.type === 'theme') no = firstRefusal(gateThemeCss(text('css')).findings, pkg.name);
  else if (pkg.type === 'component') {
    // The sample slide too: Insert makes it the user's own deck content (HARD RULE #22).
    const css = gateCss(text('styles.css'), pkg.name).findings;
    no = firstRefusal(forRender ? css : [...css, ...galleryFindings(text('gallery.md'))], pkg.name);
  }
  else {
    const role = pkg.type === 'finish' ? 'recipe.json' : 'scene.json';
    try {
      parseJsonCapped(text(role), TOO_MANY);
    } catch (e) {
      return e.message === TOO_MANY ? `${pkg.name}.${role} is too large to read (${TOO_MANY})` : `${pkg.name}.${role} is not valid JSON (${e.message})`;
    }
  }
  return no ? no.why : null;
}

/** Text safe to print to a terminal: control characters (an ESC sequence in a file name) become `?`. */
function printable(s) {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: stripping them is the point.
  return String(s).replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g, '?');
}

module.exports = { refusePackage, printable };
