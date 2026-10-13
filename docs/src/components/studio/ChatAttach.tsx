import { Check, ChevronLeft, FileBox, FileText, Film, Paperclip, Smartphone } from 'lucide-react';
import * as React from 'react';
import { PillTabs } from '@/components/ui/pill-tabs';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { useAssetUrls } from './ChatPhotos';
import { MAX_CHAT_PHOTOS, videoRefusal } from './chat-photo-parts';
import { listMedia, type MediaRecord, visibleMedia } from './media-store';
import { formatBytes, MAX_GROUND_DOCS } from './reference-doc';
import type { RefDocRecord } from './reference-doc-store';

// The chat's attach control. Two paths, and only two:
//
//   FROM THIS DEVICE   the phone's or computer's own picker, opened directly: photos, videos, take one now, or choose
//                      files. One `<input>` takes all of it and each file goes where its type says.
//   FROM YOUR LIBRARY  what the person already saved: photos, videos and files. It replaces the menu inside the SAME
//                      popover (a back arrow returns), so nothing is ever stacked on the native sheet.
//
// A photo or a clip is attached to THIS message. A file is a reference document: it grounds every reply until it is
// removed. Tapping a Library item attaches it at once and shows a check, so what is attached is always visible and a
// second tap takes it off; there is no separate "attach" button to forget to press.

type Tab = 'images' | 'videos' | 'files';

