// Tri-state provenance for inherited per-slide axes.
//
// Deck-wide `class:` / `finish:` / `mode:` front-matter tokens are APPENDED to every
// section (lib/integrations/markdown-it/plugins.js `deckClassPropagate`), with a
// per-slide finish/mode OVERRIDING rather than stacking. So a per-slide axis is never
// a simple on/off: removing `dark` from a slide whose deck says `class: dark` does
// nothing (it re-appends), and "off" for finish/mode is an explicit OPT-OUT token
// (`finish-none` / `boardroom`), not an absence. This module computes the effective
// state — Inherited (deck) / On (this slide) / Off — and the writes that realize each,
// so the drawer's controls tell the truth. Pure; mirrors the engine's resolution.
// See engineering/decisions/2026-07-03-slide-context-editor.md §6.

import { getFrontMatter } from './front-matter';
import { getClassTokens, setClassTokens } from './slide-directives';

export type AxisState = 'inherited' | 'on' | 'off';
export type Provenance = {
	/** Effective state for the slide. */
	state: AxisState;
	/** The active value (finish/mode name) when on/inherited; undefined for `dark`. */
	value?: string;
	/** The deck-wide value this slide inherits or overrides, if any. */
	deckValue?: string;
	/** True when the axis has a deck-wide default in play (so the UI can label it). */
	inheritable: boolean;
};

/** Deck-wide tokens that propagate onto every slide. */
export function deckDefaults(source: string): { classTokens: string[]; finish: string | null; mode: string | null } {
	const classTokens = (getFrontMatter(source, 'class') || '').trim().split(/\s+/).filter(Boolean);
	const finish = (getFrontMatter(source, 'finish') || '').trim() || null;
	const mode = (getFrontMatter(source, 'mode') || '').trim() || null;
	return { classTokens, finish, mode };
}

// A per-slide finish selector — mirrors the engine's isFinishVariantClass
// (resolve-finish.js): `finish-<name>` EXCEPT the `finish-none` opt-out and the
// `finish-preview` specimen (both of which never activate a real backdrop).
const isFinishToken = (t: string) => /^finish-(.+)$/.test(t) && t !== 'finish-none' && t !== 'finish-preview';
const finishName = (t: string) => (t.match(/^finish-(.+)$/)?.[1] ?? '');

// ── canvas (light / dark) ─────────────────────────────────────────────────────
// The per-slide color canvas is one mutually-exclusive axis with THREE states:
// Auto (no per-slide token — follows the deck's `class:` / the site), Light
// (`_class: light`), or Dark (`_class: dark`). Unlike the other axes, a per-slide
// canvas token ALWAYS wins — even a `light` slide inside a `class: dark` deck, since
// `section.light` flips the canvas regardless (base.modifiers.css). That override is
// the whole point: someone reading in dark can still pin one slide to the light
// palette. So there is no "redundant/inherited-only" clamp here — Light and Dark are
// always real choices, and Auto reports what it would inherit.

export type Canvas = 'auto' | 'light' | 'dark';

/** The slide's own canvas pin plus what Auto would inherit from the deck.
 *  `state` is the EXPLICIT per-slide pin (`light`/`dark`) or `auto` (no pin);
 *  `deckValue` is the deck-wide canvas (`class: dark`/`light`) an Auto slide follows,
 *  or undefined when the deck pins neither (then Auto follows the site light/dark). */
export function canvasProvenance(chunk: string, source: string): { state: Canvas; deckValue?: Canvas } {
	const tokens = getClassTokens(chunk);
	const deck = deckDefaults(source).classTokens;
	const deckValue: Canvas | undefined = deck.includes('dark') ? 'dark' : deck.includes('light') ? 'light' : undefined;
	if (tokens.includes('dark')) return { state: 'dark', deckValue };
	if (tokens.includes('light')) return { state: 'light', deckValue };
	return { state: 'auto', deckValue };
}

