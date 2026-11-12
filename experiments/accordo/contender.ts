/** The interface both bake-off contenders implement, so every workload runs the same calls through each. */
export interface Contender {
	name: string;
	push(fields: Record<string, unknown>): string;
	insertAfter(afterId: string | null, fields: Record<string, unknown>): string;
	set(id: string, key: string, value: unknown): void;
	delete(id: string): void;
	/** Delete `count` live records starting at live index `from` (a compaction, the cap). */
	deleteRange(from: number, count: number): void;
	toArray(): Array<Record<string, unknown> & { id: string }>;
	/** The whole state, as stored. */
	encode(): unknown;
	/** A token naming what this replica has seen. */
	since(): unknown;
	/** What `token`'s holder has not seen: the delta a tab would broadcast. */
	encodeSince(token: unknown): unknown;
	apply(update: unknown): void;
	/** Stored or sent size of an encoded state or delta, in bytes. */
	bytes(update: unknown): number;
	/** A fresh replica built from a stored state (opening a thread). */
	load(update: unknown): Contender;
	/** Run several edits as one unit (Yjs: one transaction, one update; Accordo: no difference). */
	transact(fn: () => void): void;
	/** Stored size in other encodings, for the size table: name -> bytes. */
	sizes(): Record<string, number>;
}
