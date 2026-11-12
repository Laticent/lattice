/**
 * ACCORDO, round 4 (prototype for the bake-off in engineering/decisions/2026-11-12-chat-threads-crdt.md §10): a replicated, ordered
 * list of records. General-purpose, zero dependencies, no DOM. Several replicas (tabs, devices) edit their own copy and
 * exchange changes in any order, any number of times, with a change lost and resent later; every replica that has seen
 * the same changes holds the same list.
 *
 * Round 1 (fractional position keys, a deleted set resent whole, a high-water version vector) failed its audit three
 * ways: concurrent inserts interleaved and replies landed after the wrong question; every delta carried the whole
 * deleted set; and one lost broadcast diverged a replica for good. Round 2 replaces all three:
 *
 *   · ORDER is a tree (the RGA scheme): every record names the record it was inserted after (its ORIGIN). The list is a
 *     depth-first walk of the tree, a record's children newest first, so a record inserted after X sits directly after
 *     X, and two replicas' inserts after one record each keep their own run instead of interleaving. A deleted record
 *     stays in the tree as a small tombstone, because a later insert may name it as an origin.
 *   · Every change (insert, field write, delete) carries a SEQUENCE number per replica, 1, 2, 3 … with no gaps, beside a
 *     Lamport counter for last-writer-wins. A replica's version vector records, per origin replica, the highest
 *     sequence it holds WITH NOTHING MISSING below it. A change that arrives after a gap is still applied (merging is
 *     order-free), but the vector does not move past the gap, so the next pull asks for the missing change again.
 *   · A DELTA is every change whose sequence is above the receiver's vector; no deleted set rides along.
 *   · FIELDS are last-writer-wins on (Lamport counter, replica id); a DELETE is final (remove-wins).
 *   · Values are copied in and out (JSON values), so a caller cannot change replica state without a stamp.
 * Merge is a join of states: commutative, associative, idempotent.
 */

type Stamp = { c: number; r: string; s: number }; // Lamport counter, replica id, per-replica sequence
type Field = { v: unknown; t: Stamp };
type Node = {
	id: string; // `<sequence base36>.<replica>` of the insert: unique, and derived from the stamp
	origin: string | null; // the record this one was inserted after (null: the start)
	tail?: true; // an APPEND: it yields to concurrent inserts after the same origin (see `push`)
	t: Stamp; // the insert
	f: Map<string, Field>; // emptied on delete
	del?: Stamp;
};
export type VersionVector = Record<string, number>;

/** Wire form. Replica ids are interned in `r`; a stamp is [lamport, replicaIndex, sequence]. */
type WStamp = [number, number, number];
type WField = [WStamp] | [WStamp, unknown]; // [stamp] alone: the field was cleared
/** A record on the wire. `whole` 1: the row carries the insert (all the record's fields); 0: only changed fields. A
 *  replica that lacks the record ignores a partial row, so it does not half-create it; a later pull sends it whole. */
type WNode = [id: string, origin: string | null, t: WStamp, fields: Record<string, WField>, whole: 0 | 1 | 2, del?: WStamp];
/** `h` (a whole state only): the sender's held sequences per replica, [replicaIndex, upTo, ...above]. `d` (a delta
 *  only): sequences the sender holds but no longer stores, because a later write or a delete superseded them, as
 *  [replicaIndex, from, to] ranges. Without them a receiver could never hold those sequences, its version vector would
 *  stop below them for good, and every later pull would resend everything above (the round-2 audit's finding 1). */
export type Wire = { r: string[]; n: WNode[]; h?: number[][]; d?: [number, number, number][] };

const later = (a: Stamp, b: Stamp) => a.c > b.c || (a.c === b.c && a.r > b.r);
/** A JSON copy, primitives included, so a replica holds exactly what a peer will decode (NaN becomes null on both). */
const copy = <T>(v: T): T =>
	v === undefined || v === null || typeof v === 'string' || typeof v === 'boolean'
		? v
		: typeof v === 'number'
			? ((Number.isFinite(v) ? v : null) as T)
			: (JSON.parse(JSON.stringify(v)) as T);

