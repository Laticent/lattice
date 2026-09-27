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
  if (pkg.code) {
    const why = refuseCode(pkg);
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

// A script file of any spelling, as the spine counts code (read.js SCRIPT_RE).
const SCRIPT_RE = /\.(?:[cm]?jsx?|[cm]?tsx?|wasm)$/i;

/**
 * The largest `transform.js` a door runs. The locked page carries the script in a `data:` URL
 * that Chromium caps at 2 MB and that runs about 1.9 times the script (lib/core/code-sandbox.js
 * MAX_DOC_BYTES), so a bigger one could never load; refusing it here says so at `add`, not at a
 * render. The largest bundle measured is `map`, 234 KB.
 */
const MAX_TRANSFORM_CHARS = 1_000_000;

/**
 * Why a package that carries code is refused, or null when its code may be offered for consent
 * (contract note §9). Consent is a separate question (lib/packages/trust.js): this decides only
 * whether the code is the ONE shape a door can run.
 *   - only a component carries code; a theme, finish or motion package with a script is refused;
 *   - the one script is `<name>.transform.js`: any other script in the folder is refused, so
 *     nothing rides along that consent did not cover;
 *   - the transform ends the way the export writes it (`export { name as default }`), which is the
 *     only shape the runner accepts (lib/core/code-sandbox.js packageScript);
 *   - it fits in the locked page.
 */
function refuseCode(pkg) {
  if (pkg.type !== 'component') return `it carries code (a script file), and only a component may: a ${pkg.type} package is data`;
  const transform = pkg.roles['transform.js'];
  const extra = Object.keys(pkg.files).filter((f) => SCRIPT_RE.test(f) && f !== transform);
  if (extra.length) return `it carries a script other than ${pkg.name}.transform.js (${extra.join(', ')}); a code package holds exactly one`;
  if (!transform) return 'it carries code but no transform.js';
  const body = pkg.files[transform];
  const code = typeof body === 'string' ? body : Buffer.from(body).toString('utf8');
  if (code.length > MAX_TRANSFORM_CHARS) return `its transform.js is ${code.length.toLocaleString('en-US')} characters, past the ${MAX_TRANSFORM_CHARS.toLocaleString('en-US')} a code package may carry`;
  try {
    require('../core/code-sandbox.js').packageScript(code);
  } catch {
    return 'its transform.js does not end in `export { name as default }`, the one shape a code package runs in (bundle it as an ES module with one default export)';
  }
  return null;
}

// One copy of the terminal-safety helpers, in the door's shared kernel (the Studio's door uses them
// too); re-exported here, where every CLI caller has always found `printable`.
const { printable, printableLine } = require('./code-door-core.mjs');

module.exports = { refusePackage, refuseCode, printable, printableLine, MAX_TRANSFORM_CHARS };
