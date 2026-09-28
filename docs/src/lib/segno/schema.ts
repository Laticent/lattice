/**
 * Slots and schemas: what a span MEANS where it sits.
 *
 * The notation only says a span is a record, a list or a value. A SLOT says what that shape is
 * for — a pill in prose, a quadrant's axis line, a gantt task's trailing pills — by declaring
 * its parameters:
 *
 *   const pill = record({
 *     positional: [{ name: 'value', type: text() }],
 *     params: { shape: oneOf(SHAPES), color: color({ max: 12 }), size: oneOf(['sm', 'md', 'lg']) },
 *   });
 *
 * BINDING IS DETERMINISTIC, and the rules are short:
 *
 *   1. positional items fill `positional` in order (a pill's label, a point's x and y);
 *   2. `name=value` fills that parameter; an unknown name is an error;
 *   3. any other bare item fills THE ONE parameter, in the highest precedence class
 *      (types.ts CLASS_ORDER), whose type accepts its spelling;
 *   4. a parameter filled twice is an error; a required positional left empty is an error;
 *   5. any error leaves the span unbound and reports it. Nothing is half-applied.
 *
 * Rule 3 never has to guess, because `record()` REFUSES to build a schema in which two
 * parameters of one class could accept the same word: two enums sharing a word, two
 * numbers, two ids. Ambiguity is a build error for the schema's author, never a surprise
 * for a deck's author.
 *
 * Shortcuts and sigils are declared here too. A shortcut is an exact whole-span token that
 * stands for a record (`[x]` → `{done}`); a sigil is a leading character that names a
 * parameter (`@Customer` → `who=Customer`). Both are checked when the schema is built.
 */

import { type Diagnostic, type Item, parse, type Scalar, type Value } from './notation.js';
import { CLASS_ORDER, type Cls, type Type } from './types.js';

// ── declaring ──────────────────────────────────────────────────────────────

export interface Positional<T = unknown> {
  readonly name: string;
  readonly type: Type<T> | Slot<T>;
  /** Must this position be given? Default: the first positional is required, the rest optional. */
  readonly required?: boolean;
}

export interface RecordSpec {
  readonly positional?: readonly Positional[];
  readonly params?: Readonly<Record<string, Type<unknown> | Slot<unknown>>>;
  /** Exact whole-span tokens that stand for a record in this slot: `{ '[x]': '{done}' }`. */
  readonly shortcuts?: Readonly<Record<string, string>>;
  /** Leading characters that name a parameter: `{ '@': 'who' }` makes `@Customer` mean `who=Customer`. */
  readonly sigils?: Readonly<Record<string, string>>;
  /** A human name for messages: "a pill", "a quadrant axis". */
  readonly label?: string;
}

/** What a slot reports about each vocab word it bound, for per-deck consistency. */
export interface Spelling {
  readonly param: string;
  /** The canonical value (an enum value, a flag word). */
  readonly canonical: string;
  /** How the author wrote it: the alias, the canonical word, or a shortcut token. */
  readonly written: string;
  readonly from: number;
  readonly to: number;
  /** `written` is a shortcut token (`[x]`), which only ever stands for a whole span. */
  readonly shortcut: boolean;
  /**
   * The range that holds this spelling and nothing else: the shortcut token, or a record whose
   * only item it is (`{done}`). Present only then — a fix that swaps a word for a shortcut, or a
   * shortcut for a word, rewrites this range, and without it would lose the record's other items.
   */
  readonly alone?: { readonly from: number; readonly to: number };
}

export type Bound<T> =
  | { readonly ok: true; readonly value: T; readonly spellings: readonly Spelling[] }
  | { readonly ok: false; readonly diagnostics: readonly Diagnostic[] };

export interface Slot<T> {
  readonly kind: 'record' | 'list' | 'value';
  readonly label: string;
  /** Bind a parsed value. */
  bind(v: Value): Bound<T>;
  /** Bind items spread over several spans (a gantt task's trailing pills), as one record. */
  bindItems?(items: readonly Item[]): Bound<T>;
  /** Parse and bind one span's text. */
  read(text: string): Bound<T>;
  /** The schema, for docs and autocomplete. */
  readonly spec: unknown;
}

// ── type-level: what binding produces ──────────────────────────────────────

