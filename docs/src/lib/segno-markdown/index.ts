/**
 * @laticent/segno-markdown — the deck model: S0 (ingest) and S1 (the CommonMark block pass) of the Segno deck
 * pipeline, and the views every reader of a deck's structure asks for. Zero dependencies, no DOM, no Node.
 * engineering/decisions/2026-10-22-segno-deck-pipeline.md.
 */
export type { BlockParserOptions, BlockRuleFn, BlockState, BlockTape, ExtraBlockRule, LineIndex, RefRecord, TokenHandle } from './block.js';
export { BlockParser, COL_SHIFT, CORE_KINDS, F_CLOSED, F_HIDDEN, F_SIDE, KIND, releaseScratch, STRIDE, T_AUX, T_FLAGS, T_KIND, T_L0, T_L1, T_LEVEL, T_NEST } from './block.js';
export type { BlockRange, DeckModelOptions, EditSpan, Slide } from './deck.js';
export { DeckModel, deckModel, deckModelStats, diffSpan, ENGINE_FRONT_MATTER, ingest, isCell, slideDetail, spanHolds, updateDeckModel } from './deck.js';
export type { ExtraInlineRule, InlineParserOptions, InlineRuleFn, InlineSide, InlineState, InlineTape, InlineTokenHandle } from './inline.js';
export {
	defaultLinkOk,
	F_EMPTY,
	F_ISIDE,
	F_LINK_TEXT,
	I_AUX,
	I_FLAGS,
	I_FROM,
	I_KIND,
	I_LEVEL,
	I_NEST,
	I_TO,
	IKIND,
	INLINE_KINDS,
	InlineParser,
	ISTRIDE,
	isEscapable,
	L_CHILD,
	L_DEST0,
	L_DEST1,
	L_REF,
	L_TITLE0,
	L_TITLE1,
	L_TYPE,
	LINK_AUTO,
	LINK_EMAIL,
	LINK_INLINE,
	LINK_REF,
	LSTRIDE,
	normalizeReference,
	SPECIAL_ENTITY,
	SPECIAL_ESCAPE,
} from './inline.js';
export type { LeafText, Reference, References } from './model-inline.js';
export { inlineOf, leafText, leafToBody, RSTRIDE, referencesOf, slideLeaves } from './model-inline.js';
export { isPunct, isWhiteSpace } from './punct.js';
