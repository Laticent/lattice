/**
 * lib/plugin-kit/slots.js — the plugin kit's slot-spec compiler (the compact grammar a drawn
 * mark's slots are written in, lib/core/segno-spec.js). A plugin reaches it only through here
 * (engineering/decisions/2026-10-11-codebase-structure.md §5).
 */

const { compileSlot } = require('../core/segno-spec.js');

module.exports = { compileSlot };
