#!/usr/bin/env node
/**
 * build-agent-kit — assemble dist/agent-kit/, the copy-and-go kit for an LLM
 * or coding agent that has to AUTHOR a Lattice deck.
 *
 * The requirement (owner, 2026-08-30): the component catalogs an agent reads
 * left the repo tree when `dist/` stopped being committed
 * (`engineering/decisions/2026-08-17-generated-bundles-uncommitted.md` §6 named
 * this cost the day it shipped), and the Studio chat's authoring primer had
 * never been reachable from outside the docs site at all. This gathers both
 * into one folder that `.github/workflows/publish-kits.yml` mirrors onto the
 * orphan `dist-kits` branch, so an outside agent can fetch a single file by URL
 * with no clone, no npm install and no build.
 *
 * Usage:
 *   node tools/build-agent-kit.mjs           # write dist/agent-kit/
 *   node tools/build-agent-kit.mjs --check   # exit 1 if the kit is stale
 *
 * WHY IT COPIES RATHER THAN RE-DERIVES. Five of the seven payload files are
 * written by `build-docs-portal.js`, `build-forms.js` and `build-concepts.js`.
 * This step COPIES them; it never re-computes a catalog. A second derivation
 * would be a second source of truth for the same facts (HARD RULE #1), and the
 * failure would be silent — a kit that disagrees with the engine it documents
 * is worse than no kit.
 *
 * WHY THE PRIMER SHARES THE STUDIO'S BUILDER. `lattice-primer.md` is the SAME
 * authoring primer the Studio chat INJECTS INTO its system prompt, produced by
 * calling the same two functions the Studio calls — `buildStudioCatalog`
 * (docs/src/lib) and `buildLatticePrimer` (docs/src/components/studio/ai).
 *
 * Be exact about the scope, because the looser claim is false: the Studio's full
 * system turn is `SYSTEM_PERSONA + DECK_CANON + EDIT_PROTOCOL + this primer + a
 * dynamic tail` (`architect.ts` buildChatMessages), and it injects the primer only
 * on the cloud tier. What is shared here is the primer BODY, byte-for-byte — not
 * the whole prompt. DECK_CANON in particular (the one-idea-per-slide editorial
 * contract) is NOT in this file. If the Studio's primer changes, this file changes
 * with it, and `--check` fails until the kit is rebuilt. That is the whole point: the
 * 2026-07-19 skills-vs-Fabricate investigation found the product's own prompts
 * had silently drifted from the shared canon in two confirmed places, and a
 * hand-copied primer would be a third.
 *
 * ORDER MATTERS. This step must run AFTER the docs portal, forms and concepts
 * steps — it reads their output. `tools/build.js` places it accordingly.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOCS_DIR = path.join(ROOT, 'dist', 'docs');
const OUT_DIR = path.join(ROOT, 'dist', 'agent-kit');

/**
 * The catalogs copied verbatim, in the order the README presents them: cheapest
 * useful surface first. `why` is rendered into the README, so the kit explains
 * itself to whoever opens it rather than needing this file.
 */
const CATALOGS = [
  {
    file: 'components.pick.md',
    why: '**Start here to CHOOSE a layout.** One line per component — the whole catalog in ~3.8k tokens. Skim or grep it, then open that component\'s entry in `components.md`.',
  },
  {
    file: 'components.md',
    why: 'The readable catalog: every component with its slots, variants, budgets and an authoring example. Read the ONE entry you picked; it is ~100k tokens whole.',
  },
  {
    file: 'components.json',
    why: 'The full machine record — the same facts as `components.md`, for TOOLS to parse. Do not load it to choose a layout; `components.pick.md` exists for that.',
  },
  {
    file: 'grammar.json',
    why: 'The authoring grammar: which class tokens, variants and modifiers are legal where. What a linter or validator keys off.',
  },
  {
    file: 'forms.json',
    why: 'The Form vocabulary — how a slide is composed (cells, mastheads, stage regions), one level above components.',
  },
  {
    file: 'concepts.json',
    why: 'The concept ontology joining the two levels: what a component, modifier, token and Form each are, and how they relate.',
  },
];

