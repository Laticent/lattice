// Tri-state provenance for inherited per-slide axes.
//
// Deck-wide `class:` / `finish:` / `mode:` front-matter tokens are APPENDED to every
// section (lib/integrations/markdown-it/plugins.js `deckClassPropagate`), with a
// per-slide finish/mode OVERRIDING rather than stacking. So a per-slide axis is never
// a simple on/off: removing `dark` from a slide whose deck says `class: dark` does
// nothing (it re-appends), and "off" for finish/mode is an explicit OPT-OUT token
// (`no-finish` / `boardroom`), not an absence. This module computes the effective
// state — Auto (from the deck) / On (this slide) / Off — and the writes that realize each,
// so the drawer's controls tell the truth. Pure; mirrors the engine's resolution.
// See engineering/decisions/2026-07-03-slide-context-editor.md §6.

import { registerToken as switchToken, registerValue as switchValueOf } from '../../../../lib/core/switches.mjs';
import { getFrontMatter } from '../../lib/front-matter';
import { DEFAULT_MARKS, MARKS_NAMES } from '../../lib/marks-words';
import { getClassTokens, setClassTokens } from '../../lib/slide-directives';
import { type BackdropAxis, backdropValues, type CardTagAxis, cardTagValues, deckBackdrop, deckCardTag, deckImageCard, type ImageCardAxis, imageCardWordOf } from './deck-axes';
import { registerValue } from './deck-preset';
import { parseMarksValue } from './marks-value';
import { renderedSpectrum, type SpectrumAxis, type SpectrumKey, spectrumClass, spectrumDefault, spectrumWordOf, spectrumWords } from './spectrum-keys';

// The deck-level tables, readers and writers live in deck-axes.ts (eager); re-exported so this module's
// importers keep one name to import from.
export * from './deck-axes';

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
	// What the engine renders: the deck's own `finish:` read by the engine's rule (a trailing
	// comment stripped, an empty or comment-only value falling through), else its preset's.
	// `none` reads as no deck finish, exactly as an absent key did.
	const deckFinish = registerValue(source, 'finish');
	const finish = deckFinish === 'none' ? null : deckFinish;
	const mode = (getFrontMatter(source, 'mode') || '').trim() || null;
	return { classTokens, finish, mode };
}

// A per-slide finish selector — mirrors the engine's isFinishVariantClass
// (resolve-finish.js): `finish-<name>` EXCEPT the `no-finish` opt-out and the
// `finish-preview` specimen (both of which never activate a real backdrop).
const isFinishToken = (t: string) => /^finish-(.+)$/.test(t) && t !== 'no-finish' && t !== 'finish-preview';
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
	if (tokens.includes('no-finish')) return { state: 'off', deckValue, inheritable };
	if (deckValue) return { state: 'inherited', value: deckValue, deckValue, inheritable: true };
	return { state: 'off', inheritable: false };
}

/**
 * Set the slide's finish. `name` = a finish name → `finish-<name>` (the engine
 * implies the bare `finish` compositor); `'none'` → the `no-finish` opt-out;
 * `null` → inherit (remove every per-slide finish token). All existing `finish*`
 * tokens are cleared first so finishes never stack.
 */