/** Pin the slide's canvas. `auto` clears both tokens (the slide follows the deck /
 *  site again); `light` / `dark` set that token, clearing the other (they're one
 *  mutually-exclusive axis). */
export function setCanvas(chunk: string, value: Canvas): string {
	const tokens = getClassTokens(chunk).filter((t) => t !== 'dark' && t !== 'light');
	if (value !== 'auto') tokens.push(value);
	return setClassTokens(chunk, tokens);
}

// ── finish ───────────────────────────────────────────────────────────────────

export function finishProvenance(chunk: string, source: string): Provenance {
	const tokens = getClassTokens(chunk);
	const own = tokens.find(isFinishToken);
	const deckFinish = deckDefaults(source).finish;
	const deckValue = deckFinish && deckFinish !== 'none' ? deckFinish : undefined;
	const inheritable = deckValue !== undefined;
	if (own) return { state: 'on', value: finishName(own), deckValue, inheritable };
	if (tokens.includes('finish-none')) return { state: 'off', deckValue, inheritable };
	if (deckValue) return { state: 'inherited', value: deckValue, deckValue, inheritable: true };
	return { state: 'off', inheritable: false };
}

/**
 * Set the slide's finish. `name` = a finish name → `finish-<name>` (the engine
 * implies the bare `finish` compositor); `'none'` → the `finish-none` opt-out;
 * `null` → inherit (remove every per-slide finish token). All existing `finish*`
 * tokens are cleared first so finishes never stack.
 */
export function setFinish(chunk: string, name: string | null): string {
	const kept = getClassTokens(chunk).filter((t) => !/^finish(-.*)?$/.test(t));
	if (name === 'none') kept.push('finish-none');
	else if (name) kept.push(`finish-${name}`);
	return setClassTokens(chunk, kept);
}

// ── mode ─────────────────────────────────────────────────────────────────────
// Per-slide mode tokens (resolve-mode.js MODE_TOKENS): `sketch`, `sketch-clean-body`,
// and the `boardroom` clean opt-out.

const MODE_TOKENS = ['sketch', 'sketch-clean-body', 'boardroom'];
const isModeToken = (t: string) => MODE_TOKENS.includes(t);

export function modeProvenance(chunk: string, source: string): Provenance {
	const tokens = getClassTokens(chunk);
	const deckMode = deckDefaults(source).mode;
	const deckValue = deckMode && deckMode !== 'boardroom' ? deckMode : undefined;
	const inheritable = deckValue !== undefined;
	if (tokens.includes('boardroom')) return { state: 'off', deckValue, inheritable };
	const own = tokens.find((t) => isModeToken(t) && t !== 'boardroom');
	// `sketch-clean` emits BOTH `sketch` and `sketch-clean-body`; token order isn't
	// guaranteed, so key the value on the clean marker, not on which token comes first.
	if (own) return { state: 'on', value: tokens.includes('sketch-clean-body') ? 'sketch-clean' : 'sketch', deckValue, inheritable };
	if (deckValue) return { state: 'inherited', value: deckValue, deckValue, inheritable: true };
	return { state: 'off', inheritable: false };
}

/** Set the slide's mode. `'sketch'` / `'sketch-clean'` → the mode token(s);
 *  `'boardroom'` → the clean opt-out; `null` → inherit (remove mode tokens). */
export function setMode(chunk: string, mode: 'sketch' | 'sketch-clean' | 'boardroom' | null): string {
	const kept = getClassTokens(chunk).filter((t) => !isModeToken(t) && t !== 'sketch-clean-body');
	if (mode === 'sketch') kept.push('sketch');
	else if (mode === 'sketch-clean') kept.push('sketch', 'sketch-clean-body');
	else if (mode === 'boardroom') kept.push('boardroom');
	return setClassTokens(chunk, kept);
}

