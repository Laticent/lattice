#!/usr/bin/env node
/**
 * build-agent-kit — assemble dist/agent-kit/, the kit an LLM or coding agent
 * uses to author Lattice artifacts, published to the `dist-kits` branch.
 *
 * ORGANIZED BY TASK, not by file type. The first cut was a flat pile of ten
 * entries and the owner's verdict was that everything had been "shoved in there
 * and not thoughtfully". Four folders, each answering a question a person
 * actually has:
 *
 *   authoring/    I am writing a deck        canon (what good looks like), rules, primer
 *   components/   which layout, and how      the pick index + one file per component
 *   skills/       I am creating a NEW X      the seven design/skills, verbatim
 *   reference/    I am building a tool       the machine catalogs + the Studio's prompts
 *
 * WHAT THIS FIXES BEYOND LAYOUT. The kit could tell an agent WHICH component to
 * use and HOW to author it, and nothing at all about whether the resulting deck
 * was any good. `DECK_CANON` — the 925-token statement of one-idea-per-slide,
 * narrative arc, rhythm, restraint, and 18 named traps with their fixes — is sent
 * by the Studio chat on every single turn and was not in the kit. Neither were
 * the seven `design/skills/` files, which are already written to stand alone and
 * to say what good and bad look like for each artifact.
 *
 * Usage:
 *   node tools/build-agent-kit.mjs           # write dist/agent-kit/
 *   node tools/build-agent-kit.mjs --check   # exit 1 if the kit is stale
 *
 * WHY IT COPIES RATHER THAN RE-DERIVES. The catalogs are written by
 * `build-docs-portal.js` / `build-forms.js` / `build-concepts.js`; the
 * per-component docs by `build-component-docs.js`; the skills by hand in
 * `design/skills/`. This step COPIES all of them. A second derivation would be a
 * second source of truth (HARD RULE #1) and the failure would be silent — a kit
 * that disagrees with the engine it documents is worse than no kit. The skills
 * are hand-written rather than generated, so their copy is additionally pinned
 * byte-for-byte by `test/unit/tools/agent-kit-structure.test.js`.
 *
 * WHY THE PRIMER SHARES THE STUDIO'S BUILDER. `authoring/primer.md` is the SAME
 * authoring primer the Studio chat injects, produced by calling the same two
 * functions it calls. Be exact about the scope, because the looser claim is
 * false: the Studio's full system turn is persona + DECK_CANON + EDIT_PROTOCOL +
 * this primer + a dynamic tail, and it injects the primer only on the cloud tier.
 * The primer BODY is shared byte-for-byte; the whole prompt is not. That is why
 * DECK_CANON now ships beside it rather than being alluded to.
 *
 * ORDER MATTERS. This step runs AFTER the docs-portal, forms and concepts steps —
 * it reads their output. `tools/build.js` places it accordingly.
 */

import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOCS_DIR = path.join(ROOT, 'dist', 'docs');
const SKILLS_DIR = path.join(ROOT, 'design', 'skills');
const OUT_DIR = path.join(ROOT, 'dist', 'agent-kit');

const AUTHORING = 'authoring';
const COMPONENTS = 'components';
const SKILLS = 'skills';
const REFERENCE = 'reference';

const approxTokens = (b) => Math.round(b / 4);
const fmtTok = (b) => {
  const t = approxTokens(b);
  return t >= 1000 ? `~${(t / 1000).toFixed(t >= 10000 ? 0 : 1)}k` : `~${t}`;
};
const bytesOf = (files, key) => files.get(key)?.length || 0;

