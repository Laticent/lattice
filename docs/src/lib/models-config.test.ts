// @vitest-environment node
// The model config: one committed file every model id the Studio names comes from
// (engineering/decisions/2026-11-09-model-guard-rails.md). These tests hold the file valid, hold the
// consumers to it (a literal that drifts back into code is a second source), and pin the retired
// list's effect on a stored selection.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { OR_FEATURED, OR_VALUE } from '../components/studio/ai/or-catalog.js';
import { TTS_FEATURED, TTS_VALUE } from '../components/studio/ai/tts-catalog.js';
import { DEFAULT_IMAGE_MODEL } from '../components/studio/image-look';
import { TOUR_VOICE } from '../components/studio/tours/lines';
import { TTS_QUALITY_FLOOR, TTS_QUALITY_RANK } from '../playground/tts-cost.js';
import { GEMINI_TTS_DEFAULT_MODEL } from '../playground/voice-model.js';
import { isRetired } from './model-retired.js';
import raw from './models.config.json' with { type: 'json' };
import { compileModelsConfig, configuredIds, familyRegExp, isConfigRetired, MODELS, validateModelsConfig } from './models-config.js';
import { CURATED, curatedDefault } from './provider-registry.js';

const clone = () => JSON.parse(JSON.stringify(raw));

describe('models.config.json', () => {
	it('is valid', () => {
		expect(validateModelsConfig(raw)).toEqual([]);
	});

	it('rejects a broken pattern, a duplicate, a floor off the ranking and an id that is both live and retired', () => {
		const bad = clone();
		bad.families.chat.gemini.push('^gemini-(');
		bad.openrouter.chatValue.push(bad.openrouter.chatValue[0]);
		bad.openrouter.voiceQualityFloor = 'acme/not-ranked';
		bad.retired.openrouter.push('anthropic/claude-sonnet');
		const errs = validateModelsConfig(bad).join('\n');
		expect(errs).toMatch(/families\.chat\.gemini: "\^gemini-\(" is not a valid pattern/);
		expect(errs).toMatch(/openrouter\.chatValue: ".*" is listed twice/);
		expect(errs).toMatch(/voiceQualityFloor: must be one of voiceQualityRank/);
		expect(errs).toMatch(/openrouter\.chatFeatured: "anthropic\/claude-sonnet" is also in retired/);
		// Prefix-aware: retiring one release of a family the lens still features is a contradiction too.
		const half = clone();
		half.retired.openrouter.push('anthropic/claude-opus-4');
		expect(validateModelsConfig(half).join('\n')).toMatch(/chatFeatured: "anthropic\/claude-opus" is also in retired \("anthropic\/claude-opus-4"\)/);
	});

	it('names every list the nightly checks, and how', () => {
		const ids = configuredIds(raw);
		expect(ids.find((w) => w.where === 'defaults.chat.openrouter')).toMatchObject({ kind: 'exact', list: 'openrouter' });
		expect(ids.find((w) => w.where === 'defaults.voice.openrouter')).toMatchObject({ kind: 'exact', list: 'openrouter-voice' });
		expect(ids.find((w) => w.where === 'defaults.voice.gemini')).toMatchObject({ kind: 'exact', list: 'gemini' });
		expect(ids.filter((w) => w.kind === 'pattern').map((w) => w.list)).toEqual(expect.arrayContaining(['gemini', 'anthropic', 'openai']));
		expect(new Set(ids.map((w) => w.list))).toEqual(new Set(['openrouter', 'openrouter-voice', 'gemini', 'anthropic', 'openai']));
	});

	it('expands {gemini3up} to any Gemini version from 3 up, and never 2.5', () => {
		const re = familyRegExp('^{gemini3up}-flash$');
		expect(['gemini-3-flash', 'gemini-3.8-flash', 'gemini-4-flash', 'gemini-12.1-flash'].every((id) => re.test(id))).toBe(true);
		expect(re.test('gemini-2.5-flash')).toBe(false);
	});
});