type TypeOf<P> = P extends Type<infer T> ? T : P extends Slot<infer T> ? T : never;
type PositionalValues<P extends readonly Positional[]> = { [K in P[number] as K['name']]: TypeOf<K['type']> | undefined };
type ParamValues<P> = { [K in keyof P]?: TypeOf<P[K]> };
export type RecordOf<S extends RecordSpec> =
  PositionalValues<S['positional'] extends readonly Positional[] ? S['positional'] : []> &
  ParamValues<S['params'] extends object ? S['params'] : object>;

// ── building a record slot ─────────────────────────────────────────────────

const NO_SPELLINGS: readonly Spelling[] = Object.freeze([]);

function deepFreeze<T>(x: T): T {
  if (x && typeof x === 'object' && !Object.isFrozen(x)) {
    for (const v of Object.values(x)) deepFreeze(v);
    Object.freeze(x);
  }
  return x;
}
const isSlot = (x: unknown): x is Slot<unknown> => typeof (x as Slot<unknown>)?.bind === 'function';
const clsOf = (x: Type<unknown> | Slot<unknown>): Cls | null => (isSlot(x) ? null : x.cls);

const err = (code: string, message: string, from: number, to: number, fix?: Diagnostic['fix']): Diagnostic =>
  ({ code, severity: 'error', message, from, to, ...(fix ? { fix } : {}) });

const PARAM_NAME = /^[a-z][a-z0-9-]*$/;

/** Refuse a schema a bare word could bind two ways. Returns the problems, or []. */
export function schemaProblems(spec: RecordSpec): string[] {
  const problems: string[] = [];
  const params = Object.entries(spec.params ?? {});
  const names = new Set<string>();
  for (const p of spec.positional ?? []) {
    if (names.has(p.name)) problems.push(`"${p.name}" is declared twice`);
    names.add(p.name);
  }
  for (const [name] of params) {
    if (names.has(name)) problems.push(`"${name}" is declared twice`);
    names.add(name);
  }
  // `name=value` is read case-insensitively, so a name an author can write is lower case.
  for (const name of names) if (!PARAM_NAME.test(name)) problems.push(`"${name}" is not a parameter name an author can write — use lower case letters, digits and "-"`);
  // A bare record or list binds to the one sub-slot parameter of its shape, so two of one shape
  // would bind by order — the ambiguity this check exists to refuse.
  for (const kind of ['record', 'list'] as const) {
    const same = params.filter(([, t]) => isSlot(t) && t.kind === kind);
    if (same.length > 1) problems.push(`${same.map(([n]) => `"${n}"`).join(' and ')} both take a ${kind}, so a bare ${kind} could bind to either — make all but one positional`);
  }
  for (const cls of CLASS_ORDER) {
    const inCls = params.filter(([, t]) => clsOf(t) === cls && !(t as Type<unknown>).namedOnly);
    if (cls === 'vocab') {
      const owner = new Map<string, string>();
      for (const [name, t] of inCls) {
        for (const w of (t as Type<unknown>).words ?? []) {
          const had = owner.get(w);
          if (had && had !== name) problems.push(`the word "${w}" would bind to both "${had}" and "${name}"`);
          owner.set(w, name);
        }
      }
    } else if (inCls.length > 1) {
      problems.push(`${inCls.map(([n]) => `"${n}"`).join(' and ')} are all ${cls} parameters, so a bare ${cls} could bind to any of them — make all but one positional, or require a name`);
    }
  }
  for (const [sigil, param] of Object.entries(spec.sigils ?? {})) {
    if (sigil.length !== 1) problems.push(`sigil "${sigil}" must be one character`);
    if (!names.has(param)) problems.push(`sigil "${sigil}" names "${param}", which is not a parameter`);
    if (sigil === '#' && params.some(([, t]) => clsOf(t) === 'id')) problems.push('sigil "#" collides with the id type');
  }
  return problems;
}

export class SchemaError extends Error {
  constructor(readonly problems: readonly string[]) {
    super(`segno: this schema is ambiguous:\n  - ${problems.join('\n  - ')}`);
    this.name = 'SchemaError';
  }
}

function describeParam(name: string, t: Type<unknown> | Slot<unknown>) {
  return `${name} (${isSlot(t) ? t.label : t.describe})`;
}

interface VocabHit {
  readonly name: string;
  readonly value: unknown;
  readonly canonical: string;
}

/** One bind in progress: the record being filled, and anything that went wrong. */
class Binding {
  readonly out: Record<string, unknown> = {};
  spellings: Spelling[] | null = null;
  diags: Diagnostic[] | null = null;
  constructor(
    readonly label: string,
    readonly shortcut?: { token: string; from: number; to: number },
    readonly alone?: { from: number; to: number },
  ) {}