// ── stamp / tone STYLE (shape) ─────────────────────────────────────────────────
// The deck `stamp:` / `tone:` front-matter register picks a deck-wide SHAPE for the
// state / tone markers (resolve-stamp.js / resolve-tone-style.js), appended onto every
// section by deckClassPropagate; a per-slide `stamp-<name>` / `tone-<style>` class token
// OVERRIDES. There is no opt-out token — the no-config shape IS the uniform default
// (`tab` / `rail`) — so provenance is just inherited (deck) / on (this slide) / off
// (falls back to the default). Tone STYLE tokens share the `tone-` prefix with the tone
// SEMANTIC tokens, so callers pass the known style-token set (vocab.toneStyles) to
// disambiguate; stamp-style tokens (`stamp-*`) never collide with a state marker.

const isStampStyleToken = (t: string) => /^stamp-.+$/.test(t);

/** Effective stamp-STYLE (shape) state for a slide. `value` is the bare style name. */
export function stampStyleProvenance(chunk: string, source: string): Provenance {
	const own = getClassTokens(chunk).find(isStampStyleToken);
	const deckValue = (getFrontMatter(source, 'stamp') || '').trim() || undefined;
	const inheritable = deckValue !== undefined;
	if (own) return { state: 'on', value: own.slice('stamp-'.length), deckValue, inheritable };
	if (deckValue) return { state: 'inherited', value: deckValue, deckValue, inheritable: true };
	return { state: 'off', inheritable: false };
}

/** Set the slide's stamp style. `name` → `stamp-<name>`; `null` → inherit (clear it).
 *  Existing stamp-style tokens are cleared first so a style never stacks. */
export function setStampStyle(chunk: string, name: string | null): string {
	const kept = getClassTokens(chunk).filter((t) => !isStampStyleToken(t));
	if (name) kept.push(`stamp-${name}`);
	return setClassTokens(chunk, kept);
}

/** Effective tone-STYLE (shape) state. `styleTokens` = the known `tone-<style>` set
 *  (vocab.toneStyles), needed to tell a style token from a semantic tone token. */
export function toneStyleProvenance(chunk: string, source: string, styleTokens: readonly string[]): Provenance {
	const set = new Set(styleTokens);
	const own = getClassTokens(chunk).find((t) => set.has(t));
	const deckValue = (getFrontMatter(source, 'tone') || '').trim() || undefined;
	const inheritable = deckValue !== undefined;
	if (own) return { state: 'on', value: own.slice('tone-'.length), deckValue, inheritable };
	if (deckValue) return { state: 'inherited', value: deckValue, deckValue, inheritable: true };
	return { state: 'off', inheritable: false };
}

/** Set the slide's tone style. `name` → `tone-<name>`; `null` → inherit. Clears only
 *  the KNOWN style tokens (never a semantic `tone-pass` etc.). */
export function setToneStyle(chunk: string, name: string | null, styleTokens: readonly string[]): string {
	const set = new Set(styleTokens);
	const kept = getClassTokens(chunk).filter((t) => !set.has(t));
	if (name) kept.push(`tone-${name}`);
	return setClassTokens(chunk, kept);
}

// ── spectrum (white-label brand bar) ───────────────────────────────────────────
// The deck `spectrum:` register (resolve-spectrum.js) controls the brand bar deck-wide;
// a per-slide `spectrum-off` / `spectrum-solid` token overrides. Only off / solid carry a
// token — `on` (the rainbow) is the default and the absence of a token, so there is no
// per-slide "back to rainbow" over a deck off/solid (finding documented in the design
// doc); provenance is inherited (deck off/solid) / on (this slide) / off (rainbow default).

// STYLE tokens ONLY (resolve-spectrum.js SPECTRUM_TOKENS) — exact set, so this never matches
// the sibling `spectrum-edge-*` / `spectrum-card` tokens.
const SPECTRUM_STYLE_VALUES = ['solid', 'duo', 'mono', 'off'];
const isSpectrumToken = (t: string) => /^spectrum-(solid|duo|mono|off)$/.test(t);

