import { Settings } from 'lucide-react';
import * as React from 'react';
import { MODES } from '@/components/studio/mode-catalog';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { useOverlayBack } from '@/lib/overlay-back';
import { A11Y_GROUP_LABEL, paletteLabel } from '@/lib/palette-label';
import { isA11yPalette } from '@/lib/theme-catalog.generated';
import { useIsPhone } from '@/lib/use-breakpoint';
import { deckDebugOn } from '@/playground/debug-overlay.js';
import { debugEffectiveOn, onDebugOverrideChange, setDebugOverride } from '@/playground/debug-prefs.js';
import { CONFIG_PROFILES, createConfigPanel } from '@/playground/deck-config.js';

/**
 * Deck setup — the universal front-matter config panel (createConfigPanel) mounted
 * inside a shadcn Sheet. "Universal" is now aspirational rather than descriptive: this
 * is the ONLY host. It used to be shared with the Workbench and the Drawing Board, both
 * deleted in the 2026-07-03 studio succession, and the panel stayed host-agnostic. The
 * panel itself is NOT rewritten: deck-config.js builds its own `.deck-config`
 * rows (styled by deck-config.css), and we host it in a React-owned div, calling
 * config.render() each time the Sheet opens. Writes flow setSource → editor →
 * onChange → live re-render, exactly as before.
 *
 * The profile is `author` (every field, `theme` included) — since 2026-09-15 the only
 * profile `deck-config.js` exports. It was `noTheme`, on the
 * reasoning that "the top-bar palette picker owns theme on this surface" — true only
 * while that picker is on screen, and `PaletteControls` hides it below `lg` (its
 * `compact` prop). On a phone the near control was withheld in favor of a far one
 * that wasn't rendered, so the surface had no theme control anywhere. The row writes
 * the deck's own `theme:`, which is the authoritative axis (`@/lib/deck-theme`), with
 * an Automatic stop that clears the key and hands the deck back to the site palette.
 *
 * The trigger icon tints when the deck carries non-theme managed front matter
 * (readFrontMatter().configured) — the same cue the vanilla `is-set` class gave.
 * `theme` stays out of that cue, unchanged: it is excluded at the reader.
 *
 * `modes` is REQUIRED for the Mode row to render at all — deck-config gates it on
 * `modes.length`, and this host passed nothing, so the row was in the profile and
 * never drawn (found by the 2026-08-18 coverage audit, §4.2). The names come from the
 * Studio's mode catalog, which carries the engine rot-guard (mode-catalog.test.ts), so
 * the two surfaces cannot offer different modes.
 */
// Module scope: a stable identity, so the mount callback's dep list doesn't change
// every render (which would rebuild the whole vanilla panel on each parent update).
const MODE_NAMES = MODES.map((m) => m.name);
const PALETTE_NAMING = {
	label: paletteLabel,
	group: { label: A11Y_GROUP_LABEL, has: isA11yPalette },
};