  problem(d: Diagnostic) {
    (this.diags ??= []).push(d);
  }

  private spelled(param: string, canonical: string, written: string, v: Value) {
    const sc = this.shortcut;
    const alone = this.alone;
    (this.spellings ??= []).push(sc
      ? { param, canonical, written: sc.token, from: sc.from, to: sc.to, shortcut: true, ...(alone ? { alone } : {}) }
      : { param, canonical, written, from: v.from, to: v.to, shortcut: false, ...(alone ? { alone } : {}) });
  }

  /** A bare vocab word, already resolved by the slot's lookup table. */
  putVocab(hit: VocabHit, lower: string, v: Value, it: Item) {
    if (Object.hasOwn(this.out, hit.name)) { this.problem(err('given-twice', `${hit.name} is given twice`, it.from, it.to)); return; }
    this.out[hit.name] = hit.value;
    this.spelled(hit.name, hit.canonical, lower, v);
  }

  put(name: string, t: Type<unknown> | Slot<unknown>, v: Value, it: Item) {
    if (Object.hasOwn(this.out, name)) { this.problem(err('given-twice', `${name} is given twice`, it.from, it.to)); return; }
    if (isSlot(t)) {
      const r = t.bind(v);
      if (!r.ok) { for (const d of r.diagnostics) this.problem(d); return; }
      this.out[name] = r.value;
      // A nested slot's words are its own: `axis.state`, so two sub-slots never share a group.
      if (r.spellings.length) (this.spellings ??= []).push(...r.spellings.map((sp) => ({ ...sp, param: `${name}.${sp.param}` })));
      return;
    }
    if (v.kind !== 'scalar') { this.problem(err('wrong-shape', `expected ${t.describe}, found a ${v.kind}`, v.from, v.to)); return; }
    const got = t.read(v.text, v.quoted);
    if (got === undefined) { this.problem(err('wrong-type', `"${v.text}" is not ${t.describe}`, v.from, v.to)); return; }
    this.putRead(name, t, got, v, it);
  }

  /** `put` for a value the caller has already read with `t` — the bare-word search reads each
   *  candidate to find its owner, and reading it a second time here doubled the cost of every
   *  number and range. */
  putRead(name: string, t: Type<unknown>, got: unknown, v: Scalar, it: Item) {
    if (Object.hasOwn(this.out, name)) { this.problem(err('given-twice', `${name} is given twice`, it.from, it.to)); return; }
    this.out[name] = got;
    if (t.cls === 'vocab') this.spelled(name, t.canonical?.(v.text) ?? v.text, v.text.toLowerCase(), v);
  }
}

