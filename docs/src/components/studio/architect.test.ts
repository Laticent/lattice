import { afterEach, describe, expect, it } from 'vitest';
import { deckCanon } from '@/playground/authoring-core.generated.js';
import { applyDeckEdit, architectModel, architectSpend, deckSystem, estimateUsd, generateComponent, generateTheme, normalizeGeneration, refineComponent, refineSelection, requestFindingFix, runArchitect, setBudget, withStudioVoice } from './architect';
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
//
// The CLOUD path keeps the stable canon and the volatile voice as SEPARATE system
// text parts (so the cache breakpoint can sit between them); the on-device path
// flattens to one string. `sysText` reads the combined system text either way so a
// behavioral assertion is shape-agnostic.
const sysText = (m: { content: unknown }): string => {
	const c = m.content;
	if (typeof c === 'string') return c;
	if (Array.isArray(c)) return c.map((p) => (p && typeof p === 'object' && 'text' in p ? String((p as { text?: string }).text ?? '') : '')).join('\n\n');
	return '';
};

describe('withStudioVoice — language + instructions injection', () => {
	it('folds the language directive into an existing system turn', () => {
		saveSettings({ language: 'en-GB' });
		const out = withStudioVoice([
			{ role: 'system', content: 'BASE' },
			{ role: 'user', content: 'hi' },
		]);
		expect(out[0].role).toBe('system');
		expect(sysText(out[0])).toContain('BASE');
		expect(sysText(out[0])).toContain('English (United Kingdom)');
		expect(sysText(out[0])).toContain('British spelling');
		expect(out[1]).toEqual({ role: 'user', content: 'hi' }); // user turn untouched
	});

	it('creates a system turn when none exists', () => {
		saveSettings({ language: 'en-US' });
		const out = withStudioVoice([{ role: 'user', content: 'hi' }]);
		expect(out[0].role).toBe('system');
		expect(sysText(out[0])).toContain('English (United States)');
		expect(out).toHaveLength(2);
	});

	it('a deck lang OVERRIDES the workspace default; absent, it inherits', () => {
		saveSettings({ language: 'en-US' }); // workspace default
		// An explicit deck lang wins over the workspace default…
		const overridden = withStudioVoice([{ role: 'system', content: 'X' }], 'openrouter', 'en-GB');
		expect(sysText(overridden[0])).toContain('English (United Kingdom)');
		expect(sysText(overridden[0])).not.toContain('English (United States)');
		// …and with no deck lang the workspace default applies.
		const inherited = withStudioVoice([{ role: 'system', content: 'X' }], 'openrouter');
		expect(sysText(inherited[0])).toContain('English (United States)');
	});

	it('appends standing instructions when set, omits them when blank', () => {
		saveSettings({ language: 'en-US' });
		saveInstructions('Be terse.');
		expect(sysText(withStudioVoice([{ role: 'system', content: 'X' }])[0])).toContain('Be terse.');
		saveInstructions('');
		expect(sysText(withStudioVoice([{ role: 'system', content: 'X' }])[0])).not.toContain('Be terse.');
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
		expect(sysText(withStudioVoice([{ role: 'system', content: 'X' }])[0])).toContain('Cloud voice.');
		expect(sysText(withStudioVoice([{ role: 'system', content: 'X' }])[0])).not.toContain('Local note.');
		expect(sysText(withStudioVoice([{ role: 'system', content: 'X' }], 'openrouter')[0])).toContain('Cloud voice.');
	});

	it('picks the separate, capped ON-DEVICE instructions field for any on-device generation', () => {
		saveSettings({ language: 'en-US' });
		saveInstructions('Cloud voice.');
		saveOnDeviceInstructions('Local note.');
		for (const generation of ['prompt-api', 'webllm', 'universal', 'transformers']) {
			const out = withStudioVoice([{ role: 'system', content: 'X' }], generation);
			expect(sysText(out[0])).toContain('Local note.');
			expect(sysText(out[0])).not.toContain('Cloud voice.');
		}
	});

	// The Coach "Fix" cloud path (buildFixMessages) hands withStudioVoice a system turn
	// whose content is ALREADY parts ([{canon, cache_control}, {dynamic}]). The voice must
	// still be injected (it was silently dropped before) — appended as a trailing part.
	it('injects the voice when the system content is already content-parts (finding-fix cloud path)', () => {
		saveSettings({ language: 'en-GB' });
		saveInstructions('Be terse.');
		const preParts = [
			{ role: 'system', content: [{ type: 'text', text: 'CANON', cache_control: { type: 'ephemeral' } }, { type: 'text', text: 'the flagged slide' }] },
			{ role: 'user', content: 'fix it' },
		] as Parameters<typeof withStudioVoice>[0];
		const out = withStudioVoice(preParts, 'openrouter', 'en-GB');
		const parts = out[0].content as Array<{ text: string; cache_control?: unknown }>;
		expect(parts).toHaveLength(3); // canon (still marked) + dynamic + appended voice
		expect(parts[0].cache_control).toBeTruthy(); // the cached canon part is untouched
		expect(parts[2].text).toContain('English (United Kingdom)');
		expect(parts[2].text).toContain('Be terse.');
	});

	// The cache-breakpoint contract: CLOUD splits canon vs voice into parts; on-device
	// stays one string. withCachedSystem then marks the FIRST part (see its own tests).
	it('CLOUD path splits the system into [canon, voice] text parts; on-device is one string', () => {
		saveSettings({ language: 'en-US' });
		saveInstructions('');
		saveOnDeviceInstructions('');
		const cloud = withStudioVoice([{ role: 'system', content: 'CANON' }], 'openrouter');
		expect(Array.isArray(cloud[0].content)).toBe(true);
		const parts = cloud[0].content as Array<{ type: string; text: string }>;
		expect(parts).toHaveLength(2);
		expect(parts[0].text).toBe('CANON'); // the stable canon is its own part (nothing appended)
		expect(parts[1].text).toContain('English (United States)'); // the volatile voice trails
		// on-device keeps the flat string
		const local = withStudioVoice([{ role: 'system', content: 'CANON' }], 'webllm');
		expect(typeof local[0].content).toBe('string');
		expect(local[0].content).toContain('CANON');
	});
});

