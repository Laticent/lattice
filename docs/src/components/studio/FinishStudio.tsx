import { ArrowUp, Check, Cloud, Download, FileDown, Loader2, Moon, Sparkles, Sun } from 'lucide-react';
import * as React from 'react';
import { DeckPreview } from '@/components/DeckPreview';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import type { SingleSlideOptions } from '@/lib/single-slide-render';
import { cn } from '@/lib/utils';
import { connectOpenRouter, generateFinish, useArchitectStatus } from './architect';
import { downloadText } from './download';
import {
	coerceRecipe,
	EDGE_TYPES,
	type FinishRecipe,
	generateFinishCss,
	MARK_ANGLE,
	MARK_SCALE,
	MARK_TYPES,
	PLACEMENTS,
	type Placement,
	PRESET_RECIPES,
	placementXY,
	SPOT_RADIUS,
	safeFinishSlug,
	TEXTURE_TYPES,
	WASH_SPREAD,
	WASH_TYPES,
	washHasHotspot,
} from './finish-generate';
import { saveStudioFinish } from './finish-library';
import { Joystick } from './Joystick';
import { type HandleStyle, loadSettings, SETTINGS_EVENT } from './studio-store';

// The Finish faculty — the third Fabricate workbench (beside Theme + Component),
// now a real RIGHT-PANEL DESIGNER that mirrors them: a live preview specimen in
// the center, the four-layer stack (Wash · Texture · Mark · Edge) as Inspector
// groups on the right, a "Start from preset" row, an AI "describe a finish"
// command bar at the top, and a name + Save + Export header. Every output is
// palette-blind, url()-free, export-safe — the deterministic generator
// (finish-generate.ts) makes the CSS from a structured recipe, so the AI proposes
// a recipe (never CSS) and no model text reaches the preview frame (HARD RULE #22).

// Friendly labels for the closed vocabulary.
const WASH_LABEL: Record<string, string> = { none: 'None', 'corner-glow': 'Corner glow', duotone: 'Duotone', spotlight: 'Spotlight', bands: 'Bands', mesh: 'Gradient mesh' };
const TEXTURE_LABEL: Record<string, string> = { none: 'None', grid: 'Grid', dots: 'Dots', hatch: 'Hatch', contour: 'Contour', rings: 'Rings', ruled: 'Ruled', pinstripe: 'Pinstripe', lattice: 'Lattice weave' };
const MARK_LABEL: Record<string, string> = { none: 'None', monogram: 'Monogram', tick: 'Registration tick', bar: 'Margin bar', numeral: 'Ghost numeral' };
const EDGE_LABEL: Record<string, string> = { none: 'None', vignette: 'Vignette', 'margin-rule': 'Margin rule', fold: 'Corner fold', frame: 'Inset frame' };
const PLACEMENT_LABEL: Record<Placement, string> = { 'top-left': 'Top left', 'top-right': 'Top right', 'bottom-left': 'Bottom left', 'bottom-right': 'Bottom right', center: 'Center', left: 'Left edge' };
const PRESETS = ['atrium', 'meridian', 'strata', 'halo', 'ledger', 'nimbus', 'loom', 'savile', 'gallery'] as const;
const PRESET_LABEL: Record<string, string> = { atrium: 'Atrium', meridian: 'Meridian', strata: 'Strata', halo: 'Halo', ledger: 'Ledger', nimbus: 'Nimbus', loom: 'Loom', savile: 'Savile', gallery: 'Gallery' };
const clampPct = (n: number): number => Math.max(0, Math.min(100, Math.round(n)));

// A stable preview class so the generated rule (section.finish.finish-<slug>) lands
// on the specimen section. The specimen carries `finish finish-preview` via _class.
const PREVIEW_SLUG = 'preview';
// The specimen, with the RICH (screen) face by default. With `exporting` on, the
// section ALSO carries `.lattice-exporting` — the same class the Studio raster export
// stamps — so the generated rule's opaque export face shows live (the flatter PDF/PPTX
// look the designer would otherwise never see until after export).
const specimen = (exporting: boolean) =>
	`<!-- _class: finish finish-${PREVIEW_SLUG}${exporting ? ' lattice-exporting' : ''} -->\n\n\`Finish · live preview\`\n\n## Your finish, behind real content\n\nThe layers stay faint so body text keeps its contrast — no scrim needed.\n\n- Palette-blind\n  - Recolors with the theme accent automatically.\n- Export-safe\n  - Pure CSS gradients — survives PDF and PPTX.`;

