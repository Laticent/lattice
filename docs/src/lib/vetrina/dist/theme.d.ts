export type Color = string;
export type VtToken = 'accent' | 'cursorFill' | 'cursorStroke' | 'captionBg' | 'captionInk' | 'captionHint' | 'captionScrim' | 'ringHalo' | 'glowHalo' | 'tickHalo' | 'exitBg' | 'exitInk';
export interface Theme {
    /** Brand hue -> --vt-accent (validated; the co-stroke adapts so it can't go invisible). */
    accent?: Color;
    /** Curated, guaranteed-followable pacing (default 'moderate'). Not a free numeric. */
    speed?: 'slow' | 'moderate' | 'fast';
    /** Curated cursor SHAPE (default 'arrow'). */
    pointer?: 'arrow' | 'ring' | 'dot';
    /** Which edge the narration dock sits at (default 'bottom'). A curated choice, not a
     *  free coordinate; shape (corner radius) is the CSS `--vt-caption-radius` token. */
    placement?: 'top' | 'bottom';
    /** The narration dock STYLE — a curated set, not free CSS (default 'bar'):
     *   - 'bar'      full-width caption bar, Exit as an icon (the safe, universal default);
     *   - 'split'    a clean text-only caption + a separate Exit chip in the corner;
     *   - 'scrim'    no box — a film-subtitle over a soft gradient (most premium; best over
     *                busy/dark content, which is why the Studio demo opts into it);
     *   - 'progress' the bar with a beat-progress ring in place of the live dot.
     *  Exit stays reachable in every style (an icon button, always inside `.vetrina-caption`). */
    caption?: 'bar' | 'split' | 'scrim' | 'progress';
    /** How to honor motion preference (default 'system'):
     *   - 'system'  read `prefers-reduced-motion`: reduce → 'legible', else → 'full';
     *   - 'full'    play everything, ignore the OS preference;
     *   - 'legible' suppress VESTIBULAR motion (cursor glides, expanding rings, the orbit
     *               circle, the translate/rotate wave, drag sweeps) but KEEP the content
     *               cadence a viewer reads by — the typing reveal, caption cross-fades, and
     *               full reading settles — plus a motion-safe in-place greeting;
     *   - 'still'   collapse EVERYTHING to instant (the maximal-suppression escape hatch).
     *  The default resolves a reduced-motion device to 'legible', never 'still': WCAG 2.3.3 /
     *  Apple HIG target vestibular triggers (sweeps, parallax, spin, zoom), not typing or a
     *  cross-fade — so the demo stays watchable instead of flashing past in an instant blur. */
    motion?: 'full' | 'legible' | 'still' | 'system';
    /** Silence a cue (never replace one with a callback). */
    cues?: Partial<Record<'anticipate' | 'press' | 'circle' | 'intro', false>>;
    /** Escape hatch: set any --vt-* token value directly, in JS. */
    tokens?: Partial<Record<VtToken, Color>>;
    /** Where the overlay mounts (default: the root's document body). */
    portalRoot?: HTMLElement;
    /** Stacking context for hosts that go higher than the default. */
    zIndex?: number;
}
/** What the stage consumes - a Theme resolved to concrete token values + pacing + shape. */
export interface ResolvedTheme {
    tokens: Record<string, string>;
    pace: number;
    pointer: 'arrow' | 'ring' | 'dot';
    placement: 'top' | 'bottom';
    caption: 'bar' | 'split' | 'scrim' | 'progress';
    motion: 'full' | 'legible' | 'still' | 'system';
    silenced: Set<string>;
}
/** Resolve a `Theme` (validating colors) into concrete tokens + pacing + shape for the stage. */
export declare function resolveTheme(theme?: Theme): ResolvedTheme;
