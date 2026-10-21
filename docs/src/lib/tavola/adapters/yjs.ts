// The Yjs bridge: Tavola's awareness gate, written once.
//
// Awareness (`y-protocols/awareness`) is how Live shows who is where: each member sends a small status
// (name, color, caret, slide, and the view of `../view.ts`). Tavola's core moves those bytes without
// reading them (`Stream`), and an app used to write its own checker for them. That checker is the part
// that does not scale, and it had three weaknesses (2026-10-21-follow-over-tavola.md §3). This adapter is
// the one hardened implementation:
//
//   - BOUNDS BEFORE THE PARSE. A message is refused over 8 KB, an entry over 4 KB, and a message names at
//     most 64 entries, all before any JSON is read, and only the sender's own bound client is kept, once.
//   - IDENTITY IS NOT A FIELD. `peer` and `user` are written from the roster row of the transport sender;
//     no cleaner can set them.
//   - THE CLOCK. Yjs ignores any update whose clock is below the last one it saw for a client, so a forged
//     huge clock would mute that client for the session. The adapter forgets a client's clock record when
//     its owner changes or it is removed, and refuses a clock that jumps too far.
//   - RATE, WITHOUT LOSING THE LAST UPDATE. A sender's updates that change anything but the caret are applied
//     at most ten a second; the latest one is kept and applied on a trailing timer, a removal is never held, and
//     a caret-only update is never held (a fast typist's caret must not freeze). Awareness resends only on a
//     change or every 15 s, so dropping a final update would leave a follower stale for up to 15 s.
//
// This is the ONLY production file in Tavola that imports Yjs's awareness protocol (and lib0, its byte
// codec): the core stays free of Yjs (checkTavolaBoundary). Yjs and y-protocols are optional peer
// dependencies of the package.

import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import { type Awareness, applyAwarenessUpdate, encodeAwarenessUpdate, removeAwarenessStates } from 'y-protocols/awareness';
import type { Member, PeerId, Stream } from '../types.js';
import { type AnyViewKeys, cleanView } from '../view.js';

/** A message is refused over this many bytes, and an entry over `MAX_ENTRY_BYTES`, before any parse. */
export const MAX_UPDATE_BYTES = 8 * 1024;
export const MAX_ENTRY_BYTES = 4 * 1024;
/** A message names at most this many entries; each member speaks for one client, so more is noise. */
export const MAX_ENTRIES = 64;
/** A client's clock may rise by at most this much between two updates we apply. */
export const MAX_CLOCK_JUMP = 100_000;
/** Updates that change more than the caret are applied at most once per this many ms per sender. */
export const RATE_MIN_MS = 100;
/** `view.set` writes to awareness at most once per this many ms. */
export const SEND_MIN_MS = 200;

type State = Record<string, unknown>;
/** One awareness entry after the gate: a client, its clock, and its rebuilt state (null is a removal). */
export type Entry = { client: number; clock: number; state: State | null };

/** Clean one field of a member's state. Return `undefined` to drop it. It sees who sent it and the whole
 *  incoming state, and it cannot name `peer`, `user` or the view field. */
export type FieldCleaner = (value: unknown, sender: Member, state: State) => unknown;

export type SanitizeOptions = {
	/** The peer the roster binds this awareness client id to, or undefined. */
	ownerOf: (client: number) => PeerId | undefined;
	/** The roster row of the transport sender. No row, no presence. */
	member: Member | undefined;
	/** The fields that name the sender (`peer` is always the transport sender); built from the roster row. */
	identity: (member: Member) => State;
	/** One cleaner per field the app allows, by name. Anything else is dropped. */
	fields: Readonly<Record<string, FieldCleaner>>;
	/** The declared view, carried in the field `field` (default `view`). */
	view?: { keys: AnyViewKeys; field?: string };
	/** Whether a client's clock is acceptable (the stream refuses a forged jump). Default: any. */
	clockOk?: (client: number, clock: number) => boolean;
	/** Told which view keys were dropped, so a schema mistake is visible. */
	onDrop?: (from: PeerId, keys: string[]) => void;
};

const RESERVED = new Set(['peer', 'user']);
const utf8 = new TextDecoder();

