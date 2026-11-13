// @vitest-environment node
// The engine profile's parallel defaults are keyed by OpenRouter model id, measured by tools/tts-bench.mjs
// (2026-11-11-voice-synthesis-spine.md §9). A model renamed in the catalog would silently fall back to the unmeasured
// default here, so these pin that every measured id is one the catalog still lists.
import { describe, expect, it } from 'vitest';
import catalog from './tts-voice-catalog.json';
import { autoParallelFor, MODEL_PARALLEL, parallelCapFor, UNMEASURED_PARALLEL } from './voice-engine-profile.js';

describe('voice engine profile', () => {
	it('measures only models the voice catalog lists', () => {
		const ids = new Set(Object.values(catalog.engines as Record<string, { modelId?: string }>).map((e) => e.modelId));
		for (const id of Object.keys(MODEL_PARALLEL)) expect(ids.has(id), `${id} is not in tts-voice-catalog.json`).toBe(true);
	});

	it('starts each cloud model at its measured ceiling, and one the bench never saw at the old pool of 3', () => {
		expect(autoParallelFor('openrouter-tts', 'x-ai/grok-voice-tts-1.0')).toBe(6);
		expect(autoParallelFor('openrouter', 'sesame/csm-1b'), 'CSM gains nothing past one request').toBe(1);
		expect(autoParallelFor('openrouter-tts', 'someone/new-voice')).toBe(UNMEASURED_PARALLEL);
		expect(autoParallelFor('gemini', 'gemini-2.5-flash-preview-tts'), 'Google direct is unmeasured').toBe(UNMEASURED_PARALLEL);
	});

	it('runs on-device Kokoro one at a time whatever the author sets, and honors the author everywhere else', () => {
		expect(parallelCapFor('kokoro', 8)).toBe(1);
		expect(parallelCapFor('openrouter', 2, 'x-ai/grok-voice-tts-1.0')).toBe(2);
		expect(parallelCapFor('openrouter', 'auto', 'x-ai/grok-voice-tts-1.0')).toBe(6);
	});
});
