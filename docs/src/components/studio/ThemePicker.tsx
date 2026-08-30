import { Check } from 'lucide-react';
import { paletteLabel } from '@/components/site/PaletteSelectItems';
import { DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { CatalogGroup } from './CatalogSelect';

// The Studio theme picker — every shipped theme, grouped, shared by the topbar
// menu and the Inspector. The groups mirror how the deck author thinks about
// them: the curated core, your own Fabricated themes, the AA color-blind-safe
// set (a real accessibility investment, not optional), then the rest of the
// shipped palettes. REUSE (#15): `paletteLabel` is the same label formatter the
// site-wide PaletteControls use; the engine fetches any of these by name.

// The palette-name lists live in the dependency-free ./palettes module (so the
// pre-paint seed script in studio.astro can import the SAME source without pulling in
// this React component). Imported for local use here AND re-exported so existing
// importers (StudioShell, PaletteControls, …) are unaffected. A Fabricated theme is
// NOT here — it has no on-disk CSS and renders via extraTheme.
// PALETTE_DOTS comes from the same module now: both the grouping and each palette's
// swatch are generated from themes/*.manifest.json, so the pair cannot drift. They
// used to be two hand-kept lists here and in ./palettes, reconciled only by a test.
import { A11Y_THEMES, BUILTIN_PALETTES, CURATED, MORE_THEMES, PALETTE_DOTS } from './palettes';

export { A11Y_THEMES, BUILTIN_PALETTES, CURATED, MORE_THEMES, PALETTE_DOTS };
// US-English label; HARD RULE #21. (Historic note: the shared site label once used
// the British spelling, which is why this file carried its own. They now agree.)
export const A11Y_LABEL = 'Accessibility · color-blind safe';

export type SavedTheme = { id: string; name: string; label: string; accent?: string };

function Dot({ color }: { color: string }) {
	return <span className="size-3.5 shrink-0 rounded-full border border-[color-mix(in_srgb,var(--text-heading)_18%,transparent)]" style={{ background: color }} />;
}

function ThemeItem({ name, label, color, active, onPick }: { name: string; label: string; color: string; active: boolean; onPick: (n: string) => void }) {
	return (
		<DropdownMenuItem onSelect={() => onPick(name)} className={cn('gap-2', active && 'font-semibold')}>
			<Dot color={color} />
			<span className="truncate">{label}</span>
			{active && <Check className="ml-auto size-3.5 text-[var(--accent)]" />}
		</DropdownMenuItem>
	);
}

/**
 * The grouped theme list, rendered inside any `<DropdownMenuContent>`: Curated →
 * your Fabricated themes (if any) → the AA color-blind-safe set → the rest.
 */
export function ThemeMenuItems({ palette, onPick, saved }: { palette: string; onPick: (name: string) => void; saved: SavedTheme[] }) {
	return (
		<>
			<DropdownMenuLabel className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Curated</DropdownMenuLabel>
			{CURATED.map((p) => <ThemeItem key={p} name={p} label={paletteLabel(p)} color={PALETTE_DOTS[p]} active={p === palette} onPick={onPick} />)}
			{saved.length > 0 && (
				<>
					<DropdownMenuSeparator />
					<DropdownMenuLabel className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Your themes</DropdownMenuLabel>
					{saved.map((t) => <ThemeItem key={t.id} name={t.name} label={t.label} color={t.accent ?? 'var(--accent)'} active={t.name === palette} onPick={onPick} />)}
				</>
			)}
			<DropdownMenuSeparator />
			<DropdownMenuLabel className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{A11Y_LABEL}</DropdownMenuLabel>
			{A11Y_THEMES.map((p) => <ThemeItem key={p} name={p} label={paletteLabel(p)} color={PALETTE_DOTS[p]} active={p === palette} onPick={onPick} />)}
			<DropdownMenuSeparator />
			<DropdownMenuLabel className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">More themes</DropdownMenuLabel>
			{MORE_THEMES.map((p) => <ThemeItem key={p} name={p} label={paletteLabel(p)} color={PALETTE_DOTS[p]} active={p === palette} onPick={onPick} />)}
		</>
	);
}

/** The label + dot for the currently-active palette (for a trigger button). */
export function activePaletteLabel(palette: string, saved: SavedTheme[]): { label: string; color: string } {
	const s = saved.find((t) => t.name === palette);
	if (s) return { label: s.label, color: s.accent ?? 'var(--accent)' };
	return { label: paletteLabel(palette), color: PALETTE_DOTS[palette] ?? 'var(--accent)' };
}

/** The grouped theme options (round accent dots) for a CatalogSelect — the same
 *  Curated → your themes → AA color-blind-safe → More grouping as the topbar
 *  ThemeMenuItems, so the Inspector's theme field and the topbar menu read from
 *  ONE source. The caller prepends any head (e.g. the deck's "Automatic"). */
export function themeSelectGroups(saved: SavedTheme[] = []): CatalogGroup[] {
	const groups: CatalogGroup[] = [
		{ label: 'Curated', options: CURATED.map((p) => ({ value: p, label: paletteLabel(p), swatch: { background: PALETTE_DOTS[p] } })) },
	];
	if (saved.length > 0) {
		groups.push({ label: 'Your themes', options: saved.map((t) => ({ value: t.name, label: t.label, swatch: { background: t.accent ?? 'var(--accent)' } })) });
	}
	groups.push({ label: A11Y_LABEL, options: A11Y_THEMES.map((p) => ({ value: p, label: paletteLabel(p), swatch: { background: PALETTE_DOTS[p] } })) });
	groups.push({ label: 'More themes', options: MORE_THEMES.map((p) => ({ value: p, label: paletteLabel(p), swatch: { background: PALETTE_DOTS[p] } })) });
	return groups;
}
