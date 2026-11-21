// THE DOOR'S FRONT STEP: the one piece of the code-package door the Studio loads at startup.
//
// Most decks use no code package, and most Libraries hold none, so the door itself (door.ts, its
// state and its notice's status) loads on the first code package the Library holds, and the part
// that runs packages (door-run.ts) on the first render that meets one. Until then a render is
// exactly `PG.render` (docs/route-budget.json holds the Studio's first load to its bytes).

import type { Renderer } from './door';
import type { Entry as WaitEntry } from './wait';

type Door = typeof import('./door');

/** What the Studio shows in a listed plugin's place before the plugin draws (wait.ts, D1). */
export type Waits = { withWaits: (source: string) => string; waitMarkup: (e: WaitEntry, body: string) => string | null; waitKey: (sha16: string, body: string) => string };
// Only the Studio sets it (StudioShell), so the other routes that render through here, and the door's own chunks, reach
// the placeholder code through this one reference and never carry it themselves.
let waits: Waits | null = null;
export function setWaits(w: Waits): void {
	waits = w;
}
export const getWaits = (): Waits | null => waits;

/** The event a preview fires each time it paints, with its document (wait-capture.ts records the plugin drawings). */
export const PREVIEW_PAINTED = 'lattice-preview-painted';

/**
 * The localStorage key that holds this browser's code-package and plugin approvals (door.ts). Here, in the eager entry,
 * so the Studio shell can hear an approval given in another tab (a `storage` event) without loading the door, and
 * without a chunk of its own on the Studio's first load (the route budget).
 */
export const CODE_APPROVALS_KEY = 'lattice-code-package-approvals';
let door: Door | null = null;
let loading: Promise<Door> | null = null;
const load = () => {
	loading ??= import('./door').then(
		(m) => {
			door = m;
			// Fetch the running half now too: the service worker caches a chunk only once it has been
			// fetched, so a browser that holds a code package keeps the whole door for offline use.
			import('./door-run').catch(() => {});
			return m;
		},
		(e) => {
			// A failed load (offline, a deploy that renamed the chunk) is tried again on the next call.
			loading = null;
			throw e;
		},
	);
	return loading;
};

/**
 * The Library's code packages (door.ts `setCodePackages`). An empty list loads nothing, unless a
 * load is already under way: then it must still reach the door, whose sequence number is what lets
 * the LATEST list win. Returning early there let an earlier, non-empty list land after it, so a
 * package the Library had just removed stayed live with no notice (the checker, PR #2411).
 */
export async function setCodePackages(list: { name: string; code: string; facts?: unknown }[]): Promise<void> {
	if (!list.length && !door && !loading) return;
	await (await load()).setCodePackages(list);
}

/**
 * The Library's zip plugins (door.ts `setPlugins`), under the same rule as `setCodePackages`: an empty
 * list loads nothing unless a load is under way, so the latest list always wins.
 */
export async function setPlugins(list: { name: string; fence: string; code: string; placeholder?: { placement?: string; aspect?: string; size?: string }; returns?: unknown; css?: string }[]): Promise<void> {
	if (!list.length && !door && !loading) return;
	await (await load()).setPlugins(list);
}

/** door.ts `codePackagesStamp`: empty until the door has loaded, as it is with no package. */
export function codePackagesStamp(): string {
	return door ? door.codePackagesStamp() : '';
}

/** door.ts `renderWithCodePackages`; before the door loads, the engine's render without the door's flags. */
export async function renderWithCodePackages<R extends { html: string }>(PG: Renderer, source: string, theme: string, opts: Record<string, unknown> | undefined): Promise<R> {
	if (door) return door.renderWithCodePackages<R>(PG, source, theme, opts);
	let engineOpts = opts;
	if (opts && ('codeStatus' in opts || 'codeApproval' in opts)) {
		const { codeStatus: _status, codeApproval: _approval, ...rest } = opts;
		engineOpts = rest;
	}
	// A listed plugin's block shows its wait (wait.ts), not its fence source, before the door holds the plugins.
	return PG.render(waits ? waits.withWaits(source) : source, theme, engineOpts) as R;
}
