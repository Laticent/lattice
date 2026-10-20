// THE SPECTRUM RIBBON, REPAINTED FOR A CAPTURE — a pure function of a section's computed style.
//
// The spectrum ribbon is a `border-top` whose `border-image-source` is a linear-gradient. html-to-image inlines that
// computed border-image and MIS-RENDERS it — filling the gradient across the whole element instead of the border strip.
// So:
//   - Bookend slides (title/closing/divider) carry the spectrum as an INERT border (`border-top:none`) over a solid
//     canvas — html-to-image would fill it and bury the canvas. Just drop the border-image.
//   - Content slides carry a REAL ~12px ribbon — left alone it fills the whole slide with rainbow, burying the content.
//     Repaint it as a top background strip (html-to-image renders gradient BACKGROUNDS correctly) and make the now-blank
//     border transparent. Layout is unchanged (the border keeps its width), so this is invisible in the preview and
//     faithful in the export.
//
// Returns the inline style properties to set, or {} when the section has no gradient border. Two callers: the export's
// `withCaptureFixups` (deck-export.js) writes them onto its offscreen section for the capture and restores them after;
// the slide map's poster capture (studio/pool-capture.ts) passes them as html-to-image's `style`, which styles only the
// clone, because its section is a live tile the reader can see.

/**
 * @param {CSSStyleDeclaration} cs the section's computed style
 * @returns {Partial<Record<'borderImageSource'|'borderTopColor'|'backgroundImage'|'backgroundRepeat'|'backgroundPosition'|'backgroundSize'|'backgroundOrigin', string>>}
 */
export function ribbonCaptureStyle(cs) {
	const borderless = parseFloat(cs.borderTopWidth) === 0 || cs.borderTopStyle === 'none';
	const hasGradientBorder = cs.borderImageSource && cs.borderImageSource !== 'none';
	if (!hasGradientBorder) return {};
	if (borderless) return { borderImageSource: 'none' };
	const grad = cs.borderImageSource;
	const tw = cs.borderTopWidth;
	// Layer the ribbon gradient as a top strip OVER the slide's own background (preserved — a canvas color rides on
	// background-color, untouched here; an image canvas is kept as the second layer).
	const baseImg = cs.backgroundImage && cs.backgroundImage !== 'none' ? cs.backgroundImage : '';
	return {
		backgroundImage: baseImg ? `${grad}, ${baseImg}` : grad,
		backgroundRepeat: baseImg ? `no-repeat, ${cs.backgroundRepeat}` : 'no-repeat',
		backgroundPosition: baseImg ? `top left, ${cs.backgroundPosition}` : 'top left',
		backgroundSize: baseImg ? `100% ${tw}, ${cs.backgroundSize}` : `100% ${tw}`,
		// Anchor the strip to the BORDER box, i.e. the band the real ribbon occupies. From the default padding box it sat
		// just inside the border, under the finish's `.backdrop` (a padding-box child), so a backdrop mask or veil painted
		// over it: `backdrop: clear` erased the ribbon wherever the clearance ellipse reached the top edge (#2388).
		backgroundOrigin: baseImg ? `border-box, ${cs.backgroundOrigin}` : 'border-box',
		borderImageSource: 'none',
		borderTopColor: 'transparent',
	};
}
