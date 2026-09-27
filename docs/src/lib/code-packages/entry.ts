// THE DOOR'S FRONT STEP: the one piece of the code-package door the Studio loads at startup.
//
// Most decks use no code package, and most Libraries hold none, so the door itself (door.ts, its
// state and its notice's status) loads on the first code package the Library holds, and the part
// that runs packages (door-run.ts) on the first render that meets one. Until then a render is
// exactly `PG.render` (docs/route-budget.json holds the Studio's first load to its bytes).

import type { Renderer } from './door';

type Door = typeof import('./door');
let door: Door | null = null;
let loading: Promise<Door> | null = null;
const load = () => {
	loading ??= import('./door').then((m) => {
		door = m;
		return m;
	});
	return loading;
};

/** The Library's code packages (door.ts `setCodePackages`); an empty list loads nothing. */
export async function setCodePackages(list: { name: string; code: string }[]): Promise<void> {
	if (!list.length && !door) return;
	await (await load()).setCodePackages(list);
}

/** door.ts `codePackagesStamp`: empty until the door has loaded, as it is with no package. */
export function codePackagesStamp(): string {
	return door ? door.codePackagesStamp() : '';
}

/** door.ts `renderWithCodePackages`; before the door loads, the engine's render without the door's flag. */
export async function renderWithCodePackages<R extends { html: string }>(PG: Renderer, source: string, theme: string, opts: Record<string, unknown> | undefined): Promise<R> {
	if (door) return door.renderWithCodePackages<R>(PG, source, theme, opts);
	let engineOpts = opts;
	if (opts && 'codeStatus' in opts) {
		const { codeStatus: _flag, ...rest } = opts;
		engineOpts = rest;
	}
	return PG.render(source, theme, engineOpts) as R;
}