export function DeckSetupSheet({
	getSource,
	setSource,
	palettes,
	finishes,
	configured,
}: {
	getSource: () => string;
	setSource: (next: string) => void;
	palettes: string[];
	finishes: string[];
	/** Whether the deck carries non-theme managed front matter (the trigger cue). */
	configured: boolean;
}) {
	const [open, setOpen] = React.useState(false);
	// Back closes this sheet instead of leaving the page (#1226 follow-up). Phone only.
	// Registering here is what makes the site's back behavior UNIFORM: `FeedbackSheet`
	// is a `PanelSheet` and so registered from the day the guard landed, while the raw
	// `Sheet`s around it did not — so back closed feedback but left the site from the
	// nav sheet underneath it. A mixed stack is worse than either rule applied evenly.
	const phone = useIsPhone();
	useOverlayBack(phone && open, React.useCallback(() => setOpen(false), []));

	const getSourceRef = React.useRef(getSource);
	const setSourceRef = React.useRef(setSource);
	getSourceRef.current = getSource;
	setSourceRef.current = setSource;

	// A CALLBACK ref, not useEffect: Radix mounts (and on close unmounts) the
	// Sheet body, handing us a fresh host node each open. Building + rendering the
	// vanilla config panel the instant the node attaches sidesteps any effect-vs-
	// portal timing race (the node is guaranteed live here). createConfigPanel +
	// render() are the deck-config.js contract — not reimplemented.
	const mountHost = React.useCallback(
		(host: HTMLDivElement | null) => {
			if (!host) return; // detach on close — nothing to clean up (DOM goes with it)
			const panel = createConfigPanel({
				host,
				getSource: () => getSourceRef.current(),
				setSource: (next: string) => setSourceRef.current(next),
				palettes,
				finishes,
				modes: MODE_NAMES,
				// What an un-pinned deck renders with, so the theme row's Automatic stop can
				// name it. Read from the DOM at render time rather than threaded as a prop:
				// the site palette lives on `<html data-palette>` (site-chrome.ts) and the
				// panel is rebuilt on every open, so this is always the current answer.
				getDefaultTheme: () => document.documentElement.getAttribute('data-palette') || '',
				// The site's OWN palette naming, handed down rather than re-derived in the
				// panel: `paletteLabel` strips the `a11y-` prefix for a palette the manifests
				// DECLARE as one of the curated color-vision themes, which is only legible
				// because those options sit under the group heading below — the same pairing
				// `PaletteSelectItems` uses in the header picker. Injected, not imported by
				// deck-config.js, because that module is also run straight under `node --test`.
				paletteNaming: PALETTE_NAMING,
				fields: CONFIG_PROFILES.author,
			});
			panel.render();
		},
		[palettes, finishes],
	);

	// modal={false} + overlay={false}: a non-modal side sheet over a LIVE preview.
	// A modal sheet engages react-remove-scroll's body scroll-lock, which lingers on
	// iOS Safari after close and freezes the preview until focus changes (see
	// engineering/gotchas.md). Non-modal keeps the preview scrollable and lets you
	// watch it update as you change front matter.
	return (
		<Sheet open={open} onOpenChange={setOpen} modal={false}>
			<SheetTrigger asChild>
				<Button id="pg-setup-trigger" variant="outline" size="sm" aria-label="Deck Setting" title="Deck Setting — front matter for this deck">
					<Settings className={configured ? 'text-primary' : undefined} />
					<span className="hidden sm:inline">Deck Setting</span>
				</Button>
			</SheetTrigger>
			<SheetContent
				overlay={false}
				className="w-[360px] max-w-[88vw] gap-0 overflow-y-auto overscroll-contain [touch-action:pan-y]"
				tabIndex={-1}
				// Radix focuses the first focusable descendant on open, which here is the
				// FIRST ROW'S <select> (Mode). iOS Safari opens a select's picker on the tap
				// that gives it focus, so a select arriving already-focused swallows that
				// first tap: Mode did nothing until you touched another control and came
				// back. Park focus on the panel itself instead — keyboard users still Tab
				// straight in, and no live control is armed by merely opening the sheet.
				onOpenAutoFocus={(e) => {
					e.preventDefault();
					(e.currentTarget as HTMLElement | null)?.focus();
				}}
			>
				<SheetHeader className="border-b border-border">
					<SheetTitle className="flex items-center gap-2 text-[15px]"><Settings className="size-[18px] text-[var(--accent)]" />Deck settings</SheetTitle>
					<SheetDescription className="sr-only">
						Front matter for this deck — applied to the whole deck and exported with the .md.
					</SheetDescription>
				</SheetHeader>
				<div className="deck-config px-4 pb-4" ref={mountHost} />
				<div className="deck-config border-t border-border/60 px-4 pb-4 pt-3">
					<div className="db-settings-head">Preview · debug</div>
					<DebugPrefRow getSource={getSource} />
				</div>
			</SheetContent>
		</Sheet>
	);
}

/**
 * The SESSION OVERRIDE for the layout debug overlay. The deck's `debug:` front
 * matter is the real setting (edit it in the deck source above / the editor); this
 * switch just forces the overlay on or off for THIS device, winning over the deck
 * for the session. It never writes the Markdown and is never exported. The toolbar
 * button is the same override; both write debug-prefs (localStorage), so flipping
 * either updates the preview immediately. Reuses the shared `.deck-config` switch
 * markup/styling (deck-config.css).
 */
function DebugPrefRow({ getSource }: { getSource: () => string }) {
	// Effective = the override if set, else the deck's own `debug:`. Recomputed on
	// each open (the Sheet remounts this) and when the override changes elsewhere.
	const deckOn = (() => {
		try {
			return deckDebugOn(getSource());
		} catch {
			return false;
		}
	})();
	const [effective, setEffective] = React.useState(() => debugEffectiveOn(deckOn));
	React.useEffect(() => onDebugOverrideChange(() => setEffective(debugEffectiveOn(deckOn))), [deckOn]);
	return (
		<label className="db-or-switch">
			<span className="db-pref-text">
				<span className="db-pref-label">Debug overlay</span>
				<span className="db-pref-hint">
					Outline every box by layout mode (grid / flex / flow) and label the structural boxes. Set{' '}
					<code>debug: on-hover</code> in the deck to carry it; this switch overrides for this device only — never exported.
				</span>
			</span>
			<span className="db-switch">
				<input
					type="checkbox"
					className="db-switch-input"
					checked={effective}
					aria-label="Debug overlay"
					onChange={(e) => setDebugOverride(e.target.checked ? 'on' : 'off')}
				/>
				<span className="db-switch-knob" />
			</span>
		</label>
	);
}
