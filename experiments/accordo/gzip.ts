/** Gzip length of a string or bytes, or NaN where Node's zlib is absent (a browser): sizes are a Node measurement. */
type Zlib = { gzipSync(b: Uint8Array | string): Uint8Array };
const zlib = (globalThis as { process?: { getBuiltinModule?(m: string): unknown } }).process?.getBuiltinModule?.('node:zlib') as Zlib | undefined;
export const gzipLength = (b: Uint8Array | string): number => (zlib ? zlib.gzipSync(b).length : Number.NaN);
