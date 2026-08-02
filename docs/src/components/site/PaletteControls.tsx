import { Monitor, Moon, Sun } from 'lucide-react';
import * as React from 'react';
import { PaletteSelectItems } from '@/components/site/PaletteSelectItems';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cycleModePref, DEFAULT_PALETTE, MODE_KEY, type Mode, type ModePref, PALETTE_KEY, setPalette, syncFromStorage, watchSystemMode } from '@/lib/site-chrome';

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
	const [palette, setPaletteState] = React.useState(palettes[0] ?? DEFAULT_PALETTE);
	const [mode, setModeState] = React.useState<Mode>('light');
	// The PREFERENCE, tracked beside the resolved mode: 'system' and a pin that happens
	// to match the OS render identically, and the control has to tell them apart (#1285).
	const [pref, setPrefState] = React.useState<ModePref>('system');
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
						<SelectValue placeholder="Theme" />
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
				    expressible the moment there are three stops. */}
				{pref === 'system' ? <Monitor /> : pref === 'dark' ? <Moon /> : <Sun />}
			</Button>
		</div>
	);
}
