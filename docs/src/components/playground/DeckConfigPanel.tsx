import { Layers, Monitor, Moon, Printer, Sun } from 'lucide-react';
import * as React from 'react';
import { AUTO_VALUE, autoSelected, type CatalogGroup, type CatalogOption, CatalogSelect, catalogOptions, withAutoHead } from '@/components/studio/CatalogSelect';
import { CORNERS } from '@/components/studio/corners-catalog';
import { EYEBROWS } from '@/components/studio/eyebrow-catalog';
import { activeFinish } from '@/components/studio/finish-catalog';
import { HEADLINES } from '@/components/studio/headline-catalog';
import { MODES } from '@/components/studio/mode-catalog';
import { glyphs, optionGlyph, SizeChip } from '@/components/studio/option-glyphs';
import { RULES } from '@/components/studio/rule-catalog';
import { VENUES } from '@/components/studio/venue';
import { A11Y_GROUP_LABEL, paletteLabel } from '@/lib/palette-label';
import { isA11yPalette, PALETTE_DOTS } from '@/lib/theme-catalog.generated';
import { lookBaseline, PRESET_OPTIONS, readFrontMatter, writeFrontMatter } from '@/playground/deck-config.js';
import { SIZE_OPTIONS } from '@/playground/deck-sizes.js';

// The Playground's Deck settings rows: the front-matter controls `deck-config.js` reads and
// writes, drawn with the Studio's own picker. Every select row is a `CatalogSelect` built
// through `withAutoHead`, so each list opens on one `Auto — <resolved>` head and every option
// carries the same chip or icon it wears in the Studio's Settings (option-glyphs.tsx and the
// register catalogs). The lists also inherit the shared select's tap-away layer, so an outside
// tap on iOS closes an open list here as it does in the Studio (ui/select.tsx).
//
// The read/write layer is unchanged: `readFrontMatter` gives what each register resolves to
// (the deck's own value, else its preset's) and `writeFrontMatter` drops a key at its baseline.
// So Auto hands the setter the resolved value and the writer removes the key, the rule the
// Studio's `autoField` follows.
//
// Switch and text rows keep the `.deck-config` markup (deck-config.css), which the Debug
// overlay row in DeckSetupSheet shares.

const titleCase = (s: string) => s.replace(/(^|-)(\w)/g, (_, sep: string, c: string) => (sep ? ' ' : '') + c.toUpperCase());

// What a value the deck carries reads as when the list does not name it (a typo, a newer
// value): shown as itself rather than as whichever option happens to be first.
const withUnknown = (options: CatalogOption[], v: string): CatalogOption[] =>
	v && !options.some((o) => o.value === v) ? [...options, { value: v, label: `${v} — not recognized` }] : options;

const COLOR_MODES: CatalogOption[] = [
	{ value: 'light', label: 'Light', icon: <Sun className="size-3.5" /> },
	{ value: 'dark', label: 'Dark', icon: <Moon className="size-3.5" /> },
	{ value: 'system', label: 'System — follow the OS', icon: <Monitor className="size-3.5" /> },
	{ value: 'inherited', label: 'Match site / host', icon: <Layers className="size-3.5" /> },
	{ value: 'print', label: 'Print — ink on white', icon: <Printer className="size-3.5" /> },
];
const SIZES: CatalogOption[] = SIZE_OPTIONS.map(([value, label]) => ({ value, label, icon: <SizeChip size={value} /> }));
const VENUE_OPTIONS: CatalogOption[] = VENUES.map((v) => ({ value: v.value, label: `${v.label} · ${v.scale}x`, hint: v.who, icon: optionGlyph('venue', v.value) }));
const SPLITS: CatalogOption[] = [
	{ value: 'headings', label: 'On ## headings', icon: optionGlyph('split', 'headings') },
	{ value: 'rule', label: 'On --- dividers', icon: optionGlyph('split', 'rule') },
];
const LOOK = {
	headline: catalogOptions(HEADLINES, glyphs('align')),
	rule: catalogOptions(RULES),
	eyebrow: catalogOptions(EYEBROWS),
	corners: catalogOptions(CORNERS, glyphs('corners')),
} as const;
type LookKey = keyof typeof LOOK;

