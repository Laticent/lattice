import * as React from 'react';
import { notify } from '@/lib/notify';
import type { StopReason, Walkthrough } from '../../lib/vetrina';
import { useWalkthrough } from '../../lib/vetrina/react';
import { loadLesson } from './lessons/catalog';
import { aim, type LessonActions, type LessonEnv } from './lessons/lesson-kit';
import { runCommand, type StudioCommand } from './studio-commands';

// useStudioLesson — runs one lesson against the live Studio.
//
// The sibling of useStudioDemo, and deliberately smaller: a tour clears the shell, builds its own
// deck and restores the look afterwards, while a lesson touches NOTHING before it starts and
// restores nothing after. It teaches on the deck the user has open, and whatever it did for them
// (a new slide, a new theme) is the result they asked for. Design record:
// engineering/decisions/2026-10-05-studio-lessons.md.

export type StudioLessonBindings = {
	commands: readonly StudioCommand[];
	palette: string;
	palettes: readonly string[];
	applyPalette: (name: string) => void;
	appendSlide: (markdown: string) => void;
	mobile: boolean;
	/** Stop a running tour first: Vetrina allows one run at a time. */
	stopDemo: () => void;
};

export type StudioLesson = {
	lessonActive: boolean;
	startLesson: (id: string) => void;
	stopLesson: () => void;
};

export function useStudioLesson(rootRef: React.RefObject<HTMLElement | null>, bindings: StudioLessonBindings): StudioLesson {
	const bindRef = React.useRef(bindings);
	bindRef.current = bindings;
	// The loaded script and its id, set just before `start()` so the configure closure can read them.
	const pending = React.useRef<{ id: string; play: Walkthrough<LessonActions> } | null>(null);
	// The id of the most recent start request; a slow `import()` for an older request must not run.
	const latest = React.useRef('');

	const lesson = useWalkthrough<LessonActions>(rootRef, () => {
		const next = pending.current;
		pending.current = null;
		if (!next) return null;
		const b = bindRef.current;
		const actions: LessonActions = {
			run: (id) => {
				runCommand(bindRef.current.commands, id);
			},
			press: (target) => {
				const t = aim(target);
				const el = typeof t === 'function' ? t() : t;
				if (el instanceof HTMLElement) el.click();
			},
			setPalette: (name) => bindRef.current.applyPalette(name),
			appendSlide: (md) => bindRef.current.appendSlide(md),
		};
		return {
			actions,
			play: next.play,
			// Window scope, so a press inside a portalled menu or sheet counts as the user's turn
			// rather than passing unseen.
			takeover: { scope: 'window' },
			theme: { accent: 'var(--accent, #2b6ef2)', caption: b.mobile ? 'scrim' : 'bar' },
			onStop: (reason: StopReason) => {
				// Only a finished lesson earns a toast. A take-over is the user getting on with it, and
				// a toast then would interrupt the very thing the lesson taught.
				if (reason === 'complete') notify('Lesson done. Search for it any time to see it again.');
			},
		};
	});

	const startLesson = React.useCallback(
		(id: string) => {
			latest.current = id;
			bindRef.current.stopDemo();
			lesson.stop();
			const b = bindRef.current;
			const env: LessonEnv = { mobile: b.mobile, palette: b.palette, palettes: b.palettes };
			loadLesson(id).then(
				(build) => {
					if (!build || latest.current !== id) return;
					pending.current = { id, play: build(env) };
					lesson.start();
				},
				() => notify('That lesson could not load. Check your connection and try again.'),
			);
		},
		[lesson.start, lesson.stop],
	);

	return { lessonActive: lesson.active, startLesson, stopLesson: lesson.stop };
}
