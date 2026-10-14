import { beforeAll, describe, expect, it, vi } from 'vitest';
import { type ArchitectModel, loadChatAgent } from './architect';

// The clip, followed from the chat agent to the model call: what `model.complete` is handed is what goes on the wire,
// so a `video_url` part that is missing here is a clip the provider never sees.
const CLIPS = [{ name: 'clip-ab12', dataUrl: 'data:video/mov;base64,AAAA' }];

function fakeModel() {
	const complete = vi.fn(async (_args: { messages: { role: string; content: unknown }[] }) => 'Done.');
	const model = {
		openRouterModel: () => 'google/gemini-3.8-flash',
		openRouterModelPrice: () => ({ promptPerM: 1, completionPerM: 1 }),
		listOpenRouterModels: async () => [{ id: 'google/gemini-3.8-flash', vision: true, video: true, aliasSlug: null }],
		complete,
	} as unknown as ArchitectModel;
	return { model, complete };
}

describe('a clip attached to the message reaches the model call', () => {
	let chatAgent: Awaited<ReturnType<typeof loadChatAgent>>['chatAgent'];
	beforeAll(async () => {
		({ chatAgent } = await loadChatAgent());
	});

	it('rides the last user message as a video_url part, beside the note that says it is there', async () => {
		const { model, complete } = fakeModel();
		await chatAgent(model, [{ role: 'user', content: 'what is in this video' }], '# A deck', undefined, { videos: CLIPS, grounding: { catalog: [], findings: [] } });
		const messages = complete.mock.calls[0][0].messages;
		const lastUser = messages.filter((m) => m.role === 'user').at(-1);
		const parts = lastUser?.content as { type: string; text?: string; video_url?: { url: string } }[];
		expect(Array.isArray(parts), JSON.stringify(lastUser).slice(0, 300)).toBe(true);
		expect(parts.find((p) => p.type === 'video_url')?.video_url?.url).toBe('data:video/mov;base64,AAAA');
		expect(parts.find((p) => p.type === 'text')?.text).toContain('short video');
	});
});