// The deck system is TIERED: the cloud gets the full canon (cached in the prefix);
// a small on-device model gets the SHORT canon so a long prompt doesn't drown it. The
// persona + edit-block protocol are identical across tiers (the parser needs the grammar).
describe('deckSystem — tiered canon by model', () => {
	it('cloud (openrouter) carries the FULL canon; on-device carries the SHORT one', () => {
		const cloud = deckSystem('openrouter');
		expect(cloud).toContain(deckCanon.DECK_CANON);
		expect(cloud.length).toBeGreaterThan(deckCanon.DECK_CANON.length);
		// Include 'transformers' — the RAW backend name the deck call sites pass (they use
		// model.availability().generation, not the normalized 'universal' tier label).
		for (const generation of ['prompt-api', 'webllm', 'universal', 'transformers']) {
			const local = deckSystem(generation);
			expect(local, `${generation} should use the short canon`).toContain(deckCanon.DECK_CANON_SHORT);
			expect(local, `${generation} should NOT carry the full canon`).not.toContain(deckCanon.DECK_CANON);
			expect(local.length, `${generation} prompt should be materially shorter`).toBeLessThan(cloud.length);
		}
	});

	it('every tier keeps the persona and the edit-block protocol', () => {
		for (const generation of ['openrouter', 'prompt-api', 'webllm', 'universal', 'transformers']) {
			const sys = deckSystem(generation);
			expect(sys).toContain('Lattice Architect');
			expect(sys.toLowerCase()).toContain('edit'); // the EDIT_PROTOCOL grammar the parser needs
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

// The silent gate-repair loop: a first draft that fails the gate is fed back to the
// model (with the exact findings) and re-gated, up to 2 passes, BEFORE the user sees
// it (2026-07-19-component-gate-autofix.md). Driven here with an injected backend
// that returns a scripted sequence of drafts, so the loop is exercised end-to-end
// without a real model.
describe('generateComponent — silent gate-repair', () => {
	const draft = (css: string) => ({
		name: 'neon-console', description: 'A neon terminal panel.', function: 'inventory', form: 'panel',
		substance: 'structure', bucket: 'inventory', tags: ['neon', 'terminal', 'status'], adapt: { mode: 'native' },
		capacity: { sweet: 1, soft: 1, hard: 1 }, css, skeleton: '<!-- _class: neon-console -->\n\n## Status\n\n- Core `OK`',
	});
	// The dirty draft trips two gate errors (hex + margin); the clean one is token-only.
	const DIRTY = draft('section.neon-console > .cell-stage { color:#00ff00; margin:4px; }');
	const CLEAN = draft('section.neon-console > .cell-stage { color:var(--pass); padding:var(--sp-sm); }');

	// A backend whose json `complete` returns the next scripted reply each call.
	const seqBackend = (replies: unknown[]) => {
		let i = 0;
		return { name: 'mock', async complete() { return replies[Math.min(i++, replies.length - 1)]; }, async embed() { return null; } };
	};
	async function withBackend(replies: unknown[], run: () => Promise<void>) {
		const m = (await architectModel()) as unknown as { __setBackend: (b: unknown) => void };
		m.__setBackend(seqBackend(replies));
		try { await run(); } finally { m.__setBackend(null); } // reset so sibling tests see the floor
	}

	it('silently repairs a gate-failing draft to clean before the user sees it', async () => {
		await withBackend([DIRTY, CLEAN], async () => {
			const statuses: string[] = [];
			const out = await generateComponent('a neon terminal console', [], undefined, { onStatus: (s) => statuses.push(s.phase) });
			expect(out.status).toBe('ok');
			if (out.status !== 'ok') return;
			expect(out.refined).toBe(1); // one repair pass ran and was accepted
			expect(out.findings.filter((f) => f.level === 'error')).toHaveLength(0); // errors cleared
			expect(out.draft.css).toContain('var(--pass)'); // the repaired (clean) draft won
			expect(out.draft.css).not.toContain('#00ff00');
			expect(statuses).toContain('refining'); // the UI got a live "refining" signal
		});
	});

	it('keeps the best draft and SHOWS remaining findings when repair cannot clear them', async () => {
		// The model never fixes it (always returns the same dirty draft) — the loop must
		// stop (no improvement), keep the draft, and surface the errors rather than hide them.
		await withBackend([DIRTY, DIRTY, DIRTY], async () => {
			const out = await generateComponent('a neon terminal console', []);
			expect(out.status).toBe('ok');
			if (out.status !== 'ok') return;
			expect(out.refined).toBe(0); // no pass improved it
			expect(out.findings.filter((f) => f.level === 'error').length).toBeGreaterThan(0); // shown, not papered over
		});
	});

	it('does not call the model to repair a first draft that is already gate-clean', async () => {
		let calls = 0;
		const m = (await architectModel()) as unknown as { __setBackend: (b: unknown) => void };
		m.__setBackend({ name: 'mock', async complete() { calls++; return CLEAN; }, async embed() { return null; } });
		try {
			const out = await generateComponent('a clean panel', []);
			expect(out.status).toBe('ok');
			if (out.status === 'ok') expect(out.refined).toBe(0);
			expect(calls).toBe(1); // exactly one call — the generation, no repair pass
		} finally {
			m.__setBackend(null);
		}
	});
});

// The effort dial: after generation, run N design self-refine rounds (low/medium/high/
// maximum → 0/1/2/3), each returning an improved, self-rated draft; keep the highest-
// rated compliant one (2026-07-19-component-effort-dial.md).
describe('generateComponent — effort dial (design self-refine)', () => {
	const draft = (css: string, rating?: number) => ({
		name: 'kpi-trio', description: 'Three KPIs.', function: 'statement', form: 'canvas', substance: 'structure',
		bucket: 'statement', tags: ['kpi', 'stat', 'metric'], adapt: { mode: 'native' }, capacity: { sweet: 3, soft: 3, hard: 3 },
		css: `section.kpi-trio > .cell-stage { ${css} }`, skeleton: '<!-- _class: kpi-trio -->\n\n## Numbers\n\n- 100\n- 200',
		...(rating == null ? {} : { rating }),
	});
	const GEN = draft('color:var(--pass);'); // the initial (clean) generation
	const ROUND1 = draft('color:var(--accent);', 8); // a better refinement
	const ROUND2 = draft('color:var(--warn);', 6); // a WORSE refinement (lower rating)

	const seqBackend = (replies: unknown[]) => {
		let i = 0;
		return { name: 'mock', async complete() { return replies[Math.min(i++, replies.length - 1)]; }, async embed() { return null; } };
	};
	async function withBackend(replies: unknown[], run: () => Promise<void>) {
		const m = (await architectModel()) as unknown as { __setBackend: (b: unknown) => void };
		m.__setBackend(seqBackend(replies));
		try { await run(); } finally { m.__setBackend(null); }
	}

	it('low effort runs ZERO refine rounds — one call, no design pass', async () => {
		let calls = 0;
		const m = (await architectModel()) as unknown as { __setBackend: (b: unknown) => void };
		m.__setBackend({ name: 'mock', async complete() { calls++; return GEN; }, async embed() { return null; } });
		try {
			const out = await generateComponent('three kpis', [], undefined, { effort: 'low' });
			expect(out.status).toBe('ok');
			if (out.status === 'ok') expect(out.improved).toBe(0);
			expect(calls).toBe(1);
		} finally {
			m.__setBackend(null);
		}
	});

	it('high effort keeps the highest-rated refinement and rejects a regression', async () => {
		await withBackend([GEN, ROUND1, ROUND2], async () => {
			const statuses: string[] = [];
			const out = await generateComponent('three kpis', [], undefined, { effort: 'high', onStatus: (s) => statuses.push(s.phase) });
			expect(out.status).toBe('ok');
			if (out.status !== 'ok') return;
			expect(out.improved).toBe(1); // round 1 accepted (rating 8); round 2 rejected (6 < 8)
			expect(out.draft.css).toContain('var(--accent)'); // round 1's design won
			expect(out.draft.css).not.toContain('var(--warn)'); // the regression was NOT kept
			expect(statuses).toContain('improving'); // the UI got a live "improving" signal
		});
	});

	it('reports gate-repair (refined) and design rounds (improved) independently', async () => {
		await withBackend([GEN, ROUND1], async () => {
			const out = await generateComponent('three kpis', [], undefined, { effort: 'medium' });
			if (out.status === 'ok') {
				expect(out.refined).toBe(0); // clean gen → no gate-repair
				expect(out.improved).toBe(1); // one accepted design round
			}
		});
	});

	it('rejects a round that does not beat its own baselineRating (effort-regression guard)', async () => {
		// The round rates the ORIGINAL a 9 (baselineRating) but its own output only a 7 — it
		// did NOT improve the craft, so the guard must reject it and keep the original draft,
		// even though 7 would beat the old ungraded bar (-1).
		const WORSE = { ...draft('color:var(--accent);', 7), baselineRating: 9 };
		await withBackend([GEN, WORSE], async () => {
			const out = await generateComponent('three kpis', [], undefined, { effort: 'medium' });
			expect(out.status).toBe('ok');
			if (out.status !== 'ok') return;
			expect(out.improved).toBe(0); // nothing cleared the baseline → no improvement counted
			expect(out.draft.css).toContain('var(--pass)'); // the original generation stands
			expect(out.draft.css).not.toContain('var(--accent)'); // the non-improving round was dropped
		});
	});

	it('accepts a round that DOES beat its baselineRating', async () => {
		// Same baseline (7) but the round rates its output an 8 → a genuine improvement, kept.
		const BETTER = { ...draft('color:var(--accent);', 8), baselineRating: 7 };
		await withBackend([GEN, BETTER], async () => {
			const out = await generateComponent('three kpis', [], undefined, { effort: 'medium' });
			expect(out.status).toBe('ok');
			if (out.status !== 'ok') return;
			expect(out.improved).toBe(1);
			expect(out.draft.css).toContain('var(--accent)');
		});
	});
});

// The manual refine (the Motion faculty's shape): the author gives a directed nudge
// and refineComponent applies it to the CURRENT draft, then gate-repairs it — no dedup,
// no effort loop (2026-07-19-component-refine.md).
describe('refineComponent — author-directed nudge', () => {
	const current = {
		name: 'kpi-trio', description: 'Three KPIs.', function: 'statement', form: 'canvas', substance: 'structure',
		bucket: 'statement', tags: ['kpi', 'stat', 'metric'], adapt: { mode: 'native' }, capacity: { sweet: 3, soft: 3, hard: 3 },
		density: null, css: 'section.kpi-trio > .cell-stage { color:var(--text-body); }', skeleton: '<!-- _class: kpi-trio -->\n\n## Numbers\n\n- 100\n- 200',
	} as unknown as Parameters<typeof refineComponent>[1];

	it('returns `nochange` for an empty instruction without touching the model', async () => {
		expect((await refineComponent('', current)).status).toBe('nochange');
		expect((await refineComponent('   ', current)).status).toBe('nochange');
	});

	it('returns `offline` with no model connected — never a fabricated refinement', async () => {
		expect((await refineComponent('make it bolder', current)).status).toBe('offline');
	});

	it('applies the nudge and gate-repairs the result (no dedup, no effort loop)', async () => {
		// The model returns the nudged draft (a bolder accent); refineComponent coerces +
		// gate-repairs it and hands back the ok outcome.
		const bolder = { ...current, css: 'section.kpi-trio > .cell-stage { color:var(--accent); font-size:var(--fs-hero); }' };
		const m = (await architectModel()) as unknown as { __setBackend: (b: unknown) => void };
		let calls = 0;
		m.__setBackend({ name: 'mock', async complete() { calls++; return bolder; }, async embed() { return null; } });
		try {
			const out = await refineComponent('make the numbers bigger and bolder', current);
			expect(out.status).toBe('ok');
			if (out.status !== 'ok') return;
			expect(out.draft.css).toContain('var(--accent)'); // the nudge landed
			expect(out.improved).toBe(0); // refine never runs the effort self-refine loop
			expect(out.similar).toEqual([]); // no dedup on a refine
			expect(calls).toBe(1); // clean result → one call, no gate-repair pass
		} finally {
			m.__setBackend(null);
		}
	});

	it('returns `nochange` when the model echoes the draft unchanged (no-op guard)', async () => {
		// The model applied nothing and handed the same component back — refineComponent must
		// not claim a refine that didn't happen; the author's draft already stands.
		const m = (await architectModel()) as unknown as { __setBackend: (b: unknown) => void };
		m.__setBackend({ name: 'mock', async complete() { return current; }, async embed() { return null; } });
		try {
			const out = await refineComponent('make it bolder', current);
			expect(out.status).toBe('nochange');
		} finally {
			m.__setBackend(null);
		}
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
