// The tour SCRIPTS, by id — loaded on first start (tours/index.ts `loadTours`), so the scripts and
// the storyboard engine they compile to never ride in the Studio's startup bundle.

import type { Walkthrough } from '../../../lib/vetrina';
import type { StudioActions } from '../studio-actions';
import { firstLook } from './first-look';
import { DEFAULT_TOUR } from './index';
import type { TourBuild } from './tour-kit';

const BUILDS: Record<string, TourBuild> = { 'first-look': firstLook };

/** Resolve a tour by id → its Walkthrough, adapting to the surface. Falls back to the default. */
export function buildTour(id: string, opts: { mobile: boolean }): Walkthrough<StudioActions> {
	return (BUILDS[id] ?? BUILDS[DEFAULT_TOUR])(opts);
}

/** Every id in the registry has a script (tours.test.ts holds the two lists together). */
export const TOUR_IDS: readonly string[] = Object.keys(BUILDS);