/** Effective brand-bar STYLE state for a slide. `value` is the bare name (solid/duo/mono/off). */
export function spectrumProvenance(chunk: string, source: string): Provenance {
	const own = getClassTokens(chunk).find(isSpectrumToken);
	const deck = (getFrontMatter(source, 'spectrum') || '').trim().toLowerCase();
	const deckValue = SPECTRUM_STYLE_VALUES.includes(deck) ? deck : undefined; // `on`/unset → rainbow default
	const inheritable = deckValue !== undefined;
	if (own) return { state: 'on', value: own.slice('spectrum-'.length), deckValue, inheritable };
	if (deckValue) return { state: 'inherited', value: deckValue, deckValue, inheritable: true };
	return { state: 'off', inheritable: false };
}

/** Set the slide's brand-bar STYLE. A style name (solid/duo/mono/off) → the token; `null` →
 *  inherit / rainbow (clear the per-slide token). Existing STYLE tokens are cleared first. */
export function setSpectrum(chunk: string, name: string | null): string {
	const kept = getClassTokens(chunk).filter((t) => !isSpectrumToken(t));
	if (name && SPECTRUM_STYLE_VALUES.includes(name)) kept.push(`spectrum-${name}`);
	return setClassTokens(chunk, kept);
}

// ── spectrum-edge (bar placement) / rule (heading underline) / eyebrow (kicker) ────────────
// Three sibling "override" axes: a per-slide token (`spectrum-edge-<v>` / `rule-<v>` /
// `eyebrow-<v>`) overrides the deck register; the DEFAULT value (top/auto/plain) is the
// no-token absence. So provenance is inherited (deck non-default) / on (this slide) / off
// (the default). A shared helper keeps the three in step. The `none`/`off` VALUE is a real
// token (an explicit choice), distinct from the `off` STATE (the untouched default).

function overrideProvenance(chunk: string, source: string, deckKey: string, prefix: string, values: readonly string[], deckDefault: string): Provenance {
	const own = getClassTokens(chunk).find((t) => t.startsWith(prefix) && values.includes(t.slice(prefix.length)));
	const deck = (getFrontMatter(source, deckKey) || '').trim().toLowerCase();
	const deckValue = deck && deck !== deckDefault && values.includes(deck) ? deck : undefined;
	const inheritable = deckValue !== undefined;
	if (own) return { state: 'on', value: own.slice(prefix.length), deckValue, inheritable };
	if (deckValue) return { state: 'inherited', value: deckValue, deckValue, inheritable: true };
	return { state: 'off', inheritable: false };
}

function setOverride(chunk: string, prefix: string, values: readonly string[], name: string | null): string {
	const kept = getClassTokens(chunk).filter((t) => !(t.startsWith(prefix) && values.includes(t.slice(prefix.length))));
	if (name && values.includes(name)) kept.push(`${prefix}${name}`);
	return setClassTokens(chunk, kept);
}

const EDGE_VALUES = ['left', 'right', 'bottom', 'off'];
export function spectrumEdgeProvenance(chunk: string, source: string): Provenance {
	return overrideProvenance(chunk, source, 'spectrum-edge', 'spectrum-edge-', EDGE_VALUES, 'top');
}
export function setSpectrumEdge(chunk: string, name: string | null): string {
	return setOverride(chunk, 'spectrum-edge-', EDGE_VALUES, name);
}

const RULE_VALUES = ['full', 'short', 'accent', 'none'];
export function ruleProvenance(chunk: string, source: string): Provenance {
	return overrideProvenance(chunk, source, 'rule', 'rule-', RULE_VALUES, 'auto');
}
export function setRule(chunk: string, name: string | null): string {
	return setOverride(chunk, 'rule-', RULE_VALUES, name);
}

const EYEBROW_VALUES = ['dot', 'bar', 'arrow', 'underline'];
export function eyebrowProvenance(chunk: string, source: string): Provenance {
	return overrideProvenance(chunk, source, 'eyebrow', 'eyebrow-', EYEBROW_VALUES, 'plain');
}
export function setEyebrow(chunk: string, name: string | null): string {
	return setOverride(chunk, 'eyebrow-', EYEBROW_VALUES, name);
}

