/**
 * @laticent/segno-markdown — the deck model: S0 (ingest) and S1 (the CommonMark block pass) of the Segno deck
 * pipeline, and the views every reader of a deck's structure asks for. Zero dependencies, no DOM, no Node.
 * engineering/decisions/2026-10-22-segno-deck-pipeline.md.
 */
export type { BlockParserOptions, BlockRuleFn, BlockState, BlockTape, ExtraBlockRule, LineIndex, TokenHandle } from './block.js';
export { BlockParser, CORE_KINDS, F_HIDDEN, F_SIDE, KIND, STRIDE, T_AUX, T_FLAGS, T_KIND, T_L0, T_L1, T_LEVEL, T_NEST } from './block.js';
export type { BlockRange, DeckModelOptions, EditSpan, Slide } from './deck.js';
export { DeckModel, deckModel, deckModelStats, diffSpan, ENGINE_FRONT_MATTER, ingest, spanHolds, updateDeckModel } from './deck.js';
