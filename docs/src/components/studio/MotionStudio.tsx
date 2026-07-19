import { Check, Cloud, Film, Loader2, RotateCcw, Trash2, X } from 'lucide-react';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { auditScene } from '@/lib/anima/audit';
import { EASINGS } from '@/lib/anima/easing';
import { hydrateScene } from '@/lib/anima/hydrate';
import { parseScene } from '@/lib/anima/schema';
import type { BuiltElement, Motion, Scene } from '@/lib/anima/types';
import { AXES, MOTION_VERBS, type MotionVerb, VERB_SOURCE } from '@/lib/anima/vocabulary';
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

/** Read the element at `path` in a built scene, or null on a bad path. */
export function elementAt(scene: Scene, path: number[]): BuiltElement | null {
	if (scene.source !== 'built' || path.length === 0) return null;
	let list = scene.elements as BuiltElement[];
	for (let i = 0; i < path.length - 1; i++) {
		const child = list[path[i]];
		if (!child || !Array.isArray(child.children)) return null;
		list = child.children;
	}
	return list[path[path.length - 1]] ?? null;
}

/** Immutably set (or clear) the motion array on the element at `path`. No-op ref-return on
 *  a bad path — mirrors `removeAt`, so an edit can never corrupt the tree. */
export function setMotionAt(scene: Scene, path: number[], motion: Motion[]): Scene {
	if (scene.source !== 'built' || path.length === 0) return scene;
	const clone = structuredClone(scene) as Extract<Scene, { source: 'built' }>;
	let list = clone.elements as BuiltElement[];
	for (let i = 0; i < path.length - 1; i++) {
		const child = list[path[i]];
		if (!child || !Array.isArray(child.children)) return scene;
		list = child.children;
	}
	const el = list[path[path.length - 1]];
	if (!el) return scene;
	if (motion.length > 0) el.motion = motion;
	else delete el.motion;
	return clone;
}

/** A newly-added verb's schema-valid defaults — so toggling a chip on never invalidates
 *  the scene (the stage keeps playing). Params are then tuned in the inspector. */
export function defaultMotion(verb: MotionVerb): Motion {
	switch (verb) {
		case 'spin':
			return { verb: 'spin', axis: 'y', period: 3000 };
		case 'orbit':
			return { verb: 'orbit', axis: 'y', period: 3000 };
		case 'explode':
			return { verb: 'explode', distance: 1 };
		case 'fill':
			return { verb: 'fill', to: 1 };
		case 'reveal':
			return { verb: 'reveal' };
		case 'sequence':
			return { verb: 'sequence' };
		case 'draw':
			return { verb: 'draw' };
		case 'trace':
			return { verb: 'trace' };
	}
}

const VERBS = (el: BuiltElement): string[] => (el.motion ?? []).map((m) => m.verb);

