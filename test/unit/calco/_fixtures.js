// Shared fixtures for the Calco unit tests.
const fs = require('node:fs');
const path = require('node:path');

/** A minimal valid 1×1 PNG. */
const ONE_PX_PNG = new Uint8Array(Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC',
  'base64',
));

/** A minimal valid JPEG. */
const ONE_PX_JPEG = new Uint8Array(Buffer.from(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAACAAIDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDwKiiivzI/uM//2Q==',
  'base64',
));

function style(over = {}) {
  return {
    family: 'Outfit', weight: 400, italic: false, size: 28, color: '#112233', alpha: 1,
    letterSpacing: 0, transform: 'none', underline: false, strike: false, ligatures: true, ...over,
  };
}

function frame(lines, over = {}) {
  return { x: 100, y: 200, w: 600, h: 40 * lines.length, firstLineHeight: 35, lineHeight: 40, align: 'left', lines, ...over };
}

/** A real static TrueType face, decoded from the shipped woff2. */
async function ttf(file = 'outfit-400') {
  const { default: decompress } = await import(path.join(__dirname, '../../../node_modules/woff2-encoder/dist/decompress.js'));
  return new Uint8Array(await decompress(fs.readFileSync(path.join(__dirname, '../../../assets/fonts', `${file}.woff2`))));
}

/**
 * A minimal sfnt with only head, hhea and OS/2 — enough for the metric and license reads.
 * `hhea` and the typographic metrics DIFFER, so a read from the wrong table (or offset)
 * fails the test, which the real Outfit face (hhea == typo) could not show.
 */
function synthFont({ useTypo = true, fsType = 0, headAt, hheaAt } = {}) {
  const tables = { head: 54, hhea: 36, 'OS/2': 78 };
  const names = Object.keys(tables);
  const dirLen = 12 + names.length * 16;
  const offsets = {};
  let at = dirLen;
  for (const n of names) { offsets[n] = at; at += tables[n]; }
  const buf = new Uint8Array(at);
  const v = new DataView(buf.buffer);
  v.setUint32(0, 0x00010000);
  v.setUint16(4, names.length);
  names.forEach((n, i) => {
    const rec = 12 + i * 16;
    for (let k = 0; k < 4; k++) buf[rec + k] = n.charCodeAt(k);
    const off = n === 'head' && headAt !== undefined ? headAt : n === 'hhea' && hheaAt !== undefined ? hheaAt : offsets[n];
    v.setUint32(rec + 8, off);
    v.setUint32(rec + 12, tables[n]);
  });
  v.setUint16(offsets.head + 18, 2000); // unitsPerEm
  v.setInt16(offsets.hhea + 4, 1800); // hhea ascent  → 0.9
  v.setInt16(offsets.hhea + 6, -400); // hhea descent → 0.2
  v.setUint16(offsets['OS/2'] + 8, fsType);
  v.setUint16(offsets['OS/2'] + 62, useTypo ? 0x80 : 0); // fsSelection USE_TYPO_METRICS
  v.setInt16(offsets['OS/2'] + 68, 1600); // typo ascender  → 0.8
  v.setInt16(offsets['OS/2'] + 70, -600); // typo descender → 0.3
  return buf;
}

module.exports = { ONE_PX_PNG, ONE_PX_JPEG, style, frame, ttf, synthFont };
