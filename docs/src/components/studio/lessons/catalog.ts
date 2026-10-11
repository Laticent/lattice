// The LESSON CATALOG — the lesson list (lib/lesson-catalog.ts) and the loader for each lesson's
// script.
//
// This file ships in the Studio bundle; each lesson's script does not. `loadLesson` fetches a track
// through `import()` the first time someone opens one of its lessons. Keep entries to an id, the
// question a learner would ask, and the words they might type instead.
// Design record: engineering/decisions/2026-10-05-studio-lessons.md.


import { LESSONS, type LessonMeta, type LessonTrack } from '../../../lib/lesson-catalog';
import type { LessonBuild } from './lesson-kit';

export { LESSONS, type LessonMeta, type LessonTrack };

const TRACKS: Record<LessonTrack, () => Promise<Record<string, LessonBuild>>> = {
	basics: () => import('./basics').then((m) => m.BASICS),
	building: () => import('./building').then((m) => m.BUILDING),
	polish: () => import('./polish').then((m) => m.POLISH),
	sharing: () => import('./sharing').then((m) => m.SHARING),
};

/** Fetch one lesson's script. Null for an unknown id, so a stale link degrades to nothing. */
export async function loadLesson(id: string): Promise<LessonBuild | null> {
	const meta = LESSONS.find((l) => l.id === id);
	if (!meta) return null;
	const track = await TRACKS[meta.track]();
	return track[id] ?? null;
}
