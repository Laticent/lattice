// Fuoco — one focus for every view of a document. Where the reader is (unit, part, page,
// caret, picked element), and who needs to hear that it moved. See README.md.
//
// The core imports nothing outside this folder. A host plugs in its own document model as an
// OUTLINER: ./text-outline.ts covers plain text and Markdown; Lattice's slide outliner lives in
// docs/src/lib/deck-outline. The React adapter is `fuoco/react`.

export type { Cause, ElementAddr, Focus, FocusHub, FocusHubOptions, HubStats, Lane, Origin, Scheduler, StepAction, StepOptions, SubscribeOptions, Target } from './hub.js';
export { createFocusHub, revealOffset } from './hub.js';
export type { EditSpan, Kinds, Outline, Outliner, PartRef, Unit, UnitId } from './outline.js';
export { carryIds, diffSpan, flatPart, mapOffset, nextRevision, nextUnitId, partAt, partBaseOf, partCount, partEnd, partOfFlat, partStart, partText, spanHolds, unitAt, unitIndexOf, unitText } from './outline.js';
export type { Extent, Place } from './place.js';
export { extentOf, lineAt, lineCount, lineEnd, offsetAt, placeAt, rangeOf } from './place.js';
export type { TextOutlinerOptions } from './text-outline.js';
export { byBlankLines, byHeadings, byPattern, createTextOutliner } from './text-outline.js';