// The deck key is `headline` but the per-slide token prefix is `head-` (head-left/center/right);
// overrideProvenance takes the two separately, so the mismatch is fine.
const HEADLINE_VALUES = ['left', 'center'];
export function headlineProvenance(chunk: string, source: string): Provenance {
	return overrideProvenance(chunk, source, 'headline', 'head-', HEADLINE_VALUES, 'auto');
}
export function setHeadline(chunk: string, name: string | null): string {
	return setOverride(chunk, 'head-', HEADLINE_VALUES, name);
}

// ── spectrum-card (card rail STYLE) ──────────────────────────────────────────────────────────
// An INDEPENDENT card-rail accent, tunable orthogonally to the section bar. Deck values:
// off (default, no rail) / auto (follow the bar) / solid / duo / mono / rainbow. The per-slide
// token map is irregular: `auto` → `spectrum-card` (bare), the pins → `spectrum-card-<v>`, and
// the opt-out → `spectrum-card-off`. A per-slide token overrides the deck; provenance is
// inherited (deck non-off) / on (this slide) / off (default or opted-out).
const CARD_STYLE_VALUES = ['auto', 'solid', 'duo', 'mono', 'rainbow', 'off'];
/** token → bare card-STYLE value, or null if it isn't a card-STYLE token (excludes the
 *  sibling `spectrum-card-edge-*` placement tokens). */
function cardTokenToValue(t: string): string | null {
	if (t === 'spectrum-card') return 'auto';
	if (t === 'spectrum-card-off') return 'off';
	const m = /^spectrum-card-(solid|duo|mono|rainbow)$/.exec(t);
	return m ? m[1] : null;
}
/** bare value → its per-slide token (auto → the bare `spectrum-card`), or null for unknown. */
function cardValueToToken(v: string): string | null {
	if (v === 'auto') return 'spectrum-card';
	if (v === 'off') return 'spectrum-card-off';
	return /^(solid|duo|mono|rainbow)$/.test(v) ? `spectrum-card-${v}` : null;
}
const isSpectrumCardToken = (t: string) => cardTokenToValue(t) !== null;

export function spectrumCardProvenance(chunk: string, source: string): Provenance {
	const ownToken = getClassTokens(chunk).find(isSpectrumCardToken);
	const ownValue = ownToken ? cardTokenToValue(ownToken) : undefined;
	const deck = (getFrontMatter(source, 'spectrum-card') || '').trim().toLowerCase();
	const deckValue = deck && deck !== 'off' && CARD_STYLE_VALUES.includes(deck) ? deck : undefined; // off/unset → no rail
	const inheritable = deckValue !== undefined;
	if (ownValue === 'off') return { state: 'off', deckValue, inheritable };
	if (ownValue) return { state: 'on', value: ownValue, deckValue, inheritable };
	if (deckValue) return { state: 'inherited', value: deckValue, deckValue, inheritable: true };
	return { state: 'off', inheritable: false };
}

/** Set the slide's card-rail STYLE. A value (auto/solid/duo/mono/rainbow) → its token;
 *  `'off'` → the `spectrum-card-off` opt-out; `null` → inherit (clear any card-STYLE token). */
export function setSpectrumCard(chunk: string, value: string | null): string {
	const kept = getClassTokens(chunk).filter((t) => !isSpectrumCardToken(t));
	const token = value ? cardValueToToken(value) : null;
	if (token) kept.push(token);
	return setClassTokens(chunk, kept);
}

