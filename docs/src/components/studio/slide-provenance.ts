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

// ── dark ─────────────────────────────────────────────────────────────────────
// No engine opt-out token exists for `dark`, so "off" is only meaningful when the
// deck is NOT dark; when the deck IS dark, the slide can only be inherited-dark.

export function darkProvenance(chunk: string, source: string): Provenance {
	const tokens = getClassTokens(chunk);
	const deckDark = deckDefaults(source).classTokens.includes('dark');
	// A dark deck always wins: the slide is dark no matter what, so report it as
	// inherited (a per-slide `dark` token would be redundant) rather than a toggle the
	// author could seem to switch off. Only when the deck is NOT dark is the per-slide
	// token a real on/off.
	if (deckDark) return { state: 'inherited', deckValue: 'dark', inheritable: true };
	if (tokens.includes('dark')) return { state: 'on', inheritable: false };
	return { state: 'off', inheritable: false };
}

/** Set the slide's dark state. `on` adds the token; `off`/`inherited` removes it.
 *  (When the deck is dark, removing the slide token yields inherited-dark, which is
 *  the honest result — the drawer disables the explicit "off" in that case.) */
export function setDark(chunk: string, on: boolean): string {
	const tokens = getClassTokens(chunk).filter((t) => t !== 'dark');
	if (on) tokens.push('dark');
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
