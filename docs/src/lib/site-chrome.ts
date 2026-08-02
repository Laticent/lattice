/**
 * The ONE controller for the site's palette + light/dark controls.
 *
 * Every surface (landing, playground, drawing board, workbench, the component
 * reference, and the Starlight docs header) used to re-implement this wiring
 * inline. They now all drive the shared React `PaletteControls` island, which
 * goes through this module — so the read/write contract lives in exactly one
 * place.
 *
 * The contract (unchanged, so deck iframes + un-migrated code keep theming):
 *   • `data-palette` / `data-mode` on <html> drive the generated palette tokens
 *     (lattice-tokens.generated.css) and the deck `srcdoc` iframes, which read
 *     those attributes off the host (single-slide-render.ts).
 *   • `data-theme` is kept in lockstep with `data-mode` for Starlight's own CSS
 *     + code-block themes.
 *   • localStorage keys `lattice-docs-palette` / `lattice-docs-mode` (+
 *     `starlight-theme`) persist the choice across MPA navigations.
 *
 * The pre-paint scripts (ThemeProvider.astro on docs, the per-page inline
 * <head> script on standalone routes) still set these BEFORE first paint to
 * avoid FOUC — this module is the runtime controller, never the first paint.
 */

export const PALETTE_KEY = 'lattice-docs-palette';
export const MODE_KEY = 'lattice-docs-mode';
export const STARLIGHT_THEME_KEY = 'starlight-theme';
export const DEFAULT_PALETTE = 'cuoio';

/**
 * The RESOLVED color mode — the only two values `data-mode` ever carries, because
 * the generated palette tokens and every deck `srcdoc` iframe read that attribute
 * and switch on exactly these. Unchanged contract.
 */
export type Mode = 'light' | 'dark';
/**
 * The user's stored PREFERENCE, which has a third stop: `system` follows the OS
 * (`prefers-color-scheme`) and keeps following it as the OS flips. Distinct from
 * `Mode` on purpose — "system" is a rule for choosing a mode, never a mode itself,
 * so it must not reach `data-mode`.
 *
 * `system` is the DEFAULT. Before this, an unset preference resolved from the OS
 * once at first paint and then froze on the first toggle, with no way back — you
 * could land on the OS's answer but never ask to keep following it (#1285).
 */
export type ModePref = Mode | 'system';
export const DEFAULT_MODE_PREF: ModePref = 'system';

const root = () => document.documentElement;

const isMode = (v: unknown): v is Mode => v === 'light' || v === 'dark';
const isModePref = (v: unknown): v is ModePref => isMode(v) || v === 'system';

/** What the OS is asking for right now. Falls back to light where matchMedia is absent. */
export function systemMode(): Mode {
	try {
		return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
	} catch {
		return 'light';
	}
}

/** The stored preference — `system` when nothing (or something unrecognized) is stored. */
export function getModePref(): ModePref {
	try {
		const v = localStorage.getItem(MODE_KEY);
		return isModePref(v) ? v : DEFAULT_MODE_PREF;
	} catch {
		return DEFAULT_MODE_PREF;
	}
}

/** The mode a preference resolves to right now. */
export function resolveMode(pref: ModePref): Mode {
	return pref === 'system' ? systemMode() : pref;
}

export function getPalette(): string {
	return root().getAttribute('data-palette') || DEFAULT_PALETTE;
}

export function setPalette(palette: string): void {
	root().setAttribute('data-palette', palette);
	try {
		localStorage.setItem(PALETTE_KEY, palette);
	} catch {
		/* private mode / storage disabled — attribute is still set */
	}
}

export function getMode(): Mode {
	return root().getAttribute('data-mode') === 'dark' ? 'dark' : 'light';
}

