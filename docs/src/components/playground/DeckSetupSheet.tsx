import { Settings } from 'lucide-react';
import * as React from 'react';
import { lazyPanel, PanelLoader } from '@/components/studio/lazy-panel';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { useOverlayBack } from '@/lib/overlay-back';
import { useIsPhone } from '@/lib/use-breakpoint';
import { deckDebugOn } from '@/playground/debug-overlay.js';
import { debugEffectiveOn, onDebugOverrideChange, setDebugOverride } from '@/playground/debug-prefs.js';

// The rows load with the sheet, not with the page: the Studio's picker, catalogs and option
// glyphs are ~8.5KB gz the Playground does not need until Deck settings opens. Pointing at or
// focusing the trigger starts the fetch, so the panel is usually there before the tap lands,
// and then it draws on the sheet's first frame (`lazyPanel`, not React.lazy, which suspends
// for a frame even when the module is loaded). A failed load shows the chunk-load card inside
// the sheet instead of taking the Playground down.
const PANEL = lazyPanel('Deck settings', () => import('./DeckConfigPanel').then((m) => m.DeckConfigPanel));
const loadPanel = () => void PANEL.load();

/**
 * Deck settings — the Playground's front-matter panel (DeckConfigPanel) inside a shadcn
 * Sheet. The rows are React and every select row is the Studio's `CatalogSelect`, so the
 * Playground's pickers open on the same `Auto — <resolved>` head, carry the same option
 * previews and close on the same outside tap as the Studio's Settings. Writes flow
 * setSource → editor → onChange → live re-render. The Sheet remounts its body on each
 * open, so the panel reads the deck fresh every time.
 *
 * Every field is drawn, `theme` included. The theme row used to be withheld here on the
 * reasoning that "the top-bar palette picker owns theme on this surface" — true only while
 * that picker is on screen, and `PaletteControls` hides it below `lg` (its `compact`
 * prop), so on a phone the surface had no theme control anywhere. The row writes the
 * deck's own `theme:`, the authoritative axis (`@/lib/deck-theme`), and its Auto head
 * clears the key and hands the deck back to the site palette.
 *
 * The trigger icon tints when the deck carries non-theme managed front matter
 * (readFrontMatter().configured). `theme` stays out of that cue: it is excluded at the reader.
 */
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

	// modal={false} + overlay={false}: a non-modal side sheet over a LIVE preview.
	// A modal sheet engages react-remove-scroll's body scroll-lock, which lingers on
	// iOS Safari after close and freezes the preview until focus changes (see
	// engineering/gotchas.md). Non-modal keeps the preview scrollable and lets you
	// watch it update as you change front matter.
	return (
		<Sheet open={open} onOpenChange={setOpen} modal={false}>
			<SheetTrigger asChild>
				<Button id="pg-setup-trigger" variant="outline" size="sm" onPointerEnter={loadPanel} onFocus={loadPanel} aria-label="Deck settings" title="Deck settings — look, format and front matter for this deck">
					<Settings className={configured ? 'text-primary' : undefined} />
					<span className="hidden sm:inline">Deck settings</span>
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
				<div className="deck-config px-4 pb-4">
					{/* What an un-pinned deck renders with, so the Theme row's Auto head can name it:
					    the site palette lives on `<html data-palette>` (site-chrome.ts). */}
					<PanelLoader panel={PANEL} shell={(body) => body ?? <p className="db-settings-note">Loading deck settings…</p>}>
						{(DeckConfigPanel) => (
							<DeckConfigPanel getSource={getSource} setSource={setSource} palettes={palettes} finishes={finishes} getDefaultTheme={() => document.documentElement.getAttribute('data-palette') || ''} />
						)}
					</PanelLoader>
				</div>
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
