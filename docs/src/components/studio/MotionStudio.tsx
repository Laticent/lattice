import { Check, Cloud, Film, Loader2, RotateCcw, Trash2, X } from 'lucide-react';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { hydrateScene } from '@/lib/anima/hydrate';
import { parseScene } from '@/lib/anima/schema';
import type { BuiltElement, Scene } from '@/lib/anima/types';
import { sanitizeSlideHtml } from '@/lib/sanitize-slide-html.js';
import { cn } from '@/lib/utils';
import { saveStudioScene, sceneEngine, slugify } from './scene-library';

// The Motion faculty — Rig Mode v1 (Stage 7a), the deterministic foundation of
// 2026-07-18-anima-motion-faculty-modes.md §3.1. Three panes: the scene TREE (left) ·
// a LIVE STAGE (center, driven by the Stage 6 host — the same hydrateScene the deck
// surfaces use) · a selected-element inspector (right, read-only here). Name + Save
// persist the canonical spec into the Stage 4 asset store. The rich verb-chip param
// editing + the "reads as information?" audit are Stage 7b; Director (AI) is 7c.

// A starter scene so the stage is never empty — the rotor-in-housing, the docs' own
// canonical example of meaning-bearing motion (a relationship a still can only imply).
const STARTER: Scene = {
	source: 'built',
	duration: 3000,
	hero: 0.5,
	camera: { rotate: [-0.5, -0.6, 0] },
	elements: [
		{
			id: 'rig',
			shape: 'group',
			motion: [{ verb: 'spin', axis: 'y', period: 3000 }],
			children: [
				{ id: 'ring', shape: 'ellipse', color: 'var(--cat-2-mark)', props: { diameter: 150, stroke: 10 }, transform: { rotate: [1.5708, 0, 0] } },
				{ id: 'rotor', shape: 'cone', color: 'var(--accent)', props: { diameter: 74, length: 96 } },
			],
		},
	],
};

/** A flattened tree row — an element with its depth and the path to reach it. */
type Row = { el: BuiltElement; depth: number; path: number[] };

/** Walk a built scene's element tree depth-first into selectable rows. An svg scene is flat. */
export function flatten(scene: Scene): Row[] {
	const rows: Row[] = [];
	const walk = (els: readonly BuiltElement[], depth: number, prefix: number[]) => {
		els.forEach((el, i) => {
			const path = [...prefix, i];
			rows.push({ el, depth, path });
			if (Array.isArray(el.children)) walk(el.children, depth + 1, path);
		});
	};
	if (scene.source === 'built') walk(scene.elements, 0, []);
	else {
		scene.elements.forEach((el, i) => {
			rows.push({ el: el as unknown as BuiltElement, depth: 0, path: [i] });
		});
	}
	return rows;
}

/** Immutably remove the element at `path` from a built scene (a group's whole subtree with it). */
export function removeAt(scene: Scene, path: number[]): Scene {
	if (scene.source !== 'built' || path.length === 0) return scene;
	const clone = structuredClone(scene) as Extract<Scene, { source: 'built' }>;
	let list = clone.elements as BuiltElement[];
	for (let i = 0; i < path.length - 1; i++) {
		const child = list[path[i]];
		if (!child || !Array.isArray(child.children)) return scene;
		list = child.children;
	}
	list.splice(path[path.length - 1], 1);
	return clone;
}

const VERBS = (el: BuiltElement): string[] => (el.motion ?? []).map((m) => m.verb);