const PRIMER_FILE = 'lattice-primer.md';

/** The Studio chat's authoring primer, byte-for-byte, as a standalone document. */
async function buildPrimer() {
  const { buildStudioCatalog } = await import(
    path.join(ROOT, 'docs', 'src', 'lib', 'studio-catalog.mjs')
  );
  const { buildLatticePrimer } = await import(
    path.join(ROOT, 'docs', 'src', 'components', 'studio', 'ai', 'architect-knowledge.js')
  );
  const catalog = buildStudioCatalog(ROOT);
  if (!catalog.length) {
    throw new Error(
      'build-agent-kit: the component catalog came back empty — dist/docs/components.json is missing or unreadable. Run `npm run build` first.',
    );
  }
  const body = buildLatticePrimer(catalog);
  // Return the count alongside the text. Re-deriving it from the rendered
  // markdown (a `^### ` scan) counts headings, not layouts — 58 of 61 skeletons
  // already contain `^## ` lines, so one component authored with an H3
  // sub-heading would make the README and the primer's own header disagree
  // about the same fact.
  const text = [
    '# Lattice — the authoring primer',
    '',
    '> The **authoring primer the Lattice Studio chat injects into its own system prompt**,',
    '> generated from the live component manifests by `tools/build-agent-kit.mjs`. The body below',
    '> is byte-for-byte what the Studio sends — not a summary of it. It is not the Studio\'s WHOLE',
    '> prompt: the persona, the editorial canon and the edit protocol sit alongside it there.',
    '> Paste this into a system prompt, or hand it to an agent before asking for a deck.',
    `> Covers ${catalog.length} layouts.`,
    '',
    '---',
    '',
    body,
    '',
  ].join('\n');
  return { text, layoutCount: catalog.length };
}

function readme(files, layoutCount) {
  // Each row carries its own trailing blank line: the surrounding template joins
  // on a single '\n', so without it the next `###` would butt against the previous
  // paragraph and some renderers would not treat it as a heading.
  const rows = CATALOGS.filter((c) => files.has(c.file)).flatMap((c) => {
    const bytes = files.get(c.file).length;
    return [`### \`${c.file}\` — ${(bytes / 1024).toFixed(0)} KB`, '', c.why, ''];
  });
  return [
    '# Lattice — the LLM agent kit',
    '',
    'Everything an LLM or coding agent needs to author a Lattice deck correctly,',
    'with no clone, no `npm install` and no build step. Grab one file by URL.',
    '',
    '## Which file do I want?',
    '',
    '**Authoring a deck with a chat model** → `' + PRIMER_FILE + '` alone. It carries every',
    'layout with a verbatim authoring skeleton, so the model copies structure instead of',
    'guessing it.',
    '',
    '**An agent that greps a repo** → `components.pick.md` to choose, then the matching',
    'entry in `components.md`.',
    '',
    '**Building a tool** → `components.json` plus `grammar.json`.',
    '',
    '## What is in here',
    '',
    `### \`${PRIMER_FILE}\` — ${(files.get(PRIMER_FILE).length / 1024).toFixed(0)} KB`,
    '',
    `The Lattice Studio chat's own authoring primer, generated from the live manifests —`,
    `${layoutCount} layouts, each with when-to-use, variants, slot contracts, a word/element`,
    'budget and the exact authoring skeleton, plus separate skeletons for the variants that',
    'change authoring grammar. ~16.5k tokens.',
    '',
    ...rows,
    '',
    '## Freshness',
    '',
    'This kit is generated from the Lattice sources and republished on every push to `main`',
    'that changes an input, with a nightly backstop. It always describes the engine on',
    '`main`, which may be ahead of the newest release.',
    '',
    'Do not hand-edit anything here — it is regenerated by `npm run build` and a stale copy',
    'fails the build gate. Edit the component manifests instead.',
    '',
    '## License',
    '',
    'Same as Lattice — see `LICENSE` in the repository root.',
    '',
  ].join('\n');
}