/** Catalogs copied verbatim from dist/docs/, with where each one lands. */
const CATALOGS = [
  {
    file: 'components.pick.md',
    to: `${COMPONENTS}/_index.md`,
    why: '**The index — start here to CHOOSE a layout.** One line per component; the whole catalog in ~3.8k tokens. Skim or grep it, then open that component\'s own file beside it.',
  },
  {
    file: 'components.md',
    to: `${REFERENCE}/components.md`,
    why: 'The prose catalog, whole. You almost never want this — `components/<name>.md` is the same content for one component. Here for completeness.',
  },
  {
    file: 'components.json',
    to: `${REFERENCE}/components.json`,
    why: 'The full machine record, for TOOLS to parse. Do not load it to choose a layout.',
  },
  {
    file: 'grammar.json',
    to: `${REFERENCE}/grammar.json`,
    why: 'The authoring grammar: which class tokens, variants and modifiers are legal where. What a linter keys off.',
  },
  {
    file: 'forms.json',
    to: `${REFERENCE}/forms.json`,
    why: 'The Form vocabulary — how a slide is composed (cells, mastheads, stage regions), one level above components.',
  },
  {
    file: 'concepts.json',
    to: `${REFERENCE}/concepts.json`,
    why: 'The concept ontology joining the two levels: what a component, modifier, token and Form each are, and how they relate.',
  },
];

/**
 * ONE FILE PER COMPONENT, plus the shared FAMILY contracts.
 *
 * Without these, an agent that knows it wants `matrix-2x2` has to read the whole
 * prose catalog (~107k tokens) to get one ~1.8k-token entry. The payload is the
 * component's own generated `<name>.docs.md` — the exact file HARD RULE #6
 * requires an author to open.
 *
 * Family docs (`lib/components/<bucket>/_<family>/`) are not components, so
 * `loadAll()` skips them — but 8 chart docs point AT chart-family for the
 * `.chart-frame` skeleton they all wrap in, so omitting it ships a dangling
 * pointer one level down.
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

/** The seven hand-written skills, copied verbatim from design/skills/. */
function skillDocs() {
  return readdirSync(SKILLS_DIR)
    .filter((f) => f.endsWith('.md'))
    .sort()
    .map((f) => ({ name: f, body: readFileSync(path.join(SKILLS_DIR, f)) }));
}

/**
 * FINISH_SYSTEM is computed from the live finish catalog inside a TypeScript
 * module, so it cannot be `require`d. esbuild resolves it in ~0.3s.
 *
 * It FAILS LOUDLY rather than degrading: a canon silently missing from the kit is
 * the failure mode this whole change exists to fix, and a caught-and-ignored
 * error would reproduce it exactly.
 */
function finishSystem() {
  const tmp = mkdtempSync(path.join(tmpdir(), 'lattice-finish-'));
  try {
    const entry = path.join(tmp, 'entry.ts');
    const out = path.join(tmp, 'out.mjs');
    writeFileSync(entry, "export { FINISH_SYSTEM } from '@/components/studio/architect.ts';\n");
    execFileSync(
      path.join(ROOT, 'node_modules', '.bin', 'esbuild'),
      [
        entry,
        '--bundle',
        '--format=esm',
        '--platform=node',
        `--alias:@=${path.join(ROOT, 'docs', 'src')}`,
        `--outfile=${out}`,
        '--log-level=error',
      ],
      { cwd: ROOT, stdio: ['ignore', 'ignore', 'pipe'] },
    );
    return { file: out, cleanup: () => rmSync(tmp, { recursive: true, force: true }) };
  } catch (err) {
    rmSync(tmp, { recursive: true, force: true });
    throw new Error(
      `build-agent-kit: could not extract FINISH_SYSTEM from docs/src/components/studio/architect.ts — ${err?.message || err}\n` +
        '  This is one of the four product canons the kit ships. If architect.ts gained an import esbuild cannot resolve\n' +
        '  for the node platform, fix that rather than dropping the canon: a kit missing a canon silently is the exact\n' +
        '  defect this generator exists to prevent.',
    );
  }
}

/** authoring/deck-canon.md — what good looks like. */
function deckCanonDoc() {
  const { DECK_CANON, DECK_CANON_SHORT } = require(path.join(ROOT, 'lib', 'authoring', 'deck-canon.js'));
  return [
    '# What a good deck looks like',
    '',
    "> This is the Lattice Studio chat's own deck canon, sent with **every turn** it takes.",
    '> Read it before writing slides. The component files tell you how to author a layout',
    "> correctly; this tells you whether the deck is worth showing.",
    '',
    'It ends with the traps the deck reviewer actually flags — each with its fix. Avoiding',
    'them up front is cheaper than being told afterwards.',
    '',
    '## The canon',
    '',
    '```',
    DECK_CANON.trim(),
    '```',
    '',
    '## The short form',
    '',
    'A small on-device model loses the thread on a long system prompt, so the Studio sends',
    'this reduced canon to local models instead. Use it when context is very tight — it is',
    'the load-bearing subset, not a summary.',
    '',
    '```',
    DECK_CANON_SHORT.trim(),
    '```',
    '',
    '---',
    '',
    'Source: `lib/authoring/deck-canon.js`. Generated by `tools/build-agent-kit.mjs`.',
    '',
  ].join('\n');
}

