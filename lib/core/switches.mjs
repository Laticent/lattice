/**
 * lib/core/switches.js — EVERY on/off switch a slide can carry, and the one rule that settles them.
 *
 * THE OWNER'S RULE (2026-11-04). A switch is spelled `no-X` (turn it off) and `with-X` (turn it
 * back on for this slide), and nothing else: no `X-off` / `X-on`, no bare `X` that means "on", no
 * `X-none`. A deck turns a switch off with `class: no-X` (or the front-matter setting's own plain
 * word, `motion: off`, which the setting's resolver turns into the same `no-X` class), the deck class
 * reaches every slide, and one slide brings it back with `with-X`.
 *
 * THE PRECEDENCE, in one place: `with-X` > `no-X` > `silent` (for the four chrome bands it covers) >
 * the caller's default (a component's manifest, the deck's setting). The deck's `class:` is on every
 * slide, so a slide that brings a switch back carries BOTH tokens; `with-X` has to win.
 *
 * TWO WAYS TO ASK, because two kinds of reader exist:
 *   · JS that decides something — `switchOn(name, tokens, fallback)`. It reads the raw class list
 *     and applies the precedence itself, so it is right whether or not the list was settled.
 *   · CSS, which cannot apply a precedence — `settleSwitches(tokens)` rewrites the list so a
 *     switch carries at most ONE of its tokens: `with-X` removes `no-X`, and `silent` adds the
 *     `no-X` of each band it covers that the slide did not bring back. Every stylesheet rule can
 *     then key on `.no-X` alone. The engine settles each slide after every class source has
 *     landed (lib/integrations/markdown-it/plugins.js `switchSettle`), and the runtime does the
 *     same in a Marp bundle (lib/runtime/index.js), so the two render paths agree (HARD RULE #1).
 *
 * The old spellings are retired outright (a hard rename, the owner's choice): `RETIRED_SWITCHES`
 * maps each to its replacement for the lint that reports it and fixes it in place. Nothing reads an
 * old name as the new one.
 *
 * Pure and dependency-free, so the engine, the runtime bundle, lint, the Studio and the CSS gate
 * share it. ESM, so the Studio imports it as source; CJS callers `require('./switches')`, a door
 * onto this file (the meta-keys.mjs pattern). Decision note: engineering/decisions/2026-11-04-switch-vocabulary.md.
 */

/**
 * Every switch. `name` makes the pair `no-<name>` / `with-<name>`; `silent: true` marks the chrome
 * bands the `silent` token turns off; `what` is the one line the docs and lint print.
 */
export const SWITCHES = Object.freeze([
  { name: 'header', silent: true, what: 'the running header band' },
  { name: 'footer', silent: true, what: 'the running footer band' },
  { name: 'pagination', silent: true, what: 'the page number' },
  { name: 'progress', silent: true, what: 'the section rail (progress dots)' },
  { name: 'logo', what: 'the deck logo' },
  { name: 'note', what: 'the below-note (a trailing paragraph promoted to a ruled note)' },
  { name: 'period', what: 'the heading period' },
  { name: 'row-label', what: 'the first-column row label in a table' },
  { name: 'spine', what: 'the line between the panes of a columns or rows slide' },
  { name: 'heading-rule', what: 'the underline beneath a slide heading' },
  { name: 'callout', what: 'callouts (drawn, described and narrated)' },
  { name: 'motion', what: 'motion (the slide plays its animation)' },
  { name: 'spectrum', what: 'the spectrum accent' },
  { name: 'spectrum-edge', what: 'the spectrum section-edge bar' },
  { name: 'spectrum-card', what: 'the spectrum card accent' },
  { name: 'spectrum-trim', what: 'the spectrum trim' },
  { name: 'treatment', what: 'tints and marks (the atmospheric treatments)' },
  { name: 'finish', what: 'the finish (backdrop preset)' },
  { name: 'backdrop', what: 'the finish backdrop' },
].map((s) => Object.freeze({ ...s, no: `no-${s.name}`, with: `with-${s.name}` })));

const BY_NAME = new Map(SWITCHES.map((s) => [s.name, s]));
const SILENCED = Object.freeze(SWITCHES.filter((s) => s.silent));

/** Every switch token, both halves (the reserved-class vocabulary reads this). */
export const SWITCH_TOKENS = Object.freeze(SWITCHES.flatMap((s) => [s.no, s.with]));

/**
 * The retired spellings and their replacements. A hard rename: these are refused, never aliased —
 * lint reports each with a fix that rewrites it (lib/authoring/lint-core.js `retired-switch`).
 * `tag-none` is here though it is not a switch: it never meant "no tag" (the tag stays, drawn as
 * bare text), so the rename to `tag-bare` removes the last `-none` without pretending it is one.
 */
