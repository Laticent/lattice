// What the Studio says about its own storage, loaded after boot (the route budget: none of it is
// needed to paint). Two things:
//   · a chat thread that could not be stored or read (chat-store.ts), each kind once a minute at
//     most. chat-store holds a failure raised before this module subscribes, so none is lost;
//   · once a session, about 15 s after boot, a warning when localStorage (where deck text lives)
//     is past 80% of its allowance (local-quota.ts). A refused deck save is reported when it
//     happens, which is too late to help.

import { notifySticky } from '@/lib/notify';
import { onChatStoreError, scheduleChatMigration } from './chat-store';
import { describeLocalUse, localStorageUse } from './local-quota';

/** Start both; returns the cleanup. */
export function startStorageNotices(): () => void {
	// Per kind, and the lost database apart from a deck's failed read: it is said once, and a deck's
	// notice a moment before must not swallow it.
	const shownAt: Record<string, number> = {};
	const unsubscribe = onChatStoreError(({ deckId, error, kind }) => {
		const slot = kind === 'read' && !deckId ? 'open' : kind;
		if (Date.now() - (shownAt[slot] ?? Number.NEGATIVE_INFINITY) < 60_000) return;
		shownAt[slot] = Date.now();
		if (kind === 'read') {
			notifySticky(deckId ? "Couldn't read this deck's chat." : "Couldn't open this browser's chat storage.", {
				description: deckId
					? 'The saved conversation is not deleted, and new messages are not saved over it this session. Reload to try again.'
					: 'Saved conversations may look empty and are left out of a backup until it opens again. Nothing is deleted; reload to try again.',
				label: 'OK',
				onClick: () => {},
			});
			return;
		}
		const full = error instanceof DOMException && error.name === 'QuotaExceededError';
		notifySticky(full ? "Couldn't save the chat: this browser's storage is full." : "Couldn't save the chat to this browser.", {
			description: 'The conversation stays on screen until you reload. Free space in Workspace → Privacy & Data.',
			label: 'OK',
			onClick: () => {},
		});
	});

	// Move chats out of localStorage once the page is idle.
	scheduleChatMigration();

	let cancelled = false;
	const check = () => {
		if (cancelled) return;
		const use = localStorageUse();
		if (!use.warn) return;
		notifySticky(`Deck storage in this browser is ${Math.round(use.fraction * 100)}% full.`, {
			description: `${describeLocalUse(use)}. When it fills, deck edits stop saving. Download a backup and delete decks you no longer need in Workspace → Privacy & Data.`,
			label: 'OK',
			onClick: () => {},
		});
	};
	// After the chat migration has had its chance to free space, so a warning it would have made moot is not shown.
	const timer = setTimeout(() => {
		const idle = (globalThis as { requestIdleCallback?: (fn: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
		if (idle) idle(check, { timeout: 10_000 });
		else check();
	}, 15_000);
	return () => {
		cancelled = true;
		clearTimeout(timer);
		unsubscribe();
	};
}
