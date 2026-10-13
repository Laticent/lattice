import { beforeAll, describe, expect, it } from 'vitest';
import { type AgentAssets, type AssetInfo, cleanCaption, MAX_VIEWS_PER_TURN } from './agent-assets';
import { chatAgentDeps } from './architect';
import { AGENT_TOOLS, type AgentComplete, type AgentLibrary, ASSET_TOOLS, createToolbox, runAgentLoop, type ToolCall } from './architect-agent';
import { init as initChatAgent } from './chat-agent';

beforeAll(() => initChatAgent(chatAgentDeps()));

const LIB: AgentLibrary = { componentDoc: async () => null, guide: async () => null, registersDoc: async () => null, universalsDoc: async () => null };
const DECK = '---\ntheme: indaco\n---\n\n<!-- _class: title -->\n# Hi';

const info = (name: string, over: Partial<AssetInfo> = {}): AssetInfo => ({ name, kind: 'image', width: 3000, height: 2000, bytes: 1000, scope: 'library', ...over });

/** A fake Library that records what the toolbox asked of it. */
function fakeAssets(items: AssetInfo[]) {
	const calls = { thumbnails: [] as string[], captions: [] as [string, string][] };
	const assets: AgentAssets = {
		list: async () => items.map((a) => ({ ...a })),
		thumbnail: async (name) => {
			calls.thumbnails.push(name);
			return `data:image/jpeg;base64,${name}`;
		},
		setCaption: async (name, caption) => {
			calls.captions.push([name, caption]);
			return items.some((a) => a.name === name) ? cleanCaption(caption) : null;
		},
	};
	return { assets, calls };
}

const box = (assets: AgentAssets | undefined, canSee = true) => createToolbox({ source: DECK, catalog: [], frontMatterKeys: [], library: LIB, assets, canSee: async () => canSee });

describe('asset tools in the tool list', () => {
	it('are a separate set, so a Library-less turn keeps the tool prefix it always had', () => {
		const names = (t: readonly { function: { name: string } }[]) => t.map((x) => x.function.name);
		expect(names(ASSET_TOOLS)).toEqual(['list_assets', 'view_asset', 'caption_asset']);
		expect(names(AGENT_TOOLS)).not.toContain('view_asset');
	});
});

describe('view_asset', () => {
	it('queues thumbnails for uncaptioned photos and tells the model to caption them', async () => {
		const { assets, calls } = fakeAssets([info('a'), info('b')]);
		const t = box(assets);
		const out = await t.run('view_asset', JSON.stringify({ names: ['a', 'asset:b'] }));
		expect(out).toContain('a: shown in the next message');
		expect(out).toContain('b: shown in the next message');
		expect(out).toContain('caption_asset');
		expect(calls.thumbnails).toEqual(['a', 'b']);
		expect(t.takeImages().map((i) => i.name)).toEqual(['a', 'b']);
		expect(t.takeImages()).toEqual([]);
	});

	it('answers a captioned photo with its caption and spends no picture on it', async () => {
		const { assets, calls } = fakeAssets([info('a', { caption: 'Two people at a workbench' })]);
		const t = box(assets);
		const out = await t.run('view_asset', JSON.stringify({ names: ['a'] }));
		expect(out).toContain('already captioned — "Two people at a workbench"');
		expect(calls.thumbnails).toEqual([]);
		expect(t.takeImages()).toEqual([]);
		await t.run('view_asset', JSON.stringify({ names: ['a'], again: true }));
		expect(calls.thumbnails).toEqual(['a']);
	});

	it('declines honestly when the model cannot read images, and sends nothing', async () => {
		const { assets, calls } = fakeAssets([info('a')]);
		const t = box(assets, false);
		const out = await t.run('view_asset', JSON.stringify({ names: ['a'] }));
		expect(out).toContain('cannot read images');
		expect(calls.thumbnails).toEqual([]);
		expect(t.takeImages()).toEqual([]);
	});

	it('caps the pictures in one turn', async () => {
		const names = Array.from({ length: MAX_VIEWS_PER_TURN + 2 }, (_, i) => `p${i}`);
		const { assets } = fakeAssets(names.map((n) => info(n)));
		const t = box(assets);
		const out = await t.run('view_asset', JSON.stringify({ names }));
		expect(t.takeImages()).toHaveLength(MAX_VIEWS_PER_TURN);
		expect(out).toContain(`you have looked at ${MAX_VIEWS_PER_TURN} photos this turn`);
	});

	it('refuses to show a video, and names near misses for an unknown asset', async () => {
		const { assets } = fakeAssets([info('reel', { kind: 'video' }), info('shop-floor')]);
		const t = box(assets);
		const out = await t.run('view_asset', JSON.stringify({ names: ['reel', 'shop'] }));
		expect(out).toContain('reel: a video');
		expect(out).toContain('shop: no such asset (did you mean shop-floor?)');
	});
});

