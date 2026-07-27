import { ArrowUp, Check, ChevronDown, ChevronRight, Cloud, Download, Film, Info, LayoutGrid, Loader2, Moon, Palette, RotateCcw, Search, Sparkles, Sun, Text, TriangleAlert, X } from 'lucide-react';
import * as React from 'react';
import DeckPreview from '@/components/DeckPreview';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tip } from '@/components/ui/tooltip';
import type { SingleSlideOptions } from '@/lib/single-slide-render';
import { useBreakpoint } from '@/lib/use-breakpoint';
import { cn } from '@/lib/utils';
import { readComponentEffort, writeComponentEffort } from '@/playground/drawing-board-settings.js';
// The REAL layout gate — the deterministic core the engine uses for components
// (lib/layout/*, bundled). The Component tab's Name/Save/Export now live in this
// shared header, so Fabricate owns the gate run that the body renders.
import { BUCKETS, CSS_ONLY_SUBSTANCES, FORMS, FUNCTIONS, gateCss, NAME_RE, scaffoldFiles, skeletonInvokes, validateManifest } from '@/playground/layout-core.generated.js';
// The REAL theme engine — same maths as the Node tooling + the WCAG gate
// (lib/theme/*, bundled browser-safe). deriveTheme → ~80 tokens (contrast-
// repaired), auditBoth → live WCAG report, serializeTheme → a real themes/*.css.
import { auditBoth, contrastRatio, deriveTheme, STARTERS, serializeTheme, validateEssentials } from '@/playground/theme-core.generated.js';
import { COMPONENT_EFFORTS, type ComponentEffort, type ComponentSimilar, connectOpenRouter, generateComponent, generateTheme, refineComponent, useArchitectStatus } from './architect';
import { CodeField } from './CodeField';
import { type ComponentMeta, saveStudioComponent } from './component-library';
import { downloadText } from './download';
import { FinishStudio } from './FinishStudio';
import { type Finding, LayoutStudio, STARTER_CSS, STARTER_DESCRIPTION, STARTER_META, STARTER_NAME, STARTER_SKELETON } from './LayoutStudio';
import { MotionStudio } from './MotionStudio';
import { manifestJsonCompletion } from './manifest-complete';
import { useReferenceDoc } from './reference-doc-ui';
import { saveStudioTheme } from './theme-library';

// You pick ALL TEN essentials — the same set the engine derivation + the
// Workbench Theme Studio take (theme-core ESSENTIAL_KEYS). The derivation
// contrast-repairs everything else (~80 tokens) from these. Grouped for the
// eye: light surfaces, the ink trio, brand, then the semantic signals.
type EssKey = 'bg' | 'bgAlt' | 'textHeading' | 'textBody' | 'textMuted' | 'accent' | 'accentSoft' | 'pass' | 'warn' | 'fail';
const ESSENTIALS: { key: EssKey; label: string; group: string }[] = [
	{ key: 'bg', label: 'Background', group: 'Surfaces' },
	{ key: 'bgAlt', label: 'Surface', group: 'Surfaces' },
	{ key: 'textHeading', label: 'Heading ink', group: 'Ink' },
	{ key: 'textBody', label: 'Body ink', group: 'Ink' },
	{ key: 'textMuted', label: 'Muted ink', group: 'Ink' },
	{ key: 'accent', label: 'Accent', group: 'Brand' },
	{ key: 'accentSoft', label: 'Accent wash', group: 'Brand' },
	{ key: 'pass', label: 'Success', group: 'Signals' },
	{ key: 'warn', label: 'Warning', group: 'Signals' },
	{ key: 'fail', label: 'Error', group: 'Signals' },
];
const SPECIMEN = '<!-- _class: kpi -->\n\n`Theme · live specimen`\n\n## Your theme, derived & audited\n\n1. 100\n   - Tokens derived\n2. AA\n   - Contrast floor\n3. 10\n   - Colors you picked';

// Component refine chips — SEMANTIC nudges that re-prompt the model with the CURRENT
// draft (the Motion faculty's refine, ported). Each applies ONE directed change and
// gate-repairs the result. Deliberately not "fix the hex/margin" (that's the automatic
// gate-repair's job) — these are taste/craft moves the author reaches for by hand.
const COMP_REFINE_CHIPS: { label: string; nudge: string }[] = [
	{ label: 'Simpler', nudge: 'Simplify it — fewer elements, one clear idea, more restraint.' },
	{ label: 'Bolder', nudge: 'Make it bolder — stronger hierarchy, a more monumental lead, size to the role.' },
	{ label: 'Tighter copy', nudge: 'Tighten the copy — a short label + a one-line clause per item, no wrapping sentences.' },
	{ label: 'More whitespace', nudge: 'Give it more breathing room — more padding and gap, let the content fill the stage calmly.' },
];

const hash = (s: string) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };
// A slug → a human display title for the export header / README ("harbor-slate"
// → "Harbor Slate"). Display only — the editable field is always the slug, so
// there is no buried "magic" label the author has to reconcile (#57).
const titleize = (slug: string) => slug.split('-').filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');

// The human-facing contract: the derived roles a theme author actually curates,
// each a light-dark() pair. Editing a side PINS an override on top of the engine
// derivation (the audit re-runs against the override, so a contrast-breaking edit
// surfaces immediately). This is where light vs dark is curated. (#48 / #49.)
const CONTRACT: { token: string; label: string }[] = [
	{ token: 'bg', label: 'Background' },
	{ token: 'bg-alt', label: 'Surface' },
	{ token: 'border', label: 'Border' },
	{ token: 'text-heading', label: 'Heading' },
	{ token: 'text-body', label: 'Body' },
	{ token: 'text-secondary', label: 'Secondary' },
	{ token: 'text-muted', label: 'Muted' },
	{ token: 'accent', label: 'Accent' },
	{ token: 'accent-soft', label: 'Accent wash' },
	{ token: 'pass', label: 'Success' },
	{ token: 'warn', label: 'Warning' },
	{ token: 'fail', label: 'Error' },
];
type Override = { light?: string; dark?: string };
const LD_RE = /^light-dark\(\s*([^,]+?)\s*,\s*(.+?)\s*\)$/i;
// Split a derived token into its light & dark sides (a plain value is both).
function sides(v: unknown): { light: string; dark: string } {
	const m = String(v ?? '').match(LD_RE);
	if (m) return { light: m[1].trim(), dark: m[2].trim() };
	const s = String(v ?? '');
	return { light: s, dark: s };
}
// Layer the per-side overrides back onto a freshly-derived map, PRESERVING each
// token's shape: a light-dark() pair stays a pair (per-side override); a single
// value stays single (some viz tokens are mode-independent — e.g. --diagram-stroke —
// and must not silently become light-dark()). The categorical fill/mark tokens ARE
// light-dark() pairs (the three-layer flipping contract), so they take the pair branch.
function applyOverrides(map: Record<string, unknown>, overrides: Record<string, Override>): Record<string, unknown> {
	const out = { ...map };
	for (const [token, ov] of Object.entries(overrides)) {
		if (ov.light == null && ov.dark == null) continue;
		const raw = String(out[token] ?? '');
		if (LD_RE.test(raw)) {
			const cur = sides(raw);
			out[token] = `light-dark(${ov.light ?? cur.light}, ${ov.dark ?? cur.dark})`;
		} else {
			// Single-value token — only the light override is meaningful.
			out[token] = ov.light ?? raw;
		}
	}
	return out;
}

// Is a token mode-independent (single value, edited with one well)? The viz band
// mixes light-dark() pairs (chart series, diagram line, chart states) with single
// values (categorical fills/marks, diagram stroke/critical).
function isSingle(v: unknown): boolean {
	return !LD_RE.test(String(v ?? ''));
}

// THE DATA-VIZ BAND — the categorical colours charts + Mermaid cycle through,
// hue-rotated off the accent and AA-repaired. Surfaced as click-to-select strips
// in the token tree; edited in the inspector. (#G3b)
const SERIES_TOKENS = Array.from({ length: 8 }, (_, i) => `chart-cat${i + 1}`);
const CAT_TOKENS = Array.from({ length: 12 }, (_, i) => i + 1); // → cat-N-fill / cat-N-mark
const DIAGRAM_TOKENS: { token: string; label: string }[] = [
	{ token: 'diagram-stroke', label: 'Diagram fill' },
	{ token: 'diagram-line', label: 'Diagram line' },
	{ token: 'diagram-critical', label: 'Critical edge' },
	{ token: 'chart-state-info', label: 'Chart · info' },
	{ token: 'chart-state-mute', label: 'Chart · muted' },
];
// Friendly label for any band token (the inspector's caption).
function bandLabel(token: string): string {
	const s = token.match(/^chart-cat(\d+)$/);
	if (s) return `Series ${s[1]}`;
	const cf = token.match(/^cat-(\d+)-fill$/);
	if (cf) return `Categorical ${cf[1]} · fill`;
	const cm = token.match(/^cat-(\d+)-mark$/);
	if (cm) return `Categorical ${cm[1]} · mark`;
	return DIAGRAM_TOKENS.find((d) => d.token === token)?.label ?? token;
}

