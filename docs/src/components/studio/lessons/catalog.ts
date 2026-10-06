// The LESSON CATALOG — what search needs to find a lesson, and nothing else.
//
// This file ships in the Studio bundle; each lesson's script does not. `loadLesson` fetches a track
// through `import()` the first time someone opens one of its lessons. Keep entries to an id, the
// question a learner would ask, and the words they might type instead.
// Design record: engineering/decisions/2026-10-05-studio-lessons.md.

import type { LessonBuild } from './lesson-kit';

export type LessonTrack = 'basics' | 'building' | 'polish' | 'sharing';

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
	{ id: 'add-chart', question: 'How do I add a chart?', keywords: ['chart', 'graph', 'bar', 'plot', 'data', 'numbers'], track: 'building' },
	{ id: 'add-table', question: 'How do I add a table?', keywords: ['table', 'rows', 'columns', 'grid', 'spreadsheet'], track: 'building' },
	{ id: 'add-comparison', question: 'How do I compare two options?', keywords: ['compare', 'comparison', 'versus', 'vs', 'options', 'pros and cons', 'recommend'], track: 'building' },
	{ id: 'add-image', question: 'How do I add an image?', keywords: ['image', 'picture', 'photo', 'logo', 'png', 'jpg'], track: 'building' },
	{ id: 'speaker-notes', question: 'How do I add speaker notes?', keywords: ['notes', 'speaker', 'presenter', 'script', 'remember'], track: 'building' },
	{ id: 'coach', question: 'How do I check my deck?', keywords: ['coach', 'check', 'review', 'issues', 'problems', 'lint', 'feedback'], track: 'polish' },
	{ id: 'fix-all', question: 'How do I fix every issue at once?', keywords: ['fix', 'fix all', 'repair', 'clean up', 'issues'], track: 'polish' },
	{ id: 'reshape', question: 'How do I change a slide’s layout?', keywords: ['reshape', 'layout', 'look', 'variant', 'rearrange'], track: 'polish' },
	{ id: 'light-dark', question: 'How do I switch light or dark?', keywords: ['dark', 'light', 'mode', 'night', 'contrast'], track: 'polish' },
	{ id: 'share-html', question: 'How do I share a deck that plays in a browser?', keywords: ['html', 'webpage', 'web page', 'player', 'browser', 'offline', 'link', 'share'], track: 'sharing' },
	{ id: 'share-pptx', question: 'How do I get a PowerPoint file?', keywords: ['powerpoint', 'pptx', 'ppt', 'microsoft', 'office', 'keynote', 'export'], track: 'sharing' },
];

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
