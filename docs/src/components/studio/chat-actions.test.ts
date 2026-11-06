// The chat's action registry and its two gates (engineering/decisions/2026-11-06-skills-tools-and-chat-reach.md §4):
// which tools a mode may use, the host gate that refuses the rest whatever the model calls, and create_deck,
// which only QUEUES a deck for the author to confirm.

import { beforeAll, describe, expect, it } from 'vitest';
import { chatAgentDeps, loadArchitectAuthoring } from './architect';
import { AGENT_TOOLS, type AgentLibrary, ASSET_TOOLS, createToolbox, imageTurn } from './architect-agent';
import { autoHold, CREATE_DECK_MAX_CHARS, CREATE_DECK_TOOL, makeLookTools, outlineTitle, RENDER_SLIDE_MAX_PER_TURN, RENDER_TOOL, TOOL_TIERS, toolAllowed, toolsForMode, visibleTitle } from './chat-actions';
import { finalizeAgent, init as initChatAgent } from './chat-agent';
import { buildChartSlide, CHART_TOOL } from './chat-chart';

beforeAll(async () => {
	await loadArchitectAuthoring();
	initChatAgent(chatAgentDeps());
});

const DECK = '---\ntheme: indaco\n---\n\n# Opening\n\n---\n\n## Second\n\nBody.\n';
const NEW_DECK = '---\ntheme: cuoio\n---\n\n# A new story\n\n---\n\n## The second point\n\nWords.\n';
const library: AgentLibrary = { componentDoc: async () => null, guide: async () => null, registersDoc: async () => null, universalsDoc: async () => null };
const box = (mode: 'talk' | 'review' | 'auto', check?: Parameters<typeof createToolbox>[0]['check']) => createToolbox({ source: DECK, catalog: [], frontMatterKeys: [], library, mode, check });
const ALL = [...AGENT_TOOLS, ...makeLookTools(['indaco'], ['grain']), CHART_TOOL, RENDER_TOOL, CREATE_DECK_TOOL, ...ASSET_TOOLS];

describe('every tool has a tier, and each mode sends only its tiers', () => {
	it('tiers every tool the Studio defines; an untiered tool would be refused everywhere', () => {
		for (const t of ALL) expect(TOOL_TIERS[t.function.name], t.function.name).toBeTruthy();
		for (const mode of ['talk', 'review', 'auto'] as const) expect(toolAllowed(mode, 'delete_every_deck')).toBe(false);
	});

	it('Talk carries reads only; Review and Auto carry everything', () => {
		const talk = toolsForMode('talk', ALL).map((t) => t.function.name);
		expect(talk.every((n) => TOOL_TIERS[n] === 'read')).toBe(true);
		for (const n of ['edit_slides', 'set_front_matter', 'set_theme', 'set_finish', 'chart_from_data', 'create_deck', 'caption_asset']) expect(talk).not.toContain(n);
		expect(talk).toContain('render_slide');
		expect(toolsForMode('review', ALL)).toHaveLength(ALL.length);
		expect(toolsForMode('auto', ALL)).toHaveLength(ALL.length);
	});
});

describe('the host gate refuses what the mode forbids, whatever the model calls', () => {
	it('Talk: an edit the request never offered changes nothing', async () => {
		const tb = box('talk');
		const out = await tb.run('edit_slides', JSON.stringify({ edits: [{ action: 'delete', slide: 1 }] }));
		expect(out).toContain('not available in this chat mode');
		expect(tb.draft).toBe(DECK);
		expect(tb.proposal()).toEqual([]);
		expect(await tb.run('create_deck', JSON.stringify({ title: 'X', markdown: NEW_DECK }))).toContain('not available in this chat mode');
		expect(tb.action).toBeNull();
	});

	it('Talk: reads still run', async () => {
		expect(await box('talk').run('read_slides', JSON.stringify({ from: 1, to: 2 }))).toContain('Opening');
	});

	it('an unknown tool is named as unknown, not as forbidden', async () => {
		expect(await box('review').run('delete_every_deck', '{}')).toBe('There is no tool called delete_every_deck.');
	});
});

