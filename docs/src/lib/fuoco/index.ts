// Fuoco — the Studio's focus hub. Where the author's focus is (slide, page, caret, preview
// element) and who needs to hear that it moved. See README.md and
// engineering/decisions/2026-10-15-fuoco-focus-sync.md.

export type { Chunk, ChunkId, DeckIndex, EditSpan, SectionRef } from './deck-index';
export { buildDeckIndex, chunkAt, chunkIndexOf, chunkText, flatSection, sectionAt, sectionEditableOffset, sectionEnd, sectionOfFlat, sectionStart, sectionText, updateDeckIndex } from './deck-index';
export type { Cause, ElementAddr, Focus, FocusHub, Lane, Origin, Scheduler, SubscribeOptions, Target } from './hub';
export { createFocusHub, revealOffset } from './hub';