describe('the consumers read the config', () => {
	it('every default and curated list is the config, not a copy', () => {
		expect(OR_FEATURED).toBe(MODELS.openrouter.chatFeatured);
		expect(OR_VALUE).toBe(MODELS.openrouter.chatValue);
		expect(TTS_FEATURED).toBe(MODELS.openrouter.voiceFeatured);
		expect(TTS_VALUE).toBe(MODELS.openrouter.voiceValue);
		expect(TTS_QUALITY_RANK).toBe(MODELS.openrouter.voiceQualityRank);
		expect(TTS_QUALITY_FLOOR).toBe(raw.openrouter.voiceQualityFloor);
		expect(GEMINI_TTS_DEFAULT_MODEL).toBe(raw.defaults.voice.gemini);
		expect(DEFAULT_IMAGE_MODEL).toBe(raw.defaults.image.openrouter);
		expect(CURATED).toBe(MODELS.families);
	});

	it('the tour voice the clips were recorded in is the pinned one the nightly checks', () => {
		// lines.ts stays import-free (the recorder reads it from Node), so the pin is held here.
		expect(TOUR_VOICE.model).toBe(raw.pinned.tourVoice['openrouter-voice']);
	});

	it('the curated families pick the same defaults they did as inline RegExps', () => {
		const live = [{ id: 'gemini-2.5-flash' }, { id: 'gemini-3.1-flash' }, { id: 'gemini-3.8-flash' }, { id: 'gemini-3.8-flash-lite' }, { id: 'gemini-3.8-pro' }];
		expect(curatedDefault(live, CURATED.chat.gemini)).toBe('gemini-3.8-flash');
		const voices = [{ id: 'gemini-3.1-flash-tts-preview' }, { id: 'gemini-3.8-flash-lite-tts' }, { id: 'gemini-3.8-flash-tts' }];
		expect(curatedDefault(voices, CURATED.voice.gemini)).toBe('gemini-3.8-flash-lite-tts');
	});

	it('the config holds no retired id in a live list', () => {
		const retired = new Set(Object.values(raw.retired).flat());
		expect(configuredIds(raw).filter((w) => retired.has(w.id))).toEqual([]);
	});
});

describe('retired', () => {
	it('a config-retired entry covers the real ids a selection stored, on its own route only', () => {
		// `qwen/qwq` was a lens PREFIX, so what a selection holds is a full id such as `qwen/qwq-32b`.
		expect(isConfigRetired('openrouter', 'qwen/qwq')).toBe(true);
		expect(isConfigRetired('openrouter', 'qwen/qwq-32b')).toBe(true);
		expect(isConfigRetired('openrouter', 'qwen/qwq-32b:free')).toBe(true);
		expect(isConfigRetired('openrouter', 'qwen/qwq2-72b')).toBe(false);
		expect(isConfigRetired('gemini', 'qwen/qwq')).toBe(false);
		expect(isRetired('openrouter', 'qwen/qwq')).toBe(true);
		expect(isRetired('openrouter', MODELS.defaults.chat.openrouter)).toBe(false);
	});

	it('compiles a hotfix: an id moved into retired leaves the curated list and stops a selection', () => {
		const next = clone();
		next.openrouter.chatValue = next.openrouter.chatValue.filter((id: string) => id !== 'deepseek/deepseek-r1');
		next.retired.openrouter.push('deepseek/deepseek-r1');
		expect(validateModelsConfig(next)).toEqual([]);
		const m = compileModelsConfig(next);
		expect(m.openrouter.chatValue).not.toContain('deepseek/deepseek-r1');
		expect(m.retired.openrouter).toContain('deepseek/deepseek-r1');
	});

	it('the code names no OpenRouter list id the config does not (a literal back in code is a second source)', () => {
		for (const f of ['../components/studio/ai/or-catalog.js', '../components/studio/ai/tts-catalog.js', '../playground/tts-cost.js', './provider-registry.js']) {
			const src = readFileSync(new URL(f, import.meta.url), 'utf8')
				.split('\n')
				.filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
				.join('\n');
			expect(src, f).not.toMatch(/['"`](anthropic|openai|google|x-ai|hexgrad|qwen|deepseek|meta-llama|zyphra|sesame|canopylabs|microsoft|fish-audio)\/[a-z0-9.-]+['"`]/);
		}
	});
});