/** authoring/rules.md — the cross-cutting rules a per-component file cannot carry. */
function rulesDoc(authoringRules) {
  return [
    '# Rules that apply to every slide',
    '',
    'These are the half a per-component file cannot tell you: how classes compose, how card',
    'layouts nest, what a title slide is. Shared verbatim with the Studio chat.',
    '',
    '> Where a rule says "below" or "listed with each layout", it means **the component file',
    `> you open next** (\`${COMPONENTS}/<name>.md\`) — or \`${AUTHORING}/primer.md\`, which carries`,
    '> every layout skeleton in one document.',
    '',
    ...authoringRules.map((r) => `- ${r}`),
    '',
    '---',
    '',
    'Source: `docs/src/components/studio/ai/architect-knowledge.js` (`AUTHORING_RULES`).',
    '',
  ].join('\n');
}

/** reference/studio-prompts.md — the three GENERATOR canons. */
function studioPromptsDoc() {
  const { THEME_CANON } = require(path.join(ROOT, 'lib', 'theme', 'ai.js'));
  const { COMPONENT_CANON } = require(path.join(ROOT, 'lib', 'layout', 'ai.js'));
  const fin = finishSystem();
  let FINISH_SYSTEM;
  try {
    // Loaded via a child process rather than a dynamic import so the bundle's own
    // module-level code cannot run inside this build.
    FINISH_SYSTEM = execFileSync(
      process.execPath,
      ['-e', `import(${JSON.stringify(fin.file)}).then((m)=>process.stdout.write(m.FINISH_SYSTEM))`],
      { encoding: 'utf8' },
    );
  } finally {
    fin.cleanup();
  }

  return [
    "# The Studio's generator prompts",
    '',
    "> These are the instructions Lattice's own product sends its model when it GENERATES a",
    '> theme, a component or a finish. They are here so an outside agent can reproduce what',
    '> the Studio does.',
    '',
    '**Which wins.** For learning how to build one of these properly, the matching',
    `\`${SKILLS}/\` file is fuller and is the better teaching surface — it carries the 10/10 bar,`,
    'a recipe, what-good/what-bad, and a ship checklist. These prompts are tuned for a model',
    'producing one artifact in one shot.',
    '',
    'That distinction is load-bearing rather than pedantic: a 2026-07-19 investigation found',
    'these product prompts had **silently drifted** from the shared design canon in two',
    'confirmed places, while the skills had been recertified against it. When a prompt below',
    'and a skill disagree, **the skill is the safer bet** — and the disagreement is a bug worth',
    'reporting.',
    '',
    '## THEME_CANON',
    '',
    `Sent when generating a palette. See \`${SKILLS}/theme.md\` for the full method.`,
    '',
    '```',
    String(THEME_CANON).trim(),
    '```',
    '',
    '## COMPONENT_CANON',
    '',
    `Sent when generating a layout. See \`${SKILLS}/component.md\`.`,
    '',
    '```',
    String(COMPONENT_CANON).trim(),
    '```',
    '',
    '## FINISH_SYSTEM',
    '',
    `Sent when generating a finish. The closed vocabularies below are generated from what`,
    `actually ships, so they cannot drift from the engine. See \`${SKILLS}/finish.md\`.`,
    '',
    '```',
    String(FINISH_SYSTEM).trim(),
    '```',
    '',
    '---',
    '',
    'Sources: `lib/theme/ai.js`, `lib/layout/ai.js`,',
    '`docs/src/components/studio/architect.ts`. Generated by `tools/build-agent-kit.mjs`.',
    '',
  ].join('\n');
}