// The windowed verbs carry an `at`/`span`/`easing` timeline window; the cyclic ones (spin,
// orbit) do not. Used to decide which param block the inspector renders.
const WINDOWED = new Set<MotionVerb>(['explode', 'reveal', 'sequence', 'fill', 'draw', 'trace']);
const clamp01 = (n: number) => Math.min(1, Math.max(0, Number.isFinite(n) ? n : 0));

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
		// `hydrateScene` runs compile + renderer mount, which can throw on a spec that PARSES but
		// fails downstream (a shape/param combo a future verb edit reaches). There is no error
		// boundary in the Studio, so an uncaught throw here white-screens the whole surface. Guard
		// it the way the sibling `hydrateScenes` guards each section — fall back to the empty stage.
		let ctrl: ReturnType<typeof hydrateScene> | undefined;
		try {
			ctrl = hydrateScene(section, { eager: true, sanitize: sanitizeSlideHtml });
		} catch {
			host.textContent = '';
			return;
		}
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

	// The verbs offerable for this scene's source (built vs svg), and the live audit.
	const applicable = React.useMemo(() => MOTION_VERBS.filter((v) => VERB_SOURCE[v] === 'both' || VERB_SOURCE[v] === spec.source), [spec.source]);
	const audit = React.useMemo(() => auditScene(spec), [spec]);
	const selPath = selectedRow?.path;
	const elVerbs = selectedRow ? (selectedRow.el.motion ?? []).map((m) => m.verb) : [];

	// Edits read the CURRENT spec inside the functional updater (never a stale closure over
	// `selectedRow`), so a rapid sequence of chip/param edits can't splice against a stale tree.
	function toggleVerb(v: MotionVerb) {
		if (!selPath) return;
		setSpec((s) => {
			const el = elementAt(s, selPath);
			if (!el) return s;
			const motions = el.motion ?? [];
			const next = motions.some((m) => m.verb === v) ? motions.filter((m) => m.verb !== v) : [...motions, defaultMotion(v)];
			return setMotionAt(s, selPath, next);
		});
	}
	function updateMotion(i: number, patch: Record<string, unknown>) {
		if (!selPath) return;
		setSpec((s) => {
			const el = elementAt(s, selPath);
			if (!el?.motion) return s;
			const motions = el.motion.map((m, k) => (k === i ? ({ ...m, ...patch } as Motion) : m));
			return setMotionAt(s, selPath, motions);
		});
	}
	function removeMotion(i: number) {
		if (!selPath) return;
		setSpec((s) => {
			const el = elementAt(s, selPath);
			if (!el?.motion) return s;
			return setMotionAt(s, selPath, el.motion.filter((_, k) => k !== i));
		});
	}

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

				{/* Inspector — verb-chip motion editing + params, and the "reads as information?"
				    audit (Stage 7b, 2026-07-18 §3.1). */}
				<div className="min-h-0 overflow-y-auto border-t border-border p-3 sm:border-l sm:border-t-0">
					{selectedRow ? (
						<>
							<div className="pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Element</div>
							<div className="flex items-center gap-2 pb-3 text-[13px]">
								<span className="font-mono font-semibold text-[var(--text-heading)]">{selectedRow.el.id}</span>
								<span className="text-[11px] text-muted-foreground">{selectedRow.el.shape ?? 'path'}</span>
								{/* The spec is always STARTER-derived here, so `color` is a schema-checked var(--token).
								    The inspector renders even when the scene is `invalid`, so once Director/library scenes
								    (7c) can feed an UNTRUSTED Scene in, gate this inline-style swatch on `validateColor`
								    (or `valid`) before then — an unvalidated color must not reach `style` un-checked. */}
								{selectedRow.el.color && <span className="ml-auto inline-block size-3.5 shrink-0 rounded-full border border-border" style={{ background: selectedRow.el.color }} title={selectedRow.el.color} />}
							</div>

							{/* Verb chips — toggle a motion verb on/off for this element. */}
							<div className="pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Motion</div>
							<div className="flex flex-wrap gap-1.5 pb-3">
								{applicable.map((v) => {
									const on = elVerbs.includes(v);
									return (
										<button key={v} type="button" aria-pressed={on} onClick={() => toggleVerb(v)} className={cn('rounded-full border px-2.5 py-0.5 text-[12px] font-medium transition-colors', on ? 'border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_16%,transparent)] text-[var(--accent)]' : 'border-border text-muted-foreground hover:border-[var(--text-muted)] hover:text-foreground')}>
											{v}
										</button>
									);
								})}
							</div>

							{/* Params for each active motion. */}
							{(selectedRow.el.motion ?? []).length === 0 ? (
								<p className="pb-3 text-[12px] leading-relaxed text-muted-foreground">No motion yet — tap a verb to animate “{selectedRow.el.id}”.</p>
							) : (
								<div className="flex flex-col gap-2 pb-3">
									{(selectedRow.el.motion ?? []).map((m, i) => {
										// The window fields live only on the windowed verbs; read them through a
										// narrow cast (Set.has doesn't narrow the union) — guarded by WINDOWED below.
										const win = m as { at?: number; span?: number; easing?: string };
										return (
										// biome-ignore lint/suspicious/noArrayIndexKey: a verb can legally repeat on one element (the audit flags it), so the index is the only stable disambiguator
										<div key={`${m.verb}-${i}`} className="rounded-md border border-border p-2">
											<div className="flex items-center justify-between pb-1.5">
												<span className="text-[12px] font-semibold text-[var(--accent)]">{m.verb}</span>
												<button type="button" aria-label={`Remove ${m.verb} from ${selectedRow.el.id}`} onClick={() => removeMotion(i)} className="rounded p-0.5 text-muted-foreground hover:text-[var(--fail)]"><X className="size-3" /></button>
											</div>
											{(m.verb === 'spin' || m.verb === 'orbit') && (
												<div className="flex flex-col gap-1.5">
													<div className="flex items-center justify-between gap-2 text-[12px] text-muted-foreground">
														<span>axis</span>
														<span className="inline-flex overflow-hidden rounded border border-border">
															{AXES.map((ax) => (
																<button key={ax} type="button" aria-pressed={m.axis === ax} onClick={() => updateMotion(i, { axis: ax })} className={cn('px-2 py-0.5 text-[12px]', m.axis === ax ? 'bg-[var(--accent)] text-[var(--bg,#fff)]' : 'text-foreground hover:bg-muted')}>{ax}</button>
															))}
														</span>
													</div>
													<label className="flex items-center justify-between gap-2 text-[12px] text-muted-foreground">
														<span>period <span className="text-[11px]">(ms/turn)</span></span>
														<input type="number" min={1} step={100} value={m.period} onChange={(e) => updateMotion(i, { period: Math.max(1, Math.round(Number(e.target.value) || 1)) })} className="w-20 rounded border border-border bg-transparent px-1.5 py-0.5 text-right text-[12px] text-foreground outline-none focus:border-[var(--accent)]" />
													</label>
												</div>
											)}
											{m.verb === 'explode' && (
												<label className="flex items-center justify-between gap-2 text-[12px] text-muted-foreground">
													<span>distance</span>
													<input type="number" min={0} step={0.1} value={m.distance} onChange={(e) => updateMotion(i, { distance: Math.max(0, Number(e.target.value) || 0) })} className="w-20 rounded border border-border bg-transparent px-1.5 py-0.5 text-right text-[12px] text-foreground outline-none focus:border-[var(--accent)]" />
												</label>
											)}
											{m.verb === 'fill' && (
												<label className="flex items-center gap-2 text-[12px] text-muted-foreground">
													<span className="shrink-0">to</span>
													<input type="range" min={0} max={1} step={0.05} value={m.to} onChange={(e) => updateMotion(i, { to: clamp01(Number(e.target.value)) })} className="min-w-0 flex-1 accent-[var(--accent)]" />
													<span className="w-8 shrink-0 text-right tabular-nums">{m.to.toFixed(2)}</span>
												</label>
											)}
											{WINDOWED.has(m.verb) && (
												<div className="mt-1.5 flex flex-col gap-1.5 border-t border-border pt-1.5">
													<label className="flex items-center gap-2 text-[12px] text-muted-foreground">
														<span className="w-10 shrink-0">start</span>
														<input type="range" min={0} max={1} step={0.05} value={win.at ?? 0} onChange={(e) => updateMotion(i, { at: clamp01(Number(e.target.value)) })} className="min-w-0 flex-1 accent-[var(--accent)]" />
														<span className="w-8 shrink-0 text-right tabular-nums">{(win.at ?? 0).toFixed(2)}</span>
													</label>
													<label className="flex items-center gap-2 text-[12px] text-muted-foreground">
														<span className="w-10 shrink-0">span</span>
														<input type="range" min={0} max={1} step={0.05} value={win.span ?? 1} onChange={(e) => updateMotion(i, { span: clamp01(Number(e.target.value)) })} className="min-w-0 flex-1 accent-[var(--accent)]" />
														<span className="w-8 shrink-0 text-right tabular-nums">{(win.span ?? 1).toFixed(2)}</span>
													</label>
													<label className="flex items-center justify-between gap-2 text-[12px] text-muted-foreground">
														<span>easing</span>
														<select value={win.easing ?? 'linear'} onChange={(e) => updateMotion(i, { easing: e.target.value })} className="rounded border border-border bg-transparent px-1.5 py-0.5 text-[12px] text-foreground outline-none focus:border-[var(--accent)]">
															{EASINGS.map((es) => <option key={es} value={es}>{es}</option>)}
														</select>
													</label>
												</div>
											)}
										</div>
										);
									})}
								</div>
							)}
						</>
					) : (
						<p className="text-[13px] text-muted-foreground">No element selected.</p>
					)}

					{/* The "reads as information?" audit — scene-wide, advisory (never blocks). */}
					<div className="mt-1 border-t border-border pt-3">
						<div className="pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Reads as information?</div>
						{audit.length === 0 ? (
							<p className="flex items-center gap-1.5 text-[12px] text-[var(--accent)]"><Check className="size-3.5 shrink-0" /> Every motion earns its place.</p>
						) : (
							<ul className="flex flex-col gap-1.5">
								{audit.map((n) => (
									<li key={`${n.elId ?? 'scene'}:${n.message}`} className={cn('flex gap-1.5 text-[12px] leading-snug', n.level === 'warn' ? 'text-[var(--fail)]' : 'text-muted-foreground')}>
										<span aria-hidden className="shrink-0">{n.level === 'warn' ? '⚠' : 'ℹ'}</span><span>{n.message}</span>
									</li>
								))}
							</ul>
						)}
					</div>
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
@media (prefers-reduced-motion: reduce){.motion-stage .scene-control{transition:none}}
.motion-stage .scene-control::before{font-size:1.1em}
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