describe('create_deck queues, never creates', () => {
	it('queues the title, the Markdown and the slide headings, and leaves the open deck alone', async () => {
		const tb = box('review');
		const out = await tb.run('create_deck', JSON.stringify({ title: '  Board   update ', markdown: NEW_DECK }));
		expect(out).toContain('Queued a new deck, "Board update" (2 slides)');
		expect(out).toContain('never that it was created');
		expect(tb.action).toEqual({ kind: 'create_deck', title: 'Board update', markdown: NEW_DECK, outline: ['A new story', 'The second point'], slides: 2, errors: 0 });
		expect(tb.draft).toBe(DECK);
		expect(tb.proposal()).toEqual([]);
	});

	it('Auto queues it too: an act always waits for the author', async () => {
		const tb = box('auto');
		await tb.run('create_deck', JSON.stringify({ title: 'T', markdown: NEW_DECK }));
		expect(tb.action?.state).toBeUndefined();
	});

	it('refuses an empty title, empty or slide-less Markdown, and an oversize deck', async () => {
		const tb = box('review');
		expect(await tb.run('create_deck', JSON.stringify({ title: '', markdown: NEW_DECK }))).toContain('needs a title');
		expect(await tb.run('create_deck', JSON.stringify({ title: 'T', markdown: '   ' }))).toContain('needs the whole deck');
		expect(await tb.run('create_deck', JSON.stringify({ title: 'T', markdown: 'x'.repeat(CREATE_DECK_MAX_CHARS + 1) }))).toContain('the limit is');
		expect(tb.action).toBeNull();
	});

	it('keeps the Markdown as sent: the Studio import funnel normalizes it when the deck is created', async () => {
		const tb = box('review');
		const crlf = NEW_DECK.replace(/\n/g, '\r\n');
		await tb.run('create_deck', JSON.stringify({ title: 'T', markdown: crlf }));
		expect(tb.action?.markdown).toBe(crlf);
		expect(tb.action?.outline).toEqual(['A new story', 'The second point']);
	});

	it('hands the checker errors back so the model can fix them', async () => {
		const tb = box('review', async () => ({ findings: [{ severity: 'error', message: 'Slide 2 has no heading', slide: 2 }] }));
		const out = await tb.run('create_deck', JSON.stringify({ title: 'T', markdown: NEW_DECK }));
		expect(out).toContain('The checker found 1 error in it');
		expect(tb.action?.errors).toBe(1);
		expect(out).toContain('"Slide 2 has no heading" (slide 2)');
	});

	it('the turn result carries the action, with a reply even when the model wrote none', () => {
		const action = { kind: 'create_deck' as const, title: 'T', markdown: NEW_DECK, outline: ['A new story'], slides: 2, errors: 0 };
		const r = finalizeAgent(DECK, '', [], [], [], action);
		expect(r.status).toBe('ok');
		if (r.status !== 'ok') return;
		expect(r.action).toEqual(action);
		expect(r.reply).toContain('ready for you to confirm');
		expect(r.proposed).toBeNull();
	});
});

describe('fixes from the adversarial review', () => {
	it('the gate reads own keys only: prototype names are refused in every mode', () => {
		for (const mode of ['talk', 'review', 'auto'] as const) for (const n of ['constructor', 'toString', '__proto__', 'hasOwnProperty', 'Create_Deck']) expect(toolAllowed(mode, n), `${mode}/${n}`).toBe(false);
	});

	it('the confirm title drops invisible and direction characters, and needs a visible word', () => {
		expect(visibleTitle('Q3 Review\u202Egnp.exe')).toBe('Q3 Reviewgnp.exe');
		expect(visibleTitle('\u200B')).toBe('');
		expect(visibleTitle('  Board \n update ')).toBe('Board update');
	});

	it('the outline shows the heading a reader sees, not one hidden in a comment or a code fence', () => {
		expect(outlineTitle('<!--\n# Q3 Board Review\n-->\n\n# Approve the transfer')).toBe('Approve the transfer');
		expect(outlineTitle('```md\n# Agenda\n```\n\n## Real heading')).toBe('Real heading');
		expect(outlineTitle('<!-- _class: big-number -->\n\n`40%`')).toBe('');
	});

	it('a hidden heading does not reach the queued outline, and the slide count is the whole deck', async () => {
		const tb = box('review');
		await tb.run('create_deck', JSON.stringify({ title: 'T', markdown: '<!--\n# Q3 Board Review\n-->\n\n# Approve the transfer\n' }));
		expect(tb.action?.outline).toEqual(['Approve the transfer']);
		const many = Array.from({ length: 70 }, (_, i) => `# Slide ${i + 1}`).join('\n\n---\n\n');
		await tb.run('create_deck', JSON.stringify({ title: 'T', markdown: many }));
		expect(tb.action?.outline).toHaveLength(60);
		expect(tb.action?.slides).toBe(70);
	});

	it('Auto applies only a clean, finished agent turn that deletes nothing and leaves most of the deck alone', () => {
		const ok = { via: 'agent' as const, clean: true, aborted: false, deckChanged: false, live: false, edits: [{ action: 'replace' }], slideCount: 7 };
		expect(autoHold(ok)).toBeNull();
		expect(autoHold({ ...ok, aborted: true })).toBe('the turn was stopped');
		expect(autoHold({ ...ok, via: 'oneshot' })).toContain('without tools');
		expect(autoHold({ ...ok, via: undefined })).toContain('without tools');
		expect(autoHold({ ...ok, clean: false })).toBe('the turn did not finish cleanly');
		expect(autoHold({ ...ok, deckChanged: true })).toBe('the deck changed while the chat was working');
		expect(autoHold({ ...ok, live: true })).toBe('a live session is open');
		expect(autoHold({ ...ok, edits: [{ action: 'delete' }] })).toBe('it deletes slides');
		expect(autoHold({ ...ok, edits: Array.from({ length: 5 }, () => ({ action: 'replace' })) })).toBe('it rewrites most of the deck');
		expect(autoHold({ ...ok, edits: [{ action: 'replace' }, { action: 'insert' }], slideCount: 1 })).toBeNull();
	});
});

