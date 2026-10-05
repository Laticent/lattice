import * as React from 'react';
import { notify } from '@/lib/notify';
import type { StopReason, Walkthrough } from '../../lib/vetrina';
import { useLazyWalkthrough } from '../../lib/vetrina/react';
import { loadLesson } from './lessons/catalog';
import type { LessonActions, LessonEnv } from './lessons/lesson-kit';
import type { ClipNarrator } from './lessons/lesson-voice';
import { runCommand, type StudioCommand } from './studio-commands';

// useStudioLesson — runs one lesson against the live Studio.
//
// The sibling of useStudioDemo, and deliberately smaller: a tour clears the shell, builds its own
// deck and restores the look afterwards, while a lesson touches NOTHING before it starts and
// restores nothing after. It teaches on the deck the user has open, and whatever it did for them
// (a new slide, a new theme) is the result they asked for. Design record:
// engineering/decisions/2026-10-05-studio-lessons.md.
//
// THE VOICE. Lessons speak from recorded clips (lessons/lesson-voice.ts). The narrator is built
// once per page and disposed on pagehide (Vetrina README §Narration), and it loads with the first
// lesson, not with the Studio. One wrinkle decides the shape below: iOS plays audio only from an
// AudioContext unlocked inside a user gesture, and an `import()` resolves after the gesture is
// gone. So the module is fetched while search is open (`warmLessons`), which makes it ready by the
// time the user picks a row and lets `startLesson` build the narrator inside that click or Enter.
// If it is not ready yet, the narrator is built after the import and unlocks on the user's next
// press instead.

type VoiceModule = typeof import('./lessons/lesson-voice');
let voiceModule: VoiceModule | null = null;
let voiceImport: Promise<VoiceModule> | null = null;
function importVoice(): Promise<VoiceModule> {
	voiceImport ??= import('./lessons/lesson-voice').then(
		(m) => (voiceModule = m),
		(e) => {
			voiceImport = null; // a failed chunk fetch may succeed next time
			throw e;
		},
	);
	return voiceImport;
}

/** How long a lesson waits for its voice (the module and the folder's list) before starting on
 *  captions alone. */
const VOICE_WAIT_MS = 1500;

/** The page's one lesson narrator, or null until a lesson first runs (and after pagehide). */
let narrator: ClipNarrator | null = null;

/** Aborted on the page's pagehide: everything tied to the current narrator lets go. */
let narratorLife: AbortController | null = null;

function ensureNarrator(m: VoiceModule): ClipNarrator {
	if (narrator) {
		narrator.unlock();
		return narrator;
	}
	const n = m.clipNarrator();
	const life = new AbortController();
	narrator = n;
	narratorLife = life;
	// pagehide, not unload: it fires on every exit including into the back/forward cache, and a page
	// restored from there builds a fresh narrator on its next lesson.
	window.addEventListener(
		'pagehide',
		() => {
			life.abort();
			n.dispose?.();
			if (narrator === n) {
				narrator = null;
				narratorLife = null;
			}
		},
		{ once: true },
	);
	return n;
}

/** Unlock on the user's next real gesture — for a narrator built after the gesture that asked
 *  for it. `pointerup`/`touchend`/`click`, not `pointerdown`: for touch, the browser counts only the
 *  end of a tap as activation, and iOS has always unlocked audio on `touchend`. Removed after one
 *  gesture, or by `stop` (pagehide), so a disposed narrator is never woken into a new context. */
function unlockOnNextGesture(n: ClipNarrator, stop: AbortSignal): void {
	const ac = new AbortController();
	const go = (e: Event) => {
		if (e.type === 'keydown' && !['Enter', ' '].includes((e as KeyboardEvent).key)) return;
		n.unlock();
		ac.abort();
	};
	for (const t of ['pointerup', 'touchend', 'click', 'keydown']) window.addEventListener(t, go, { capture: true, signal: ac.signal });
	stop.addEventListener('abort', () => ac.abort(), { once: true });
}

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
	/** Start fetching the lesson voice module. Call when search opens; idempotent. */
	warmLessons: () => void;
	startLesson: (id: string) => void;
	stopLesson: () => void;
};

