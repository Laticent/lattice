#!/usr/bin/env node
/**
 * lib/authoring/code-format/fmt-cli.mjs — `lattice fmt`: pretty-print the code blocks of a deck, in
 * place (engineering/decisions/2026-10-15-code-plugin.md §6 and §9).
 *
 *   lattice fmt deck.md [more.md …]   format every top-level block a formatter reads, except one
 *                                     whose `@code{…}` record says `format=off`
 *   --check                           write nothing; exit 1 when a block would change (for CI)
 *   --stdout                          print the formatted deck instead of writing it (one file)
 *   --quiet                           no per-block notes
 *
 * Same planner and formatters as the Studio's "Format code" command (./plan.mjs, ./adapters.mjs).
 * A block a formatter cannot parse keeps its text and is reported, never mangled. Line endings and
 * a byte-order mark are kept as the file had them.
 *
 * Exit: 0 done (or nothing to change), 1 `--check` found a change, 2 usage or a file error.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatBlock } from './adapters.mjs';
import { applyFormat, planFormat } from './plan.mjs';

const HELP = `lattice fmt — pretty-print a deck's code blocks, in place

Usage: lattice fmt <deck.md> [more.md …] [--check] [--stdout] [--quiet]

Formats every top-level fenced block a formatter reads: Prettier (JavaScript, TypeScript,
JSON, CSS, SCSS, Less, HTML, Vue, Markdown, YAML, GraphQL, PHP, XML, Java), ruff (Python)
and sql-formatter (SQL, PostgreSQL unless the record says dialect=). A block whose
\`@code{…}\` record says format=off is left alone; width=, dialect=, indent= and
quotes= are read from it, or from the deck's code: default.

  --check    write nothing; exit 1 when a block would change
  --stdout   print the formatted deck instead of writing it (one file only)
  --quiet    print no per-block notes
`;

/** Format one deck's text. Returns the new text and the notes. */
export async function formatDeck(text) {
  const bom = text.startsWith('﻿') ? '﻿' : '';
  const crlf = /\r\n/.test(text);
  const lf = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const plan = planFormat(lf, { all: true });
  const results = new Map();
  for (const job of plan.jobs) if (!results.has(job.id)) results.set(job.id, await formatBlock(job));
  const out = applyFormat(lf, plan, results, { all: true });
  const back = bom + (crlf ? out.markdown.replace(/\n/g, '\r\n') : out.markdown);
  return { text: back, changed: out.changes.length > 0, changes: out.changes.length, skipped: out.skipped };
}

async function main(argv) {
  if (argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write(HELP);
    return 0;
  }
  const flags = new Set(argv.filter((a) => a.startsWith('-')));
  for (const f of flags) {
    if (!['--check', '--stdout', '--quiet'].includes(f)) {
      process.stderr.write(`lattice fmt: unknown option ${f}\n\n${HELP}`);
      return 2;
    }
  }
  const files = argv.filter((a) => !a.startsWith('-'));
  if (!files.length) {
    process.stderr.write(HELP);
    return 2;
  }
  if (flags.has('--stdout') && files.length > 1) {
    process.stderr.write('lattice fmt: --stdout takes one file\n');
    return 2;
  }
  let wouldChange = false;
  for (const file of files) {
    let text;
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch (e) {
      process.stderr.write(`lattice fmt: ${file}: ${e.code === 'ENOENT' ? 'no such file' : e.message}\n`);
      return 2;
    }
    const r = await formatDeck(text);
    if (!flags.has('--quiet')) {
      for (const s of r.skipped) process.stderr.write(`${path.relative(process.cwd(), file)}:${s.line}: the ${s.lang} block keeps its text: ${s.error}\n`);
    }
    if (flags.has('--stdout')) {
      process.stdout.write(r.text);
    } else if (flags.has('--check')) {
      if (r.changed) {
        wouldChange = true;
        process.stdout.write(`${file}: ${r.changes} block${r.changes === 1 ? '' : 's'} would change\n`);
      }
    } else if (r.changed) {
      fs.writeFileSync(file, r.text);
      if (!flags.has('--quiet')) process.stdout.write(`${file}: formatted ${r.changes} block${r.changes === 1 ? '' : 's'}\n`);
    }
  }
  return wouldChange ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (e) => {
    process.stderr.write(`lattice fmt: ${e?.stack || e}\n`);
    process.exit(2);
  });
}
