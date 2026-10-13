import { ImageOff, Play, X } from 'lucide-react';
import * as React from 'react';
import { cn } from '@/lib/utils';
import { listMedia } from './media-store';
import { ensureAssetUrls, onAssetUrlsChanged, setActiveAssetDeck } from './media-urls';
import type { ChatPhoto, ChatVideo } from './studio-store';

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

/** The posters of the clips a strip or message names, read from the Library's Videos shelf (the thread keeps
 *  only a name). A clip no longer on the shelf has none, and shows the plain play tile. */
function useVideoPosters(videos: ChatVideo[], deckId: string): Record<string, string> {
	const [posters, setPosters] = React.useState<Record<string, string>>({});
	const key = videos.map((v) => v.name).join(' ');
	// biome-ignore lint/correctness/useExhaustiveDependencies: `key` is the names; `deckId` rescopes nothing here but keeps a deck switch honest.
	React.useEffect(() => {
		if (!key) return;
		let alive = true;
		void listMedia().then((all) => {
			if (!alive) return;
			const next: Record<string, string> = {};
			for (const m of all) if (m.kind === 'video' && m.poster && key.split(' ').includes(m.name)) next[m.name] = m.poster;
			setPosters(next);
		});
		return () => {
			alive = false;
		};
	}, [key, deckId]);
	return posters;
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

const clock = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.round(ms / 1000) % 60).padStart(2, '0')}`;

/** A clip: its first frame, a play mark and its length. */
function VideoThumb({ video, poster, size, onRemove }: { video: ChatVideo; poster?: string; size: number; onRemove?: () => void }) {
	return (
		<span className="relative inline-block shrink-0 overflow-hidden rounded-lg border border-border bg-[var(--bg-alt)]" style={{ width: size, height: size }} title={`Video, ${clock(video.durationMs)}`}>
			{poster ? <img src={poster} alt={`Video ${video.name}`} className="size-full object-cover" draggable={false} /> : <span className="block size-full" role="img" aria-label={`Video ${video.name}`} />}
			<span className="absolute inset-0 grid place-items-center text-white" aria-hidden>
				<Play className="size-5 drop-shadow" fill="currentColor" />
			</span>
			<span className="absolute bottom-0.5 left-0.5 rounded bg-black/60 px-1 font-mono text-[9px] text-white">{clock(video.durationMs)}</span>
			{onRemove && (
				<button type="button" onClick={onRemove} aria-label={`Remove ${video.name}`} className="absolute right-0.5 top-0.5 grid size-5 place-items-center rounded-full bg-black/60 text-white hover:bg-black/80">
					<X className="size-3" />
				</button>
			)}
		</span>
	);
}

/** The photos and video waiting to be sent, above the composer. */
export function PhotoStrip({ photos, videos = [], deckId, onRemove, onRemoveVideo, busy }: { photos: ChatPhoto[]; videos?: ChatVideo[]; deckId: string; onRemove: (name: string) => void; onRemoveVideo?: (name: string) => void; busy?: boolean }) {
	const urls = useAssetUrls(deckId);
	const posters = useVideoPosters(videos, deckId);
	if (!photos.length && !videos.length && !busy) return null;
	return (
		<div className="flex flex-wrap items-center gap-1.5" data-testid="chat-photo-strip">
			{photos.map((p) => (
				<Thumb key={p.name} photo={p} url={urls[p.name]} size={52} onRemove={() => onRemove(p.name)} />
			))}
			{videos.map((v) => (
				<VideoThumb key={v.name} video={v} poster={posters[v.name] ?? v.poster} size={52} onRemove={() => onRemoveVideo?.(v.name)} />
			))}
			{busy && (
				<span className="grid size-[52px] place-items-center rounded-lg border border-dashed border-border text-[10px] text-muted-foreground" role="status">
					Adding…
				</span>
			)}
			{photos.length + videos.length > 0 && <span className="text-[10px] text-muted-foreground">billed each time they are sent</span>}
		</div>
	);
}

/** The photos a sent message carried, above its text. */
export function MessagePhotos({ photos, videos = [], deckId, className }: { photos: ChatPhoto[]; videos?: ChatVideo[]; deckId: string; className?: string }) {
	const urls = useAssetUrls(deckId);
	const posters = useVideoPosters(videos, deckId);
	return (
		<div className={cn('flex flex-wrap justify-end gap-1.5', className)} data-testid="chat-message-photos">
			{photos.map((p) => (
				<Thumb key={p.name} photo={p} url={urls[p.name]} size={photos.length + videos.length === 1 ? 128 : 76} />
			))}
			{videos.map((v) => (
				<VideoThumb key={v.name} video={v} poster={posters[v.name] ?? v.poster} size={photos.length + videos.length === 1 ? 128 : 76} />
			))}
		</div>
	);
}