// ── spectrum-card-edge (card rail PLACEMENT) ─────────────────────────────────────────────────
// A uniform-prefix override axis (like spectrum-edge): `spectrum-card-edge-<v>` overrides the
// deck; `left` is the no-token default.
const CARD_EDGE_VALUES = ['top', 'right', 'bottom'];
export function spectrumCardEdgeProvenance(chunk: string, source: string): Provenance {
	return overrideProvenance(chunk, source, 'spectrum-card-edge', 'spectrum-card-edge-', CARD_EDGE_VALUES, 'left');
}
export function setSpectrumCardEdge(chunk: string, name: string | null): string {
	return setOverride(chunk, 'spectrum-card-edge-', CARD_EDGE_VALUES, name);
}

// ── spectrum-trim (structural accents) ──────────────────────────────────────────────────────
// Three tiers with an explicit opt-out token: deck `spectrum-trim: on|restrained` appends the
// matching token to every slide; a per-slide token opts one IN at a tier, `spectrum-trim-off`
// OUT of a deck-wide setting. The token map is irregular (`on` → bare `spectrum-trim`), so it
// mirrors the card-STYLE shape. Provenance: inherited (deck non-off) / on (this slide) / off.
function trimTokenToValue(t: string): string | null {
	if (t === 'spectrum-trim') return 'on';
	if (t === 'spectrum-trim-off') return 'off';
	if (t === 'spectrum-trim-restrained') return 'restrained';
	return null;
}
function trimValueToToken(v: string): string | null {
	if (v === 'on') return 'spectrum-trim';
	if (v === 'off') return 'spectrum-trim-off';
	if (v === 'restrained') return 'spectrum-trim-restrained';
	return null;
}
const isSpectrumTrimToken = (t: string) => trimTokenToValue(t) !== null;

export function spectrumTrimProvenance(chunk: string, source: string): Provenance {
	const ownToken = getClassTokens(chunk).find(isSpectrumTrimToken);
	const ownValue = ownToken ? trimTokenToValue(ownToken) : undefined;
	const deck = (getFrontMatter(source, 'spectrum-trim') || '').trim().toLowerCase();
	const deckValue = deck === 'on' || deck === 'restrained' ? deck : undefined; // off/unset → quiet
	const inheritable = deckValue !== undefined;
	if (ownValue === 'off') return { state: 'off', deckValue, inheritable };
	if (ownValue) return { state: 'on', value: ownValue, deckValue, inheritable };
	if (deckValue) return { state: 'inherited', value: deckValue, deckValue, inheritable: true };
	return { state: 'off', inheritable: false };
}

/** Set the slide's structural trim. `'on'`/`'restrained'` → the tier token; `'off'` → the
 *  `spectrum-trim-off` opt-out; `null` → inherit (clear any trim token). */
export function setSpectrumTrim(chunk: string, value: string | null): string {
	const kept = getClassTokens(chunk).filter((t) => !isSpectrumTrimToken(t));
	const token = value ? trimValueToToken(value) : null;
	if (token) kept.push(token);
	return setClassTokens(chunk, kept);
}

// ── motion (chart animation) — THREE independent axes ────────────────────────────────────────────
// Full parity with the deck front matter (Play=`motion:`, Style=`motion-style:`, Speed=`motion-speed:`)
// and the slide classes (`motion-on/off`, `motion-<style>`, `motion-<speed>`). Each axis overrides the
// deck default for one slide; a slide's style/speed token also implies Play on (resolveMotion does the
// same). Preview-only. The legacy `chart-anima` is honored as `motion-on` + `motion-build` and rewritten
// away whenever motion is set here. Each axis mirrors the tri-state provenance shape.
const MOTION_STYLE_VALUES = ['build', 'together', 'rise'];
const MOTION_SPEED_VALUES = ['auto', 'slow', 'normal', 'fast'];
const isStyleToken = (t: string) => /^motion-(build|together|rise)$/.test(t);
const isSpeedToken = (t: string) => /^motion-(auto|slow|normal|fast)$/.test(t);
const isPlayToken = (t: string) => t === 'motion-on' || t === 'motion-off';
const isAnyMotionToken = (t: string) => isPlayToken(t) || isStyleToken(t) || isSpeedToken(t) || t === 'chart-anima';