export type DeckConfigField = string;

export function DeckConfigPanel({
	getSource,
	setSource,
	palettes,
	finishes,
	getDefaultTheme = () => '',
	fields = null,
	note,
}: {
	getSource: () => string;
	setSource: (next: string) => void;
	palettes: string[];
	finishes: string[];
	/** What an un-pinned deck renders with, so the Theme row's Auto head can name it. */
	getDefaultTheme?: () => string;
	/** An allow-list of managed keys to draw; `null` draws every row. */
	fields?: DeckConfigField[] | null;
	note?: string;
}) {
	// The panel re-reads the source after each write, so every row (and the Auto heads under
	// a new preset) settles on what the deck now resolves to.
	const [, bump] = React.useReducer((n: number) => n + 1, 0);
	const fm = readFrontMatter(getSource());
	const allow = fields ? new Set(fields) : null;
	const show = (key: string) => !allow || allow.has(key);
	const apply = (key: string, value: string | boolean) => {
		try {
			setSource(writeFrontMatter(getSource(), key, value));
		} catch {
			/* editor gone */
		}
		bump();
	};
	const preset: string = fm.preset || 'classic';

	/** One select row: a label + hint over a `CatalogSelect` whose head is Auto. */
	const selectRow = (key: string, label: string, hint: string, groups: CatalogGroup[], current: string, resolved: string, opts: { round?: boolean; autoLabel?: string; autoTitle?: string } = {}) => (
		<div className="db-pref-row" key={key}>
			<Text label={label} hint={hint} />
			<CatalogSelect
				ariaLabel={`Choose ${label.toLowerCase()}`}
				className="db-pref-catalog"
				swatchShape={opts.round ? 'round' : 'square'}
				value={autoSelected(current, resolved)}
				onValueChange={(v) => apply(key, v === AUTO_VALUE ? resolved : v)}
				groups={withAutoHead(groups, opts.autoLabel ? { label: opts.autoLabel } : { value: resolved }, { title: opts.autoTitle })}
			/>
		</div>
	);

	const lookRow = (key: LookKey, label: string, hint: string) =>
		show(key) && selectRow(key, label, hint, [{ options: withUnknown(LOOK[key], fm[key]) }], fm[key], lookBaseline(preset, key));

	// Theme: an un-pinned deck follows the site palette (`resolveDeckTheme`), so Auto names it
	// and choosing Auto clears `theme:`. A name the deck carries that is not a palette shows
	// as Auto with a note, which is what the renderer does with it.
	const themeRow = () => {
		const raw: string = fm.theme;
		const valid = !!raw && palettes.includes(raw);
		const site = getDefaultTheme() || palettes[0] || '';
		const option = (p: string): CatalogOption => ({ value: p, label: paletteLabel(p), swatch: { background: PALETTE_DOTS[p] ?? 'var(--accent)' } });
		const brand = palettes.filter((p) => !isA11yPalette(p)).map(option);
		const cvd = palettes.filter((p) => isA11yPalette(p)).map(option);
		const groups: CatalogGroup[] = [{ options: brand }, ...(cvd.length ? [{ label: A11Y_GROUP_LABEL, options: cvd }] : [])];
		return (
			<React.Fragment key="theme">
				{selectRow('theme', 'Theme', 'Palette for this deck. Auto follows the site; any other choice pins it and travels with the exported .md', groups, valid ? raw : '', '', {
					round: true,
					autoLabel: site ? `follow the site (${paletteLabel(site)})` : 'follow the site',
					autoTitle: 'Follow the website theme (no theme pinned to the deck).',
				})}
				{raw && !valid && (
					<p className="db-settings-note db-config-warn">
						“{raw}” isn’t a known theme — the deck follows the site palette{site ? ` (${paletteLabel(site)})` : ''} until you pick a valid one.
					</p>
				)}
			</React.Fragment>
		);
	};

	const group = (title: string, keys: string[]) => keys.some(show) && <h3 className="db-settings-head db-settings-subhead">{title}</h3>;
	const finishOptions = finishes.filter((f) => f !== 'none').map((f): CatalogOption => {
		const entry = activeFinish(f);
		return { value: f, label: entry.name === f ? entry.label : titleCase(f), swatch: entry.swatch, title: entry.name === f ? entry.blurb : undefined };
	});
	const presetFinish = lookBaseline(preset, 'finish') || 'none';

	return (
		<>
			<p className="db-settings-note">
				{note ?? 'These live in the deck’s front matter — managed for you, so the Markdown stays clean. They apply to the whole deck and travel with an exported .md.'}
			</p>

			{group('Look', ['theme', 'color-mode', 'preset', 'finish', 'headline', 'rule', 'eyebrow', 'corners', 'lift', 'mode'])}
			{show('theme') && palettes.length > 0 && themeRow()}
			{show('color-mode') &&
				selectRow('color-mode', 'Color mode', 'The mode the deck opens in everywhere — pin light/dark, follow the OS, or match the host', [{ options: withUnknown(COLOR_MODES, fm['color-mode']) }], fm['color-mode'], '', {
					autoLabel: "Theme's own",
					autoTitle: 'The mode the theme was designed in.',
				})}
			{show('preset') &&
				selectRow(
					'preset',
					'Preset',
					'A named look — sets the backdrop, alignment, heading rule, eyebrow, lift and corners. Any row below overrides it',
					[{ options: PRESET_OPTIONS.map((p: { name: string; label: string; finish: string }) => ({ value: p.name, label: p.label, swatch: activeFinish(p.finish).swatch })) }],
					fm.preset,
					'classic',
				)}
			{show('finish') &&
				finishes.length > 0 &&
				selectRow(
					'finish',
					'Finish',
					'A palette-blind backdrop behind content — applies to the whole deck',
					[{ options: withUnknown([{ value: 'none', label: 'None', swatch: activeFinish('none').swatch }, ...finishOptions], fm.finish) }],
					fm.finish || 'none',
					presetFinish,
				)}
			{lookRow('headline', 'Headline alignment', 'Where the eyebrow, heading and subtitle sit on every slide')}
			{lookRow('rule', 'Heading rule', 'The line under each slide’s heading')}
			{lookRow('eyebrow', 'Eyebrow', 'The mark before the small label above a heading')}
			{lookRow('corners', 'Slide corners', 'Square, or rounded at the theme’s radius')}
			{show('lift') && <SwitchRow label="Card lift" hint="Lift card surfaces off the slide with a subtle shadow — reads in light & dark, safe in the PDF export" on={fm.lift} onChange={(on) => apply('lift', on)} />}
			{show('mode') && selectRow('mode', 'Mode', 'The rendering hand — clean or sketch — applies to the whole deck', [{ options: withUnknown(catalogOptions(MODES), fm.mode) }], fm.mode, 'boardroom')}

			{group('Format', ['size', 'venue', 'split'])}
			{show('size') && selectRow('size', 'Slide size', 'Landscape, or a portrait / square format for social & mobile', [{ options: withUnknown(SIZES, fm.size) }], fm.size, 'hd')}
			{show('venue') && selectRow('venue', 'Venue', 'Where the deck is seen — larger rooms get larger type', [{ options: withUnknown(VENUE_OPTIONS, fm.venue) }], fm.venue, 'laptop')}
			{show('split') && selectRow('split', 'Slide splitting', 'Start a new slide on each ## heading (default) or only on ---', [{ options: SPLITS }], fm.split, 'headings')}

			{group('On every slide', ['paginate', 'header', 'footer'])}
			{show('paginate') && <SwitchRow label="Page numbers" hint="Show pagination on every slide" on={fm.paginate} onChange={(on) => apply('paginate', on)} />}
			{show('header') && <TextField label="Header" hint="Running header text on every slide" value={fm.header} placeholder="e.g. Lattice · Q3 Board Review" onCommit={(v) => apply('header', v)} />}
			{show('footer') && <TextField label="Footer" hint="Running footer text on every slide" value={fm.footer} placeholder="e.g. Confidential" onCommit={(v) => apply('footer', v)} />}

			{group('Editing', ['validate', 'glossary'])}
			{show('validate') && <SwitchRow label="Inline validation" hint="Underline layout/component grammar issues as you type, with a hover fix" on={fm.validate} onChange={(on) => apply('validate', on)} />}
			{show('glossary') && (
				<SwitchRow label="Auto-glossary" hint="Append a glossary slide built from your acronyms: definitions — needs at least one term with a definition" on={fm.glossary} onChange={(on) => apply('glossary', on)} />
			)}

			{(show('class') || show('lang')) && <h3 className="db-settings-head db-settings-subhead">Advanced</h3>}
			{/* Not `dark` as the example: color belongs to Color mode above, and a component name is
			    refused outright, so the example names a modifier, which is what this key is for. */}
			{show('class') && (
				<TextField label="Default slide class" hint="A modifier applied to every slide (e.g. no-note). Color lives in Color mode; a component name is ignored here." value={fm.class} placeholder="e.g. no-note" onCommit={(v) => apply('class', v)} />
			)}
			{show('lang') && <TextField label="Language" hint="The deck’s document language tag" value={fm.lang} placeholder="e.g. en" onCommit={(v) => apply('lang', v)} />}
		</>
	);
}