// Live specimens for the canvas — a slide (contract roles), a pie chart (the
// chart series band) and a Mermaid flow (categorical + diagram band).
const CHART_SPECIMEN = '<!-- _class: piechart -->\n\n`Charts · live band`\n\n## Revenue by segment\n\n- Segment A `20%`\n- Segment B `16%`\n- Segment C `14%`\n- Segment D `12%`\n- Segment E `11%`\n- Segment F `10%`\n- Segment G `9%`\n- Segment H `8%`';
const DIAGRAM_SPECIMEN = '<!-- _class: diagram -->\n\n`Diagrams · live band`\n\n## Flow\n\n```mermaid\nflowchart LR\n  A[Plan] --> B[Build] --> C[Review] --> D[Ship]\n  D -.risk.-> B\n```';
// The native color input needs a #rrggbb seed; the swatch background shows the
// real value (which is always 6-digit hex for a CONTRACT token).
const normalizeHex = (v: string) => (/^#[0-9a-fA-F]{6}$/.test(v) ? v : '#000000');

// Pro Inspector selection — ONE selected token drives the right-hand inspector.
// An ESSENTIAL edits the picked input (core); a DERIVED token edits an override.
type Selected = { scope: 'essential'; id: EssKey } | { scope: 'derived'; id: string };
// Each essential feeds one derived contract token — the inspector reports that
// token's live contrast, so selecting an essential still shows its WCAG.
const ESS_TOKEN: Record<EssKey, string> = { bg: 'bg', bgAlt: 'bg-alt', textHeading: 'text-heading', textBody: 'text-body', textMuted: 'text-muted', accent: 'accent', accentSoft: 'accent-soft', pass: 'pass', warn: 'warn', fail: 'fail' };
const isHex = (v: string) => /^#[0-9a-fA-F]{6}$/.test(v);
// Only FOREGROUND roles (ink / brand / signals) have an on-background AA target;
// surfaces (bg, bg-alt, border, accent wash) and the decorative muted ink are
// WCAG-exempt — so we never stamp them pass/FAIL against the canvas (it would be
// a meaningless, alarming "fail" for a colour that is itself a background).
const INK_TOKENS = new Set(['text-heading', 'text-body', 'text-secondary', 'accent', 'pass', 'warn', 'fail']);
const readsOnBg = (tokenId: string) => INK_TOKENS.has(tokenId);
// Contrast of a token's resolved side vs the page background, per mode — null when
// either resolves to a non-hex (a var()/color-mix reference we don't expand here).
function ratioVsBg(map: Record<string, unknown>, tokenId: string, mode: 'light' | 'dark'): number | null {
	const tv = sides(map[tokenId])[mode];
	const bv = sides(map.bg)[mode];
	return isHex(tv) && isHex(bv) ? contrastRatio(tv, bv) : null;
}
const contractLabelOf = (id: string) => CONTRACT.find((c) => c.token === id)?.label;
// Friendly label for any token id (contract role → band token → raw).
const tokenLabel = (id: string) => contractLabelOf(id) ?? bandLabel(id);
const tierOf = (ratio: number | null, ok: boolean) => ((ratio ?? 0) >= 7 ? 'AAA' : ok ? 'AA' : 'FAIL');

export function Fabricate({ options, catalog = [], onClose, notify, onSaved, onOpenWorkspace }: { options: SingleSlideOptions; catalog?: { name: string; bucket?: string; description?: string; tags?: string[] }[]; onClose: () => void; notify: (msg: string) => void; onSaved?: () => void; onOpenWorkspace?: () => void }) {
	const [tab, setTab] = React.useState<'theme' | 'layout' | 'finish' | 'motion'>('theme');
	// All ten essentials in state, seeded from the first curated starter.
	const [core, setCore] = React.useState<Record<EssKey, string>>(() => ({ ...(STARTERS[0].essentials as Record<EssKey, string>) }));
	// First-class naming, IDENTICAL on both tabs (#57): the name IS a lowercase
	// slug the author owns (the AI seeds it, you can edit it) — no buried label +
	// slugify magic. `*Desc` is the one-line caption shown in the disclosure under
	// the name; it is captured in the saved model and stamped into the export
	// (theme CSS header / README, component manifest `description`).
	const [themeName, setThemeName] = React.useState('');
	const [themeDesc, setThemeDesc] = React.useState('');
	// The Component tab is a CONTROLLED body now — its name / description / css /
	// skeleton live here so the shared header drives the same Save + Export UX.
	const [compName, setCompName] = React.useState(STARTER_NAME);
	const [compDesc, setCompDesc] = React.useState(STARTER_DESCRIPTION);
	const [compCss, setCompCss] = React.useState(STARTER_CSS);
	const [compSkeleton, setCompSkeleton] = React.useState(STARTER_SKELETON);
	// The component's MANIFEST — its contract (bucket/axes/tags/capacity). The AI
	// generates it, the gate validates it, and it's persisted on Save + stamped into
	// the export. Editable in the Manifest panel so the author can correct the
	// classification (#610 manifest-visibility).
	const [compMeta, setCompMeta] = React.useState<ComponentMeta>(() => ({ ...STARTER_META }));
	const [metaOpen, setMetaOpen] = React.useState(false);
	// A parse error from the raw-JSON manifest view — surfaced as a gate finding so a
	// broken edit can't silently save.
	const [compJsonError, setCompJsonError] = React.useState('');
	// Component-tab AI: "Describe a component" — the mirror of the Theme tab's
	// "Describe a look". The model proposes a manifest + scoped CSS + skeleton
	// grounded in the knowledge file; the SAME live gate below disposes. `compSimilar`
	// holds the dedup near-neighbors (reuse nudge).
	const [compPrompt, setCompPrompt] = React.useState('');
	const [compGen, setCompGen] = React.useState<'idle' | 'working'>('idle');
	// A live status line during generation — carries "Refining — fixing N issues…" (gate
	// repair) or "Improving the design — round X/N…" (the effort dial), so the extra work
	// is visible, not a mystery wait.
	const [compStatus, setCompStatus] = React.useState('');
	// The effort dial (low/medium/high/maximum) — how many design self-refine rounds run.
	// Persisted per browser; the lever is effort, not spend.
	const [compEffort, setCompEffort] = React.useState<ComponentEffort>(() => readComponentEffort() as ComponentEffort);
	// The freeform manual-refine nudge ("make the cards bigger") — the Motion-style refine.
	const [compRefine, setCompRefine] = React.useState('');
	const [compSimilar, setCompSimilar] = React.useState<ComponentSimilar[]>([]);
	// The pre-overwrite snapshot for one-click Undo — generate/refine REPLACES the whole
	// component (name/desc/css/skeleton/meta), so a hand-tuned draft can be lost to one
	// prompt. We stash the outgoing draft the instant before it's overwritten; the Undo
	// control restores it. Cleared on Undo (single level — the last overwrite, not a stack).
	const [compUndo, setCompUndo] = React.useState<null | { name: string; description: string; css: string; skeleton: string; meta: ComponentMeta }>(null);

	// Reference-doc grounding (#640) — one per surface: a brand guide grounds the
	// theme, an existing component/deck grounds the component. Fed to generate*,
	// cleared on a successful run.
	const themeDoc = useReferenceDoc(notify);
	const compDoc = useReferenceDoc(notify);
	// The description disclosure (chevron under the name) — collapsed by default on
	// both tabs; opening reveals the one-line caption editor.
	const [descOpen, setDescOpen] = React.useState(false);
	const [specimenMode, setSpecimenMode] = React.useState<'light' | 'dark'>('light');
	const [saving, setSaving] = React.useState(false);
	// Per-side overrides pinned on top of the derivation (#48/#49).
	const [overrides, setOverrides] = React.useState<Record<string, Override>>({});
	// Pro Inspector: the one selected token (left tree → right inspector), a tree
	// search filter, and which tree groups are collapsed.
	const [selected, setSelected] = React.useState<Selected>({ scope: 'essential', id: 'accent' });
	const [query, setQuery] = React.useState('');
	const [collapsed, setCollapsed] = React.useState<Set<string>>(() => new Set());
	const toggleGroup = (g: string) => setCollapsed((s) => { const n = new Set(s); if (n.has(g)) n.delete(g); else n.add(g); return n; });
	// AI "Describe a look": the model proposes essentials + a ramp strategy; the
	// engine derives the full AA-clean palette. The strategy steers the
	// categorical/chart hue layout (theme-core RAMP_STRATEGIES).
	const [rampStrategy, setRampStrategy] = React.useState('spectrum');
	const [prompt, setPrompt] = React.useState('');
	const [gen, setGen] = React.useState<'idle' | 'working'>('idle');
	// Is a model connected (cloud or on-device)? When not, the AI bar grays out and
	// offers a Connect affordance instead of a dead send button (floor = none).
	const modelReady = useArchitectStatus().ready;
	// Desktop shows the inspector as the right column; below desktop it renders
	// inline under the selected row (so editing isn't a far-below scroll). Gated in
	// JS (not CSS) so only ONE inspector is ever in the DOM.
	const isDesktop = useBreakpoint() === 'desktop';
	const accent = core.accent;
	const setHex = (key: EssKey, hex: string) => setCore((c) => ({ ...c, [key]: hex }));
	const setOverride = (token: string, side: 'light' | 'dark', hex: string) => setOverrides((o) => ({ ...o, [token]: { ...o[token], [side]: hex } }));
	const clearOverride = (token: string) => setOverrides((o) => { const n = { ...o }; delete n[token]; return n; });

	// Derive the full token map from the ten picked essentials, then layer any
	// per-side contract overrides — REAL, every render. The live specimen uses a
	// STABLE content-hash name (so it doesn't churn while you type a name); export
	// + save re-serialize under the final slug.
	const derived = React.useMemo(() => {
		const essentials = { ...core };
		try {
			validateEssentials(essentials);
			const map = applyOverrides(deriveTheme(essentials, { rampStrategy }), overrides);
			const audit = auditBoth(map, { level: 'full' });
			const name = `fab-${hash(JSON.stringify({ essentials, overrides, rampStrategy }))}`;
			const css = serializeTheme(map, { name, label: themeName ? titleize(themeName) : 'Untitled theme', description: themeDesc });
			return { map, audit, name, css, error: null as string | null };
		} catch (e) {
			return { map: {} as Record<string, unknown>, audit: { light: { results: [] }, dark: { results: [] }, ok: false }, name: 'indaco', css: '', error: String((e as Error)?.message || e) };
		}
	}, [core, overrides, themeName, themeDesc, rampStrategy]);

	// The Component tab's live gate — the SAME bundled gate the body used to run
	// internally, lifted here so the shared header's Save button and the body's
	// findings panel agree. Name → CSS (no-hex + scope) → skeleton-invokes → the
	// MANIFEST contract (axes/tags/capacity), so an under-specified component can't
	// silently save.
	const compNameOk = NAME_RE.test(compName);
	const compManifest = React.useMemo(() => ({ name: compName, ...compMeta, description: compDesc, skeleton: compSkeleton }), [compName, compMeta, compDesc, compSkeleton]);
	const compFindings = React.useMemo<Finding[]>(() => {
		if (!compNameOk) return [{ level: 'error', rule: 'name', message: 'Component name must be a lowercase slug — a–z, 0–9, hyphen, starting with a letter.' }];
		const out: Finding[] = [];
		for (const f of gateCss(compCss, compName).findings as Finding[]) out.push(f);
		if (!skeletonInvokes(compSkeleton, compName)) out.push({ level: 'error', rule: 'skeleton', message: `Skeleton must invoke <!-- _class: ${compName} --> so the preview applies your styles.` });
		if (compJsonError) out.push({ level: 'error', rule: 'manifest:json', message: compJsonError });
		const man = validateManifest(compManifest) as { ok: boolean; errors: { field: string; message: string }[] };
		for (const e of man.errors) out.push({ level: 'error', rule: `manifest:${e.field}`, message: e.message });
		return out;
	}, [compName, compCss, compSkeleton, compNameOk, compManifest, compJsonError]);
	const compOk = compFindings.every((f) => f.level !== 'error');

	// Curated WCAG rows: one per role, worst ratio across modes.
	const auditRows = React.useMemo(() => {
		const byRole = new Map<string, { role: string; ratio: number | null; status: string }>();
		for (const mode of ['light', 'dark'] as const) {
			for (const r of derived.audit[mode]?.results ?? []) {
				const prev = byRole.get(r.role);
				if (!prev || (r.ratio ?? 99) < (prev.ratio ?? 99)) byRole.set(r.role, { role: r.role, ratio: r.ratio, status: r.status });
			}
		}
		return [...byRole.values()].filter((r) => r.status === 'pass' || r.status === 'fail').slice(0, 6);
	}, [derived.audit]);

	// "Describe a look" → the model proposes essentials + a ramp strategy, the
	// engine derives the full AA-clean palette, and the studio adopts it (clearing
	// manual overrides so the AI's set shows cleanly). Honest degradation: a clear
	// note for no-model / budget-blocked / no-usable-reply — never a faked palette.
	async function runDescribe(text: string) {
		const p = text.trim();
		if (!p || gen === 'working') return;
		setGen('working');
		try {
			const out = await generateTheme(core, p, themeDoc.docs);
			if (out.status === 'ok') {
				setCore(out.essentials as Record<EssKey, string>);
				setRampStrategy(out.rampStrategy);
				setOverrides({});
				setPrompt('');
				themeDoc.clear();
				// The AI suggests a name + caption — seed them so export/README have a
				// real title, but only when the author hasn't typed their own (a refine
				// like "warmer" keeps the palette's identity). Always editable.
				if (out.name && !themeName.trim()) setThemeName(out.name);
				if (out.description && !themeDesc.trim()) setThemeDesc(out.description);
				notify(out.audit.ok ? 'Generated a full palette — every pair passes AA. Tweaking is optional.' : 'Generated a palette — a couple of pairs need review (flagged in the audit).');
			} else if (out.status === 'offline') {
				notify('No model connected — open Workspace to connect OpenRouter or load an on-device model.');
			} else if (out.status === 'blocked') {
				notify(out.note);
			} else {
				notify(out.note || 'No change proposed.');
			}
		} catch {
			notify('Theme generation failed — please try again.');
		} finally {
			setGen('idle');
		}
	}

	// "Describe a component" → the model proposes a manifest + scoped CSS + skeleton
	// grounded in the knowledge file; dedup surfaces near neighbors; the draft loads
	// into the editor where the SAME live gate re-checks it. Honest degradation: a
	// clear note for no-model / budget-blocked / out-of-scope (declined) — never a fake.
	// One handler for BOTH the fresh "describe" and the author-directed "refine" (the
	// Motion faculty's shape): `refine` swaps the model call to refineComponent, which
	// nudges the CURRENT editor draft instead of generating anew. On success both load
	// the result into the editors where the live gate re-checks it. Honest degradation:
	// a clear note for no-model / budget-blocked / out-of-scope (declined) — never a fake.
	async function runDescribeComponent(text: string, refine = false) {
		const p = text.trim();
		if (!p || compGen === 'working') return;
		setCompGen('working');
		setCompStatus('');
		try {
			// Live status while the passes run: "Refining — fixing N issues…" (gate-repair)
			// or "Improving the design — round X/N…" (the effort dial), before the draft lands.
			const onStatus = (s: { phase: string; issues?: number; round?: number; rounds?: number }) =>
				setCompStatus(
					s.phase === 'refining'
						? `Refining — fixing ${s.issues} issue${s.issues === 1 ? '' : 's'}…`
						: s.phase === 'improving'
							? `Improving the design — round ${s.round}/${s.rounds}…`
							: '',
				);
			const out = refine
				? await refineComponent(p, { name: compName, description: compDesc, function: compMeta.function ?? '', form: compMeta.form ?? '', substance: compMeta.substance ?? '', bucket: compMeta.bucket ?? '', tags: compMeta.tags ?? [], adapt: compMeta.adapt ?? { mode: 'native' }, capacity: compMeta.capacity ?? null, density: compMeta.density ?? null, css: compCss, skeleton: compSkeleton }, { onStatus })
				: await generateComponent(p, catalog, compDoc.docs, { effort: compEffort, onStatus });
			if (out.status === 'ok') {
				// Snapshot the OUTGOING draft before this result overwrites it, so one click
				// restores it (a prompt shouldn't be able to silently eat a hand-tuned draft).
				setCompUndo({ name: compName, description: compDesc, css: compCss, skeleton: compSkeleton, meta: compMeta });
				if (!refine) compDoc.clear();
				setCompName(out.draft.name);
				setCompDesc(out.draft.description);
				setCompCss(out.draft.css);
				setCompSkeleton(out.draft.skeleton);
				// Capture the FULL manifest the model proposed — not just name/css/skeleton.
				setCompMeta({ function: out.draft.function, form: out.draft.form, substance: out.draft.substance, bucket: out.draft.bucket, tags: out.draft.tags, adapt: out.draft.adapt, capacity: out.draft.capacity ?? undefined, density: out.draft.density ?? undefined });
				if (!refine) setCompSimilar(out.similar);
				if (refine) setCompRefine('');
				else setCompPrompt('');
				const issues = out.findings.filter((f) => f.level === 'error').length;
				const verb = refine ? 'Refined' : 'Generated';
				// Lead with the work the effort dial / auto-fix did, so the refinement is visible.
				const notes: string[] = [];
				if (out.improved > 0) notes.push(`refined the design over ${out.improved} round${out.improved === 1 ? '' : 's'}`);
				if (out.refined > 0) notes.push(`auto-fixed ${out.refined} gate pass${out.refined === 1 ? '' : 'es'}`);
				const prefix = notes.length ? `${notes.join(', ')} — ` : '';
				notify(issues ? `${verb} “.${out.draft.name}” — ${prefix}${issues} gate ${issues === 1 ? 'issue' : 'issues'} still to review below.` : `${verb} “.${out.draft.name}” — ${prefix}gate-clean. Review the preview, then Save.`);
			} else if (out.status === 'declined') {
				setCompSimilar(out.similar);
				notify(`That needs ${out.route === 'dsl' ? 'a first-party build' : `the ${out.route} path`} — ${out.reason}${out.suggestion ? ` (try: ${out.suggestion})` : ''}.`);
			} else if (out.status === 'offline') {
				notify('No model connected — open Workspace to connect OpenRouter or load an on-device model.');
			} else if (out.status === 'blocked') {
				notify(out.note);
			} else {
				notify(out.note || 'No component proposed.');
			}
		} catch {
			notify('Component generation failed — please try again.');
		} finally {
			setCompGen('idle');
			setCompStatus('');
		}
	}

	// Restore the draft that the last generate/refine overwrote. Single level — the last
	// overwrite only; clears the snapshot so the button hides until the next overwrite.
	function undoComponent() {
		if (!compUndo) return;
		setCompName(compUndo.name);
		setCompDesc(compUndo.description);
		setCompCss(compUndo.css);
		setCompSkeleton(compUndo.skeleton);
		setCompMeta(compUndo.meta);
		setCompUndo(null);
		notify('Restored your previous draft.');
	}

	// ── Shared, tab-agnostic Name / Description / Export / Save ────────────────
	const themeNameOk = NAME_RE.test(themeName);
	// The slug a theme export/save lands under — the named slug when valid, else
	// the stable content-hash (so an unnamed Export still produces a real file).
	const themeSlug = themeNameOk ? themeName : derived.name;

	// Whichever tab is active drives the one Name field + Description disclosure.
	const name = tab === 'theme' ? themeName : compName;
	const setName = tab === 'theme' ? setThemeName : setCompName;
	const nameOk = tab === 'theme' ? themeNameOk : compNameOk;
	const desc = tab === 'theme' ? themeDesc : compDesc;
	const setDesc = tab === 'theme' ? setThemeDesc : setCompDesc;
	const namePlaceholder = tab === 'theme' ? 'name-your-theme' : 'name-your-component';
	const descPlaceholder = tab === 'theme'
		? 'Describe this theme — one line, stamped into the export header & README.'
		: 'Describe this component — one line, saved to its manifest.';

	// Export: a theme → one real `themes/<slug>.css`; a component → the three
	// engine files a graduation PR drops into `lib/components/…` (same shape the
	// engine uses), so both tabs "hand off real, drop-in files".
	const canExport = tab === 'theme' ? !!derived.css : compNameOk;
	function exportArtifact() {
		if (tab === 'theme') {
			const css = serializeTheme(derived.map, { name: themeSlug, label: titleize(themeSlug), description: themeDesc });
			downloadText(`${themeSlug}.css`, css || '/* theme */', 'text/css');
			notify(`Exported ${themeSlug}.css — a real theme token set.`);
			return;
		}
		const manifest = { name: compName, ...compMeta, ...(compDesc.trim() ? { description: compDesc.trim() } : {}) };
		const files = scaffoldFiles({ name: compName, css: compCss, skeleton: compSkeleton, manifest }) as Record<string, string>;
		for (const [fname, text] of Object.entries(files)) downloadText(fname, text, fname.endsWith('.json') ? 'application/json' : fname.endsWith('.css') ? 'text/css' : 'text/markdown');
		notify(`Exported ${compName} — manifest, styles & skeleton (drop into lib/components/).`);
	}

	const canSave = !saving && (tab === 'theme' ? themeNameOk && !!derived.css : compOk && compNameOk);
	async function saveToLibrary() {
		if (!canSave) return;
		setSaving(true);
		try {
			if (tab === 'theme') {
				// Re-serialize under the FINAL slug so the CSS's `@theme <name>` matches
				// the stored record name (the live specimen uses a stable content-hash
				// name to avoid churn while you type).
				const css = serializeTheme(derived.map, { name: themeName, label: titleize(themeName), description: themeDesc });
				const t = await saveStudioTheme({ name: themeName, label: titleize(themeName), essentials: core, css });
				notify(`Saved “${t.label}” to your theme library — pick it from Look.`);
			} else {
				const c = await saveStudioComponent({ name: compName, css: compCss, skeleton: compSkeleton, meta: { ...compMeta, description: compDesc } });
				notify(`Saved “.${c.name}” to your component library.`);
			}
			onSaved?.();
		} catch {
			notify('Could not save — your browser may block storage (private mode?).');
		} finally {
			setSaving(false);
		}
	}

	const q = query.trim().toLowerCase();
	const startTheme = (e: Record<string, string>) => { setCore({ ...(e as Record<EssKey, string>) }); setOverrides({}); setRampStrategy('spectrum'); };
	// On mobile the right inspector column is far below the tree, so we ALSO render
	// the inspector inline directly under the selected row (lg:hidden) — the editor
	// appears where you tapped. The desktop column is hidden on mobile (lg:block).
	const inlineInspector = !isDesktop && (
		<div className="border-y border-border bg-card">
			<Inspector selected={selected} core={core} map={derived.map} overrides={overrides} mode={specimenMode} onHex={setHex} onOverride={setOverride} onReset={clearOverride} />
		</div>
	);
	const isContractToken = (id: string) => CONTRACT.some((c) => c.token === id);
	// The Component tab's Manifest panel — the right column at desktop, a collapsible
	// above the editors below it. One element, placed by breakpoint.
	const compManifestPanel = (
		<ComponentManifestPanel name={compName} description={compDesc} meta={compMeta} onName={setCompName} onDescription={setCompDesc} onMeta={setCompMeta} jsonError={compJsonError} onJsonError={setCompJsonError} />
	);

	// The Finish faculty is self-contained (its own header/controls/preview), so
	// it renders via an early return with a MINIMAL top bar — back + the faculty
	// toggle — instead of threading through the shared Theme/Component header.
	const facTab = (t: typeof tab, label: string, Icon: typeof Palette) => (
		<button type="button" onClick={() => setTab(t)} aria-pressed={tab === t} aria-label={label} className={cn('inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[13px] font-semibold sm:px-3', tab === t ? 'bg-card text-[var(--accent)] shadow-sm' : 'text-muted-foreground')}><Icon className="size-3.5" /><span className="hidden sm:inline">{label}</span></button>
	);
	const facultyToggle = (
		<div className="ml-1 inline-flex shrink-0 rounded-[10px] border border-border bg-background p-[3px] sm:ml-2">
			{facTab('theme', 'Theme', Palette)}
			{facTab('layout', 'Component', LayoutGrid)}
			{facTab('finish', 'Finish', Sparkles)}
			{facTab('motion', 'Motion', Film)}
		</div>
	);
	if (tab === 'finish') {
		return (
			<div className="flex min-h-0 flex-1 flex-col">
				<div className="flex h-[44px] shrink-0 items-center gap-2 border-b border-border bg-card px-3 sm:gap-3 sm:px-4">
					<button type="button" onClick={onClose} className="shrink-0 rounded-md p-1 text-muted-foreground hover:text-foreground" aria-label="Back to Compose"><X className="size-4" /></button>
					{facultyToggle}
					<div className="flex-1" />
				</div>
				<FinishStudio options={options} notify={notify} onSaved={onSaved} onOpenWorkspace={onOpenWorkspace} />
			</div>
		);
	}

	if (tab === 'motion') {
		return (
			<div className="flex min-h-0 flex-1 flex-col">
				<div className="flex h-[44px] shrink-0 items-center gap-2 border-b border-border bg-card px-3 sm:gap-3 sm:px-4">
					<button type="button" onClick={onClose} className="shrink-0 rounded-md p-1 text-muted-foreground hover:text-foreground" aria-label="Back to Compose"><X className="size-4" /></button>
					{facultyToggle}
					<div className="flex-1" />
				</div>
				<MotionStudio notify={notify} onSaved={onSaved} onOpenWorkspace={onOpenWorkspace} />
			</div>
		);
	}

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			{/* ONE header, IDENTICAL on both tabs (#57): back · accent dot · first-class
			    Name (a slug the AI seeds, you own) · Description disclosure · the
			    Theme|Component toggle · the SAME Export + Save UX. */}
			<div className="flex h-[50px] shrink-0 items-center gap-2 border-b border-border bg-card px-3 sm:gap-3 sm:px-4">
				<button type="button" onClick={onClose} className="shrink-0 rounded-md p-1 text-muted-foreground hover:text-foreground" aria-label="Back to Compose"><X className="size-4" /></button>
				<span className="size-2 shrink-0 rounded-full" style={{ background: accent }} />
				<div className={cn('flex min-w-0 max-w-[200px] flex-shrink items-center rounded-md border bg-transparent px-1.5 py-0.5 focus-within:border-[var(--accent)]', name && !nameOk ? 'border-[color-mix(in_srgb,var(--fail)_55%,var(--border))]' : 'border-transparent hover:border-border')}>
					{tab === 'layout' && <span className="shrink-0 font-mono text-[13px] text-muted-foreground">.</span>}
					<input value={name} onChange={(e) => setName(e.target.value)} aria-label={tab === 'theme' ? 'Theme name' : 'Component name'} placeholder={namePlaceholder} spellCheck={false} className={cn('min-w-0 flex-1 bg-transparent text-sm font-semibold text-[var(--text-heading)] outline-none placeholder:font-normal placeholder:text-muted-foreground', tab === 'layout' && 'font-mono text-[13px]')} />
				</div>
				<Tip label="Description — used in the export header / README"><button type="button" onClick={() => setDescOpen((v) => !v)} aria-expanded={descOpen} aria-label="Description" className={cn('inline-flex shrink-0 items-center gap-0.5 rounded-md px-1 py-1 hover:text-foreground', desc.trim() ? 'text-[var(--accent)]' : 'text-muted-foreground')}>
					<Text className="size-3.5" /><ChevronDown className={cn('size-3 transition-transform', descOpen && 'rotate-180')} />
				</button></Tip>
				<div className="ml-1 inline-flex shrink-0 rounded-[10px] border border-border bg-background p-[3px] sm:ml-2">
					<button type="button" onClick={() => setTab('theme')} aria-pressed={tab === 'theme'} aria-label="Theme" className={cn('inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[13px] font-semibold sm:px-3', tab === 'theme' ? 'bg-card text-[var(--accent)] shadow-sm' : 'text-muted-foreground')}><Palette className="size-3.5" /><span className="hidden sm:inline">Theme</span></button>
					<button type="button" onClick={() => setTab('layout')} aria-pressed={tab === 'layout'} aria-label="Component" className={cn('inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[13px] font-semibold sm:px-3', tab === 'layout' ? 'bg-card text-[var(--accent)] shadow-sm' : 'text-muted-foreground')}><LayoutGrid className="size-3.5" /><span className="hidden sm:inline">Component</span></button>
					<button type="button" onClick={() => setTab('finish')} aria-pressed={false} aria-label="Finish" className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[13px] font-semibold text-muted-foreground sm:px-3"><Sparkles className="size-3.5" /><span className="hidden sm:inline">Finish</span></button>
					<button type="button" onClick={() => setTab('motion')} aria-pressed={false} aria-label="Motion" className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[13px] font-semibold text-muted-foreground sm:px-3"><Film className="size-3.5" /><span className="hidden sm:inline">Motion</span></button>
				</div>
				<div className="flex-1" />
				<Button variant="outline" size="sm" disabled={!canExport} className="shrink-0 gap-1.5 px-2 sm:px-3" onClick={exportArtifact}><Download className="size-4" /><span className="hidden sm:inline">Export</span></Button>
				<Button size="sm" disabled={!canSave} className="shrink-0 gap-1.5 px-2 sm:px-3" onClick={saveToLibrary}><Check className="size-4" /><span className="hidden sm:inline">{saving ? 'Saving…' : 'Save'}</span></Button>
			</div>
			{/* Description disclosure — collapsed by default on both tabs. AI-seeded for
			    themes; captured in the saved model + stamped into the export. */}
			{descOpen && (
				<div className="flex shrink-0 items-center gap-2 border-b border-border bg-card px-4 py-2">
					<Text className="size-3.5 shrink-0 text-muted-foreground" />
					<input value={desc} onChange={(e) => setDesc(e.target.value)} aria-label={tab === 'theme' ? 'Theme description' : 'Component description'} placeholder={descPlaceholder} spellCheck className="min-w-0 flex-1 bg-transparent text-[13px] text-[var(--text-heading)] outline-none placeholder:text-muted-foreground" />
				</div>
			)}

			{tab === 'theme' ? (
			<div className="flex min-h-0 flex-1 flex-col">
				{/* AI front door — "Describe a look". The model proposes the 10 essentials
				    + a ramp strategy; the engine derives the full, AA-verified palette
				    shown live below. You never have to tweak a color — the wells are optional. */}
				<div className="flex shrink-0 flex-col gap-2 border-b border-border bg-card px-4 py-2.5">
					<div className={cn('flex items-center gap-2.5 rounded-[10px] border bg-background px-3 py-2', modelReady ? 'border-[color-mix(in_srgb,var(--accent)_40%,var(--border))]' : 'border-dashed border-border')}>
						<Sparkles className={cn('size-4 shrink-0', modelReady ? 'text-[var(--accent)]' : 'text-muted-foreground')} />
						<input
							value={prompt}
							onChange={(e) => setPrompt(e.target.value)}
							onKeyDown={(e) => { if (e.key === 'Enter') runDescribe(prompt); }}
							disabled={gen === 'working' || !modelReady}
							placeholder="Describe a look — e.g. “warm editorial, deep navy accent, confident”"
							aria-label="Describe a look"
							className="min-w-0 flex-1 bg-transparent text-[13px] text-[var(--text-heading)] outline-none placeholder:text-muted-foreground disabled:opacity-60"
						/>
						{themeDoc.attachButton}
						{modelReady ? (
							<button type="button" onClick={() => runDescribe(prompt)} disabled={gen === 'working' || !prompt.trim()} aria-label="Generate theme" className="grid size-7 shrink-0 place-items-center rounded-md bg-[var(--accent)] text-[var(--on-accent,#fff)] disabled:opacity-40">
								{gen === 'working' ? <Loader2 className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}
							</button>
						) : (
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<button type="button" aria-label="Connect a model" className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-[var(--accent)] px-2.5 py-1 text-[12px] font-semibold text-[var(--on-accent,#fff)]"><Cloud className="size-3.5" />Connect<ChevronDown className="size-3" /></button>
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
					{themeDoc.chip}
					{modelReady ? (
						<div className="flex flex-wrap items-center gap-1.5">
							<span className="font-mono text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">Refine</span>
							{['Warmer', 'More corporate', 'Higher contrast', 'Calmer accent'].map((c) => (
								<button key={c} type="button" onClick={() => runDescribe(c)} disabled={gen === 'working'} className="rounded-full border border-border px-2.5 py-0.5 text-[11px] text-muted-foreground hover:border-[var(--accent)] hover:text-[var(--text-heading)] disabled:opacity-40">{c}</button>
							))}
							<span className="ml-auto font-mono text-[10px] text-muted-foreground/70" title="Categorical hue layout the AI chose">ramp: {rampStrategy}</span>
						</div>
					) : (
						<p className="text-[11px] leading-snug text-muted-foreground">Connect a model to generate a full, AA-verified palette — or edit any token by hand below.</p>
					)}
				</div>

				{/* The Pro Inspector — left token tree · center live canvas · right per-token
				    inspector. Stacks below lg; a real 3-column workbench at desktop. */}
				<div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:grid lg:overflow-hidden lg:[grid-template-columns:296px_1fr_330px]">

					{/* LEFT — searchable token tree */}
					<aside className="shrink-0 border-b border-border bg-card lg:overflow-y-auto lg:border-r lg:border-b-0">
						<div className="sticky top-0 z-[1] border-b border-border bg-card px-3 py-2.5">
							<div className="flex items-center gap-2 rounded-lg border border-border bg-background px-2.5 py-1.5">
								<Search className="size-3.5 shrink-0 text-muted-foreground" />
								<input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search tokens…" aria-label="Search tokens" className="min-w-0 flex-1 bg-transparent text-[12.5px] text-[var(--text-heading)] outline-none placeholder:text-muted-foreground" />
							</div>
						</div>
						<div className="px-2 py-2">
							{/* Essentials */}
							<TreeGroup name="Essentials" count={10} collapsed={collapsed.has('Essentials')} onToggle={() => toggleGroup('Essentials')}>
								{ESSENTIALS.filter((c) => !q || c.label.toLowerCase().includes(q) || c.key.toLowerCase().includes(q)).map((c) => {
									const t = ESS_TOKEN[c.key];
									const ratio = readsOnBg(t) ? ratioVsBg(derived.map, t, specimenMode) : null;
									const tag = ratio == null ? undefined : tierOf(ratio, ratio >= 4.5);
									const sel = selected.scope === 'essential' && selected.id === c.key;
									return (
										<React.Fragment key={c.key}>
											<TreeRow label={c.label} swatch={core[c.key]} tag={tag} selected={sel} onClick={() => setSelected({ scope: 'essential', id: c.key })} />
											{sel && inlineInspector}
										</React.Fragment>
									);
								})}
							</TreeGroup>
							{/* Contract */}
							<TreeGroup name="Contract · 12 roles" count={12} collapsed={collapsed.has('Contract')} onToggle={() => toggleGroup('Contract')}>
								{CONTRACT.filter((c) => !q || c.label.toLowerCase().includes(q) || c.token.toLowerCase().includes(q)).map((c) => {
									const s = sides(derived.map[c.token]);
									const ratio = readsOnBg(c.token) ? ratioVsBg(derived.map, c.token, specimenMode) : null;
									const tag = ratio == null ? undefined : tierOf(ratio, ratio >= 4.5);
									const sel = selected.scope === 'derived' && selected.id === c.token;
									return (
										<React.Fragment key={c.token}>
											<TreeRow label={c.label} dual={s} tag={tag} overridden={overrides[c.token] != null} selected={sel} onClick={() => setSelected({ scope: 'derived', id: c.token })} />
											{sel && inlineInspector}
										</React.Fragment>
									);
								})}
							</TreeGroup>
							{/* Data-viz band — click-to-select strips */}
							<TreeGroup name="Data-viz band" count={37} collapsed={collapsed.has('Band')} onToggle={() => toggleGroup('Band')}>
								<BandStrips map={derived.map} overrides={overrides} mode={specimenMode} selId={selected.scope === 'derived' ? selected.id : ''} onPick={(t) => setSelected({ scope: 'derived', id: t })} />
								{selected.scope === 'derived' && !isContractToken(selected.id) && inlineInspector}
							</TreeGroup>
							{/* Starters */}
							<TreeGroup name="Starter palettes" count={STARTERS.length} collapsed={collapsed.has('Starters')} onToggle={() => toggleGroup('Starters')}>
								<div className="flex flex-col gap-1 px-1 pb-1">
									{STARTERS.map((s: { name: string; label: string; description: string; essentials: Record<string, string> }) => {
										const e = s.essentials as Record<string, string>;
										const active = core.bg === e.bg && core.accent === e.accent;
										return (
											<Tip key={s.name} label={s.description}><button type="button" onClick={() => startTheme(e)} aria-label={`Start from ${s.label}`} className={cn('flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-left', active ? 'bg-[var(--accent-soft)]' : 'hover:bg-[color-mix(in_srgb,var(--accent)_8%,transparent)]')}>
												<span className="flex overflow-hidden rounded border border-border">
													<span className="size-3.5" style={{ background: e.accent }} />
													<span className="size-3.5" style={{ background: e.textHeading }} />
													<span className="size-3.5" style={{ background: e.bg }} />
												</span>
												<span className="text-[12px] font-semibold text-[var(--text-heading)]">{s.label}</span>
											</button></Tip>
										);
									})}
								</div>
							</TreeGroup>
						</div>
					</aside>

					{/* CENTER — live canvas */}
					<div className="flex min-w-0 flex-col gap-4 bg-[color-mix(in_srgb,var(--bg)_55%,var(--bg-alt))] p-4 lg:overflow-y-auto lg:p-6">
						<div className="flex items-center justify-between gap-3">
							<span className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">Live canvas — slide · chart · diagram</span>
							{/* Audition the SAME derived theme in light or dark — the derivation
							    emits light-dark() pairs, so flipping modeOverride resolves the side. */}
							<div className="inline-flex shrink-0 rounded-lg border border-border bg-background p-[3px]">
								<button type="button" onClick={() => setSpecimenMode('light')} aria-pressed={specimenMode === 'light'} aria-label="Light specimen" className={cn('inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11.5px] font-semibold', specimenMode === 'light' ? 'bg-card text-[var(--accent)] shadow-sm' : 'text-muted-foreground')}><Sun className="size-3.5" />Light</button>
								<button type="button" onClick={() => setSpecimenMode('dark')} aria-pressed={specimenMode === 'dark'} aria-label="Dark specimen" className={cn('inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11.5px] font-semibold', specimenMode === 'dark' ? 'bg-card text-[var(--accent)] shadow-sm' : 'text-muted-foreground')}><Moon className="size-3.5" />Dark</button>
							</div>
						</div>
						{/* The three live previews — every edit re-renders all three. */}
						<div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
							<div className="flex min-w-0 flex-col gap-1.5 xl:col-span-2">
								<span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground/80">Slide</span>
								<DeckPreview options={options} sample={SPECIMEN} mermaid={false} paletteOverride={derived.name} extraTheme={derived.css ? { name: derived.name, css: derived.css } : undefined} modeOverride={specimenMode} coalesce className="relative aspect-video w-full overflow-hidden rounded-lg border border-border bg-background shadow-[0_6px_18px_rgba(10,22,40,.10)]" aria-label="Theme specimen" />
							</div>
							{[
								{ label: 'Chart', sample: CHART_SPECIMEN, mermaid: false, aria: 'Chart specimen' },
								{ label: 'Diagram', sample: DIAGRAM_SPECIMEN, mermaid: true, aria: 'Diagram specimen' },
							].map((p) => (
								<div key={p.label} className="flex min-w-0 flex-col gap-1.5">
									<span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground/80">{p.label}</span>
									<DeckPreview options={options} sample={p.sample} mermaid={p.mermaid} paletteOverride={derived.name} extraTheme={derived.css ? { name: derived.name, css: derived.css } : undefined} modeOverride={specimenMode} coalesce className="relative aspect-video w-full overflow-hidden rounded-lg border border-border bg-background shadow-[0_6px_18px_rgba(10,22,40,.10)]" aria-label={p.aria} />
								</div>
							))}
						</div>
					</div>

					{/* RIGHT — per-token inspector + the WCAG audit */}
					<aside className="shrink-0 border-t border-border bg-card lg:overflow-y-auto lg:border-l lg:border-t-0">
						{/* Desktop-only column inspector; below desktop it renders inline under the
						    selected row (above), so the column hides to avoid a far-below scroll. */}
						{isDesktop && <Inspector selected={selected} core={core} map={derived.map} overrides={overrides} mode={specimenMode} onHex={setHex} onOverride={setOverride} onReset={clearOverride} />}
						<AuditPanel rows={auditRows} ok={derived.audit.ok} />
					</aside>
				</div>
			</div>
			) : (
			<div className="flex min-h-0 flex-1 flex-col">
				{/* AI front door — "Describe a component". The mirror of the Theme tab's
				    "Describe a look": the model proposes a manifest + scoped CSS + skeleton
				    grounded in the knowledge file; the live gate below disposes. Dedup
				    surfaces near-neighbor components as a reuse nudge. */}
				<div className="flex shrink-0 flex-col gap-2 border-b border-border bg-card px-4 py-2.5">
					<div className={cn('flex items-center gap-2.5 rounded-[10px] border bg-background px-3 py-2', modelReady ? 'border-[color-mix(in_srgb,var(--accent)_40%,var(--border))]' : 'border-dashed border-border')}>
						<Sparkles className={cn('size-4 shrink-0', modelReady ? 'text-[var(--accent)]' : 'text-muted-foreground')} />
						<input
							value={compPrompt}
							onChange={(e) => setCompPrompt(e.target.value)}
							onKeyDown={(e) => { if (e.key === 'Enter') runDescribeComponent(compPrompt); }}
							disabled={compGen === 'working' || !modelReady}
							placeholder="Describe a component — e.g. “a 2-up grid of capability cards, each a title and a one-line note”"
							aria-label="Describe a component"
							className="min-w-0 flex-1 bg-transparent text-[13px] text-[var(--text-heading)] outline-none placeholder:text-muted-foreground disabled:opacity-60"
						/>
						{compDoc.attachButton}
						{modelReady ? (
							<button type="button" onClick={() => runDescribeComponent(compPrompt)} disabled={compGen === 'working' || !compPrompt.trim()} aria-label="Generate component" className="grid size-7 shrink-0 place-items-center rounded-md bg-[var(--accent)] text-[var(--on-accent,#fff)] disabled:opacity-40">
								{compGen === 'working' ? <Loader2 className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}
							</button>
						) : (
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<button type="button" aria-label="Connect a model" className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-[var(--accent)] px-2.5 py-1 text-[12px] font-semibold text-[var(--on-accent,#fff)]"><Cloud className="size-3.5" />Connect<ChevronDown className="size-3" /></button>
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
					{/* The EFFORT dial — design self-refine rounds after generation (low = one-shot ·
						    maximum = +3). The lever is effort, not spend; persisted per browser. */}
						<div className="flex items-center gap-2">
							<span className="font-mono text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70" title="How hard the model works on the design — more rounds = better design, more time">Effort</span>
							<div className="inline-flex rounded-lg border border-border bg-background p-[2px]">
								{COMPONENT_EFFORTS.map((lvl) => (
									<button key={lvl} type="button" onClick={() => { setCompEffort(lvl); writeComponentEffort(lvl); }} aria-pressed={compEffort === lvl} aria-label={`Effort ${lvl}`} disabled={compGen === 'working'} className={cn('rounded-md px-2 py-0.5 text-[11px] font-semibold capitalize disabled:opacity-50', compEffort === lvl ? 'bg-[var(--accent-soft)] text-[var(--accent)]' : 'text-muted-foreground hover:text-foreground')}>
										{lvl}
									</button>
								))}
							</div>
						</div>
						{/* Undo — restore the draft the last generate/refine overwrote. Only shown once
						    there's a snapshot, so a prompt can't silently eat a hand-tuned draft. */}
						{compUndo && (
							<div className="flex items-center">
								<button type="button" onClick={undoComponent} disabled={compGen === 'working'} aria-label="Undo — restore the previous draft" className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border px-2 py-0.5 text-[11px] font-semibold text-muted-foreground hover:border-[var(--accent)] hover:text-[var(--text-heading)] disabled:opacity-40"><RotateCcw className="size-3.5" />Undo last change</button>
							</div>
						)}
						{/* Refine — quick chips + a freeform nudge, both re-prompt with the CURRENT
						    draft (apply the change, then gate-repair). Shown once a model is connected. */}
						{modelReady && (
							<div className="flex flex-wrap items-center gap-1.5">
								<span className="font-mono text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70" title="Nudge the current draft — applies one change, then gate-repairs it">Refine</span>
								{COMP_REFINE_CHIPS.map((c) => (
									<button key={c.label} type="button" disabled={compGen === 'working'} onClick={() => runDescribeComponent(c.nudge, true)} className="rounded-full border border-border px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground hover:border-[var(--accent)] hover:text-[var(--text-heading)] disabled:opacity-40">{c.label}</button>
								))}
								<div className="flex min-w-0 flex-1 items-center gap-1.5">
									<input value={compRefine} onChange={(e) => setCompRefine(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && compRefine.trim()) runDescribeComponent(compRefine, true); }} disabled={compGen === 'working'} placeholder="or nudge it — e.g. “make the cards bigger”" aria-label="Refine the component" className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 text-[11.5px] text-[var(--text-heading)] outline-none placeholder:text-muted-foreground focus:border-[var(--accent)] disabled:opacity-50" />
									<button type="button" disabled={compGen === 'working' || !compRefine.trim()} onClick={() => runDescribeComponent(compRefine, true)} aria-label="Apply refinement" className="grid size-6 shrink-0 place-items-center rounded-md border border-border text-muted-foreground hover:text-[var(--accent)] disabled:opacity-40"><ArrowUp className="size-3.5" /></button>
								</div>
							</div>
						)}
						{compDoc.chip}
					{compStatus ? (
							<div className="flex items-center gap-1.5 text-[11px] font-medium text-[var(--accent)]" role="status" aria-live="polite">
								<Loader2 className="size-3 animate-spin" />{compStatus}
							</div>
						) : compSimilar.length > 0 ? (
						<div className="flex flex-wrap items-center gap-1.5">
							<span className="font-mono text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70" title="Existing components close to your request — reuse one where it fits">Similar</span>
							{compSimilar.map((s) => (
								<span key={s.name} title={s.description || s.name} className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-0.5 text-[11px] text-muted-foreground">
									<span className="font-semibold text-[var(--text-heading)]">.{s.name}</span>
									<span className="text-muted-foreground/70">{s.bucket}</span>
								</span>
							))}
							<span className="text-[10px] text-muted-foreground/60">reuse where it fits</span>
						</div>
					) : (
						!modelReady && <p className="text-[11px] leading-snug text-muted-foreground">Connect a model to generate a native-feeling component from a description — or author one by hand below.</p>
					)}
				</div>
				{/* Below desktop the Manifest is a collapsible above the editors (no
				    3-column squeeze); at desktop it's the right column inside LayoutStudio. */}
				{!isDesktop && (
					<div className="shrink-0 border-b border-border bg-card">
						<button type="button" onClick={() => setMetaOpen((v) => !v)} aria-expanded={metaOpen} className="flex w-full items-center gap-2 px-4 py-2 text-left hover:bg-[color-mix(in_srgb,var(--accent)_5%,transparent)]">
							<ChevronRight className={cn('size-3.5 text-muted-foreground transition-transform', metaOpen && 'rotate-90')} />
							<span className="font-mono text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Manifest</span>
							<span className="truncate text-[11px] text-muted-foreground/70">{compMeta.bucket} · {compMeta.form} · {(compMeta.tags || []).join(', ')}</span>
						</button>
						{metaOpen && compManifestPanel}
					</div>
				)}
				<LayoutStudio options={options} name={compName} css={compCss} skeleton={compSkeleton} onCss={setCompCss} onSkeleton={setCompSkeleton} findings={compFindings} nameOk={compNameOk} manifest={isDesktop ? compManifestPanel : undefined} />
			</div>
			)}
		</div>
	);
}

// One-line definitions for each manifest field (from design/design-system.md), so
// the author isn't guessing what an axis means — shown as a hover hint on the label.
const MANIFEST_HINTS: Record<string, string> = {
	description: 'One sentence — what it shows and when to use it. Stamped into the export + the dedup signal.',
	bucket: 'Which of the 12 component families it belongs to — drives the gallery folder and dedup ranking.',
	function: 'The slide’s communicative job: anchor, statement, inventory, comparison, progression, evidence, imagery.',
	form: 'The visual arrangement of the content — grid, ledger, panel, stack, matrix, and so on.',
	substance: 'What fills it: prose or structured lists. A transform-free component stays prose/structure.',
	tags: '3–5 lowercase keywords for search + dedup. Reuse existing tags where they fit.',
	adapt: 'How it reflows on a portrait/tall frame — native (universal cqi + @container) or reflow (ships per-family layouts).',
	capacity: 'Legible card/row counts before it crowds — sweet (comfortable), soft (stretched), hard (the cap).',
	density: 'Words per element before it reads heavy — soft (editorial target), hard (wall-of-text ceiling). Axis: item (list/grid) or row (table).',
};
// A label with a hover (i) hint — the lightweight "what does this field mean?" affordance.
function HintLabel({ field, children }: { field: string; children: React.ReactNode }) {
	return (
		<span className="flex items-center gap-1 font-mono text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
			{children}
			{MANIFEST_HINTS[field] && (
				<Tip label={MANIFEST_HINTS[field]}><span className="inline-flex cursor-help"><Info className="size-3 text-muted-foreground/60" /></span></Tip>
			)}
		</span>
	);
}

// The Manifest panel — the component's contract, with two synced views: a FIELDS
// form and the raw manifest.json in CodeMirror (JSON, schema-aware completion). The
// AI fills it; the author edits either view and they stay in sync; the gate
// validates live (a bad axis / tag count / invalid JSON surfaces as a finding).
function ComponentManifestPanel({ name, description, meta, onName, onDescription, onMeta, jsonError, onJsonError }: {
	name: string;
	description: string;
	meta: ComponentMeta;
	onName: (v: string) => void;
	onDescription: (v: string) => void;
	onMeta: (m: ComponentMeta) => void;
	jsonError: string;
	onJsonError: (e: string) => void;
}) {
	const [view, setView] = React.useState<'fields' | 'json'>('fields');
	const [jsonDraft, setJsonDraft] = React.useState('');
	// The manifest.json as the engine writes it (name first), serialized for the editor.
	const toJson = React.useCallback(() => JSON.stringify({ name, function: meta.function, form: meta.form, substance: meta.substance, bucket: meta.bucket, tags: meta.tags ?? [], description, adapt: meta.adapt ?? { mode: 'native' }, ...(meta.capacity ? { capacity: meta.capacity } : {}), ...(meta.density ? { density: meta.density } : {}) }, null, 2), [name, description, meta]);
	// Entering the JSON view re-seeds the draft from the live model (the source of truth).
	// biome-ignore lint/correctness/useExhaustiveDependencies: re-seed only on view switch, not on every keystroke.
	React.useEffect(() => { if (view === 'json') { setJsonDraft(toJson()); onJsonError(''); } }, [view]);

	function applyJson(text: string) {
		setJsonDraft(text);
		let o: Record<string, unknown>;
		try {
			o = JSON.parse(text);
		} catch (e) {
			onJsonError(`Manifest JSON is invalid — ${(e as Error).message}`);
			return;
		}
		if (!o || typeof o !== 'object' || Array.isArray(o)) {
			onJsonError('Manifest JSON must be an object.');
			return;
		}
		onJsonError('');
		if (typeof o.name === 'string') onName(o.name);
		if (typeof o.description === 'string') onDescription(o.description);
		onMeta({
			function: typeof o.function === 'string' ? o.function : undefined,
			form: typeof o.form === 'string' ? o.form : undefined,
			substance: typeof o.substance === 'string' ? o.substance : undefined,
			bucket: typeof o.bucket === 'string' ? o.bucket : undefined,
			tags: Array.isArray(o.tags) ? o.tags.map(String) : [],
			adapt: o.adapt && typeof o.adapt === 'object' ? { mode: String((o.adapt as { mode?: unknown }).mode || 'native') } : { mode: 'native' },
			capacity: o.capacity && typeof o.capacity === 'object' ? (o.capacity as ComponentMeta['capacity']) : undefined,
			density: o.density && typeof o.density === 'object' ? (o.density as ComponentMeta['density']) : undefined,
		});
	}

	const sel = (field: string, label: string, value: string | undefined, opts: string[], onPick: (v: string) => void) => (
		<div className="flex flex-col gap-1">
			<HintLabel field={field}>{label}</HintLabel>
			<Select value={value ?? ''} onValueChange={onPick}>
				<SelectTrigger aria-label={label} className="h-auto gap-2 border-border bg-background px-2 py-1 text-[12.5px] text-[var(--text-heading)]">
					<SelectValue placeholder="—" />
				</SelectTrigger>
				<SelectContent>
					{opts.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
				</SelectContent>
			</Select>
		</div>
	);
	const cap = meta.capacity || {};
	const den: { axis?: string; soft?: number; hard?: number } = meta.density || {};
	const num = (group: string, label: string, v: number | undefined, onN: (n: number) => void) => (
		<label className="flex flex-col gap-1">
			<span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
			<input type="number" min={1} value={v ?? ''} onChange={(e) => onN(Math.max(1, Number(e.target.value) || 1))} aria-label={`${group} ${label}`} className="w-full rounded-md border border-border bg-background px-2 py-1 text-[12.5px] text-[var(--text-heading)] outline-none focus:border-[var(--accent)]" />
		</label>
	);

	return (
		<div className="flex min-h-0 flex-col">
			<div className="flex items-center justify-between border-b border-border px-4 py-2.5">
				<span className="font-mono text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Manifest</span>
				<div className="inline-flex rounded-lg border border-border p-[2px]">
					{([['fields', 'Fields'], ['json', 'JSON']] as const).map(([v, label]) => (
						<button key={v} type="button" onClick={() => setView(v)} aria-pressed={view === v} className={cn('rounded-md px-3 py-1 text-[11.5px] font-semibold', view === v ? 'bg-[var(--accent-soft)] text-[var(--accent)]' : 'text-muted-foreground')}>{label}</button>
					))}
				</div>
			</div>
			{view === 'fields' ? (
				<div className="grid grid-cols-2 gap-2.5 overflow-y-auto px-4 py-3.5">
					<label className="col-span-2 flex flex-col gap-1">
						<HintLabel field="description">Description</HintLabel>
						<input value={description} onChange={(e) => onDescription(e.target.value)} aria-label="Component description" className="rounded-md border border-border bg-background px-2 py-1 text-[12.5px] text-[var(--text-heading)] outline-none focus:border-[var(--accent)]" />
					</label>
					{sel('bucket', 'Bucket', meta.bucket, BUCKETS as string[], (v) => onMeta({ ...meta, bucket: v }))}
					{sel('function', 'Function', meta.function, FUNCTIONS as string[], (v) => onMeta({ ...meta, function: v }))}
					{sel('form', 'Form', meta.form, FORMS as string[], (v) => onMeta({ ...meta, form: v }))}
					{sel('substance', 'Substance', meta.substance, CSS_ONLY_SUBSTANCES as string[], (v) => onMeta({ ...meta, substance: v }))}
					<label className="col-span-2 flex flex-col gap-1">
						<HintLabel field="tags">Tags <span className="normal-case text-muted-foreground/70">— 3–5, comma-separated</span></HintLabel>
						<input value={(meta.tags || []).join(', ')} onChange={(e) => onMeta({ ...meta, tags: e.target.value.split(',').map((t) => t.trim().toLowerCase().replace(/[^a-z0-9-]/g, '')).filter(Boolean) })} aria-label="Tags" spellCheck={false} className="rounded-md border border-border bg-background px-2 py-1 font-mono text-[12px] text-[var(--text-heading)] outline-none focus:border-[var(--accent)]" />
					</label>
					{sel('adapt', 'Adapt', meta.adapt?.mode, ['native', 'reflow'], (v) => onMeta({ ...meta, adapt: { mode: v } }))}
					<div className="col-span-2 flex flex-col gap-1">
						<HintLabel field="capacity">Capacity <span className="normal-case text-muted-foreground/70">— legible card/row counts</span></HintLabel>
						<div className="grid grid-cols-3 gap-2">
							{num('Capacity', 'sweet', cap.sweet, (n) => onMeta({ ...meta, capacity: { ...cap, sweet: n } }))}
							{num('Capacity', 'soft', cap.soft, (n) => onMeta({ ...meta, capacity: { ...cap, soft: n } }))}
							{num('Capacity', 'hard', cap.hard, (n) => onMeta({ ...meta, capacity: { ...cap, hard: n } }))}
						</div>
					</div>
					<div className="col-span-2 flex flex-col gap-1">
						<HintLabel field="density">Density <span className="normal-case text-muted-foreground/70">— words per element</span></HintLabel>
						<div className="grid grid-cols-3 gap-2">
							{sel('density-axis', 'axis', den.axis, ['item', 'row'], (v) => onMeta({ ...meta, density: { ...den, axis: v } }))}
							{num('Density', 'soft', den.soft, (n) => onMeta({ ...meta, density: { ...den, axis: den.axis || 'item', soft: n } }))}
							{num('Density', 'hard', den.hard, (n) => onMeta({ ...meta, density: { ...den, axis: den.axis || 'item', hard: n } }))}
						</div>
					</div>
				</div>
			) : (
				<div className="flex min-h-0 flex-1 flex-col gap-2 px-4 py-3.5">
					<span className="font-mono text-[10px] text-muted-foreground">{name || '…'}.manifest.json</span>
					<CodeField language="json" ariaLabel="Manifest JSON" value={jsonDraft} onChange={applyJson} completion={manifestJsonCompletion} className={cn('min-h-[220px] w-full flex-1 rounded-lg border bg-[var(--bg)]', jsonError ? 'border-[color-mix(in_srgb,var(--fail)_55%,var(--border))]' : 'border-border focus-within:border-[var(--accent)]')} />
					<p className="text-[11px] leading-snug text-muted-foreground">{jsonError ? jsonError : 'Edit the raw manifest — the Fields view stays in sync, completion suggests valid values. The gate validates it live.'}</p>
				</div>
			)}
		</div>
	);
}

// One editable color well — clicking opens the native picker; an override is
// ringed in accent, and the side that matches the live specimen mode is haloed.
function Well({ label, value, overridden, live, onChange }: { label: string; value: string; overridden: boolean; live: boolean; onChange: (hex: string) => void }) {
	return (
		<label className={cn('relative block size-[26px] cursor-pointer justify-self-center rounded-md border', overridden ? 'border-[var(--accent)] ring-1 ring-[var(--accent)]' : live ? 'border-[color-mix(in_srgb,var(--accent)_45%,var(--border))]' : 'border-border')} style={{ background: value }} title={`${label}: ${value}`}>
			<input type="color" value={normalizeHex(value)} onChange={(e) => onChange(e.target.value)} aria-label={label} className="absolute inset-0 size-full cursor-pointer opacity-0" />
		</label>
	);
}

// A split light/dark swatch for a contract row in the tree.
function DualSwatch({ light, dark }: { light: string; dark: string }) {
	return (
		<span className="flex size-[18px] shrink-0 overflow-hidden rounded border border-border">
			<span className="h-full w-1/2" style={{ background: light }} />
			<span className="h-full w-1/2" style={{ background: dark }} />
		</span>
	);
}

// A collapsible group in the token tree.
function TreeGroup({ name, count, collapsed, onToggle, children }: { name: string; count: number; collapsed: boolean; onToggle: () => void; children: React.ReactNode }) {
	return (
		<div className="mb-1">
			<button type="button" onClick={onToggle} aria-expanded={!collapsed} className="flex w-full items-center gap-2 rounded-md px-2 py-2 hover:bg-[color-mix(in_srgb,var(--accent)_7%,transparent)]">
				<ChevronRight className={cn('size-3 text-muted-foreground transition-transform', !collapsed && 'rotate-90')} />
				<span className="flex-1 text-left font-mono text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{name}</span>
				<span className="rounded-full bg-[color-mix(in_srgb,var(--text-heading)_8%,transparent)] px-1.5 py-px font-mono text-[10px] text-muted-foreground">{count}</span>
			</button>
			{!collapsed && <div className="pb-1">{children}</div>}
		</div>
	);
}

// One selectable row in the token tree — a single swatch (essential) or a split
// light/dark swatch (contract), with an optional contrast tag.
function TreeRow({ label, swatch, dual, tag, overridden, selected, onClick }: { label: string; swatch?: string; dual?: { light: string; dark: string }; tag?: string; overridden?: boolean; selected: boolean; onClick: () => void }) {
	const fail = tag === 'FAIL';
	return (
		<button type="button" onClick={onClick} aria-pressed={selected} className={cn('flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left', selected ? 'bg-[var(--accent-soft)] shadow-[inset_2px_0_0_var(--accent)]' : 'hover:bg-[color-mix(in_srgb,var(--accent)_8%,transparent)]')}>
			{dual ? <DualSwatch light={dual.light} dark={dual.dark} /> : <span className="size-[18px] shrink-0 rounded border border-border" style={{ background: swatch }} />}
			<span className="flex-1 truncate text-[12.5px] font-semibold text-[var(--text-heading)]">{label}</span>
			{overridden && <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-[var(--accent)]" title="overridden" />}
			{tag && <span aria-hidden className={cn('rounded border px-1 py-px font-mono text-[9px] font-bold', fail ? 'border-[color-mix(in_srgb,var(--fail)_40%,transparent)] text-[var(--fail)]' : 'border-[color-mix(in_srgb,var(--pass)_35%,transparent)] text-[var(--pass)]')}>{tag}</span>}
		</button>
	);
}

// The data-viz band as click-to-select strips (Series / Cat fill / Cat mark /
// Diagram). The chip colour tracks the live specimen mode so it mirrors the canvas.
function BandStrips({ map, overrides, mode, selId, onPick }: { map: Record<string, unknown>; overrides: Record<string, Override>; mode: 'light' | 'dark'; selId: string; onPick: (t: string) => void }) {
	const repr = (token: string) => sides(map[token])[mode];
	return (
		<div className="space-y-1.5 px-1.5 pb-1.5">
			<StripRow label="Series">
				{SERIES_TOKENS.map((t) => <BandChip key={t} token={t} color={repr(t)} selected={selId === t} overridden={overrides[t] != null} onPick={onPick} />)}
			</StripRow>
			<StripRow label="Cat · fill">
				{CAT_TOKENS.map((i) => { const t = `cat-${i}-fill`; return <BandChip key={t} token={t} color={repr(t)} selected={selId === t} overridden={overrides[t] != null} onPick={onPick} />; })}
			</StripRow>
			<StripRow label="Cat · mark">
				{CAT_TOKENS.map((i) => { const t = `cat-${i}-mark`; return <BandChip key={t} token={t} color={repr(t)} selected={selId === t} overridden={overrides[t] != null} onPick={onPick} />; })}
			</StripRow>
			<StripRow label="Diagram">
				{DIAGRAM_TOKENS.map((d) => <BandChip key={d.token} token={d.token} color={repr(d.token)} selected={selId === d.token} overridden={overrides[d.token] != null} onPick={onPick} />)}
			</StripRow>
		</div>
	);
}

// One jump-target chip in a band strip — its colour is the live-mode value.
function BandChip({ token, color, selected, overridden, onPick }: { token: string; color: string; selected: boolean; overridden: boolean; onPick: (t: string) => void }) {
	return (
		<button
			type="button"
			onClick={() => onPick(token)}
			aria-label={bandLabel(token)}
			aria-pressed={selected}
			title={`${bandLabel(token)} — --${token}`}
			className={cn('h-5 min-w-0 flex-1 rounded border', selected ? 'border-transparent ring-2 ring-[var(--accent)] ring-offset-1 ring-offset-[var(--bg)]' : overridden ? 'border-[var(--accent)]' : 'border-[color-mix(in_srgb,var(--text-heading)_12%,transparent)]')}
			style={{ background: color }}
		/>
	);
}

function StripRow({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<div className="flex items-center gap-2">
			<span className="w-[64px] shrink-0 font-mono text-[9px] font-bold uppercase tracking-wider text-muted-foreground/80">{label}</span>
			<div className="flex min-w-0 flex-1 gap-1">{children}</div>
		</div>
	);
}

// The per-token inspector (right column): the selected token's editable wells,
// the engine-derived note, and that token's live contrast vs the background in
// both canvas modes. An essential edits the picked input; a derived token pins an
// override (and shows a Reset). This is the V4 leap — per-token light/dark + WCAG.
function Inspector({ selected, core, map, overrides, mode, onHex, onOverride, onReset }: {
	selected: Selected;
	core: Record<EssKey, string>;
	map: Record<string, unknown>;
	overrides: Record<string, Override>;
	mode: 'light' | 'dark';
	onHex: (key: EssKey, hex: string) => void;
	onOverride: (token: string, side: 'light' | 'dark', hex: string) => void;
	onReset: (token: string) => void;
}) {
	const isEss = selected.scope === 'essential';
	// The token whose contrast we report (an essential maps to its contract token).
	const tokenId = isEss ? ESS_TOKEN[selected.id as EssKey] : selected.id;
	const name = isEss ? (ESSENTIALS.find((e) => e.key === selected.id)?.label ?? selected.id) : tokenLabel(selected.id);
	const single = isEss ? true : isSingle(map[selected.id]);
	const s = isEss ? { light: core[selected.id as EssKey], dark: core[selected.id as EssKey] } : sides(map[selected.id]);
	const ov = isEss ? undefined : overrides[selected.id];
	const overridden = !isEss && (ov?.light != null || ov?.dark != null);
	const rl = ratioVsBg(map, tokenId, 'light');
	const rd = ratioVsBg(map, tokenId, 'dark');
	const headSw = isEss ? core[selected.id as EssKey] : s[mode];
	return (
		<div className="border-b border-border">
			<div className="flex items-start gap-3 px-4 py-4">
				<span className="mt-0.5 size-7 shrink-0 rounded-lg border border-border" style={{ background: headSw }} />
				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-2">
						<span className="truncate text-[14px] font-bold text-[var(--text-heading)]">{name}</span>
						<span className="rounded border border-border px-1.5 py-px font-mono text-[9px] uppercase text-muted-foreground">{isEss ? 'essential' : single ? 'band' : 'contract'}</span>
					</div>
					<code className="font-mono text-[11px] text-muted-foreground">--{tokenId}</code>
				</div>
			</div>

			<div className="border-t border-border px-4 py-3.5">
				<div className="mb-2.5 flex items-center justify-between font-mono text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
					<span>{isEss ? 'Picked color' : single ? 'Value' : 'Light & dark'}</span>
					{overridden && <button type="button" onClick={() => onReset(selected.id)} className="flex items-center gap-1 text-[10px] normal-case tracking-normal text-[var(--accent)]"><RotateCcw className="size-3" />Reset role</button>}
				</div>
				{isEss ? (
					<div className="flex items-center gap-2.5">
						<Well label={`${name}`} value={core[selected.id as EssKey]} overridden={false} live onChange={(hex) => onHex(selected.id as EssKey, hex)} />
						<code className="font-mono text-[12px] uppercase text-[var(--text-heading)]">{core[selected.id as EssKey]}</code>
						<span className="ml-auto font-mono text-[10px] text-muted-foreground">feeds --{tokenId}</span>
					</div>
				) : single ? (
					<div className="flex items-center gap-2.5">
						<Well label={`${name} value`} value={s.light} overridden={ov?.light != null} live onChange={(hex) => onOverride(selected.id, 'light', hex)} />
						<code className="font-mono text-[12px] uppercase text-[var(--text-heading)]">{s.light}</code>
						<span className="ml-auto font-mono text-[10px] text-muted-foreground">both modes</span>
					</div>
				) : (
					<div className="flex gap-5">
						<div className="flex flex-col items-center gap-1.5">
							<Well label={`${name} light`} value={s.light} overridden={ov?.light != null} live={mode === 'light'} onChange={(hex) => onOverride(selected.id, 'light', hex)} />
							<span className="flex items-center gap-1 font-mono text-[9px] uppercase text-muted-foreground"><Sun className="size-2.5" />Light</span>
						</div>
						<div className="flex flex-col items-center gap-1.5">
							<Well label={`${name} dark`} value={s.dark} overridden={ov?.dark != null} live={mode === 'dark'} onChange={(hex) => onOverride(selected.id, 'dark', hex)} />
							<span className="flex items-center gap-1 font-mono text-[9px] uppercase text-muted-foreground"><Moon className="size-2.5" />Dark</span>
						</div>
					</div>
				)}
			</div>

			{/* This token's live contrast vs the background, both modes — only for
			    foreground roles; surfaces/decorative tokens have no AA target. */}
			<div className="border-t border-border px-4 py-3.5">
				<div className="mb-2 font-mono text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Contrast vs background</div>
				{readsOnBg(tokenId) ? (
					<>
						<PairRow icon={<Sun className="size-3" />} label="Light mode" ratio={rl} />
						<PairRow icon={<Moon className="size-3" />} label="Dark mode" ratio={rd} />
					</>
				) : (
					<p className="text-[11.5px] leading-snug text-muted-foreground">A surface / decorative token — it isn’t text on the canvas, so it has no AA contrast target. The audit checks the foreground roles that sit on it.</p>
				)}
			</div>
		</div>
	);
}

function PairRow({ icon, label, ratio }: { icon: React.ReactNode; label: string; ratio: number | null }) {
	const ok = (ratio ?? 0) >= 4.5;
	const tier = ratio == null ? '—' : tierOf(ratio, ok);
	const colour = ratio == null ? 'var(--text-muted)' : ok ? 'var(--pass)' : 'var(--fail)';
	return (
		<div className="my-1.5 flex items-center gap-2.5 text-[12px]">
			<span className="text-muted-foreground">{icon}</span>
			<span className="text-[var(--text-body)]">{label}</span>
			<span className="ml-auto font-mono text-[11px] text-muted-foreground">{ratio == null ? '—' : `${ratio.toFixed(1)} : 1`}</span>
			<span className="rounded-full border px-1.5 py-px font-mono text-[10px] font-bold" style={{ borderColor: `color-mix(in srgb, ${colour} 35%, transparent)`, color: colour }}>{tier}</span>
		</div>
	);
}

// The overall WCAG audit (right column, under the inspector) — the AI's delivered
// palette reads all-pass; a manual override that breaks a pair turns it red here.
function AuditPanel({ rows, ok }: { rows: { role: string; ratio: number | null; status: string }[]; ok: boolean }) {
	return (
		<div className="px-4 py-4">
			<div className="mb-2.5 flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
				{ok ? <Check className="size-3.5 text-[var(--pass)]" /> : <TriangleAlert className="size-3.5 text-[var(--fail)]" />}
				<span>WCAG audit</span>
				<span className={cn('ml-auto normal-case tracking-normal', ok ? 'text-[var(--pass)]' : 'text-[var(--fail)]')}>{ok ? 'AA verified' : 'review'}</span>
			</div>
			{rows.map((r) => {
				const good = r.status === 'pass';
				const tier = tierOf(r.ratio, good);
				const colour = good ? 'var(--pass)' : 'var(--fail)';
				return (
					<div key={r.role} className="my-1.5 flex items-center gap-2.5 text-[12px] text-foreground">
						<span className="grid size-[18px] place-items-center rounded-md" style={{ background: `color-mix(in srgb, ${colour} 16%, transparent)`, color: colour }}>{good ? <Check className="size-3" /> : <TriangleAlert className="size-3" />}</span>
						<span className="capitalize text-[var(--text-body)]">{r.role}</span>
						<span className="ml-auto font-mono text-[11px] text-muted-foreground">{r.ratio ? `${r.ratio.toFixed(1)} : 1` : '—'}</span>
						<span className="rounded-full border px-1.5 py-px font-mono text-[10px] font-bold" style={{ borderColor: `color-mix(in srgb, ${colour} 35%, transparent)`, color: colour }}>{tier}</span>
					</div>
				);
			})}
		</div>
	);
}
