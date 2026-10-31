/**
 * lib/plugin-kit/slots.js — the plugin kit's slot specs: the compiler for the compact grammar a drawn
 * mark's slots are written in (lib/core/segno-spec.js), and the record shapes the engine defines once
 * and the plugins that write those records compile (a pill's `{LABEL, shape, c4}`, a spark's series;
 * lib/core/segno-slots.js). A plugin reaches them only through here
 * (engineering/decisions/2026-10-11-codebase-structure.md §5).
 */

const { compileSlot } = require('../core/segno-spec.js');
const { coreSlot, CORE } = require('../core/segno-slots.js');

module.exports = { compileSlot, coreSlot, CORE };
