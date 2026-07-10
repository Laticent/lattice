import { ChevronDown, Loader2, PlayCircle } from 'lucide-react';
import * as React from 'react';
import { cn } from '@/lib/utils';
import {
	emptyTtsMessage,
	filterTtsModels,
	groupByVendor,
	shortName,
	TTS_VIEWS,
	ttsPriceLabel,
} from '@/playground/tts-catalog.js';
import type { OrVoiceModel } from './read-aloud';

// The OpenRouter TTS-model picker — the speech-model twin of ModelPicker.tsx (text
// generation), same interaction shape: collapsed summary + meta line → expand →
// search + Featured/Value/Free/All tabs → vendor-grouped, priced rows. The one
// addition a chat-model picker doesn't need: an inline ▶ Play button per row, so
// browsing the list previews it — no separate "pick a model, then pick a voice,
// then click a different Play button" round trip for the common case (hearing
// this model's default voice). Picking the row itself (the radio) still just
// selects the model; Play is a distinct, explicit action next to it.
export function TtsModelPicker({
	models,
	selectedId,
	onPick,
	onPlay,
	playingId,
	disabled,
}: {
	models: OrVoiceModel[] | null;
	selectedId: string;
	onPick: (m: OrVoiceModel) => void;
	onPlay: (m: OrVoiceModel) => void;
	/** The id currently previewing (busy), or null — drives the row's Play/spinner state. */
	playingId: string | null;
	disabled?: boolean;
}) {
	const [open, setOpen] = React.useState(false);
	const [view, setView] = React.useState<string>('featured');
	const [query, setQuery] = React.useState('');
	const searchRef = React.useRef<HTMLInputElement>(null);

	const current = React.useMemo(
		() => (models && selectedId ? models.find((m) => m.id === selectedId) : null) ?? null,
		[models, selectedId],
	);
	const groups = React.useMemo(() => groupByVendor(filterTtsModels(models ?? [], view, query)), [models, view, query]);

	const summaryName = current ? shortName(current) : (selectedId || 'hexgrad/kokoro-82m (default, cheapest)');
	const summaryMeta = current ? `${current.voices.length} voice${current.voices.length === 1 ? '' : 's'} · ${ttsPriceLabel(current)}` : '';

	return (
		<div>
			<div className={cn('rounded-xl border', open ? 'border-[var(--accent)]' : 'border-border')}>
				<button
					type="button"
					aria-expanded={open}
					aria-label="Cloud TTS model"
					disabled={disabled}
					onClick={() => {
						const next = !open;
						setOpen(next);
						if (next) requestAnimationFrame(() => searchRef.current?.focus());
					}}
					className="flex w-full items-center gap-2 px-3 py-2.5 text-left disabled:opacity-50"
				>
					<span className="min-w-0 flex-1">
						<span className="block truncate text-[14px] font-bold text-[var(--text-heading)]">{summaryName}</span>
						{summaryMeta && <span className="block truncate font-mono text-[11px] text-muted-foreground">{summaryMeta}</span>}
					</span>
					<ChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
				</button>

				{open && !disabled && (
					<div className="border-t border-border p-2.5">
						<input
							ref={searchRef}
							type="search"
							value={query}
							onChange={(e) => setQuery(e.target.value)}
							placeholder="Search TTS models…"
							aria-label="Search OpenRouter speech models"
							className="w-full rounded-lg border border-border bg-background px-3 py-2 text-[13px] text-foreground outline-none focus:border-[var(--accent)]"
						/>
						<div className="mt-2 flex gap-1 rounded-lg border border-border p-0.5" role="tablist" aria-label="TTS model lens">
							{TTS_VIEWS.map(([key, label]) => (
								<button
									type="button"
									key={key}
									role="tab"
									aria-selected={view === key}
									onClick={() => setView(key)}
									className={cn(
										'flex-1 rounded-md px-2 py-1.5 text-[12.5px] font-semibold',
										view === key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-[var(--text-heading)]',
									)}
								>
									{label}
								</button>
							))}
						</div>

						<div className="mt-2 max-h-[280px] overflow-y-auto">
							{models === null ? (
								<p className="px-1 py-3 text-[12.5px] text-muted-foreground">Loading models…</p>
							) : groups.length === 0 ? (
								<p className="px-1 py-3 text-[12.5px] text-muted-foreground">{emptyTtsMessage(view)}</p>
							) : (
								groups.map(({ vendor, models: rows }) => (
									<div key={vendor}>
										<div className="px-1 pb-1 pt-2 font-mono text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">{vendor}</div>
										{rows.map((m: OrVoiceModel) => {
											const sel = m.id === selectedId;
											const busy = playingId === m.id;
											return (
												<div
													key={m.id}
													className={cn(
														'flex items-center gap-2 rounded-lg px-2 py-2',
														sel ? 'bg-[var(--accent-soft)]' : 'hover:bg-[color-mix(in_srgb,var(--accent)_8%,transparent)]',
													)}
												>
													<label className="flex min-w-0 flex-1 cursor-pointer items-start gap-2.5" title={`${m.voices.length} published voice${m.voices.length === 1 ? '' : 's'}`}>
														<input
															type="radio"
															name="studio-tts-model"
															value={m.id}
															checked={sel}
															onChange={() => onPick(m)}
															className="mt-1 size-3.5 shrink-0 accent-[var(--accent)]"
														/>
														<span className="min-w-0 flex-1">
															<span className="block truncate text-[13px] font-semibold text-[var(--text-heading)]">{shortName(m)}</span>
															<span className="block truncate font-mono text-[11px] text-muted-foreground">{m.voices.length} voice{m.voices.length === 1 ? '' : 's'} · {ttsPriceLabel(m)}</span>
														</span>
													</label>
													<button
														type="button"
														onClick={() => onPlay(m)}
														disabled={busy || !m.voices.length}
														aria-label={`Preview ${shortName(m)}`}
														title={m.voices.length ? 'Preview this model\'s default voice' : 'No published voice to preview'}
														className="shrink-0 rounded-md p-1.5 text-[var(--accent)] hover:bg-[var(--accent-soft)] disabled:opacity-40"
													>
														{busy ? <Loader2 className="size-4 animate-spin" /> : <PlayCircle className="size-4" />}
													</button>
												</div>
											);
										})}
									</div>
								))
							)}
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