export function FinishStudio({
	options,
	notify,
	onSaved,
	onOpenWorkspace,
}: {
	options: SingleSlideOptions;
	notify: (msg: string) => void;
	onSaved?: () => void;
	onOpenWorkspace?: () => void;
}) {
	const [recipe, setRecipe] = React.useState<FinishRecipe>(() => coerceRecipe(PRESET_RECIPES.atrium));
	const [name, setName] = React.useState('');
	const [mode, setMode] = React.useState<'light' | 'dark'>('light');
	// "Export preview" — show the OPAQUE export face the PDF/PPTX bakes, not just the
	// rich on-screen face, so the designer sees the flatter look before they ship it.
	const [exporting, setExporting] = React.useState(false);
	// The BAKED backdrop layer — the finish's FIFTH layer (2026-07-01 decision doc,
	// revised): `strength` (0–1) + `clearance` live on the recipe and are EMITTED into the
	// generated CSS as `--fin-backdrop-*` (generateFinishCss → backdropSlots), exactly like
	// wash / texture / mark / edge. The specimen previews the finish AT its baked backdrop
	// (WYSIWYG) straight from `previewCss` — no separate injection. A deck author later
	// overrides it through `finish-override:` (StudioShell). A full/absent value = no baked
	// axis.
	const strength = recipe.backdrop?.strength == null ? 100 : Math.round(recipe.backdrop.strength * 100);
	const clearance = !!recipe.backdrop?.clearance;
	// The mask is ONE shape — clearance (clear the center) OR spotlight (reveal one window),
	// never both. Toggling one clears the other. Spotlight defaults to a considered window.
	const spot = recipe.backdrop?.spotlight;
	const setStrength = (pct: number) => patch({ backdrop: { ...recipe.backdrop, strength: pct >= 100 ? undefined : pct / 100 } });
	const setClearance = (on: boolean) => patch({ backdrop: { ...recipe.backdrop, clearance: on || undefined, spotlight: on ? undefined : recipe.backdrop?.spotlight } });
	const setSpotlight = (on: boolean) =>
		patch({ backdrop: { ...recipe.backdrop, clearance: on ? undefined : recipe.backdrop?.clearance, spotlight: on ? (recipe.backdrop?.spotlight ?? { x: 70, y: 36, radius: SPOT_RADIUS.default }) : undefined } });
	const [prompt, setPrompt] = React.useState('');
	const [gen, setGen] = React.useState<'idle' | 'working'>('idle');
	const [saving, setSaving] = React.useState(false);
	const modelReady = useArchitectStatus().ready;

	// The generated CSS drives BOTH the live preview (targets finish-preview) and the
	// export/save (targets the named slug). Recompute as the recipe changes.
	const slug = safeFinishSlug(name) === 'custom' && !name.trim() ? 'custom' : safeFinishSlug(name);
	// The generated CSS bakes ALL five layers (wash / texture / mark / edge + backdrop), so
	// the specimen is WYSIWYG straight from it — the backdrop needs no separate injection.
	const previewCss = React.useMemo(() => generateFinishCss(PREVIEW_SLUG, recipe), [recipe]);
	const nameOk = !!name.trim() && /^[a-z][a-z0-9-]*$/.test(slug);

	// Mutators — each layer's controls write back through coerceRecipe so state can
	// never drift out of the closed vocabulary.
	const patch = (next: Partial<FinishRecipe>) => setRecipe((r) => coerceRecipe({ ...r, ...next }));
	const startFromPreset = (p: string) => { setRecipe(coerceRecipe(PRESET_RECIPES[p])); notify(`Started from ${PRESET_LABEL[p]} — tweak any layer.`); };

	// Which layers carry a freely placeable element (the joystick / drag handles act on
	// these). A TEXT mark (monogram/numeral) and a single-source wash both have an x/y.
	const markPlaceable = recipe.mark.type === 'monogram' || recipe.mark.type === 'numeral';
	const washPlaceable = washHasHotspot(recipe.wash.type);

	// Position writers. The joystick's onNudge accumulates a STEP per call (per frame
	// while dragging, once per arrow press); drag-on-canvas sets x/y absolutely. Both
	// use the functional updater so a burst of rAF nudges reads the LATEST value, not a
	// stale render closure.
	const STEP_POS = 1.4; // % of slide per nudge call
	const nudgeMark = (dx: number, dy: number) => setRecipe((r) => coerceRecipe({ ...r, mark: { ...r.mark, x: clampPct((r.mark.x ?? 50) + dx * STEP_POS), y: clampPct((r.mark.y ?? 50) + dy * STEP_POS) } }));
	const nudgeWash = (dx: number, dy: number) => setRecipe((r) => coerceRecipe({ ...r, wash: { ...r.wash, x: clampPct((r.wash.x ?? 50) + dx * STEP_POS), y: clampPct((r.wash.y ?? 50) + dy * STEP_POS) } }));
	const setMarkXY = (x: number, y: number) => setRecipe((r) => coerceRecipe({ ...r, mark: { ...r.mark, x: clampPct(x), y: clampPct(y) } }));
	const setWashXY = (x: number, y: number) => setRecipe((r) => coerceRecipe({ ...r, wash: { ...r.wash, x: clampPct(x), y: clampPct(y) } }));
	// Spotlight window writers — reuse the placement grammar (joystick nudge / absolute
	// drag / numeric), plus a radius slider. Keep the existing radius when only x/y move.
	const spotAt = (r: FinishRecipe) => r.backdrop?.spotlight ?? { x: 70, y: 36, radius: SPOT_RADIUS.default };
	const nudgeSpot = (dx: number, dy: number) => setRecipe((r) => coerceRecipe({ ...r, backdrop: { ...r.backdrop, spotlight: { ...spotAt(r), x: clampPct(spotAt(r).x + dx * STEP_POS), y: clampPct(spotAt(r).y + dy * STEP_POS) } } }));
	const setSpotXY = (x: number, y: number) => setRecipe((r) => coerceRecipe({ ...r, backdrop: { ...r.backdrop, spotlight: { ...spotAt(r), x: clampPct(x), y: clampPct(y) } } }));
	const setSpotRadius = (radius: number) => setRecipe((r) => coerceRecipe({ ...r, backdrop: { ...r.backdrop, spotlight: { ...spotAt(r), radius } } }));

	// Drag-on-canvas handles over the live preview — one per placeable element that's
	// actually rendering (a mark needs a glyph to show; a hotspot needs a single-source
	// wash). Reads x/y for position; dragging writes absolute x/y.
	// The workspace's chosen handle style (knob = familiar / reticle = precise). Re-read on
	// the same-tab settings event + cross-tab `storage`, so switching it in the Workspace
	// sheet updates the live specimen without a remount.
	const [handleStyle, setHandleStyle] = React.useState<HandleStyle>(() => loadSettings().handleStyle);
	React.useEffect(() => {
		const sync = () => setHandleStyle(loadSettings().handleStyle);
		window.addEventListener(SETTINGS_EVENT, sync);
		window.addEventListener('storage', sync);
		return () => {
			window.removeEventListener(SETTINGS_EVENT, sync);
			window.removeEventListener('storage', sync);
		};
	}, []);

	const canvasHandles: CanvasHandleSpec[] = [];
	if (markPlaceable && recipe.mark.glyph?.trim()) canvasHandles.push({ key: 'mark', label: 'Mark', x: recipe.mark.x ?? 50, y: recipe.mark.y ?? 50, tone: 'accent', onMove: setMarkXY });
	if (washPlaceable) canvasHandles.push({ key: 'wash', label: 'Wash', x: recipe.wash.x ?? 50, y: recipe.wash.y ?? 50, tone: 'ink', onMove: setWashXY });
	if (spot) canvasHandles.push({ key: 'spotlight', label: 'Spotlight', x: spot.x, y: spot.y, tone: 'accent', onMove: setSpotXY });

	const exportCss = () => {
		const cls = `finish finish-${slug}`;
		const css = generateFinishCss(slug, recipe);
		downloadText(
			`${slug}.finish.css`,
			`/* Lattice finish "${slug}" — apply per slide with <!-- _class: ${cls} --> or deck-wide with class: ${cls} */\n${css}\n`,
			'text/css',
		);
		notify(`Exported ${slug}.finish.css — apply with _class: ${cls}.`);
	};

	const save = async () => {
		if (!nameOk || saving) return;
		setSaving(true);
		try {
			const css = generateFinishCss(slug, recipe);
			const f = await saveStudioFinish({ name: slug, label: name.trim(), css, recipe });
			notify(`Saved "${f.label}" to your library — pick it from the Finish menu in the Inspector.`);
			onSaved?.();
		} catch {
			notify('Could not save — your browser may block storage (private mode?).');
		} finally {
			setSaving(false);
		}
	};

	async function runDescribe(text: string) {
		const p = text.trim();
		if (!p || gen === 'working') return;
		setGen('working');
		try {
			const out = await generateFinish(p);
			if (out.status === 'ok') {
				// Coerce to the closed vocab — the deterministic generator makes the CSS.
				setRecipe(coerceRecipe(out.recipe));
				if (out.name && !name.trim()) setName(safeFinishSlug(out.name));
				setPrompt('');
				notify('Generated a finish recipe — tune any layer, then Save or Export.');
			} else if (out.status === 'offline') {
				notify('No model connected — open Workspace to connect OpenRouter or load an on-device model.');
			} else if (out.status === 'blocked') {
				notify(out.note);
			} else {
				notify(out.note || 'No finish proposed.');
			}
		} catch {
			notify('Finish generation failed — please try again.');
		} finally {
			setGen('idle');
		}
	}

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			{/* Header — name + Export + Save (mirrors Fabricate's shared header shape). */}
			<div className="flex h-[50px] shrink-0 items-center gap-2 border-b border-border bg-card px-3 sm:gap-3 sm:px-4">
				<span className="size-2 shrink-0 rounded-full bg-[var(--accent)]" />
				<div className={cn('flex min-w-0 max-w-[220px] flex-shrink items-center rounded-md border bg-transparent px-1.5 py-0.5 focus-within:border-[var(--accent)]', name && !nameOk ? 'border-[color-mix(in_srgb,var(--fail,#b3261e)_55%,var(--border))]' : 'border-transparent hover:border-border')}>
					<span className="shrink-0 font-mono text-[13px] text-muted-foreground">finish-</span>
					<input
						value={name}
						onChange={(e) => setName(e.target.value)}
						aria-label="Finish name"
						placeholder="name-your-finish"
						spellCheck={false}
						className="min-w-0 flex-1 bg-transparent font-mono text-[13px] font-semibold text-[var(--text-heading)] outline-none placeholder:font-normal placeholder:text-muted-foreground"
					/>
				</div>
				<div className="flex-1" />
				<Button variant="outline" size="sm" className="shrink-0 gap-1.5 px-2 sm:px-3" onClick={exportCss}><Download className="size-4" /><span className="hidden sm:inline">Export</span></Button>
				<Button size="sm" disabled={!nameOk || saving} className="shrink-0 gap-1.5 px-2 sm:px-3" onClick={save}><Check className="size-4" /><span className="hidden sm:inline">{saving ? 'Saving…' : 'Save'}</span></Button>
			</div>

			{/* AI front door — "Describe a finish" (mirrors the Theme tab's command bar). */}
			<div className="flex shrink-0 flex-col gap-2 border-b border-border bg-card px-4 py-2.5">
				<div className={cn('flex items-center gap-2.5 rounded-[10px] border bg-background px-3 py-2', modelReady ? 'border-[color-mix(in_srgb,var(--accent)_40%,var(--border))]' : 'border-dashed border-border')}>
					<Sparkles className={cn('size-4 shrink-0', modelReady ? 'text-[var(--accent)]' : 'text-muted-foreground')} />
					<input
						value={prompt}
						onChange={(e) => setPrompt(e.target.value)}
						onKeyDown={(e) => { if (e.key === 'Enter') runDescribe(prompt); }}
						disabled={gen === 'working' || !modelReady}
						placeholder="Describe a finish — e.g. “a calm blueprint grid with a soft corner glow”"
						aria-label="Describe a finish"
						className="min-w-0 flex-1 bg-transparent text-[13px] text-[var(--text-heading)] outline-none placeholder:text-muted-foreground disabled:opacity-60"
					/>
					{modelReady ? (
						<button type="button" onClick={() => runDescribe(prompt)} disabled={gen === 'working' || !prompt.trim()} aria-label="Generate finish" className="grid size-7 shrink-0 place-items-center rounded-md bg-[var(--accent)] text-[var(--on-accent,#fff)] disabled:opacity-40">
							{gen === 'working' ? <Loader2 className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}
						</button>
					) : (
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<button type="button" aria-label="Connect a model" className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-[var(--accent)] px-2.5 py-1 text-[12px] font-semibold text-[var(--on-accent,#fff)]"><Cloud className="size-3.5" />Connect</button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end" className="w-60">
								<DropdownMenuItem onSelect={() => { connectOpenRouter().catch(() => notify('Could not start the OpenRouter connect flow — try Workspace.')); }}><Cloud className="size-4" /><div><div className="font-semibold text-[var(--text-heading)]">Connect cloud</div><div className="text-[11px] text-muted-foreground">OpenRouter — best quality</div></div></DropdownMenuItem>
								<DropdownMenuItem onSelect={() => onOpenWorkspace?.()}><Sparkles className="size-4" /><div><div className="font-semibold text-[var(--text-heading)]">Use on-device</div><div className="text-[11px] text-muted-foreground">Runs locally, free — via Workspace</div></div></DropdownMenuItem>
								<DropdownMenuSeparator />
								<DropdownMenuItem onSelect={() => onOpenWorkspace?.()}>Open Workspace…</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
					)}
				</div>
				{!modelReady && <p className="text-[11px] leading-snug text-muted-foreground">Connect a model to describe a finish in words — or build the layer stack by hand on the right.</p>}
			</div>

			{/* Center preview · right layer-stack panel (stacks below desktop). */}
			<div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:grid lg:overflow-hidden lg:[grid-template-columns:1fr_330px]">
				{/* CENTER — live specimen */}
				<div className="flex min-w-0 flex-col gap-3 bg-[color-mix(in_srgb,var(--bg)_55%,var(--bg-alt))] p-4 lg:overflow-y-auto lg:p-6">
					<div className="flex items-center justify-between gap-3">
						<span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">Live preview</span>
						<div className="flex shrink-0 items-center gap-2">
							{/* Export preview — adds .lattice-exporting to the specimen so the OPAQUE
							    export face shows (otherwise the designer never sees the flatter baked look). */}
							<button type="button" onClick={() => setExporting((v) => !v)} aria-pressed={exporting} aria-label="Export preview" className={cn('inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11.5px] font-semibold', exporting ? 'border-[var(--accent)] text-[var(--accent)]' : 'text-muted-foreground')}><FileDown className="size-3.5" />Export preview</button>
							<div className="inline-flex shrink-0 rounded-lg border border-border bg-background p-[3px]">
								<button type="button" onClick={() => setMode('light')} aria-pressed={mode === 'light'} aria-label="Light specimen" className={cn('inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11.5px] font-semibold', mode === 'light' ? 'bg-card text-[var(--accent)] shadow-sm' : 'text-muted-foreground')}><Sun className="size-3.5" />Light</button>
								<button type="button" onClick={() => setMode('dark')} aria-pressed={mode === 'dark'} aria-label="Dark specimen" className={cn('inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11.5px] font-semibold', mode === 'dark' ? 'bg-card text-[var(--accent)] shadow-sm' : 'text-muted-foreground')}><Moon className="size-3.5" />Dark</button>
							</div>
						</div>
					</div>
					<div className="relative">
						<DeckPreview
							options={options}
							sample={specimen(exporting)}
							mermaid={false}
							modeOverride={mode}
							extraCss={previewCss}
							debounceMs={140}
							className="relative aspect-video w-full overflow-hidden rounded-lg border border-border bg-background shadow-[0_6px_18px_rgba(10,22,40,.10)]"
							aria-label="Finish specimen"
						/>
						{canvasHandles.length > 0 && <CanvasHandles handles={canvasHandles} handleStyle={handleStyle} />}
					</div>
					{exporting && (
						<p className="text-[11.5px] leading-relaxed text-[var(--accent)]">Showing the export face — finishes render slightly flatter in baked PDF/PPTX exports.</p>
					)}
					<p className="text-[12px] leading-relaxed text-muted-foreground">
						A finish is a stack of five palette-blind layers. Start from a preset, tune the layers, then <strong className="text-[var(--text-heading)]">Save</strong> it to your library or <strong className="text-[var(--text-heading)]">Export</strong> the CSS.
					</p>
				</div>

				{/* RIGHT — the layer stack as Inspector groups */}
				<aside className="shrink-0 border-t border-border bg-card px-3 lg:overflow-y-auto lg:border-l lg:border-t-0">
					{/* Start from preset */}
					<LayerGroup label="Start from preset">
						<div className="grid grid-cols-3 gap-1.5">
							{PRESETS.map((p) => (
								<button key={p} type="button" onClick={() => startFromPreset(p)} className="rounded-md border border-border px-1.5 py-1.5 text-[11.5px] font-semibold text-muted-foreground hover:border-[var(--accent)] hover:text-[var(--text-heading)]">
									{PRESET_LABEL[p]}
								</button>
							))}
						</div>
					</LayerGroup>

					{/* Wash */}
					<LayerGroup label="Wash" hint="z1 · ambient color field">
						<LayerSelect aria-label="Wash type" value={recipe.wash.type} options={WASH_TYPES} labels={WASH_LABEL} onChange={(v) => patch({ wash: { ...recipe.wash, type: v as FinishRecipe['wash']['type'] } })} />
						{recipe.wash.type !== 'none' && (
							<Tuned label="Intensity" value={`${recipe.wash.intensity}%`}>
								<Slider aria-label="Wash intensity" min={3} max={20} value={recipe.wash.intensity} onValueChange={(v) => patch({ wash: { ...recipe.wash, intensity: v } })} />
							</Tuned>
						)}
						{/* Movable hotspot — only single-source washes (corner-glow, spotlight) have one. */}
						{washPlaceable && (
							<PlaceControl
								joystickLabel="Move wash hotspot"
								x={recipe.wash.x ?? 50}
								y={recipe.wash.y ?? 50}
								onNudge={nudgeWash}
								onSetX={(x) => setWashXY(x, recipe.wash.y ?? 50)}
								onSetY={(y) => setWashXY(recipe.wash.x ?? 50, y)}
								size={{ label: 'Spread', value: recipe.wash.spread ?? WASH_SPREAD.default, min: WASH_SPREAD.min, max: WASH_SPREAD.max, suffix: '%', onChange: (v) => patch({ wash: { ...recipe.wash, spread: v } }) }}
							/>
						)}
					</LayerGroup>

					{/* Texture */}
					<LayerGroup label="Texture" hint="z2 · pattern">
						<LayerSelect aria-label="Texture type" value={recipe.texture.type} options={TEXTURE_TYPES} labels={TEXTURE_LABEL} onChange={(v) => patch({ texture: { ...recipe.texture, type: v as FinishRecipe['texture']['type'] } })} />
						{recipe.texture.type !== 'none' && (
							<>
								<Tuned label="Intensity" value={`${recipe.texture.intensity}%`}>
									<Slider aria-label="Texture intensity" min={3} max={18} value={recipe.texture.intensity} onValueChange={(v) => patch({ texture: { ...recipe.texture, intensity: v } })} />
								</Tuned>
								<Tuned label="Scale" value={`${recipe.texture.scale}px`}>
									<Slider aria-label="Texture scale" min={12} max={64} value={recipe.texture.scale} onValueChange={(v) => patch({ texture: { ...recipe.texture, scale: v } })} />
								</Tuned>
							</>
						)}
					</LayerGroup>

					{/* Mark */}
					<LayerGroup label="Mark" hint="z3 · placed emblem">
						<LayerSelect aria-label="Mark type" value={recipe.mark.type} options={MARK_TYPES} labels={MARK_LABEL} onChange={(v) => patch({ mark: { ...recipe.mark, type: v as FinishRecipe['mark']['type'] } })} />
						{/* The author's own glyph — initials for a monogram, a number for a numeral.
						    Sanitized to ~3 chars in the generator (CSS content:). A glyph-mark is
						    ALWAYS author-personalized: empty renders NOTHING (no baked "L"/"03"), so
						    the placeholder is only a HINT to type your own — never the rendered text. */}
						{(recipe.mark.type === 'monogram' || recipe.mark.type === 'numeral') && (
							<Tuned label={recipe.mark.type === 'numeral' ? 'Number' : 'Initials'}>
								<input
									value={recipe.mark.glyph ?? ''}
									onChange={(e) => patch({ mark: { ...recipe.mark, glyph: e.target.value } })}
									maxLength={3}
									spellCheck={false}
									aria-label="Mark glyph"
									placeholder={recipe.mark.type === 'numeral' ? 'e.g. Q3' : 'your initials'}
									className="h-8 w-full rounded-md border border-border bg-background px-2 font-mono text-[12.5px] text-foreground outline-none focus:border-[var(--accent)] placeholder:text-muted-foreground"
								/>
							</Tuned>
						)}
						{recipe.mark.type !== 'none' && recipe.mark.type !== 'bar' && (
							<Tuned label="Placement">
								{/* Coarse quick-place; it ALSO seeds x/y so the joystick/drag start from there. */}
								<LayerSelect aria-label="Mark placement" value={recipe.mark.placement} options={PLACEMENTS} labels={PLACEMENT_LABEL} onChange={(v) => patch({ mark: { ...recipe.mark, placement: v as Placement, ...placementXY(v as Placement) } })} />
							</Tuned>
						)}
						{/* Free placement — joystick to fling it around, drag the handle on the canvas,
						    or type exact numbers. Only for the big TEXT glyph (the "huge" thing). */}
						{markPlaceable && (
							<PlaceControl
								joystickLabel="Move mark"
								x={recipe.mark.x ?? 50}
								y={recipe.mark.y ?? 50}
								onNudge={nudgeMark}
								onSetX={(x) => setMarkXY(x, recipe.mark.y ?? 50)}
								onSetY={(y) => setMarkXY(recipe.mark.x ?? 50, y)}
								size={{ label: 'Size', value: recipe.mark.scale ?? MARK_SCALE.default, min: MARK_SCALE.min, max: MARK_SCALE.max, suffix: '%', onChange: (v) => patch({ mark: { ...recipe.mark, scale: v } }) }}
								angle={{ label: 'Tilt', value: recipe.mark.angle ?? MARK_ANGLE.default, min: MARK_ANGLE.min, max: MARK_ANGLE.max, suffix: '°', onChange: (v) => patch({ mark: { ...recipe.mark, angle: v } }) }}
							/>
						)}
					</LayerGroup>

					{/* Edge */}
					<LayerGroup label="Edge" hint="z4 · frame">
						<LayerSelect aria-label="Edge type" value={recipe.edge.type} options={EDGE_TYPES} labels={EDGE_LABEL} onChange={(v) => patch({ edge: { ...recipe.edge, type: v as FinishRecipe['edge']['type'] } })} />
						{recipe.edge.type !== 'none' && recipe.edge.type !== 'margin-rule' && (
							<Tuned label="Intensity" value={`${recipe.edge.intensity}%`}>
								<Slider aria-label="Edge intensity" min={3} max={20} value={recipe.edge.intensity} onValueChange={(v) => patch({ edge: { ...recipe.edge, intensity: v } })} />
							</Tuned>
						)}
					</LayerGroup>

					{/* Backdrop — the 5th layer: restraint on the whole finish (baked; a deck tunes
					    it via `finish-override:`). Strength dims all four layers; clearance recedes
					    them behind the content box. */}
					<LayerGroup label="Backdrop" hint="restraint · dims & recedes the finish" last>
						<Tuned label="Strength" value={`${strength}%`}>
							<div className="flex items-center gap-2.5">
								<Slider aria-label="Backdrop strength" min={10} max={100} value={strength} onValueChange={setStrength} />
								{strength < 100 && (
									<button type="button" onClick={() => setStrength(100)} className="shrink-0 font-mono text-[10.5px] uppercase tracking-wide text-muted-foreground hover:text-[var(--accent)]">Reset</button>
								)}
							</div>
						</Tuned>
						<label className="flex items-center justify-between gap-3 py-0.5">
							<span className="flex flex-col">
								<span className="text-[12.5px] font-semibold text-[var(--text-heading)]">Clear behind content</span>
								<span className="text-[11px] text-muted-foreground">Recede the finish behind the text; it reads at the margins</span>
							</span>
							<input type="checkbox" aria-label="Clear behind content" checked={clearance} onChange={(e) => setClearance(e.target.checked)} className="size-4 shrink-0 accent-[var(--accent)]" />
						</label>
						{/* Spotlight — the inverse mask: reveal the finish in ONE window, hide the rest.
						    Shares the mask with clearance (mutually exclusive). Joystick / drag / numeric
						    place the window; the slider sizes it. */}
						<label className="flex items-center justify-between gap-3 py-0.5">
							<span className="flex flex-col">
								<span className="text-[12.5px] font-semibold text-[var(--text-heading)]">Spotlight one area</span>
								<span className="text-[11px] text-muted-foreground">Show the finish in a single window; hide it everywhere else</span>
							</span>
							<input type="checkbox" aria-label="Spotlight one area" checked={!!spot} onChange={(e) => setSpotlight(e.target.checked)} className="size-4 shrink-0 accent-[var(--accent)]" />
						</label>
						{spot && (
							<PlaceControl
								joystickLabel="Move spotlight"
								x={spot.x}
								y={spot.y}
								onNudge={nudgeSpot}
								onSetX={(x) => setSpotXY(x, spot.y)}
								onSetY={(y) => setSpotXY(spot.x, y)}
								size={{ label: 'Radius', value: spot.radius, min: SPOT_RADIUS.min, max: SPOT_RADIUS.max, suffix: '%', onChange: setSpotRadius }}
							/>
						)}
					</LayerGroup>
				</aside>
			</div>
		</div>
	);
}

// An Inspector group — mirrors StudioShell's InspGroup grammar (mono uppercase
// label, bottom rule between groups).
function LayerGroup({ label, hint, last, children }: { label: string; hint?: string; last?: boolean; children: React.ReactNode }) {
	return (
		<div className={cn('py-3', !last && 'border-b border-border')}>
			<div className="mb-2.5 flex items-baseline gap-2 font-mono text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
				<span>{label}</span>
				{hint && <span className="font-sans text-[10px] font-normal normal-case tracking-normal text-muted-foreground/70">{hint}</span>}
			</div>
			<div className="space-y-2.5">{children}</div>
		</div>
	);
}

// A labeled control row (mirrors FinishStudio's earlier Control + Fabricate's
// inspector rows).
function Tuned({ label, value, children }: { label: string; value?: string; children: React.ReactNode }) {
	return (
		<div>
			<div className="mb-1.5 flex items-center justify-between">
				<span className="text-[12px] text-foreground">{label}</span>
				{value && <span className="font-mono text-[11px] text-muted-foreground">{value}</span>}
			</div>
			{children}
		</div>
	);
}

// A type Select built on the shared shadcn Select primitive (REUSE — HARD RULE #15).
function LayerSelect({
	value,
	options,
	labels,
	onChange,
	'aria-label': ariaLabel,
}: {
	value: string;
	options: readonly string[];
	labels: Record<string, string>;
	onChange: (v: string) => void;
	'aria-label': string;
}) {
	return (
		<Select value={value} onValueChange={onChange}>
			<SelectTrigger aria-label={ariaLabel} className="h-8 text-[12.5px]">
				<SelectValue>{labels[value] ?? value}</SelectValue>
			</SelectTrigger>
			<SelectContent>
				{options.map((o) => (
					<SelectItem key={o} value={o} className="text-[12.5px]">{labels[o] ?? o}</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}

// A numeric scalar spec (size / tilt / spread) — value + range + writer.
type NumSpec = { label: string; value: number; min: number; max: number; suffix: string; onChange: (v: number) => void };

// A tiny labeled number field (the EXACT, accessible backstop for a transform axis).
function NumberField({ label, value, min, max, suffix, onChange }: { label: string; value: number; min: number; max: number; suffix: string; onChange: (v: number) => void }) {
	return (
		<label className="flex items-center gap-1 rounded-md border border-border bg-card px-1.5 py-1 focus-within:border-[var(--accent)]">
			<span className="shrink-0 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
			<input
				type="number"
				value={value}
				min={min}
				max={max}
				onChange={(e) => onChange(Number(e.target.value))}
				aria-label={`${label} — ${suffix === '°' ? 'degrees' : 'percent'}`}
				className="w-full min-w-0 bg-transparent text-right font-mono text-[12px] text-foreground outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
			/>
			<span className="shrink-0 font-mono text-[10px] text-muted-foreground">{suffix}</span>
		</label>
	);
}

// A slider + live value row for a scalar axis (size / tilt / spread).
function SliderRow({ label, value, min, max, suffix, onChange }: NumSpec) {
	return (
		<Tuned label={label} value={`${value}${suffix}`}>
			<Slider aria-label={label} min={min} max={max} value={value} onValueChange={onChange} />
		</Tuned>
	);
}

// The PLACE control — the hero: a 3D joystick to fling the element around (drag-on-
// canvas is the other half, in the preview overlay), exact X/Y numeric fields, and a
// size (+ optional tilt) slider. The joystick is the delight; the numbers are the
// accessible, deterministic backstop (#15 reuse: Slider + the shared primitives).
function PlaceControl({
	joystickLabel,
	x,
	y,
	onNudge,
	onSetX,
	onSetY,
	size,
	angle,
}: {
	joystickLabel: string;
	x: number;
	y: number;
	onNudge: (dx: number, dy: number) => void;
	onSetX: (x: number) => void;
	onSetY: (y: number) => void;
	size: NumSpec;
	angle?: NumSpec;
}) {
	return (
		<div className="space-y-2.5 rounded-lg border border-border bg-[color-mix(in_srgb,var(--bg)_60%,var(--bg-alt))] p-2.5">
			<div className="flex items-start gap-3">
				<Joystick label={joystickLabel} onNudge={onNudge} size={82} />
				<div className="min-w-0 flex-1 space-y-2">
					<div className="grid grid-cols-2 gap-1.5">
						<NumberField label="X" value={x} min={0} max={100} suffix="%" onChange={onSetX} />
						<NumberField label="Y" value={y} min={0} max={100} suffix="%" onChange={onSetY} />
					</div>
					<SliderRow {...size} />
					{angle && <SliderRow {...angle} />}
				</div>
			</div>
			<p className="text-[10.5px] leading-snug text-muted-foreground">Push the stick to fling it (faster the further you push), drag the dot on the canvas, or type exact values.</p>
		</div>
	);
}

// One draggable placement HANDLE rendered over the live preview — drag-on-canvas. The
// overlay is pointer-transparent except the handles, so the preview underneath stays
// interactive. Position is read from x/y (% of slide); dragging writes back absolute
// x/y from the pointer position within the preview box.
type CanvasHandleSpec = { key: string; label: string; x: number; y: number; tone: 'accent' | 'ink'; onMove: (x: number, y: number) => void };

// The tone color per handle — accent for spotlight/mark, an ink gray-blue for the wash
// hotspot — exposed as `--tone` so the knob gradient + reticle strokes recolor from one var.
const handleTone = (tone: 'accent' | 'ink') =>
	tone === 'accent' ? 'var(--accent)' : 'color-mix(in srgb, var(--ink, var(--accent)) 74%, var(--border))';

// A named LABEL chip beside the mark, so multiple handles are told apart at a glance. It
// flips to the opposite side near an edge so it never clips off the specimen.
function HandleLabel({ label, side }: { label: string; side: 'above' | 'below' }) {
	return (
		<span
			className={cn(
				'pointer-events-none absolute left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md border bg-card/85 px-1.5 py-[2px] text-[10px] font-semibold leading-none shadow-[0_2px_8px_rgba(8,18,38,.35)] backdrop-blur-sm',
				side === 'above' ? 'bottom-[calc(100%+5px)]' : 'top-[calc(100%+5px)]',
			)}
			style={{ borderColor: 'var(--tone)', color: 'var(--tone)' }}
		>
			{label}
		</span>
	);
}

// KNOB (familiar) — a raised slider-thumb marks the exact point; the name floats on a tag.
function KnobMark({ label, grabbing, flip }: { label: string; grabbing: boolean; flip: boolean }) {
	return (
		<span className={cn('relative grid place-items-center transition-transform duration-100 motion-reduce:transition-none', grabbing && 'scale-110')}>
			<HandleLabel label={label} side={flip ? 'below' : 'above'} />
			<span
				className="relative size-[22px] rounded-full border-[1.5px] group-focus-visible:ring-2 group-focus-visible:ring-[var(--accent)] group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-transparent"
				style={{
					background: 'radial-gradient(circle at 34% 30%, color-mix(in srgb, var(--tone) 26%, #fff) 0%, var(--tone) 60%, color-mix(in srgb, var(--tone) 72%, #000) 100%)',
					borderColor: 'color-mix(in srgb, var(--tone) 80%, #fff 10%)',
					boxShadow: grabbing ? '0 6px 16px rgba(4,10,22,.5), inset 0 1px 1px rgba(255,255,255,.45)' : '0 3px 10px rgba(4,10,22,.42), inset 0 1px 1px rgba(255,255,255,.45)',
				}}
			>
				<span className="absolute inset-0 m-auto size-[5px] rounded-full bg-white/55" style={{ boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--tone) 40%, transparent)' }} />
			</span>
		</span>
	);
}

// RETICLE (precise) — a see-through crosshair frames the exact point; the name captions it.
function ReticleMark({ label, grabbing, flip }: { label: string; grabbing: boolean; flip: boolean }) {
	const tick = 'absolute' as const;
	return (
		<span className={cn('relative grid place-items-center transition-transform duration-100 motion-reduce:transition-none', grabbing && 'scale-110')}>
			<HandleLabel label={label} side={flip ? 'above' : 'below'} />
			<span
				className="relative size-[26px] rounded-full border-[1.5px] bg-card/45 shadow-[0_2px_8px_rgba(4,10,22,.38)] backdrop-blur-[2px] group-focus-visible:ring-2 group-focus-visible:ring-[var(--accent)] group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-transparent"
				style={{ borderColor: 'var(--tone)' }}
			>
				<span className="absolute inset-0 m-auto size-[5px] rounded-full" style={{ background: 'var(--tone)' }} />
				<span className={cn(tick, 'left-1/2 -top-[4px] h-[5px] w-[1.5px] -translate-x-1/2')} style={{ background: 'var(--tone)' }} />
				<span className={cn(tick, 'left-1/2 -bottom-[4px] h-[5px] w-[1.5px] -translate-x-1/2')} style={{ background: 'var(--tone)' }} />
				<span className={cn(tick, 'top-1/2 -left-[4px] w-[5px] h-[1.5px] -translate-y-1/2')} style={{ background: 'var(--tone)' }} />
				<span className={cn(tick, 'top-1/2 -right-[4px] w-[5px] h-[1.5px] -translate-y-1/2')} style={{ background: 'var(--tone)' }} />
			</span>
		</span>
	);
}

function CanvasHandles({ handles, handleStyle }: { handles: CanvasHandleSpec[]; handleStyle: HandleStyle }) {
	const boxRef = React.useRef<HTMLDivElement>(null);
	const draggingRef = React.useRef<CanvasHandleSpec | null>(null);
	const [dragKey, setDragKey] = React.useState<string | null>(null);

	const fromPointer = (clientX: number, clientY: number, h: CanvasHandleSpec) => {
		const box = boxRef.current;
		if (!box) return;
		const r = box.getBoundingClientRect();
		if (r.width === 0 || r.height === 0) return;
		h.onMove(((clientX - r.left) / r.width) * 100, ((clientY - r.top) / r.height) * 100);
	};

	return (
		<div ref={boxRef} className="pointer-events-none absolute inset-0 z-10">
			{handles.map((h) => {
				const grabbing = dragKey === h.key;
				// Flip the label to the far side near an edge so it never clips off the specimen.
				const flip = handleStyle === 'knob' ? h.y < 20 : h.y > 84;
				return (
					<button
						type="button"
						key={h.key}
						aria-label={`${h.label} — drag to place`}
						onPointerDown={(e) => {
							e.preventDefault();
							draggingRef.current = h;
							setDragKey(h.key);
							(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
						}}
						onPointerMove={(e) => {
							if (draggingRef.current?.key === h.key) fromPointer(e.clientX, e.clientY, h);
						}}
						onPointerUp={(e) => {
							draggingRef.current = null;
							setDragKey(null);
							(e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
						}}
						onPointerCancel={() => {
							draggingRef.current = null;
							setDragKey(null);
						}}
						// ≥44px invisible touch target around the visible mark; the mark itself is centered on x/y.
						className="group pointer-events-auto absolute grid size-11 -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none appearance-none place-items-center border-0 bg-transparent p-0 active:cursor-grabbing focus-visible:outline-none"
						style={{ left: `${h.x}%`, top: `${h.y}%`, '--tone': handleTone(h.tone) } as React.CSSProperties}
					>
						{handleStyle === 'knob' ? <KnobMark label={h.label} grabbing={grabbing} flip={flip} /> : <ReticleMark label={h.label} grabbing={grabbing} flip={flip} />}
					</button>
				);
			})}
		</div>
	);
}
