#!/usr/bin/env node
/**
 * lib/cli/migrate-meta.mjs — `lattice migrate meta`: rewrite a deck's directive comments as slide records, in place
 * (engineering/decisions/2026-10-17-meta-record.md §9 step 5).
 *
 *   lattice migrate meta deck.md [more.md …]   rewrite each file, and print what changed
 *   --check                                    write nothing; exit 1 when a file would change (for CI)
 *   --stdout                                   print the rewritten deck instead of writing it (one file)
 *
 * Two passes of one tested kernel (lib/cli/meta-migrate.mjs): `migrateMetaSource` turns each top-level directive comment
 * into a record on the same lines (a class that opens with a component becomes the typed `layout=` field), then
 * `mergeAdjacentRecords` folds a slide's consecutive records into one per scope. Line endings and a byte-order mark are
 * kept as the file had them. A directive inside a list item or a blockquote is left as written and named, because a
 * record there is not read (D1): move it to its own line.
 *
 * Exit: 0 done (or nothing to change), 1 `--check` found a change, 2 usage or a file error.
 */

import fs from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mergeAdjacentRecords, migrateMetaSource } from './meta-migrate.mjs';

const HELP = `lattice migrate meta — rewrite directive comments as slide records, in place

Usage: lattice migrate meta <deck.md> [more.md …] [--check] [--stdout]

  <!-- _class: cards-grid dark -->     <!-- {layout=cards-grid, class=dark, footer=Q3} -->
  <!-- _footer: Q3 -->           →

Each slide's directive comments become one record per scope, on the same lines, so
nothing after them moves and the deck renders the same. A directive inside a list
item or a blockquote is left as written and named: a record there is not read.

  --check    write nothing; exit 1 when a file would change
  --stdout   print the rewritten deck instead of writing it (one file only)
`;

/**
 * One deck's text, migrated. Line endings and a BOM are kept.
 * @param {string} text
 * @param {Set<string>} [components]
 * @returns {{text: string, converted: number, merged: number, kept: Array<{line: number, why: string}>}}
 */
export function migrateDeckText(text, components) {
  const bom = text.startsWith('﻿') ? '﻿' : '';
  const lf = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const one = migrateMetaSource(lf, { components });
  const two = mergeAdjacentRecords(one.source);
  // Nothing to migrate: the file comes back byte for byte, whatever its line endings.
  if (two.source === lf) return { text, converted: 0, merged: 0, kept: one.kept };
  // Each line keeps the ending it had (the kernel keeps every line in place), so a CRLF file stays CRLF and a mixed
  // file changes no line it did not rewrite.
  const eols = text.slice(bom.length).match(/\r\n|\r|\n/g) ?? [];
  const outLines = two.source.split('\n');
  const out = eols.length === outLines.length - 1 ? outLines.map((l, k) => l + (eols[k] ?? '')).join('') : two.source;
  return { text: bom + out, converted: one.converted, merged: two.merged, kept: one.kept };
}

function componentNames() {
  try {
    const require = createRequire(import.meta.url);
    return require('../authoring/lint.js').buildVocab().names;
  } catch {
    return undefined;
  }
}

export function main(argv) {
  const args = argv[0] === 'meta' ? argv.slice(1) : argv;
  if (argv[0] !== 'meta' || args.includes('--help') || args.includes('-h')) {
    (argv[0] === 'meta' ? process.stdout : process.stderr).write(HELP);
    return argv[0] === 'meta' ? 0 : 2;
  }
  const check = args.includes('--check');
  const stdout = args.includes('--stdout');
  const files = args.filter((a) => !a.startsWith('--'));
  const unknown = args.filter((a) => a.startsWith('--') && !['--check', '--stdout'].includes(a));
  if (unknown.length || !files.length || (stdout && files.length !== 1)) {
    process.stderr.write(unknown.length ? `lattice migrate meta: unknown option ${unknown[0]}\n` : HELP);
    return 2;
  }
  const components = componentNames();
  let changed = 0;
  for (const file of files) {
    let text;
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch (e) {
      process.stderr.write(`lattice migrate meta: ${file}: ${e.message}\n`);
      return 2;
    }
    const r = migrateDeckText(text, components);
    for (const k of r.kept) process.stderr.write(`${file}:${k.line}: kept as written: ${k.why}\n`);
    if (stdout) {
      process.stdout.write(r.text);
      continue;
    }
    if (r.text === text) continue;
    changed++;
    if (!check) fs.writeFileSync(file, r.text);
    process.stdout.write(`${check ? 'would rewrite' : 'rewrote'} ${file}: ${r.converted} comment${r.converted === 1 ? '' : 's'} → records${r.merged ? `, ${r.merged} merged into the record beside ${r.merged === 1 ? 'it' : 'them'}` : ''}\n`);
  }
  return check && changed ? 1 : 0;
}

// Run only as a script, never on import; `fileURLToPath` so a path with a space (or a Windows drive) resolves.
const self = (() => {
  try {
    return Boolean(process.argv[1]) && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
})();
if (self) process.exit(main(process.argv.slice(2)));
