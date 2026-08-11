import { Monitor, Moon, Sun } from 'lucide-react';
import * as React from 'react';
import { PaletteSelectItems } from '@/components/site/PaletteSelectItems';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectTrigger, SelectValue } from '@/components/ui/select';
import { paletteLabel } from '@/lib/palette-label';
import { cycleModePref, DEFAULT_PALETTE, MODE_KEY, MODE_PREF_ATTR, type Mode, type ModePref, PALETTE_KEY, setPalette, syncFromStorage, watchSystemMode } from '@/lib/site-chrome';

// The Drawing Board's deck-theme-writing chrome bus (present ONLY on that route).
// When it exists, a pick WRITES the deck's `theme:` front matter (authoring) and
// the controller mirrors it back via `db-chrome-sync`; elsewhere a pick just sets
// the site palette via site-chrome.ts. Same component, context-aware behaviour.
type ChromeBus = {
	getPalette: () => string;
	getMode: () => Mode;
	getPalettes: () => string[];
	applyTheme: (name: string) => void;
	toggleMode: () => Mode;
};
type ChromeSync = { palette: string; mode: Mode; palettes: string[] };
declare global {
	interface Window {
		__dbChrome?: ChromeBus;
	}
}

/**
 * A pre-paint answer already stamped on `<html>`, if it is one this control recognizes.
 *
 * On the server there is no document and the fallback stands, which is exactly what the SSR
 * markup should say — and what the seed in `SiteHeader.astro` corrects in the DOM before
 * first paint, so the client's first render matches whatever is on screen by then.
 */
function seeded(attr: string, allowed: readonly string[], fallback: string): string {
	if (typeof document === 'undefined') return fallback;
	const v = document.documentElement.getAttribute(attr);
	return v && allowed.includes(v) ? v : fallback;
}

/**
 * THE theme dropdown + light/dark toggle — one global chrome component mounted on
 * every surface (landing, playground, workbench, component pages, Drawing Board).
 * Items render through the shared <PaletteSelectItems> so the list is identical
 * everywhere (brand palettes, then a labelled Accessibility group for the a11y-*
 * themes). It never owns first paint — the pre-paint <head> script does.
 *
 * Behaviour is context-aware via the Drawing Board chrome bus (window.__dbChrome):
 *   - Drawing Board: picking writes the deck's `theme:` (authoring); state is
 *     pulled from the bus and pushed by `db-chrome-ready` / `db-chrome-sync`.
 *   - Everywhere else: picking sets the site palette (data-palette + localStorage)
 *     via site-chrome.ts; state syncs from storage + cross-tab `storage` events.
 *
 * Pass an empty `palettes` to render the mode toggle only. `compact` hides the
 * theme <select> below the `lg` breakpoint (the light/dark toggle stays), so the
 * header bar stays uncluttered in the compact (tablet/phone) band — theme
 * picking there moves to the command palette and the mobile menu.
 */