export function setFinish(chunk: string, name: string | null): string {
	const kept = getClassTokens(chunk).filter((t) => !/^finish(-.*)?$/.test(t));
	if (name === 'none') kept.push('no-finish');
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

// ── the three spectrum keys (`spectrum:`, `card-spectrum:`, `trim-spectrum:`), one AXIS at a time ──────
// Each key takes one word per axis (lib/core/resolve-spectrum.js), and a slide's own word overrides the
// deck's on THAT axis only. Every word has a slide class, the default's included (`spectrum-top`,
// `card-spectrum-regular`, `with-spectrum`): carried on a slide, the default's class returns it to the
// default inside a deck that set something else. The deck's word on an axis comes from the deck panel's own
// read (`registerValue`), so a preset's word counts as the deck's. Provenance: inherited (the deck's word is
// not the default) / on (this slide's word) / off (the default). One exception keeps the old meaning of an
// opt-out: a slide that turns the card stripe off, or sets the trim back to quiet, reads as off.
const OPT_OUT = new Set(['no-card-spectrum', 'trim-spectrum-quiet']);

export function spectrumAxisProvenance(chunk: string, source: string, key: SpectrumKey, axis: SpectrumAxis): Provenance {
	const own = getClassTokens(chunk).find((t) => spectrumWordOf(key, axis, t) !== null);
	const deck = renderedSpectrum(key, registerValue(source, key))[axis];
	const deckValue = deck && deck !== spectrumDefault(key, axis) ? deck : undefined;
	const inheritable = deckValue !== undefined;
	if (own && OPT_OUT.has(own)) return { state: 'off', deckValue, inheritable };
	if (own) return { state: 'on', value: spectrumWordOf(key, axis, own) as string, deckValue, inheritable };
	if (deckValue) return { state: 'inherited', value: deckValue, deckValue, inheritable: true };
	return { state: 'off', inheritable: false };
}

/** Set one axis of a spectrum key on this slide: a word → its class (the default's restore class
 *  included); `null` → inherit (clear the slide's class on that axis). */
export function setSpectrumAxis(chunk: string, key: SpectrumKey, axis: SpectrumAxis, word: string | null): string {
	const kept = getClassTokens(chunk).filter((t) => spectrumWordOf(key, axis, t) === null);
	if (word && spectrumWords(key, axis).includes(word)) kept.push(spectrumClass(key, axis, word));
	return setClassTokens(chunk, kept);
}

// ── rule (heading underline) / eyebrow (kicker) / headline ─────────────────────────────────────
// Sibling "override" axes: a per-slide token (`rule-<v>` / `eyebrow-<v>` / `head-<v>`) overrides
// the deck register. The DEFAULT value (auto/plain) renders with no token, and also has a RESTORE
// token (`rule-auto`, `eyebrow-plain`, `head-auto`)
// that a slide carries to return to it inside a deck that set another value (the engine evicts
// the deck's token for it). So provenance is inherited (deck non-default) / on (this slide) /
// off (the default). A shared helper keeps the three in step. The `none`/`off` VALUE is a real
// token (an explicit choice), distinct from the `off` STATE (the untouched default).

// The value ↔ class map is the shared one (lib/core/switches.mjs `registerToken`): an off value is a
// SWITCH class (`no-heading-rule`), every other value `<prefix><value>`.
const overrideValueOf = (deckKey: string, prefix: string, values: readonly string[], t: string) => switchValueOf(deckKey, t, values, prefix);

function overrideProvenance(chunk: string, source: string, deckKey: string, prefix: string, values: readonly string[], deckDefault: string): Provenance {
	const own = getClassTokens(chunk).find((t) => overrideValueOf(deckKey, prefix, values, t) !== null);
	const deck = (registerValue(source, deckKey) || '').trim().toLowerCase();
	const deckValue = deck && deck !== deckDefault && values.includes(deck) ? deck : undefined;
	const inheritable = deckValue !== undefined;
	if (own) return { state: 'on', value: overrideValueOf(deckKey, prefix, values, own) as string, deckValue, inheritable };
	if (deckValue) return { state: 'inherited', value: deckValue, deckValue, inheritable: true };
	return { state: 'off', inheritable: false };
}

function setOverride(chunk: string, deckKey: string, prefix: string, values: readonly string[], name: string | null): string {
	const kept = getClassTokens(chunk).filter((t) => overrideValueOf(deckKey, prefix, values, t) === null);
	if (name && values.includes(name)) kept.push(switchToken(deckKey, name, prefix));
	return setClassTokens(chunk, kept);
}

const RULE_VALUES = ['auto', 'full', 'short', 'accent', 'none'];
export function ruleProvenance(chunk: string, source: string): Provenance {
	return overrideProvenance(chunk, source, 'rule', 'rule-', RULE_VALUES, 'auto');
}
export function setRule(chunk: string, name: string | null): string {
	return setOverride(chunk, 'rule', 'rule-', RULE_VALUES, name);
}

// The chart finish (resolve-marks.js). A look with no absent state, so the deck default is
// `pigment` (DEFAULT_MARKS) and every value, the default included, is a real per-slide token:
// a slide inside a `tone` deck can ask for `pigment`.
const MARKS_VALUES: readonly string[] = [...MARKS_NAMES];
const LEGACY_MARKS_PREFIX = 'chart-finish-';
export function marksProvenance(chunk: string, source: string): Provenance {
	// The deck value carries one word per axis (`tone vivid`); only its finish word is this control's, so it is
	// read by axis rather than through registerValue, which takes a two-word value for none.
	// A slide or deck still on the old `chart-finish` spelling is read through it (resolve-marks.js renders it too).
	const own = getClassTokens(chunk)
		.map((t) => (t.startsWith(LEGACY_MARKS_PREFIX) ? `marks-${t.slice(LEGACY_MARKS_PREFIX.length)}` : t))
		.find((t) => t.startsWith('marks-') && MARKS_VALUES.includes(t.slice('marks-'.length)));
	const deck = parseMarksValue(getFrontMatter(source, 'marks') || getFrontMatter(source, 'chart-finish')).finish;
	const deckValue = deck && deck !== DEFAULT_MARKS ? deck : undefined;
	const inheritable = deckValue !== undefined;
	if (own) return { state: 'on', value: own.slice('marks-'.length), deckValue, inheritable };
	if (deckValue) return { state: 'inherited', value: deckValue, deckValue, inheritable: true };
	return { state: 'off', inheritable: false };
}
export function setMarks(chunk: string, name: string | null): string {
	// An old `chart-finish-*` token goes first, so the slide never carries both spellings.
	return setOverride(setOverride(chunk, 'marks', LEGACY_MARKS_PREFIX, MARKS_VALUES, null), 'marks', 'marks-', MARKS_VALUES, name);
}

const EYEBROW_VALUES = ['plain', 'dot', 'bar', 'arrow', 'underline'];
export function eyebrowProvenance(chunk: string, source: string): Provenance {
	return overrideProvenance(chunk, source, 'eyebrow', 'eyebrow-', EYEBROW_VALUES, 'plain');
}
export function setEyebrow(chunk: string, name: string | null): string {
	return setOverride(chunk, 'eyebrow', 'eyebrow-', EYEBROW_VALUES, name);
}

// The deck key is `headline` but the per-slide token prefix is `head-` (head-left/center/right);
// overrideProvenance takes the two separately, so the mismatch is fine.
const HEADLINE_VALUES = ['auto', 'left', 'center', 'right'];
export function headlineProvenance(chunk: string, source: string): Provenance {
	return overrideProvenance(chunk, source, 'headline', 'head-', HEADLINE_VALUES, 'auto');
}
export function setHeadline(chunk: string, name: string | null): string {
	return setOverride(chunk, 'headline', 'head-', HEADLINE_VALUES, name);
}

// ── motion (chart animation) — THREE independent axes ────────────────────────────────────────────
// Full parity with the deck front matter (Play=`motion:`, Style=`motion-style:`, Speed=`motion-speed:`)
// and the slide classes (`with-motion/off`, `motion-<style>`, `motion-<speed>`). The axes are INDEPENDENT:
// Play (`with-motion`/`no-motion`) is the sole animate switch; a style/speed token is an inert parameter
// that does NOT imply Play on (mirrors resolveMotion). Preview-only. The legacy `chart-anima` is honored
// as `with-motion` + `motion-build` and rewritten away whenever motion is set here. Each axis mirrors the
// tri-state provenance shape.
const MOTION_STYLE_VALUES = ['build', 'together', 'rise'];
const MOTION_SPEED_VALUES = ['auto', 'slow', 'normal', 'fast'];
const isStyleToken = (t: string) => /^motion-(build|together|rise)$/.test(t);
const isSpeedToken = (t: string) => /^motion-(auto|slow|normal|fast)$/.test(t);
const isPlayToken = (t: string) => t === 'with-motion' || t === 'no-motion';
const isAnyMotionToken = (t: string) => isPlayToken(t) || isStyleToken(t) || isSpeedToken(t) || t === 'chart-anima';

/** PLAY axis (on / off / inherit) — the sole animate switch. `with-motion` (or the legacy `chart-anima`)
 *  is on; `no-motion` is off; a bare style/speed token does NOT imply on (it inherits the deck). */
export function motionPlayProvenance(chunk: string, source: string): Provenance {
	const tokens = getClassTokens(chunk);
	const deck = (getFrontMatter(source, 'motion') || '').trim().toLowerCase();
	const deckValue = deck === 'on' || deck === 'off' ? deck : undefined;
	const inheritable = deckValue !== undefined;
	if (tokens.includes('with-motion') || tokens.includes('chart-anima')) return { state: 'on', value: 'on', deckValue, inheritable };
	if (tokens.includes('no-motion')) return { state: 'off', value: 'off', deckValue, inheritable };
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

/** Set the slide's PLAY. `'on'`/`'off'` → `with-motion` / `no-motion` (the switch); `null` → inherit (clear it). Clears legacy chart-anima. */
export function setMotionPlay(chunk: string, value: 'on' | 'off' | null): string {
	const kept = getClassTokens(chunk).filter((t) => !isPlayToken(t) && t !== 'chart-anima');
	if (value) kept.push(switchToken('motion', value));
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

// ── backdrop / card tag / image card: per-slide provenance (the deck tables are in deck-axes.ts) ──

export function backdropProvenance(chunk: string, source: string, axis: BackdropAxis): Provenance {
	const values = backdropValues(axis);
	const own = getClassTokens(chunk).find((t) => t.startsWith('backdrop-') && values.includes(t.slice(9)));
	const deckValue = deckBackdrop(source)[axis];
	const inheritable = deckValue !== undefined;
	if (own) return { state: 'on', value: own.slice(9), deckValue, inheritable };
	if (deckValue) return { state: 'inherited', value: deckValue, deckValue, inheritable: true };
	return { state: 'off', inheritable: false };
}

/** Set one axis on the slide; `null` clears it so the slide follows the deck. */
export function setBackdrop(chunk: string, axis: BackdropAxis, name: string | null): string {
	const values = backdropValues(axis);
	const kept = getClassTokens(chunk).filter((t) => !(t.startsWith('backdrop-') && values.includes(t.slice(9))));
	if (name && values.includes(name)) kept.push(`backdrop-${name}`);
	return setClassTokens(chunk, kept);
}

export function cardTagProvenance(chunk: string, source: string, axis: CardTagAxis): Provenance {
	const values = cardTagValues(axis);
	const own = getClassTokens(chunk).find((t) => t.startsWith('tag-') && values.includes(t.slice(4)));
	const deckValue = deckCardTag(source)[axis];
	const inheritable = deckValue !== undefined;
	if (own) return { state: 'on', value: own.slice(4), deckValue, inheritable };
	if (deckValue) return { state: 'inherited', value: deckValue, deckValue, inheritable: true };
	return { state: 'off', inheritable: false };
}

/** Set one axis on the slide; `null` clears it so the slide follows the deck. */
export function setCardTag(chunk: string, axis: CardTagAxis, name: string | null): string {
	const values = cardTagValues(axis);
	const kept = getClassTokens(chunk).filter((t) => !(t.startsWith('tag-') && values.includes(t.slice(4))));
	if (name && values.includes(name)) kept.push(`tag-${name}`);
	return setClassTokens(chunk, kept);
}

/** Where a slide's value on one axis comes from: its own class, the deck's word, or neither. */
export function imageCardProvenance(chunk: string, source: string, axis: ImageCardAxis): Provenance {
	const own = getClassTokens(chunk).map((t) => imageCardWordOf(axis, t)).find(Boolean);
	const deckValue = deckImageCard(source)[axis];
	const inheritable = deckValue !== undefined;
	if (own) return { state: 'on', value: own, deckValue, inheritable };
	if (deckValue) return { state: 'inherited', value: deckValue, deckValue, inheritable: true };
	return { state: 'off', inheritable: false };
}