async function buildKit() {
  const files = new Map();
  const missing = [];
  for (const { file } of CATALOGS) {
    const src = path.join(DOCS_DIR, file);
    if (!existsSync(src)) {
      missing.push(file);
      continue;
    }
    files.set(file, readFileSync(src));
  }
  // A missing catalog means an upstream step did not run. Fail loudly rather
  // than publishing a kit with a hole in it — a silently short kit is exactly
  // the #1256 failure mode (a bundle shipped with no fonts, degrading quietly).
  if (missing.length) {
    throw new Error(
      `build-agent-kit: missing generated catalogs: ${missing.join(', ')}. Run \`npm run build\` first (this step runs after the docs-portal/forms/concepts steps).`,
    );
  }
  const { text: primer, layoutCount } = await buildPrimer();
  files.set(PRIMER_FILE, Buffer.from(primer, 'utf8'));
  files.set('README.md', Buffer.from(readme(files, layoutCount), 'utf8'));
  return files;
}

// Walks RECURSIVELY. Filtering to top-level files would leave one staleness
// class invisible: a leftover `dist/agent-kit/old/` is then neither `extra` nor
// `changed`, `--check` reports up to date, and the workflow's `cp -r` publishes
// it. The writer rmSync's the tree, so this is defense against a hand-made mess
// rather than against the generator.
function readExisting() {
  const seen = new Map();
  const walk = (dir, prefix) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const rel = prefix ? `${prefix}/${e.name}` : e.name;
      if (e.isDirectory()) walk(path.join(dir, e.name), rel);
      else seen.set(rel, readFileSync(path.join(dir, e.name)));
    }
  };
  walk(OUT_DIR, '');
  return seen;
}

async function main(argv) {
  const fresh = await buildKit();
  if (argv.includes('--check')) {
    const cur = readExisting();
    const missing = [...fresh.keys()].filter((k) => !cur.has(k));
    const extra = [...cur.keys()].filter((k) => !fresh.has(k));
    const differs = [...fresh.keys()].filter(
      (k) => cur.has(k) && !fresh.get(k).equals(cur.get(k)),
    );
    if (missing.length || extra.length || differs.length) {
      process.stderr.write('error: dist/agent-kit is stale.\n');
      if (missing.length) process.stderr.write(`       missing: ${missing.join(', ')}\n`);
      if (extra.length) process.stderr.write(`       unexpected: ${extra.join(', ')}\n`);
      if (differs.length) process.stderr.write(`       changed: ${differs.join(', ')}\n`);
      process.stderr.write('       Run `npm run build` to regenerate.\n');
      return 1;
    }
    process.stdout.write(`dist/agent-kit is up to date (${fresh.size} files).\n`);
    return 0;
  }

  rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });
  for (const [name, body] of fresh) writeFileSync(path.join(OUT_DIR, name), body);
  const kb = [...fresh.values()].reduce((n, b) => n + b.length, 0) / 1024;
  process.stdout.write(
    `[build-agent-kit] dist/agent-kit (${fresh.size} files, ${kb.toFixed(0)} KB)\n`,
  );
  return 0;
}

// Run only when invoked as the entry point — the CJS `require.main === module`
// guard has no ESM equivalent, and without this a test that imports `buildKit`
// would also execute the build (and call process.exit out from under it).
// realpath BOTH sides: `fileURLToPath(import.meta.url)` is already resolved, so
// comparing it against a raw `path.resolve(argv[1])` makes the guard false when
// invoked through a symlink — and the process would then exit 0 having written
// nothing and printed nothing, which is the worst way for a build step to fail.
const realpathOr = (p) => {
  try {
    return realpathSync(p);
  } catch {
    return path.resolve(p);
  }
};
const invokedDirectly =
  process.argv[1] && realpathOr(process.argv[1]) === realpathOr(fileURLToPath(import.meta.url));
if (invokedDirectly) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err) => {
      process.stderr.write(`${err?.message || err}\n`);
      process.exit(1);
    },
  );
}

export { buildKit, main, OUT_DIR, readme };
