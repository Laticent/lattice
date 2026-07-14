import { afterEach, describe, expect, it } from 'vitest';
import { applyDeckEdit, architectSpend, estimateUsd, generateComponent, generateTheme, normalizeGeneration, refineSelection, requestFindingFix, runArchitect, setBudget, withStudioVoice } from './architect';
import { suggestFor } from './Editor';
import { saveInstructions, saveOnDeviceInstructions, saveSettings } from './studio-store';

afterEach(() => {
	try {
		localStorage.clear();
	} catch {
		/* no storage */
	}
});

// withStudioVoice merges the output-language directive (+ standing instructions)
// into the system turn of DECK-CONTENT calls — the prose paths only. The structural
// generators (theme/component) never see it, so their slugs/CSS stay English.
describe('withStudioVoice — language + instructions injection', () => {
	it('folds the language directive into an existing system turn', () => {
		saveSettings({ language: 'en-GB' });
		const out = withStudioVoice([
			{ role: 'system', content: 'BASE' },
			{ role: 'user', content: 'hi' },
		]);
		expect(out[0].role).toBe('system');
		expect(out[0].content).toContain('BASE');
		expect(out[0].content).toContain('English (United Kingdom)');
		expect(out[0].content).toContain('British spelling');
		expect(out[1]).toEqual({ role: 'user', content: 'hi' }); // user turn untouched
	});

	it('creates a system turn when none exists', () => {
		saveSettings({ language: 'en-US' });
		const out = withStudioVoice([{ role: 'user', content: 'hi' }]);
		expect(out[0].role).toBe('system');
		expect(out[0].content).toContain('English (United States)');
		expect(out).toHaveLength(2);
	});

	it('a deck lang OVERRIDES the workspace default; absent, it inherits', () => {
		saveSettings({ language: 'en-US' }); // workspace default
		// An explicit deck lang wins over the workspace default…
		const overridden = withStudioVoice([{ role: 'system', content: 'X' }], 'openrouter', 'en-GB');
		expect(overridden[0].content).toContain('English (United Kingdom)');
		expect(overridden[0].content).not.toContain('English (United States)');
		// …and with no deck lang the workspace default applies.
		const inherited = withStudioVoice([{ role: 'system', content: 'X' }], 'openrouter');
		expect(inherited[0].content).toContain('English (United States)');
	});

	it('appends standing instructions when set, omits them when blank', () => {
		saveSettings({ language: 'en-US' });
		saveInstructions('Be terse.');
		expect(withStudioVoice([{ role: 'system', content: 'X' }])[0].content).toContain('Be terse.');
		saveInstructions('');
		expect(withStudioVoice([{ role: 'system', content: 'X' }])[0].content).not.toContain('Be terse.');
	});

	it('does not mutate the input array', () => {
		const input = [{ role: 'system', content: 'X' }];
		withStudioVoice(input);
		expect(input[0].content).toBe('X');
	});

	it('picks the CLOUD instructions field by default (no generation arg) and when generation is openrouter', () => {
		saveSettings({ language: 'en-US' });
		saveInstructions('Cloud voice.');
		saveOnDeviceInstructions('Local note.');
		expect(withStudioVoice([{ role: 'system', content: 'X' }])[0].content).toContain('Cloud voice.');
		expect(withStudioVoice([{ role: 'system', content: 'X' }])[0].content).not.toContain('Local note.');
		expect(withStudioVoice([{ role: 'system', content: 'X' }], 'openrouter')[0].content).toContain('Cloud voice.');
	});

	it('picks the separate, capped ON-DEVICE instructions field for any on-device generation', () => {
		saveSettings({ language: 'en-US' });
		saveInstructions('Cloud voice.');
		saveOnDeviceInstructions('Local note.');
		for (const generation of ['prompt-api', 'webllm', 'universal']) {
			const out = withStudioVoice([{ role: 'system', content: 'X' }], generation);
			expect(out[0].content).toContain('Local note.');
			expect(out[0].content).not.toContain('Cloud voice.');
		}
	});
});

// The universal Transformers.js backend's active name is 'transformers', but the
// Studio's tier vocabulary is 'universal' — normalizeGeneration bridges them so the
// "active" badge + helper reflect the truth (the red-team caught the mismatch).
describe('normalizeGeneration — the transformers→universal bridge', () => {
	it('maps the universal backend name into the Studio tier vocabulary', () => {
		expect(normalizeGeneration('transformers')).toBe('universal');
	});
	it('passes every other tier through unchanged', () => {
		for (const g of ['floor', 'openrouter', 'webllm', 'prompt-api', 'universal']) {
			expect(normalizeGeneration(g)).toBe(g);
		}
	});
});