/** Declare a record slot. Throws SchemaError when a bare word could bind two ways. */
export function record<const S extends RecordSpec>(spec: S): Slot<RecordOf<S>> {
  const problems = schemaProblems(spec);
  if (problems.length) throw new SchemaError(problems);
  const label = spec.label ?? 'this record';
  const positional = spec.positional ?? [];
  const params = spec.params ?? {};
  const byName = new Map<string, Type<unknown> | Slot<unknown>>([
    ...positional.map((p) => [p.name, p.type] as const),
    ...Object.entries(params),
  ]);
  const byCls = CLASS_ORDER.map((cls) => [cls, Object.entries(params).filter(([, t]) => clsOf(t) === cls && !(t as Type<unknown>).namedOnly)] as const);
  const sigils = spec.sigils ?? {};
  const shortcuts = new Map<string, Value>();



  // Every vocab word the bare-word rule could bind, precomputed ONCE: word (lower case) → its
  // parameter AND the value it reads as. The ambiguity check guarantees each word has one owner,
  // so binding a bare word is one lookup — no trying each parameter's type in turn, and no
  // re-reading the word it already resolved. The profile that asked for this showed each enum
  // word lower-cased four times per bind.
  const vocab = new Map<string, VocabHit>();
  for (const [name, t] of Object.entries(params)) {
    if (isSlot(t) || t.namedOnly || t.cls !== 'vocab') continue;
    for (const w of t.words ?? []) vocab.set(w, { name, value: t.read(w, false), canonical: t.canonical?.(w) ?? w });
  }
  // The non-vocab classes in precedence order, each already filtered to plain types: a bare
  // word is tried against these in turn, and a sub-slot never takes a bare word.
  const others = byCls
    .filter(([cls]) => cls !== 'vocab')
    .map(([, list]) => list.filter((e): e is [string, Type<unknown>] => !isSlot(e[1])))
    .filter((l) => l.length);
  const hasSigils = Object.keys(sigils).length > 0;
  // The "it takes …" half of an error message is the same for every error in this slot, so it
  // is built once, the first time an error needs it.
  let takesText: string | null = null;
  const takes = () => (takesText ??= [...byName].map(([n, tt]) => describeParam(n, tt)).join(', '));

  const bindItems = (
    items: readonly Item[],
    shortcut?: { token: string; from: number; to: number },
    alone?: { from: number; to: number },
  ): Bound<RecordOf<S>> => {
    const b = new Binding(label, shortcut, alone);
    let pos = 0;
    for (let k = 0; k < items.length; k++) {
      const it = items[k];
      if (it.name !== null) {
        const t = byName.get(it.name);
        if (t) b.put(it.name, t, it.value, it);
        else b.problem(err('unknown-param', `${label} has no "${it.name}" — it takes ${takes()}`, it.from, it.to));
        continue;
      }
      const v = it.value;
      if (hasSigils && v.kind === 'scalar' && !v.quoted && v.text.length > 1 && sigils[v.text[0]]) {
        // A sigil: `@Customer` is `who=Customer`.
        const name = sigils[v.text[0]];
        b.put(name, byName.get(name) as Type<unknown>, { ...v, text: v.text.slice(1), from: v.from + 1 }, it);
        continue;
      }
      if (pos < positional.length) {
        b.put(positional[pos].name, positional[pos].type, v, it);
        pos++;
        continue;
      }
      // A bare word: the one parameter, in the highest class, whose type accepts it.
      if (v.kind === 'scalar') {
        if (!v.quoted) {
          const lower = v.text.toLowerCase();
          const hit = vocab.get(lower);
          if (hit) { b.putVocab(hit, lower, v, it); continue; }
        }
        let found = false;
        for (let c = 0; !found && c < others.length; c++) {
          const cls = others[c];
          for (let e = 0; e < cls.length; e++) {
            const got = cls[e][1].read(v.text, v.quoted);
            if (got !== undefined) { b.putRead(cls[e][0], cls[e][1], got, v, it); found = true; break; }
          }
        }
        if (found) continue;
      } else {
        // The schema check allows at most one bare record and one bare list parameter.
        const slots = Object.entries(params).filter(([, t]) => isSlot(t) && t.kind === v.kind);
        if (slots.length === 1) { b.put(slots[0][0], slots[0][1], v, it); continue; }
      }
      const what = v.kind === 'scalar' ? `"${v.text}"` : `this ${v.kind}`;
      b.problem(err('unknown-word', `${what} is not anything ${label} takes — it takes ${takes()}`, it.from, it.to));
    }
    for (let k = 0; k < positional.length; k++) {
      const p = positional[k];
      if ((p.required ?? k === 0) && !Object.hasOwn(b.out, p.name) && !b.diags) {
        const at = items[0]?.from ?? 0;
        b.problem(err('missing', `${label} needs ${p.name}`, at, items[items.length - 1]?.to ?? at));
      }
    }
    if (b.diags) return { ok: false, diagnostics: b.diags };
    return { ok: true, value: b.out as RecordOf<S>, spellings: b.spellings ?? NO_SPELLINGS };
  };

  const slot: Slot<RecordOf<S>> = {
    kind: 'record',
    label,
    spec,
    bind(v: Value) {
      if (v.kind === 'record') return bindItems(v.items);
      // A bare value where a record is expected is the record's primary alone: `Reach` in
      // `[{Effort, 0..10}, Reach]` is an axis with only a name.
      return bindItems([{ name: null, value: v, from: v.from, to: v.to }]);
    },
    bindItems: (items) => bindItems(items),
    read(text: string) {
      // A shortcut is a fixed string, so its bind is too: computed once below, returned here.
      if (shortcutBound.size) {
        const hit = shortcutBound.get(text);
        if (hit) return hit;
      }
      const token = shortcuts.size ? text.trim() : '';
      const expanded = shortcuts.size ? shortcuts.get(token) : undefined;
      if (expanded && expanded.kind === 'record') {
        const at = text.indexOf(token);
        const range = { from: at, to: at + token.length };
        return bindItems(expanded.items, { token, ...range }, expanded.items.length === 1 ? range : undefined);
      }
      const p = parse(text);
      if (!p.ok) return { ok: false, diagnostics: [p.diagnostic] };
      if (p.item.name !== null) return bindItems([p.item]);
      const v = p.item.value;
      // Only a WHOLE span can be rewritten to a shortcut, so only a top-level one-item record is
      // `alone`; a record nested in a list or a sub-slot never is (`[{done}]` has no `[[x]]`).
      if (v.kind === 'record') return bindItems(v.items, undefined, v.items.length === 1 ? { from: v.from, to: v.to } : undefined);
      return slot.bind(v);
    },
  };

  // Shortcuts are checked now: each must expand to a record this slot accepts.
  for (const [token, expansion] of Object.entries(spec.shortcuts ?? {})) {
    const p = parse(expansion);
    if (!p.ok || p.item.value.kind !== 'record') throw new SchemaError([`shortcut "${token}" expands to "${expansion}", which is not a record`]);
    const r = bindItems(p.item.value.items);
    if (!r.ok) throw new SchemaError([`shortcut "${token}" expands to "${expansion}", which ${label} rejects: ${r.diagnostics[0].message}`]);
    shortcuts.set(token, p.item.value);
  }
  // Each shortcut written exactly (no surrounding space, the only form in a real span) binds
  // once, here, and every later read of it is a lookup. The result is shared between reads, so
  // it is frozen: a caller that mutated it would change every later `[x]`.
  const shortcutBound = new Map<string, Bound<RecordOf<S>>>();
  for (const token of shortcuts.keys()) shortcutBound.set(token, deepFreeze(slot.read(token)));
  return slot;
}

