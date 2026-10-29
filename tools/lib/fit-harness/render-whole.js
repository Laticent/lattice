#!/usr/bin/env node
/**
 * render-whole — run the CLI with the structural split switched off, so every slide renders
 * whole at its box and venue. The fit harness measures the fit-first policy on this render:
 * a policy that splits only on a measured overflow has to start from the unsplit slide.
 *
 *   node tools/lib/fit-harness/render-whole.js <deck.md> <out.html> [CLI flags…]
 *
 * It replaces `structuralSplit` in the module cache before lattice.js loads, so the CLI's own
 * call gets the slides back numbered and unsplit; nothing else in the export changes.
 */
const path = require('node:path');
const ss = require('../../../lib/core/structural-split');

ss.structuralSplit = (html) => ({ html: ss.stampSlideNumbers(html, 1), changed: 0, applies: false });
process.argv.splice(1, 1, path.join(__dirname, '../../../lattice.js'));
require('../../../lattice.js');
