/**
 * PALETTE SWEEP on `gallery-jargon` — every shipped palette, rendered once and re-themed in place.
 * The suite, its decks and its ceilings live in `palette-sweep.suite.js`; this file runs it
 * for one deck so the sweep can land on a different runner of the sharded integration job.
 */
require('./palette-sweep.suite.js').defineSweep('gallery-jargon');