/** PLAY axis (on / off / inherit). A slide style/speed token — or the legacy `chart-anima` — implies on. */
export function motionPlayProvenance(chunk: string, source: string): Provenance {
	const tokens = getClassTokens(chunk);
	const deck = (getFrontMatter(source, 'motion') || '').trim().toLowerCase();
	const deckValue = deck === 'on' || deck === 'off' ? deck : undefined;
	const inheritable = deckValue !== undefined;
	if (tokens.includes('motion-off')) return { state: 'off', value: 'off', deckValue, inheritable };
	if (tokens.includes('motion-on') || tokens.includes('chart-anima') || tokens.some(isStyleToken) || tokens.some(isSpeedToken))
		return { state: 'on', value: 'on', deckValue, inheritable };
	if (deckValue) return { state: 'inherited', value: deckValue, deckValue, inheritable: true };
	return { state: 'off', inheritable: false };
}

/** STYLE axis (build / together / rise / inherit). */
export function motionStyleProvenance(chunk: string, source: string): Provenance {
	const tokens = getClassTokens(chunk);
	const own = tokens.find(isStyleToken)?.slice('motion-'.length) ?? (tokens.includes('chart-anima') ? 'build' : undefined);
	const deck = (getFrontMatter(source, 'motion-style') || '').trim().toLowerCase();
	const deckValue = MOTION_STYLE_VALUES.includes(deck) ? deck : undefined;
	const inheritable = deckValue !== undefined;
	if (own) return { state: 'on', value: own, deckValue, inheritable };
	if (deckValue) return { state: 'inherited', value: deckValue, deckValue, inheritable: true };
	return { state: 'off', value: 'build', inheritable: false }; // build is the built-in default
}

/** SPEED axis (auto / slow / normal / fast / inherit). */
export function motionSpeedProvenance(chunk: string, source: string): Provenance {
	const own = getClassTokens(chunk).find(isSpeedToken)?.slice('motion-'.length);
	const deck = (getFrontMatter(source, 'motion-speed') || '').trim().toLowerCase();
	const deckValue = MOTION_SPEED_VALUES.includes(deck) ? deck : undefined;
	const inheritable = deckValue !== undefined;
	if (own) return { state: 'on', value: own, deckValue, inheritable };
	if (deckValue) return { state: 'inherited', value: deckValue, deckValue, inheritable: true };
	return { state: 'off', value: 'auto', inheritable: false }; // auto is the built-in default
}

/** Set the slide's PLAY. `'on'`/`'off'` → the token; `null` → inherit (clear it). Clears legacy chart-anima. */
export function setMotionPlay(chunk: string, value: 'on' | 'off' | null): string {
	const kept = getClassTokens(chunk).filter((t) => !isPlayToken(t) && t !== 'chart-anima');
	if (value) kept.push(`motion-${value}`);
	return setClassTokens(chunk, kept);
}
/** Set the slide's STYLE. A style → `motion-<style>`; `null` → inherit. Clears legacy chart-anima. */
export function setMotionStyle(chunk: string, value: string | null): string {
	const kept = getClassTokens(chunk).filter((t) => !isStyleToken(t) && t !== 'chart-anima');
	if (value && MOTION_STYLE_VALUES.includes(value)) kept.push(`motion-${value}`);
	return setClassTokens(chunk, kept);
}
/** Set the slide's SPEED. A speed → `motion-<speed>`; `null` → inherit. */
export function setMotionSpeed(chunk: string, value: string | null): string {
	const kept = getClassTokens(chunk).filter((t) => !isSpeedToken(t));
	if (value && MOTION_SPEED_VALUES.includes(value)) kept.push(`motion-${value}`);
	return setClassTokens(chunk, kept);
}

/** True if the chunk carries any per-slide motion token — for the drawer's "reset" / dirty checks. */
export function hasMotionToken(chunk: string): boolean {
	return getClassTokens(chunk).some(isAnyMotionToken);
}