export const RETIRED_SWITCHES = Object.freeze({
  'callout-off': 'no-callout',
  'callout-on': 'with-callout',
  'motion-off': 'no-motion',
  'motion-on': 'with-motion',
  'spectrum-off': 'no-spectrum',
  'spectrum-on': 'with-spectrum',
  'spectrum-edge-off': 'no-spectrum-edge',
  'spectrum-card-off': 'no-spectrum-card',
  'spectrum-card': 'with-spectrum-card',
  'spectrum-trim-off': 'no-spectrum-trim',
  'spectrum-trim': 'with-spectrum-trim',
  'row-label': 'with-row-label',
  'no-rule': 'no-spine',
  'rule-none': 'no-heading-rule',
  'treatment-none': 'no-treatment',
  'finish-none': 'no-finish',
  'backdrop-none': 'no-backdrop',
  'tag-none': 'tag-bare',
});

/**
 * The front-matter SETTINGS whose value list includes an off (or a restore-on) word, and the switch
 * that word now stamps. The setting keeps its plain words (`spectrum: off`, `rule: none`, `motion:
 * on`); the CLASS a deck or slide carries is the switch's. Every other value keeps `<key>-<value>`.
 * `on` is the restore word where the setting has one (a slide inside a `spectrum: solid` deck goes
 * back to the rainbow with `with-spectrum`).
 */
export const REGISTER_SWITCHES = Object.freeze({
  spectrum: Object.freeze({ name: 'spectrum', off: 'off', on: 'on' }),
  'spectrum-edge': Object.freeze({ name: 'spectrum-edge', off: 'off' }),
  'spectrum-card': Object.freeze({ name: 'spectrum-card', off: 'off', on: 'auto' }),
  'spectrum-trim': Object.freeze({ name: 'spectrum-trim', off: 'off', on: 'on' }),
  rule: Object.freeze({ name: 'heading-rule', off: 'none' }),
  callout: Object.freeze({ name: 'callout', off: 'off', on: 'on' }),
  motion: Object.freeze({ name: 'motion', off: 'off', on: 'on' }),
  finish: Object.freeze({ name: 'finish', off: 'none' }),
});

/**
 * The class a setting's VALUE stamps: the switch token for its off / on word, `<key>-<value>`
 * otherwise. `prefix` defaults to `<key>-`.
 */
export function registerToken(key, value, prefix = `${key}-`) {
  const sw = Object.hasOwn(REGISTER_SWITCHES, key) ? REGISTER_SWITCHES[key] : null;
  if (sw && value === sw.off) return `no-${sw.name}`;
  if (sw?.on && value === sw.on) return `with-${sw.name}`;
  return `${prefix}${value}`;
}

/**
 * The setting VALUE a class names, or null when the class is not one of `values` for that setting
 * — the inverse of `registerToken`, for a reader that shows which value a slide picked.
 */
export function registerValue(key, token, values, prefix = `${key}-`) {
  for (const v of values) if (registerToken(key, v, prefix) === token) return v;
  return null;
}

const has = (tokens, t) => (typeof tokens.contains === 'function' ? tokens.contains(t) : tokens.includes(t));

/**
 * Is switch `name` on for a slide with these class tokens? `with-X` → on; `no-X` → off; `silent`
 * (for the bands it covers) → off; otherwise `fallback` — the component's or the deck's default,
 * which the caller knows and this module does not.
 * @param {string} name                       a SWITCHES name (`progress`, `motion`, …)
 * @param {string[]|{contains(t: string): boolean}} tokens  the slide's classes, or a classList
 * @param {boolean} [fallback=true]
 */
export function switchOn(name, tokens, fallback = true) {
  const s = BY_NAME.get(name);
  if (!s) throw new Error(`switches: unknown switch "${name}"`);
  if (has(tokens, s.with)) return true;
  if (has(tokens, s.no)) return false;
  if (s.silent && has(tokens, 'silent')) return false;
  return fallback;
}

/**
 * The class list a stylesheet can read without a precedence: each switch keeps at most one of its
 * two tokens. `with-X` removes `no-X`; `silent` adds the `no-X` of every band it covers that the
 * slide did not bring back with `with-X` (and stays, for the readers that key on it as a whole).
 * Returns the SAME array when nothing changes, so a caller can test `next !== cur`.
 * @param {string[]} tokens
 */
export function settleSwitches(tokens) {
  let out = null;
  const list = () => out || (out = tokens.slice());
  for (const s of SWITCHES) {
    if (tokens.includes(s.with) && tokens.includes(s.no)) list().splice(list().indexOf(s.no), 1);
  }
  if (tokens.includes('silent')) {
    for (const s of SILENCED) {
      const cur = out || tokens;
      if (!cur.includes(s.with) && !cur.includes(s.no)) list().push(s.no);
    }
  }
  return out || tokens;
}

/** The replacement for a retired spelling, or null when `token` is not one. */
export function retiredSwitch(token) {
  return Object.hasOwn(RETIRED_SWITCHES, token) ? RETIRED_SWITCHES[token] : null;
}

