/**
 * lib/fonts/subset-color.js — cut a COLOR font (Noto Color Emoji) down to the characters a file uses.
 *
 * `subset-font` drives HarfBuzz's stock wasm, which has no color tables, so it turns every emoji blank. This runs
 * the same calls over lib/fonts/hb/hb-subset-color.wasm instead (see the README beside it). The call sequence is
 * subset-font's (Copyright (c) 2012, Andreas Lind Petersen, BSD-3-Clause), cut to what we need: keep every layout
 * feature, add the code points, subset, convert back to the caller's format.
 *
 * The host supplies the wasm bytes with `setColorWasm` (the Studio fetches them); the CLI falls back to the file
 * on disk. Same code, same bytes, in both hosts.
 */

const fontverter = require('fontverter');

let wasmBytes = null;
let ready = null;

function setColorWasm(bytes) {
  wasmBytes = bytes;
  ready = null;
}

async function loadWasm() {
  if (!wasmBytes) {
    // `fs` is a stand-in with no file system in the Studio bundle; the host calls setColorWasm first there.
    // From source the wasm sits beside this file; the published CLI is ONE bundle (dist/lattice.js), where `__dirname` is dist/ and
    // the wasm ships in the package's lib/ (package.json `files`).
    const fs = require('fs');
    const path = require('path');
    const found = [path.join(__dirname, 'hb'), path.join(__dirname, '..', 'lib', 'fonts', 'hb'), path.join(__dirname, '..', '..', 'lib', 'fonts', 'hb')]
      .map((d) => path.join(d, 'hb-subset-color.wasm'))
      .find((f) => fs.existsSync(f));
    if (!found) throw new Error('hb-subset-color.wasm not found next to the engine');
    wasmBytes = fs.readFileSync(found);
  }
  const { instance } = await WebAssembly.instantiate(wasmBytes);
  const exp = instance.exports;
  return { exp, heap: () => new Uint8Array(exp.memory.buffer) };
}

// One job at a time: the wasm heap is shared.
let queue = Promise.resolve();

async function run(font, text, targetFormat) {
  ready ||= loadWasm();
  const { exp, heap } = await ready;
  const ttf = await fontverter.convert(font, 'truetype');
  const input = exp.hb_subset_input_create_or_fail();
  if (input === 0) throw new Error('hb_subset_input_create_or_fail returned zero');
  const fontBuffer = exp.malloc(ttf.byteLength);
  // The heap is fixed (65 MB, it does not grow): a font that does not fit makes malloc return 0, and writing at 0 would trap.
  if (fontBuffer === 0) {
    exp.hb_subset_input_destroy(input);
    throw new Error(`font too large for the subsetter (${ttf.byteLength} bytes)`);
  }
  heap().set(new Uint8Array(ttf), fontBuffer);
  const blob = exp.hb_blob_create(fontBuffer, ttf.byteLength, 2, 0, 0);
  const face = exp.hb_face_create(blob, 0);
  exp.hb_blob_destroy(blob);
  // The equivalent of `--font-features=*`.
  const features = exp.hb_subset_input_set(input, 6);
  exp.hb_set_clear(features);
  exp.hb_set_invert(features);
  const unicodes = exp.hb_subset_input_unicode_set(input);
  for (const c of text) exp.hb_set_add(unicodes, c.codePointAt(0));
  let subset = 0;
  try {
    subset = exp.hb_subset_or_fail(face, input);
  } finally {
    exp.hb_subset_input_destroy(input);
  }
  if (subset === 0) {
    exp.hb_face_destroy(face);
    exp.free(fontBuffer);
    throw new Error('hb_subset_or_fail returned zero: is the font damaged?');
  }
  const result = exp.hb_face_reference_blob(subset);
  const offset = exp.hb_blob_get_data(result, 0);
  const length = exp.hb_blob_get_length(result);
  const out = Buffer.from(heap().subarray(offset, offset + length));
  exp.hb_blob_destroy(result);
  exp.hb_face_destroy(subset);
  exp.hb_face_destroy(face);
  exp.free(fontBuffer);
  if (length === 0) throw new Error('empty subset');
  return fontverter.convert(out, targetFormat, 'truetype');
}

/**
 * @param {Uint8Array|Buffer} font  a woff2, woff or TrueType color font
 * @param {string} text  the characters to keep (include U+200D and U+FE0F when sequences use them)
 * @param {{ targetFormat?: string }} [opts]  default: the input's own format
 * @returns {Promise<Buffer>}
 */
function subsetColorFont(font, text, { targetFormat = fontverter.detectFormat(font) } = {}) {
  const job = queue.then(() =>
    run(font, text, targetFormat).catch((err) => {
      // A trap leaves the instance's heap in an unknown state: start the next job on a fresh one.
      ready = null;
      throw err;
    }),
  );
  queue = job.catch(() => {});
  return job;
}

module.exports = { subsetColorFont, setColorWasm };