/** Every entry the gate keeps from `update`, rebuilt; null when nothing decodes or the update is oversize. */
export function sanitizeEntries(update: Uint8Array, from: PeerId, o: SanitizeOptions): Entry[] | null {
	const { member } = o;
	if (!member || update.length === 0 || update.length > MAX_UPDATE_BYTES) return null;
	const viewField = o.view?.field ?? 'view';
	for (const name of Object.keys(o.fields)) if (RESERVED.has(name) || name === viewField) throw new Error(`a field cleaner cannot be named ${name}`);
	const out: Entry[] = [];
	const seen = new Set<number>();
	try {
		const dec = decoding.createDecoder(update);
		const n = decoding.readVarUint(dec);
		if (n > MAX_ENTRIES) return null;
		for (let i = 0; i < n; i++) {
			const client = decoding.readVarUint(dec);
			const clock = decoding.readVarUint(dec);
			// The entry's length is read first and refused over the limit before any JSON is parsed.
			const bytes = decoding.readVarUint8Array(dec);
			if (bytes.length > MAX_ENTRY_BYTES || o.ownerOf(client) !== from || seen.has(client)) continue;
			if (o.clockOk && !o.clockOk(client, clock)) continue;
			let raw: unknown;
			try {
				raw = JSON.parse(utf8.decode(bytes));
			} catch {
				continue;
			}
			if (raw === null) {
				seen.add(client);
				out.push({ client, clock, state: null });
				continue;
			}
			if (typeof raw !== 'object' || Array.isArray(raw)) continue;
			const st = raw as State;
			const clean: State = {};
			for (const [name, cleaner] of Object.entries(o.fields)) {
				if (!Object.hasOwn(st, name)) continue;
				const got = cleaner(st[name], member, st);
				if (got !== undefined) clean[name] = got;
			}
			if (o.view) {
				const { view, dropped } = cleanView(st[viewField], o.view.keys);
				if (dropped.length) o.onDrop?.(from, dropped);
				if (Object.keys(view).length) clean[viewField] = view;
			}
			// Identity last: nothing above can have set it.
			Object.assign(clean, o.identity(member), { peer: from });
			seen.add(client);
			out.push({ client, clock, state: clean });
		}
	} catch {
		return null;
	}
	return out.length ? out : null;
}

/** Entries back to the bytes y-protocols reads. */
export function encodeEntries(entries: readonly Entry[]): Uint8Array {
	const enc = encoding.createEncoder();
	encoding.writeVarUint(enc, entries.length);
	for (const e of entries) {
		encoding.writeVarUint(enc, e.client);
		encoding.writeVarUint(enc, e.clock);
		encoding.writeVarString(enc, JSON.stringify(e.state));
	}
	return encoding.toUint8Array(enc);
}

/** `sanitizeEntries`, encoded: what an app compares against its own reference in a test. */
export function sanitizeAwarenessUpdate(update: Uint8Array, from: PeerId, o: SanitizeOptions): Uint8Array | null {
	const entries = sanitizeEntries(update, from, o);
	return entries ? encodeEntries(entries) : null;
}

export type YjsAwarenessOptions = Omit<SanitizeOptions, 'member' | 'clockOk' | 'onDrop'> & {
	/** The roster row for a transport id. */
	memberOf: (peer: PeerId) => Member | undefined;
	/** May this view key be sent right now? Asked at FLUSH time, so a write queued before a person turned a
	 *  privacy switch off can never put the field back. Default: yes. */
	allow?: (key: string) => boolean;
	/** Told which view keys the gate dropped, by sender. */
	onDrop?: (from: PeerId, keys: string[]) => void;
	now?: () => number;
	setTimeout?: (fn: () => void, ms: number) => unknown;
	clearTimeout?: (handle: unknown) => void;
};

/** A peer's view, as the gate left it. */
export type PeerView = { get(key: string): unknown; all(): Record<string, unknown> };

export type YjsAwareness = {
	/** Hand this to `createSession({ awareness })`. */
	stream: Stream;
	/** The peer each awareness client id was last accepted for (the roster bound them). Read-only. */
	owner: ReadonlyMap<number, PeerId>;
	view: {
		/** Show `value` under `key` (checked against the declared schema). Coalesced to a few writes a second. */
		set(key: string, value: unknown): boolean;
		/** Stop showing `key`. */
		clear(key: string): void;
		/** Write now what `set` queued (tests, and a person leaving). */
		flush(): void;
		/** What `peer` shows, or an empty view. */
		of(peer: PeerId): PeerView;
		/** Called when anyone's awareness changed. */
		onChange(cb: () => void): () => void;
	};
};

