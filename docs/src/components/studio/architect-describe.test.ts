import { describe, expect, it } from 'vitest';
import { buildDescriptionPrompt } from './architect';

// The live generation needs a connected cloud model (the user's OpenRouter key),
// so the network path is verified on the real Playground, not here. What IS pure
// and testable is the PROMPT — the slide-local, structure-first, no-hallucination
// contract that keeps a generated description a valid WCAG text alternative.
describe('buildDescriptionPrompt', () => {
	it('is slide-local: only this slide is in the prompt, no deck context', () => {
		const msgs = buildDescriptionPrompt('# Q3 Revenue\n\nUp 40%.');
		expect(msgs).toHaveLength(2);
		expect(msgs[0].role).toBe('system');
		expect(msgs[1].role).toBe('user');
		expect(msgs[1].content).toContain('# Q3 Revenue');
		expect(msgs[1].content).toContain('Up 40%.');
	});

	it('the system contract forbids off-slide context and invented figures', () => {
		const sys = buildDescriptionPrompt('x').find((m) => m.role === 'system')?.content ?? '';
		expect(sys).toMatch(/ONLY what is on THIS slide/i);
		expect(sys).toMatch(/never invent or estimate/i);
		expect(sys).toMatch(/WCAG/i);
	});
});
