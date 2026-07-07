import { afterEach, describe, expect, it } from 'vitest';
import type { RunContext } from './runner';
import { createStage, type Stage } from './stage';
import { readMs, storyboard } from './storyboard';
import { resolveTheme } from './theme';

// The Teaching Beat: a caption is a lesson, not a subtitle. `readMs` sizes the DWELL to the
// caption's length; a `read` step plays SAY → emphasizeCaption (draw the eye) → DWELL, BEFORE
// the action. These tests pin the timing math and the beat ORDER (read before act), plus that
// emphasizeCaption is safe on a real stage across caption styles.

describe('readMs — dwell scales with word count, clamped', () => {
	it('a one-word caption still lands (floor 1600ms)', () => {
		expect(readMs('Watch.')).toBe(1600);
	});
	it('mid-length scales linearly (400 + 240/word)', () => {
		// 10 words → 400 + 2400 = 2800
		expect(readMs('one two three four five six seven eight nine ten')).toBe(2800);
	});
	it('a long caption is capped (ceiling 5000ms)', () => {
		const long = Array.from({ length: 40 }, (_, i) => `w${i}`).join(' ');
		expect(readMs(long)).toBe(5000);
	});
	it('ignores extra whitespace when counting words', () => {
		expect(readMs('  two   words  ')).toBe(readMs('two words'));
	});
});

// A fake ctx that records the ordered trace — the read beat must fire emphasizeCaption AFTER
// say and BEFORE act, so the viewer reads the words before the thing happens.
function recorder() {
	const log: string[] = [];
	const stage = {
		say: (t: string) => void log.push(`say:${t}`),
		emphasizeCaption: async () => void log.push('emphasize'),
		point: async (t: unknown) => void log.push(`point:${String(t)}`),
		press: async () => void log.push('press'),
		gesture: async (k: string) => void log.push(`gesture:${k}`),
		reduced: false,
		still: false,
		pace: 1,
	};
	const actions = { go: () => log.push('act:go') };
	const ctx = {
		stage,
		actions,
		signal: new AbortController().signal,
		type: async (target: unknown, text: string) => void log.push(`type:${String(target)}:${text.length}`),
		awaitUser: async () => new Event('x'),
	} as unknown as RunContext<{ go: () => void }>;
	return { log, ctx };
}

describe('read beat — order is say → emphasize → (dwell) → act', () => {
	it('emphasizeCaption fires after say and before act', async () => {
		const board = storyboard<{ go: () => void }>('', [{ say: 'Read me first.', read: true, act: (a) => a.go(), settle: 0 }]);
		const { log, ctx } = recorder();
		await board(ctx);
		expect(log).toEqual(['say:Read me first.', 'emphasize', 'act:go']);
	});
	it('a non-read beat never emphasizes the caption', async () => {
		const board = storyboard<{ go: () => void }>('', [{ say: 'Just a subtitle.', act: (a) => a.go(), settle: 0 }]);
		const { log, ctx } = recorder();
		await board(ctx);
		expect(log).toEqual(['say:Just a subtitle.', 'act:go']);
	});
});

let active: Stage | null = null;
afterEach(() => {
	active?.destroy();
	active = null;
	document.body.innerHTML = '';
});

describe('emphasizeCaption — safe on a real stage in every caption style', () => {
	for (const caption of ['bar', 'split', 'scrim', 'progress'] as const) {
		it(`${caption}: resolves without throwing and keeps the one narration live region`, async () => {
			const root = document.createElement('div');
			document.body.appendChild(root);
			active = createStage({ root, onExit: () => {}, theme: resolveTheme({ caption }) });
			await expect(active.emphasizeCaption()).resolves.toBeUndefined();
			const layer = document.querySelector('.vetrina-stage') as HTMLElement;
			expect(layer.querySelectorAll('.vetrina-narration[role="status"]')).toHaveLength(1);
		});
	}
});
