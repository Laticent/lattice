/**
 * How a palette NAME is written for a human — the one derivation, in a module with no
 * React in it.
 *
 * WHY IT IS ITS OWN MODULE, and not two exports on `PaletteSelectItems.tsx` where the
 * `<SelectItem>`s that use it live (#1592, the shape #1495 established for the split's
 * storage contract): `SiteHeader.astro`'s pre-paint seed has to write the CURRENT palette's
 * label into the select's trigger before first paint, and it receives its values through
 * `define:vars` at build time. Importing them from `PaletteSelectItems` would drag
 * `components/ui/select`, radix-ui and React into the module graph of every page on the site
 * for one string function. So the derivation lives here, importing only the generated
 * catalog (itself dependency-free), and BOTH sides depend on it: the picker that lists the
 * palettes, and the seed that names the one already in force.
 */
import { isA11yPalette } from '@/lib/theme-catalog.generated';

/**
 * Clean display label: strip the `a11y-` prefix for a CURATED a11y palette (the group header
 * already says "Accessibility"), then title-case. "indaco" → "Indaco";
 * "a11y-achromatopsia" → "Achromatopsia".
 *
 * The strip is keyed on the palette's declared family, not on the string. A user's own theme
 * called `a11y-mine` is not one of the curated color-vision palettes, so it keeps its name
 * and sits with the brand themes — the two decisions now agree, where a raw prefix test made
 * them disagree.
 */
export const paletteLabel = (name: string) =>
	(isA11yPalette(name) ? name.replace(/^a11y-/, '') : name).replace(/(^|-)(\w)/g, (_m, sep, c) => (sep ? ' ' : '') + c.toUpperCase());

// US English is the house dialect (HARD RULE #21). This used to read "color-blindness",
// which is why ThemePicker carries its own US-spelled A11Y_LABEL; the two now agree.
export const A11Y_GROUP_LABEL = 'Accessibility · color-blindness';
