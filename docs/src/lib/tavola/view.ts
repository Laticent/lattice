// The view: what a member shows the others about WHERE they are (a panel, a section, a position).
//
// Tavola never learns what a panel is. The app declares the keys it allows, and Tavola keeps only
// those, each checked against its declared shape, so an app writes no sanitizer of its own and one
// wrong field cannot turn a feature off for everyone (the failure a hand-written check caused when a
// caret at the end of a deck dropped one field).
//
// THERE IS NO FREE-TEXT KIND. Every value is a place from a fixed list, an integer in a range, or an
// id of a fixed form. Text a person typed and has not committed is private, and a value that is
// "whatever they typed" would carry it to everyone, so the vocabulary below cannot express it.
//
// This file imports nothing: it is part of the core, which stays free of Yjs. The Yjs adapter
// (`adapters/yjs.ts`) carries a view on awareness. Design: engineering/decisions/2026-10-21-follow-over-tavola.md.

/** A check that returns the cleaned value, or `undefined` when the value is not acceptable. */
export type Schema<T> = (value: unknown) => T | undefined;

/** The value a schema produces. */
export type Infer<S> = S extends Schema<infer T> ? T : never;

/** At most this many keys in one view, and this many UTF-8 bytes of JSON for all of it (the widest view Live sends, every key set with long values, is about 330). */
export const VIEW_MAX_KEYS = 16;
export const VIEW_MAX_BYTES = 512;

const NAME = /^[a-z][A-Za-z0-9]{0,31}$/;

/** One of a fixed list of strings. Held in a Set, so `constructor` and `__proto__` are not members. */
export function oneOf<const T extends readonly string[]>(values: T): Schema<T[number]> {
	if (values.length === 0) throw new Error('oneOf needs at least one value');
	const set = new Set<string>(values);
	return (v) => (typeof v === 'string' && set.has(v) ? (v as T[number]) : undefined);
}

/** An integer in `[min, max]`. */
export function int(min: number, max: number): Schema<number> {
	return (v) => (typeof v === 'number' && Number.isSafeInteger(v) && v >= min && v <= max ? v : undefined);
}

/** A string of a fixed form (an id, a hash). The pattern must be anchored and the string short: this is
 *  how an id is named, never how text is carried. */
export function pattern(re: RegExp, max = 64): Schema<string> {
	if (!re.source.startsWith('^') || !re.source.endsWith('$')) throw new Error('pattern must be anchored with ^ and $');
	if (!Number.isInteger(max) || max < 1 || max > 128) throw new Error('pattern strings are at most 128 characters');
	return (v) => (typeof v === 'string' && v.length <= max && re.test(v) ? v : undefined);
}

/** A boolean. */
export const bool: Schema<boolean> = (v) => (typeof v === 'boolean' ? v : undefined);

/** A field that may be missing inside an object. */
export function opt<T>(schema: Schema<T>): Schema<T> & { optional: true } {
	return Object.assign((v: unknown) => schema(v), { optional: true as const });
}

/** An object of declared fields. Undeclared fields are dropped; a missing or bad required field fails it. */
export function obj<const S extends Record<string, Schema<unknown>>>(shape: S): Schema<{ [K in keyof S]: Infer<S[K]> }> {
	const fields = Object.entries(shape);
	for (const [name] of fields) if (!NAME.test(name)) throw new Error(`bad field name: ${name}`);
	return (v) => {
		if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined;
		const out: Record<string, unknown> = {};
		for (const [name, schema] of fields) {
			const has = Object.hasOwn(v, name);
			const got = has ? schema((v as Record<string, unknown>)[name]) : undefined;
			if (got === undefined) {
				if ((schema as { optional?: true }).optional) continue;
				return undefined;
			}
			out[name] = got;
		}
		return out as { [K in keyof S]: Infer<S[K]> };
	};
}

/** The declared keys of a view, whatever their shapes. */
export type AnyViewKeys = {
	readonly names: readonly string[];
	readonly schemas: ReadonlyMap<string, Schema<unknown>>;
};

/** The declared keys of a view, remembering their shapes. */
export type ViewKeys<S extends Record<string, Schema<unknown>> = Record<string, Schema<unknown>>> = AnyViewKeys & {
	readonly names: readonly (keyof S & string)[];
};

/** Declare the keys. A name is lower-camel and short; the map holds no inherited names. */
export function defineViewKeys<const S extends Record<string, Schema<unknown>>>(shape: S): ViewKeys<S> {
	const names = Object.keys(shape);
	if (names.length > VIEW_MAX_KEYS) throw new Error(`a view has at most ${VIEW_MAX_KEYS} keys`);
	const schemas = new Map<string, Schema<unknown>>();
	for (const n of names) {
		if (!NAME.test(n)) throw new Error(`bad view key: ${n}`);
		schemas.set(n, shape[n] as Schema<unknown>);
	}
	return { names: names as (keyof S & string)[], schemas };
}

/** The values a view of these keys holds. */
export type ViewValues<S extends Record<string, Schema<unknown>>> = { [N in keyof S]?: Infer<S[N]> };

const encoder = new TextEncoder();

/**
 * Keep only the declared keys of `raw` whose values pass, within the byte limit.
 * A value that fails is dropped, never repaired, and named in `dropped` so a caller can count it (a
 * silent drop looks like "Follow just does not do that"). Keys past the limit are dropped in declared order.
 */
export function cleanView(raw: unknown, keys: AnyViewKeys): { view: Record<string, unknown>; dropped: string[] } {
	const view: Record<string, unknown> = {};
	const dropped: string[] = [];
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { view, dropped };
	let bytes = 2;
	for (const name of keys.names) {
		if (!Object.hasOwn(raw, name)) continue;
		const schema = keys.schemas.get(name);
		const got = schema ? schema((raw as Record<string, unknown>)[name]) : undefined;
		if (got === undefined) {
			dropped.push(name);
			continue;
		}
		const cost = encoder.encode(JSON.stringify(name)).length + encoder.encode(JSON.stringify(got)).length + 2;
		if (bytes + cost > VIEW_MAX_BYTES) {
			dropped.push(name);
			continue;
		}
		bytes += cost;
		view[name] = got;
	}
	return { view, dropped };
}