export default function PaletteControls({ palettes, compact = false }: { palettes: string[]; compact?: boolean }) {
	// READ THE SEEDED ANSWER DURING RENDER, not in the mount effect below (#1592). The
	// palette is already resolved before paint — the head scripts stamp `<html data-palette>`
	// from localStorage — so a control that waited for its effect to say which one was in
	// force showed nothing for the first second and a bit of every page on the site (measured
	// at 1440x900, CPU 6x: empty at 145ms, "Burgundy" at 1.9–5.1s depending on the route).
	// Reading the attribute during render makes the client's first render agree with the DOM
	// the pre-paint seed in SiteHeader.astro has already written, so hydration is a no-op
	// rather than a swap. `syncFromStorage` in the effect still owns everything afterwards.
	const [palette, setPaletteState] = React.useState(() => seeded('data-palette', palettes, palettes[0] ?? DEFAULT_PALETTE));
	const [mode, setModeState] = React.useState<Mode>(() => seeded('data-mode', ['light', 'dark'], 'light') as Mode);
	// The PREFERENCE, tracked beside the resolved mode: 'system' and a pin that happens
	// to match the OS render identically, and the control has to tell them apart (#1285).
	// Same seed, same reason: the icon used to render Monitor ("System") for a second and a
	// bit on a page whose visitor had pinned dark — a control showing the WRONG stop, which is
	// worse than the select showing none.
	const [pref, setPrefState] = React.useState<ModePref>(() => seeded(MODE_PREF_ATTR, ['system', 'light', 'dark'], 'system') as ModePref);
	// The Drawing Board bus can push a richer list (e.g. saved Workbench library
	// themes) after mount; start from the SSR set and let the bus widen it.
	const [opts, setOpts] = React.useState(palettes);
	const hasPaletteSelect = opts.length > 0;

	React.useEffect(() => {
		const bus = () => window.__dbChrome;
		const pullBus = () => {
			const b = bus();
			if (!b) return false;
			setPaletteState(b.getPalette());
			setModeState(b.getMode());
			// The deck-authoring bus speaks only light/dark; there is no OS-following
			// stop to report on that surface, so show the resolved mode as a pin.
			setPrefState(b.getMode());
			const ps = b.getPalettes();
			if (ps.length) setOpts(ps);
			return true;
		};
		const syncChrome = () => {
			const s = syncFromStorage();
			setPaletteState(s.palette);
			setModeState(s.mode);
			setPrefState(s.pref);
		};
		// Prefer the bus when it's already wired (Drawing Board); else read storage.
		if (!pullBus()) syncChrome();
		const onSync = (e: Event) => {
			const d = (e as CustomEvent<ChromeSync>).detail;
			if (!d) return void pullBus();
			setPaletteState(d.palette);
			setModeState(d.mode);
			setPrefState(d.mode);
			if (d.palettes?.length) setOpts(d.palettes);
		};
		const onShow = () => {
			if (!pullBus()) syncChrome();
		};
		const onStorage = (e: StorageEvent) => {
			if (e.key !== null && e.key !== PALETTE_KEY && e.key !== MODE_KEY) return;
			if (!bus()) syncChrome();
		};
		// db-chrome-* fire only on the Drawing Board; storage only matters off it.
		// A 'system' preference must keep following the OS, not freeze on the value it
		// resolved to at mount — otherwise System means only "the OS's answer when this
		// tab loaded", which is the frozen behavior the stop exists to fix.
		const unwatch = watchSystemMode(setModeState);
		window.addEventListener('db-chrome-ready', pullBus);
		window.addEventListener('db-chrome-sync', onSync as EventListener);
		window.addEventListener('pageshow', onShow);
		window.addEventListener('storage', onStorage);
		return () => {
			unwatch();
			window.removeEventListener('db-chrome-ready', pullBus);
			window.removeEventListener('db-chrome-sync', onSync as EventListener);
			window.removeEventListener('pageshow', onShow);
			window.removeEventListener('storage', onStorage);
		};
	}, []);

	const onPalette = (value: string) => {
		setPaletteState(value); // optimistic; the bus/sync confirms
		const b = window.__dbChrome;
		if (b) b.applyTheme(value);
		else setPalette(value);
	};
	const onMode = () => {
		const b = window.__dbChrome;
		if (b) {
			// Deck-authoring surface: two stops only (it writes a deck's own mode).
			const next = b.toggleMode();
			if (next) {
				setModeState(next);
				setPrefState(next);
			}
			return;
		}
		const nextPref = cycleModePref();
		setPrefState(nextPref);
		// cycleModePref has already stamped <html>; read the resolved value back off
		// it rather than re-deriving what 'system' means a second time.
		setModeState(document.documentElement.getAttribute('data-mode') === 'dark' ? 'dark' : 'light');
	};

	// Names the CURRENT stop, and for System says what it currently resolves to —
	// otherwise "System" and a pin to the same value are indistinguishable to a
	// screen reader as well as to the eye. It deliberately does NOT promise the
	// next stop: the cycle order is derived from the OS (see cycleModePref), so a
	// hardcoded "click for dark" would be wrong half the time.
	const modeLabel = `Color mode: ${pref === 'system' ? `System (${mode})` : pref === 'light' ? 'Light' : 'Dark'} — click to change`;

	// Keep `<html data-mode-pref>` in step with the stop this control is on, so the pre-paint
	// seed on the NEXT load has a value to read — and so the Drawing Board's bus path, which
	// reports a pin rather than a preference, publishes the same answer this control renders.
	// `site-chrome`'s own writers cover the ordinary click; this covers every other path into
	// the state in one place rather than three.
	React.useEffect(() => {
		document.documentElement.setAttribute(MODE_PREF_ATTR, pref);
	}, [pref]);

	return (
		<div className="flex items-center gap-2">
			{hasPaletteSelect && (
				// value guarded: the bus may report a deck theme not yet in `opts`.
				<Select value={opts.includes(palette) ? palette : ''} onValueChange={onPalette}>
					<SelectTrigger
						size="sm"
						aria-label="Theme"
						// Room for the a11y group's longest name ("Achromatopsia") from sm up;
						// 8.5rem on mobile so the topbar can't overflow ≤390px; truncate (not
						// clip) a long name — the primitive's display:flex defeats line-clamp.
						// `compact` drops it below lg (the header's compact band); the
						// command palette + mobile menu carry theme-picking there.
						className={`w-[8.5rem] sm:w-40 [&_[data-slot=select-value]]:!block [&_[data-slot=select-value]]:min-w-0 [&_[data-slot=select-value]]:truncate${compact ? ' hidden lg:flex' : ''}`}
					>
						{/* EXPLICIT CHILDREN, not radix's own value resolution (#1592). Left to
						    itself, `SelectValue` renders nothing and waits for `SelectItemText` to
						    portal the selected item's text in — and the items only exist after a
						    layout effect has built the closed content's DocumentFragment. That is
						    why the trigger server-rendered EMPTY and filled in whenever the island
						    got round to hydrating. Naming the label here makes it plain text in the
						    SSR'd markup, which the pre-paint seed can then correct to the visitor's
						    own palette before anything is on screen. */}
						<SelectValue placeholder="Theme">{opts.includes(palette) ? paletteLabel(palette) : null}</SelectValue>
					</SelectTrigger>
					<SelectContent className="max-h-[60vh]">
						<PaletteSelectItems palettes={opts} />
					</SelectContent>
				</Select>
			)}
			<Button
				variant="outline"
				size="icon-sm"
				onClick={onMode}
				aria-label={modeLabel}
				title={modeLabel}
			>
				{/* The icon names the CURRENT stop, not the next one — System has no
				    opposite to point at, so "what happens if I click" stops being
				    expressible the moment there are three stops.
				    ALL THREE ARE RENDERED AND CSS PICKS ONE (#1592, rules in SiteHeader.astro),
				    which is not a flourish: React choosing here would mean the server rendering
				    Monitor and the client's first render producing Moon for a visitor who pinned
				    dark, and React 19 treats that as a hydration mismatch rather than patching
				    it. Rendering the same three on both sides keys the choice to
				    `<html data-mode-pref>` — which the pre-paint seed has right before anything
				    paints, and which the effect above keeps in step afterwards. */}
				<Monitor data-slot="mode-icon" data-pref="system" aria-hidden="true" />
				<Sun data-slot="mode-icon" data-pref="light" aria-hidden="true" />
				<Moon data-slot="mode-icon" data-pref="dark" aria-hidden="true" />
			</Button>
		</div>
	);
}
