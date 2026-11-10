/**
 * `THIRD-PARTY-LICENSES.txt` — the verbatim license texts of every third-party file an exported
 * Marp bundle or the Marp kit redistributes, concatenated into one file.
 *
 * MIT says "this permission notice shall be included in all copies". OFL 1.1 says the license
 * must accompany the fonts. A table that names the licenses is necessary and not sufficient: the
 * TEXT has to travel with the files. The kit's first cut shipped only the table (#1325), and the
 * Export-to-Marp bundle shipped nothing at all until #1354.
 *
 * ONE TEXT, THREE SHIPPERS. tools/build-third-party-licenses.js writes this text to
 * `dist/THIRD-PARTY-LICENSES.txt`; `STATIC_ASSETS` (lib/export/marp-bundle.js) lists that file, so
 * the CLI export (tools/export-marp.js), the Studio's in-browser export (which fetches it from
 * export/ by basename, staged by docs/scripts/sync-playground-assets.mjs) and the Marp kit
 * (tools/build-marp-kit.js) all carry the same bytes. The file names below are the names the
 * bundle and the kit both give those files.
 *
 * fs-free: the caller passes `read(name)`, which returns the text of `assets/licenses/<name>`.
 */

/** The license files this text reads from assets/licenses/, in the order it prints them. */
const LICENSE_SOURCES = Object.freeze([
  { file: 'MIT-mermaid.txt', heading: ['Mermaid — mermaid-v11-min.js'] },
  { file: 'MIT-katex.txt', heading: ['KaTeX — the fonts/KaTeX_*.woff2 faces'] },
  { file: 'MIT-dagre-d3-es.txt', heading: ['dagre-d3-es — the state-chart layout engine, shipped as lattice-dagre-min.js'] },
  { file: 'MIT-tabler-icons.txt', heading: ['Tabler Icons — the icon drawings, shipped as lattice-plugin-icons.js'] },
  { file: 'MIT-lodash-es.txt', heading: ['Lodash — the subset dagre-d3-es pulls in, bundled into the same file'] },
  {
    file: 'OFL-1.1.txt',
    // OFL condition 2 asks for each family's copyright notice as well as the license. These are
    // the notices the font files carry in their own name table (ID 0), copied as they read there.
    heading: [
      'Outfit · Playfair Display · Newsreader · Fraunces · Barlow Condensed · Inter · JetBrains Mono · Caveat · Shantell Sans',
      'The remaining fonts/ faces, under the SIL Open Font License 1.1.',
      '',
      'Copyright 2021 The Outfit Project Authors (https://github.com/Outfitio/Outfit-Fonts)',
      'Copyright 2017 The Playfair Display Project Authors (https://github.com/clauseggers/Playfair-Display), with Reserved Font Name "Playfair Display".',
      'Copyright 2020 The Newsreader Project Authors (http://github.com/productiontype/Newsreader)',
      'Copyright 2020 The Fraunces Project Authors (github.com/undercasetype/Fraunces)',
      'Copyright 2017 The Barlow Project Authors (https://github.com/jpt/barlow)',
      'Copyright 2016 The Inter Project Authors (https://github.com/rsms/inter)',
      'Copyright 2020 The JetBrains Mono Project Authors (https://github.com/JetBrains/JetBrainsMono)',
      'Copyright 2014 The Caveat Project Authors (https://github.com/googlefonts/caveat)',
      'Copyright 2022 The Shantell Sans Project Authors (https://github.com/arrowtype/shantell-sans)',
    ],
  },
]);

/** The file name every shipper gives the text. */
const THIRD_PARTY_LICENSES_FILE = 'THIRD-PARTY-LICENSES.txt';

/**
 * @param {(file: string) => string} read the text of `assets/licenses/<file>`
 * @returns {string}
 */
function thirdPartyLicenses(read) {
  const rule = '='.repeat(78);
  const out = [
    'THIRD-PARTY LICENSES',
    '',
    'This file covers only the third-party components listed below. They are',
    'redistributed unmodified and governed by their own terms, reproduced here in',
    'full. The Lattice engine is licensed separately (AGPL-3.0-only); its license',
    'is at https://github.com/Laticent/lattice/blob/main/LICENSE.',
    '',
  ];
  for (const { file, heading } of LICENSE_SOURCES) {
    out.push(rule, ...heading, rule, '', String(read(file)).trimEnd(), '');
  }
  return out.join('\n');
}

module.exports = { LICENSE_SOURCES, THIRD_PARTY_LICENSES_FILE, thirdPartyLicenses };
