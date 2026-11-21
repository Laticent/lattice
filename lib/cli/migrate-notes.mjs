#!/usr/bin/env node
/**
 * lib/cli/migrate-notes.mjs — `lattice migrate notes`: rewrite a deck's old-form notes as the four notes, in place
 * (engineering/decisions/2026-11-20-four-notes.md).
 *
 *   lattice migrate notes deck.md [more.md …]   rewrite each file, and print what changed
 *   --check                                     write nothing; exit 1 when a file would change (for CI)
 *   --stdout                                    print the rewritten deck instead of writing it (one file)
 *
 * The kernel is lib/authoring/notes-migrate.mjs. Line endings and a byte-order mark are kept as the file had them.
 *
 * Exit: 0 done (or nothing to change), 1 `--check` found a change, 2 usage or a file error.
 */

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import notesCore from '../authoring/notes-core.js';
import { makeNotesKit, migrateNotesSource } from '../authoring/notes-migrate.mjs';
import * as grammar from '../core/note-grammar.mjs';
import * as boundaries from '../core/slide-boundaries.mjs';

const kit = makeNotesKit(boundaries, notesCore, grammar);

const HELP = `lattice migrate notes — rewrite old-form notes as the four notes, in place

Usage: lattice migrate notes <deck.md> [more.md …] [--check] [--stdout]

  <!-- Open on the drop. -->          →   <!-- @note{Open on the drop.} -->
  <!-- say: The pipeline holds… -->   →   <!-- @say{The pipeline holds…} -->
  <!-- describe: Funnel chart… -->    →   <!-- @alt{Funnel chart…} -->
  <!-- reader: Measured over… -->     →   <!-- @handout{Measured over…} -->

A plain comment was the speaker note, so it becomes @note (a retired caption: too).
A record's note=, say=, describe= and reader= fields move to their own comments, and
a front-matter say: map moves onto each slide. A slide that held several say lines
keeps the last, which is the one it spoke. Directives, records' other fields and
code are untouched.

  --check    write nothing; exit 1 when a file would change
  --stdout   print the rewritten deck instead of writing it (one file only)
`;

/**
 * One deck's text, migrated. Line endings and a BOM are kept.
 * @param {string} text
 * @returns {{text: string, converted: number, moved: number, kept: Array<{slide: number, why: string}>, review: string[]}}
 */
export function migrateNotesText(text) {
  const bom = text.startsWith('﻿') ? '﻿' : '';
  const crlf = /\r\n/.test(text);
  const lf = text.slice(bom.length).replace(/\r\n?/g, '\n');
  const r = migrateNotesSource(lf, kit);
  if (r.source === lf) return { text, converted: 0, moved: 0, kept: r.kept, review: [] };
  return { text: bom + (crlf ? r.source.replace(/\n/g, '\r\n') : r.source), converted: r.converted, moved: r.moved, kept: r.kept, review: r.review };
}

export function main(argv) {
  const args = argv[0] === 'notes' ? argv.slice(1) : argv;
  if (argv[0] !== 'notes' || args.includes('--help') || args.includes('-h')) {
    (argv[0] === 'notes' ? process.stdout : process.stderr).write(HELP);
    return argv[0] === 'notes' ? 0 : 2;
  }
  const check = args.includes('--check');
  const stdout = args.includes('--stdout');
  const files = args.filter((a) => !a.startsWith('--'));
  const unknown = args.filter((a) => a.startsWith('--') && !['--check', '--stdout'].includes(a));
  if (unknown.length || !files.length || (stdout && files.length !== 1)) {
    process.stderr.write(unknown.length ? `lattice migrate notes: unknown option ${unknown[0]}\n` : HELP);
    return 2;
  }
  let changed = 0;
  for (const file of files) {
    let text;
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch (e) {
      process.stderr.write(`lattice migrate notes: ${file}: ${e.message}\n`);
      return 2;
    }
    const r = migrateNotesText(text);
    for (const k of r.kept) process.stderr.write(`${file}: slide ${k.slide}: a say line left out: ${k.why}\n`);
    for (const t of r.review) process.stderr.write(`${file}: now a speaker note, check it is one: ${t}\n`);
    if (stdout) {
      process.stdout.write(r.text);
      continue;
    }
    if (r.text === text) continue;
    changed++;
    if (!check) fs.writeFileSync(file, r.text);
    const what = [r.converted ? `${r.converted} note${r.converted === 1 ? '' : 's'} rewritten` : '', r.moved ? `${r.moved} say: map entr${r.moved === 1 ? 'y' : 'ies'} moved onto ${r.moved === 1 ? 'its slide' : 'their slides'}` : ''].filter(Boolean).join(', ');
    process.stdout.write(`${check ? 'would rewrite' : 'rewrote'} ${file}: ${what || 'say: map removed'}\n`);
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