/** 16 hex characters of randomness. `getRandomValues` exists in insecure contexts too, unlike `randomUUID`. */
function randomReplica(): string {
	const b = new Uint8Array(8);
	crypto.getRandomValues(b);
	return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

export class RecordList {
	readonly replica: string;
	private lamport = 0;
	private seq = 0;
	private nodes = new Map<string, Node>();
	private children = new Map<string | null, Node[]>(); // origin -> children, newest first
	/** Per replica: the highest sequence held with nothing missing below it, and the sequences held above that. */
	private held = new Map<string, { upTo: number; above: Set<number> }>();
	private order: Node[] | null = null;

	constructor(replica: string = randomReplica()) {
		this.replica = replica;
	}

	// ── Local edits ──────────────────────────────────────────────────────────────────────────
	private stamp(): Stamp {
		const t = { c: ++this.lamport, r: this.replica, s: ++this.seq };
		this.hold(t);
		return t;
	}
	/** Insert a record after `afterId` (null, or an unknown id: at the start). Returns its id. */
	insertAfter(afterId: string | null, fields: Record<string, unknown>): string {
		return this.insert(afterId, fields, false);
	}
	/**
	 * Append after the last live record. An append YIELDS: when another replica concurrently inserts after the same
	 * record (a reply to the question this append follows), the append goes after that insert, not between the record
	 * and it. So a reply stays next to its question while another tab sends the next question.
	 */
	push(fields: Record<string, unknown>): string {
		const all = this.live();
		return this.insert(all.length ? all[all.length - 1].id : null, fields, true);
	}
	private insert(afterId: string | null, fields: Record<string, unknown>, tail: boolean): string {
		const t = this.stamp();
		const id = `${t.s.toString(36)}.${t.r}`;
		const f = new Map<string, Field>();
		for (const [k, v] of Object.entries(fields)) f.set(k, { v: copy(v), t });
		this.add({ id, origin: afterId !== null && this.nodes.has(afterId) ? afterId : null, t, f, ...(tail ? { tail: true as const } : {}) });
		return id;
	}
	/** Set (or with `undefined`, clear) one field of a live record. */
	set(id: string, key: string, value: unknown): void {
		const n = this.nodes.get(id);
		if (!n || n.del) return;
		n.f.set(key, { v: copy(value), t: this.stamp() });
	}
	/** Delete a record. Final: no later write brings it back (remove-wins). */
	delete(id: string): void {
		const n = this.nodes.get(id);
		if (!n || n.del) return;
		n.del = this.stamp();
		n.f.clear();
		this.order = null;
	}

	// ── Structure ────────────────────────────────────────────────────────────────────────────
	private add(n: Node) {
		this.nodes.set(n.id, n);
		const sibs = this.children.get(n.origin) ?? [];
		// Inserts before appends; inserts newest first (a later insert after the same origin sits nearer to it), appends
		// oldest first. Ties by replica id, so every replica agrees.
		const before = (a: Node, b: Node) => (!!a.tail !== !!b.tail ? !a.tail : a.tail ? later(b.t, a.t) : later(a.t, b.t));
		let i = 0;
		while (i < sibs.length && before(sibs[i], n)) i++;
		sibs.splice(i, 0, n);
		this.children.set(n.origin, sibs);
		this.order = null;
	}
	/** Depth-first walk from the start: a node, then its children, newest first. Iterative, so a long chain cannot overflow. */
	private walk(): Node[] {
		if (this.order) return this.order;
		const out: Node[] = [];
		const roots = this.children.get(null) ?? [];
		const stack: Node[] = [];
		for (let i = roots.length - 1; i >= 0; i--) stack.push(roots[i]);
		while (stack.length) {
			const n = stack.pop() as Node;
			out.push(n);
			const kids = this.children.get(n.id);
			if (kids) for (let i = kids.length - 1; i >= 0; i--) stack.push(kids[i]);
		}
		this.order = out;
		return out;
	}
	private live(): Node[] {
		return this.walk().filter((n) => !n.del);
	}

	// ── Reading ──────────────────────────────────────────────────────────────────────────────
	/** The live records, in order, as fresh plain objects with their id. */
	toArray(): Array<Record<string, unknown> & { id: string }> {
		return this.live().map((n) => {
			const o: Record<string, unknown> = {};
			for (const [k, fld] of n.f) if (fld.v !== undefined) o[k] = copy(fld.v);
			o.id = n.id;
			return o as Record<string, unknown> & { id: string };
		});
	}
	versionVector(): VersionVector {
		const vv: VersionVector = {};
		for (const [r, h] of this.held) vv[r] = h.upTo;
		return vv;
	}

	// ── Sync ─────────────────────────────────────────────────────────────────────────────────
	private hold(t: Stamp) {
		if (t.c > this.lamport) this.lamport = t.c; // Lamport: never stamp below what we have seen
		this.holdSeq(t.r, t.s, t.s);
	}
	/** Hold sequences `from`..`to` of replica `r`. Reopening under this replica's own id resumes its sequence, so a new
	 *  insert never reuses an id (the round-2 audit's finding 2: a reused id made a cycle and `walk` threw). */
	private holdSeq(r: string, from: number, to: number) {
		if (r === this.replica && to > this.seq) this.seq = to;
		let h = this.held.get(r);
		if (!h) this.held.set(r, (h = { upTo: 0, above: new Set() }));
		if (to <= h.upTo) return;
		if (from > h.upTo + 1) for (let s = from; s <= to; s++) h.above.add(s);
		else {
			const was = h.upTo;
			h.upTo = to;
			// A range jumped past sequences already held above; drop those (a single step needs no sweep).
			if (to > was + 1) for (const s of h.above) if (s <= to) h.above.delete(s);
		}
		while (h.above.has(h.upTo + 1)) h.above.delete(++h.upTo);
	}
	/** Every change whose sequence is above `since` (all of them when omitted). */
	encode(since?: VersionVector): Wire {
		const table: string[] = [];
		const index = new Map<string, number>();
		const ws = (t: Stamp): WStamp => {
			let i = index.get(t.r);
			if (i === undefined) {
				i = table.length;
				table.push(t.r);
				index.set(t.r, i);
			}
			return [t.c, i, t.s];
		};
		const fresh = (t: Stamp) => !since || t.s > (since[t.r] ?? 0);
		const out: WNode[] = [];
		for (const n of this.nodes.values()) {
			const fields: Record<string, WField> = {};
			let any = fresh(n.t);
			for (const [k, fld] of n.f) {
				if (!fresh(fld.t)) continue;
				fields[k] = fld.v === undefined ? [ws(fld.t)] : [ws(fld.t), copy(fld.v)];
				any = true;
			}
			const whole = fresh(n.t);
			if (whole) for (const [k, fld] of n.f) if (!(k in fields)) fields[k] = fld.v === undefined ? [ws(fld.t)] : [ws(fld.t), copy(fld.v)];
			// A whole row always carries its delete: the receiver may already hold the delete's sequence (as a superseded
			// one, from a concurrent delete) without having the record, and would otherwise get it back alive (audit 3, #1).
			const sendDel = n.del !== undefined && (whole || fresh(n.del));
			if (!any && !sendDel) continue;
			const row: WNode = [n.id, n.origin, ws(n.t), fields, whole ? (n.tail ? 2 : 1) : 0];
			if (sendDel) row.push(ws(n.del as Stamp));
			out.push(row);
		}
		const wire: Wire = { r: table, n: out };
		const rIndex = (r: string) => ws({ c: 0, r, s: 0 })[1];
		if (!since) {
			// A whole state carries every stored record, so its receiver holds everything the sender holds.
			wire.h = [...this.held].map(([r, h]) => [rIndex(r), h.upTo, ...h.above]);
			return wire;
		}
		// A delta: sequences above `since` that the sender holds but no longer stores (superseded), as ranges.
		const live = new Map<string, Set<number>>();
		const mark = (t: Stamp) => {
			if (t.s <= (since[t.r] ?? 0)) return;
			let set = live.get(t.r);
			if (!set) live.set(t.r, (set = new Set()));
			set.add(t.s);
		};
		for (const n of this.nodes.values()) {
			mark(n.t);
			for (const fld of n.f.values()) mark(fld.t);
			if (n.del) mark(n.del);
		}
		const dead: [number, number, number][] = [];
		for (const [r, h] of this.held) {
			const lo = since[r] ?? 0;
			const set = live.get(r);
			const seqs = [...h.above].filter((x) => x > lo).sort((a, b) => a - b);
			const consider = (x: number) => {
				if (set?.has(x)) return;
				const last = dead[dead.length - 1];
				if (last && last[0] === rIndex(r) && last[2] === x - 1) last[2] = x;
				else dead.push([rIndex(r), x, x]);
			};
			for (let x = lo + 1; x <= h.upTo; x++) consider(x);
			for (const x of seqs) consider(x);
		}
		if (dead.length) wire.d = dead;
		return wire;
	}
	/** Merge a state or a delta from any replica. Commutative, associative, idempotent. */
	apply(w: Wire): void {
		const st = (s: WStamp): Stamp => ({ c: s[0], r: w.r[s[1]], s: s[2] });
		// Origins before the records inserted after them: a delta may carry both, in either order.
		// Each pass applies what it can and keeps the rest, in order, for the next (one rebuild per pass, not a splice per
		// row, which was quadratic on a large state: audit 3, #3).
		let pending = w.n;
		let progress = true;
		while (pending.length && progress) {
			progress = false;
			const waiting: WNode[] = [];
			for (const row of pending) {
				const [id, origin, wt, fields, whole, wdel] = row;
				let n = this.nodes.get(id);
				if (!n) {
					// A partial row for a record never seen: skip it, holding nothing, so a later pull sends it whole.
					if (!whole) continue;
					if (origin !== null && !this.nodes.has(origin)) {
						waiting.push(row); // its origin has not arrived yet
						continue;
					}
					const t = st(wt);
					this.hold(t);
					n = { id, origin, t, f: new Map(), ...(whole === 2 ? { tail: true as const } : {}) };
					this.add(n);
				}
				for (const wf of Object.values(fields)) this.hold(st(wf[0]));
				if (wdel) this.hold(st(wdel));
				// Two replicas may delete one record concurrently. Every replica keeps the LATER delete stamp, so all agree on
				// which one is stored and which is superseded (keeping the first to arrive let them disagree: audit 3, #1).
				if (wdel && (!n.del || later(st(wdel), n.del))) {
					n.del = st(wdel);
					n.f.clear();
					this.order = null;
				}
				if (!n.del)
					for (const [k, wf] of Object.entries(fields)) {
						const ft = st(wf[0]);
						const old = n.f.get(k);
						if (!old || later(ft, old.t)) n.f.set(k, { v: wf.length > 1 ? copy(wf[1]) : undefined, t: ft });
					}
				progress = true;
			}
			pending = waiting;
		}
		// A record whose origin never arrived stays out, and its changes stay unheld, so the next pull resends them.
		// Superseded sequences: their effect is overruled by stamps the receiver holds or will be sent, so hold them.
		for (const [ri, from, to] of w.d ?? []) this.holdSeq(w.r[ri], from, to);
		// A whole state: every row applied (all origins are in it), so hold what the sender held.
		if (w.h && !pending.length)
			for (const [ri, upTo, ...above] of w.h) {
				if (upTo > 0) this.holdSeq(w.r[ri], 1, upTo);
				for (const x of above) this.holdSeq(w.r[ri], x, x);
			}
	}

	/**
	 * A replica from a stored state. Pass `replica` only to reopen a replica from its LATEST state: changes it made after
	 * an older save would be minted again with the same ids and different content (audit of round 3, finding 2). When
	 * in doubt, omit it and take a fresh id, as the bake-off does.
	 */
	static decode(w: Wire, replica?: string): RecordList {
		const l = new RecordList(replica);
		l.apply(w);
		return l;
	}
}
