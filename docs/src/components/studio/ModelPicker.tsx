import { ChevronDown } from 'lucide-react';
import * as React from 'react';
import {
	emptyMessage,
	filterModels,
	groupByVendor,
	metaLabel,
	OR_VIEWS,
	rowTitle,
	shortName,
} from '@/components/studio/ai/or-catalog.js';
import { cn } from '@/lib/utils';
import { type ArchitectStatus, listStudioModels, type ORModel, setStudioModel } from './architect';

// The OpenRouter model picker — a React port of the Drawing Board's accordion
// (drawing-board-settings.js), reusing the SAME curated lists + helpers from the
// shared catalog (or-catalog.js) so the two surfaces can't drift (HARD RULE #1/#15).
// Collapsed: the active model + its meta line. Expanded: search + Featured/Value/
// Free/All tabs + the vendor-grouped, priced list. Only the model PROPOSES nothing
// here — this just selects which OpenRouter model the architect calls.
export function ModelPicker({ status, notify }: { status: ArchitectStatus; notify: (msg: string) => void }) {
	const [open, setOpen] = React.useState(false);
	const [models, setModels] = React.useState<ORModel[] | null>(null);
	const [view, setView] = React.useState<string>('featured');
	const [query, setQuery] = React.useState('');
	const [selectedId, setSelectedId] = React.useState<string | null>(status.modelId);
	const searchRef = React.useRef<HTMLInputElement>(null);

	// Load the catalog once, only when OpenRouter is connected (no fetch on the
	// floor/on-device tiers — keeps tests and offline use network-free).
	React.useEffect(() => {
		let live = true;
		if (status.openRouterReady && !models) {
			listStudioModels().then((l) => {
				if (live) setModels(l);
			});
		}
		return () => {
			live = false;
		};
	}, [status.openRouterReady, models]);

	// Reflect an external model change (e.g. another surface) in the summary.
	React.useEffect(() => {
		setSelectedId(status.modelId);
	}, [status.modelId]);

	const current = React.useMemo(
		() => (models && selectedId ? models.find((m) => m.id === selectedId) : null) ?? null,
		[models, selectedId],
	);
	const groups = React.useMemo(() => groupByVendor(filterModels(models ?? [], view, query)), [models, view, query]);

	const pick = async (m: ORModel) => {
		setSelectedId(m.id);
		await setStudioModel(m.id);
		setOpen(false);
		notify(`Model set to ${shortName(m)}.`);
	};

	const summaryName = current ? shortName(current) : (selectedId ?? 'Choose a model');
	const summaryMeta = current ? metaLabel(current) : '';

	return (
		<div>
			<div className="mb-2 font-mono text-[11px] font-bold uppercase tracking-wider text-muted-foreground">OpenRouter model</div>
			<div className={cn('rounded-xl border', open ? 'border-[var(--accent)]' : 'border-border')}>
				<button
					type="button"
					aria-expanded={open}
					onClick={() => {
						const next = !open;
						setOpen(next);
						if (next) requestAnimationFrame(() => searchRef.current?.focus());
					}}
					className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
				>
					<span className="min-w-0 flex-1">
						<span className="block truncate text-[14px] font-bold text-[var(--text-heading)]">{summaryName}</span>
						{summaryMeta && <span className="block truncate font-mono text-[11px] text-muted-foreground">{summaryMeta}</span>}
					</span>
					<ChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
				</button>

				{open && (
					<div className="border-t border-border p-2.5">
						<input
							ref={searchRef}
							type="search"
							value={query}
							onChange={(e) => setQuery(e.target.value)}
							placeholder="Search 500+ models…"
							aria-label="Search OpenRouter models"
							className="w-full rounded-lg border border-border bg-background px-3 py-2 text-[13px] text-foreground outline-none focus:border-[var(--accent)]"
						/>
						<div className="mt-2 flex gap-1 rounded-lg border border-border p-0.5" role="tablist" aria-label="Model lens">
							{OR_VIEWS.map(([key, label]) => (
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
								<p className="px-1 py-3 text-[12.5px] text-muted-foreground">{emptyMessage(view)}</p>
							) : (
								groups.map(({ vendor, models: rows }) => (
									<div key={vendor}>
										<div className="px-1 pb-1 pt-2 font-mono text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">{vendor}</div>
										{rows.map((m: ORModel) => {
											const sel = m.id === selectedId;
											return (
												<label
													key={m.id}
													title={rowTitle(m) || undefined}
													className={cn(
														'flex cursor-pointer items-start gap-2.5 rounded-lg px-2 py-2',
														sel ? 'bg-[var(--accent-soft)]' : 'hover:bg-[color-mix(in_srgb,var(--accent)_8%,transparent)]',
													)}
												>
													<input
														type="radio"
														name="studio-or-model"
														value={m.id}
														checked={sel}
														onChange={() => pick(m)}
														className="mt-1 size-3.5 shrink-0 accent-[var(--accent)]"
													/>
													<span className="min-w-0 flex-1">
														<span className="flex items-center gap-1.5">
															<span className="truncate text-[13px] font-semibold text-[var(--text-heading)]">{shortName(m)}</span>
															{m.vision && (
																<span className="shrink-0 rounded bg-[var(--accent-soft)] px-1 py-px font-mono text-[9px] font-bold uppercase tracking-wider text-[var(--accent)]">vision</span>
															)}
														</span>
														<span className="block truncate font-mono text-[11px] text-muted-foreground">{metaLabel(m)}</span>
													</span>
												</label>
											);
										})}
									</div>
								))
							)}
						</div>
					</div>
				)}
			</div>
			<p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">Defaults to Claude Sonnet 4. Switch any time — the architect uses the selected model for every edit and chat.</p>
		</div>
	);
}
