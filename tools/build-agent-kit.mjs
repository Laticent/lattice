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
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);

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
const BOOTSTRAP_FILE = 'BOOTSTRAP.md';
const COMPONENT_DIR = 'components';

const approxTokens = (bytes) => Math.round(bytes / 4);
const fmtTok = (bytes) => {
  const t = approxTokens(bytes);
  return t >= 1000 ? `~${(t / 1000).toFixed(t >= 10000 ? 0 : 1)}k` : `~${t}`;
};

/**
 * ONE FILE PER COMPONENT — the whole point of the bootstrap.
 *
 * Without these, an agent that knows it wants `matrix-2x2` still has to read
 * `components.md` whole (~107k tokens) to get one ~1.7k-token entry, because
 * that file is the only prose surface the kit ships. Measured over the 62 docs:
 * median 6.9 KB. So the targeted path costs ~2k tokens instead of ~111k.
 *
 * The payload is the component's OWN `<name>.docs.md` — generated by
 * `build-component-docs.js` from the manifests, and the exact file HARD RULE #6
 * requires an author to open. Copied, never re-derived (HARD RULE #1).
 *
 * This also repairs a broken pointer the kit shipped: `components.pick.md` tells
 * the reader to open `lib/components/<bucket>/<name>/<name>.docs.md` — a REPO
 * path, which a kit consumer with no clone does not have. Now they do.
 */