/** Awareness as a Tavola `Stream`, behind the gate above, plus the typed view. */
export function yjsAwareness(aw: Awareness, o: YjsAwarenessOptions): YjsAwareness {
	const now = o.now ?? (() => Date.now());
	const later = o.setTimeout ?? ((fn: () => void, ms: number) => globalThis.setTimeout(fn, ms));
	const cancel = o.clearTimeout ?? ((h: unknown) => globalThis.clearTimeout(h as ReturnType<typeof setTimeout>));
	const viewField = o.view?.field ?? 'view';
	/** The peer each client id was last applied for. */
	const owner = new Map<number, PeerId>();
	/** Per client: the state minus the caret, as last applied; how long ago we applied a non-caret change. */
	const lastShape = new Map<number, string>();
	const lastAt = new Map<PeerId, number>();
	const pending = new Map<PeerId, Map<number, Entry>>();
	const timers = new Map<PeerId, unknown>();

	const shapeOf = (s: State) => {
		const { cursor: _cursor, ...rest } = s;
		return JSON.stringify(rest);
	};
	const clockOk = (client: number, clock: number) => {
		const cur = aw.meta.get(client)?.clock;
		return cur === undefined || clock <= cur + MAX_CLOCK_JUMP;
	};
	const sanitizeOpts = (from: PeerId): SanitizeOptions => ({ ...o, member: o.memberOf(from), clockOk, onDrop: o.onDrop });

	const apply = (e: Entry, from: PeerId) => {
		// A client id that now speaks for someone else starts from nothing: an old clock record must not
		// out-rank the new owner's updates.
		const prev = owner.get(e.client);
		if (prev !== undefined && prev !== from) {
			aw.meta.delete(e.client);
			lastShape.delete(e.client);
		}
		if (e.state === null) {
			owner.delete(e.client);
			lastShape.delete(e.client);
		} else owner.set(e.client, from);
		applyAwarenessUpdate(aw, encodeEntries([e]), from);
		if (e.state) lastShape.set(e.client, shapeOf(e.state));
	};
	const flushPending = (from: PeerId) => {
		timers.delete(from);
		const held = pending.get(from);
		if (!held) return;
		pending.delete(from);
		lastAt.set(from, now());
		for (const e of held.values()) apply(e, from);
	};

	const viewSchemas = o.view?.keys;
	const local: State = {};
	let sent = '';
	let sendTimer: unknown = null;
	let lastSend = 0;
	const flushLocal = () => {
		sendTimer = null;
		if (!viewSchemas) return;
		const out: State = {};
		for (const k of Object.keys(local)) if (o.allow?.(k) ?? true) out[k] = local[k];
		const json = JSON.stringify(out);
		if (json === sent) return;
		sent = json;
		lastSend = now();
		aw.setLocalStateField(viewField, out);
	};
	const scheduleLocal = () => {
		if (sendTimer !== null) return;
		const wait = Math.max(0, lastSend + SEND_MIN_MS - now());
		if (wait === 0) flushLocal();
		else sendTimer = later(flushLocal, wait);
	};

	const stream: Stream = {
		encodeAll: () => encodeAwarenessUpdate(aw, [aw.clientID]),
		applyRemote(u, from) {
			const entries = sanitizeEntries(u, from, sanitizeOpts(from));
			if (!entries) return;
			const t = now();
			const last = lastAt.get(from) ?? -Infinity;
			for (const e of entries) {
				// A removal, a first sight, a caret-only change and a state we are not behind on are applied now.
				const same = e.state !== null && lastShape.get(e.client) === shapeOf(e.state);
				if (e.state === null || same || t - last >= RATE_MIN_MS) {
					pending.get(from)?.delete(e.client);
					if (e.state !== null && !same) lastAt.set(from, t);
					apply(e, from);
				} else {
					let held = pending.get(from);
					if (!held) pending.set(from, (held = new Map()));
					held.set(e.client, e);
					if (!timers.has(from)) timers.set(from, later(() => flushPending(from), RATE_MIN_MS - (t - last)));
				}
			}
		},
		onLocal(cb) {
			const h = ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => {
				if (origin !== 'local') return;
				const mine = [...added, ...updated, ...removed].filter((c) => c === aw.clientID);
				if (mine.length) cb(encodeAwarenessUpdate(aw, mine));
			};
			aw.on('update', h);
			return () => aw.off('update', h);
		},
		forget(peer) {
			const ids = [...owner].filter(([, p]) => p === peer).map(([c]) => c);
			const t = timers.get(peer);
			if (t !== undefined) cancel(t);
			timers.delete(peer);
			pending.delete(peer);
			lastAt.delete(peer);
			for (const c of ids) {
				owner.delete(c);
				lastShape.delete(c);
			}
			if (ids.length) removeAwarenessStates(aw, ids, 'tavola');
			// The clock record goes with the state: a returning member's first update must not lose to a stale one.
			for (const c of ids) aw.meta.delete(c);
		},
	};

	const peerView = (peer: PeerId): PeerView => {
		const all = () => {
			for (const [client, p] of owner) {
				if (p !== peer) continue;
				const v = (aw.getStates().get(client) as State | undefined)?.[viewField];
				if (v && typeof v === 'object') return v as Record<string, unknown>;
			}
			return {};
		};
		return { get: (key) => (Object.hasOwn(all(), key) ? all()[key] : undefined), all };
	};

	return {
		stream,
		owner,
		view: {
			set(key, value) {
				const schema = viewSchemas?.schemas.get(key);
				if (!schema) return false;
				const clean = schema(value);
				if (clean === undefined) return false;
				local[key] = clean;
				scheduleLocal();
				return true;
			},
			clear(key) {
				delete local[key];
				scheduleLocal();
			},
			flush() {
				if (sendTimer !== null) cancel(sendTimer);
				flushLocal();
			},
			of: peerView,
			onChange(cb) {
				aw.on('change', cb);
				return () => aw.off('change', cb);
			},
		},
	};
}
