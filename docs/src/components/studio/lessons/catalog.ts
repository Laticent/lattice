// The LESSON CATALOG — what search needs to find a lesson, and nothing else.
//
// This file ships in the Studio bundle; each lesson's script does not. `loadLesson` fetches a track
// through `import()` the first time someone opens one of its lessons. Keep entries to an id, the
// question a learner would ask, and the words they might type instead.
// Design record: engineering/decisions/2026-10-05-studio-lessons.md.

import type { LessonBuild } from './lesson-kit';

export type LessonTrack = 'basics';

export type LessonMeta = {
	/** Stable id: the palette row's `data-lesson`, and the key in its track's module. */
	id: string;
	/** The palette row, phrased as the learner would ask it. */
	question: string;
	/** Other words for the same need, so "download" finds the PDF lesson. */
	keywords: string[];
	track: LessonTrack;
};

export const LESSONS: readonly LessonMeta[] = [
	{ id: 'new-deck', question: 'How do I start a new deck?', keywords: ['new', 'create', 'blank', 'start', 'deck'], track: 'basics' },
	{ id: 'write-slide', question: 'How do I write a slide?', keywords: ['markdown', 'heading', 'text', 'type', 'edit', 'write'], track: 'basics' },
	{ id: 'add-slide', question: 'How do I add a slide?', keywords: ['insert', 'new slide', 'layout', 'component', 'chart', 'gallery'], track: 'basics' },
	{ id: 'change-theme', question: 'How do I change the theme?', keywords: ['theme', 'colors', 'palette', 'look', 'style', 'font'], track: 'basics' },
	{ id: 'present', question: 'How do I present?', keywords: ['present', 'slideshow', 'full screen', 'play', 'show'], track: 'basics' },
	{ id: 'export-pdf', question: 'How do I export a PDF?', keywords: ['pdf', 'export', 'download', 'save', 'print', 'share', 'send'], track: 'basics' },
];

const TRACKS: Record<LessonTrack, () => Promise<Record<string, LessonBuild>>> = {
	basics: () => import('./basics').then((m) => m.BASICS),
};

/** Fetch one lesson's script. Null for an unknown id, so a stale link degrades to nothing. */
export async function loadLesson(id: string): Promise<LessonBuild | null> {
	const meta = LESSONS.find((l) => l.id === id);
	if (!meta) return null;
	const track = await TRACKS[meta.track]();
	return track[id] ?? null;
}
