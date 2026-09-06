// FABRICATE → MOTION. A faculty that CRAFTS a motion asset: a drawing, plus a plan for how it reveals.
//
// This is what makes Motion a Fabricate tab rather than a control panel. Its three siblings each
// bring a named, previewable, reusable thing into existence — a theme, a component, a finish — and a
// motion asset is the same shape. Adjusting how an EXISTING chart animates is a different job and
// lives in the deck Inspector (`2026-09-06-fabricate-motion-sheet.md`).
//
// The model a user holds is nine words: **a drawing plus a running order — the parts, and the beat
// each one arrives on.** No timeline, no window, no easing, no `at`/`span`. The frame model is
// taught by the frame strip under the stage, never by exposing `at(k/N)`.
//
// v1 is the BRING on-ramp only. Describe (a model writing the SVG) produces exactly what `intake()`
// already takes, so v2 is one command bar above the paste box and nothing else moves — and v1 ships
// no disabled placeholder for it, because a control that does not move something is not in this tab.
//
// Design: `engineering/decisions/2026-09-06-fabricate-motion-design.md`.

import { ArrowUp, Check, Clipboard, Cloud, Download, Loader2, Sparkles, Upload } from 'lucide-react';
import * as React from 'react';
import { connectOpenRouter, generateDrawing, useArchitectStatus } from '@/components/studio/architect';
import { REFUSAL_PREFIX } from '@/components/studio/library/asset-store.js';
import { findNameClash } from '@/components/studio/library/save-guard';
import { type StudioScene, saveStudioScene, slugify } from '@/components/studio/scene-library';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Tip } from '@/components/ui/tooltip';
import type { Scene } from '@/lib/anima';
import { cn } from '@/lib/utils';
import { ART_MAX_BYTES } from './limits';
import { MotionFrames } from './MotionFrames';
import { MotionInspector } from './MotionInspector';
import { MotionParts } from './MotionParts';
import { MotionReceipt } from './MotionReceipt';
import { MotionStage } from './MotionStage';
import { matchTheme } from './match-theme';
import { DEFAULT_PART_PLAN, type Pace, type PartPlan, type Plan, planToScene, sceneToPlan, validatePlan } from './plan';
import { reconcile, remapPlan } from './reconcile';
import { posterBytes, slideSkeleton } from './skeleton';
import { type IntakePart, type IntakeReceipt, intake, setPartTitle, splitBand } from './svg-intake';

/** A worked example, so a first-time user with nothing on their clipboard still reaches a playing
 *  asset in one click. Copied from `examples/anima-scene.md`'s own svg slide — a drawing already
 *  proven to animate and already palette-blind (#3). */
const EXAMPLE_SVG = `<svg viewBox="0 0 460 150" fill="none" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><rect id="first-stage" x="14" y="50" width="118" height="52" rx="11" stroke="var(--cat-2-mark)"/><path id="first-arrow" d="M132 76 H176 M166 68 L176 76 L166 84" stroke="var(--text-muted)"/><rect id="second-stage" x="176" y="50" width="118" height="52" rx="11" stroke="var(--accent)"/><path id="second-arrow" d="M294 76 H338 M328 68 L338 76 L328 84" stroke="var(--text-muted)"/><rect id="third-stage" x="338" y="50" width="118" height="52" rx="11" stroke="var(--cat-6-mark)"/></svg>`;

type Loaded = { art: string; parts: IntakePart[]; viewBox: readonly [number, number, number, number]; receipt: IntakeReceipt };

