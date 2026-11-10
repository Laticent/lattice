// @vitest-environment node
// Gemini's locale voices behind a language filter (followups 3079-p3-gemini-locale-voices), on a
// recorded page of the live `/v1beta/voices` list: the catalog keeps every record, the filter starts
// on the deck's language, and the named, multilingual voices always lead.
import { describe, expect, it } from 'vitest';
import recorded from '../../playground/gemini-voices.recorded.json' with { type: 'json' };
import { listGeminiVoiceCatalog } from '../../playground/voice-model.js';
import { baseLanguage, defaultGeminiLanguage, type GeminiVoiceRecord, geminiLanguages, geminiVoicesFor, groupVoices } from './tts-voice-catalog';

const MODEL = 'gemini-3.8-flash-lite-tts';

async function catalog() {
	const fetchImpl = async (url: string) => (url.includes('/models?') ? Response.json({ models: [{ name: `models/${MODEL}` }] }) : Response.json({ voices: recorded.voices }));
	return listGeminiVoiceCatalog('AIzaTestKey000000000000000', fetchImpl as unknown as typeof fetch);
}

describe('Gemini locale voices', () => {
	it('the catalog keeps every record, and the named list is unchanged', async () => {
		const c = await catalog();
		expect(c.voices).toHaveLength(30);
		expect(c.voices).toContain('achernar');
		expect(c.voices.some((id: string) => id.includes('-'))).toBe(false);
		expect(c.records).toHaveLength(recorded.voices.length);
		expect(c.records.find((r: GeminiVoiceRecord) => r.id === 'pt-br-advisor-1')).toMatchObject({ name: 'Authoritative Advisor 1', language: 'pt-BR', named: false, gender: 'F' });
	});

	it('lists the languages with locale voices, by base subtag, named in English', async () => {
		const { records } = await catalog();
		expect(geminiLanguages(records)).toEqual([
			{ code: 'en', label: 'English', count: 4 },
			{ code: 'hi', label: 'Hindi', count: 3 },
			{ code: 'pt', label: 'Portuguese', count: 10 },
		]);
	});

	it('starts on the deck language when Gemini has voices in it, else on the named voices only', async () => {
		const { records } = await catalog();
		expect(defaultGeminiLanguage(records, 'pt-BR')).toBe('pt');
		expect(defaultGeminiLanguage(records, 'hi')).toBe('hi');
		expect(defaultGeminiLanguage(records, 'sw')).toBe('');
		expect(defaultGeminiLanguage(records, undefined)).toBe('');
		expect(baseLanguage('en_GB')).toBe('en');
	});

	it('a language adds its locale voices after the named ones, grouped by locale and labeled by name and role', async () => {
		const { records, voices } = await catalog();
		const list = geminiVoicesFor(records, voices, 'pt');
		expect(list.slice(0, 30).every((v) => v.group === 'named')).toBe(true);
		expect(list).toHaveLength(40);
		const advisor = list.find((v) => v.id === 'pt-br-advisor-1');
		expect(advisor).toMatchObject({ label: 'Authoritative Advisor 1 · Lawyer', groupLabel: 'Portuguese · Brazil', country: 'BR', gender: 'F' });
		expect(list.find((v) => v.group === 'pt-pt')?.groupLabel).toBe('Portuguese · Portugal');
		expect(geminiVoicesFor(records, voices, '')).toHaveLength(30);
	});

	it('the picker shows the groups in that order: multilingual, then each locale', async () => {
		const { records, voices } = await catalog();
		const { featured, groups } = groupVoices(MODEL, geminiVoicesFor(records, voices, 'pt'));
		expect(groups.map((g) => g.label)).toEqual(['Multilingual voices', 'Portuguese · Brazil', 'Portuguese · Portugal']);
		expect(featured.length + groups.reduce((n, g) => n + g.voices.length, 0)).toBe(40);
		// Numeric order inside a group: Advisor 2 before Advisor 10.
		const br = groups[1].voices.map((v) => v.label);
		expect(br).toEqual([...br].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })));
	});
});
