#!/usr/bin/env node
/**
 * fit-grace — for every slide that clips, the smallest `claim` that makes it fit, checked by rendering.
 * The logic lives in lib/cli/fit-grace.js, which the CLI export also calls under its overflow warnings.
 *
 * Usage:
 *   node tools/fit-grace.js <deck.md> [palette] [--json]
 * Exit 0 always; it advises, it does not gate.
 */
'use strict';

const { main } = require('../lib/cli/fit-grace.js');

process.exit(main(process.argv.slice(2)));
