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
     *   - 'none'     NO DOCK AT ALL — see the warning below.
 *
 *  Exit stays reachable in every style but 'none' (an icon button, always inside
 *  `.vetrina-caption`).
 *
 *  'none' is for a host driving the stage as a bare POINTER LAYER: no beats, no narration, no
 *  `awaitUser`, and the host's own chrome owning the exit. Lattice's Guide rung is the case it
 *  exists for — a cursor that points at what a narrator is currently saying, inside a Present
 *  overlay that already has its own controls, where a second Exit button and a "click anywhere
 *  to take over" hint would be chrome competing with chrome. Do NOT use it for a walkthrough:
 *  with no dock there is no Exit, and stranding a viewer inside a running tour is the one thing
 *  this library will not do. */
    caption?: 'bar' | 'split' | 'scrim' | 'progress' | 'none';
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
    /** Silence a cue (never replace one with a callback). The four DEICTIC cues are here for the
     *  same reason `circle` is: a host that wants the cursor's TRAVEL as guidance but not the ink
     *  drawn over its content should be able to say so without giving up the gesture API. */
    cues?: Partial<Record<'anticipate' | 'press' | 'circle' | 'intro' | 'underline' | 'wash' | 'bracket' | 'tap', false>>;
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
    caption: 'bar' | 'split' | 'scrim' | 'progress' | 'none';
    motion: 'full' | 'legible' | 'still' | 'system';
    silenced: Set<string>;
}
/** Resolve a `Theme` (validating colors) into concrete tokens + pacing + shape for the stage. */
export declare function resolveTheme(theme?: Theme): ResolvedTheme;
