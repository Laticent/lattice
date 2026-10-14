// The plugin set the lint core's boundary parser should leave off, held OUTSIDE the lint core so the
// Studio can set it before the lint core has loaded (the lint core loads after first paint, through
// authoring-door.js). `src/lib/plugin-admission.ts` writes it; the door adopts it the moment the lint
// core evaluates, before any caller gets the module, so no reader ever parses on a stale grammar.
//
// Why not "remember it and apply on first use": an earlier checker rejected that shape, because a
// reader that loaded the lint core before the editor's own lint pass parsed on the default grammar.
// Applying at module evaluation closes that gap: the door is the only way in, and it switches first.

/** @type {string[]} */
let off = [];
/** @type {((off: string[]) => void) | null} */
let lintSetter = null;

/** Point the lint core's boundary parser at this `off` set, now if it is loaded, else on load. */
export function setLintBoundaryOff(next) {
	off = next;
	if (lintSetter) lintSetter(off);
}

/** Called once by authoring-door.js as the lint core evaluates. */
export function adoptLintBoundarySetter(setter) {
	lintSetter = setter;
	setter(off);
}