/** Stamp a RESOLVED mode onto <html> without touching the stored preference. */
function stampMode(mode: Mode): void {
	const r = root();
	r.setAttribute('data-mode', mode);
	r.dataset.theme = mode; // keep Starlight's CSS + code blocks in lockstep
	try {
		// Starlight reads its own key and knows only light/dark, so it always gets
		// the RESOLVED value — never the literal 'system', which would leave its
		// code blocks unstyled.
		localStorage.setItem(STARLIGHT_THEME_KEY, mode);
	} catch {
		/* storage disabled */
	}
}

/** Persist a preference and apply what it resolves to. */
export function setModePref(pref: ModePref): Mode {
	const mode = resolveMode(pref);
	stampMode(mode);
	try {
		localStorage.setItem(MODE_KEY, pref);
	} catch {
		/* storage disabled */
	}
	return mode;
}

export function setMode(mode: Mode): void {
	setModePref(mode);
}

/**
 * The three-stop cycle. Returns the new PREFERENCE (not the resolved mode) so a
 * caller can render the right icon — "following the OS" and "pinned to the OS's
 * current answer" look identical otherwise, and telling them apart is the whole
 * point of the third stop.
 *
 * The order is `system → opposite(OS) → OS → system`, NOT a fixed
 * system→light→dark. A fixed order makes the first click a visual no-op whenever
 * the OS already says light (system-resolved-light → pinned light repaints
 * nothing), and a control that appears dead on first press is worse than no
 * third stop at all. Deriving the order from the OS means the first two clicks
 * always change the appearance, and the third returns to following.
 */
export function cycleModePref(): ModePref {
	const sys = systemMode();
	const order: ModePref[] = ['system', sys === 'dark' ? 'light' : 'dark', sys];
	const next = order[(order.indexOf(getModePref()) + 1) % order.length];
	setModePref(next);
	return next;
}

/**
 * Flip the RESOLVED mode and pin it — two stops, unchanged semantics. The
 * deck-authoring surfaces (Studio top bar, Drawing Board) drive this: they offer
 * a light/dark switch whose label names the mode it is about to produce, so it
 * must never land on a stop that leaves the appearance alone. The three-stop
 * cycle belongs to the site header's control, which has the room to say which
 * stop it is on.
 */
export function toggleMode(): Mode {
	const next: Mode = getMode() === 'dark' ? 'light' : 'dark';
	setModePref(next);
	return next;
}

/**
 * Keep a `system` preference LIVE — re-stamp when the OS flips. Returns an
 * unsubscribe. Without this, System would only mean "the OS's answer at the
 * moment the tab loaded", which is the frozen behavior the third stop exists to
 * fix. A pinned light/dark preference ignores the OS entirely.
 */
export function watchSystemMode(onChange?: (mode: Mode) => void): () => void {
	let mq: MediaQueryList;
	try {
		mq = window.matchMedia('(prefers-color-scheme: dark)');
	} catch {
		return () => {};
	}
	const handler = () => {
		if (getModePref() !== 'system') return;
		const mode = systemMode();
		stampMode(mode);
		onChange?.(mode);
	};
	mq.addEventListener('change', handler);
	return () => mq.removeEventListener('change', handler);
}

/**
 * Re-sync the <html> attributes from localStorage and return the current
 * state. Used on mount and on `pageshow` (bfcache restores, e.g. Back from the
 * playground, where the pre-paint <head> script doesn't re-run).
 */
export function syncFromStorage(): { palette: string; mode: Mode; pref: ModePref } {
	const r = root();
	try {
		const p = localStorage.getItem(PALETTE_KEY);
		if (p && p !== r.getAttribute('data-palette')) r.setAttribute('data-palette', p);
	} catch {
		/* storage disabled */
	}
	// Resolve through the preference so a `system` choice re-reads the OS on every
	// sync — a bfcache restore or a cross-tab change can land after the OS flipped.
	const pref = getModePref();
	const mode = resolveMode(pref);
	if (mode !== r.getAttribute('data-mode')) stampMode(mode);
	return { palette: getPalette(), mode, pref };
}
