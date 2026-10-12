// Tiny but STRUCTURALLY VALID images for tests. A restore parses what it stores (media-scrub.ts), so a few
// signature bytes are no longer enough: these walk as real PNG, WebP and JPEG files. `seed` makes the bytes
// differ so two photos are two photos. Not imported by app code.
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));
const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const le32 = (n: number) => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255];

export const pngChunk = (type: string, data: number[]) => [...be32(data.length), ...ascii(type), ...data, 0, 0, 0, 0];
export function png(seed = 1, extra: number[][] = []): Uint8Array {
	return new Uint8Array([0x89, ...ascii('PNG'), 13, 10, 26, 10, ...pngChunk('IHDR', [0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0]), ...extra.flat(), ...pngChunk('IDAT', [seed, 2, 3, 4]), ...pngChunk('IEND', [])]);
}

export const webpChunk = (type: string, data: number[]) => [...ascii(type), ...le32(data.length), ...data, ...(data.length & 1 ? [0] : [])];
export function webp(seed = 1, chunks: number[][] = [], flags = 0): Uint8Array {
	const body = [...ascii('WEBP'), ...webpChunk('VP8X', [flags, 0, 0, 0, 0, 0, 0, 0, 0, 0]), ...webpChunk('VP8 ', [seed, 9, 9, 9]), ...chunks.flat()];
	return new Uint8Array([...ascii('RIFF'), ...le32(body.length), ...body]);
}

/** SOI, optional extra segments, a JFIF APP0, a start-of-scan header and some scan bytes, EOI. */
export function jpeg(seed = 1, segments: number[][] = []): Uint8Array {
	const seg = (marker: number, data: number[]) => [0xff, marker, (data.length + 2) >> 8, (data.length + 2) & 255, ...data];
	return new Uint8Array([0xff, 0xd8, ...seg(0xe0, [...ascii('JFIF'), 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]), ...segments.flat(), ...seg(0xda, [1, 1, 0, 0, 63, 0]), seed, 1, 2, 3, 0xff, 0xd9]);
}
export const jpegSegment = (marker: number, data: number[]) => [0xff, marker, (data.length + 2) >> 8, (data.length + 2) & 255, ...data];