function componentDocs() {
  const { loadAll, manifestBucket } = require(path.join(ROOT, 'lib', 'components'));
  const out = [];
  for (const m of loadAll()) {
    const bucket = manifestBucket(m);
    const src = path.join(ROOT, 'lib', 'components', bucket, m.name, `${m.name}.docs.md`);
    if (!existsSync(src)) continue;
    out.push({ name: m.name, bucket, body: readFileSync(src) });
  }
  // Shared FAMILY docs (`lib/components/<bucket>/_<family>/`) are not components,
  // so `loadAll()` skips them — but 8 of the chart docs point AT chart-family for
  // the `.chart-frame` skeleton and status-pill vocabulary they all wrap in.
  // Leaving it out would ship the same dangling pointer this change exists to fix,
  // one level down.
  for (const bucket of readdirSync(path.join(ROOT, 'lib', 'components'))) {
    const bucketDir = path.join(ROOT, 'lib', 'components', bucket);
    let inner;
    try {
      inner = readdirSync(bucketDir);
    } catch {
      continue;
    }
    for (const dir of inner) {
      if (!dir.startsWith('_')) continue;
      const family = dir.slice(1);
      const src = path.join(bucketDir, dir, `${family}.docs.md`);
      if (!existsSync(src)) continue;
      out.push({ name: `_${family}`, bucket, family: true, body: readFileSync(src) });
    }
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

/**
 * The routing file. Deliberately the SMALLEST thing in the kit: an agent with a
 * tight context budget reads this and then exactly one component file, and never
 * touches the 107k-token catalog.
 *
 * It carries the cross-cutting authoring rules inline (~490 tokens) because they
 * are the half an agent cannot get from a per-component doc — card nesting, the
 * title-slide shape, how class tokens compose. A component file without them
 * produces a well-formed slide of the wrong kind.
 */
function bootstrap(components, files, authoringRules, selfBytes = 0) {
  const byBucket = new Map();
  for (const c of components) {
    if (!byBucket.has(c.bucket)) byBucket.set(c.bucket, []);
    byBucket.get(c.bucket).push(c);
  }
  const { BUCKET_BLURBS } = require(path.join(ROOT, 'tools', 'build-bucket-galleries.js'));
  const { BUCKETS } = require(path.join(ROOT, 'lib', 'components'));

  const bucketRows = BUCKETS.filter((b) => byBucket.has(b)).map((b) => {
    const list = byBucket.get(b);
    // The blurb is "Anchor — where you are in the deck."; keep only the clause.
    const blurb = String(BUCKET_BLURBS[b] || b).replace(/^[^—]*—\s*/, '');
    const names = list
      .filter((c) => !c.family)
      .map((c) => `\`${c.name}\``)
      .join(' · ');
    const fam = list.filter((c) => c.family);
    const famNote = fam.length
      ? `\n  Shared contract for this family: ${fam.map((c) => `\`${COMPONENT_DIR}/${c.name}.md\``).join(', ')} — read it too.`
      : '';
    return `- **${b}** — ${blurb}\n  ${names}${famNote}`;
  });

  const median = (arr) => arr.slice().sort((x, y) => x - y)[Math.floor(arr.length / 2)];
  const compMedian = median(components.map((c) => c.body.length));
  // Its OWN size, fed back from a first pass. Guessing it understated the cheapest
  // read path by half, which is the one number in this file an agent budgets against.
  const bootstrapSelf = selfBytes;

  return [
    '# Lattice agent kit — START HERE',
    '',
    'You are authoring a **Lattice** deck: plain Markdown, one layout per slide, chosen',
    'with `<!-- _class: NAME -->` and separated by a line containing only `---`.',
    '',
    '**Read the least you need.** The full catalog is ~107k tokens; you almost never want it.',
    '',
    '## Pick your read path',
    '',
    '| If you… | Read | ~tokens |',
    '|---|---|---|',
    `| know which component you want | this file + \`${COMPONENT_DIR}/<name>.md\` | **${fmtTok(bootstrapSelf + compMedian)}** |`,
    `| need to choose one | + \`components.pick.md\` | ${fmtTok(bootstrapSelf + compMedian + (files.get('components.pick.md')?.length || 0))} |`,
    `| are authoring a whole deck in one pass | \`${PRIMER_FILE}\` | ${fmtTok(files.get(PRIMER_FILE)?.length || 0)} |`,
    `| are writing a TOOL over the catalog | \`components.json\` | ${fmtTok(files.get('components.json')?.length || 0)} |`,
    `| want the prose catalog whole | \`components.md\` | ${fmtTok(files.get('components.md')?.length || 0)} |`,
    '',
    `Every component has its own file: \`${COMPONENT_DIR}/<name>.md\` (median ${fmtTok(compMedian)} tokens) —`,
    'slots, variants, budgets, common mistakes and the data shape. That is the file to open',
    'once you have picked, and it is all you need to author that slide correctly.',
    '',
    `> **Path note.** \`components.pick.md\` is generated for people working inside the Lattice`,
    `> repo, so it says to open \`lib/components/<bucket>/<name>/<name>.docs.md\`. In this kit`,
    `> that same file is \`${COMPONENT_DIR}/<name>.md\` — same content, flat.`,
    '',
    `## The ${bucketRows.length} families`,
    '',
    ...bucketRows,
    '',
    '## Rules that apply to every slide',
    '',
    'These are the part a per-component file cannot tell you. Read them once.',
    '',
    '> These rules are shared verbatim with the Studio\'s own prompt, where every layout\'s',
    `> skeleton is printed inline. So where one says "below" or "listed with each layout",`,
    `> it means **the \`${COMPONENT_DIR}/<name>.md\` file you open next** — or \`${PRIMER_FILE}\`,`,
    '> which carries all of them in one document.',
    '',
    ...authoringRules.map((r) => `- ${r}`),
    '',
    '## Everything else in here',
    '',
    '`grammar.json` — which class tokens, variants and modifiers are legal where.',
    '`forms.json` — the Form vocabulary, one level above components.',
    '`concepts.json` — the ontology joining the two levels.',
    '',
    '---',
    '',
    'Generated by `tools/build-agent-kit.mjs`. Do not hand-edit; a stale copy fails the build gate.',
    '',
  ].join('\n');
}

/** The Studio chat's authoring primer, byte-for-byte, as a standalone document. */
async function buildPrimer() {
  const { buildStudioCatalog } = await import(
    path.join(ROOT, 'docs', 'src', 'lib', 'studio-catalog.mjs')
  );
  const { buildLatticePrimer, AUTHORING_RULES } = await import(
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
  return { text, layoutCount: catalog.length, authoringRules: AUTHORING_RULES };
}

function readme(files, layoutCount, countComponents) {
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
    '> **Short on context? Read [`BOOTSTRAP.md`](./BOOTSTRAP.md) instead of this file.**',
    '> It routes you to the one component file you need — about 2k tokens all in,',
    '> against ~107k for the full catalog below.',
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
    `### \`${BOOTSTRAP_FILE}\` — ${(files.get(BOOTSTRAP_FILE).length / 1024).toFixed(0)} KB`,
    '',
    'The routing file, and the smallest thing here. A read-path table costed in tokens, the',
    '13 component families with their members, and the cross-cutting authoring rules. Read',
    'this plus one component file and you can author that slide correctly.',
    '',
    `### \`${COMPONENT_DIR}/<name>.md\` — ${countComponents} files`,
    '',
    'One per component: slots, variants, budgets, common mistakes, data shape. The same file',
    '`components.pick.md` points at, and the unit an agent with a limited context window',
    'should actually read — a median entry is ~1.7k tokens against ~107k for the whole catalog.',
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
  const { text: primer, layoutCount, authoringRules } = await buildPrimer();
  files.set(PRIMER_FILE, Buffer.from(primer, 'utf8'));

  const components = componentDocs();
  const componentCount = components.filter((c) => !c.family).length;
  if (componentCount !== layoutCount) {
    // Not fatal on its own, but it means the pick list and the per-component
    // folder disagree about what exists — say so rather than publish a kit whose
    // own index points at a file that is not there.
    process.stderr.write(
      `[build-agent-kit] warning: ${layoutCount} layouts in the catalog but ${componentCount} component docs found.\n`,
    );
  }
  for (const c of components) files.set(`${COMPONENT_DIR}/${c.name}.md`, c.body);

  // BOOTSTRAP first: the README quotes its size, and it reads nothing from the
  // README, so this is the only order that resolves.
  // Two passes: the read-path table quotes this file's own token cost, so the first
  // pass measures and the second states it. It converges — the only thing that
  // changes between passes is a number of the same order.
  const pass1 = bootstrap(components, files, authoringRules, 0);
  const pass2 = bootstrap(components, files, authoringRules, Buffer.byteLength(pass1, 'utf8'));
  files.set(BOOTSTRAP_FILE, Buffer.from(pass2, 'utf8'));
  files.set('README.md', Buffer.from(readme(files, layoutCount, components.length), 'utf8'));
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
  for (const [name, body] of fresh) {
    const dest = path.join(OUT_DIR, name);
    mkdirSync(path.dirname(dest), { recursive: true });
    writeFileSync(dest, body);
  }
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
