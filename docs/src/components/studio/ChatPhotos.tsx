import { ImageOff, X } from 'lucide-react';
import * as React from 'react';
import { cn } from '@/lib/utils';
import { ensureAssetUrls, onAssetUrlsChanged, setActiveAssetDeck } from './media-urls';
import type { ChatPhoto } from './studio-store';

// Photos in the chat, as thumbnails: the strip above the composer (removable) and the row inside a
// sent message. Both read the Library's own name -> object-URL map (`media-urls.ts`), the same one
// the deck preview uses, so a photo shows here for exactly as long as it is on the shelf.

/** The Library's name -> URL map for THIS deck, re-read when the shelf changes. The deck is set here
 *  rather than assumed: the shell scopes the shelf lazily (only once a deck names a photo), and a
 *  photo kept for this deck is invisible to a map scoped to no deck at all. */
function useAssetUrls(deckId: string): Record<string, string> {
	const [urls, setUrls] = React.useState<Record<string, string>>({});
	React.useEffect(() => {
		let alive = true;
		const read = () =>
			setActiveAssetDeck(deckId)
				.then(() => ensureAssetUrls())
				.then(
				(m) => {
					if (alive) setUrls({ ...m });
				},
				() => {},
			);
		void read();
		const off = onAssetUrlsChanged(() => void read());
		return () => {
			alive = false;
			off();
		};
	}, [deckId]);
	return urls;
}

function Thumb({ photo, url, size, onRemove }: { photo: ChatPhoto; url?: string; size: number; onRemove?: () => void }) {
	return (
		<span className="relative inline-block shrink-0 overflow-hidden rounded-lg border border-border bg-[var(--bg-alt)]" style={{ width: size, height: size }} title={`asset:${photo.name}`}>
			{url ? (
				// A decorative thumbnail of a photo the author just chose: the filename is in the title.
				<img src={url} alt={`Attachment ${photo.name}`} className="size-full object-cover" draggable={false} />
			) : (
				<span className="grid size-full place-items-center text-muted-foreground" role="img" aria-label={`Attachment ${photo.name} is no longer in the Library`}>
					<ImageOff className="size-4" />
				</span>
			)}
			{onRemove && (
				<button type="button" onClick={onRemove} aria-label={`Remove ${photo.name}`} className="absolute right-0.5 top-0.5 grid size-5 place-items-center rounded-full bg-black/60 text-white hover:bg-black/80">
					<X className="size-3" />
				</button>
			)}
		</span>
	);
}

/** The photos waiting to be sent, above the composer. */
export function PhotoStrip({ photos, deckId, onRemove, busy }: { photos: ChatPhoto[]; deckId: string; onRemove: (name: string) => void; busy?: boolean }) {
	const urls = useAssetUrls(deckId);
	if (!photos.length && !busy) return null;
	return (
		<div className="flex flex-wrap items-center gap-1.5" data-testid="chat-photo-strip">
			{photos.map((p) => (
				<Thumb key={p.name} photo={p} url={urls[p.name]} size={52} onRemove={() => onRemove(p.name)} />
			))}
			{busy && (
				<span className="grid size-[52px] place-items-center rounded-lg border border-dashed border-border text-[10px] text-muted-foreground" role="status">
					Adding…
				</span>
			)}
			{photos.length > 0 && <span className="text-[10px] text-muted-foreground">billed each time they are sent</span>}
		</div>
	);
}

/** The photos a sent message carried, above its text. */
export function MessagePhotos({ photos, deckId, className }: { photos: ChatPhoto[]; deckId: string; className?: string }) {
	const urls = useAssetUrls(deckId);
	return (
		<div className={cn('flex flex-wrap justify-end gap-1.5', className)} data-testid="chat-message-photos">
			{photos.map((p) => (
				<Thumb key={p.name} photo={p} url={urls[p.name]} size={photos.length === 1 ? 128 : 76} />
			))}
		</div>
	);
}