export function MotionStudio({
	notify,
	onSaved,
	onOpenWorkspace,
}: {
	notify: (msg: string) => void;
	onSaved?: () => void;
	onOpenWorkspace?: () => void;
}) {
	const [spec, setSpec] = React.useState<Scene>(STARTER);
	const [selected, setSelected] = React.useState<string>('rig');
	const [name, setName] = React.useState('');
	const [saving, setSaving] = React.useState(false);
	const stageRef = React.useRef<HTMLDivElement>(null);

	const rows = React.useMemo(() => flatten(spec), [spec]);
	const valid = React.useMemo(() => parseScene(spec).ok, [spec]);
	const selectedRow = rows.find((r) => r.el.id === selected) ?? rows[0];

	// The LIVE STAGE. Build a `section.scene` with the current spec and hand it to the Stage 6
	// host (eager mount, sanitizer injected — HARD RULE #22). Re-hydrate whenever the spec
	// changes; dispose on teardown so no rAF outlives the stage.
	React.useEffect(() => {
		const host = stageRef.current;
		if (!host || !valid) return;
		let b64: string;
		try {
			b64 = btoa(JSON.stringify(spec));
		} catch {
			return; // a non-Latin1 codepoint (a future id/label-editing path) — leave the fallback UI
		}
		host.textContent = '';
		const section = document.createElement('section');
		section.className = 'scene';
		section.setAttribute('data-scene-spec', b64);
		const figure = document.createElement('div');
		figure.className = 'scene-figure';
		section.appendChild(figure);
		host.appendChild(section);
		const ctrl = hydrateScene(section, { eager: true, sanitize: sanitizeSlideHtml });
		return () => {
			ctrl?.dispose();
			host.textContent = '';
		};
	}, [spec, valid]);

	// Keep the selection valid — if the selected element was pruned, fall to the first row.
	React.useEffect(() => {
		if (rows.length > 0 && !rows.some((r) => r.el.id === selected)) setSelected(rows[0].el.id);
	}, [rows, selected]);

	// A removal is offered only when it can't strand the scene: pruning a nested child always
	// leaves its parent group, but removing the LAST top-level element would empty `elements`
	// (which the schema rejects → an invalid, unrecoverable scene). Guard that dead-end.
	const topCount = spec.elements.length;
	const canRemove = (r: Row) => r.path.length > 1 || topCount > 1;

	const nameOk = slugify(name).length > 0;
	async function save() {
		if (!nameOk || !valid || saving) return;
		setSaving(true);
		try {
			await saveStudioScene({ name: slugify(name), spec });
			notify(`Saved scene “${slugify(name)}”.`);
			onSaved?.();
		} catch {
			notify('Could not save the scene.');
		} finally {
			setSaving(false);
		}
	}

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			{/* Header — back · name · Save (mirrors the other faculty tabs). */}
			<div className="flex h-[50px] shrink-0 items-center gap-2 border-b border-border bg-card px-3 sm:gap-3 sm:px-4">
				<Film className="size-4 shrink-0 text-[var(--accent)]" />
				<div className={cn('flex min-w-0 max-w-[220px] flex-shrink items-center rounded-md border px-1.5 py-0.5 focus-within:border-[var(--accent)]', name && !nameOk ? 'border-[color-mix(in_srgb,var(--fail)_55%,var(--border))]' : 'border-transparent hover:border-border')}>
					<input value={name} onChange={(e) => setName(e.target.value)} aria-label="Scene name" placeholder="name-your-scene" spellCheck={false} className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-[var(--text-heading)] outline-none placeholder:font-normal placeholder:text-muted-foreground" />
				</div>
				<span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{sceneEngine(spec)}</span>
				<div className="flex-1" />
				<Button type="button" variant="ghost" size="sm" title="Reset to the starter scene" onClick={() => { setSpec(STARTER); setSelected('rig'); }} className="shrink-0 gap-1.5 text-muted-foreground">
					<RotateCcw className="size-3.5" /> <span className="hidden sm:inline">Reset</span>
				</Button>
				{onOpenWorkspace && (
					<Button type="button" variant="ghost" size="sm" onClick={onOpenWorkspace} className="shrink-0 gap-1.5 text-muted-foreground">
						<Cloud className="size-3.5" /> <span className="hidden sm:inline">Library</span>
					</Button>
				)}
				<Button type="button" size="sm" disabled={!nameOk || !valid || saving} onClick={save} className="shrink-0 gap-1.5">
					{saving ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />} Save
				</Button>
			</div>

			{/* Body — tree · stage · inspector. */}
			<div className="grid min-h-0 flex-1 grid-cols-1 sm:grid-cols-[minmax(180px,1fr)_minmax(0,2.4fr)_minmax(200px,1.1fr)]">
				{/* Scene tree */}
				<div className="min-h-0 overflow-y-auto border-b border-border p-2 sm:border-b-0 sm:border-r">
					<div className="px-1 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Scene</div>
					<ul className="flex flex-col gap-0.5">
						{rows.map((r) => (
							<li
								key={r.el.id}
								style={{ paddingLeft: `${8 + r.depth * 14}px` }}
								className={cn('group flex items-center gap-2 rounded-md pr-1.5 text-[13px]', r.el.id === selected ? 'bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] text-[var(--accent)]' : 'text-foreground hover:bg-muted')}
							>
								<button type="button" onClick={() => setSelected(r.el.id)} className="flex min-w-0 flex-1 items-center gap-2 py-1 text-left">
									<span className="min-w-0 flex-1 truncate font-medium">{r.el.id}</span>
									<span className="shrink-0 text-[11px] text-muted-foreground">{r.el.shape ?? 'path'}</span>
									{VERBS(r.el).length > 0 && <span className="shrink-0 text-[11px] text-[var(--accent)]">{VERBS(r.el).join('·')}</span>}
								</button>
								{canRemove(r) && (
									<button type="button" aria-label={`Remove ${r.el.id}`} onClick={() => setSpec((s) => removeAt(s, r.path))} className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 hover:text-[var(--fail)] group-hover:opacity-100">
										<Trash2 className="size-3" />
									</button>
								)}
							</li>
						))}
					</ul>
				</div>

				{/* Live stage */}
				<div className="relative flex min-h-[240px] items-center justify-center bg-[var(--bg,#fff)] p-6">
					{valid ? (
						<div ref={stageRef} className="motion-stage aspect-[4/3] w-full max-w-[520px]" />
					) : (
						<div className="flex items-center gap-2 text-sm text-[var(--fail)]"><X className="size-4" /> The scene spec is invalid — nothing to play.</div>
					)}
				</div>

				{/* Inspector (read-only in 7a; verb-chip editing is 7b) */}
				<div className="min-h-0 overflow-y-auto border-t border-border p-3 sm:border-l sm:border-t-0">
					<div className="pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Element</div>
					{selectedRow ? (
						<dl className="flex flex-col gap-1.5 text-[13px]">
							<div className="flex justify-between gap-2"><dt className="text-muted-foreground">id</dt><dd className="font-mono font-medium">{selectedRow.el.id}</dd></div>
							<div className="flex justify-between gap-2"><dt className="text-muted-foreground">shape</dt><dd className="font-medium">{selectedRow.el.shape ?? 'path'}</dd></div>
							{selectedRow.el.color && <div className="flex items-center justify-between gap-2"><dt className="text-muted-foreground">color</dt><dd className="font-mono text-[11px]">{selectedRow.el.color}</dd></div>}
							<div className="flex justify-between gap-2"><dt className="text-muted-foreground">motion</dt><dd className="font-medium text-right">{VERBS(selectedRow.el).join(', ') || '—'}</dd></div>
						</dl>
					) : (
						<p className="text-[13px] text-muted-foreground">No element selected.</p>
					)}
					<p className="mt-4 border-t border-border pt-3 text-[12px] leading-relaxed text-muted-foreground">Verb-chip editing + the “reads as information?” audit arrive in the next slice. For now, tune the spec by pruning the tree; the stage plays it live via the same host the deck uses.</p>
				</div>
			</div>

			{/* The live stage borrows the host's rules — the engine stylesheet isn't loaded in the
			    Studio's own DOM (decks render in their iframe). The control uses px here (the deck's
			    cqi units need a `section.scene` container query this surface doesn't set up). */}
			<style>{`
.motion-stage .scene-figure{position:relative;width:100%;height:100%}
.motion-stage .scene-live,.motion-stage .scene-figure>svg,.motion-stage .scene-live>svg,.motion-stage .scene-live>canvas{width:100%;height:100%;display:block}
.motion-stage .scene-control{position:absolute;right:10px;top:10px;z-index:3;height:28px;display:inline-flex;align-items:center;gap:6px;padding:0 12px;border:1px solid var(--border);border-radius:999px;background:color-mix(in oklab,var(--bg,#fff) 86%,transparent);color:var(--text-muted);font-size:13px;line-height:1;cursor:pointer;opacity:0;pointer-events:none;transition:opacity .18s ease}
.motion-stage .scene-figure:hover .scene-control,.motion-stage .scene-figure:focus-within .scene-control,.motion-stage .scene-figure.scene-controls-shown .scene-control{opacity:1;pointer-events:auto}
.motion-stage .scene-control[data-mode="optin"]{opacity:1;pointer-events:auto}
.motion-stage .scene-control::before{font-size:1.05em}
.motion-stage .scene-control[data-mode="pause"]::before{content:"\\23f8"}
.motion-stage .scene-control[data-mode="play"]::before{content:"\\25b6"}
.motion-stage .scene-control[data-mode="replay"]::before{content:"\\21bb"}
.motion-stage .scene-control[data-mode="optin"]::before{content:"\\25b6"}
.motion-stage .scene-control:not([data-mode="optin"]){width:28px;padding:0;justify-content:center;border-radius:50%}
.motion-stage .scene-control-label:empty{display:none}
.motion-stage .scene-control:hover{color:var(--text-heading);border-color:var(--text-muted)}`}</style>
		</div>
	);
}

export default MotionStudio;
