// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { announceFixAll, announceFixAllByEvent, fixAllNotice } from './fix-all-notice';

describe('announceFixAll', () => {
	it('names each fix the driver refused, with its slide, rule and reason (followups.d/2966-p2)', () => {
		const notify = vi.fn();
		const skipped = [
			{ rule: 'gantt-retired-delimiter', slide: 3, reason: 'broke-structure', detail: 'the fix changed the document shape' },
			{ rule: 'missing-heading', slide: 0, reason: 'engine-threw' },
		];
		announceFixAll({ applied: 2, skipped }, notify);
		expect(notify).toHaveBeenCalledWith('Fixed 2 issues. 2 fixes were not applied.', {
			description: "Slide 3, gantt-retired-delimiter: it would have changed the deck's slides or front matter. Front matter, missing-heading: it could not be applied safely.",
			duration: 12000,
		});
	});

	it('reports a clean run as a count, and a run with nothing to report not at all', () => {
		const notify = vi.fn();
		announceFixAll({ applied: 1, skipped: [] }, notify);
		announceFixAll({ applied: 0, skipped: [] }, notify);
		announceFixAll(null, notify);
		expect(notify.mock.calls).toEqual([['Fixed 1 issue.', undefined]]);
	});
});

describe('fixAllNotice', () => {
	it('names three refusals and counts the rest', () => {
		const skipped = Array.from({ length: 5 }, (_, i) => ({ rule: `r${i}`, slide: i + 1, reason: 'stale' }));
		expect(fixAllNotice({ applied: 0, skipped })?.description).toBe(
			'Slide 1, r0: the line it names changed before it could be applied. Slide 2, r1: the line it names changed before it could be applied. Slide 3, r2: the line it names changed before it could be applied. And 2 more.',
		);
	});

	it('words a refusal with nothing applied, singular', () => {
		expect(fixAllNotice({ applied: 0, skipped: [{ rule: 'r', slide: 1, reason: 'did-not-resolve' }] })).toEqual({
			message: '1 fix was not applied.',
			description: 'Slide 1, r: the issue was still there after the fix.',
		});
	});
});

describe('announceFixAllByEvent', () => {
	it("raises the same notice through lib/notify's action event, for the Playground's lazy editor", () => {
		const target = new EventTarget();
		vi.stubGlobal('window', target);
		const seen: unknown[] = [];
		target.addEventListener('lattice:notify-action', (e) => seen.push((e as CustomEvent).detail));
		announceFixAllByEvent({ applied: 0, skipped: [{ rule: 'r', slide: 4, reason: 'cycle' }] });
		announceFixAllByEvent({ applied: 0, skipped: [] });
		vi.unstubAllGlobals();
		expect(seen).toEqual([
			{ message: '1 fix was not applied.', opts: { label: 'OK', onClick: expect.any(Function), description: 'Slide 4, r: it kept undoing another fix.', duration: 12000 } },
		]);
	});
});
