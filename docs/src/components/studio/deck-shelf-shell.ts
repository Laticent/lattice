// The Studio shell's side of the deck shelf (vault slice 3), loaded after the first paint, so none of it is in the
// eager bundle. Two jobs:
//   · read the vault onto the shelf at the first idle moment, and open the boot deck from it when the boot deck was
//     too big for the pre-paint cache (studio-store `BOOT_CACHE_MAX`);
//   · take another tab's save of the open deck. Its text and ours are already merged in the vault (deck-doc
//     `localSave`). When the editor still shows what it was merged from, the result goes in as one undo step;
//     otherwise the shell saves now, so the merge folds in what was typed since and comes back once more.
// As built: engineering/decisions/2026-11-28-vault-slice-3-as-built.md.
import type { SourceIntent } from './studio-filo';
import { acceptDeckText, decksReady, loadSource, onDeckMerged } from './studio-store';

export type ShelfShell = {
	/** The open deck's id, and the deck the shown source belongs to. */
	deckId(): string;
	owner(): string;
	/** The latest text the editor holds. */
	source(): string;
	setSource(text: string, intent: SourceIntent): void;
	cancelAutosave(): void;
	flush(): void;
	cleared(): boolean;
	/** False when the boot deck was a vault deck this tab had not read yet: its placeholder is replaced. */
	bootShown: boolean;
	load: SourceIntent;
};

export function startShelf(s: ShelfShell): () => void {
	let gone = false;
	const id = s.deckId();
	const start = () => {
		void decksReady()
			.then(() => {
				if (gone || s.bootShown || s.deckId() !== id || s.owner() !== id) return;
				const text = loadSource(id);
				if (text != null && text !== s.source()) {
					s.setSource(text, s.load);
					acceptDeckText(id, text);
				}
			})
			.catch((e) => console.warn('lattice: the deck shelf could not read the storage vault', e));
	};
	const ric = (globalThis as { requestIdleCallback?: (fn: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
	if (typeof ric === 'function') ric(start, { timeout: 2000 });
	else setTimeout(start, 0);
	const stop = onDeckMerged(({ deckId, from, text }) => {
		if (deckId !== s.deckId() || s.cleared()) return;
		if (s.source() === from) {
			s.cancelAutosave();
			s.setSource(text, { label: 'Changes from another tab', origin: 'sync' });
			acceptDeckText(deckId, text);
		} else s.flush();
	});
	return () => {
		gone = true;
		stop();
	};
}
