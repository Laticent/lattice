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
  // Plugins are in-tree only until the data layer ships (plugin-system §4.10, §7 phase E), so a
  // plugin from outside the tree is refused by name, not by whatever its files trip first.
  if (pkg.type === 'plugin') return 'plugin packages cannot be installed yet — only the plugins that ship with Lattice run until the plugin data layer lands (plugin-system §7 phase E)';
  if (pkg.code) {
    const why = refuseCode(pkg) ?? codeSyntaxRefusal(codeOf(pkg));
    if (why) return why;
  }
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

// The one shape a code package may take is the door's shared kernel's to say, so the Studio's
// Library import refuses exactly what `lattice packages add` refuses (HARD RULE #1).
const { refuseCode, MAX_TRANSFORM_CHARS } = require('./code-door-core.mjs');

// The syntax half (a dynamic `import()`), parsed with acorn: its own module, because the shape half
// is in the site's eager bundle and acorn is not (code-syntax.mjs).
const { codeSyntaxRefusal } = require('./code-syntax.mjs');
const codeOf = (pkg) => {
  const body = pkg.files[pkg.roles['transform.js']];
  return typeof body === 'string' ? body : Buffer.from(body).toString('utf8');
};

// One copy of the terminal-safety helpers, in the door's shared kernel (the Studio's door uses them
// too); re-exported here, where every CLI caller has always found `printable`.
const { printable, printableLine } = require('./code-door-core.mjs');

module.exports = { refusePackage, refuseCode, printable, printableLine, MAX_TRANSFORM_CHARS };