/** authoring/primer.md — the Studio's layout dossier, body byte-identical. */
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
  const text = [
    '# Every layout, with its authoring skeleton',
    '',
    '> The **authoring primer the Lattice Studio chat injects into its own system prompt**,',
    '> generated from the live component manifests. The body below is byte-for-byte what the',
    "> Studio sends — not a summary. It is not the Studio's WHOLE prompt: the persona, the",
    `> deck canon (\`${AUTHORING}/deck-canon.md\`) and the edit protocol sit alongside it there.`,
    '',
    `> Authoring ONE slide? \`${COMPONENTS}/<name>.md\` is ~1.8k tokens against this file's`,
    `> ${fmtTok(Buffer.byteLength(body, 'utf8'))}. This is for writing a whole deck in one pass.`,
    '',
    `Covers ${catalog.length} layouts.`,
    '',
    '---',
    '',
    body,
    '',
  ].join('\n');
  return { text, layoutCount: catalog.length, authoringRules: AUTHORING_RULES };
}

/**
 * BOOTSTRAP.md — the routing file, and deliberately the smallest thing here.
 * An agent with a tight budget reads this, then exactly the folder it needs.
 */
function bootstrap(components, skills, files, layoutCount, selfBytes = 0) {
  const byBucket = new Map();
  for (const c of components) {
    if (!byBucket.has(c.bucket)) byBucket.set(c.bucket, []);
    byBucket.get(c.bucket).push(c);
  }
  const { BUCKET_BLURBS } = require(path.join(ROOT, 'tools', 'build-bucket-galleries.js'));
  const { BUCKETS } = require(path.join(ROOT, 'lib', 'components'));

  const bucketRows = BUCKETS.filter((b) => byBucket.has(b)).map((b) => {
    const list = byBucket.get(b);
    const blurb = String(BUCKET_BLURBS[b] || b).replace(/^[^—]*—\s*/, '');
    const names = list
      .filter((c) => !c.family)
      .map((c) => `\`${c.name}\``)
      .join(' · ');
    const fam = list.filter((c) => c.family);
    const famNote = fam.length
      ? `\n  Shared contract for this family: ${fam.map((c) => `\`${COMPONENTS}/${c.name}.md\``).join(', ')} — read it too.`
      : '';
    return `- **${b}** — ${blurb}\n  ${names}${famNote}`;
  });

  const median = (a) => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];
  const compMedian = median(components.map((c) => c.body.length));
  const canonB = bytesOf(files, `${AUTHORING}/deck-canon.md`);
  const rulesB = bytesOf(files, `${AUTHORING}/rules.md`);
  const indexB = bytesOf(files, `${COMPONENTS}/_index.md`);
  const primerB = bytesOf(files, `${AUTHORING}/primer.md`);

  const skillRow = (f, label) =>
    skills.some((s) => s.name === f) ? `| ${label} | \`${SKILLS}/${f}\` |` : null;

  return [
    '# Lattice agent kit — START HERE',
    '',
    'You are working with **Lattice**: decks are plain Markdown, one layout per slide, chosen',
    'with `<!-- _class: NAME -->`, slides separated by a line containing only `---`.',
    '',
    '**Read the least you need.** Everything here is split so you never load the whole catalog.',
    '',
    '## What are you doing?',
    '',
    '| Task | Read, in order | ~tokens |',
    '|---|---|---|',
    `| **Writing a deck**, one slide at a time | \`${AUTHORING}/deck-canon.md\` + \`${AUTHORING}/rules.md\` + \`${COMPONENTS}/<name>.md\` | **${fmtTok(canonB + rulesB + compMedian)}** |`,
    `| **Writing a whole deck** in one pass | \`${AUTHORING}/deck-canon.md\` + \`${AUTHORING}/primer.md\` | ${fmtTok(canonB + primerB)} |`,
    `| **Choosing** a layout | \`${COMPONENTS}/_index.md\`, then the one file it points to | ${fmtTok(indexB + compMedian)} |`,
    `| **Creating** a theme / component / finish / lens | the matching \`${SKILLS}/\` file | ~3k each |`,
    `| **Building a tool** over the catalog | \`${REFERENCE}/components.json\` (+ \`grammar.json\`) | ${fmtTok(bytesOf(files, `${REFERENCE}/components.json`))} |`,
    '',
    '**If you read only one thing before writing slides, read `authoring/deck-canon.md`.** It is',
    'what the Studio sends itself on every turn: how a boardroom deck argues, and the 18 traps',
    'its reviewer flags, each with the fix.',
    '',
    '## The four folders',
    '',
    `- **\`${AUTHORING}/\`** — writing a deck. \`deck-canon.md\` (what good looks like),`,
    `  \`rules.md\` (rules for every slide), \`primer.md\` (all ${layoutCount} layouts + skeletons).`,
    `- **\`${COMPONENTS}/\`** — \`_index.md\` to choose, then one file per component: slots,`,
    `  variants, budgets, common mistakes, data shape. Median ${fmtTok(compMedian)} tokens.`,
    `- **\`${SKILLS}/\`** — creating a NEW artifact from a blank file. Self-contained: each names`,
    '  the 10/10 bar, a recipe, what good and bad look like, and a ship checklist.',
    `- **\`${REFERENCE}/\`** — machine catalogs for tools, plus the Studio's own generator prompts.`,
    '',
    '## Creating something new',
    '',
    '| You want to create… | Open |',
    '|---|---|',
    ...[
      skillRow('deck.md', 'A **deck** from a blank file'),
      skillRow('theme.md', 'A **theme** — a palette'),
      skillRow('component.md', 'A **component** — a new `_class` layout'),
      skillRow('chart-component.md', 'A **chart component**'),
      skillRow('finish.md', 'A **finish** — a backdrop layer stack'),
      skillRow('lens.md', 'A **lens** — a reader-side subset of a deck'),
      skillRow('speaker-notes.md', '**Speaker notes, reviews, captions**'),
    ].filter(Boolean),
    '',
    `The \`${SKILLS}/\` files are copied verbatim from the Lattice repo's \`design/skills/\`, and a`,
    'test pins them byte-for-byte so this copy cannot drift.',
    '',
    `## The ${bucketRows.length} component families`,
    '',
    ...bucketRows,
    '',
    '---',
    '',
    '_Generated by `tools/build-agent-kit.mjs`. Do not hand-edit — a stale copy fails the build_',
    `_gate. This file is ${fmtTok(selfBytes)} tokens._`,
    '',
  ].join('\n');
}

