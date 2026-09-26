import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { type Ltt, timeline, validateLtt } from '@/lib/ltt';
import { recordedLine, staleStretches } from '@/lib/vetrina';
import recording from './deictic.ltt.json';
import { DEICTIC_RECORDING_ID, deicticScene, RECORDING_PACE } from './page-scenes';

// The committed recording of the `/vetrina` page's "Point at a thing" beat, checked against the
// storyboard the page runs NOW (followups 2372-p2). When a line of deicticScene changes, the stretch
// that holds it reads stale here: re-record it with the page's Record control and commit the file.

const digest = async (text: string) => `sha256:${createHash('sha256').update(text, 'utf8').digest('hex')}` as const;
const ltt = recording as unknown as Ltt;
// The engine hash the recording was made with, so an engine upgrade alone does not fail this test:
// that is a real staleness, and it belongs to whoever upgrades the engine, not to a storyboard edit.
const inputs = { engine: ltt.inputs.engine, pace: RECORDING_PACE };

describe('the /vetrina recording', () => {
	it('is a valid, seekable recording of the page beat', () => {
		expect(validateLtt(ltt)).toEqual([]);
		expect(ltt.source?.id).toBe(DEICTIC_RECORDING_ID);
		expect(ltt.seekable).toBe(true);
		expect(timeline(ltt).durationMs).toBeGreaterThan(0);
		// Every spoken line of the beat is in the recording, in order.
		const lines = deicticScene()
			.toData()
			.filter((s) => s.say)
			.map((s) => s.say as string);
		for (const line of lines) expect(recordedLine(ltt, line)).not.toBeNull();
	});

	it('matches the storyboard the page runs today', async () => {
		expect(await staleStretches(ltt, deicticScene().toData(), inputs, digest)).toEqual([]);
	});

	it('records each stroke on the word that names it', () => {
		// The actions layer is what a replay honors: each gesture lands on its word, not after the line.
		const [seg] = ltt.segments;
		expect(seg.kind).toBe('stretch');
		expect((seg.kind === 'stretch' ? seg.actions ?? [] : []).map((a) => a.match)).toEqual(['rule', 'boundary', 'swept', 'tapped']);
	});

	// The beat has no wait in it, so the whole run is ONE stretch covering every step, and "which
	// stretch" can only ever be that one. What these arms can prove is that the hash SEES each kind of
	// edit: a spoken line, a stroke's target that nothing says aloud, and the pace the words were timed at.
	it('reads as stale when any part of the storyboard changes, not only its words', async () => {
		const steps = deicticScene().toData();
		const [seg] = ltt.segments;
		expect(seg.kind === 'stretch' ? seg.at.beats : null).toEqual([0, steps.length - 1]);
		const i = steps.findIndex((s) => s.say?.startsWith('A phrase inside'));
		const reworded = steps.map((s, k) => (k === i ? { ...s, say: 'A phrase inside a longer line gets its words underlined.' } : s));
		expect((await staleStretches(ltt, reworded, inputs, digest)).map((x) => x.id)).toEqual([seg.id]);
		const retargeted = steps.map((s, k) => (k === i ? { ...s, gesture: { ...(s.gesture as object), target: '#vt-list .note:first-child' } } : s));
		expect((await staleStretches(ltt, retargeted, inputs, digest)).map((x) => x.id)).toEqual([seg.id]);
		expect((await staleStretches(ltt, steps, { ...inputs, pace: 'fast' as const }, digest)).map((x) => x.id)).toEqual([seg.id]);
	});
});
