import { Check, FileBox, FileText, Film, Paperclip, TriangleAlert } from 'lucide-react';
import * as React from 'react';
import { PillTabs } from '@/components/ui/pill-tabs';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { useAssetUrls } from './ChatPhotos';
import { MAX_CHAT_PHOTOS, videoRefusal } from './chat-photo-parts';
import { listMedia, type MediaRecord, visibleMedia } from './media-store';
import { formatBytes, MAX_GROUND_DOCS } from './reference-doc';
import type { RefDocRecord } from './reference-doc-store';

// The chat's attach control. Two paths, and only two, each its own control in the composer:
//
//   THE PAPERCLIP      "From this device": the phone's or computer's own picker, opened by a tap that lands ON the file
//                      input, so the browser shows its sheet (Photo Library, Take Photo or Video, Choose Files) right there.
//                      One `<input>` takes it all and each file goes where its type says.
//   THE LIBRARY BUTTON "From your Library": what the person already saved (photos, videos, files) in a popover.
//
// Why two controls and not one menu. A first version put both behind one paperclip menu and opened the input with
// `click()` from the menu row. iOS puts its sheet next to the tap that opened it, so on a real iPhone the native sheet
// floated mid-screen, well above the paperclip, whether the input was `hidden` or laid over the paperclip (two screen
// recordings, identical position). A tap that lands on the input itself is the pattern iOS anchors correctly, and it
// removes our menu from the device path altogether: nothing is stacked on the native sheet.
//
// The two controls are 32px with 8px between them, and the paperclip's wrapper clips the input to its own box. iOS moves a
// tap toward the nearest clickable thing, so two 28px targets 2px apart let a Library tap land on the input beside it, and a
// file input can paint its inner button past its box. The Library button sits above the paperclip (`z-10`) as a last guard.
//
// A photo or a clip is attached to THIS message. A file is a reference document: it grounds every reply until it is
// removed. Tapping a Library item attaches it at once and shows a check, so what is attached is always visible and a
// second tap takes it off; there is no separate "attach" button to forget to press.

type Tab = 'images' | 'videos' | 'files';

const clock = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.round(ms / 1000) % 60).padStart(2, '0')}`;

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
	const [tab, setTab] = React.useState<Tab>('images');
	const [media, setMedia] = React.useState<MediaRecord[]>([]);
	const urls = useAssetUrls(deckId);

	const images = media.filter((m) => m.kind === 'image');
	const videos = media.filter((m) => m.kind === 'video');

	// Re-read the shelf each time the Library opens, so something saved from another surface shows up without a remount,
	// and land on the first tab that has something so the view is never an empty grid while another tab is full.
	const onOpenChange = (next: boolean) => {
		setOpen(next);
		if (!next) return;
		onRefreshDocs();
		void listMedia().then((all) => {
			const seen = visibleMedia(all, deckId);
			setMedia(seen);
			setTab(seen.some((m) => m.kind === 'image') ? 'images' : seen.some((m) => m.kind === 'video') ? 'videos' : savedDocs.length ? 'files' : 'images');
		});
	};

	const roomForPhotos = photoNames.size < MAX_CHAT_PHOTOS;

	const empty = (what: string) => (
		<div className="grid gap-1 px-4 py-6 text-center">
			<p className="text-[12px] text-muted-foreground">No {what} in your Library yet.</p>
			<p className="text-[11.5px] text-muted-foreground">Add some from this device with the paperclip, or in the Library panel.</p>
		</div>
	);

	return (
		<span className="flex shrink-0 items-center gap-2">
			{/* FROM THIS DEVICE. The tap lands on the input itself (its own box, invisible, over the icon), so iOS shows its
			    sheet anchored here. No `capture` attribute: on a phone the picker then offers Photo Library, Take Photo or
			    Video and Choose Files, which is the point. The files are COPIED OUT before anything awaits: a FileList is
			    live and WebKit empties it. */}
			<span
				className={cn(
					'relative grid size-8 shrink-0 place-items-center overflow-hidden rounded-md hover:bg-[color-mix(in_srgb,var(--accent)_10%,transparent)] focus-within:ring-2 focus-within:ring-[var(--accent)]',
					hasAttachments ? 'text-[var(--accent)]' : 'text-muted-foreground',
				)}
				title="Attach photos, videos or files from this device"
			>
				<Paperclip className="size-4" aria-hidden />
				<input
					type="file"
					accept={deviceAccept}
					multiple
					aria-label="Attach from this device"
					className="absolute inset-0 size-full cursor-pointer opacity-0"
					data-testid="chat-attach-device"
					onChange={(e) => {
						const picked = Array.from(e.target.files ?? []);
						e.target.value = '';
						if (picked.length) onDeviceFiles(picked);
					}}
				/>
			</span>
			{/* FROM YOUR LIBRARY. */}
			<Popover open={open} onOpenChange={onOpenChange}>
				<PopoverTrigger asChild>
					<button
						type="button"
						aria-label="Attach from your Library"
						title="Attach photos, videos or files from your Library"
						className="relative z-10 grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]"
					>
						<FileBox className="size-4" aria-hidden />
					</button>
				</PopoverTrigger>
				<PopoverContent align="end" collisionPadding={12} className="w-[min(92vw,22rem)] overflow-hidden p-0" data-testid="chat-attach">
						<div className="flex max-h-[min(70vh,28rem)] flex-col">
							<div className="flex items-center gap-1 border-b border-border px-3 py-2">
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
															className={cn('flex w-full items-start gap-2.5 rounded-lg border p-1.5 text-left', on ? 'border-[var(--accent)] bg-[var(--accent-soft)]' : 'border-border')}
														>
															<span className={cn('relative grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-md bg-[var(--bg-alt)]', why && 'opacity-60')}>
																{m.poster ? <img src={m.poster} alt="" className="size-full object-cover" draggable={false} /> : <Film className="size-4 text-muted-foreground" aria-hidden />}
															</span>
															<span className="min-w-0 flex-1">
																<span className={cn('block', why && 'opacity-60')}>
																	<span className="block truncate text-[12.5px] font-medium text-[var(--text-heading)]">{m.name}</span>
																	<span className="block font-mono text-[10px] text-muted-foreground">
																		{m.durationMs ? `${clock(m.durationMs)} · ` : ''}
																		{formatBytes(m.bytes)}
																	</span>
																</span>
																{/* Why it cannot be attached: full-strength text (the row is not dimmed over it), with the warning mark in the failure
																    color. Red text on the dark card at 10px, under a half-faded row, was unreadable. */}
																{why && (
																	<span className="mt-1 flex items-start gap-1.5 text-[12px] leading-snug text-[var(--text-heading)]" data-testid="clip-refusal">
																		<TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-[var(--fail,#b3261e)]" aria-hidden />
																		<span>{why}</span>
																	</span>
																)}
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
				</PopoverContent>
			</Popover>
		</span>
	);
}
