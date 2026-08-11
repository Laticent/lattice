import { SelectGroup, SelectItem, SelectLabel } from '@/components/ui/select';
// The label derivation moved to a React-free module so `SiteHeader.astro`'s pre-paint seed
// can import it without dragging this file's radix/React graph onto every page (#1592).
// Re-exported here because a dozen call sites already reach for it through this module, and
// splitting the import surface would be churn for its own sake.
import { A11Y_GROUP_LABEL, paletteLabel } from '@/lib/palette-label';
import { isA11yPalette } from '@/lib/theme-catalog.generated';

export { A11Y_GROUP_LABEL, paletteLabel };

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
