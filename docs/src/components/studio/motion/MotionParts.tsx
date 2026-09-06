// THE RUNNING ORDER — the parts, grouped by the beat each one arrives on.
//
// This is the tab's primary surface and its keyboard home. It is a `listbox` with a roving tabindex
// rather than a stack of buttons, because a person choreographing twenty parts moves between them
// far more often than they click one: arrow keys select, Alt+arrows move a part between beats.
//
// Severity is carried by WORDS, never by color alone (WCAG 1.4.1): a part that cannot be drawn says
// so beside the disabled control, and a beat is a numbered header rather than a tint.

import { GripVertical, Pencil, Plus } from 'lucide-react';
import * as React from 'react';
import { cn } from '@/lib/utils';
import { beatsOf, DEFAULT_PART_PLAN, type PartPlan, type Plan, type Role } from './plan';
import type { IntakePart } from './svg-intake';

/** What each role is called on screen. The words are the model — "arrives by" plus one of these is
 *  the whole sentence a user composes. */
export const ROLE_LABEL: Record<Role, string> = {
	draw: 'Draws itself',
	fade: 'Fades in',
	slide: 'Slides in',
	still: 'Already there',
};

export function MotionParts({
	parts,
	plan,
	selected,
	missing,
	onSelect,
	onMove,
	onRename,
	onAddBeat,
	renderInspector,
}: {
	parts: IntakePart[];
	plan: Plan;
	selected: string | null;
	/** `pathRef`s the plan carries that the drawing no longer has — shown, never dropped. */
	missing: { pathRef: string; label: string }[];
	onSelect: (pathRef: string) => void;
	onMove: (pathRef: string, beat: number) => void;
	onRename: (pathRef: string, label: string) => void;
	onAddBeat: () => void;
	/** The inspector, placed INSIDE the selected row below the desktop breakpoint. One component,
	 *  placed by breakpoint — the pattern `Fabricate.tsx` already uses for its manifest panel. */
	renderInspector?: (pathRef: string) => React.ReactNode;
}) {
	const [editing, setEditing] = React.useState<string | null>(null);
	const beats = beatsOf(plan);
	const shown = beats.length ? beats : [1];
	const planOf = (ref: string): PartPlan => plan.get(ref) ?? DEFAULT_PART_PLAN;

	const onRowKey = (e: React.KeyboardEvent, part: IntakePart, index: number, ordered: IntakePart[]) => {
		if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
			e.preventDefault();
			const next = ordered[index + (e.key === 'ArrowDown' ? 1 : -1)];
			if (next) onSelect(next.pathRef);
			return;
		}
		if (e.altKey && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
			e.preventDefault();
			const at = planOf(part.pathRef).beat;
			onMove(part.pathRef, Math.max(1, at + (e.key === 'ArrowRight' ? 1 : -1)));
			return;
		}
		if (e.key === 'F2') {
			e.preventDefault();
			setEditing(part.pathRef);
		}
	};

	const ordered = shown.flatMap((b) => parts.filter((p) => planOf(p.pathRef).beat === b));

	return (
		<div className="flex min-h-0 flex-col gap-2">
			<div className="flex items-center justify-between gap-2 px-1">
				<span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">Running order</span>
				<span className="text-[11px] text-muted-foreground">
					{parts.length} part{parts.length === 1 ? '' : 's'} · {shown.length} beat{shown.length === 1 ? '' : 's'}
				</span>
			</div>

			{/* biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: a listbox of COMPOSITE rows — each carrying a rename control and, below the desktop breakpoint, the whole inspector — is exactly what role="listbox" plus a roving tabindex is for. A <select> cannot hold them, and a stack of buttons loses the arrow-key navigation a person choreographing twenty parts needs most. */}
			<ul role="listbox" aria-label="Parts, grouped by beat" className="flex flex-col gap-2">
				{shown.map((beat) => {
					const members = parts.filter((p) => planOf(p.pathRef).beat === beat);
					return (
						<li key={beat}>
							<p className="px-1 pb-1 font-mono text-[10.5px] uppercase tracking-widest text-muted-foreground">
								Beat {beat}
								{members.length === 0 ? ' · empty' : ''}
							</p>
							<ul className="flex flex-col gap-0.5">
								{members.map((part) => {
									const isSel = part.pathRef === selected;
									const p = planOf(part.pathRef);
									return (
										<li
											key={part.pathRef}
											// biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: the option of the listbox above — a composite row, not a control
											role="option"
											aria-selected={isSel}
											tabIndex={isSel ? 0 : -1}
											onClick={() => onSelect(part.pathRef)}
											onKeyDown={(e) => onRowKey(e, part, ordered.indexOf(part), ordered)}
											className={cn(
												'cursor-pointer rounded-md border-l-2 px-2 py-1.5 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]',
												isSel ? 'border-l-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_12%,transparent)]' : 'border-l-transparent hover:bg-muted',
											)}
										>
											<div className="flex items-center gap-2">
												<GripVertical className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
												{editing === part.pathRef ? (
													<input
														// biome-ignore lint/a11y/noAutofocus: F2/pencil opens this field FOR renaming — not focusing it would make the affordance dead
														autoFocus
														defaultValue={part.label}
														aria-label={`Rename ${part.label}`}
														onBlur={(e) => {
															onRename(part.pathRef, e.target.value);
															setEditing(null);
														}}
														onKeyDown={(e) => {
															if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
															if (e.key === 'Escape') setEditing(null);
															e.stopPropagation();
														}}
														className="min-w-0 flex-1 rounded border border-[var(--accent)] bg-background px-1 py-0.5 text-[13px] outline-none"
													/>
												) : (
													<span className="min-w-0 flex-1 truncate font-medium text-[var(--text-heading)]">{part.label}</span>
												)}
												<span className="shrink-0 text-[11px] text-muted-foreground">{ROLE_LABEL[p.role]}</span>
												<button
													type="button"
													aria-label={`Rename ${part.label}`}
													onClick={(e) => {
														e.stopPropagation();
														setEditing(part.pathRef);
													}}
													className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-[var(--accent)]"
												>
													<Pencil className="size-3" />
												</button>
											</div>
											{part.band && (
												<p className="pl-5 pt-0.5 text-[11px] text-muted-foreground">
													{part.childCount} shapes together · groups cannot be drawn
												</p>
											)}
											{/* The SAME 1100px threshold the faculty's grid uses, not `lg`. At `lg` (1024px) this
											    would hide between 1024 and 1099 while the aside had not appeared yet — leaving that
											    whole band with no inspector at all. One component, placed by breakpoint, means the
											    two breakpoints have to be the same number. */}
											{isSel && renderInspector ? <div className="pt-2 [@media(min-width:1100px)]:hidden">{renderInspector(part.pathRef)}</div> : null}
										</li>
									);
								})}
							</ul>
						</li>
					);
				})}
			</ul>

			{missing.length > 0 && (
				<div className="rounded-md border border-[color-mix(in_srgb,var(--warn)_45%,var(--border))] p-2">
					<p className="pb-1 font-mono text-[10.5px] uppercase tracking-widest text-muted-foreground">No longer in the drawing</p>
					{missing.map((m) => (
						<p key={m.pathRef} className="text-[12px] leading-snug text-muted-foreground">
							<span className="font-medium text-[var(--text-heading)]">{m.label}</span> — its beat was kept but nothing carries it. Bring the original drawing back, or leave it and it will be dropped on save.
						</p>
					))}
				</div>
			)}

			<button
				type="button"
				onClick={onAddBeat}
				className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-border py-1.5 text-[12px] font-semibold text-muted-foreground hover:border-[var(--accent)] hover:text-[var(--accent)]"
			>
				<Plus className="size-3.5" /> Add a beat
			</button>
		</div>
	);
}
