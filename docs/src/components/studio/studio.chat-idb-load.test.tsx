// The chat panel over the IndexedDB chat store (chat-store.ts): it shows the stored thread once the
// read lands, and saves nothing before then. Saving the stand-in it renders first (an empty thread)
// would replace the stored conversation, which is the data loss this test pins.
import 'fake-indexeddb/auto';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __clearPendingNotices, ArchitectChat } from './ArchitectChat';
import { __resetChatStoreForTests, chatsSettled, hydrateChat, readChat, writeChat } from './chat-store';

vi.mock('./architect', () => ({
	chatComplete: vi.fn(async () => ({ status: 'ok', reply: 'ok', proposed: null })),
	useArchitectStatus: () => ({ ready: true, generation: 'openrouter', modelName: 'test', remaining: null, price: { promptPerM: 1, completionPerM: 2 } }),
	applyProposedEditsChecked: (src: string) => ({ source: src, applied: 1, refusals: [] }),
	estimateUsd: () => 0.004,
	CHAT_OUTPUT_EST: 4096,
	chatSystemTokens: () => 0,
	agentTurnUsd: () => null,
	CHAT_MAX_TOKENS: 16384,
	architectSpend: () => ({ total: 0, session: 0, totalTokens: 0, sessionTokens: 0, cap: 0, mode: 'alert', status: { level: 'ok', blocked: false, message: null } }),
}));

const props = { deckId: 'deck-1', source: '# One\n', aiReady: true, onApply: () => {}, onConnect: () => {} };
const reload = () => __resetChatStoreForTests({ backend: 'idb' });
/** The stored thread, read from IndexedDB past this page's cache. */
async function stored(deckId: string): Promise<string[]> {
	await chatsSettled();
	reload();
	await hydrateChat(deckId);
	return readChat(deckId).map((m) => m.content);
}

beforeEach(() => {
	globalThis.indexedDB = new IDBFactory();
	localStorage.clear();
	__clearPendingNotices();
	reload();
});
afterEach(() => {
	cleanup();
	__resetChatStoreForTests();
});

describe('ArchitectChat over the IndexedDB chat store', () => {
	it('shows the stored thread once it loads, and does not save over it on mount', async () => {
		await writeChat('deck-1', [[{ role: 'user', content: 'an earlier question' }, { role: 'assistant', content: 'an earlier answer' }]]);
		reload(); // a fresh page: nothing loaded
		render(<ArchitectChat {...props} />);
		expect(await screen.findByText('an earlier answer')).toBeTruthy();
		expect(await stored('deck-1')).toEqual(['an earlier question', 'an earlier answer']);
	});

	it('switching away and straight back before the other deck loads never saves its stand-in over this deck', async () => {
		await writeChat('deck-1', [[{ role: 'user', content: 'deck one q' }, { role: 'assistant', content: 'deck one a' }]]);
		reload();
		const { rerender } = render(<ArchitectChat {...props} />);
		expect(await screen.findByText('deck one a')).toBeTruthy();
		// Two commits, back to back: deck 2's read (IndexedDB, a macrotask) has not landed in between.
		act(() => {
			rerender(<ArchitectChat {...props} deckId="deck-2" />);
		});
		act(() => {
			rerender(<ArchitectChat {...props} deckId="deck-1" />);
		});
		expect(await screen.findByText('deck one a')).toBeTruthy();
		await chatsSettled();
		expect(await stored('deck-1')).toEqual(['deck one q', 'deck one a']);
	});

	it('does not carry one deck thread into another deck on a switch', async () => {
		await writeChat('deck-1', [[{ role: 'user', content: 'deck one only' }]]);
		await writeChat('deck-2', [[{ role: 'user', content: 'deck two only' }]]);
		reload();
		const { rerender } = render(<ArchitectChat {...props} />);
		expect(await screen.findByText('deck one only')).toBeTruthy();
		reload(); // deck 2 is not loaded when the switch renders
		await act(async () => {
			rerender(<ArchitectChat {...props} deckId="deck-2" />);
		});
		expect(screen.queryByText('deck one only')).toBeNull(); // not shown under deck 2, even before its read lands
		expect(await screen.findByText('deck two only')).toBeTruthy();
		await waitFor(async () => expect(await stored('deck-2')).toEqual(['deck two only']));
	});
});