/** A label + hint pair (the left side of every row). */
function Text({ label, hint }: { label: string; hint?: string }) {
	return (
		<div className="db-pref-text">
			<span className="db-pref-label">{label}</span>
			{hint && <span className="db-pref-hint">{hint}</span>}
		</div>
	);
}

function SwitchRow({ label, hint, on, onChange }: { label: string; hint: string; on: boolean; onChange: (on: boolean) => void }) {
	return (
		<label className="db-or-switch">
			<Text label={label} hint={hint} />
			<span className="db-switch">
				<input type="checkbox" className="db-switch-input" checked={!!on} aria-label={label} onChange={(e) => onChange(e.target.checked)} />
				<span className="db-switch-knob" />
			</span>
		</label>
	);
}

/** A stacked text field: label + hint above a full-width input. Writes 250ms after the last
 *  keystroke so the live preview tracks the edit without rewriting the editor on every key.
 *
 *  Only the reader's own typing writes. The deck can change under an open sheet (it is
 *  non-modal, and the editor sits beside it), so an idle field follows the deck, and leaving a
 *  field you did not type in writes nothing: a blur that compared against the latest deck value
 *  put a stale one back over the editor. A write still pending when the sheet closes is
 *  flushed rather than dropped. */
function TextField({ label, hint, value, placeholder, onCommit }: { label: string; hint: string; value: string; placeholder?: string; onCommit: (v: string) => void }) {
	const input = React.useRef<HTMLInputElement>(null);
	const pending = React.useRef<{ timer: ReturnType<typeof setTimeout>; value: string } | null>(null);
	const commit = React.useRef(onCommit);
	commit.current = onCommit;
	const flush = React.useCallback(() => {
		const p = pending.current;
		if (!p) return;
		clearTimeout(p.timer);
		pending.current = null;
		commit.current(p.value);
	}, []);
	React.useEffect(() => flush, [flush]);
	// An idle field shows what the deck says now.
	React.useEffect(() => {
		const el = input.current;
		if (el && document.activeElement !== el && !pending.current && el.value !== value) el.value = value;
	}, [value]);
	return (
		<div className="db-config-field">
			<Text label={label} hint={hint} />
			<input
				ref={input}
				type="text"
				className="db-config-input"
				defaultValue={value}
				placeholder={placeholder}
				aria-label={label}
				onChange={(e) => {
					const v = e.currentTarget.value;
					if (pending.current) clearTimeout(pending.current.timer);
					pending.current = { value: v, timer: setTimeout(flush, 250) };
				}}
				onBlur={flush}
			/>
		</div>
	);
}