export function MotionStudio({
	seed,
	savedScenes = [],
	notify,
	onSaved,
	onInsert,
	onOpenWorkspace,
}: {
	seed?: StudioScene | null;
	savedScenes?: { id: string; name: string }[];
	notify: (msg: string) => void;
	onSaved?: () => void;
	onOpenWorkspace?: () => void;
	/** Write the crafted asset into the current deck. Separate from Save on purpose: crafting and
	 *  placing are different intents, and the Library card carries Insert too. */
	onInsert?: (markdown: string, name: string) => void;
}) {
	const [loaded, setLoaded] = React.useState<Loaded | null>(null);
	const [plan, setPlan] = React.useState<Plan>(new Map());
	// The live plan, readable from a callback without making it a dependency — see `load`.
	const planRef = React.useRef(plan);
	planRef.current = plan;
	const [pace, setPace] = React.useState<Pace>('calm');
	const [selected, setSelected] = React.useState<string | null>(null);
	const [name, setName] = React.useState('');
	const [desc, setDesc] = React.useState('');
	const [paste, setPaste] = React.useState('');
	const [busy, setBusy] = React.useState(false);
	const [saving, setSaving] = React.useState(false);
	const [refusal, setRefusal] = React.useState('');
	const [editingId, setEditingId] = React.useState<string | null>(null);
	const [owned] = React.useState<Set<string>>(() => new Set());
	const [replay, setReplay] = React.useState(0);
	const [frame, setFrame] = React.useState(0);
	/** `pathRef`s the plan carries that the drawing no longer has. Shown, never dropped — silently
	 *  losing a user's choreography is the §7c data-loss lesson wearing a different hat. */
	const [missing, setMissing] = React.useState<{ pathRef: string; label: string }[]>([]);
	const [describe, setDescribe] = React.useState('');
	const [generating, setGenerating] = React.useState(false);
	/** Set when Replace sent us back to the paste pane — the next intake RECONCILES instead of resetting. */
	const [replacing, setReplacing] = React.useState<IntakePart[] | null>(null);
	/** A saved plan whose windows do not quantize to beats. Shown read-only rather than re-timed. */
	const [customTiming, setCustomTiming] = React.useState(false);
	/** The spec exactly as it was stored, kept ONLY for a custom-timing asset — see `save`. */
	const [originalSpec, setOriginalSpec] = React.useState<Scene | null>(null);

	// Read a pasted, dropped or example drawing. `keepPlanFromParts` carries the parts we had when
	// Replace sent us back to the paste pane, so that path RECONCILES instead of resetting.
	const load = React.useCallback(
		(raw: string, keepPlanFromParts: IntakePart[] | null | boolean, onDone?: (ok: boolean) => void) => {
			// `Replace` hands back the parts we had, so the diff runs against them rather than against a
			// `loaded` we have already cleared to show the paste pane.
			const keepPlanFrom = Array.isArray(keepPlanFromParts) ? keepPlanFromParts : null;
			setBusy(true);
			setRefusal('');
			// Yield once so the spinner paints before a 400-part parse blocks the thread.
			window.setTimeout(() => {
				const r = intake(raw);
				if (!r.ok) {
					setRefusal(r.message);
					setBusy(false);
					onDone?.(false);
					return;
				}
				const next: Loaded = { art: r.art, parts: r.parts, viewBox: r.viewBox, receipt: r.receipt };
				const previous = keepPlanFrom;

				// EVERYTHING IS COMPUTED HERE, NOT INSIDE A STATE UPDATER.
				//
				// This block used to sit inside `setLoaded(...)`, calling `setPlan`, `setMissing` and
				// `notify` from within it. React invokes an updater TWICE under StrictMode — which the
				// Studio island turns on deliberately — so `remapPlan` ran a second time against a map
				// already keyed on the NEW pathRefs, matched nothing, and returned empty. Replace then
				// reset every part to the default while the toast cheerfully said "5 parts matched".
				// Production React hid it; `astro dev`, the surface every manual check uses, did not.
				//
				// A state updater must be a pure function of its argument. The plan is read through a
				// ref so this can compute the next one ONCE and hand over a plain value.
				if (previous) {
					// Replace is a DIFF, not a reset — match the new parts to the plan already in hand.
					const rec = reconcile(previous, r.parts);
					setPlan(remapPlan(planRef.current, rec.remap));
					setMissing(rec.entries.filter((e) => e.how === 'gone').map((e) => ({ pathRef: e.previous ?? '', label: e.previousLabel ?? 'A part' })));
					notify(rec.summary);
				} else {
					// Every part starts on beat 1, fading in — a plan that already plays, so nobody
					// stares at a dead stage deciding what a verb is.
					setPlan(new Map(r.parts.map((p) => [p.pathRef, { ...DEFAULT_PART_PLAN }])));
					setMissing([]);
				}
				setLoaded(next);
				setSelected(r.parts[0]?.pathRef ?? null);
				setReplacing(null);
				setBusy(false);
				setReplay((n) => n + 1);
				onDone?.(true);
			}, 0);
		},
		[notify],
	);

	// DESCRIBE — the second on-ramp, and it needs no second doorway.
	//
	// A model's SVG is untrusted in exactly the way a pasted one is, so it goes through the SAME
	// `load` → `intake()` path: sanitized, stripped of every off-origin fetch, id-namespaced, and
	// reported in the same receipt. That is why Bring shipped first — it built the door this walks
	// through, and Describe adds a source rather than a security surface.
	//
	// THE TOAST AND THE PROMPT WIPE WAIT FOR `intake()`, and that ordering is the whole reason `load`
	// carries a callback. The sibling this copies — `FinishStudio`'s `runGenerate` — sets its recipe
	// synchronously through a coercion that cannot fail, so announcing success on the next line is
	// true there. Here the model's SVG still has to survive intake, which refuses a drawing with no
	// coordinate box, nothing addressable, or too many bytes. Announcing first said "Drew it" over a
	// red refusal, and cleared the prompt the user would now have to retype — the §7c data-loss
	// lesson, on the one path that produced nothing.
	const runDescribe = React.useCallback(
		async (text: string) => {
			if (!text.trim() || generating) return;
			setGenerating(true);
			setRefusal('');
			try {
				const out = await generateDrawing(text);
				if (out.status === 'ok') {
					load(out.svg, replacing, (ok) => {
						setGenerating(false);
						// A refusal keeps the prompt: it is the thing the user would edit and resend.
						if (!ok) return;
						setDescribe('');
						notify('Drew it — now give its parts their beats.');
					});
					return;
				}
				if (out.status === 'offline') {
					setRefusal('No model is connected. Connect one to describe a drawing — or paste an SVG you already have.');
				} else {
					setRefusal(out.note);
				}
			} catch {
				setRefusal('That drawing could not be generated — please try again.');
			}
			// Only the paths that did NOT hand off to `load` land here; the `ok` branch above returns,
			// and its callback owns the spinner until intake has actually decided.
			setGenerating(false);
		},
		[generating, load, notify, replacing],
	);

	// Reopening a saved asset is a DERIVATION, not a stored blob — `sceneToPlan` inverts the mapping,
	// so the record needs no field for roles and beats.
	React.useEffect(() => {
		if (!seed) return;
		const r = intake(seed.art ?? '');
		if (!r.ok) {
			setRefusal(`This saved asset could not be reopened: ${r.message}`);
			return;
		}
		const { plan: back, pace: seedPace, beatShaped } = sceneToPlan(seed.spec);
		setCustomTiming(!beatShaped);
		setOriginalSpec(beatShaped ? null : seed.spec);
		const known = new Set(r.parts.map((p) => p.pathRef));
		// A part in the plan with no node in the art is reported, never dropped.
		setMissing(Array.from(back.keys()).filter((k) => !known.has(k)).map((k) => ({ pathRef: k, label: k })));
		const seeded: Plan = new Map(r.parts.map((p) => [p.pathRef, back.get(p.pathRef) ?? { ...DEFAULT_PART_PLAN, role: 'still' as const }]));
		setLoaded({ art: r.art, parts: r.parts, viewBox: r.viewBox, receipt: r.receipt });
		setPlan(seeded);
		setPace(seedPace);
		setName(seed.name);
		setDesc(seed.description ?? '');
		setEditingId(seed.id);
		setSelected(r.parts[0]?.pathRef ?? null);
	}, [seed]);

	const spec: Scene | null = React.useMemo(() => {
		if (!loaded) return null;
		// A CUSTOM-TIMING asset keeps the spec it arrived with. The banner tells the user it will be
		// saved as-is, and this is what makes that true: `planToScene` would quantize its uneven
		// windows onto equal beats and re-time the whole thing, and a motion asset carries no version
		// history to undo that from.
		if (customTiming && originalSpec) return originalSpec;
		return planToScene(loaded.parts, plan, pace, slugify(name) || 'drawing', loaded.viewBox);
	}, [loaded, plan, pace, name, customTiming, originalSpec]);

	const beatCount = React.useMemo(() => new Set(Array.from(plan.values()).map((p) => p.beat)).size || 1, [plan]);
	// The poster is what inlines into the slide, so it is what the ceiling has to bind.
	const poster = React.useMemo(() => (loaded ? posterBytes({ label: name || 'Untitled drawing', description: desc || undefined, art: loaded.art }) : 0), [loaded, name, desc]);
	const posterTooBig = poster > ART_MAX_BYTES;
	const validity = React.useMemo(() => (spec ? validatePlan(spec) : { ok: false as const, errors: ['nothing loaded'] }), [spec]);
	const nameOk = slugify(name).length > 0;
	const takenBy = React.useMemo(() => (nameOk ? findNameClash(savedScenes, slugify(name), editingId, owned) : undefined), [savedScenes, name, nameOk, editingId, owned]);
	const canSave = !!loaded && nameOk && !takenBy && validity.ok && !posterTooBig && !saving;

	const skeleton = React.useMemo(() => {
		if (!loaded || !spec) return '';
		return slideSkeleton({ label: name || 'Untitled drawing', description: desc || undefined, art: loaded.art, spec });
	}, [loaded, spec, name, desc]);

	const setPartPlan = (pathRef: string, patch: Partial<PartPlan>) => {
		setPlan((p) => {
			const next = new Map(p);
			next.set(pathRef, { ...(p.get(pathRef) ?? DEFAULT_PART_PLAN), ...patch });
			return next;
		});
		// A changed plan must RE-RUN the intro, or toggling a role out and back leaves a settled,
		// motionless preview on the most ordinary edit gesture there is.
		setReplay((n) => n + 1);
	};

	const splitBandInto = (bandRef: string) => {
		setLoaded((prev) => {
			if (!prev) return prev;
			const out = splitBand(prev.art, bandRef);
			if (!out) return prev;
			const at = prev.parts.findIndex((p) => p.pathRef === bandRef);
			const parts = [...prev.parts.slice(0, at), ...out.members, ...prev.parts.slice(at + 1)];
			// The members inherit the band's beat, so opening a group never re-times what was already set.
			setPlan((p) => {
				const inherited = p.get(bandRef) ?? DEFAULT_PART_PLAN;
				const next = new Map(p);
				next.delete(bandRef);
				for (const m of out.members) next.set(m.pathRef, { ...inherited, role: m.drawable && m.strokeable ? inherited.role : inherited.role === 'draw' ? 'fade' : inherited.role });
				return next;
			});
			setSelected(out.members[0]?.pathRef ?? null);
			setReplay((n) => n + 1);
			return { ...prev, art: out.art, parts };
		});
	};

	const addBeat = () => {
		if (!selected) return;
		const max = Math.max(...Array.from(plan.values()).map((p) => p.beat), 0);
		setPartPlan(selected, { beat: max + 1 });
	};

	async function save() {
		if (!canSave || !loaded || !spec) return;
		setSaving(true);
		try {
			const stored = await saveStudioScene({ ...(editingId ? { id: editingId } : {}), name: slugify(name), label: name.trim(), description: desc.trim() || undefined, spec, art: loaded.art });
			owned.add(stored.id);
			notify(`Saved “${stored.label}” to your Library — insert it from its card.`);
			onSaved?.();
		} catch (err) {
			const msg = String((err as Error)?.message ?? '');
			notify(msg.startsWith(REFUSAL_PREFIX) ? msg : 'Could not save — your browser may be blocking storage (private mode?).');
		} finally {
			setSaving(false);
		}
	}

	const selectedPart = loaded?.parts.find((p) => p.pathRef === selected) ?? null;
	const inspector = (pathRef: string) => {
		const part = loaded?.parts.find((p) => p.pathRef === pathRef);
		if (!part) return null;
		return <MotionInspector part={part} plan={plan.get(pathRef) ?? DEFAULT_PART_PLAN} onChange={(patch) => setPartPlan(pathRef, patch)} onSplit={splitBandInto} />;
	};

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			{/* Header — the house 50px bar, matching FinishStudio exactly. */}
			<div className="flex h-[50px] shrink-0 items-center gap-2 border-b border-border bg-card px-3 sm:gap-3 sm:px-4">
				<span className="size-2 shrink-0 rounded-full bg-[var(--accent)]" />
				<div className={cn('flex min-w-0 max-w-[220px] flex-shrink items-center rounded-md border bg-transparent px-1.5 py-0.5 focus-within:border-[var(--accent)]', name && !nameOk ? 'border-[color-mix(in_srgb,var(--fail)_55%,var(--border))]' : 'border-transparent hover:border-border')}>
					<span className="shrink-0 font-mono text-[13px] text-muted-foreground">motion-</span>
					<input value={name} onChange={(e) => setName(e.target.value)} aria-label="Motion name" placeholder="name-your-motion" spellCheck={false} className="min-w-0 flex-1 bg-transparent font-mono text-[13px] font-semibold text-[var(--text-heading)] outline-none placeholder:font-normal placeholder:text-muted-foreground" />
				</div>
				<div className="flex-1" />
				{onInsert && (
					<Button variant="outline" size="sm" disabled={!canSave} className="shrink-0 gap-1.5 px-2 sm:px-3" onClick={() => { onInsert(skeleton, name); notify(`Added “${name}” to this deck.`); }}>
						<Download className="size-4" />
						<span className="hidden sm:inline">Add to deck</span>
					</Button>
				)}
				<Tip label={takenBy ? `“${slugify(name)}” is already a saved motion — pick another name.` : !nameOk ? 'Name it to save.' : posterTooBig ? `The still this makes is ${Math.round(poster / 1024)} KB — over the ${ART_MAX_BYTES / 1024} KB a slide can carry.` : !validity.ok ? 'This plan does not validate yet.' : ''}>
					<span className="inline-flex shrink-0">
						<Button size="sm" disabled={!canSave} className="shrink-0 gap-1.5 px-2 sm:px-3" onClick={save}>
							{saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
							<span className="hidden sm:inline">{saving ? 'Saving…' : 'Save'}</span>
						</Button>
					</span>
				</Tip>
			</div>

			{/* A refusal gets its own full-width row so it can WRAP rather than truncate — the lesson
			    FinishStudio records after measuring its own message at 32px wide on a phone. */}
			{refusal ? (
				<p role="alert" className="shrink-0 border-b border-border bg-card px-3 py-2 text-[11.5px] leading-snug text-[color-mix(in_srgb,var(--fail)_80%,var(--text-body))] sm:px-4">
					{refusal}
				</p>
			) : null}

			{!loaded ? (
				<Empty
					paste={paste}
					setPaste={setPaste}
					busy={busy}
					replacing={!!replacing}
					describe={describe}
					setDescribe={setDescribe}
					generating={generating}
					onDescribe={runDescribe}
					onOpenWorkspace={onOpenWorkspace}
					notify={notify}
					onCancel={replacing ? () => { setReplacing(null); setPaste(''); } : undefined}
					onLoad={(raw) => load(raw, replacing)}
					onExample={() => load(EXAMPLE_SVG, false)}
				/>
			) : (
				// The grid gates at 1100px, not `lg` (1024): between the two the three-column layout
				// would render beside an inspector that has not appeared, leaving a dead column.
				<div className="flex min-h-0 flex-1 flex-col overflow-y-auto [@media(min-width:1100px)]:grid [@media(min-width:1100px)]:overflow-hidden [@media(min-width:1100px)]:[grid-template-columns:300px_1fr_330px]">
					{/* PARTS */}
					<div className="flex min-w-0 flex-col gap-3 border-b border-border p-3 [@media(min-width:1100px)]:overflow-y-auto [@media(min-width:1100px)]:border-b-0 [@media(min-width:1100px)]:border-r">
						<MotionReceipt receipt={loaded.receipt} onReplace={() => { setReplacing(loaded.parts); setLoaded(null); setPaste(''); }} />
						{posterTooBig && (
							<p role="alert" className="rounded-md border border-[color-mix(in_srgb,var(--fail)_45%,var(--border))] p-2 text-[11.5px] leading-snug text-[color-mix(in_srgb,var(--fail)_80%,var(--text-body))]">
								The still this makes is {Math.round(poster / 1024)} KB, over the {ART_MAX_BYTES / 1024} KB a slide can carry. Simplify the drawing, or crop it to the part you want to animate.
							</p>
						)}
						{customTiming && (
							<div role="status" className="rounded-md border border-[color-mix(in_srgb,var(--warn)_45%,var(--border))] p-2 text-[11.5px] leading-snug text-muted-foreground">
								<strong className="text-[var(--text-heading)]">Custom timing.</strong> This asset's parts do not fall on even beats, so it was written by hand or by an older tool. It is shown as-is and will be saved as-is — editing a beat here would re-time the whole thing, and a motion asset has no version history to undo that from.
							</div>
						)}
						<MotionParts
							parts={loaded.parts}
							plan={plan}
							selected={selected}
							missing={missing}
							onSelect={setSelected}
							onMove={(ref, beat) => setPartPlan(ref, { beat })}
							onRename={(ref, label) => {
								const next = label.trim();
								if (!next) return;
								// Into the DRAWING, not just React state. Reopening re-derives every label from the
								// art — there is no field on the record for them — so a rename kept only in state
								// degrades back to "Shape · upper left" the moment the tab closes.
								setLoaded((prev) => (prev ? { ...prev, art: setPartTitle(prev.art, ref, next), parts: prev.parts.map((p) => (p.pathRef === ref ? { ...p, label: next } : p)) } : prev));
							}}
							onAddBeat={addBeat}
							renderInspector={inspector}
						/>
					</div>

					{/* STAGE — FIRST in the single-column stack, and only there.
					    Below 1100px the panes stack, and source order would put the whole parts list above
					    the preview: on a phone you would scroll past every part to see what you are
					    choreographing, then scroll back. `order` moves it to the top of the stack without
					    moving it in the DOM, so the reading order for a screen reader is unchanged and the
					    three-column layout above 1100px is untouched. */}
					<div className="order-first flex min-w-0 flex-col gap-3 bg-[color-mix(in_srgb,var(--bg)_55%,var(--bg-alt))] p-4 [@media(min-width:1100px)]:order-none [@media(min-width:1100px)]:overflow-y-auto [@media(min-width:1100px)]:p-6">
						<div className="flex items-center justify-between gap-3">
							<span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">Live preview</span>
							<div className="inline-flex shrink-0 rounded-lg border border-border bg-background p-[3px]">
								{(['calm', 'brisk'] as Pace[]).map((p) => (
									<button key={p} type="button" aria-pressed={pace === p} onClick={() => { setPace(p); setReplay((n) => n + 1); }} className={cn('rounded-md px-2 py-1 text-[11.5px] font-semibold capitalize', pace === p ? 'bg-card text-[var(--accent)] shadow-sm' : 'text-muted-foreground')}>
										{p}
									</button>
								))}
							</div>
						</div>
						<MotionStage art={loaded.art} spec={validity.ok ? spec : null} replayKey={`${replay}`} className="aspect-video w-full overflow-hidden rounded-lg border border-border bg-[var(--bg)] shadow-[0_6px_18px_rgba(10,22,40,.10)]" />
						<MotionFrames art={loaded.art} spec={validity.ok ? spec : null} beats={beatCount} selected={frame} onSelect={setFrame} />
						<p className="text-[12px] leading-relaxed text-muted-foreground">
							Plays on screen; the PDF freezes the finished drawing. Palette colors are approximate here — the deck's own are used on the slide. {loaded.receipt.kept.fixedColors > 0 && (
								<button type="button" onClick={() => { setLoaded((prev) => (prev ? { ...prev, art: matchTheme(prev.art) } : prev)); setReplay((n) => n + 1); notify('Recolored the drawing with your theme tokens.'); }} className="font-semibold text-[var(--accent)] underline underline-offset-2">
									Match the theme
								</button>
							)}
						</p>
						{!validity.ok && (
							<p role="alert" className="text-[11.5px] leading-snug text-[var(--fail)]">
								This plan did not validate — that is a bug on our side, not yours: {validity.errors.join('; ')}
							</p>
						)}
					</div>

					{/* INSPECTOR — one component, placed by breakpoint. Below 1100px it renders inside the
					    selected row instead (see MotionParts), never in both places at once. */}
					<div className="hidden min-w-0 flex-col gap-3 border-l border-border p-3 [@media(min-width:1100px)]:flex [@media(min-width:1100px)]:overflow-y-auto">
						{selectedPart ? inspector(selectedPart.pathRef) : <p className="text-[13px] text-muted-foreground">Pick a part to say how it arrives.</p>}
					</div>
				</div>
			)}
		</div>
	);
}

