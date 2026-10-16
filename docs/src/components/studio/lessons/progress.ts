// LESSON PROGRESS — which lessons this viewer finished, and which panels already offered theirs.
//
// Per-viewer conveniences, so browser storage is the right home: losing them costs a check mark
// and one repeated offer, nothing more. Every read and write is guarded, because storage throws in
// a private window or with site data blocked, and the Studio must work the same without it.
// Design record: engineering/decisions/2026-10-05-studio-lessons.md §Reach.

import { LESSONS, type LessonMeta } from './catalog';

const DONE_KEY = 'lattice-studio-lessons-done';
const OFFERED_KEY = 'lattice-studio-lessons-offered';

function readSet(key: string): Set<string> {
	try {
		const raw = localStorage.getItem(key);
		const list = raw ? (JSON.parse(raw) as unknown) : [];
		return new Set(Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : []);
	} catch {
		return new Set();
	}
}

function addTo(key: string, id: string): void {
	try {
		const set = readSet(key);
		set.add(id);
		localStorage.setItem(key, JSON.stringify([...set]));
	} catch {
		// Storage refused: the lesson still ran, it just will not be remembered.
	}
}

/** Lessons this viewer has finished. */
export const doneLessons = (): Set<string> => readSet(DONE_KEY);

/** Remember a finished lesson. */
export const markDone = (id: string): void => addTo(DONE_KEY, id);

/** The lesson to suggest after `id`: the next one in catalog order (the curriculum's order) that
 *  this viewer has not finished, wrapping round to the start. Null when every lesson is done. */
export function nextLesson(id: string, done: ReadonlySet<string> = doneLessons()): LessonMeta | null {
	const at = LESSONS.findIndex((l) => l.id === id);
	for (let i = 1; i <= LESSONS.length; i++) {
		const l = LESSONS[(at + i) % LESSONS.length];
		if (l.id !== id && !done.has(l.id)) return l;
	}
	return null;
}

/** Has this panel already offered its lesson? A panel offers once, ever. */
export const wasOffered = (panel: string): boolean => readSet(OFFERED_KEY).has(panel);

/** Record that a panel offered its lesson (whether or not the viewer took it). */
export const markOffered = (panel: string): void => addTo(OFFERED_KEY, panel);
