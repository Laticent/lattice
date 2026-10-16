/**
 * lib/core/axis-registers.js — every AXIS register, first-party and plugin-declared, as one list
 * both render paths walk (HARD RULE #1).
 *
 * `spark:` is the host's own (lib/core/resolve-spark.js). Each register a plugin declares as data
 * (`contributes.registers`, lib/plugins/registers.generated.js) is built by the same factory
 * (lib/core/register-factory.js), so `icon: bare` stamps `icon-bare` exactly as `spark: bare`
 * stamps `spark-bare`, and a slide's own `icon-*` word evicts the deck's on that axis only.
 * Data only on the plugin side: a register is a key and its axes' words, never code.
 */

const { SPARK } = require('./resolve-spark');
const { makeRegister } = require('./register-factory');
const { PLUGIN_REGISTERS } = require('../plugins/registers.generated.js');

/** Plugin registers, each with the plugin that declared it. */
const PLUGIN_AXIS_REGISTERS = Object.freeze(PLUGIN_REGISTERS.map((r) => Object.freeze({ ...makeRegister(r.key, r.axes), plugin: r.plugin })));
/** Every axis register, the host's first. */
const AXIS_REGISTERS = Object.freeze([SPARK, ...PLUGIN_AXIS_REGISTERS]);

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

/** A front-matter body → every axis register's class tokens, the host's first. */
function axisRegisterClassesFromFrontMatter(fm) {
  return AXIS_REGISTERS.flatMap((r) => r.classesFromFrontMatter(fm));
}

module.exports = { AXIS_REGISTERS, PLUGIN_AXIS_REGISTERS, AXIS_REGISTER_TOKENS, axisRegisterTokenAxis, axisRegisterClassesFromFrontMatter };
