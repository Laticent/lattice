/**
 * lib/core/deck-vocabulary.js — how the engine reads a deck's SLIDES from its source, handed to a bake through its ctx
 * (`ctx.vocabulary.deck`; 2026-11-01-plugin-contract-hollywood.md §4). A bake works on the whole deck source, so it
 * needs to know which slide a fence sits on, that slide's class, and the color band the engine gives it. Those are the
 * engine's answers, so the plugin asks for them rather than parsing slides itself. Node only (a bake runs in the CLI).
 */
const { slideClassSpans, slideClassAt, slideIndexAt } = require('./slide-class-spans');
const { resolveDiagramBand } = require('./diagram-band');

module.exports = Object.freeze({ slideClassSpans, slideClassAt, slideIndexAt, resolveDiagramBand });