/** The front door. A real `<textarea>`, not a div with a paste handler, so Cmd-V works, the field is
 *  labeled, and a keyboard or screen-reader user reaches it by Tab. */
function Empty({ paste, setPaste, busy, replacing, describe, setDescribe, generating, onDescribe, onOpenWorkspace, notify, onCancel, onLoad, onExample }: { paste: string; setPaste: (v: string) => void; busy: boolean; replacing?: boolean; describe: string; setDescribe: (v: string) => void; generating: boolean; onDescribe: (text: string) => void; onOpenWorkspace?: () => void; notify: (msg: string) => void; onCancel?: () => void; onLoad: (raw: string) => void; onExample: () => void }) {
	const [over, setOver] = React.useState(false);
	const status = useArchitectStatus();
	const modelReady = status.ready;
	return (
		// A labelled REGION rather than a bare div: dropping a file is a pointer-only affordance that
		// duplicates the two keyboard paths inside it — the labelled textarea and the file input — so
		// the region itself needs no keyboard handler, and naming it keeps it in the a11y tree.
		<section
			aria-label="Start a drawing"
			onDragOver={(e) => { e.preventDefault(); setOver(true); }}
			onDragLeave={() => setOver(false)}
			onDrop={(e) => {
				e.preventDefault();
				setOver(false);
				const file = e.dataTransfer.files?.[0];
				if (file) file.text().then(onLoad);
			}}
			className={cn('flex min-h-0 flex-1 items-center justify-center p-6', over && 'bg-[color-mix(in_srgb,var(--accent)_8%,transparent)]')}
		>
			<div className={cn('flex w-full max-w-[520px] flex-col gap-3 rounded-xl border-2 border-dashed p-5', over ? 'border-[var(--accent)]' : 'border-border')}>
				<div>
					<h2 className="text-[15px] font-semibold text-[var(--text-heading)]">{replacing ? 'Replace the drawing' : 'Start a drawing'}</h2>
					<p className="text-[12.5px] leading-relaxed text-muted-foreground">
						{replacing
							? 'Paste the edited drawing. We match its parts to the running order you already have and tell you what moved, what is new and what is gone — nothing is thrown away silently.'
							: 'Describe one in words, or bring one you already have. We find its parts, you give each one a beat, and it plays.'}
					</p>
					{!replacing && (
						<p className="text-[11.5px] leading-relaxed text-muted-foreground">
							<strong className="text-[var(--text-heading)]">An outlined drawing draws itself.</strong> A filled one can still fade, slide and be ordered — drawing traces an outline, so it needs one.
						</p>
					)}
				</div>
				{/* DESCRIBE — the same command bar the three sibling faculties ship, degrading the same
				    honest way when no model is connected. It asks the model for stroked line art in
				    palette tokens because that is measurably what this engine draws well, and its reply
				    goes through the same `intake()` a paste does — so it adds a SOURCE, not a second
				    security surface. */}
				{!replacing && (
					<div className={cn('flex items-center gap-2.5 rounded-[10px] border bg-background px-3 py-2', modelReady ? 'border-[color-mix(in_srgb,var(--accent)_40%,var(--border))]' : 'border-dashed border-border')}>
						<Sparkles className={cn('size-4 shrink-0', modelReady ? 'text-[var(--accent)]' : 'text-muted-foreground')} />
						<input
							value={describe}
							onChange={(e) => setDescribe(e.target.value)}
							onKeyDown={(e) => {
								// `isComposing` guards the IME: a CJK author presses Enter to COMMIT a candidate,
								// and without this that keystroke submits a half-typed prompt and spends a call.
								if (e.key === 'Enter' && !e.nativeEvent.isComposing) onDescribe(describe);
							}}
							disabled={generating || !modelReady}
							placeholder="Describe a drawing — e.g. “a review loop”"
							aria-label="Describe a drawing"
							className="min-w-0 flex-1 bg-transparent text-[13px] text-[var(--text-heading)] outline-none placeholder:text-muted-foreground disabled:opacity-60"
						/>
						{modelReady ? (
							<button type="button" onClick={() => onDescribe(describe)} disabled={generating || !describe.trim()} aria-label="Generate drawing" className="grid size-7 shrink-0 place-items-center rounded-md bg-[var(--accent)] text-[var(--on-accent,#fff)] disabled:opacity-40">
								{generating ? <Loader2 className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}
							</button>
						) : (
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<button type="button" aria-label="Connect a model" className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-[var(--accent)] px-2.5 py-1 text-[12px] font-semibold text-[var(--on-accent,#fff)]">
										<Cloud className="size-3.5" />
										Connect
									</button>
								</DropdownMenuTrigger>
								<DropdownMenuContent align="end" className="w-60">
									<DropdownMenuItem
										onSelect={() => {
											connectOpenRouter().catch(() => notify('Could not start the OpenRouter connect flow — try Workspace.'));
										}}
									>
										<Cloud className="size-4" />
										<div>
											<div className="font-semibold text-[var(--text-heading)]">Connect cloud</div>
											<div className="text-[11px] text-muted-foreground">OpenRouter — your own key</div>
										</div>
									</DropdownMenuItem>
									<DropdownMenuItem onSelect={() => onOpenWorkspace?.()}>
										<Sparkles className="size-4" />
										<div>
											<div className="font-semibold text-[var(--text-heading)]">Use on-device</div>
											<div className="text-[11px] text-muted-foreground">Runs locally, free — via Workspace</div>
										</div>
									</DropdownMenuItem>
									<DropdownMenuSeparator />
									<DropdownMenuItem onSelect={() => onOpenWorkspace?.()}>Open Workspace…</DropdownMenuItem>
								</DropdownMenuContent>
							</DropdownMenu>
						)}
					</div>
				)}
				{!replacing && (
					<p className="text-[11px] leading-snug text-muted-foreground">
						{modelReady ? 'Or bring one you already have:' : 'Connect a model to describe a drawing in words — or bring one you already have:'}
					</p>
				)}

				<textarea
					value={paste}
					onChange={(e) => setPaste(e.target.value)}
					onPaste={(e) => {
						const text = e.clipboardData.getData('text');
						if (text.includes('<svg')) {
							e.preventDefault();
							setPaste(text);
							onLoad(text);
						}
					}}
					aria-label="Paste SVG markup"
					placeholder="<svg viewBox=…>…</svg>"
					spellCheck={false}
					className="h-28 w-full resize-none rounded-lg border border-border bg-background p-2 font-mono text-[12px] text-foreground outline-none focus:border-[var(--accent)]"
				/>
				<div className="flex flex-wrap items-center gap-2">
					<Button size="sm" disabled={busy || !paste.trim()} onClick={() => onLoad(paste)} className="gap-1.5">
						{busy ? <Loader2 className="size-4 animate-spin" /> : <Clipboard className="size-4" />}
						{busy ? 'Reading the drawing…' : 'Use this drawing'}
					</Button>
					<label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-[12px] font-semibold text-muted-foreground hover:border-[var(--accent)] hover:text-[var(--accent)]">
						<Upload className="size-3.5" /> Choose a file
						<input type="file" accept=".svg,image/svg+xml" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) f.text().then(onLoad); }} />
					</label>
					{onCancel ? (
						<button type="button" onClick={onCancel} className="text-[12px] font-semibold text-muted-foreground underline underline-offset-2">
							Cancel — keep the drawing I have
						</button>
					) : (
						<button type="button" onClick={onExample} className="text-[12px] font-semibold text-[var(--accent)] underline underline-offset-2">
							or try an example
						</button>
					)}
				</div>
			</div>
		</section>
	);
}

export default MotionStudio;