function readme(files, layoutCount, componentCount, skillCount) {
  const kb = (k) => (bytesOf(files, k) / 1024).toFixed(0);
  return [
    '# Lattice — the LLM agent kit',
    '',
    'Everything an LLM or coding agent needs to author Lattice artifacts correctly, with no',
    'clone, no `npm install` and no build step. Fetch one file by URL.',
    '',
    '> **Start at [`BOOTSTRAP.md`](./BOOTSTRAP.md).** It routes you by task and costs each path',
    '> in tokens. This file is the inventory; that one is the map.',
    '',
    '## Layout',
    '',
    '```',
    'BOOTSTRAP.md          route by task',
    'authoring/            writing a deck',
    `  deck-canon.md         what good looks like + 18 traps   (${kb(`${AUTHORING}/deck-canon.md`)} KB)`,
    `  rules.md              rules for every slide             (${kb(`${AUTHORING}/rules.md`)} KB)`,
    `  primer.md             all ${layoutCount} layouts + skeletons      (${kb(`${AUTHORING}/primer.md`)} KB)`,
    'components/           which layout, and how',
    `  _index.md             the pick list                     (${kb(`${COMPONENTS}/_index.md`)} KB)`,
    `  <name>.md             one per component                 (${componentCount} files)`,
    'skills/               creating a NEW artifact from blank',
    `  <artifact>.md         self-contained, 10/10 bar         (${skillCount} files)`,
    'reference/            machine records for tools',
    '  components.json · grammar.json · forms.json · concepts.json',
    "  components.md         the prose catalog whole",
    "  studio-prompts.md     the Studio's generator prompts",
    '```',
    '',
    '## What each thing is for',
    '',
    '**`authoring/deck-canon.md`** — the deck canon the Studio chat sends itself on every turn:',
    'one idea per slide, narrative arc, rhythm, restraint, bookends, and the 18 traps its',
    'reviewer flags with the fix for each. The component files tell you how to author a layout',
    'correctly; this tells you whether the deck is worth showing.',
    '',
    '**`components/<name>.md`** — slots, variants, budgets, common mistakes and data shape for',
    'one component. The unit to read once you have picked. `_index.md` is how you pick.',
    '',
    '**`skills/`** — the seven "create a killer X from scratch" guides, verbatim from the repo.',
    'Each stands alone: the 10/10 bar for that artifact, a mental model, a numbered recipe, a',
    'copy-paste contract, what good and bad look like, a ship checklist, common mistakes.',
    '',
    "**`reference/studio-prompts.md`** — the prompts Lattice's product sends its own model when",
    'generating a theme, component or finish. Where one disagrees with the matching `skills/`',
    'file, the skill is the safer bet; see that file for why.',
    '',
    '## Freshness',
    '',
    'Republished on every push to `main` that changes an input, with a nightly backstop. It',
    'tracks `main`, which may be ahead of the newest release.',
    '',
    'Do not hand-edit anything here — it is regenerated by `npm run build` and a stale copy',
    'fails the build gate. Edit the source in the Lattice repo instead.',
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
  for (const c of CATALOGS) {
    const src = path.join(DOCS_DIR, c.file);
    if (!existsSync(src)) {
      missing.push(c.file);
      continue;
    }
    files.set(c.to, readFileSync(src));
  }
  if (missing.length) {
    throw new Error(
      `build-agent-kit: missing generated catalogs: ${missing.join(', ')}. Run \`npm run build\` first (this step runs after the docs-portal/forms/concepts steps).`,
    );
  }

  const { text: primer, layoutCount, authoringRules } = await buildPrimer();
  files.set(`${AUTHORING}/primer.md`, Buffer.from(primer, 'utf8'));
  files.set(`${AUTHORING}/deck-canon.md`, Buffer.from(deckCanonDoc(), 'utf8'));
  files.set(`${AUTHORING}/rules.md`, Buffer.from(rulesDoc(authoringRules), 'utf8'));
  files.set(`${REFERENCE}/studio-prompts.md`, Buffer.from(studioPromptsDoc(), 'utf8'));

  const components = componentDocs();
  const componentCount = components.filter((c) => !c.family).length;
  if (componentCount !== layoutCount) {
    process.stderr.write(
      `[build-agent-kit] warning: ${layoutCount} layouts in the catalog but ${componentCount} component docs found.\n`,
    );
  }
  for (const c of components) files.set(`${COMPONENTS}/${c.name}.md`, c.body);

  const skills = skillDocs();
  if (!skills.length) {
    throw new Error(
      `build-agent-kit: no skills found in ${SKILLS_DIR}. The kit ships them verbatim; an empty skills/ is a silently short kit.`,
    );
  }
  for (const s of skills) files.set(`${SKILLS}/${s.name}`, s.body);

  // Two passes: the bootstrap quotes its own token cost, so the first measures
  // and the second states it. Converges — only a same-order number changes.
  const pass1 = bootstrap(components, skills, files, layoutCount, 0);
  const pass2 = bootstrap(components, skills, files, layoutCount, Buffer.byteLength(pass1, 'utf8'));
  files.set('BOOTSTRAP.md', Buffer.from(pass2, 'utf8'));
  files.set(
    'README.md',
    Buffer.from(readme(files, layoutCount, components.length, skills.length), 'utf8'),
  );
  return files;
}

/**
 * Walks RECURSIVELY. Filtering to top-level files would leave one staleness class
 * invisible: a leftover subdirectory is then neither `extra` nor `changed`,
 * `--check` reports up to date, and the workflow's `cp -r` publishes it.
 */
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
    const differs = [...fresh.keys()].filter((k) => cur.has(k) && !fresh.get(k).equals(cur.get(k)));
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

// realpath BOTH sides: comparing an unresolved argv against an already-resolved
// module URL makes the guard false through a symlink, and the process would then
// exit 0 having written nothing and printed nothing.
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