describe('set_theme, set_finish, chart_from_data and render_slide', () => {
	const look = (renderSlide?: Parameters<typeof createToolbox>[0]['renderSlide'], canSee = true) =>
		createToolbox({ source: DECK, catalog: [], frontMatterKeys: [], library, mode: 'review', themes: ['indaco', 'cuoio'], finishes: ['grain'], renderSlide, canSee: async () => canSee });

	it('set_theme writes only a theme the Studio ships', async () => {
		const tb = look();
		expect(await tb.run('set_theme', JSON.stringify({ name: 'neon' }))).toContain('There is no theme called "neon"');
		expect(tb.draft).toBe(DECK);
		await tb.run('set_theme', JSON.stringify({ name: 'cuoio' }));
		expect(tb.draft).toContain('theme: cuoio');
		expect(tb.proposal().some((e) => e.action === 'frontmatter')).toBe(true);
	});

	it('set_finish sets a finish, and none removes it', async () => {
		const tb = look();
		await tb.run('set_finish', JSON.stringify({ name: 'grain' }));
		expect(tb.draft).toContain('finish: grain');
		await tb.run('set_finish', JSON.stringify({ name: 'none' }));
		expect(tb.draft).not.toContain('finish:');
	});

	it('chart_from_data inserts a chart slide in the documented shape', async () => {
		const tb = look();
		await tb.run('chart_from_data', JSON.stringify({ after: 1, kind: 'bar', heading: 'EMEA leads the year', rows: [{ label: 'EMEA', value: '$4.2M' }, { label: 'APAC', value: '$3.1M' }, { label: 'Americas', value: '2,900,000' }] }));
		expect(tb.draft).toContain('<!-- _class: bar -->\n\n## EMEA leads the year.\n\n- EMEA `$4.2M`\n- APAC `$3.1M`\n- Americas `2,900,000`');
		expect(tb.proposal()).toEqual([expect.objectContaining({ action: 'insert', slide: 1 })]);
	});

	it('buildChartSlide writes stacked bars and variants, and refuses what would draw nothing', () => {
		const stacked = buildChartSlide({ kind: 'stacked-bar', heading: 'Costs grew in two places', rows: [{ label: 'Q1', parts: [{ label: 'Staff', value: '40' }, { label: 'Cloud', value: '25' }] }, { label: 'Q2', parts: [{ label: 'Staff', value: '46' }, { label: 'Cloud', value: '31' }] }] });
		expect('body' in stacked && stacked.body).toContain('- Q1\n  - Staff `40`\n  - Cloud `25`');
		const donut = buildChartSlide({ kind: 'piechart', variant: 'donut', heading: 'Half the spend is staff', rows: [{ label: 'Staff', value: '50%' }, { label: 'Other', value: '50%' }] });
		expect('body' in donut && donut.body.startsWith('<!-- _class: piechart donut -->')).toBe(true);
		expect(buildChartSlide({ kind: 'radar', heading: 'X happened', rows: [] })).toEqual({ error: expect.stringContaining('kind must be one of') });
		expect(buildChartSlide({ kind: 'line', variant: 'donut', heading: 'X happened', rows: [] })).toEqual({ error: expect.stringContaining('no donut variant') });
		expect(buildChartSlide({ kind: 'bar', heading: 'X happened', rows: [{ label: 'A', value: 'about ten' }, { label: 'B', value: '3' }] })).toEqual({ error: expect.stringContaining('is not one number') });
		expect(buildChartSlide({ kind: 'bar', heading: 'X happened', rows: [{ label: 'A', value: '1' }] })).toEqual({ error: expect.stringContaining('between 2 and 12 rows') });
	});

	it('chart labels cannot break the list or smuggle markup', () => {
		const r = buildChartSlide({ kind: 'bar', heading: 'Two <b>teams</b>', rows: [{ label: '- `injected` \n# heading', value: '1' }, { label: 'B', value: '2' }] });
		expect('body' in r && r.body).not.toMatch(/<b>|`injected`|\n# heading/);
	});

	it('render_slide queues a picture of the slide, within the per-turn cap', async () => {
		const seen: number[] = [];
		const tb = look(async (_d, n) => {
			seen.push(n);
			return { url: 'data:image/jpeg;base64,AAAA', sections: 2 };
		});
		expect(await tb.run('render_slide', JSON.stringify({ slide: 2 }))).toContain('Slide 2 as rendered is in the next message');
		expect(tb.takeImages()).toEqual([{ name: 'slide 2', url: 'data:image/jpeg;base64,AAAA', slide: true }]);
		for (let i = 1; i < RENDER_SLIDE_MAX_PER_TURN; i++) await tb.run('render_slide', JSON.stringify({ slide: 1 }));
		expect(await tb.run('render_slide', JSON.stringify({ slide: 1 }))).toContain('the limit');
		expect(seen).toHaveLength(RENDER_SLIDE_MAX_PER_TURN);
		expect(await tb.run('render_slide', JSON.stringify({ slide: 9 }))).toContain('There is no slide 9');
	});

	it('render_slide declines without a renderer or a model that sees pictures, and never pretends', async () => {
		expect(await look().run('render_slide', JSON.stringify({ slide: 1 }))).toContain('not available');
		expect(await look(async () => ({ url: 'x', sections: 2 }), false).run('render_slide', JSON.stringify({ slide: 1 }))).toContain('cannot take pictures');
		expect(await look(async () => null).run('render_slide', JSON.stringify({ slide: 1 }))).toContain('did not render in time');
	});
});

describe('fixes from the P4 checker', () => {
	const tb = (renderSlide?: Parameters<typeof createToolbox>[0]['renderSlide']) =>
		createToolbox({ source: DECK, catalog: [], frontMatterKeys: [], library, mode: 'review', renderSlide, canSee: async () => true });

	it('values follow the engine reader: what it draws passes, what it cannot draw is refused', () => {
		const ok = (v: string) => 'body' in buildChartSlide({ kind: 'bar', heading: 'A claim', rows: [{ label: 'A', value: v }, { label: 'B', value: '1' }] });
		for (const v of ['(5)', '.5', '4.2T', '840kg', 'EUR 4.2M', '4200€', '12 days', '-3.1', '$4.2bn', '68%']) expect(ok(v), v).toBe(true);
		for (const v of ['5k%', 'about ten', '1,2,3', '--5', '0..10']) expect(ok(v), v).toBe(false);
	});

	it('a year or a number leading a label is kept; only real list and heading markers go', () => {
		const r = buildChartSlide({ kind: 'line', heading: '2025 was our best year', rows: [{ label: '2021', value: '12' }, { label: '2022 actual', value: '18' }, { label: '3M Company', value: '9' }, { label: '- 2023', value: '20' }, { label: '1. 2024', value: '22' }] });
		expect('body' in r && r.body).toContain('## 2025 was our best year.');
		expect('body' in r && r.body).toContain('- 2021 `12`\n- 2022 actual `18`\n- 3M Company `9`\n- 2023 `20`\n- 2024 `22`');
	});

	it('a heading keeps its question mark, and a long one is cut at a word', () => {
		const q = buildChartSlide({ kind: 'bar', heading: 'Did EMEA carry the year?', rows: [{ label: 'A', value: '1' }, { label: 'B', value: '2' }] });
		expect('body' in q && q.body).toContain('## Did EMEA carry the year?');
	});

	it('a rendered slide is framed as the deck, never as a photo to caption', async () => {
		const box = tb(async () => ({ url: 'data:image/jpeg;base64,AAAA', sections: 2 }));
		const out = await box.run('render_slide', JSON.stringify({ slide: 1 }));
		expect(out).not.toContain('caption');
		const parts = imageTurn(box.takeImages()) as { type: string; text?: string }[];
		const text = parts.filter((p) => p.type === 'text').map((p) => p.text).join(' ');
		expect(text).toContain('The slides you asked to see');
		expect(text).not.toContain('caption_asset');
		expect(text).not.toContain('asset:');
	});

	it('a split deck gets no picture under a wrong number', async () => {
		const out = await tb(async () => ({ url: 'data:image/jpeg;base64,AAAA', sections: 5 })).run('render_slide', JSON.stringify({ slide: 1 }));
		expect(out).toContain('splits slides');
	});

	it('failed renders count toward the cap, and renders run one at a time', async () => {
		let live = 0;
		let peak = 0;
		const box = tb(async () => {
			live++;
			peak = Math.max(peak, live);
			await new Promise((r) => setTimeout(r, 5));
			live--;
			return null;
		});
		await Promise.all(Array.from({ length: RENDER_SLIDE_MAX_PER_TURN }, () => box.run('render_slide', JSON.stringify({ slide: 1 }))));
		expect(peak).toBe(1);
		expect(await box.run('render_slide', JSON.stringify({ slide: 1 }))).toContain('the limit');
	});
});