const clock = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.round(ms / 1000) % 60).padStart(2, '0')}`;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Why a saved clip cannot go in this message, in words, or null when it can. The same rule the device path applies. */
function clipRefusal(m: MediaRecord): string | null {
	return videoRefusal((m.durationMs ?? 0) / 1000, m.bytes);
}

export function ChatAttach({
	deckId,
	deviceAccept,
	onDeviceFiles,
	savedDocs,
	activeDocIds,
	onToggleDoc,
	onRefreshDocs,
	photoNames,
	videoNames,
	onTogglePhoto,
	onToggleVideo,
	onManage,
	hasAttachments,
}: {
	deckId: string;
	/** Everything the device picker should offer: photos, videos and the document types. */
	deviceAccept: string;
	/** The files the person picked from the device, copied out before anything awaits. */
	onDeviceFiles: (files: File[]) => void;
	savedDocs: RefDocRecord[];
	activeDocIds: ReadonlySet<string>;
	onToggleDoc: (rec: RefDocRecord) => void;
	onRefreshDocs: () => void;
	/** The Library photos and clip already attached to this message, by name. */
	photoNames: ReadonlySet<string>;
	videoNames: ReadonlySet<string>;
	onTogglePhoto: (m: MediaRecord) => void;
	onToggleVideo: (m: MediaRecord) => void;
	onManage?: () => void;
	hasAttachments: boolean;
}) {
	const [open, setOpen] = React.useState(false);
	const [view, setView] = React.useState<'menu' | 'library'>('menu');
	const [tab, setTab] = React.useState<Tab>('images');
	const [media, setMedia] = React.useState<MediaRecord[]>([]);
	const inputRef = React.useRef<HTMLInputElement>(null);
	const urls = useAssetUrls(deckId);

	const images = media.filter((m) => m.kind === 'image');
	const videos = media.filter((m) => m.kind === 'video');

	// Re-read the shelf each time the menu opens, so something saved from another surface shows up without a remount.
	const onOpenChange = (next: boolean) => {
		setOpen(next);
		if (!next) return;
		setView('menu');
		onRefreshDocs();
		void listMedia().then((all) => setMedia(visibleMedia(all, deckId)));
	};

	// The device picker is opened FROM THE TAP ITSELF, not from a timer after it: a browser only lets a tap open a file
	// picker, and on iOS a delayed `click()` can be dropped. The native sheet (Photo Library, Take Photo or Video, Choose
	// Files) is then the only thing on screen.
	const openDevice = () => {
		inputRef.current?.click();
		setOpen(false);
	};

	const openLibrary = () => {
		// Land on the first tab that has something, so the view is never an empty grid when another tab is full.
		setTab(images.length ? 'images' : videos.length ? 'videos' : savedDocs.length ? 'files' : 'images');
		setView('library');
	};

	const roomForPhotos = photoNames.size < MAX_CHAT_PHOTOS;

	const empty = (what: string) => (
		<div className="grid gap-2 px-4 py-6 text-center">
			<p className="text-[12px] text-muted-foreground">No {what} in your Library yet.</p>
			<button type="button" onClick={openDevice} className="mx-auto text-[12px] font-semibold text-[var(--accent)]">
				Add one from this device
			</button>
		</div>
	);

	return (
		// `relative`, so the device input below can sit exactly over the paperclip: see the comment on the input.
		<span className="relative inline-grid shrink-0">
			<Popover open={open} onOpenChange={onOpenChange}>
				<PopoverTrigger asChild>
					<button
						type="button"
						aria-label="Attach photos, videos or files"
						title="Attach photos, videos or files, from this device or your Library"
						className={cn('grid size-7 shrink-0 place-items-center rounded-md hover:bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]', hasAttachments ? 'text-[var(--accent)]' : 'text-muted-foreground')}
					>
						<Paperclip className="size-4" />
					</button>
				</PopoverTrigger>
				<PopoverContent align="start" collisionPadding={12} className="w-[min(92vw,22rem)] overflow-hidden p-0" data-testid="chat-attach">
					{view === 'menu' ? (
						<div className="grid p-1.5" role="menu" aria-label="Attach">
							<button type="button" role="menuitem" onClick={openDevice} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-[var(--accent-soft)]">
								<span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent)]">
									<Smartphone className="size-[18px]" aria-hidden />
								</span>
								<span className="min-w-0">
									<span className="block text-[13px] font-semibold text-[var(--text-heading)]">From this device</span>
									<span className="block text-[11.5px] leading-snug text-muted-foreground">Photo Library, take a photo or video, or choose files</span>
								</span>
							</button>
							<button type="button" role="menuitem" onClick={openLibrary} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-[var(--accent-soft)]">
								<span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent)]">
									<FileBox className="size-[18px]" aria-hidden />
								</span>
								<span className="min-w-0">
									<span className="block text-[13px] font-semibold text-[var(--text-heading)]">From your Library</span>
									<span className="block text-[11.5px] leading-snug text-muted-foreground">
										{images.length + videos.length + savedDocs.length === 0 ? 'Nothing saved yet' : [images.length && plural(images.length, 'photo'), videos.length && plural(videos.length, 'video'), savedDocs.length && plural(savedDocs.length, 'file')].filter(Boolean).join(' · ')}
									</span>
								</span>
							</button>
						</div>
					) : (
						<div className="flex max-h-[min(70vh,28rem)] flex-col">
							<div className="flex items-center gap-1 border-b border-border px-1.5 py-1.5">
								<button type="button" onClick={() => setView('menu')} aria-label="Back" className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:text-foreground">
									<ChevronLeft className="size-4" />
								</button>
								<span className="text-[13px] font-semibold text-[var(--text-heading)]">From your Library</span>
								{onManage && (
									<button type="button" onClick={() => { setOpen(false); onManage(); }} className="ml-auto shrink-0 pr-2 text-[11.5px] font-semibold text-[var(--accent)]">
										Open Library ↗
									</button>
								)}
							</div>
							<PillTabs
								ariaLabel="Library kind"
								className="px-2.5 pt-2"
								value={tab}
								onValueChange={(v) => setTab(v as Tab)}
								tabs={[
									{ value: 'images', label: `Photos${images.length ? ` ${images.length}` : ''}` },
									{ value: 'videos', label: `Videos${videos.length ? ` ${videos.length}` : ''}` },
									{ value: 'files', label: `Files${savedDocs.length ? ` ${savedDocs.length}` : ''}` },
								]}
							/>
							<div className="min-h-0 flex-1 overflow-y-auto p-2.5">
								{tab === 'images' &&
									(images.length === 0 ? (
										empty('photos')
									) : (
										<div className="grid grid-cols-3 gap-1.5">
											{images.map((m) => {
												const on = photoNames.has(m.name);
												const blocked = !on && !roomForPhotos;
												return (
													<button
														key={m.id}
														type="button"
														aria-pressed={on}
														aria-label={`${on ? 'Remove' : 'Attach'} ${m.name}`}
														disabled={blocked}
														title={blocked ? `A message can carry ${MAX_CHAT_PHOTOS} photos` : m.name}
														onClick={() => onTogglePhoto(m)}
														className={cn('relative aspect-square overflow-hidden rounded-lg border bg-[var(--bg-alt)] disabled:opacity-40', on ? 'border-[var(--accent)] ring-1 ring-[var(--accent)]' : 'border-border')}
													>
														{urls[m.name] ? <img src={urls[m.name]} alt="" className="size-full object-cover" draggable={false} loading="lazy" /> : null}
														{on && (
															<span className="absolute right-1 top-1 grid size-5 place-items-center rounded-full bg-[var(--accent)] text-[var(--on-accent)]">
																<Check className="size-3" aria-hidden />
															</span>
														)}
													</button>
												);
											})}
										</div>
									))}
								{tab === 'videos' &&
									(videos.length === 0 ? (
										empty('videos')
									) : (
										<ul className="grid gap-1.5">
											{videos.map((m) => {
												const on = videoNames.has(m.name);
												const why = on ? null : clipRefusal(m);
												return (
													<li key={m.id}>
														<button
															type="button"
															aria-pressed={on}
															aria-label={`${on ? 'Remove' : 'Attach'} ${m.name}`}
															disabled={!!why}
															onClick={() => onToggleVideo(m)}
															className={cn('flex w-full items-center gap-2.5 rounded-lg border p-1.5 text-left disabled:opacity-50', on ? 'border-[var(--accent)] bg-[var(--accent-soft)]' : 'border-border')}
														>
															<span className="relative grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-md bg-[var(--bg-alt)]">
																{m.poster ? <img src={m.poster} alt="" className="size-full object-cover" draggable={false} /> : <Film className="size-4 text-muted-foreground" aria-hidden />}
															</span>
															<span className="min-w-0 flex-1">
																<span className="block truncate text-[12.5px] font-medium text-[var(--text-heading)]">{m.name}</span>
																<span className="block font-mono text-[10px] text-muted-foreground">
																	{m.durationMs ? `${clock(m.durationMs)} · ` : ''}
																	{formatBytes(m.bytes)}
																</span>
																{why && <span className="block text-[10.5px] leading-snug text-[var(--fail,#b3261e)]">{why}</span>}
															</span>
															{on && <Check className="size-4 shrink-0 text-[var(--accent)]" aria-hidden />}
														</button>
													</li>
												);
											})}
										</ul>
									))}
								{tab === 'files' &&
									(savedDocs.length === 0 ? (
										empty('files')
									) : (
										<ul className="grid gap-1.5">
											{savedDocs.map((rec) => {
												const on = activeDocIds.has(rec.id);
												const blocked = !on && activeDocIds.size >= MAX_GROUND_DOCS;
												return (
													<li key={rec.id}>
														<button
															type="button"
															aria-pressed={on}
															aria-label={`${on ? 'Remove' : 'Attach'} ${rec.name}`}
															disabled={blocked}
															title={blocked ? `A reply can be grounded in ${MAX_GROUND_DOCS} files` : rec.name}
															onClick={() => onToggleDoc(rec)}
															className={cn('flex w-full items-center gap-2.5 rounded-lg border p-1.5 text-left disabled:opacity-50', on ? 'border-[var(--accent)] bg-[var(--accent-soft)]' : 'border-border')}
														>
															<span className="grid h-11 w-11 shrink-0 place-items-center rounded-md border border-border bg-card text-[var(--accent)]">
																<FileText className="size-4" aria-hidden />
															</span>
															<span className="min-w-0 flex-1">
																<span className="block truncate text-[12.5px] font-medium text-[var(--text-heading)]">{rec.name}</span>
																<span className="block font-mono text-[10px] text-muted-foreground">
																	{rec.docKind === 'pdf' ? 'PDF' : 'Text'} · {formatBytes(rec.bytes)} · every reply
																</span>
															</span>
															{on && <Check className="size-4 shrink-0 text-[var(--accent)]" aria-hidden />}
														</button>
													</li>
												);
											})}
										</ul>
									))}
							</div>
						</div>
					)}
				</PopoverContent>
			</Popover>
			{/* No `capture` attribute: on a phone the picker then offers Photo Library, Take Photo or Video and Choose Files,
			    which is the point. The files are COPIED OUT before anything awaits: a FileList is live and WebKit empties it.
			    NOT `hidden`. iOS anchors its sheet to the input element, and a `display:none` input has no box, so the sheet
			    floated mid-screen and to one side, nowhere near the paperclip (seen on a real iPhone). The input is laid out
			    over the paperclip instead, invisible and untouchable (the tap lands on the button beneath), so the sheet has
			    the paperclip to attach to. */}
			<input
				ref={inputRef}
				type="file"
				accept={deviceAccept}
				multiple
				tabIndex={-1}
				aria-hidden="true"
				className="pointer-events-none absolute inset-0 size-full opacity-0"
				data-testid="chat-attach-device"
				onChange={(e) => {
					const picked = Array.from(e.target.files ?? []);
					e.target.value = '';
					if (picked.length) onDeviceFiles(picked);
				}}
			/>
		</span>
	);
}
