// The voice picker, in its own module because TWO surfaces need it: the Workspace's
// TTS settings (where it sets the voice every rehearsal speaks in) and the webpage
// export panel (where it chooses the narrator BAKED INTO one shared file). HARD RULE
// #15 — don't fork a widget per surface, and this one carries real accumulated
// knowledge: the grouped ★ Featured + language lists, the country flags, the gender
// marks, and the reason it is an inline expand-in-place panel rather than a Radix
// Popover (a portaled popover inside the Workspace Sheet's modal dialog left the
// search field un-typeable on real iOS Safari — 2026-07-13 device report, see
// engineering/decisions/2026-07-13-tts-picker-ia.md § iOS fix).

import { Check, ChevronDown, Loader2, Mars, PlayCircle, Venus } from 'lucide-react';
import * as React from 'react';
import { Tip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { countryName, flagSrc, groupVoices, NO_VOICES_HINT, type Voice } from './tts-voice-catalog';

/** A model-specific voice picker — ALWAYS a curated dropdown, never a field the
 *  user types a voice id into: every model OpenRouter publishes has a real,
 *  live-fetched roster, so there's nothing to type. Picking a voice fires `onPick`
 *  immediately — the caller auto-previews it, so browsing the dropdown is itself
 *  "a way to hear it". When `voices` is empty (a model with no published roster —
 *  a theoretical case today, since every live TTS model has one), this renders a
 *  DISABLED, explained field instead of an editable one — guessing a voice id
 *  blind is worse than admitting we don't have one. */
// A ♀/♂ adornment for a voice row whose gender we know (Kokoro from its id; the other
// engines from the catalog's curated voiceGenders map). Absent — not a placeholder —
// where the gender is unknown, so the row stays clean. Lucide Venus/Mars icons (not a
// text glyph), tinted to match the voice name (inherits `currentColor`), to match the
// rest of the Studio's icon set.
function GenderMark({ gender }: { gender?: 'F' | 'M' }) {
	if (!gender) return null;
	const Icon = gender === 'F' ? Venus : Mars;
	const label = gender === 'F' ? 'Female' : 'Male';
	return <Icon role="img" aria-label={label} className="size-3.5 shrink-0" />;
}

// A country flag for a voice row whose language maps to a country (Kokoro/Voxtral/MAI/
// Zonos). Replaces the old "· US" text suffix — the flag sits next to the gender icon.
// A vendored SVG (flagSrc → /flags/<cc>.svg) rather than an emoji, so it renders
// identically on every platform (including Windows, which can't draw flag emoji). Only
// the flags actually shown are fetched; the rest are inert static assets. Absent for a
// language-agnostic engine (Gemini). Hidden on a load error rather than a broken image.
function FlagMark({ country }: { country?: string }) {
	const [failed, setFailed] = React.useState(false);
	const src = flagSrc(country);
	if (!src || failed) return null;
	const name = countryName(country);
	return <img src={src} alt={name} title={name} loading="lazy" onError={() => setFailed(true)} className="h-3 w-4 shrink-0 rounded-[1px] object-cover" />;
}

// The voice picker: an inline, expand-in-place search panel grouped as ★ Featured +
// language groups (where the id encodes language) or a single "All voices" list, with
// a gender badge per row. Replaces the old flat <Select> — a 30–54-voice roster needs
// search + curation, not one long scroll. It mirrors TtsModelPicker's proven inline
// pattern (a collapsed summary → search input + scrollable grouped list) RATHER than a
// Popover+cmdk combobox: a Radix Popover portaled inside the Workspace Sheet's modal
// dialog left the search field un-typeable on real iOS Safari (2026-07-13 device
// report — see engineering/decisions/2026-07-13-tts-picker-ia.md § iOS fix; HARD RULE
// #15, don't fork a widget per surface). `modelId` drives the grouping (groupVoices).
export function VoicePicker({
	label,
	ariaLabel,
	modelId,
	voices,
	value,
	onPick,
	onPreview,
	previewingId,
	disabled,
}: {
	label: string;
	ariaLabel: string;
	modelId: string;
	voices: Voice[];
	value: string;
	onPick: (voiceId: string) => void;
	/** Audition a row's voice without selecting it (the ▶ button). Omit to hide it. */
	onPreview?: (voiceId: string) => void;
	/** The voice id currently auditioning (spinner on its ▶), or null. */
	previewingId?: string | null;
	disabled?: boolean;
}) {
	const [open, setOpen] = React.useState(false);
	const [query, setQuery] = React.useState('');
	const searchRef = React.useRef<HTMLInputElement>(null);
	const { featured, groups } = React.useMemo(() => groupVoices(modelId, voices), [modelId, voices]);
	const selected = React.useMemo(() => voices.find((v) => v.id === value), [voices, value]);

	// Manual substring filter (name + id + the group's language name, so typing
	// "japanese"/"spanish" narrows to that language) — the cmdk equivalent of the old
	// combobox, minus the iOS-hostile Popover.
	const q = query.trim().toLowerCase();
	const match = (row: { id: string; label: string }, lang = '') => !q || `${row.label} ${row.id} ${lang}`.toLowerCase().includes(q);
	const fFeatured = featured.filter((r) => match(r));
	const fGroups = groups.map((g) => ({ ...g, voices: g.voices.filter((r) => match(r, g.label)) })).filter((g) => g.voices.length > 0);
	const nothing = fFeatured.length === 0 && fGroups.length === 0;

	if (!voices.length) {
		return (
			<div>
				<div className="mb-1.5 text-[13px] font-semibold leading-normal text-[var(--text-heading)]">{label}</div>
				<input
					type="text"
					value=""
					disabled
					placeholder="No published voices"
					aria-label={ariaLabel}
					className="w-full rounded-lg border border-border bg-background px-3 py-2 text-[13px] text-muted-foreground outline-none disabled:opacity-50"
				/>
				<p className="mt-1 text-[11px] text-muted-foreground">{NO_VOICES_HINT}</p>
			</div>
		);
	}

	const choose = (id: string) => {
		onPick(id);
		setOpen(false);
		setQuery('');
	};
	// A row is a wrapper div holding the selectable option-button (flex-1) and, when
	// onPreview is given, a SIBLING ▶ button — siblings, not nested (a <button> inside a
	// <button> is invalid HTML). The hover/selected tint lives on the wrapper.
	const Row = (row: { id: string; label: string; country?: string; gender?: 'F' | 'M' }) => {
		const sel = row.id === value;
		const busy = previewingId === row.id;
		return (
			<div key={row.id} className={cn('flex items-center gap-1 rounded-md pr-1', sel ? 'bg-[var(--accent-soft)]' : 'hover:bg-[color-mix(in_srgb,var(--accent)_8%,transparent)]')}>
				<button
					type="button"
					role="option"
					aria-selected={sel}
					onClick={() => choose(row.id)}
					// text-heading on the button, so the name AND the gender icon (currentColor) share one color.
					className="flex min-w-0 flex-1 items-center gap-2 bg-transparent px-2 py-2 text-left text-[13px] text-[var(--text-heading)]"
				>
					<Check className={cn('size-3.5 shrink-0', sel ? 'opacity-100 text-[var(--accent)]' : 'opacity-0')} />
					<span className="min-w-0 flex-1 truncate">{row.label}</span>
					<FlagMark country={row.country} />
					<GenderMark gender={row.gender} />
				</button>
				{onPreview && (
					<Tip label="Hear this voice"><button
						type="button"
						onClick={() => onPreview(row.id)}
						disabled={busy}
						aria-label={`Preview ${row.label}`}
						className="shrink-0 rounded-md bg-transparent p-1.5 text-[var(--accent)] hover:bg-[var(--accent-soft)] disabled:opacity-60"
					>
						{busy ? <Loader2 className="size-4 animate-spin" /> : <PlayCircle className="size-4" />}
					</button></Tip>
				)}
			</div>
		);
	};

	return (
		<div>
			<div className="mb-1.5 text-[13px] font-semibold leading-normal text-[var(--text-heading)]">{label}</div>
			<div className={cn('rounded-lg border', open ? 'border-[var(--accent)]' : 'border-border')}>
				<button
					type="button"
					role="combobox"
					aria-label={ariaLabel}
					aria-expanded={open}
					aria-haspopup="listbox"
					disabled={disabled}
					onClick={() => {
						const next = !open;
						setOpen(next);
						if (next) requestAnimationFrame(() => searchRef.current?.focus());
					}}
					className="flex w-full items-center gap-2 bg-transparent px-3 py-2 text-left text-[13px] text-foreground disabled:opacity-50"
				>
					<span className="min-w-0 flex-1 truncate">{selected?.label ?? 'Choose a voice…'}</span>
					<ChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
				</button>
				{open && !disabled && (
					<div className="border-t border-border p-2">
						<input
							ref={searchRef}
							type="search"
							value={query}
							onChange={(e) => setQuery(e.target.value)}
							placeholder="Search voices…"
							aria-label={`Search ${ariaLabel}`}
							className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-[13px] text-foreground outline-none focus:border-[var(--accent)]"
						/>
						<div role="listbox" aria-label={ariaLabel} className="mt-2 max-h-[280px] overflow-y-auto">
							{nothing ? (
								<p className="px-2 py-3 text-[12.5px] text-muted-foreground">No voice found.</p>
							) : (
								<>
									{fFeatured.length > 0 && (
										<div>
											<div className="px-2 pb-1 pt-1.5 text-[12.5px] font-semibold text-[var(--text-muted)]">★ Featured</div>
											{fFeatured.map(Row)}
										</div>
									)}
									{fGroups.map((g) => (
										<div key={g.key}>
											<div className="px-2 pb-1 pt-2 text-[12.5px] font-semibold text-[var(--text-muted)]">{g.label}</div>
											{g.voices.map(Row)}
										</div>
									))}
								</>
							)}
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
