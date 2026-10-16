// What separates a TAP on a collage photo from the end of a DRAG, shared by every host that
// turns a click into "open this photo". Pure and import-free, so the Studio can load it at
// startup without pulling in the lightbox itself (which loads on the first click).
//
// A browser still fires `click` when a mouse press ends somewhere else in the same element, so a
// drag across a `bleed` slide (where tiles cover the slide) would otherwise open the photo the
// drag ends on. A click whose pointer travelled more than the slop is not a tap.

/** Pointer travel, in CSS px (|dx| + |dy|), past which a click is the end of a drag. */
export const COLLAGE_TAP_SLOP = 8;

/**
 * @param {{x:number, y:number}|null|undefined} down where the pointer went down, or nothing if unknown
 * @param {number} x where the click landed
 * @param {number} y
 * @returns {boolean} true when the pointer travelled past the slop since `down`
 */
export function collageDragged(down, x, y) {
	return !!down && Math.abs(x - down.x) + Math.abs(y - down.y) > COLLAGE_TAP_SLOP;
}
