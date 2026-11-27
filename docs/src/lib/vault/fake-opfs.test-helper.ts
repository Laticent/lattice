/**
 * A stand-in for an OPFS directory, enough of FileSystemDirectoryHandle / FileSystemFileHandle for the
 * vault's blob store and its write core to run under Node. `sync: true` gives file handles
 * `createSyncAccessHandle` (the worker path); `sync: false` leaves only `createWritable`.
 * `failAfter` makes the Nth write throw halfway through, leaving the bytes written so far: a torn write.
 */
type Node = { kind: 'file'; name: string; bytes: Uint8Array } | { kind: 'directory'; name: string; children: Map<string, Node> };

const notFound = (name: string) => Object.assign(new Error(`${name} not found`), { name: 'NotFoundError' });

export interface FakeOpfs {
	root: FileSystemDirectoryHandle;
	/** Every file's bytes by its path from the root. */
	files(): Map<string, Uint8Array>;
	/** Writes so far; set `tearOn` to the 1-based write that should tear. */
	writes: number;
	tearOn: number;
}

export function fakeOpfs({ sync }: { sync: boolean }): FakeOpfs {
	const state: FakeOpfs = { root: null as unknown as FileSystemDirectoryHandle, files: () => new Map(), writes: 0, tearOn: 0 };
	const top: Node = { kind: 'directory', name: '', children: new Map() };

	const fileHandle = (node: Extract<Node, { kind: 'file' }>) => {
		const h: Record<string, unknown> = {
			kind: 'file',
			name: node.name,
			async getFile() {
				return new File([new Uint8Array(node.bytes)], node.name);
			},
			async createWritable() {
				const chunks: Uint8Array[] = [];
				return {
					async write(b: Uint8Array) {
						chunks.push(new Uint8Array(b));
					},
					async close() {
						const n = ++state.writes;
						const all = new Uint8Array(chunks.reduce((s, c) => s + c.byteLength, 0));
						let o = 0;
						for (const c of chunks) {
							all.set(c, o);
							o += c.byteLength;
						}
						if (n === state.tearOn) {
							node.bytes = all.slice(0, all.byteLength >> 1);
							throw new Error('torn write');
						}
						node.bytes = all;
					},
					async abort() {},
				};
			},
		};
		if (sync) {
			h.createSyncAccessHandle = async () => {
				let buf = new Uint8Array(node.bytes);
				const n = ++state.writes;
				return {
					truncate(size: number) {
						buf = buf.slice(0, size);
					},
					write(b: Uint8Array, { at = 0 }: { at?: number } = {}) {
						const take = n === state.tearOn ? b.byteLength >> 1 : b.byteLength;
						const next = new Uint8Array(Math.max(buf.byteLength, at + take));
						next.set(buf);
						next.set(b.subarray(0, take), at);
						buf = next;
						node.bytes = buf;
						if (n === state.tearOn) throw new Error('torn write');
						return take;
					},
					flush() {
						node.bytes = buf;
					},
					close() {},
				};
			};
		}
		return h as unknown as FileSystemFileHandle;
	};

	const dirHandle = (node: Extract<Node, { kind: 'directory' }>): FileSystemDirectoryHandle => {
		const h = {
			kind: 'directory',
			name: node.name,
			async getDirectoryHandle(name: string, { create = false } = {}) {
				let c = node.children.get(name);
				if (!c) {
					if (!create) throw notFound(name);
					c = { kind: 'directory', name, children: new Map() };
					node.children.set(name, c);
				}
				if (c.kind !== 'directory') throw Object.assign(new Error('not a directory'), { name: 'TypeMismatchError' });
				return dirHandle(c);
			},
			async getFileHandle(name: string, { create = false } = {}) {
				let c = node.children.get(name);
				if (!c) {
					if (!create) throw notFound(name);
					c = { kind: 'file', name, bytes: new Uint8Array() };
					node.children.set(name, c);
				}
				if (c.kind !== 'file') throw Object.assign(new Error('not a file'), { name: 'TypeMismatchError' });
				return fileHandle(c);
			},
			async removeEntry(name: string) {
				if (!node.children.delete(name)) throw notFound(name);
			},
			async *values() {
				for (const c of node.children.values()) yield c.kind === 'file' ? fileHandle(c) : dirHandle(c);
			},
		};
		return h as unknown as FileSystemDirectoryHandle;
	};

	state.root = dirHandle(top);
	state.files = () => {
		const out = new Map<string, Uint8Array>();
		const walk = (n: Node, at: string) => {
			if (n.kind === 'file') out.set(at, n.bytes);
			else for (const c of n.children.values()) walk(c, at ? `${at}/${c.name}` : c.name);
		};
		walk(top, '');
		return out;
	};
	return state;
}
