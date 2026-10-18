// The browser stand-in for `fs` inside the player-prune bundle (tools/build-player-prune.js).
// `subset-font` reads HarfBuzz's wasm with `fs.promises.readFile(require.resolve(…))`; in the
// Studio there is no file system, so the host fetches the wasm and hands it over with
// `setSubsetWasm` first. Nothing else in the bundle touches `fs`.
let wasm = null;
export function setSubsetWasm(bytes) {
	wasm = bytes;
}
export const promises = {
	async readFile() {
		if (!wasm) throw new Error('player subset: call setSubsetWasm() with hb-subset.wasm first');
		return wasm;
	},
};
export function readFileSync() {
	throw new Error('player subset: no file system in the browser');
}
export default { promises, readFileSync };
