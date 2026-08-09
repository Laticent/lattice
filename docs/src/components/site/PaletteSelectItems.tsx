import { SelectGroup, SelectItem, SelectLabel } from '@/components/ui/select';
import { isA11yPalette } from '@/lib/theme-catalog.generated';

// Clean display label: strip the `a11y-` prefix for a CURATED a11y palette (the group
// header already says "Accessibility"), then title-case. "indaco" → "Indaco";
// "a11y-achromatopsia" → "Achromatopsia".
//
// The strip is keyed on the palette's declared family, not on the string. A user's own
// theme called `a11y-mine` is not one of the curated color-vision palettes, so it keeps
// its name and sits with the brand themes — the two decisions now agree, where a raw
// prefix test made them disagree.
export const paletteLabel = (name: string) =>
	(isA11yPalette(name) ? name.replace(/^a11y-/, '') : name).replace(/(^|-)(\w)/g, (_m, sep, c) => (sep ? ' ' : '') + c.toUpperCase());

// US English is the house dialect (HARD RULE #21). This used to read "colour-blindness",
// which is why ThemePicker carries its own US-spelled A11Y_LABEL; the two now agree.
export const A11Y_GROUP_LABEL = 'Accessibility · color-blindness';

/**
 * The ONE shared rendering of palette `<SelectItem>`s, so every picker (the
 * chrome-wide PaletteControls AND the Drawing Board topbar) lists themes
 * identically: the brand palettes first (in their given order), then a single
 * labelled "Accessibility" group for the curated color-vision-deficiency
 * themes at the END — regardless of where a11y sorts in the input array. An a11y
 * palette is just a theme; this only governs presentation.
 *
 * WHICH THEMES ARE a11y IS DECLARED, NOT SNIFFED. This used to split the list with
 * `p.startsWith('a11y-')`. That was the tenth place in the repo deciding theme scope by
 * its own private rule, and the last one still doing it by filename — a convention no
 * gate can check, which mis-groups any user theme named like one of ours. The family
 * now comes from `themes/<name>.manifest.json` via the generated catalog, and
 * `checkThemeRoles` proves that declaration against the theme file itself. See
 * engineering/decisions/2026-08-09-theme-token-contract.md.
 */
export function PaletteSelectItems({ palettes }: { palettes: string[] }) {
	const brand = palettes.filter((p) => !isA11yPalette(p));
	const a11y = palettes.filter((p) => isA11yPalette(p));
	return (
		<>
			{brand.map((p) => (
				<SelectItem key={p} value={p}>
					{paletteLabel(p)}
				</SelectItem>
			))}
			{a11y.length > 0 && (
				<SelectGroup>
					<SelectLabel>{A11Y_GROUP_LABEL}</SelectLabel>
					{a11y.map((p) => (
						<SelectItem key={p} value={p}>
							{paletteLabel(p)}
						</SelectItem>
					))}
				</SelectGroup>
			)}
		</>
	);
}
