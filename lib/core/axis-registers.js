/**
 * lib/core/axis-registers.js — every AXIS register, first-party and plugin-declared, as one list
 * both render paths walk (HARD RULE #1).
 *
 Every axis register is a plugin's, declared as data (`contributes.registers`,
 * lib/plugins/registers.generated.js) and built by one factory (lib/core/register-factory.js), so
 * `icon: bare` stamps `icon-bare` exactly as `spark: bare` stamps `spark-bare`, and a slide's own
 * `icon-*` word evicts the deck's on that axis only. (`spark:` was the host's own until the sparks
 * plugin took it, 2026-10-16.)
 * Data only on the plugin side: a register is a key and its axes' words, never code.
 */

const { makeRegister } = require('./register-factory');
const { LOGO_STYLE_REGISTER } = require('./resolve-logo-style');
const { PLUGIN_REGISTERS } = require('../plugins/registers.generated.js');

/** Plugin registers, each with the plugin that declared it. */
const PLUGIN_AXIS_REGISTERS = Object.freeze(PLUGIN_REGISTERS.map((r) => Object.freeze({ ...makeRegister(r.key, r.axes), plugin: r.plugin })));
/** Every axis register: the plugins', plus the host's one — the deck logo's `logo-style:`. */
const AXIS_REGISTERS = Object.freeze([...PLUGIN_AXIS_REGISTERS, LOGO_STYLE_REGISTER]);

/** Every class token any axis register stamps. */
const AXIS_REGISTER_TOKENS = Object.freeze(AXIS_REGISTERS.flatMap((r) => r.TOKENS));

/** `<key>:<axis>` for a register token (`icon-bare` → `icon:frame`), or ''. Qualified by key, so
 *  a slide's `spark-bare` never evicts the deck's `icon-*` frame. */
function axisRegisterTokenAxis(t) {
  for (const r of AXIS_REGISTERS) {
    const axis = r.tokenAxis(t);
    if (axis) return `${r.key}:${axis}`;
  }
  return '';
}

/** A front-matter body → every axis register's class tokens, in the plugins' dependency order. */
function axisRegisterClassesFromFrontMatter(fm) {
  return AXIS_REGISTERS.flatMap((r) => r.classesFromFrontMatter(fm));
}

module.exports = { AXIS_REGISTERS, PLUGIN_AXIS_REGISTERS, AXIS_REGISTER_TOKENS, axisRegisterTokenAxis, axisRegisterClassesFromFrontMatter };
