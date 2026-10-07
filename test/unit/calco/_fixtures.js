// Shared fixtures for the Calco unit tests.
const fs = require('node:fs');
const path = require('node:path');

/** A minimal valid 1×1 PNG. */
const ONE_PX_PNG = new Uint8Array(Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC',
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

module.exports = { ONE_PX_PNG, style, frame, ttf };
