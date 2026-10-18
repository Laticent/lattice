// Globals the bundled `subset-font` chain expects from Node: `Buffer` (from the `buffer`
// package) and `require.resolve`, which it calls only to name the wasm the fs shim returns.
export { Buffer } from 'buffer';
export const __lpRequireResolve = (id) => id;
