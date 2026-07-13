import type { CatalogGroup, CatalogOption } from './CatalogSelect';
import { activeFinish, FINISHES, type FinishEntry } from './finish-catalog';

// Finish selector helpers — the ONE finish picker (a CatalogSelect) is shared by
// the deck Inspector AND the slide Inspector (HARD RULE #15). This module supplies
// the shared option groups (with swatch previews) both sides feed to CatalogSelect;
// the DropdownMenu-based FinishMenuItems it used to also export is retired now that
// both surfaces render the same Select.

// A saved (Fabricated) finish, shaped for the picker. Its `name` is NOT in the
// engine FINISH_REGISTER, so it renders via injected CSS + an applied class (the
// consumption loop in StudioShell), not the `finish:` register.
export type SavedFinishMenuEntry = { id: string; name: string; label: string; swatch?: { background: string; backgroundSize?: string } };

/**
 * Shared finish option groups for the CatalogSelect — used by BOTH the deck
 * Inspector and the slide Inspector, so the finish selector is ONE component,
 * swatches and all. `heads` are the caller's leading options (deck: None; slide:
 * Inherit + None) with their own value convention; `savedValue` maps a saved
 * finish's slug to that convention (the deck writes the `finish-<slug>` register
 * token, the slide writes the bare slug as a per-slide class). Presets carry their
 * catalog swatch; saved finishes carry the generated recipe swatch the caller passes in.
 */
export function finishSelectGroups({
	heads, saved = [], savedValue,
}: { heads: CatalogOption[]; saved?: SavedFinishMenuEntry[]; savedValue: (slug: string) => string }): CatalogGroup[] {
	const presets = FINISHES.filter((f) => f.group === 'finish').map(
		(f): CatalogOption => ({ value: f.name, label: f.label, swatch: f.swatch }),
	);
	const groups: CatalogGroup[] = [{ options: heads }, { label: 'Finishes', options: presets }];
	if (saved.length > 0) {
		groups.push({
			label: 'Saved',
			options: saved.map((s): CatalogOption => ({
				value: savedValue(s.name),
				label: s.label,
				swatch: s.swatch ?? { background: 'var(--accent-soft, var(--bg))' },
			})),
		});
	}
	return groups;
}

/** The catalog swatch for a built-in finish name (or the deck default), for a
 *  caller building its own head option (e.g. the slide's "Inherit — <deck>"). */
export function finishSwatchFor(name: string | undefined | null): FinishEntry['swatch'] {
	return activeFinish(name).swatch;
}