export function useStudioLesson(rootRef: React.RefObject<HTMLElement | null>, bindings: StudioLessonBindings): StudioLesson {
	const bindRef = React.useRef(bindings);
	bindRef.current = bindings;
	// The loaded script and its id, set just before `start()` so the configure closure can read them.
	const pending = React.useRef<{ id: string; play: Walkthrough<LessonActions>; aim: typeof import('./lessons/lesson-kit').aim; narrate: ClipNarrator | undefined } | null>(null);
	// The id of the most recent start request; a slow `import()` for an older request must not run.
	const latest = React.useRef('');

	const lesson = useLazyWalkthrough<LessonActions>(
		rootRef,
		() => {
		const next = pending.current;
		pending.current = null;
		if (!next) return null;
		const b = bindRef.current;
		const actions: LessonActions = {
			run: (id) => {
				runCommand(bindRef.current.commands, id);
			},
			press: (target) => {
				const t = next.aim(target);
				const el = typeof t === 'function' ? t() : t;
				if (el instanceof HTMLElement) el.click();
			},
			setPalette: (name) => bindRef.current.applyPalette(name),
			appendSlide: (md) => bindRef.current.appendSlide(md),
			type: (target, text) => {
				const t = next.aim(target);
				const el = typeof t === 'function' ? t() : t;
				if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return;
				// React tracks an input's value through the prototype setter; setting `.value`
				// directly is invisible to it, and the field's onChange would never run.
				const proto = el instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
				Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, text);
				el.dispatchEvent(new Event('input', { bubbles: true }));
			},
		};
		return {
			actions,
			play: next.play,
			narrate: next.narrate,
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
		},
		// The engine loads with the first lesson, beside the lesson's own script.
		() => import('../../lib/vetrina/index.js'),
	);

	const startLesson = React.useCallback(
		(id: string) => {
			latest.current = id;
			bindRef.current.stopDemo();
			lesson.stop();
			const b = bindRef.current;
			const env: LessonEnv = { mobile: b.mobile, palette: b.palette, palettes: b.palettes, can: (c) => bindRef.current.commands.some((x) => x.id === c) };
			// Inside the gesture when the module is already here (search was open): build or unlock now.
			const early = voiceModule ? ensureNarrator(voiceModule) : null;
			// The kit loads with the lesson, not with the Studio: only `press` needs it at run time,
			// and it was the bulk of the Studio bundle's growth (route budget, #2529).
			// The voice never holds a lesson back: a module that fails or hangs, or a voice list that is
			// slow, costs the sound and nothing else — the lesson starts on captions within VOICE_WAIT_MS.
			const voice = Promise.race([
				importVoice().then(async (m) => {
					const n = early ?? ensureNarrator(m);
					if (!early && narratorLife) unlockOnNextGesture(n, narratorLife.signal);
					await Promise.all([n.load(m.SHARED_VOICE_DIR), n.load(id)]);
					return n;
				}),
				new Promise<undefined>((r) => setTimeout(r, VOICE_WAIT_MS)),
			]).catch(() => undefined);
			// A late narrator (the race above gave up on it) is still the page's one narrator, and the
			// next lesson finds it ready; this lesson simply runs silent.
			Promise.all([loadLesson(id), import('./lessons/lesson-kit'), voice]).then(
				([build, kit, narrate]) => {
					if (!build || latest.current !== id) return;
					pending.current = { id, play: build(env), aim: kit.aim, narrate };
					// A tour started while this lesson was loading holds Vetrina's one run, and
					// `start()` rejects for a second. The tour wins; the lesson does not start.
					lesson.start().catch(() => {
						pending.current = null;
						notify('That lesson could not start. If a tour is running, close it first, then try again.');
					});
				},
				() => notify('That lesson could not load. Check your connection and try again.'),
			);
		},
		[lesson.start, lesson.stop],
	);

	const warmLessons = React.useCallback(() => {
		importVoice().catch(() => {});
	}, []);

	return { lessonActive: lesson.active, warmLessons, startLesson, stopLesson: lesson.stop };
}