// The pre-send cost estimate: prompt tokens (~4 chars/token) × in-price + a fixed
// output ceiling × out-price. Powers the "≈ $X" hint + the hard-stop-on-estimate gate.
describe('estimateUsd — pre-send cost estimate', () => {
	const price = { promptPerM: 3, completionPerM: 15 }; // Claude Sonnet 4, $/M
	it('estimates input + a bounded output cost from per-million pricing', () => {
		// 400 chars ≈ 100 prompt tokens → 100/1e6*3 = $0.0003; output 1000 tok → 1000/1e6*15 = $0.015.
		const est = estimateUsd('x'.repeat(400), price, 1000);
		expect(est).toBeCloseTo(0.0003 + 0.015, 6);
	});
	it('returns null when the price is unknown (catalog not loaded) — the gate then skips', () => {
		expect(estimateUsd('hello', null)).toBeNull();
		expect(estimateUsd('hello', { promptPerM: null, completionPerM: null })).toBeNull();
	});
	it('scales with prompt length and the output ceiling', () => {
		const small = estimateUsd('x'.repeat(40), price, 500) ?? 0;
		const big = estimateUsd('x'.repeat(4000), price, 4096) ?? 0;
		expect(big).toBeGreaterThan(small);
	});
});

// Bug A11: fixAll used to hardcode `kpi`; it now lands the SAME "did you mean"
// the inline underline promises. suggestFor is the shared source of that pick.
describe('suggestFor — the shared "did you mean"', () => {
	const known = new Set(['title', 'kpi', 'agenda', 'cards-grid', 'closing']);
	it('matches the longest shared prefix', () => {
		expect(suggestFor('agendaa', known)).toBe('agenda');
		expect(suggestFor('titl', known)).toBe('title'); // tit… → title
		expect(suggestFor('closin', known)).toBe('closing');
	});
	it('falls back to kpi when nothing is close', () => {
		expect(suggestFor('zzz-bogus', known)).toBe('kpi');
	});
});

describe('setBudget — the cap the architect honours', () => {
	it('persists a cap + mode, and clears the cap at 0', () => {
		setBudget(5, 'stop');
		let s = architectSpend();
		expect(s.cap).toBe(5);
		expect(s.mode).toBe('stop');
		setBudget(null, 'alert');
		s = architectSpend();
		expect(s.cap).toBe(0);
		expect(s.mode).toBe('alert');
	});
});

describe('runArchitect — honest offline degradation', () => {
	it('returns `offline` when no model is connected (the floor)', async () => {
		// No OpenRouter key, no on-device model in the test env → the floor. The
		// architect must NOT fabricate an edit; it reports offline so the UI can
		// point the author at Workspace instead of faking a change.
		const out = await runArchitect('<!-- _class: title -->\n\n# Hello', 'Rewrite slide 1.');
		expect(out.status).toBe('offline');
	});
});

describe('requestFindingFix — honest per-finding fix', () => {
	const finding = { slide: 2, rule: 'wall-of-text', severity: 'warning', message: 'Too many words on this slide.' };
	it('returns `offline` with no model connected — never a fabricated rewrite', async () => {
		const out = await requestFindingFix('<!-- _class: title -->\n\n# A', finding, []);
		expect(out.status).toBe('offline');
	});
	it('applyDeckEdit splices a replace edit into the right slide', () => {
		const src = '<!-- _class: title -->\n\n# One\n\n---\n\n<!-- _class: kpi -->\n\n# Two';
		const next = applyDeckEdit(src, { action: 'replace', slide: 2, body: '<!-- _class: kpi -->\n\n# Rewritten' });
		expect(next).toContain('# Rewritten');
		expect(next).toContain('# One'); // slide 1 untouched
		expect(next).not.toContain('# Two');
	});
});

describe('generateTheme — honest "describe a look"', () => {
	it('returns `nochange` for an empty prompt without touching the model', async () => {
		expect((await generateTheme({}, '')).status).toBe('nochange');
		expect((await generateTheme({}, '   ')).status).toBe('nochange');
	});
	it('returns `offline` with no model connected — never a fabricated palette', async () => {
		// Same honesty contract as the deck bridges: no model → no theme, just a
		// signal the UI can act on (point at Workspace), not a faked palette.
		const out = await generateTheme({}, 'warm editorial, deep navy accent');
		expect(out.status).toBe('offline');
	});
});

describe('generateComponent — honest "describe a component"', () => {
	it('returns `nochange` for an empty prompt without touching the model', async () => {
		expect((await generateComponent('')).status).toBe('nochange');
		expect((await generateComponent('   ')).status).toBe('nochange');
	});
	it('returns `offline` with no model connected — never a fabricated component', async () => {
		// Same honesty contract as generateTheme: no model → no component, just a
		// signal the UI can act on (point at Workspace), not a faked draft.
		const out = await generateComponent('a grid of capability cards', []);
		expect(out.status).toBe('offline');
	});
});

describe('refineSelection — honest selection refine', () => {
	it('returns `nochange` for empty/whitespace text without touching the model', async () => {
		expect((await refineSelection('polish', '')).status).toBe('nochange');
		expect((await refineSelection('shorten', '   \n  ')).status).toBe('nochange');
	});
	it('returns `offline` with no model connected (the floor) — never a fabricated rewrite', async () => {
		// Same honesty contract as runArchitect: no model → no rewrite, just a
		// signal the UI can act on (point at Workspace), not a faked change.
		const out = await refineSelection('polish', 'Tighten this sentence please.');
		expect(out.status).toBe('offline');
	});
});