describe('caption_asset', () => {
	it('saves a caption only for a photo whose picture was delivered', async () => {
		const { assets, calls } = fakeAssets([info('a'), info('b')]);
		const t = box(assets);
		await t.run('view_asset', JSON.stringify({ names: ['a'] }));
		t.takeImages(); // the loop delivers the picture message between the two rounds
		const out = await t.run('caption_asset', JSON.stringify({ captions: [{ name: 'a', caption: 'A "red" door' }, { name: 'b', caption: 'Invented' }] }));
		expect(out).toContain('a: saved.');
		expect(out).toContain('b: not saved — you have not been shown this photo yet');
		expect(calls.captions).toEqual([['a', 'A "red" door']]);
		// The same turn now reads the cleaned caption back from the list.
		expect(await t.run('list_assets', JSON.stringify({ query: 'red' }))).toContain("A 'red' door");
	});
});

describe('a caption needs a picture that was actually delivered', () => {
	it('refuses view_asset and caption_asset sent in the SAME assistant message', async () => {
		const { assets, calls } = fakeAssets([info('a')]);
		const t = box(assets);
		const call = (name: string, args: unknown): ToolCall => ({ id: `c-${name}`, function: { name, arguments: JSON.stringify(args) } });
		let round = 0;
		const complete: AgentComplete = async () => {
			round++;
			return round === 1 ? { text: '', toolCalls: [call('view_asset', { names: ['a'] }), call('caption_asset', { captions: [{ name: 'a', caption: 'INVENTED' }] })], truncated: false } : { text: 'ok', toolCalls: [], truncated: false };
		};
		await runAgentLoop({ complete, messages: [{ role: 'user', content: 'x' }], toolbox: t });
		expect(calls.captions).toEqual([]);
		// After delivery the same caption is accepted.
		expect(await t.run('caption_asset', JSON.stringify({ captions: [{ name: 'a', caption: 'A door' }] }))).toContain('a: saved.');
		expect(calls.captions).toEqual([['a', 'A door']]);
	});

	it('does not queue pictures when the next round is the last, which has no tools to caption with', async () => {
		const { assets, calls } = fakeAssets([info('a')]);
		const t = box(assets);
		t.setLastRoundNext(true);
		const out = await t.run('view_asset', JSON.stringify({ names: ['a'] }));
		expect(out).toContain('last round');
		expect(calls.thumbnails).toEqual([]);
		expect(t.takeImages()).toEqual([]);
	});

	it('tells the loop the next round is the last one', async () => {
		const flags: boolean[] = [];
		const call: ToolCall = { id: 'c', function: { name: 'list_assets', arguments: '{}' } };
		const complete: AgentComplete = async () => ({ text: '', toolCalls: [call], truncated: false });
		await runAgentLoop({ complete, messages: [{ role: 'user', content: 'x' }], maxRounds: 3, toolbox: { run: async () => 'r', setLastRoundNext: (v) => flags.push(v) } });
		expect(flags).toEqual([false, true]);
	});
});

describe('a caption that is not a string', () => {
	it('is refused, never stored as "[object Object]", and never clears an existing caption', async () => {
		const { assets, calls } = fakeAssets([info('a', { caption: 'Keep me' })]);
		const t = box(assets);
		await t.run('view_asset', JSON.stringify({ names: ['a'], again: true }));
		t.takeImages();
		const out = await t.run('caption_asset', JSON.stringify({ captions: [{ name: 'a', caption: { evil: true } }, { name: 'a', caption: '   ' }] }));
		expect(out.match(/non-empty string/g)).toHaveLength(2);
		expect(calls.captions).toEqual([]);
		expect(await t.run('list_assets', '{}')).toContain('"Keep me"');
	});
});

describe('with no Library', () => {
	it('answers that there is none instead of failing', async () => {
		const t = box(undefined);
		expect(await t.run('list_assets', '{}')).toContain('no Library');
		expect(await t.run('view_asset', JSON.stringify({ names: ['a'] }))).toContain('no Library');
	});
});

describe('the loop hands pictures over', () => {
	it('sends them as one user turn after the tool results, labeled by name', async () => {
		const { assets } = fakeAssets([info('a')]);
		const t = box(assets);
		const seen: unknown[][] = [];
		const call = (name: string, args: unknown): ToolCall => ({ id: `c-${name}`, function: { name, arguments: JSON.stringify(args) } });
		let round = 0;
		const complete: AgentComplete = async (msgs) => {
			seen.push(msgs.map((m) => m));
			round++;
			if (round === 1) return { text: '', toolCalls: [call('view_asset', { names: ['a'] })], truncated: false };
			return { text: 'The first photo suits the hero slot.', toolCalls: [], truncated: false };
		};
		const turn = await runAgentLoop({ complete, messages: [{ role: 'user', content: 'collage please' }], toolbox: t });
		expect(turn.reply).toContain('hero slot');
		const second = seen[1] as { role: string; content: unknown }[];
		const lastMsg = second[second.length - 1];
		expect(lastMsg.role).toBe('user');
		const parts = lastMsg.content as { type: string; text?: string; image_url?: { url: string } }[];
		expect(parts.some((p) => p.type === 'text' && p.text === 'asset:a')).toBe(true);
		expect(parts.find((p) => p.type === 'image_url')?.image_url?.url).toContain('data:image/jpeg');
		// The turn ends on text so the cache breakpoint can mark it (or-cache.js withCachedTail).
		expect(parts[parts.length - 1].type).toBe('text');
		// The tool result precedes the picture turn.
		expect(second[second.length - 2].role).toBe('tool');
	});
});
