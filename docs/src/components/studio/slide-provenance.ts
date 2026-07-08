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

const isSpectrumToken = (t: string) => t === 'spectrum-off' || t === 'spectrum-solid';

/** Effective brand-bar state for a slide. `value` is the bare name (`off` / `solid`). */
export function spectrumProvenance(chunk: string, source: string): Provenance {
	const own = getClassTokens(chunk).find(isSpectrumToken);
	const deck = (getFrontMatter(source, 'spectrum') || '').trim().toLowerCase();
	const deckValue = deck === 'off' || deck === 'solid' ? deck : undefined; // `on`/unset → rainbow default
	const inheritable = deckValue !== undefined;
	if (own) return { state: 'on', value: own.slice('spectrum-'.length), deckValue, inheritable };
	if (deckValue) return { state: 'inherited', value: deckValue, deckValue, inheritable: true };
	return { state: 'off', inheritable: false };
}

/** Set the slide's brand bar. `'off'` / `'solid'` → the token; `null` → inherit / rainbow
 *  (clear the per-slide token). Existing spectrum tokens are cleared first so it can't stack. */
export function setSpectrum(chunk: string, name: string | null): string {
	const kept = getClassTokens(chunk).filter((t) => !isSpectrumToken(t));
	if (name === 'off' || name === 'solid') kept.push(`spectrum-${name}`);
	return setClassTokens(chunk, kept);
}