/** A list slot: `[a, b, c]`, each element bound by `of`. Empty elements hold their place as `null`. */
export function list<T>(of: Slot<T> | Type<T>, options: { max?: number; label?: string } = {}): Slot<(T | null)[]> {
  const label = options.label ?? 'this list';
  const slot: Slot<(T | null)[]> = {
    kind: 'list',
    label,
    spec: { of: isSlot(of) ? of.spec : of.describe, max: options.max },
    bind(v: Value) {
      if (v.kind !== 'list') return { ok: false, diagnostics: [err('wrong-shape', `${label} is a [list]`, v.from, v.to)] };
      if (options.max !== undefined && v.items.length > options.max) {
        return { ok: false, diagnostics: [err('too-many', `${label} takes at most ${options.max}, found ${v.items.length}`, v.from, v.to)] };
      }
      const out: (T | null)[] = [];
      const spellings: Spelling[] = [];
      const diags: Diagnostic[] = [];
      for (const el of v.items) {
        if (el === null) { out.push(null); continue; }
        const r = isSlot(of) ? of.bind(el) : value(of).bind(el);
        if (r.ok) { out.push(r.value as T); spellings.push(...r.spellings); } else diags.push(...r.diagnostics);
      }
      return diags.length ? { ok: false, diagnostics: diags } : { ok: true, value: out, spellings };
    },
    read(text: string) {
      const p = parse(text);
      if (!p.ok) return { ok: false, diagnostics: [p.diagnostic] };
      if (p.item.name !== null) return { ok: false, diagnostics: [err('wrong-shape', `${label} is a [list]`, p.item.from, p.item.to)] };
      return slot.bind(p.item.value);
    },
  };
  return slot;
}

/** A value slot: one bare or quoted value of a type (a gantt span `Q1..Q3`, a status word). */
export function value<T>(type: Type<T>, options: { label?: string } = {}): Slot<T> {
  const label = options.label ?? type.describe;
  const slot: Slot<T> = {
    kind: 'value',
    label,
    spec: { type: type.describe },
    bind(v: Value) {
      if (v.kind !== 'scalar') return { ok: false, diagnostics: [err('wrong-shape', `expected ${type.describe}, found a ${v.kind}`, v.from, v.to)] };
      const got = type.read(v.text, v.quoted);
      if (got === undefined) return { ok: false, diagnostics: [err('wrong-type', `"${v.text}" is not ${type.describe}`, v.from, v.to)] };
      const spellings: Spelling[] = type.cls === 'vocab' ? [{ param: label, canonical: type.canonical?.(v.text) ?? v.text, written: v.text.toLowerCase(), from: v.from, to: v.to, shortcut: false }] : [];
      return { ok: true, value: got, spellings };
    },
    read(text: string) {
      const p = parse(text);
      if (!p.ok) return { ok: false, diagnostics: [p.diagnostic] };
      if (p.item.name !== null) return { ok: false, diagnostics: [err('wrong-shape', `expected ${type.describe}`, p.item.from, p.item.to)] };
      return slot.bind(p.item.value);
    },
  };
  return slot;
}
