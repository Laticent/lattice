#!/usr/bin/env node
/**
 * build-library-marks — write each library's colors into its brand SVGs from ONE source.
 *
 * Source: docs/src/lib/library-palettes.json (roles per library). Generator:
 * docs/src/lib/library-palette.mjs `markStyle`. Output: the inline <style> of
 * docs/public/<lib>-mark.svg, -mark-min.svg and -lockup.svg. Everything outside the <style> is
 * left as drawn, so geometry is still edited by hand and color only in the palette file.
 *
 * Usage:
 *   node tools/build-library-marks.js            rewrite the SVGs
 *   node tools/build-library-marks.js --check    exit 1 if any SVG differs from the palette
 */
const fs = require('node:fs');
const path = require('node:path');

const PUBLIC = path.join(__dirname, '..', 'docs', 'public');
const VARIANTS = ['mark', 'mark-min', 'lockup'];
const STYLE = /<style>.*?<\/style>/s;

async function run(check) {
  const { libraries, markStyle } = await import('../docs/src/lib/library-palette.mjs');
  const drift = [];
  for (const lib of libraries) {
    const style = `<style>${markStyle(lib)}</style>`;
    for (const v of VARIANTS) {
      const file = path.join(PUBLIC, `${lib}-${v}.svg`);
      if (!fs.existsSync(file)) continue;
      const src = fs.readFileSync(file, 'utf8');
      if (!STYLE.test(src)) throw new Error(`${file}: no <style> to replace`);
      const out = src.replace(STYLE, () => style);
      if (out === src) continue;
      drift.push(path.relative(process.cwd(), file));
      if (!check) fs.writeFileSync(file, out);
    }
  }
  if (check && drift.length) {
    console.error(`library marks differ from library-palettes.json:\n  ${drift.join('\n  ')}\nrun: node tools/build-library-marks.js`);
    process.exit(1);
  }
  console.log(check ? 'library marks match the palette' : `rewrote ${drift.length} file(s)`);
}

run(process.argv.includes('--check')).catch((e) => { console.error(e.message); process.exit(1); });
