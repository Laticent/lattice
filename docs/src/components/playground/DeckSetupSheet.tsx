import { Settings } from 'lucide-react';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { deckDebugOn } from '@/playground/debug-overlay.js';
import { debugEffectiveOn, onDebugOverrideChange, setDebugOverride } from '@/playground/debug-prefs.js';
import { CONFIG_PROFILES, createConfigPanel } from '@/playground/deck-config.js';

/**
 * Deck setup — the universal front-matter config panel (createConfigPanel,
 * shared with Workbench + Drawing Board) mounted inside a shadcn Sheet. The
 * panel itself is NOT rewritten: deck-config.js builds its own `.deck-config`
 * rows (styled by deck-config.css), and we host it in a React-owned div, calling
 * config.render() each time the Sheet opens. Writes flow setSource → editor →
 * onChange → live re-render, exactly as before.
 *
 * `noTheme` profile: the top-bar palette picker owns theme on this surface.
 * The trigger icon tints when the deck carries non-theme managed front matter
 * (readFrontMatter().configured) — the same cue the vanilla `is-set` class gave.
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
				fields: CONFIG_PROFILES.noTheme,
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
				<Button id="pg-setup-trigger" variant="outline" size="sm" aria-label="Deck setup" title="Deck setup — front matter for this deck">
					<Settings className={configured ? 'text-primary' : undefined} />
					<span className="hidden sm:inline">Deck setup</span>
				</Button>
			</SheetTrigger>
			<SheetContent overlay={false} className="w-[360px] max-w-[88vw] gap-0 overflow-y-auto">
				<SheetHeader>
					<SheetTitle className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
						Deck setup
					</SheetTitle>
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
