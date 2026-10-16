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
  // A plugin from outside the tree arrives as DATA (plugin-system §4.10): one fence, one renderer, its CSS.
  if (pkg.type === 'plugin') return refusePlugin(pkg);
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

/**
 * Why a plugin that arrives as data is refused, or null. The shape gate (`refusePluginCode`: one fence at most, its inline kinds, one
 * `render.js` in the export form, no `render.exec` / `payload` / `vendor`, only the data contribution points), the
 * syntax gate on its script as a FENCE renderer, a name no class Lattice uses starts with (the door adds ids and
 * classes in its own `lp-<name>` namespace), and a fence name that is neither a shipped plugin's nor a highlight.js
 * language or alias, which would take over every code block of that language, and no inline kind Lattice draws itself.
 */
function refusePlugin(pkg) {
  const shape = refusePluginCode(pkg);
  if (shape) return shape;
  const { COMPONENT_NAMES } = require('../core/resolve-component.js');
  const known = [...require('./reserved-classes.generated.js').names, ...COMPONENT_NAMES];
  const clash = codeNameRefusal(pkg.name, known);
  if (clash) return clash;
  const body = pkg.files[pkg.roles['render.js']];
  const syntax = codeSyntaxRefusal(typeof body === 'string' ? body : Buffer.from(body).toString('utf8'), { fence: true });
  if (syntax) return syntax;
  const fence = Object.keys(pkg.manifest.contributes.fences ?? {})[0];
  const data = require('./fence-door.generated.json');
  if (fence && data.shippedFences.includes(fence)) return `its fence \`${fence}\` is one a shipped plugin owns`;
  if (fence && data.highlightLanguages.includes(fence)) return `its fence \`${fence}\` is a code language Lattice highlights, so it would take over every ${fence} block`;
  // An inline kind Lattice draws itself (2026-10-14-plugin-inline-door.md §6): `@icon{…}` is the icons plugin's.
  const taken = pluginInlineKinds(pkg.manifest).find((k) => data.shippedKinds.includes(k));
  if (taken) return `its inline kind \`@${taken}{…}\` is one Lattice already draws`;
  return inlineSlotCompileRefusal(pkg.manifest);
}

/**
 * Why a plugin's declared inline `slot` does not compile, or null: compiled ONCE, here and in the Studio's import, so a
 * slot Segno refuses is refused by name at the door rather than read as nothing on every render (the inversion lens).
 * `slotRefusal` (the shape gate) has already bounded what compiling costs.
 */
function inlineSlotCompileRefusal(manifest) {
  const { compileSlot } = require('../core/segno-spec.js');
  for (const { name, slot } of pluginKindPins(manifest)) {
    if (!slot) continue;
    try {
      compileSlot(slot, `${name}.slot`);
    } catch (e) {
      return `its inline kind ${name}'s slot does not compile: ${String(e?.message ?? e).slice(0, 200)}`;
    }
  }
  return null;
}

// The one shape a code package may take is the door's shared kernel's to say, so the Studio's
// Library import refuses exactly what `lattice packages add` refuses (HARD RULE #1).
const { refuseCode, refusePluginCode, codeNameRefusal, MAX_TRANSFORM_CHARS, pluginInlineKinds, pluginKindPins } = require('./code-door-core.mjs');

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

module.exports = { inlineSlotCompileRefusal, refusePackage, refusePlugin, refuseCode, printable, printableLine, MAX_TRANSFORM_CHARS };
