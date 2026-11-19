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
 *   skills/       I need a skill for a job    every design/skills file, verbatim
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
 * WHAT IT DOES NOT SHIP. The finish generator prompt (FINISH_SYSTEM) is computed
 * inside architect.ts, which imports `fuse.js` and `react` from the DOCS workspace.
 * Extracting it made a root-only `npm ci` fail — `prepare` runs this build, so the
 * whole install died. `skills/finish.md` teaches the same system more fully and a
 * repo test already reconciles the two, so the kit points there instead. Every
 * other module this generator loads was verified to have zero bare imports.
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

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const { readSkills: readSkillIndex } = require('./skill-index.js');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOCS_DIR = path.join(ROOT, 'dist', 'docs');
const SKILLS_DIR = path.join(ROOT, 'design', 'skills');
const OUT_DIR = path.join(ROOT, 'dist', 'agent-kit');

const AUTHORING = 'authoring';
const REVIEW = 'review';
const COMPONENTS = 'components';
const SKILLS = 'skills';
const REFERENCE = 'reference';

const approxTokens = (b) => Math.round(b / 4);
const fmtTok = (b) => {
  const t = approxTokens(b);
  return t >= 1000 ? `~${(t / 1000).toFixed(t >= 10000 ? 0 : 1)}k` : `~${t}`;
};
const bytesOf = (files, key) => files.get(key)?.length || 0;

/**
 * One markdown TABLE CELL, from text this file does not control.
 *
 * Escape the BACKSLASH FIRST, then the pipe — the other order double-escapes,
 * and escaping the pipe alone (which is what shipped, and what CodeQL flagged as
 * two high-severity alerts) leaves a trailing `\` free to escape the table's own
 * delimiter and silently break the row. Newlines collapse for the same reason: a
 * cell cannot span lines.
 *
 * Latent rather than live today — no RUBRIC entry or CLAUDE.md rule title
 * currently contains either character — but the inputs are prose that anyone may
 * edit, and a broken table is exactly the kind of silent wrongness this kit is
 * meant not to ship.
 */
/**
 * Wrap a payload in a fence LONGER than anything line-leading inside it.
 *
 * A fixed ``` splits the moment a payload carries one at the start of a line,
 * and the remainder then parses as markup rather than as the quoted text it is
 * meant to be. COMPONENT_CANON already contains inline ``` runs — not
 * line-leading yet, so this is latent rather than live, and the canons are
 * prose anyone may edit. CommonMark lets the opening run be any length >= 3 as
 * long as the closer matches, so this is free.
 */
function fenced(payload, info = '') {
  const longest = [...String(payload).matchAll(/^ {0,3}(`{3,})/gm)].reduce(
    (n, m) => Math.max(n, m[1].length),
    2,
  );
  const rail = '`'.repeat(Math.max(3, longest + 1));
  return [`${rail}${info}`, String(payload), rail];
}

const mdCell = (v) =>
  String(v)
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .replace(/\s*\n\s*/g, ' ')
    .trim();

/** Catalogs copied verbatim from dist/docs/, with where each one lands. */
const CATALOGS = [
  {
    file: 'components.pick.md',
    to: `${COMPONENTS}/_index.md`,
  },
  {
    file: 'components.md',
    to: `${REFERENCE}/components.md`,
  },
  {
    file: 'components.json',
    to: `${REFERENCE}/components.json`,
  },
  {
    file: 'grammar.json',
    to: `${REFERENCE}/grammar.json`,
  },
  {
    file: 'forms.json',
    to: `${REFERENCE}/forms.json`,
  },
  {
    file: 'concepts.json',
    to: `${REFERENCE}/concepts.json`,
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
/**
 * Rewrite a copied doc's outbound references so they resolve INSIDE the kit.
 *
 * The component docs are written for someone standing in the repo, and the kit
 * copied them verbatim: 305 `../../<bucket>/<name>/<name>.docs.md` sibling
 * links, 62 pointers at `design/design-system.md §6.5` and 61 at a gallery PDF
 * — 428 references, none of which resolves for a reader who has no clone. That
 * is the kit's whole audience.
 *
 * A NOTE SAYING "MENTALLY REWRITE THIS PATH" IS NOT THE FIX. The kit shipped one
 * for a single such pointer and the other 428 stayed broken; the fix is to
 * rewrite the paths, and to pin link resolution in a test so a new one cannot
 * appear. Prose that merely NAMES an engine file ("the contrast is
 * `lib/shared/shared.docs.md`") is left alone — it is information, not an
 * instruction to open something the reader does not have.
 */
function relocate(text) {
  return (
    String(text)
      // A sibling component doc — `../../comparison/verdict-grid/verdict-grid.docs.md`, or a plugin kind's
      // (`../../../plugins/chart-family/kinds/bar/bar.docs.md`)
      // (and the `_family` directories) — is one flat file here.
      .replace(/\]\((?:\.\.\/)+(?:[a-z0-9-]+\/)*_?([a-z0-9-]+)\/\1\.docs\.md\)/g, '](./$1.md)')
      .replace(/\]\((?:\.\.\/)+(?:[a-z0-9-]+\/)*_([a-z0-9-]+)\/\1\.docs\.md\)/g, '](./_$1.md)')
      // The rendered-gallery PDFs are not in the kit (they are ~1 MB each and the
      // kit is text). Drop the sentence rather than leave a link to nothing.
      .replace(/^See \[[a-z0-9-]+\.gallery\.[a-z]+\.pdf\]\([^)]*\)[^\n]*\n/gm, '')
      // The universal-variant catalog now ships as authoring/modifiers.md. The
      // repo link was doubly dead here: the anchor still said `three-tiers` after
      // the section became four.
      .replace(
        /\[design\/design-system\.md §6\.5\]\([^)]*\)/g,
        `[the universal modifier catalog](../${AUTHORING}/modifiers.md)`,
      )
      // The guides now link the generated base reference (lib/base/base.modifiers.docs.md), which
      // the kit does not copy; its catalog is the kit's own modifiers.md.
      .replace(
        /\[the base modifier reference\]\([^)]*base\.modifiers\.docs\.md\)/g,
        `[the universal modifier catalog](../${AUTHORING}/modifiers.md)`,
      )
      // `components.pick.md` is generated for repo users and routes readers to a
      // path a kit consumer does not have.
      .replace(/`lib\/components\/<bucket>\/<name>\/<name>\.docs\.md`/g, '`./<name>.md`')
      // chart-family lists its members as a shell brace expansion over the repo
      // tree. Same file, flat, in the kit.
      .replace(/`lib\/components\/[a-z-]+\/\{[^}]*\}\/<name>\.docs\.md`/g, '`./<name>.md`')
      // HARD RULE numbers are the repo's internal index; the kit's reader has no
      // CLAUDE.md to resolve them against. Keep the requirement, drop the citation.
      .replace(/ — HARD RULE #6 requires that before you write the slide/g, ' — always read it before you write the slide')
      .replace(/, which HARD RULE #6 requires you to open before/g, ', which you should always open before')
      .replace(/ \(HARD RULE #5, lint[^)]*\)/g, '')
      .replace(/ \(HARD RULE #5\)/g, '')
  );
}

/**
 * Give `## Demo deck` something to say.
 *
 * `relocate()` drops the "See <name>.gallery.light.pdf" sentence, because those
 * PDFs are ~1 MB each and the kit is text — but it left the HEADING standing. The
 * result shipped in all 61 component files AND was re-projected into the whole
 * prose catalog: a section header with nothing under it, 61 times, which reads to
 * a model as a section whose content failed to load.
 *
 * The live component page is the better answer anyway. It carries every variant
 * rendered, a live preview and an in-browser editor — strictly more than the PDF
 * the sentence used to promise — and it also gives the kit the outbound URL it
 * did not have. Before this, the only navigational link in 2.2 MB pointed at
 * `slidewright.github.io`, which is not where the site lives.
 */
function demoDeckLink(text, bucket, name) {
  return String(text).replace(
    /## Demo deck\s*$/,
    [
      '## Demo deck',
      '',
      `Every variant rendered, with a live preview and an in-browser editor:`,
      `<https://lattice.style/components/${bucket}/${name}>`,
      '',
    ].join('\n'),
  );
}

function componentDocs() {
  const { componentDir, loadAll, manifestBucket } = require(path.join(ROOT, 'lib', 'components'));
  const out = [];
  for (const m of loadAll()) {
    const bucket = manifestBucket(m);
    const src = path.join(componentDir(m), `${m.name}.docs.md`);
    if (!existsSync(src)) continue;
    out.push({
      name: m.name,
      bucket,
      body: Buffer.from(demoDeckLink(relocate(readFileSync(src, 'utf8')), bucket, m.name), 'utf8'),
    });
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
      out.push({ name: `_${family}`, bucket, family: true, body: Buffer.from(relocate(readFileSync(src, 'utf8')), 'utf8') });
    }
  }
  // A plugin that owns kinds (the chart family) documents their shared kernel in its `shared/README.md`.
  const { pluginKindFolders } = require(path.join(ROOT, 'lib', 'packages', 'fs.js'));
  const owners = new Map();
  for (const k of pluginKindFolders(path.join(ROOT, 'lib', 'components'))) {
    const pluginDir = path.dirname(k.parent);
    if (!owners.has(pluginDir)) owners.set(pluginDir, manifestBucket(loadAll().find((m) => m.name === k.name)));
  }
  for (const [pluginDir, bucket] of owners) {
    const src = path.join(pluginDir, 'shared', 'README.md');
    if (existsSync(src)) out.push({ name: `_${path.basename(pluginDir)}`, bucket, family: true, body: Buffer.from(relocate(readFileSync(src, 'utf8')), 'utf8') });
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

/** The hand-written skills, copied verbatim from design/skills/. */
/**
 * plugins/<name>.md — every author-facing plugin's doc, shipped like the component docs.
 *
 * Until 2026-11-17 the kit carried none of them, so an agent never learned the inline notation
 * the plugins add: pills (`{On plan}`), icons, sparks, check marks, avatars, images, video,
 * callouts, legends. The kit's own starter deck had its pills in a dead form for a month, and
 * the agent that found it misread the lint fix the same way. Each doc's sibling links become
 * flat files here; any other repo-relative link becomes the file on GitHub, so the pack's link
 * gate holds.
 */
const REPO_GITHUB = 'https://github.com/Laticent/lattice/';
const SITE = 'https://lattice.style';
/**
 * A repo path's page on GitHub: `blob/` for a file, `tree/` for a folder. GitHub answers
 * `blob/main/<folder>/` with HTTP 400, so a folder link written as `blob/` is a dead link an
 * agent follows (it shipped in start.md's anima line). A path that is not in the tree fails
 * the build: the pack must never point at a file that does not exist.
 */
/**
 * Every code region of a Markdown text: a fence closes only on its own run of backticks or
 * tildes (a ```` fence holds ``` lines), and a code span only on its own run of backticks.
 * Unanchored or unmatched forms paired the inline "```mermaid" mentions in start.md's rules with
 * a skeleton fence 190 lines later, and the link gate below went blind to every link between.
 */
const CODE_REGIONS = /^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1[ \t]*$|(`+)[^`\n]*?\2/gm;
function proseOnly(body, fn) {
  // Rewrite links in prose only. A link inside a code fence or a code span is an EXAMPLE an
  // author copies (`![](marcus.jpg)` in the avatars doc is the author's own photo, next to
  // their deck), so it must reach the pack byte for byte.
  const kept = [];
  const masked = body.replace(CODE_REGIONS, (code) => `\uE000${kept.push(code) - 1}\uE000`);
  return fn(masked).replace(/\uE000(\d+)\uE000/g, (_m, i) => kept[Number(i)]);
}
function repoUrl(repoPath) {
  const abs = path.join(ROOT, repoPath);
  if (!existsSync(abs)) throw new Error(`agent pack links ${repoPath}, which is not in the repo`);
  // No trailing slash: GitHub answers `tree/main/<folder>/` with 400 too, only the bare form works.
  return `${REPO_GITHUB}${statSync(abs).isDirectory() ? 'tree' : 'blob'}/main/${repoPath.replace(/\/$/, '')}`;
}
function pluginDocs() {
  const dir = path.join(ROOT, 'lib', 'plugins');
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    const src = path.join(dir, name, `${name}.docs.md`);
    if (!existsSync(src)) continue;
    const from = `lib/plugins/${name}/`;
    const body = proseOnly(readFileSync(src, 'utf8'), (prose) => prose.replace(/\]\((?!https?:|#|mailto:|sample:)([^)\s]+)\)/g, (_whole, href) => {
      const [file, anchor = ''] = href.split(/(?=#)/);
      const repoPath = path.posix.normalize(path.posix.join(from, file));
      const sibling = repoPath.match(/^lib\/plugins\/([a-z0-9-]+)\/\1\.docs\.md$/);
      if (sibling) return `](./${sibling[1]}.md${anchor})`;
      const comp = repoPath.match(/^lib\/components\/[a-z0-9-]+\/([a-z0-9-]+)\/\1\.docs\.md$/);
      if (comp) return `](../${COMPONENTS}/${comp[1]}.md${anchor})`;
      return `](${repoUrl(repoPath)}${anchor})`;
    }));
    const flat = body
      // A layout's repo path, written as code, is that layout's file in the pack.
      .replace(/`lib\/components\/[a-z0-9-]+\/<name>\/<name>\.docs\.md`/g, `\`../${COMPONENTS}/<name>.md\``)
      .replace(/`lib\/components\/[a-z0-9-]+\/([a-z0-9-]+)\/\1\.docs\.md`/g, `\`../${COMPONENTS}/$1.md\``)
      // The repo's rule index means nothing to a pack reader; keep the sentence, drop the citation.
      .replace(/where HARD RULE #1 put them/g, 'where the shared render kernel keeps them');
    out.push({ name, body: Buffer.from(flat, 'utf8') });
  }
  return out;
}

/**
 * authoring/universal.md and authoring/registers.md — what every slide can carry, and every
 * deck-level front-matter register. They are `lib/base/base.docs.md` and
 * `lib/base/base.registers.docs.md`, the repo's own references for the parts no single layout
 * owns: the eyebrow, the subtitle, the key insight, the below-note, annotations, corner tags,
 * tables, switches, `numbered`, `mirror`, focus, builds, and the `mode:`/`finish:`/`venue:`/…
 * registers. The pack carried neither until 2026-11-17, so an agent learned the key insight
 * from one rule's passing mention and the registers not at all. Links are flattened the same
 * way the plugin docs' are.
 */
function universalDocs() {
  const flatten = (body, from) =>
    proseOnly(body, (prose) => prose.replace(/\]\((?!https?:|#|mailto:|sample:)([^)\s]+)\)/g, (_whole, href) => {
        const [file, anchor = ''] = href.split(/(?=#)/);
        // A site path (`/reference/switches/`) is a docs page: the pack lives on that site,
        // so it becomes the page's Markdown copy there.
        if (file.startsWith('/')) {
          const page = file.replace(/^\/|\/$/g, '');
          const src = ['md', 'mdx'].map((x) => path.join(ROOT, 'docs', 'src', 'content', 'docs', `${page}.${x}`));
          if (!page || !src.some(existsSync)) throw new Error(`agent pack links site path ${file}, which has no Markdown copy`);
          return `](${SITE}/${page}.md${anchor})`;
        }
        const repoPath = path.posix.normalize(path.posix.join(from, file));
        if (repoPath === 'lib/base/base.docs.md') return `](./universal.md${anchor})`;
        if (repoPath === 'lib/base/base.registers.docs.md') return `](./registers.md${anchor})`;
        const comp = repoPath.match(/^lib\/components\/[a-z0-9-]+\/([a-z0-9-]+)\/\1\.docs\.md$/);
        if (comp) return `](../${COMPONENTS}/${comp[1]}.md${anchor})`;
        const plug = repoPath.match(/^lib\/plugins\/([a-z0-9-]+)\/\1\.docs\.md$/);
        if (plug) return `](../plugins/${plug[1]}.md${anchor})`;
        return `](${repoUrl(repoPath)}${anchor})`;
      }))
      .replace(/`lib\/components\/[a-z0-9-]+\/([a-z0-9-]+)\/\1\.docs\.md`/g, `\`../${COMPONENTS}/$1.md\``)
      .replace(/lib\/components\/(?:<bucket>\/)?<name>\/<name>\.docs\.md/g, `../${COMPONENTS}/<name>.md`)
      .replace(/ \(HARD RULE #\d+[^)]*\)/g, '')
      .replace(/HARD RULE #\d+/g, 'a house rule');
  return [
    { rel: `${AUTHORING}/universal.md`, body: flatten(readFileSync(path.join(ROOT, 'lib', 'base', 'base.docs.md'), 'utf8'), 'lib/base/') },
    { rel: `${AUTHORING}/registers.md`, body: flatten(readFileSync(path.join(ROOT, 'lib', 'base', 'base.registers.docs.md'), 'utf8'), 'lib/base/') },
  ];
}

/** GitHub's heading anchor: lower-case, punctuation dropped, spaces to hyphens. */
function anchorOf(heading) {
  return heading.toLowerCase().replace(/[^\p{L}\p{N} -]/gu, '').trim().replace(/ /g, '-');
}

/**
 * The parts any slide can carry, from universal.md's "Auto-detected authoring patterns": each
 * `###` heading with the first sentence under it. And the registers, from registers.md's `##`
 * headings. Both stay in the source's words, so start.md cannot drift from them.
 */
function universalRows(files) {
  const uni = files.get(`${AUTHORING}/universal.md`).toString('utf8');
  // Fenced examples carry their own `## Slide heading` lines; take them out before finding where
  // the section ends.
  const prose = uni.replace(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?^\1[ \t]*$/gm, '');
  const sec = prose.split(/^## Auto-detected authoring patterns\s*$/m)[1]?.split(/^## /m)[0];
  if (!sec) throw new Error('build-agent-kit: universal.md has no "Auto-detected authoring patterns" section for start.md to summarize.');
  const parts = [];
  for (const chunk of sec.split(/^### /m).slice(1)) {
    const [head, ...rest] = chunk.split('\n');
    const para = rest.join('\n').trim().split(/\n\n/)[0].replace(/\n/g, ' ');
    parts.push(`- [${head.trim()}](./${AUTHORING}/universal.md#${anchorOf(head.trim())}): ${firstSentence(para, 170)}`);
  }
  const reg = files.get(`${AUTHORING}/registers.md`).toString('utf8');
  const registers = [...reg.matchAll(/^## (.+)$/gm)].map(([, h]) => {
    const keys = [...h.matchAll(/`([a-z-]+):`/g)].map((k) => `\`${k[1]}:\``);
      const what = h.match(/\(([^)]+)\)\s*$/)?.[1] || h.replace(/^The /, '').replace(/`[^`]*`/g, '').replace(/[—–-]\s*$/, '').trim();
    return keys.length ? `- [${keys.join(' / ')}](./${AUTHORING}/registers.md#${anchorOf(h)}): ${what}` : null;
  }).filter(Boolean);
  return { parts, registers };
}

/**
 * One plugin, in one line: the doc's first sentence, and the first line of its first example
 * that actually shows inline notation (`{…}`, `~{…}`, `^{…}`, `!{…}`, `@name{…}`, `[x]`). A
 * fence plugin (code, math, mermaid…) has no such line; its sentence names the fence.
 */
function pluginSummary(body) {
  const text = body.replace(/^# .*\n+/, '');
  const lead = firstSentence(text.split(/\n\n/)[0].replace(/:$/, '.'), 150);
  const ex = text.match(/```markdown\n([\s\S]*?)\n```/);
  const { MARKER_CLASS } = require(path.join(ROOT, 'lib', 'core', 'checks-registry.js'));
  const notation = new RegExp(`\`[~^!@a-z]*\\{|^\\s*-\\s\\[${MARKER_CLASS}\\]`);
  const line = ex?.[1].split('\n').find((l) => notation.test(l));
  // Where the example works: the layout its own example block sets, when it sets one. A callout
  // copied onto a `content` slide renders as code (found by rendering every example, 2026-11-17).
  const cls = ex?.[1].match(/<!--\s*_class:\s*([a-z0-9-]+)/)?.[1] ?? '';
  // A plugin whose own "Where it draws today" says its authored form is not drawn yet gets no
  // example: an agent copies examples. When the doc stops saying so, the example comes back.
  const today = text.split(/^## Where it draws today\s*$/m)[1]?.split(/^## /m)[0] ?? '';
  const notDrawn = /\bis not drawn\b/.test(today);
  return { lead, example: line && !notDrawn ? line.trim() : '', cls };
}

function skillDocs() {
  return readdirSync(SKILLS_DIR)
    .filter((f) => f.endsWith('.md'))
    .sort()
    .map((f) => ({ name: f, body: readFileSync(path.join(SKILLS_DIR, f)) }));
}

/**
 * review/check.mjs — the INDEPENDENT checker, and the only executable in the kit.
 *
 * An LLM reviewing its own draft against a rubric it just read will declare it
 * fine; that is the failure this exists to stop. So the kit ships the REAL
 * reviewer — the same `reviewText` the Studio runs on decks its own model
 * writes — as one dependency-free file. `node check.mjs deck.md` prints
 * structured findings in ~0.1s at ZERO token cost, which is the whole point: an
 * agent writes once, checks deterministically, fixes what is named, ships.
 *
 * It wires the kit's OWN `reference/components.json` for `bucketOf`/`densityOf`.
 * That is not optional polish — without the catalog the reviewer silently skips
 * a whole class: a matrix-2x2 element at 28 words against a ~10-word budget is
 * found only when the catalog is passed (measured).
 *
 * ITS FIRST-PARTY GRAPH IS lib/ → lib/ ONLY, and that is the load-bearing half.
 * An earlier attempt to bundle a DOCS module broke `npm ci` for everyone,
 * because `prepare` runs this build and the docs workspace's deps are not
 * installed by a root-only install. Verified by running this build with
 * `docs/node_modules` hidden.
 *
 * It is NOT dependency-free. review-core requires markdown-it, so esbuild inlines
 * it and five transitive deps (linkify-it, mdurl, uc.micro, punycode.js, entities)
 * — root deps, so `npm ci` is safe, but MIT/BSD-2-Clause code whose notices the
 * bundler strips. `thirdPartyLicenses()` restores them from the packages' own
 * LICENSE files and throws if one cannot be found. An earlier revision of this
 * docblock said "lib/ → lib/ only" full stop, and the kit published with no
 * notices and no LICENSE at all on the strength of it.
 */
/** The universal + semi-universal modifier names, for the kit checker's vocab. */
function universalModifierNames() {
  const { UNIVERSAL_VARIANTS, SEMI_UNIVERSAL_VARIANTS } = require(path.join(ROOT, 'lib', 'components', 'index.js'));
  return [...new Set([...(UNIVERSAL_VARIANTS || []), ...(SEMI_UNIVERSAL_VARIANTS || [])])].sort();
}

function reviewBundle() {
  const tmp = mkdtempSync(path.join(tmpdir(), 'lattice-review-'));
  try {
    const entry = path.join(tmp, 'entry.mjs');
    const out = path.join(tmp, 'check.mjs');
    writeFileSync(
      entry,
      [
        "import { readFileSync } from 'node:fs';",
        "import { dirname, join } from 'node:path';",
        "import { fileURLToPath } from 'node:url';",
        `import { reviewText, RUBRIC } from ${JSON.stringify(path.join(ROOT, 'lib', 'authoring', 'review-core.js'))};`,
        `import { lintTextWith } from ${JSON.stringify(path.join(ROOT, 'lib', 'authoring', 'lint-core.js'))};`,
        '',
        // The universal modifier names, embedded as a literal. They live in
        // lib/components/index.js, which reads the manifest tree off disk and so
        // cannot be bundled — but the VALUES are static, and lintTextWith only
        // wants `{ names, modifiers }`.
        `const UNIVERSALS = ${JSON.stringify(universalModifierNames())};`,
        '// The packed slot contract (lib/authoring/slot-contract.generated.js): lint-core reads it from the',
        '// vocabulary, so without it the `slot-contract`, `variant-inert` and `foreign-variant` rules are off.',
        `const SLOT_CONTRACT = ${JSON.stringify(require(path.join(ROOT, 'lib', 'authoring', 'slot-contract.generated.js')))};`,
        '',
        '// The catalog lives beside this file in the kit. Without it neither half',
        '// can do its job: the reviewer loses per-element word budgets, and the',
        '// linter loses the component names it checks `_class` against.',
        'function catalogLookups() {',
        '  try {',
        "    const here = dirname(fileURLToPath(import.meta.url));",
        "    const raw = readFileSync(join(here, '..', 'reference', 'components.json'), 'utf8');",
        '    const all = JSON.parse(raw).components;',
        '    const byName = new Map(all.map((c) => [c.name, c]));',
        '    return {',
        '      bucketOf: (n) => byName.get(n)?.bucket || null,',
        '      densityOf: (n) => byName.get(n)?.density || null,',
        '      vocab: {',
        '        names: new Set(all.map((c) => c.name)),',
        '        modifiers: new Set([...UNIVERSALS, ...all.flatMap((c) => c.variants || [])]),',
        '        slotContract: SLOT_CONTRACT,',
        '      },',
        '      found: byName.size,',
        '    };',
        '  } catch {',
        '    return { found: 0 };',
        '  }',
        '}',
        '',
        '// lint-core writes for someone standing in the repo; two of its fix strings',
        '// name paths a kit reader does not have.',
        'function kitPaths(text) {',
        '  return String(text)',
        "    .replace(/dist\\/docs\\/components\\.json/g, 'reference/components.json')",
        "    .replace(/design\\/design-system\\.md §6\\.5/g, 'authoring/modifiers.md');",
        '}',
        '',
        '// An author in the Studio gets a picker; a kit reader has only the files. So an',
        '// unknown class also names where the real list lives.',
        'function kitFix(f) {',
        '  const fix = f.fix ? kitPaths(f.fix) : f.fix;',
        "  if (f.rule !== 'unknown-class') return fix;",
        "  return (fix ? fix + ' ' : '') + 'The full list is in reference/components.json.';",
        '}',
        '',
        '// The two halves answer different questions and a deck needs both. The',
        '// LINTER asks whether the deck is even valid — an invented `_class` is the',
        '// single most likely mistake a model makes here, and the reviewer cannot',
        '// see it. The REVIEWER asks whether the deck is any good. Shipping only the',
        '// second told a reader "the floor is met" over a deck that would not render.',
        'export function review(source) {',
        '  const { bucketOf, densityOf, vocab } = catalogLookups();',
        '  const lint = vocab ? lintTextWith(source, vocab) : [];',
        '  const findings = [',
        '    ...lint.map((f) => ({ ...f, fix: kitFix(f), message: kitPaths(f.message) })),',
        '    ...reviewText(source, { bucketOf, densityOf }),',
        '  ];',
        "  const rank = { error: 0, warning: 1, suggestion: 2 };",
        '  return findings.sort(',
        '    (a, b) => (rank[a.severity] ?? 3) - (rank[b.severity] ?? 3) || (a.slide || 0) - (b.slide || 0),',
        '  );',
        '}',
        'export { RUBRIC };',
        '',
        // A BASENAME match is not an identity check: a consumer wrapper named
        // check.mjs (the obvious name) imported this module and got the CLI,
        // which then exited the process instead of returning. realpath both
        // sides — the same idiom this generator uses on itself.
        "import { realpathSync } from 'node:fs';",
        'const sameFile = (a, b) => {',
        '  try {',
        '    return realpathSync(a) === realpathSync(b);',
        '  } catch {',
        '    return false;',
        '  }',
        '};',
        'const invoked = process.argv[1] && sameFile(process.argv[1], fileURLToPath(import.meta.url));',
        'if (invoked) {',
        '  const args = process.argv.slice(2);',
        "  const strict = args.includes('--strict');",
        "  const asJson = args.includes('--json');",
        "  const files = args.filter((a) => !a.startsWith('--'));",
        '  if (!files.length) {',
        '    console.error([',
        "      'Lattice deck checker',",
        "      '',",
        "      '  node check.mjs <deck.md> [more.md ...] [--json] [--strict]',",
        "      '',",
        "      'Prints what is wrong with a deck: placeholder titles, label headings, a missing',",
        "      'ask, elements past their word budget. Deterministic, offline and free — it is',",
        "      'code, not a model, so it cannot talk itself into approving. It catches the',",
        "      'checkable half; taste is still yours.',",
        "      '',",
        "      '  --json    machine-readable findings',",
        "      '  --strict  exit 1 when anything is found (default exits 0)',",
        "    ].join('\\n'));",
        '    process.exit(2);',
        '  }',
        '  const { bucketOf, densityOf, found } = catalogLookups();',
        '  const results = [];',
        '  for (const file of files) {',
        '    let source;',
        '    try {',
        "      source = readFileSync(file, 'utf8');",
        '    } catch (err) {',
        '      // A missing path or a directory used to dump a raw Node stack trace',
        '      // out of a shipped CLI. Say what is wrong in one line.',
        "      const why = err && err.code === 'ENOENT' ? 'no such file'",
        "        : err && err.code === 'EISDIR' ? 'is a directory, not a deck'",
        "        : (err && err.message) || 'could not be read';",
        "      console.error('check.mjs: ' + file + ' — ' + why);",
        '      process.exit(2);',
        '    }',
        '    results.push({ file, findings: review(source) });',
        '  }',
        '  const total = results.reduce((n, r) => n + r.findings.length, 0);',
        '  if (asJson) {',
        '    // ONE envelope shape, whatever the file count — and it carries `partial`.',
        '    // The array form suppressed the partial marker in exactly the mode a',
        '    // machine reads, so a check that skipped a whole rule class came back',
        '    // as [] and read as clean.',
        '    console.log(JSON.stringify({ partial: !found, files: results }, null, 2));',
        '  } else {',
        '    for (const r of results) {',
        "      if (files.length > 1) console.log(r.file);",
        '      if (!r.findings.length) {',
        "        console.log(found",
        "          ? 'No findings. The checkable half is clean — now read it and judge the argument.'",
        "          : 'No findings — but see the note below; this was a PARTIAL check.');",
        '      } else {',
        '        console.log(r.findings.length + (r.findings.length === 1 ? \' finding\' : \' findings\'));',
        "        console.log('');",
        '        for (const f of r.findings) {',
        '          const where = f.slide ? \'slide \' + f.slide : \'deck\';',
        '          console.log(\'  \' + where + \'  [\' + f.rule + \']  \' + f.message);',
        '          if (f.line) console.log(\'            at:  \' + f.line);',
        '          if (f.fix) console.log(\'            fix: \' + f.fix);',
        '        }',
        '      }',
        "      if (files.length > 1) console.log('');",
        '    }',
        '    // Warn on a PARTIAL check whether or not anything was found. Reporting',
        '    // "clean" when a whole rule class was skipped is the silent under-report',
        '    // this checker exists to prevent.',
        '    if (!found) {',
        "      console.log('');",
        "      console.log('  note: reference/components.json was not found beside this file, so');",
        "      console.log('        per-element word budgets were NOT checked. Keep check.mjs inside');",
        "      console.log('        the kit for the full set.');",
        '    }',
        '  }',
        '  process.exit(strict && total ? 1 : 0);',
        '}',
        '',
      ].join('\n'),
    );
    // esbuild's own API, the idiom the other ten build tools use (HARD RULE #15).
    // Spawning `node_modules/.bin/esbuild` instead relied on an extensionless
    // shim that Windows cannot execute directly — and this build runs from
    // `prepare`, so a spawn failure there is an INSTALL failure for a consumer.
    require('esbuild').buildSync({
      entryPoints: [entry],
      bundle: true,
      format: 'esm',
      platform: 'node',
      outfile: out,
      logLevel: 'error',
      absWorkingDir: ROOT,
    });
    // esbuild writes each module's path as a comment, and the ENTRY lives in a
    // randomly named temp dir — so two builds of identical source differ by one
    // line and the freshness gate fails on every CI run. Normalize it to a stable
    // label, which also tells a reader of check.mjs where the CLI came from.
    const body = readFileSync(out, 'utf8').replace(
      /^\/\/ .*lattice-review-[A-Za-z0-9]+\/entry\.mjs$/m,
      '// <CLI entry, generated by tools/build-agent-kit.mjs>',
    );
    rmSync(tmp, { recursive: true, force: true });
    return Buffer.from(body, 'utf8');
  } catch (err) {
    rmSync(tmp, { recursive: true, force: true });
    throw new Error(
      `build-agent-kit: could not bundle the deck checker — ${err?.message || err}\n` +
        '  review-core.js and its lib/ graph must bundle for the node platform with no bare imports.\n' +
        '  If a new import reached in from the docs workspace, that is the bug: a docs dep here breaks\n' +
        '  `npm ci` for every consumer, because `prepare` runs this build.',
    );
  }
}

/**
 * The third-party packages esbuild actually pulled into `review/check.mjs`.
 *
 * DERIVED FROM THE BUNDLE, never from a hand-kept list: esbuild writes each
 * module's source path as a banner comment, so the set of `node_modules/<pkg>/`
 * prefixes IS the set of packages redistributed. A hand list would silently rot
 * the first time review-core's import graph moves — which is exactly how these
 * six shipped with no notices at all.
 *
 * `markdown-it` and its five transitive deps are MIT / BSD-2-Clause. Both
 * require the copyright notice to accompany a redistribution, and esbuild
 * strips comments from the packages it inlines, so the notice has to be
 * restored beside the file. Missing LICENSE text is a hard error: publishing
 * without it is the defect this function exists to prevent.
 */
function bundledPackages(bundle) {
  const names = new Set();
  for (const m of String(bundle).matchAll(/^\/\/ node_modules\/((?:@[^/\n]+\/)?[^/\n]+)\//gm)) {
    names.add(m[1]);
  }
  return [...names].sort();
}

const LICENSE_FILENAMES = ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'LICENCE', 'LICENSE-MIT.txt', 'LICENSE-MIT'];

function thirdPartyLicenses(bundle) {
  const pkgs = bundledPackages(bundle);
  if (!pkgs.length) {
    throw new Error(
      'build-agent-kit: no bundled packages detected in review/check.mjs.\n' +
        '  Either esbuild stopped emitting its path banners (so the license list can no longer be\n' +
        '  derived and must be rewritten), or the bundle is empty. Do not publish either way.',
    );
  }
  const rule = '='.repeat(78);
  const out = [
    'THIRD-PARTY LICENSES',
    '',
    'The Lattice engine itself is AGPL-3.0-only — see LICENSE and NOTICE.md.',
    '',
    'review/check.mjs is a single-file bundle. The packages below are third party,',
    'inlined into it unmodified, and governed by their own terms, reproduced here in',
    'full because the bundler strips the notices from the code itself.',
    '',
  ];
  for (const name of pkgs) {
    const dir = path.join(ROOT, 'node_modules', name);
    const file = LICENSE_FILENAMES.map((f) => path.join(dir, f)).find((f) => existsSync(f));
    if (!file) {
      throw new Error(
        `build-agent-kit: ${name} is bundled into review/check.mjs but ships no LICENSE file.\n` +
          '  Its terms cannot be reproduced, so the kit cannot be published with it. Vendor the\n' +
          "  text into assets/licenses/ and extend LICENSE_FILENAMES, or drop the dependency.",
      );
    }
    let version = '';
    try {
      version = `@${JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8')).version}`;
    } catch {
      version = '';
    }
    out.push(rule, `${name}${version}`, rule, '', readFileSync(file, 'utf8').trimEnd(), '');
  }
  return out.join('\n');
}

/**
 * NOTICE.md — the license facts a recipient cannot get from the files.
 *
 * The agent kit is mostly prose, and prose about an AGPL engine is not itself
 * the engine. One file is different: `review/check.mjs` is Lattice's own
 * reviewer compiled to a runnable bundle — engine code, handed over loose — so
 * the AGPL applies to it in full and the output exception (which covers engine
 * assets embedded inside a RENDERED deck) does not reach it.
 */
function noticeDoc(bundle) {
  return [
    '# Notices',
    '',
    '## Lattice',
    '',
    'Copyright (c) 2025-2026 Laticent. Licensed under the **GNU Affero General',
    'Public License, version 3** — the full text is in `LICENSE`, beside this file.',
    '',
    'Most of this kit is documentation: the component references, the authoring',
    'canon, the skills and the catalogs describe Lattice rather than being it. Decks',
    'you write from them are yours, and were never covered either way.',
    '',
    '**`review/check.mjs` is different.** It is the Lattice reviewer itself,',
    'compiled to one runnable file — engine code handed over loose, not engine code',
    'embedded in a rendered deck — so the AGPL applies to it in full and the output',
    'exception in `LICENSE-EXCEPTIONS` does not reach it. Running it on your own',
    'decks is ordinary use and asks nothing of you; redistributing it, or a service',
    'built on it, is what the license speaks to.',
    '',
    '## Third-party code inside `review/check.mjs`',
    '',
    'The bundle inlines the packages below. The bundler strips their comments, so',
    'their notices are reproduced in full in `THIRD-PARTY-LICENSES.txt`.',
    '',
    '| Package | License |',
    '|---|---|',
    ...bundledPackages(bundle).map((n) => {
      let lic = 'see THIRD-PARTY-LICENSES.txt';
      try {
        lic = JSON.parse(readFileSync(path.join(ROOT, 'node_modules', n, 'package.json'), 'utf8')).license || lic;
      } catch {
        /* fall through to the pointer */
      }
      return `| \`${mdCell(n)}\` | ${mdCell(lic)} |`;
    }),
    '',
  ].join('\n');
}

/** review/rubric.md — the same 17 checks, for a reader rather than a runtime. */
function rubricDoc() {
  const { RUBRIC } = require(path.join(ROOT, 'lib', 'authoring', 'review-core.js'));
  return [
    '# The review rubric',
    '',
    `The ${RUBRIC.length} checks \`check.mjs\` applies, in plain form — so you can see what it looks for,`,
    'and so a human reviewing by hand looks for the same things.',
    '',
    '**Prefer running the checker.** It is deterministic and costs nothing; reading this',
    'list and self-assessing costs a full pass over the deck and is easy to be generous with.',
    '',
    '| Trap | Fix |',
    '|---|---|',
    ...RUBRIC.map((r) => `| ${mdCell(r.trap)} | ${mdCell(r.fix)} |`),
    '',
    '---',
    '',
    'Source: `RUBRIC` in `lib/authoring/review-core.js` — the same array the checker runs.',
    '',
  ].join('\n');
}

/** review/README.md — the local bootstrap for checking your work. */
function reviewReadme(files) {
  return [
    '# Check your work',
    '',
    'You have written a deck. Before you hand it over, find what is wrong with it.',
    '',
    '## Run the checker',
    '',
    '```sh',
    'node check.mjs your-deck.md',
    '```',
    '',
    'It prints findings like this:',
    '',
    '```',
    '3 findings',
    '',
    '  slide 1  [title-incomplete]  the title slide has no subtitle — one line of framing orients the room',
    '  slide 4  [label-title]       "Next Steps" is a label, not a takeaway — say what the slide proves',
    '  deck     [no-ask]            no clear ask or recommendation — what should the audience do?',
    '```',
    '',
    'Pass more than one file to check them all. Add `--strict` to exit non-zero when',
    'anything is found.',
    '',
    '`--json` emits one envelope, whatever the file count:',
    '',
    '```json',
    '{ "partial": false, "files": [ { "file": "deck.md", "findings": [ … ] } ] }',
    '```',
    '',
    '`partial` is `true` when `../reference/components.json` was not found beside the',
    'checker — half the rules are skipped without it, so an empty `findings` in that',
    'state does NOT mean clean. Keep the kit together and it stays `false`.',
    '',
    '## Why run it rather than self-review',
    '',
    'It is **code, not a model.** It cannot be talked into approving a deck, it costs',
    '**no tokens**, and it runs in about a tenth of a second offline. It is the same',
    'reviewer AND the same linter the Lattice Studio runs on decks its own model writes,',
    'so it cannot drift into a second opinion.',
    '',
    'A model checking its own draft against a rubric it read two minutes ago will tell you',
    'the draft is fine. That is the failure this file exists to prevent.',
    '',
    '## What it does and does not catch',
    '',
    'It runs TWO passes and merges them, because they answer different questions.',
    '',
    '**The linter asks whether the deck is valid.** An invented `_class`, a card written',
    'as one inline line when the layout needs nested bullets, a front-matter key that does',
    'not exist. Reported as `error` / `warning` and listed first — these are the ones that',
    'stop a deck rendering the way you meant, and an invented component name is the single',
    'most likely mistake a model makes here.',
    '',
    '**The reviewer asks whether the deck is any good** — the falsifiable half of that:',
    'placeholder titles, headings that are labels rather than takeaways, a data slide with',
    'no "so what", a hero number with nothing to compare it to, elements past their word',
    'budget, a deck with no ask, duplicate claims, missing image alt text. Reported as',
    '`suggestion`.',
    '',
    '**Neither catches whether the argument is any good.** No checker can. Clean output',
    'means the deck is valid and clears the mechanical bar — the judgment is still yours,',
    'against `../authoring/deck-canon.md`.',
    '',
'## Files',
    '',
    `- \`check.mjs\` — the checker (${(bytesOf(files, `${REVIEW}/check.mjs`) / 1024).toFixed(0)} KB, self-contained, needs Node 18+)`,
    '- `rubric.md` — the same checks in plain form, for reading or for a human pass',
    '',
    'The checker reads `../reference/components.json` for per-element word budgets. Keep the',
    'kit together and it just works; move `check.mjs` alone and it still runs, minus that check.',
    '',
  ].join('\n');
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
    ...fenced(DECK_CANON.trim()),
    '',
    '## The short form',
    '',
    'A small on-device model loses the thread on a long system prompt, so the Studio sends',
    'this reduced canon to local models instead. Use it when context is very tight — it is',
    'the load-bearing subset, not a summary.',
    '',
    ...fenced(DECK_CANON_SHORT.trim()),
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
    'Source: `docs/src/lib/architect-knowledge.js` (`AUTHORING_RULES`).',
    '',
  ].join('\n');
}

/**
 * authoring/modifiers.md — the cross-cutting vocabulary, which the kit named and
 * never listed.
 *
 * `rules.md` tells an author to compose `tint-*` / `mark-*` / `with-*` / `tone-*`
 * onto the class, and every component doc ended a paragraph with "see
 * design/design-system.md §6.5 for the catalog" — a file outside the kit. So the
 * catalog was mandatory to use and impossible to read: a cold consumer measured
 * it and used no modifier at all rather than guess.
 *
 * GENERATED FROM `UNIVERSAL_GROUPS`, not copied from the prose (HARD RULE #1).
 * The prose had already drifted — the anchor those 62 links used still said
 * `three-tiers` after the section became four.
 */
function modifiersDoc() {
  const { UNIVERSAL_GROUPS, SEMI_UNIVERSAL_VARIANTS } = require(path.join(ROOT, 'lib', 'components', 'index.js'));
  // What each group is FOR. The names alone do not say when to reach for one,
  // and "when not to" is the line that actually saves a reader a bad slide.
  const BLURBS = {
    mood: 'Flip a single slide to the dark companion palette. Deck-wide dark is a theme choice, not this.',
    decoration: 'Ambient art on the canvas. One per slide at most — two read as clutter, and none is the right answer on a dense slide.',
    typography: 'Scale the slide’s type up, or control the auto-period on headings. `scale-*` buys emphasis on a SPARSE slide; on a full one it just overflows.',
    chrome: 'Turn the running header, footer, page number or section rail off for one slide. `silent` turns off all four in one token — it is what bookends use.',
    note: 'Act on a trailing sentence: keep it as body copy, or mark the slide’s callout as an alarm (the warning triangle is drawn, so a caveat needs no typed glyph).',
    social: 'Crop-safe framing for a slide destined to be screenshotted.',
    table: 'Table treatment switches: drop the zebra, spread rows into leftover height, or decode the six state markers (`[x]` `[-]` `[!]` `[?]` `[ ]` `[/]`) in cells into status discs.',
    state: 'Collaboration markers — a visible stamp that a slide is in progress, confidential or superseded. Meta-signal about the slide, independent of its content.',
    tone: 'Cast the whole slide in a pass/warn/fail/skip color. Use for "this is the failure slide", not to color one item.',
    insight: 'Rename the key-insight callout’s eyebrow (TAKEAWAY, VERDICT, THE ASK, …). Changes the WORD, never the styling.',
    claim: 'Let content claim the stage by receding the chrome — quiet, then hero. Composes with the chrome switches above.',
  };
  const rows = Object.entries(UNIVERSAL_GROUPS).map(
    ([group, names]) =>
      `| \`${mdCell(group)}\` (${names.length}) | ${names.map((n) => `\`${n}\``).join(' · ')} | ${mdCell(BLURBS[group] || '')} |`,
  );
  const total = Object.values(UNIVERSAL_GROUPS).reduce((n, v) => n + v.length, 0);
  return [
    '# Universal modifiers',
    '',
    'The core class tokens no layout has to declare. Nearly every layout honors them (the poster',
    'layouts `contact`, `wifi`, `gift-card` and `video` do not render several). Compose them on',
    'the same comment, space-separated, after the layout name:',
    '',
    '```',
    '<!-- _class: cards-grid dark tone-warn insight-the-ask -->',
    '```',
    '',
    `This page lists the ${total} core tokens, in ${Object.keys(UNIVERSAL_GROUPS).length} groups; a layout never has to declare them.`,
    'They are not the whole vocabulary: card tags (`tag-*`), card lift and rows, stage alignment,',
    'motion and the front-matter registers add more, each acting only on a layout that has the part',
    'it styles. The complete list, with the part of the slide each group acts on, is',
    '`vocabularies.modifierGroups` in [`reference/components.json`](../reference/components.json).',
    '',
    '| Group | Tokens | What it is for |',
    '|---|---|---|',
    ...rows,
    '',
    '## Two rules that save a slide',
    '',
    '**Colors come from the theme, never from you.** There is no way to author a hex',
    'value, and that is the point: a token means the same thing in every theme, a hex',
    'means one thing in one theme and is wrong in the rest.',
    '',
    '**One decoration per slide, and usually none.** `tint-*` and `mark-*` are ambient',
    'art. They earn their place on a bookend or a divider; on a slide already carrying',
    'content they compete with it.',
    '',
    '## Position suffixes',
    '',
    'The `tint-corner` / `tint-edge` treatments take a companion `at-*` token that says',
    'where: `at-tl` `at-top` `at-tr` `at-right` `at-br` `at-bottom` `at-bl` `at-left`.',
    'Author both — `tint-corner at-tl`.',
    '',
    '## Semi-universal',
    '',
    'These apply to MOST layouts; a layout whose shape they would break opts out, so a',
    'component file is the authority for its own:',
    '',
    ...(Array.isArray(SEMI_UNIVERSAL_VARIANTS) && SEMI_UNIVERSAL_VARIANTS.length
      ? [SEMI_UNIVERSAL_VARIANTS.map((v) => `\`${v}\``).join(' · '), '']
      : []),
    'Per-layout variants are listed in each `../components/<name>.md`.',
    '',
    '---',
    '',
    'Generated from `UNIVERSAL_GROUPS` in the component index — the same source the',
    'engine composes against, so this list cannot drift from what actually renders.',
    '',
  ].join('\n');
}

/** reference/studio-prompts.md — the generator canons that can be shipped safely. */
function studioPromptsDoc() {
  const { THEME_CANON } = require(path.join(ROOT, 'lib', 'theme', 'ai.js'));
  const { COMPONENT_CANON } = require(path.join(ROOT, 'lib', 'layout', 'ai.js'));

  return [
    "# The Studio's generator prompts",
    '',
    "> These are the instructions Lattice's own product sends its model when it GENERATES a",
    '> theme or a component. They are here so an outside agent can reproduce what the Studio',
    '> does.',
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
    ...fenced(String(THEME_CANON).trim()),
    '',
    '## COMPONENT_CANON',
    '',
    `Sent when generating a layout. See \`${SKILLS}/component.md\`.`,
    '',
    ...fenced(String(COMPONENT_CANON).trim()),
    '',
    '## FINISH_SYSTEM — not shipped, and why',
    '',
    'The finish generator prompt lives in `docs/src/components/studio/architect.ts` and is',
    'computed from the live finish catalog, so it cannot be read without loading that module —',
    'which imports `fuse.js` and `react` from the docs workspace. Extracting it made a root-only',
    '`npm ci` fail, so it is deliberately absent rather than shipped through a build step that',
    'breaks installation.',
    '',
    `Nothing is lost that matters: \`${SKILLS}/finish.md\` teaches the same four-layer system`,
    '(wash · texture · mark · edge) at length, with the closed vocabularies, the intensity',
    'ranges, what good and bad look like, and a ship checklist — and a test in the repo already',
    'reconciles that skill against the prompt, so they cannot say different things.',
    '',
    '---',
    '',
    'Sources: `lib/theme/ai.js`, `lib/layout/ai.js`. Generated by `tools/build-agent-kit.mjs`.',
    '',
  ].join('\n');
}

/** authoring/primer.md — the Studio's layout dossier, body byte-identical. */
async function buildPrimer() {
  // As file:// URLs: `import()` of a bare Windows path (`D:\…`) reads `d:` as a URL scheme and
  // throws, so this step failed on every Windows build (#2459's runner probe).
  const { buildStudioCatalog } = await import(
    pathToFileURL(path.join(ROOT, 'docs', 'src', 'lib', 'studio-catalog.mjs')).href
  );
  const { buildLatticePrimer, AUTHORING_RULES } = await import(
    pathToFileURL(path.join(ROOT, 'docs', 'src', 'lib', 'architect-knowledge.js')).href
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

/** The bucket → members map, shared by the root and components READMEs. */
function bucketIndex(components) {
  const byBucket = new Map();
  for (const c of components) {
    if (!byBucket.has(c.bucket)) byBucket.set(c.bucket, []);
    byBucket.get(c.bucket).push(c);
  }
  const { BUCKET_BLURBS } = require(path.join(ROOT, 'tools', 'build-bucket-galleries.js'));
  const { BUCKETS } = require(path.join(ROOT, 'lib', 'components'));
  return BUCKETS.filter((b) => byBucket.has(b)).map((b) => ({
    bucket: b,
    blurb: String(BUCKET_BLURBS[b] || b).replace(/^[^—]*—\s*/, ''),
    members: byBucket.get(b).filter((c) => !c.family),
    families: byBucket.get(b).filter((c) => c.family),
  }));
}

/**
 * components/README.md — the local bootstrap, and the one that carries the
 * WHEN-NOT-TO-USE signal.
 *
 * `components/_index.md` (the repo's pick list) deliberately truncates each
 * component to a first sentence and says so: "the half telling you when NOT to
 * use a component is deliberately not on this surface". That is right for a
 * ~3.8k-token grep surface and wrong for routing — picking between `matrix-2x2`
 * and `quadrant` is exactly where an agent goes wrong, and the deciding fact is
 * the anti-pattern, not the purpose.
 *
 * So this file pairs each component with its FIRST anti-pattern (~727 tokens for
 * all 61, measured) and the `related` edges that name what to use instead. Both
 * come from the manifests; nothing here is restated by hand.
 */
function componentsReadme(components, files) {
  const cat = JSON.parse(readFileSync(path.join(DOCS_DIR, 'components.json'), 'utf8'));
  const byName = new Map(cat.components.map((c) => [c.name, c]));
  const rows = [];
  for (const { bucket, blurb, members, families } of bucketIndex(components)) {
    rows.push(`### ${bucket} — ${blurb}`, '');
    for (const m of members) {
      const c = byName.get(m.name) || {};
      const use = String(c.description || c.purpose || '').split(/(?<=\.)\s/)[0];
      const not = (c.antiPatterns || [])[0];
      rows.push(`- **\`${m.name}\`** — ${use}`);
      if (not) rows.push(`  - *not for:* ${not.title}`);
      const alts = (c.related || []).filter((r) => r.when).slice(0, 2);
      for (const a of alts) rows.push(`  - *use \`${a.name}\` when* ${a.when}`);
    }
    for (const f of families) {
      rows.push(`- **\`${f.name}.md\`** — the shared contract every ${bucket} component wraps in. Read it too.`);
    }
    rows.push('');
  }
  return [
    '# Which layout, and how to author it',
    '',
    'One file per component. Open the one you picked and it tells you everything: slots,',
    'variants, budgets, common mistakes, the data shape.',
    '',
    '## How to pick',
    '',
    '1. Find your intent in the families below. Each entry says what it is **for**, what it',
    '   is **not for**, and which component to use **instead** when yours is the wrong fit.',
    `2. Open \`<name>.md\` — median ${fmtTok(median(components.map((c) => c.body.length)))} tokens.`,
    '3. Author the slide against that file, plus the rules in `../authoring/rules.md`.',
    '',
    `\`_index.md\` (${fmtTok(bytesOf(files, `${COMPONENTS}/_index.md`))} tokens) is the same catalog as a flat, greppable table —`,
    'reach for it when you want to search by tag or capacity rather than browse by intent.',
    '',
    '**The "not for" lines are the ones that save you.** Choosing between two plausible',
    'components is where an agent goes wrong, and the deciding fact is almost always the',
    'anti-pattern, not the purpose.',
    '',
    '## The families',
    '',
    ...rows,
    '---',
    '',
    '_Generated from the component manifests. Every line here is derived; nothing is restated by hand._',
    '',
  ].join('\n');
}

/**
 * The real cost of the skills row, measured.
 *
 * It was the ONE hand-typed cell in a table where every other number is computed
 * from bytes, and it was wrong: "~3k each" against a real 3.0k-5.6k. An agent
 * budgeting context off this table would have run out on the theme skill, which
 * is nearly double the quoted figure. §3b of the decision record is about
 * exactly this failure, in exactly this table.
 */
function skillsRange(files) {
  const sizes = [...files.keys()]
    .filter((k) => k.startsWith(`${SKILLS}/`) && k.endsWith('.md') && !k.endsWith('README.md'))
    .map((k) => files.get(k).length);
  if (!sizes.length) return 'n/a';
  const lo = approxTokens(Math.min(...sizes));
  const hi = approxTokens(Math.max(...sizes));
  const k = (n) => `${(n / 1000).toFixed(1)}k`;
  return `${k(lo)}–${k(hi)} each`;
}

const median = (a) => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];

/** authoring/README.md — the local bootstrap for writing a deck. */
function authoringReadme(files, layoutCount) {
  return [
    '# Writing a deck',
    '',
    'Read these in order. The first one matters most.',
    '',
    `1. **[\`deck-canon.md\`](./deck-canon.md)** (${fmtTok(bytesOf(files, `${AUTHORING}/deck-canon.md`))} tokens) — what a good deck IS.`,
    '   How a boardroom deck argues: one idea per slide, a narrative arc, rhythm, restraint,',
    '   stereotyped bookends. Ends with the traps a reviewer flags, each with its fix. This is',
    '   what the Lattice Studio sends its own model on every turn. **If you read one file',
    '   before writing slides, read this one.**',
    `2. **[\`rules.md\`](./rules.md)** (${fmtTok(bytesOf(files, `${AUTHORING}/rules.md`))} tokens) — the mechanics that apply to every slide:`,
    '   how classes compose, how card layouts nest, what a title slide is.',
    `3. **[\`../${COMPONENTS}/\`](../${COMPONENTS}/)** — pick the layout, then author it from its own file.`,
    `4. **[\`../${REVIEW}/\`](../${REVIEW}/)** — run the checker before you hand it over.`,
    '',
    `**[\`modifiers.md\`](./modifiers.md)** (${fmtTok(bytesOf(files, `${AUTHORING}/modifiers.md`))} tokens) when you need one — the`,
    'cross-cutting tokens (`dark`, `tone-*`, `insight-*`, the `tint-*` / `mark-*` decorations)',
    'that compose onto any layout. Not on the path above: you can write a good deck without',
    'reaching for one, and a component file names its own variants.',
    '',
    '## Front matter',
    '',
    'Every deck opens with it. This is the whole of what you need:',
    '',
    '```markdown',
    ...FRONT_MATTER,
    '```',
    '',
    '`theme:` picks the palette: `indaco` is the default, and `cuoio`, `onyx` and the rest of',
    'the palettes in `../skills/theme.md` work the same way. Add `color-mode: dark` for the',
    'dark version. `paginate:` turns on page numbers.',
    '',
    '## primer.md — the other way to work',
    '',
    `**[\`primer.md\`](./primer.md)** (${fmtTok(bytesOf(files, `${AUTHORING}/primer.md`))} tokens) carries all ${layoutCount} layouts with their`,
    'authoring skeletons in one document. Use it when you are drafting a whole deck in one',
    'pass and want every option in front of you.',
    '',
    `Authoring ONE slide? Do not load it — \`../${COMPONENTS}/<name>.md\` is the same content for`,
    'the layout you actually chose, at a fraction of the cost.',
    '',
  ].join('\n');
}

/** reference/README.md — the local bootstrap for tool builders. */
function referenceReadme(files) {
  const row = (f, what) =>
    `| \`${f}\` | ${what} | ${fmtTok(bytesOf(files, `${REFERENCE}/${f}`))} |`;
  return [
    '# Reference — machine records',
    '',
    'For building a tool over Lattice, not for authoring a deck. If you are writing slides,',
    `you want [\`../${AUTHORING}/\`](../${AUTHORING}/) and [\`../${COMPONENTS}/\`](../${COMPONENTS}/) instead —`,
    'everything here is either bulk or internals.',
    '',
    '| File | What it is | ~tokens |',
    '|---|---|---|',
    row('components.json', 'The full machine record for every component: slots, skeletons, variants, capacity, density, when-to-use and anti-patterns.'),
    row('grammar.json', 'Which class tokens, variants and modifiers are legal where. What a linter or validator keys off.'),
    row('forms.json', 'The Form vocabulary — how a slide is composed (cells, mastheads, stage regions), one level above components.'),
    row('concepts.json', 'The ontology joining the two levels: what a component, modifier, token and Form each are, and how they relate.'),
    row('components.md', 'The prose catalog, whole. Almost never what you want — one component file is the same content for one component.'),
    row('studio-prompts.md', "The prompts Lattice's product sends its own model when generating a theme or component."),
    '',
    '~token figures are bytes ÷ 4, a rough cross-model approximation. Your tokenizer will differ;',
    'the ratios are what matter.',
    '',
  ].join('\n');
}

/**
 * skills/README.md — GENERATED for the kit, unlike the skills beside it.
 *
 * The repo's own `design/skills/README.md` is written for someone inside the
 * repo and points at paths a kit reader does not have. The SKILLS still
 * ship verbatim and byte-pinned; only this index is rewritten for the audience,
 * and it carries the glossary that makes their HARD RULE citations legible.
 */
function skillsReadme(skills) {
  const files = skills.map((s) => s.name).filter((n) => n !== 'README.md');
  // Only the skills that actually SHIP. Scanning every file in design/skills/
  // swept in the repo's own README — which this kit replaces — and listed two
  // rules in the glossary that nothing a reader can open ever cites.
  const cited = new Set();
  for (const s of skills) {
    if (s.name === 'README.md') continue;
    for (const m of String(s.body).matchAll(/HARD RULE #(\d+)/g)) cited.add(Number(m[1]));
  }
  const claude = readFileSync(path.join(ROOT, 'CLAUDE.md'), 'utf8');
  const titles = new Map();
  for (const m of claude.matchAll(/^- \*\*#(\d+) — (.+?)\*\*/gm)) {
    titles.set(Number(m[1]), m[2].replace(/\.$/, ''));
  }
  const glossary = [...cited]
    .sort((a, b) => a - b)
    .filter((n) => titles.has(n))
    .map((n) => `| #${n} | ${mdCell(titles.get(n))} |`);

  // One line per skill, from the skill's own front matter (tools/skill-index.js), so this
  // index cannot drift from the repo's README or the Studio chat's read_guide topics.
  const LABEL = Object.fromEntries(readSkillIndex().map((r) => [`${r.name}.md`, `${mdCell(r.description)} (≈${(r.tokens / 1000).toFixed(1)}k tokens)`]));

  return [
    '# Lattice skills',
    '',
    'Each file here teaches one Lattice job end to end. Read this table first and open only',
    'the skill the task needs: each row says when to use it and roughly what it costs to read.',
    'They are self-contained on purpose: the tokens, slots, budgets and commands are inlined so',
    'you never have to chase a link mid-task. Each opens with front matter (`name`,',
    '`description`) that an agent harness can index without reading the body.',
    '',
    '## Which one',
    '',
    '| Use when… | Open |',
    '|---|---|',
    ...files.map((f) => `| ${LABEL[f] || `\`${f.replace(/\.md$/, '')}\``} | [\`${f}\`](./${f}) |`),
    '',
    '## What each one gives you',
    '',
    'Every skill follows the same nine-part shape, so once you have read one you can navigate',
    'all of them: the **10/10 bar** for that artifact · a **mental model** · **where it lives** ·',
    'a numbered **recipe** · a copy-paste **contract** · **what good and bad look like** ·',
    'a **ship checklist** · **common mistakes** · **canonical sources**.',
    '',
    'They name the falsifiable bar — the rules you can check. The last mile is taste, and every',
    'skill ends in the same place for that reason: **render it and actually look at it.**',
    '',
    '## Reading these outside the Lattice repository',
    '',
    'These files ship **verbatim** from the Lattice repo, so they cite things a kit reader does',
    'not have. That is deliberate — rewriting them would fork a second copy that drifts from the',
    'originals. Read the references as context, not instructions:',
    '',
    '- **`npm run …` commands and paths like `lib/…`, `tools/…`** assume a clone of the Lattice',
    '  repository. Skip them unless you have one.',
    '- **"HARD RULE #N"** cites the engine\'s own engineering rules. The ones these skills',
    '  actually reference:',
    '',
    '| Rule | What it says |',
    '|---|---|',
    ...glossary,
    '',
    'Nothing in the recipes depends on being able to follow those citations — they explain',
    '*why* a step exists, not *how* to do it.',
    '',
  ].join('\n');
}

// ─── EDITIONS ────────────────────────────────────────────────────────────────
//
// The kit ships the same knowledge in four SHAPES, because the surfaces it has
// to reach load files in three incompatible ways and no one tree serves them:
//
//   paste/    text for an INSTRUCTIONS BOX      — hard character caps
//   upload/   bundles for a KNOWLEDGE UPLOADER  — hard FILE-COUNT caps, folders flattened
//   repo/     drop-ins for a CODING AGENT       — progressive disclosure, always-on files
//   the library one topic per file                — the deep reference both of the above cite
//
// The caps below are not style guidance. Each is a documented platform limit,
// and two of them TRUNCATE SILENTLY, which is why `assertBudgets()` fails the
// build rather than trusting a reviewer to notice.
//
//   6,000 chars  Windsurf `global_rules.md` — silently truncated past this.
//   8,000 chars  OpenAI Custom GPT instructions AND M365 declarative agents;
//                both hard, both documented. Claude Projects is reported at the
//                same figure (unconfirmed by Anthropic, so it is not the driver).
//  12,000 chars  Windsurf per-workspace rule file — the ceiling for the SOLO
//                text, which also has to fit a local model's context (see below).
//
// WHY `solo` IS SIZED IN TOKENS AND THE OTHERS IN CHARACTERS. The paste texts are
// bounded by a form field; solo is bounded by a CONTEXT WINDOW. Ollama defaults to
// 4,096 tokens below 24 GiB of VRAM (llama.cpp and LM Studio default to 4,096 too),
// and overflow is dropped with NO ERROR — so a solo text plus the deck the model
// has to write must fit inside that. ~2,500 tokens leaves room for the deck.
// A bigger solo file does not degrade on a laptop; it silently loses its own top,
// which is the half a model follows best.
const PASTE_STANDARD_MAX = 6000;
const PASTE_MAX_MAX = 8000;
const PASTE_SOLO_MAX = 10000;

const PASTE = 'paste';
const UPLOAD = 'upload';
const START = 'start';
const REPO = 'repo';
const RENDER = 'render';
const EXAMPLES = 'examples';

/**
 * The 19 layouts the small/solo path exposes, and the ONLY place a shortlist is
 * hardcoded. Measured over `exemplars/` — 46 realistic decks, 553 component
 * slides — these cover **91% of slides**. They do NOT cover whole decks: only
 * 26% of them (12 of 46) are authorable from a top-20 list alone (19 since `list-criteria` folded into `list` on 2026-09-25 — the same slides, now covered by `list`), because nearly every deck
 * reaches for one specialist. That is why `content`/`list` are named as an
 * explicit FALLBACK in every solo text; the fallback is what takes deck coverage
 * to 100%, and it is the single most load-bearing line in the file.
 *
 * `examples/` was NOT used to derive this: HARD RULE #9 makes it one deck per
 * component by construction, so it over-weights niche layouts. `divider` is here
 * against the data (0 uses in `exemplars/`) because a deck needs a section break
 * and it is structurally trivial.
 */
const SOLO_LAYOUTS = [
  'title', 'closing', 'divider', 'content', 'list', 'cards-grid', 'stats', 'kpi',
  'big-number', 'quote', 'list-steps', 'list-tabular',
  'timeline-list', 'checklist', 'table', 'decision', 'matrix-2x2',
  'split-panel', 'agenda',
];

/** One line each, in the AUTHOR'S words — "use X when the slide is Y". */
const SOLO_INTENT = {
  title: 'the first slide',
  closing: 'the last slide',
  divider: 'a section break',
  content: 'a claim plus a short paragraph',
  list: '3-5 short bullets (`takeaway numbered` for numbered requirements, each with a reason)',
  'cards-grid': '2-4 named items with one line each',
  stats: '2-4 numbers side by side',
  kpi: '3 metrics with targets and status',
  'big-number': 'one number that is the whole point',
  quote: "someone's words",
  'list-steps': 'numbered steps in order',
  'list-tabular': 'a name plus a value, per row',
  'timeline-list': 'dated milestones in order',
  checklist: 'done / partly done / not started',
  'table': '2-3 options scored on the same criteria',
  decision: 'the option chosen and the ones rejected',
  'matrix-2x2': 'items sorted into four quadrants',
  'split-panel': 'one claim plus the points that back it',
  agenda: 'what the deck covers',
};

/** Parse the kit's own components.json — the same file the checker reads. */
function catalogOf(files) {
  const raw = files.get(`${REFERENCE}/components.json`);
  if (!raw) throw new Error('build-agent-kit: components.json must be set before the editions are built.');
  const parsed = JSON.parse(raw.toString('utf8'));
  const list = parsed.components || parsed;
  const by = new Map();
  for (const c of list) by.set(c.name, c);
  return by;
}

/**
 * A component's canonical skeleton, straight from the catalog.
 *
 * NEVER hand-copy one of these into a generated file: the skeleton is written by
 * the component's manifest and a transcribed copy is a second source of truth
 * that drifts silently (HARD RULE #1). If a skeleton is missing the build fails
 * rather than shipping a layout with no shape to copy.
 */
function skeletonFor(cat, name) {
  const m = cat.get(name);
  if (!m?.skeleton) throw new Error(`build-agent-kit: no skeleton for '${name}' — the solo shortlist is out of sync with the catalog.`);
  return String(m.skeleton).trimEnd();
}

/**
 * The four front-matter lines every deck opens with. One shape, no choices.
 *
 * LATTICE'S OWN FRONT MATTER. No `marp: true`: Lattice renders the deck itself, and the
 * key is read only by Marp. `indaco` is the engine's default palette.
 *
 * This said `marp: true` + `theme: cuoio` from 2026-09-05 to 2026-11-17, because the
 * kit's only no-install render route was the Marp kit, which registers three palettes.
 * That made every agent that read the kit write Lattice as Marp. The render route is
 * now `npx @laticent/lattice`, which knows every palette, and Marp is one export page
 * (`render/lattice-export-to-marp.md`). See engineering/decisions/2026-11-17-agent-pack.md.
 */
const FRONT_MATTER = ['---', 'theme: indaco', 'paginate: true', '---'];

/**
 * The rules that make a deck STRUCTURALLY wrong rather than merely plain. Every
 * paste text carries all of them, then spends its remaining budget on the two
 * TASTE rules that change what gets GENERATED rather than what can be fixed after.
 *
 * BE PRECISE ABOUT PROVENANCE — an earlier draft of this comment claimed all nine
 * are rated `error` by the linter, which was checkable and wrong. Four map to
 * `error` rules in `lib/authoring/lint-core.js` (`card-style-inline-title`,
 * `ledger-inline-title` / `split-bodyless-item`, `statement-ol-bold`,
 * `unterminated-comment`). One maps to a `warning` (`unknown-class`). The other
 * four — separator spacing, the three-space nested indent under `1.`, bookend slot
 * ORDER, and never writing a hex code — are load-bearing at RENDER time and the
 * linter has no rule for any of them. That is exactly why prose has to carry them:
 * they are the ones `check.mjs` will NOT catch for you.
 *
 * The reverse holds too: lint-core has `error` rules this list omits (the `qr-*`
 * and `gantt-*` families), for layouts the solo path does not expose. So this is
 * not "the nine error rules" and must not be described as one.
 *
 * What IS a fact about the code: all 18 entries of the reviewer's RUBRIC are
 * `suggestion`, so the taste half is separable and deferrable to the checker.
 */
/** The shared chart status words (lib/core/chart-status.js): the only pills a timeline row colors. */
function chartStatus() {
  return require(path.join(ROOT, 'lib', 'core', 'chart-status.js')).CHART_STATUS;
}
function PROFILE_NAMES() {
  return require(path.join(ROOT, 'lib', 'authoring', 'deck-profiles.js')).PROFILE_NAMES;
}
/**
 * lint-core's ledger/split and statement layouts as code lists, limited to `only` when given:
 * the solo text names just its 19, the full-catalog texts name every one.
 */
function listShapes(only) {
  const ls = require(path.join(ROOT, 'lib', 'core', 'list-shapes.js'));
  const solo = { has: (n) => !only || only.includes(n) };
  const fmt = (names) => names.map((n) => `\`${n}\``).join(', ');
  const ledger = [...ls.LEDGER_OL_LAYOUTS, ...ls.SPLIT_SLOT_LAYOUTS].filter((n) => solo.has(n));
  // A rule about a layout the reader cannot use is noise: it drops while no statement layout is solo.
  return { ledger: fmt(ledger), statement: fmt(ls.STATEMENT_OL_LAYOUTS.filter((n) => solo.has(n))) };
}
const essentials = (only) => [
  'Every slide starts with `<!-- _class: NAME -->` and NAME is a real layout.',
  'Slides are separated by a line containing only `---`, with a blank line each side.',
  'Card layouts nest: `- Title` on one line, then `  - body` indented two spaces. Never `- **Title.** body`.',
  'Under a numbered `1.` row, indent the nested line **three** spaces, not two.',
  // Name the layouts: "a ledger row" and "a statement layout" meant nothing to a small model
  // (the stand-in eval, 2026-11-19). The sets are lint-core's own, from lib/core/list-shapes.js.
  `A row on ${listShapes(only).ledger} always has a body under its title — never a bare title.`,
  listShapes(only).statement && `On ${listShapes(only).statement}, \`1.\` rows carry no \`**bold**\` lead-in.`,
  'Every `<!-- -->` comment is closed.',
  'The title slide is `# H1`, then a backtick `eyebrow` line, then a plain subtitle — in that order.',
  'Colors and emphasis come from the layouts and modifiers. Never write a hex code.',
].filter(Boolean);
const ESSENTIALS = essentials();

/** The two taste rules worth prompt budget: both change the SHAPE of the draft. */
const TASTE_KEPT = [
  'Write every `##` heading as a full sentence that states the point — "Revenue grew 18%, led by APAC", never "Q2 Results".',
  'End with a `closing` slide that names ONE thing you want the room to do.',
];

/**
 * paste/lattice-instructions-solo.md — self-contained. No uploads, no fetches.
 *
 * This is the one a LOCAL model gets, and the one you paste into a chat that has
 * no knowledge-file feature at all. It carries 19 layouts with their real
 * skeletons, the nine essentials, two taste rules, and a worked deck — and it
 * deliberately carries NO "not for" lines, no modifier catalog and no per-layout
 * budgets.
 *
 * WHY THE "NOT FOR" LINES ARE CUT, when `library/lattice-picker.md` says they are
 * what saves you. They are, for a frontier model choosing between two plausible
 * layouts. This text is sized for a model that measurably loses accuracy on
 * negated constraints (23-32% in the published multi-constraint work), and naming
 * `stats` inside "do not use `stats` here" puts `stats` in the activated set. The
 * intent table replaces them with a positive-only mapping. That is a real trade,
 * not a free win, and it is the place this file is most likely to be wrong.
 */
function instructionsSolo(cat) {
  const rows = SOLO_LAYOUTS.map((n) => `| \`${n}\` | ${SOLO_INTENT[n]} |`);
  const skeletons = SOLO_LAYOUTS.flatMap((n) => [
    `### ${n}`,
    '',
    ...fenced(skeletonFor(cat, n)),
    '',
  ]);
  return [
    '# How to write a Lattice deck',
    '',
    'You write slide decks as one Markdown file. Copy the shapes below exactly.',
    '',
    '## The file',
    '',
    'Start every file with these lines, then the slides:',
    '',
    ...fenced(FRONT_MATTER.join('\n')),
    '',
    'Separate every slide with a line containing only `---`.',
    'Start every slide with one `<!-- _class: NAME -->` line.',
    `Pick every NAME from the ${SOLO_LAYOUTS.length} below. Use only those names.`,
    '',
    '## Shape of a deck',
    '',
    'Slide 1 is `title`. The last slide is `closing`. Between them, 5 to 15 slides.',
    'Give each slide one idea. Keep each slide under 70 words and 6 bullets.',
    '',
    `## The ${SOLO_LAYOUTS.length} layouts`,
    '',
    'Pick by what the slide does. Copy the shape under the name you picked.',
    '',
    '| Use | When the slide is |',
    '|---|---|',
    ...rows,
    '',
    '**If nothing above fits, use `content` for prose or `list` for bullets.**',
    'Never invent a layout name.',
    '',
    ...skeletons,
    // A WORKED DECK, not another isolated slide. Two files advertised solo as
    // carrying one and it did not: 20 single-slide skeletons and no example of
    // two slides in sequence, so the `---` separator that rule 2 is entirely
    // about was never once demonstrated in context. That is the same defect the
    // kit's own examples/ docblock names as the reason examples/ exists.
    '## A whole deck, start to finish',
    '',
    'Four slides. Note the blank lines around each `---`.',
    '',
    ...fenced(
      [
        ...FRONT_MATTER,
        '',
        '<!-- _class: title silent -->',
        '',
        '# Move billing to the new platform in March',
        '',
        '`Finance Systems · Board review`',
        '',
        'One migration window replaces four years of manual reconciliation.',
        '',
        '---',
        '',
        '<!-- _class: big-number -->',
        '',
        '`Cost of the status quo`',
        '',
        '- $4.1M',
        '  - spent every year reconciling invoices by hand, up from $2.6M in 2023.',
        '',
        '---',
        '',
        '<!-- _class: cards-grid -->',
        '',
        '## Three failures repeat every quarter.',
        '',
        '- Late close',
        '  - Books close nine days after month end, against a four-day target.',
        '- Manual matching',
        '  - Sixty percent of invoices need a person to match them.',
        '- No audit trail',
        '  - Adjustments are recorded in spreadsheets outside the ledger.',
        '',
        '---',
        '',
        '<!-- _class: closing silent -->',
        '',
        '## Approve the March window and the $1.4M migration budget.',
        '',
        '`The ask`',
      ].join('\n'),
      'markdown',
    ),
    '',
    // The `title` and `closing` skeletons come from the manifest and strip the
    // running frame with three Marpit directives; the canon and every worked
    // example in this kit use the `silent` modifier, which does the same job in
    // CSS with one token. Both are correct and both ship, so SAY they are the
    // same thing — two shapes for one outcome is exactly the ambiguity this file
    // exists to remove.
    // MEASURED, not anticipated: one deck in twenty came back with the skeleton's
    // own placeholder prose in it — "One-line subtitle that frames the deck.",
    // "Section 01", "Section name" — because a small model can read a shape to
    // copy as text to emit. The skeletons cannot drop their placeholders (they
    // are what makes the shape legible), so the file has to say this outright.
    '**The skeletons are shapes to fill, not text to copy.** Replace every placeholder',
    'with real content. Never ship the example words.',
    '',
    'On the `title` and `closing` slides, `<!-- _class: title silent -->` is a shorter way',
    'to write the `_header` / `_footer` lines and `no-pagination`. Either form works; pick one',
    'and keep it.',
    '',
    '## The rules',
    '',
    ...essentials(SOLO_LAYOUTS).map((r, i) => `${i + 1}. ${r}`),
    ...TASTE_KEPT.map((r, i) => `${essentials(SOLO_LAYOUTS).length + i + 1}. ${r}`),
    '',
    '## Check before you finish',
    '',
    '- Slide 1 uses `title`; the last slide uses `closing`.',
    '- Every slide starts with `<!-- _class: NAME -->` and NAME is one of the list.',
    '- Every card title has its body on the next line, indented.',
    '- Every `##` heading is a sentence that states a point.',
    '',
  ].join('\n');
}

/**
 * paste/lattice-instructions-standard.md — <= 6,000 characters.
 *
 * The universal one: it fits EVERY instruction box measured, including Windsurf's
 * 6,000-char global rules file, which truncates past it without telling anyone.
 * Unlike solo it assumes the `upload/` bundles are loaded beside it, so it spends
 * its budget on judgment and defers every catalog fact to those files.
 */
function instructionsStandard() {
  return [
    'You author Lattice decks: boardroom-quality slides written as one Markdown file.',
    '',
    'FILE SHAPE — every deck opens with exactly this, then the slides:',
    ...fenced(FRONT_MATTER.join('\n')),
    'Slides are separated by a line containing only `---`.',
    'Every slide opens with `<!-- _class: NAME -->` where NAME is one layout.',
    'A three-slide deck, whole, so the shape is unambiguous:',
    ...fenced(
      [
        ...FRONT_MATTER,
        '',
        '<!-- _class: title silent -->',
        '',
        '# Move billing to the new platform in March',
        '',
        '`Finance Systems · Board review`',
        '',
        'One migration window replaces four years of manual reconciliation.',
        '',
        '---',
        '',
        '<!-- _class: content -->',
        '',
        '## Manual reconciliation costs us $4.1M a year.',
        '',
        'Sixty percent of invoices need a human to match them, and the books close',
        'nine days after month end against a four-day target.',
        '',
        '---',
        '',
        '<!-- _class: closing silent -->',
        '',
        '## Approve the March window and the $1.4M migration budget.',
        '',
        '`The ask`',
      ].join('\n'),
      'markdown',
    ),
    '',
    'PICKING A LAYOUT',
    'Match the slide\'s intent to a layout in the layout picker you have been given,',
    'then COUNT your content against that layout\'s capacity. Over the hard number,',
    'split the slide or escalate to the named alternative. Pick from the catalog,',
    'never from memory. If nothing fits, use `content` for prose or `list` for bullets.',
    '',
    'MECHANICS THAT BREAK THE DECK IF YOU GET THEM WRONG',
    ...ESSENTIALS.map((r) => `- ${r}`),
    '',
    'WHAT MAKES THE DECK WORTH SHOWING',
    '- ONE idea per slide.',
    ...TASTE_KEPT.map((r) => `- ${r}`),
    '- Arc: a title that states the stakes, sections that build the argument, a close that asks.',
    '- Rhythm: never three prose slides in a row. Interleave evidence, a human beat, a decision.',
    '- Restraint: ~70 words of body and <= 6 bullets per slide. When it overflows, SPLIT the',
    '  slide — never shrink the font.',
    '- Bookends are stereotyped: title and closing both carry `silent`. The closing is ONE',
    '  sentence plus a signature, never a bulleted next-steps list.',
    '',
    'FINISHING',
    'Hand back the complete `.md` file, and say how to render it.',
    'If the reader has the Lattice kit on disk, `node review/check.mjs their-deck.md` finds',
    'what is wrong for free. If they do not, say so rather than inventing a command.',
    '',
  ].join('\n');
}

/**
 * paste/lattice-instructions-max.md — <= 8,000 characters.
 *
 * For the two platforms whose documented cap IS 8,000 — OpenAI Custom GPTs and
 * Microsoft 365 declarative agents. It is `standard` plus the material that most
 * changes output quality when there is room: the trap list the deck reviewer
 * actually flags, and the front-matter register.
 *
 * It exists as a SEPARATE FILE rather than as advice to "add more if you have
 * room" because on M365 the instruction box is the only trusted channel —
 * knowledge-file content passes through cross-prompt-injection classifiers that
 * may block, truncate or sanitize directive language, so "read the instructions
 * in file X" is unreliable there by design.
 */
function instructionsMax(traps) {
  return [
    instructionsStandard().trimEnd(),
    '',
    'TRAPS THE REVIEWER FLAGS — avoid these up front, it is cheaper than being told',
    ...traps.map((t) => `- ${t}`),
    '',
    'FRONT MATTER YOU MAY SET',
    '- `theme:` the palette. `indaco` is the default; `cuoio` and `onyx` are two others.',
    '- `color-mode: dark` for the dark version of the palette.',
    '- `paginate: true` numbers the slides.',
    '- `size:` defaults to `hd` (1280x720). Leave it alone unless asked.',
    '',
  ].join('\n');
}

/**
 * The reviewer's trap list, read from the canon rather than retyped.
 *
 * The canon embeds them as `  - trap -> fix` lines inside a fenced block; this
 * lifts them so the max text can carry them as its own bullets. Returns [] if the
 * shape ever changes, and the caller degrades to the shorter text rather than
 * shipping an empty section.
 */
function reviewerTraps() {
  const { DECK_CANON } = require(path.join(ROOT, 'lib', 'authoring', 'deck-canon.js'));
  return String(DECK_CANON)
    .split('\n')
    .filter((l) => /^\s+-\s.+→|^\s+-\s.+->/.test(l))
    .map((l) => l.replace(/^\s+-\s/, '').trim())
    .filter(Boolean);
}

/**
 * The checker reads `../reference/components.json` beside itself; fetched alone it runs a PARTIAL
 * check and says so. Found by downloading it from the docs preview the way an agent would.
 */
const CHECKER_FETCH = [
  'mkdir -p lattice/review lattice/reference',
  'curl -fsSL https://lattice.style/agents/review/check.mjs -o lattice/review/check.mjs',
  'curl -fsSL https://lattice.style/agents/reference/components.json -o lattice/reference/components.json',
  'node lattice/review/check.mjs deck.md',
].join('\n');

/**
 * render/lattice-render-a-deck.md — how to see the deck. Lattice renders it.
 *
 * Until 2026-11-17 this page led with the Marp kit, because `@laticent/lattice` was not
 * on npm and marp-cli was the only renderer that needed no clone. That made the kit
 * describe a Lattice deck as "a Marp deck first", and every agent that read it wrote
 * `marp: true`. The owner's call (engineering/decisions/2026-11-17-agent-pack.md §3):
 * write the kit as if the package is published. So `npx @laticent/lattice` leads, the
 * Studio covers a destination that cannot run a command, and Marp is one export page.
 *
 * The page carries no relative links: it is embedded verbatim in an upload bundle and
 * in the skill's references, where a relative link would not resolve.
 */
function renderDoc() {
  return [
    '# Turn your deck into a PDF',
    '',
    'You have a `.md` file. Lattice renders it.',
    '',
    '## With one command',
    '',
    ...fenced('npx @laticent/lattice your-deck.md your-deck.pdf', 'sh'),
    '',
    'The extension picks the format:',
    '',
    '| Output | You get |',
    '|---|---|',
    '| `deck.pdf` | A vector PDF with selectable text |',
    '| `deck.pptx` | PowerPoint; add `--editable` for real text boxes |',
    '| `deck.png` | One PNG per slide: `deck.001.png`, `deck.002.png`, … |',
    '| `deck.html` | The rendered deck; add `--player` for a self-contained player |',
    '',
    'A third argument overrides the palette for one render:',
    '`npx @laticent/lattice your-deck.md your-deck.pdf cuoio`. Add `--print` for a',
    'black-and-white-safe copy. `npx @laticent/lattice --help` lists the rest.',
    '',
    'It needs Node 22.13 or newer and a Chrome or Chromium on the machine. If it cannot find',
    'one, set `CHROME_PATH=/path/to/chrome`.',
    '',
    '## Check the deck first',
    '',
    ...fenced('node review/check.mjs your-deck.md   # from the kit root', 'sh'),
    '',
    'No kit on disk? Fetch the checker and the catalog it reads, side by side as in the kit:',
    '',
    ...fenced(CHECKER_FETCH, 'sh'),
    '',
    'It is code, not a model: no tokens, offline, about a tenth of a second, and it cannot',
    'be talked into approving a deck the way a model reviewing its own draft can. It catches',
    'the wrong Markdown shape for a layout, a layout name that does not exist, and the',
    'structural traps the reviewer flags.',
    '',
    '## Without a command line',
    '',
    'Open the deck in the Lattice Studio at <https://lattice.style/studio> and export from',
    'there. Use this when you are writing in a chat product (a Claude Project, a GPT, a',
    'Gem) that hands back a file rather than running a command.',
    '',
    '## If the render looks wrong',
    '',
    '| What you see | What to fix |',
    '|---|---|',
    '| The render stops with `unknown palette` | `theme:` names a palette that does not exist. The message lists the real ones |',
    '| A layout comes out as a plain list | The slide is not in that layout\'s Markdown shape. Copy the skeleton from its file in `components/` again; `check.mjs` names the slide |',
    '| `⚠ OVERFLOW` in the output | A slide holds more than fits. Split it, or cut words; the layout\'s file gives its capacity |',
    '',
    '## Handing the deck to someone who uses Marp',
    '',
    'Export a Marp bundle (Studio: **Share → Marp bundle**). The kit\'s',
    '`render/lattice-export-to-marp.md` explains what the bundle carries and how to do it',
    'by hand.',
    '',
  ].join('\n');
}

/**
 * render/lattice-export-to-marp.md — the ONE page in the kit that describes marp-cli.
 *
 * Moved here verbatim from the old render page on 2026-11-17. Gate 3 of the pack
 * (2026-11-17-agent-pack.md §4.4) allows Marp framing in this file and nowhere else.
 *
 * ROUTE 1 IS THE ONE THAT WORKS WITH NOTHING INSTALLED, and it is verified: the
 * Marp kit that ships beside this one on the same branch renders its own 13-slide
 * sample to a 13-page PDF through real `marp-cli`, with the palette and the
 * embedded fonts live. That is why it leads.
 *
 * ROUTE 2 EXISTS BECAUSE ROUTE 1 ASKS FOR A MOVE THE CALLER OFTEN CANNOT MAKE.
 * "Copy the folder, put your deck inside it" is fine for a person starting a deck
 * and impossible for an agent handed a path inside a repository it does not own.
 * Without a second route, the honest answer to "render the deck where it is" was
 * absent from the kit, and the failure it left behind is silent: every wrong way
 * to pass the assets renders a deck that looks deliberate and is not Lattice.
 *
 * THE THREE ASSET RULES IN THAT SECTION ARE MEASURED, not reasoned. Rendered
 * through real marp-cli 4.5.1 driving real headless Chrome, `examples/
 * lattice-example-starter.md`, 10 slides, at each combination:
 *
 *   - `--theme-set <url>` → a 10-page PDF in DEFAULT MARP STYLING. No error on
 *     the stylesheet; marp-cli resolves themeSet entries as paths only. This is
 *     the worst of the three because the output is a plausible-looking deck.
 *   - `fonts/` absent from the OUTPUT's directory → palette and layout correct,
 *     type silently fell back to a system serif. marp-cli INLINES theme CSS into
 *     a `<style>` block, so `url(fonts/…)` resolves against the output document,
 *     never against the stylesheet it was written in.
 *   - runtime `<script src>` local, and the same three from jsDelivr → BOTH
 *     composed the `kpi` layout identically. The CDN route is real, and it is
 *     the one thing here that may be a URL.
 *
 * WHY raw.githubusercontent IS A DOWNLOAD URL AND NEVER A `<script src>`: it
 * serves `content-type: text/plain` with `x-content-type-options: nosniff`, so
 * Chrome refuses to execute it. jsDelivr serves the same bytes off the same
 * branch as `application/javascript`. Both were checked against the live hosts;
 * the distinction is invisible until a slide comes up as a plain list.
 */
function exportToMarpDoc() {
  const raw = `${KIT_RAW_BASE}/marp`;
  const cdn = `${KIT_CDN_BASE}/marp`;
  return [
    '# Export a Lattice deck to Marp',
    '',
    'Lattice renders its own decks: `render/lattice-render-a-deck.md` is the page for that,',
    'and it needs none of what follows. This page is for one case only: someone needs to',
    'open your deck in marp-cli or the Marp for VS Code extension.',
    '',
    '## The easy way: an export bundle',
    '',
    'In the Studio at <https://lattice.style/studio>, use **Share → Marp bundle**. From a',
    'clone of the repository, `npm run export:marp -- your-deck.md your-deck.zip`. Either',
    'way you get a folder Marp can render with nothing else: the deck with its slide breaks',
    'written out, the stylesheet, the palette, the fonts, the runtime scripts and a config.',
    'Everything below is what the bundle does for you, for when you cannot use it.',
    '',
    '## How Marp and Lattice divide the work',
    '',
    'Read this once and the rest of the page explains itself.',
    '',
    '**Marp** splits the Markdown into slides and drives a headless Chrome to print them.',
    'It does not know what `kpi` or `quadrant` means — to Marp a `<!-- _class: kpi -->`',
    'comment is just a class name to put on a `<section>`.',
    '',
    '**Lattice** is what gives that class name a meaning, in two parts:',
    '',
    '- **`lattice.css`** lays the slide out, and a palette like **`cuoio.css`** colors it.',
    '  Most layouts are pure CSS and need nothing else.',
    '- **the runtime `<script>`s** build the layouts that cannot be done in CSS — charts,',
    '  diagrams, and the ones that rearrange their own content, like `kpi`. These run in',
    '  the browser, during the render.',
    '',
    'So for Marp to render a Lattice deck it needs the deck, plus a stylesheet it has to be handed, plus the',
    `${numberWord(RUNTIME_SCRIPT_NAMES.length)} scripts the deck carries itself. **Miss any of them and the deck still renders** — as`,
    'plain Marp, or with the palette but no type, or with a layout flattened to a list.',
    'None of those prints an error. That is the whole difficulty of this page.',
    '',
    '## What your deck must carry',
    '',
    'Marp needs six things a Lattice deck does not carry on its own:',
    '',
    '| In the deck | Why |',
    '|---|---|',
    '| `marp: true` in the front matter | Without it marp-cli treats the file as plain Markdown |',
    '| `theme: cuoio` — a palette your renderer registered | An unregistered name falls back to plain Marp, silently |',
    '| `---` alone on a line between slides | This is the slide separator; front matter ends with one too |',
    '| `<!-- _class: NAME -->` at the top of each slide | Picks the layout. One per slide |',
    `| the ${numberWord(RUNTIME_SCRIPT_NAMES.length)} runtime \`<script>\` tags, at the **bottom** | Marp emits raw HTML in document order — at the top they land inside slide 1 and print as text |`,
    '| `class: dark` for dark mode, **not** `color-mode:` | `class:` is Marp\'s own key. Lattice\'s richer registers are read by the full export pipeline, not by Marp |',
    '',
    'And one thing on the renderer\'s side: **`html: true`**. marp-core escapes raw HTML by',
    'default, which turns the deck\'s `<script>` tags into visible text and leaves every',
    'chart and diagram unbuilt. Pass `--html` on the CLI, or set it in a config file.',
    'In an Export-to-Marp bundle folder, render with its own `npm run pdf` instead: its',
    '`marp.config.cjs` passes a list of HTML tags plus the runtime, and `--html` would',
    'replace that list with everything.',
    '',
    `The ${numberWord(RUNTIME_SCRIPT_NAMES.length)} tags, in this order — the runtime reads the dagre global synchronously`,
    'on its first draw, so it has to come last:',
    '',
    ...fenced(RUNTIME_TAGS.join('\n'), 'html'),
    '',

    '## Route 1: the Marp kit (nothing to install)',
    '',
    'The `marp/` folder published beside this kit is a copy-and-go bundle — the engine',
    'CSS, the palettes, the fonts and a config. Copy the folder, put your deck inside it',
    'next to `Sample-Deck.md`, then:',
    '',
    ...fenced(
      `npx @marp-team/marp-cli@${MARP_SUPPORT.cli.major} your-deck.md \\\n  --config-file marp.config.cjs --allow-local-files -o your-deck.pdf`,
      'sh',
    ),
    '',
    '**Put the deck inside the folder, not the folder beside the deck.** The config',
    'registers the stylesheets by path relative to itself; a deck outside the folder',
    'renders unstyled **with no error**, which is the single most common way this goes',
    'wrong.',
    '',
    'marp-cli renders the PDF through a Chrome or Chromium you already have. If it cannot',
    'find one, point it at yours with `CHROME_PATH=/path/to/chrome`.',
    '',
    '## Route 2: render the deck where it already is',
    '',
    'Route 1 asks you to move the deck. When you cannot — the deck lives in a repository,',
    'or you are an agent handed a path — hand marp-cli the stylesheets directly with',
    '`--theme-set` and leave the deck alone.',
    '',
    'First fetch the assets once. One command gets all of them, the typefaces included —',
    'which matters, because there are dozens of font files and no practical way to name',
    'them one at a time:',
    '',
    ...fenced(
      [
        `curl -fsSL ${KIT_TARBALL} \\`,
        '  | tar -xz --strip-components=1 lattice-dist-kits/marp',
      ].join('\n'),
      'sh',
    ),
    '',
    'That leaves a `marp/` directory holding the stylesheets, the palettes, `fonts/` and the',
    `${numberWord(RUNTIME_SCRIPT_NAMES.length)} runtime scripts. Now point marp-cli at it and leave the deck where it is:`,
    '',
    ...fenced(
      [
        '# Both of these resolve against the OUTPUT file, so they go beside it —',
        '# the typefaces, and the runtime scripts the deck names at its bottom.',
        'cp -r marp/fonts path/to/',
        `cp ${RUNTIME_SCRIPT_NAMES.map((f) => `marp/${f}`).join(' \\\n   ')} \\\n   path/to/`,
        '',
        `npx @marp-team/marp-cli@${MARP_SUPPORT.cli.major} path/to/your-deck.md \\`,
        '  --html --allow-local-files --pdf -o path/to/your-deck.pdf \\',
        '  --theme-set marp/lattice-min.css marp/cuoio-min.css',
      ].join('\n'),
      'sh',
    ),
    '',
    '### Three rules about where those files may live',
    '',
    'Each was checked by rendering the same 10-slide deck both ways and looking at the',
    'result. Each wrong answer produces a deck, not an error.',
    '',
    '| Asset | May it be a URL? | Where it must be |',
    '|---|---|---|',
    '| The stylesheets (`--theme-set`) | **No** | A local path. marp-cli resolves themeSet entries as paths only; a URL renders the deck in **default Marp styling** and says nothing |',
    '| `fonts/` | No | Beside the **output** file, not beside the stylesheet. marp-cli inlines theme CSS into the page, so `url(fonts/…)` resolves against the output document. Get this wrong and the palette and layout are right while the type falls back to a system serif |',
    `| The ${numberWord(RUNTIME_SCRIPT_NAMES.length)} runtime \`<script src>\` | **Yes** | Beside the **output** file, like the fonts and for the same reason, or a CDN URL. Both were verified rendering the same layout identically |`,
    '',
    '### Skipping the download for the scripts',
    '',
    'The scripts are the one asset that may be a URL, so a deck can carry them directly and',
    'you download nothing but the two stylesheets:',
    '',
    ...fenced(RUNTIME_SCRIPT_NAMES.map((f) => `<script src="${cdn}/${f}"></script>`).join('\n'), 'html'),
    '',
    'Two costs to know before you take that trade. The render now needs network access, so',
    'it fails where the kit route would not; and **`@dist-kits` is a moving branch**, which',
    'is what you want for fixes and not what you want for a deck that must render the same',
    'way next year. Pin a tag instead of the branch when that matters.',
    '',
    'There is a second URL for these files, and it is **not** interchangeable. To grab one',
    'file on its own — a different palette, say — fetch it from the repository directly:',
    '',
    ...fenced(`curl -fsSLO ${raw}/cuoio-dark-min.css`, 'sh'),
    '',
    '**That host is for downloading and never for a `<script src>`.** It serves JavaScript',
    'as `text/plain` with `nosniff`, so the browser refuses to run it, the layout comes up',
    'flat, and nothing anywhere says why. Use the CDN above in a tag; use this one in a',
    '`curl`.',
    '',
    '## If the slides come out wrong',
    '',
    'Every failure on this page is silent, so work back from what you see:',
    '',
    '| What you see | What is missing |',
    '|---|---|',
    '| Plain Marp slides — no palette, no layout | The stylesheets never registered. Check they are local paths, not URLs |',
    '| Right colors and layout, wrong typeface | `fonts/` is not beside the **output** file |',
    '| One layout flattened to a list or a bare fence | The runtime scripts did not run: missing, in the wrong order, at the top of the file, or `--html` was not passed |',
    '| `<script src=…>` printed on slide 1 as text | `--html` was not passed, so marp-core escaped it |',
    '| A blank final page after a diagram | An old runtime. Mermaid appends a tooltip to `document.body`, past the last slide, and Chrome spills one more sheet. The shipped runtime pins it; re-fetch yours |',
    '',
  ].join('\n');
}

/** The exemplar decks shipped as worked examples, and where each comes from. */
const EXAMPLE_DECKS = [
  ['investor-pitch', 'corporate/investor-pitch.md', 'A startup raising a round — the arc from problem to ask.'],
  ['lecture', 'academic/lecture.md', 'A university lecture — teaching material, not a pitch.'],
  ['budget-proposal', 'government-public/budget-proposal.md', 'A public-sector budget request to a council.'],
  ['board-meeting', 'nonprofit/nonprofit-board-meeting.md', 'A nonprofit board pack — governance, not persuasion.'],
];

/**
 * examples/ — complete, renderable decks. The kit had NONE.
 *
 * Measured before this landed: across all 92 files the largest number of
 * `<!-- _class: -->` directives inside any single fenced block was ONE, and no
 * two slides were ever separated by a `---`. Every skeleton showed one slide in
 * isolation, so nothing in the kit showed a reader what a whole deck looks like.
 *
 * THE FOUR REAL DECKS DO NOT PASS THE CHECKER CLEAN, and that is deliberate.
 * Each carries 3-7 findings, all `suggestion` severity — an `agenda-missing`
 * here, a `verbose-eyebrow` there. Shipping only a synthetic zero-finding deck
 * would teach that a clean run is the bar; it is not, and our own decks prove it.
 * The starter deck IS clean, so there is one file to copy that has nothing to
 * argue with; the four real ones show what the checker says about work that
 * actually shipped.
 */
function exampleDecks() {
  const out = [];
  for (const [slug, rel, blurb] of EXAMPLE_DECKS) {
    const src = path.join(ROOT, 'exemplars', rel);
    if (!existsSync(src)) continue;
    // Verbatim, minus a `marp: true` key: these decks are Lattice decks, and the kit
    // teaches Lattice front matter (2026-11-17-agent-pack.md). The CLI renders every
    // palette they name and composes every layout without deck-embedded scripts.
    const body = `${readFileSync(src, 'utf8')
      .replace(/^marp:[ \t]*true[ \t]*\r?\n/m, '')
      .trimEnd()}\n`;
    out.push({
      name: `lattice-example-${slug}.md`,
      blurb,
      slides: (body.match(/^<!--\s*_class:/gm) || []).length,
      body: Buffer.from(body, 'utf8'),
    });
  }
  return out;
}

/**
 * The two `<script>` lines a Marp-rendered deck needs, and the comment that
 * explains why they are at the BOTTOM.
 *
 * Marp emits raw HTML in document order, so a script at the top of the file
 * lands inside slide 1 and shows up as text on the slide. Verified end to end:
 * without these the `kpi` layout renders as a plain ordered list — palette live,
 * layout absent, no error anywhere. With them it composes correctly.
 *
 * Safe on every route: the CLI strips deck-embedded runtime scripts before
 * export (`lattice.js`), so a deck carrying them renders identically
 * there. That is what makes them the right default rather than a Marp-only
 * footnote.
 */
// DERIVED, not re-listed. This used to be a hand-copy of `RUNTIME_SCRIPTS` in
// lib/export/marp-bundle.js, and it drifted the moment that list changed: dagre was
// split out of the runtime bundle, the marp path gained a third tag, and this copy
// silently kept emitting two — HARD RULE #1, in the small. Reading the one source
// means a fourth engine lands here for free, and a rename cannot desynchronise them.
const { RUNTIME_SCRIPTS, RUNTIME_SCRIPT_SRCS, MARP_SUPPORT } = require('../lib/export/marp-bundle.js');
const RUNTIME_TAGS = RUNTIME_SCRIPTS.trim().split('\n');

/**
 * The runtime script FILENAMES. `render/` needs the bare names twice — once to
 * `curl` them, once to build CDN URLs.
 *
 * Taken straight from the exported list rather than parsed back out of the rendered
 * tags. The tag block is now DERIVED from this same array in marp-bundle.js, so
 * re-parsing it would be reading our own rendering of a list we can simply read —
 * and the tag-shaped regex that did it was what CodeQL's bad-HTML-filtering query
 * flagged, correctly enough that widening the pattern was the wrong answer.
 */
const RUNTIME_SCRIPT_NAMES = RUNTIME_SCRIPT_SRCS;

/**
 * The two ways to reach a published kit asset, and they are NOT interchangeable.
 *
 * `raw.githubusercontent.com` serves every file as `content-type: text/plain`
 * with `x-content-type-options: nosniff`, so Chrome will download it and refuse
 * to EXECUTE it. jsDelivr mirrors the same branch with real media types
 * (`application/javascript`, `text/css`). So: raw for `curl`, jsDelivr for a
 * `<script src>`. Both checked against the live hosts; the difference shows up
 * on a slide as a layout that quietly did not compose.
 */
/**
 * Spell a small count, so the README reads as prose and still cannot go stale.
 *
 * It said "the two runtime `<script>` tags" while every generated deck in the kit
 * emitted three — the count was typed once and the list grew under it when dagre
 * was split out of the runtime bundle. Derived from RUNTIME_SCRIPT_NAMES, not
 * RUNTIME_TAGS: the tag block also carries a markdownlint comment, so its LINE
 * count is one more than the number of scripts.
 */
function numberWord(n) {
  return ['zero', 'one', 'two', 'three', 'four', 'five', 'six'][n] || String(n);
}

const KIT_RAW_BASE = 'https://raw.githubusercontent.com/Laticent/lattice/dist-kits';
/**
 * The whole published kit as one tarball. The only practical way to get `fonts/`:
 * it holds dozens of files, so a per-file `curl` loop cannot name them, and
 * without them the deck renders in a system serif with nothing said.
 */
const KIT_TARBALL = 'https://github.com/Laticent/lattice/archive/refs/heads/dist-kits.tar.gz';
const KIT_CDN_BASE = 'https://cdn.jsdelivr.net/gh/Laticent/lattice@dist-kits';

/**
 * examples/lattice-example-starter.md — the one deck to copy.
 *
 * Purpose-built to return ZERO findings from `check.mjs` and `lint:deck`, and
 * verified rendered: 10 slides to 10 PDF pages through the Marp route this kit
 * documents, with the layouts composing. It is the only file in the kit that is
 * both a worked example and a passing test of its own instructions.
 */
function starterDeck() {
  return [
    ...FRONT_MATTER,
    '',
    '<!-- _class: title silent -->',
    '',
    '# Move billing to the new platform in March',
    '',
    '`Finance Systems · Board review`',
    '',
    'One migration window replaces four years of manual reconciliation.',
    '',
    '---',
    '',
    '<!-- _class: agenda -->',
    '',
    '## What this deck covers.',
    '',
    '1. What the current system costs us',
    '2. What the migration buys',
    '3. What it costs, and when',
    '4. What we need from you',
    '',
    '---',
    '',
    '<!-- _class: big-number -->',
    '',
    '`Cost of the status quo`',
    '',
    '- $4.1M',
    '  - spent every year reconciling invoices by hand, up from $2.6M in 2023.',
    '',
    '---',
    '',
    '<!-- _class: cards-grid -->',
    '',
    '## Three failures repeat every quarter.',
    '',
    '- Late close',
    '  - Books close nine days after month end, against a four-day target.',
    '- Manual matching',
    '  - Sixty percent of invoices need a person to match them.',
    '- No audit trail',
    '  - Adjustments are recorded in spreadsheets that sit outside the ledger.',
    '',
    '---',
    '',
    '<!-- _class: kpi -->',
    '',
    '## The pilot beat every target it was set.',
    '',
    '1. 4 days',
    '   - Time to close',
    '   - from 9 days `{On plan}`',
    '2. 12%',
    '   - Invoices matched by hand',
    '   - from 60% `{On plan}`',
    '3. $0.9M',
    '   - Annual run cost',
    '   - from $4.1M `{On plan}`',
    '',
    '---',
    '',
    '<!-- _class: quote -->',
    '',
    '> We stopped arguing about whose number was right and started closing on time.',
    '',
    '— Dana Whitfield, Controller, pilot business unit',
    '',
    '---',
    '',
    '<!-- _class: table -->',
    '',
    '## March costs less and carries less risk than June.',
    '',
    '| Criterion | March window | June window |',
    '| --- | --- | --- |',
    '| Cutover risk | Quarter-end freeze, no parallel run | Overlaps the external audit |',
    '| Staffing cost | $1.4M | $1.1M |',
    '| Earliest benefit | Q2 close | Q4 close |',
    '',
    '---',
    '',
    '<!-- _class: decision -->',
    '',
    '## We recommend the March window.',
    '',
    '- Migrate in March',
    '  - The quarter-end freeze gives a clean cutover and returns the benefit two quarters sooner.',
    '- Migrate in June',
    '  - Cheaper to staff, but it overlaps the audit and doubles the cutover risk.',
    '',
    '---',
    '',
    '<!-- _class: list-steps -->',
    '',
    '## Four steps take us from freeze to retirement.',
    '',
    '1. Freeze new integrations',
    '   - Two weeks before cutover, changes stop.',
    '2. Rehearse the cutover',
    '   - A full dry run against production data.',
    '3. Cut over at quarter end',
    '   - Three days, with finance on standby.',
    '4. Retire the old ledger',
    '   - Read-only for a year, then archived.',
    '',
    '---',
    '',
    '<!-- _class: closing silent -->',
    '',
    '## Approve the March window and the $1.4M migration budget.',
    '',
    '`The ask`',
    '',
  ].join('\n');
}

/**
 * Re-point a component doc's sibling links for life inside a BUNDLE.
 *
 * `relocate()` rewrites the repo's `../../<bucket>/<name>/<name>.docs.md` links to
 * `./<name>.md`, which resolves in the flat `components/` folder. Concatenated
 * into a bundle those become 244 links to files that are not there — the kit's
 * own link test caught it, which is the whole reason that test exists.
 *
 * In-bundle targets become anchors (each component is a `##` heading here).
 * Out-of-bundle targets lose the link and keep the name as code: a reader can
 * still see which layout is being recommended, and there is no dead link
 * promising a file that a flat uploader was never given.
 */
function rewireBundleLinks(text, members) {
  return String(text).replace(/\[`([a-z0-9-]+)`\]\(\.\/(_?[a-z0-9-]+)\.md\)/g, (_whole, label, target) =>
    members.has(target) ? `[\`${label}\`](#${target})` : `\`${label}\``,
  );
}

/**
 * Demote every ATX heading by `n` levels, leaving fenced content alone.
 *
 * KEEP THE HEADING TEXT. The first cut of this rebuilt the line from the hash
 * run and the one whitespace character it matched and dropped everything after
 * it, so all ten bundles shipped with 972 blank headings — `## ` with nothing
 * on it — and every in-bundle anchor pointed at one. It cost nothing to run and
 * broke the kit's single most-used artifact, because a bundle whose 61 sections
 * are all untitled is worse to retrieve from than no bundle at all.
 *
 * The fence tracker counts ``` and ~~~ runs so a `#` inside a skeleton (every
 * component doc has several) is left as authored. It does not model a longer
 * fence closing a shorter one; nothing in the tree nests them.
 */
function demote(text, n) {
  let inFence = false;
  return String(text)
    .split('\n')
    .map((line) => {
      if (/^ {0,3}(?:`{3,}|~{3,})/.test(line)) {
        inFence = !inFence;
        return line;
      }
      if (inFence) return line;
      return line.replace(/^(#{1,6})(\s+)(.*)$/, (_all, hashes, gap, rest) =>
        `${'#'.repeat(Math.min(6, hashes.length + n))}${gap}${rest}`,
      );
    })
    .join('\n');
}

/**
 * One page per DESTINATION — the layer the kit did not have.
 *
 * The old tree cut at the top by KIND OF DOCUMENT (authoring / components /
 * skills / review / reference). That is the writer's mental model. A reader
 * arrives knowing one thing about themselves — where they are putting this — and
 * had no row to stand on.
 *
 * Each entry: `paste` names the text to put in the instructions box, `files` how
 * many knowledge files that destination accepts, and `notes` the things that
 * silently go wrong there. A number that our research could NOT confirm at the
 * vendor's own page is marked "reported" in the prose, every time. An invented
 * limit would size a file wrongly and nobody downstream could tell.
 */
const DESTINATIONS = [
  {
    slug: 'claude-project',
    title: 'a Claude Project',
    paste: 'standard',
    upload: 10,
    body: [
      'Open your project → **Set project instructions** → paste `lattice-instructions-standard.md`.',
      'Then **Add content** and upload the numbered files from `upload/`.',
      '',
      '**Upload ten, not ninety.** Claude Projects switch from holding files in context to',
      'retrieving from them as the project grows, and community reproduction puts that switch',
      'as low as ~13 files — Anthropic documents the behavior but not the trigger, so treat',
      'the number as reported, not confirmed. Either way the ten bundles are the safe shape,',
      'and Anthropic does state that well-named files help it retrieve the right one.',
    ],
  },
  {
    slug: 'custom-gpt',
    title: 'an OpenAI Custom GPT',
    paste: 'max',
    upload: 10,
    body: [
      'In the GPT editor: paste `lattice-instructions-max.md` into **Instructions**, then',
      'upload the `upload/` files under **Knowledge**.',
      '',
      '**Use the `max` text here, not `standard`.** Custom GPT instructions are capped at a',
      'reported 8,000 characters and `max` is built to sit just under it, so you get the trap',
      'list as well as the mechanics.',
      '',
      'The uploader is flat — it keeps no folders. Every file in `upload/` already has a',
      'globally unique name for exactly this reason.',
    ],
  },
  {
    slug: 'gemini-gem',
    title: 'a Gemini Gem',
    paste: 'standard',
    upload: 10,
    body: [
      'In the Gem editor, paste `lattice-instructions-standard.md` into the **Instructions**',
      'box and add the `upload/` files as **Knowledge**.',
      '',
      'Google publishes no character limit for Gem instructions, and the widely-quoted',
      '"10 knowledge files" is reported rather than documented on Google\'s own page. Ten',
      'bundles is what this kit ships, so you are inside it either way.',
      '',
      'Google\'s own guidance is to structure a Gem as Persona / Task / Context / Format.',
      'The `standard` text is already written that way.',
    ],
  },
  {
    slug: 'notebooklm',
    title: 'NotebookLM (Gemini Notebook)',
    paste: 'standard',
    upload: 10,
    body: [
      'Add the `upload/` files as **sources**, then paste `lattice-instructions-standard.md`',
      'into the notebook\'s customization box.',
      '',
      'Per-source limits are generous — 500,000 words or 200 MB — so nothing in this kit is',
      'close to them. The binding limit is the number of sources your plan allows.',
      '',
      'Notebooks answer strictly from their sources, so this is the best surface for',
      '"which layout should I use for X" and a poor one for drafting a whole deck.',
    ],
  },
  {
    slug: 'copilot',
    title: 'GitHub Copilot or Microsoft 365 Copilot',
    // Three products under one name, and they do not take the same text. The
    // headline names the one that works in all three; the notes below say where
    // `max` is the better answer. An unconditional headline said `max` and then
    // contradicted itself twice in its own body.
    paste: 'standard',
    upload: 10,
    body: [
      '**In a repository:** copy `repo/AGENTS.md` to your repo root, or paste',
      '`lattice-instructions-standard.md` into `.github/copilot-instructions.md`. Copilot adds',
      'that file to every request as soon as it is saved.',
      '',
      '**In a Copilot Space:** put the `standard` text in the instructions field and attach the',
      '`upload/` files.',
      '',
      '**In an M365 declarative agent:** paste `lattice-instructions-max.md` into the',
      'instructions — the cap there is 8,000 characters and it is hard. Do **not** move',
      'instructions into a knowledge file to get around it: Microsoft routes knowledge content',
      'through cross-prompt-injection classifiers that can block, truncate or sanitize',
      'directive language, so "read the rules in file X" is unreliable there by design.',
    ],
  },
  {
    slug: 'coding-agent',
    title: 'a coding agent (Claude Code, Cursor, Codex, Windsurf, Cline, Zed, Aider)',
    paste: 'standard',
    upload: 0,
    uploadNote: [
      'Nothing to upload — but do not paste `paste/` text by hand either. Copy a drop-in',
      'from [`repo/`](../repo/) instead: each one already carries the instructions AND the',
      'link to the catalog, which the bare paste text assumes you were given separately.',
    ],
    body: [
      'Copy the drop-in that matches your tool out of `repo/`:',
      '',
      '| Tool | Copy to |',
      '|---|---|',
      '| Claude Code | `CLAUDE.md` (or `AGENTS.md` plus a one-line `@AGENTS.md` import) |',
      '| Codex, Zed, Jules, Junie, Cline | `AGENTS.md` at the repo root |',
      '| Cursor | `.cursor/rules/lattice.mdc` — a plain `.md` there is ignored |',
      '| GitHub Copilot | `.github/copilot-instructions.md` |',
      '| Windsurf | `.windsurf/rules/lattice.md` — 12,000 chars per file, truncated silently past it |',
      '| Aider | any path, then `aider --read lattice.md` |',
      '',
      '`repo/AGENTS.md` is deliberately small. Codex budgets the whole `AGENTS.md` chain at',
      '32 KiB and stops adding files once it is spent, so a fat root file starves the nested',
      'one that actually describes your project.',
      '',
      'For Claude Code specifically, `plugin/` installs the same thing as a plugin with a',
      'skill, so the catalog loads only when a deck is actually being written.',
    ],
  },
  {
    slug: 'local-model',
    title: 'a local model (Ollama, llama.cpp, LM Studio)',
    paste: 'solo',
    upload: 0,
    body: [
      'Use `lattice-instructions-solo.md` as the system prompt. It is self-contained — 20',
      'layouts with their real skeletons, the rules that break a deck, and a worked example —',
      'and it needs no knowledge files.',
      '',
      '**Raise the context window first.** Ollama defaults to 4,096 tokens below 24 GiB of',
      'VRAM, and llama.cpp and LM Studio default to 4,096 too. Past the window, input is',
      'dropped **with no error** — the model does not know, and neither do you. It simply gets',
      'quietly worse.',
      '',
      ...fenced('ollama run <model> --think=false\n>>> /set parameter num_ctx 8192', 'sh'),
      '',
      'Or in a Modelfile: `PARAMETER num_ctx 8192`.',
      '',
      '**What this path gives up, on purpose:** 41 of the 60 layouts, every modifier, the',
      'chart family and the per-layout budgets. Those 19 layouts cover 91% of the slides in',
      'our own realistic decks, and the "if nothing fits, use `content` or `list`" line covers',
      'the rest. Expect a plainer deck than a frontier model produces — a plain valid deck',
      'beats an ambitious broken one.',
    ],
  },
  {
    slug: 'one-off-chat',
    title: 'a single chat, with no setup',
    paste: 'solo',
    upload: 0,
    body: [
      'Paste `lattice-instructions-solo.md` as your first message, then ask for the deck in',
      'your second. It is self-contained, so nothing else needs uploading.',
      '',
      'If the model can browse, you can instead point it at this kit\'s `upload/` folder and',
      'paste `lattice-instructions-standard.md` — better output, one more step.',
    ],
  },
];

/**
 * The ten upload bundles, and why bundling is mandatory rather than tidy.
 *
 * Every knowledge uploader caps FILE COUNT, not bytes: a reported 20 for a Custom
 * GPT, a reported 10 for a Gem, 5 on a free ChatGPT Project, and a Claude Project
 * that flips from in-context to retrieval somewhere around a dozen. The kit's 92
 * files clear none of those. Meanwhile nothing here is remotely near a SIZE cap —
 * 512 MB per file on a GPT, 100 MB on Gemini, and our largest file is 452 KiB.
 *
 * So the constraint is count, the tightest common denominator is ten, and this is
 * ten. The layout bundles group by BUCKET because that is the axis a reader picks
 * on; splitting evenly by byte size would put `quote` and `radar` in one file.
 *
 * Component sections stay at `##` inside a bundle on purpose: heading-structured
 * splitting is what makes a Markdown bundle retrieve well, and `##` is the
 * boundary a chunker keys on. Each section is self-contained — nothing in one
 * depends on having read the one above it.
 */
const BUNDLE_LAYOUTS = [
  ['3-layouts-anchor-and-statement', ['anchor', 'statement'], 'Opening, closing, section breaks, and the one-claim slides.'],
  ['4-layouts-lists-and-inventories', ['inventory'], 'Parallel sets of related items — lists, cards, checklists, agendas.'],
  ['5-layouts-comparison-and-progression', ['comparison', 'progression'], 'How options differ, and ordered movement through stages.'],
  ['6-layouts-numbers-and-charts', ['evidence', 'chart'], 'Metrics, stat rows, and every series-data visualization.'],
  ['7-layouts-images-diagrams-math-code', ['imagery', 'diagram', 'math', 'code'], 'Visuals that carry meaning, graphs, equations, source code.'],
  ['8-layouts-legal-and-contact', ['legal', 'connect'], 'Citation-aware legal layouts, and the cards a room can scan.'],
];

function uploadBundles(components, files, examples, layoutCount) {
  const byBucket = new Map();
  for (const c of components) {
    if (!byBucket.has(c.bucket)) byBucket.set(c.bucket, []);
    byBucket.get(c.bucket).push(c);
  }
  const txt = (k) => (files.get(k) || Buffer.alloc(0)).toString('utf8');
  const out = [];

  const header = (title, blurb, toc) =>
    [`# ${title}`, '', `> ${blurb}`, '', ...(toc.length ? ['**Contents:** ' + toc.map((t) => `\`${t}\``).join(' · '), ''] : [])];

  // 1 — the one file to read if you read only one.
  out.push({
    name: 'lattice-1-how-to-write-a-deck.md',
    blurb: 'The whole authoring contract: file shape, what good looks like, the rules, how to render and check.',
    body: [
      ...header('How to write a Lattice deck', 'Read this first. It is the whole authoring contract in one file.', []),
      '## The file',
      '',
      'A deck is one Markdown file. It opens with front matter, then slides separated by a',
      'line containing only `---`, and every slide opens with `<!-- _class: NAME -->`.',
      '',
      ...fenced(FRONT_MATTER.join('\n')),
      '',
      '`theme:` picks the palette (`indaco` is the default) and `color-mode: dark` gives the',
      'dark version.',
      '',
      '## What a good deck looks like',
      '',
      demote(txt(`${AUTHORING}/deck-canon.md`).replace(/^# .*\n/, ''), 1),
      '',
      '## The mechanics',
      '',
      demote(txt(`${AUTHORING}/rules.md`).replace(/^# .*\n/, ''), 1),
      '',
      '## Rendering and checking',
      '',
      demote(renderDoc().replace(/^# .*\n/, ''), 1),
      '',
    ].join('\n'),
  });

  // 2 — the picker.
  out.push({
    name: 'lattice-2-pick-a-layout.md',
    blurb: `Which of the ${layoutCount} layouts to use, by intent — and which to use instead when yours is the wrong fit.`,
    body: [
      ...header('Pick a layout', 'Match your intent to a layout, then count your content against its capacity.', []),
      demote(txt(`${COMPONENTS}/README.md`).replace(/^# .*\n/, ''), 1),
      '',
      '---',
      '',
      '# The same catalog as one table',
      '',
      demote(txt(`${COMPONENTS}/_index.md`).replace(/^# .*\n/, ''), 1),
      '',
    ].join('\n'),
  });

  // 3-8 — the layouts themselves, grouped by bucket.
  for (const [slug, buckets, blurb] of BUNDLE_LAYOUTS) {
    const members = buckets.flatMap((b) => byBucket.get(b) || []);
    if (!members.length) continue;
    const names = new Set(members.map((c) => c.name));
    out.push({
      name: `lattice-${slug}.md`,
      blurb,
      body: [
        ...header(
          `Lattice layouts — ${buckets.join(', ')}`,
          blurb,
          members.map((c) => c.name),
        ),
        ...members.map((c) => rewireBundleLinks(demote(c.body.toString('utf8'), 1), names)),
        '',
      ].join('\n\n'),
    });
  }

  // 9 — the cross-cutting modifiers.
  out.push({
    name: 'lattice-9-modifiers.md',
    blurb: 'The class tokens that compose onto any layout — mood, decoration, typography, chrome.',
    body: [
      ...header('Modifiers', 'Cross-cutting tokens you add beside a layout name on the same `_class` comment.', []),
      demote(txt(`${AUTHORING}/modifiers.md`).replace(/^# .*\n/, ''), 1),
      '',
    ].join('\n'),
  });

  // 10 — complete decks.
  out.push({
    name: 'lattice-10-example-decks.md',
    blurb: 'Five complete, renderable decks — one built to be copied, four that really shipped.',
    body: [
      ...header('Example decks', 'Complete files. Copy the starter; read the other four for range.', []),
      'The starter returns zero findings from the checker. **The four real decks do not** —',
      'each carries three to seven suggestions. That is the checker working, not the decks',
      'failing: a clean run is not the bar, and our own shipped decks prove it.',
      '',
      '## Starter — copy this one',
      '',
      ...fenced(starterDeck(), 'markdown'),
      '',
      ...examples.flatMap((e) => [
        `## ${e.name.replace(/^lattice-example-|\.md$/g, '').replace(/-/g, ' ')} — ${e.slides} slides`,
        '',
        `${e.blurb}`,
        '',
        ...fenced(e.body.toString('utf8'), 'markdown'),
        '',
      ]),
    ].join('\n'),
  });

  return out;
}

/**
 * repo/ — the drop-ins for a coding agent, and the one place a SIZE budget bites
 * for a reason other than an instruction box.
 *
 * `AGENTS.md` is kept small deliberately. Codex budgets the ENTIRE concatenated
 * `AGENTS.md` chain — global, repo root, and every nested one — at 32 KiB and
 * simply stops adding files when it is spent. A generous root file therefore
 * starves the nested file that describes the consumer's actual project, and the
 * failure is invisible. Half the budget is the most we should ever take.
 */
function repoFiles(paste, layoutCount) {
  const agents = [
    '# Authoring Lattice decks',
    '',
    'A Lattice deck is one Markdown file that renders to boardroom-quality slides.',
    'Each slide opens with `<!-- _class: NAME -->` picking one layout, and slides are',
    'separated by a line containing only `---`.',
    '',
    paste.trimEnd(),
    '',
    '## Where the catalog is',
    '',
    `The full catalog — ${layoutCount} layouts, one file each, with slots, capacity and`,
    'anti-patterns — is published at',
    '<https://github.com/Laticent/lattice/tree/dist-kits/agent>.',
    'Read `upload/lattice-2-pick-a-layout.md` to choose, then that layout\'s own file.',
    'The same folder carries `review/check.mjs`, a runnable deck checker.',
    '',
    'Do not pick a layout from memory. Capacity is the usual mistake: count your items',
    'before you commit to a layout, and split or escalate when you are over its budget.',
    '',
  ].join('\n');

  const skill = [
    '---',
    'name: lattice-decks',
    'description: Authors Lattice slide decks in Markdown. Use when writing, editing, or reviewing a presentation, slide deck, or .md file using Lattice layouts.',
    '---',
    '',
    '# Lattice decks',
    '',
    'Write a slide deck as one Markdown file. One layout per slide.',
    '',
    '## Steps',
    '',
    '1. Read `references/writing-a-deck.md` for the file shape and the rules.',
    '2. Read `references/pick-a-layout.md` and choose a layout per slide by intent,',
    '   then check your content against its capacity.',
    '3. Write the deck.',
    '4. If the Lattice kit is on disk, run `node <kit>/review/check.mjs your-deck.md` and fix',
    '   what it names. It is code, so it costs nothing and cannot be argued with.',
    '5. Render it and look at it — `references/render.md` has the commands.',
    '',
    '## Rules that break a deck if you get them wrong',
    '',
    ...ESSENTIALS.map((r) => `- ${r}`),
    '',
  ].join('\n');

  return { agents, skill };
}

/**
 * The three files `SKILL.md` tells the model to read.
 *
 * They shipped as instructions to open `references/writing-a-deck.md`,
 * `references/pick-a-layout.md` and `references/render.md` while no `references/`
 * directory existed anywhere in the kit — so the skill activated, three reads
 * failed, and the plugin whose whole pitch is progressive disclosure had no
 * catalog to disclose.
 *
 * ONE LEVEL DEEP from SKILL.md, deliberately: a reference chain two levels down
 * gets partially read and yields incomplete information. These are the same
 * bodies as `upload/` bundles 1 and 2 and `render/`, re-projected — duplication
 * is the point, because the coding-agent lane must work without the reader having
 * fetched anything else.
 */
function skillReferences(files) {
  const txt = (k) => (files.get(k) || Buffer.alloc(0)).toString('utf8');
  return [
    ['writing-a-deck.md', txt(`${UPLOAD}/lattice-1-how-to-write-a-deck.md`)],
    ['pick-a-layout.md', txt(`${UPLOAD}/lattice-2-pick-a-layout.md`)],
    ['render.md', renderDoc()],
  ];
}

/** start/ — one page per destination, generated from DESTINATIONS. */
function startPages() {
  const pasteName = (k) => `lattice-instructions-${k}.md`;
  return DESTINATIONS.map((d) => ({
    name: `lattice-start-${d.slug}.md`,
    title: d.title,
    body: [
      `# Set up Lattice in ${d.title}`,
      '',
      '## What to paste',
      '',
      `Put [\`paste/${pasteName(d.paste)}\`](../${PASTE}/${pasteName(d.paste)}) in the instructions box.`,
      '',
      ...(d.upload
        ? [
            '## What to upload',
            '',
            `All ${d.upload} files from [\`upload/\`](../${UPLOAD}/). They are numbered in reading order and`,
            'each has a globally unique name, so they survive an uploader that discards folders.',
            '',
          ]
        : ['## What to upload', '', ...(d.uploadNote || ['Nothing. This path is self-contained.']), '']),
      '## Notes',
      '',
      ...d.body,
      '',
      '---',
      '',
      `Render and check what it writes: [\`render/lattice-render-a-deck.md\`](../${RENDER}/lattice-render-a-deck.md).`,
      '',
    ].join('\n'),
  }));
}

/**
 * plugin/ — the Claude Code plugin, as a marketplace of one.
 *
 * A plugin is the only shape that gets PROGRESSIVE DISCLOSURE on this surface:
 * the skill's ~100-token frontmatter sits in context always, and the catalog is
 * read only once a deck is actually being written. Copying the same knowledge
 * into `CLAUDE.md` costs the full amount on every unrelated turn.
 *
 * The description is written to 200 characters, not the spec's 1,024: that is
 * claude.ai's cap for an uploaded skill, and writing to the tightest of the three
 * published limits is what makes one file work on all of them.
 */
function pluginFiles(skill) {
  const manifest = {
    name: 'lattice',
    description: 'Author boardroom-quality slide decks in Markdown with the Lattice layout catalog.',
    version: '1.0.0',
    author: { name: 'Lattice' },
    homepage: 'https://lattice.style',
    license: 'AGPL-3.0-only',
  };
  const marketplace = {
    name: 'lattice',
    owner: { name: 'Lattice' },
    plugins: [
      {
        name: 'lattice',
        source: './',
        description: manifest.description,
      },
    ],
  };
  return [
    { name: '.claude-plugin/plugin.json', body: `${JSON.stringify(manifest, null, 2)}\n` },
    { name: '.claude-plugin/marketplace.json', body: `${JSON.stringify(marketplace, null, 2)}\n` },
    { name: 'skills/lattice-decks/SKILL.md', body: skill },
    {
      name: 'README.md',
      body: [
        '# Lattice — Claude Code plugin',
        '',
        'Adds a `lattice-decks` skill that teaches Claude Code to author Lattice decks.',
        'The skill costs about 100 tokens of context until a deck is actually being',
        'written, which is the reason to install this rather than paste the catalog into',
        '`CLAUDE.md`.',
        '',
        '## Install',
        '',
        'Copy `skills/lattice-decks/` — the `SKILL.md` and its `references/` — into your',
        'project\'s `.claude/skills/`, or into `~/.claude/skills/` to have it everywhere.',
        '',
        ...fenced('cp -r skills/lattice-decks ~/.claude/skills/', 'sh'),
        '',
        '`.claude-plugin/` here is the manifest pair for installing this as a marketplace',
        'plugin. **`/plugin marketplace add` does not work against this kit yet:** that command',
        'resolves `.claude-plugin/marketplace.json` at a repository\'s default-branch root, and',
        'these files publish to the `dist-kits` branch under `agent/plugin/`. The copy above is',
        'the route that works today.',
        '',
      ].join('\n'),
    },
  ];
}

/**
 * README.md — the front door, and the thing this restructure exists to fix.
 *
 * The previous root README routed by TASK ("writing a deck", "building a tool").
 * That is the writer's model of the material. A reader arrives knowing one thing
 * about themselves — where they are putting this — and there was no row for it,
 * so the answer to "what do I do and what do I need" was: read five folder
 * READMEs and work it out.
 *
 * This routes by DESTINATION first, and every row lands on a page that names the
 * exact file to paste and the exact files to upload. The old task table survives
 * one level down, in `library/`, where it is the right question to ask.
 */
function rootReadme(files, layoutCount, components) {
  const soloChars = [...files.get(`${PASTE}/lattice-instructions-solo.md`).toString('utf8')].length;
  const compMedian = median(components.map((c) => c.body.length));
  const canonB = bytesOf(files, `${AUTHORING}/deck-canon.md`);
  const rulesB = bytesOf(files, `${AUTHORING}/rules.md`);
  const primerB = bytesOf(files, `${AUTHORING}/primer.md`);
  const pickB = bytesOf(files, `${COMPONENTS}/README.md`);
  return [
    '# Lattice for AI',
    '',
    '**Lattice turns plain Markdown into boardroom-quality slides.** One layout per slide,',
    'chosen with `<!-- _class: NAME -->`; slides separated by a line containing only `---`.',
    '',
    'This kit teaches any model to write them, and `npx @laticent/lattice deck.md deck.pdf`',
    'renders the result. Nothing vendor-specific.',
    '',
    '## An agent that can read files: start here',
    '',
    `Read [\`start.md\`](./start.md) (${fmtTok(bytesOf(files, 'start.md'))} tokens). It is everything needed to write a good`,
    'deck: the file shape, what a good deck is, the rules, all the layouts, the skeletons of',
    'the common ones, and how to check and render. Then open `components/<name>.md` for each',
    'layout you use.',
    '',
    '## Setting the kit up in a product',
    '',
    '| I am setting up… | Open |',
    '|---|---|',
    ...DESTINATIONS.map(
      (d) => `| ${d.title[0].toUpperCase()}${d.title.slice(1)} | [\`start/lattice-start-${d.slug}.md\`](./${START}/lattice-start-${d.slug}.md) |`,
    ),
    '',
    'Every one of those pages says the same two things: **the text to paste**, and **the files',
    'to upload**. Nothing else is required to get a working setup.',
    '',
    '## In a hurry',
    '',
    `Paste [\`paste/lattice-instructions-solo.md\`](./${PASTE}/lattice-instructions-solo.md) (${soloChars.toLocaleString('en-US')} characters)`,
    'into any chat and ask for a deck. It is self-contained — 19 layouts with their real',
    'skeletons, the rules that break a deck, and a worked example. Nothing to upload.',
    '',
    '## What is in here',
    '',
    '| Folder | What it is for |',
    '|---|---|',
    `| [\`${START}/\`](./${START}/) | One page per destination — what to paste, what to upload |`,
    `| [\`${PASTE}/\`](./${PASTE}/) | The instruction texts, at three sizes, each sized to a real platform cap |`,
    `| [\`${UPLOAD}/\`](./${UPLOAD}/) | Ten knowledge files, ready to drag into a knowledge uploader |`,
    `| [\`${REPO}/\`](./${REPO}/) | Drop-ins for a coding agent — \`AGENTS.md\`, \`CLAUDE.md\`, a Cursor rule, a skill |`,
    `| [\`plugin/\`](./plugin/) | The same skill as an installable Claude Code plugin |`,
    `| [\`${EXAMPLES}/\`](./${EXAMPLES}/) | Five complete, renderable decks |`,
    `| [\`${RENDER}/\`](./${RENDER}/) | How to turn a finished \`.md\` into a PDF |`,
    `| [\`${REVIEW}/\`](./${REVIEW}/) | A runnable checker — code, not a model |`,
    `| [\`${COMPONENTS}/\`](./${COMPONENTS}/) | The deep reference — all ${layoutCount} layouts, one file each |`,
    `| [\`${AUTHORING}/\`](./${AUTHORING}/) | The canon, the rules, the modifiers, the full primer |`,
    `| [\`${SKILLS}/\`](./${SKILLS}/) | Creating a new theme, component, finish or lens from blank |`,
    `| [\`${REFERENCE}/\`](./${REFERENCE}/) | Machine catalogs, for building a tool |`,
    '',
    'The last four are the **library** — one topic per file, for a reader who can fetch a',
    'path. `upload/` is the same knowledge rebundled for an uploader that takes ten files and',
    'discards folders. Both exist because those two consumers cannot be served by one tree.',
    '',
    '## What each path costs, if you are budgeting context',
    '',
    '| Reading… | ~tokens |',
    '|---|---|',
    `| \`start.md\` — the whole contract, all ${layoutCount} layouts | **${fmtTok(bytesOf(files, 'start.md'))}** |`,
    `| \`${PASTE}/lattice-instructions-solo.md\` — 19 layouts, self-contained, for a small model | ${fmtTok(bytesOf(files, `${PASTE}/lattice-instructions-solo.md`))} |`,
    `| the authoring path: canon → rules → picker | **${fmtTok(canonB + rulesB + pickB)}** once |`,
    `| …then one \`${COMPONENTS}/<name>.md\` per layout you use | + ${fmtTok(compMedian)} each |`,
    `| drafting a whole deck in one pass: canon → primer | ${fmtTok(canonB + primerB)} |`,
    `| creating a theme, component, finish or lens | ${skillsRange(files)} |`,
    '',
    'The per-layout row is the one that matters: a nine-slide deck reads nine of those files,',
    'so the fixed figure alone describes a one-slide deck and understates a real one by about 3x.',
    '',
    '## Two things that will bite you',
    '',
    '**Copy the skeleton exactly.** Every layout reads a fixed Markdown shape: a card layout',
    'nests `- Title` then `  - body`, a title slide is `# H1`, a backtick eyebrow, then a',
    'subtitle. A deck in the wrong shape still renders, just not as the layout you picked.',
    '',
    '**Run the checker before you hand a deck over.** `node review/check.mjs your-deck.md`,',
    'from this folder, is code rather than a model: no tokens, offline, a tenth of a second,',
    'and it cannot be talked into approving a deck. A model reviewing its own draft will tell',
    'you the draft is fine.',
    '',
    '---',
    '',
    '_Generated from the Lattice sources — do not hand-edit. Republished whenever an input_',
    '_changes. ~token figures are bytes ÷ 4, a rough cross-model approximation; your tokenizer_',
    '_will differ, and the ratios are what matter._',
    '',
  ].join('\n');
}

/**
 * start.md — the one file an agent reads first (2026-11-17-agent-pack.md §4.1).
 *
 * Everything needed to write a good deck, in one fetch: the file shape, the deck canon,
 * the rules, the modifiers, every layout in one line, and the skeletons of the common
 * ones. A reader of this file alone can write a full deck; `components/<name>.md` raises
 * one slide from good to excellent (capacity, variants, the mistakes the reviewer flags).
 *
 * NOTHING HERE IS WRITTEN TWICE. Each section is a file the kit already builds or a field
 * of `components.json`, so `start.md` cannot disagree with the rest of the kit. The
 * budget is START_MAX; the build fails past it.
 */
const START_MAX = 48000;
/** Chart skeletons start.md adds after the solo layouts: the commonest two, a part of a whole and a ranking. */
const START_CHART_SKELETONS = ['bar', 'piechart'];

function firstSentence(text, max = 110) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  // The first sentence end that is not inside inline code (`1.` in `` `1.` `` is not one).
  let out = t;
  for (const m of t.matchAll(/[.!?](?=\s|$)/g)) {
    if ((t.slice(0, m.index).match(/`/g) || []).length % 2 === 0) {
      out = t.slice(0, m.index + 1);
      break;
    }
  }
  out = out.replace(/:$/, '.');
  if (out.length > max) out = `${out.slice(0, max - 1).replace(/\s+\S*$/, '')}…`;
  return out;
}

function capacityNote(c) {
  const cap = c.capacity;
  if (!cap?.axis || cap.sweet == null) return '';
  const unit = cap.axis === 'item' ? 'items' : `${cap.axis}s`;
  return cap.hard != null && cap.hard !== cap.sweet ? ` (best ${cap.sweet}, max ${cap.hard} ${unit})` : ` (${cap.sweet} ${unit})`;
}

const BUCKET_ORDER = [
  ['anchor', 'Where you are in the deck'],
  ['statement', 'One claim per slide'],
  ['inventory', 'A set of related items'],
  ['comparison', 'How options differ'],
  ['progression', 'Steps, stages, time'],
  ['evidence', 'Numbers and proof'],
  ['chart', 'Data as a chart (authored as nested lists, not a fence)'],
  ['diagram', 'Structure and flow'],
  ['imagery', 'Photos and pictures'],
  ['math', 'Equations'],
  ['code', 'Source code'],
  ['legal', 'Legal and policy'],
  ['connect', 'People and contact'],
  ['layout', 'Two components on one slide'],
];

function startDoc(files, cat) {
  const strip = (rel) => {
    const raw = files.get(rel);
    if (!raw) throw new Error(`build-agent-kit: start.md needs ${rel}, which is not built yet.`);
    // start.md sits at the kit root, so a relative link in a section copied from a subfolder
    // (authoring/modifiers.md's `../reference/components.json`) is re-based to the root.
    const dir = path.posix.dirname(rel);
    const rebased = proseOnly(raw.toString('utf8'), (prose) =>
      prose.replace(/\]\((?!https?:|#|mailto:|sample:)([^)\s]+)\)/g, (_m, href) => {
        const [file, anchor = ''] = href.split(/(?=#)/);
        return `](./${path.posix.normalize(path.posix.join(dir, file))}${anchor})`;
      }),
    );
    return rebased
      .replace(/^# .*\n+/, '')
      .replace(/\n---\n+(Source|_Generated)[\s\S]*$/, '\n')
      .trim();
  };
  const { DECK_CANON } = require(path.join(ROOT, 'lib', 'authoring', 'deck-canon.js'));
  const comps = [...cat.values()];
  const layoutRows = [];
  for (const [bucket, label] of BUCKET_ORDER) {
    const inBucket = comps.filter((c) => c.bucket === bucket).sort((a, b) => a.name.localeCompare(b.name));
    if (!inBucket.length) continue;
    layoutRows.push(`**${label}**`, '');
    for (const c of inBucket) {
      const variants = (c.variants || []).length ? ` Variants: ${c.variants.map((v) => `\`${v}\``).join(', ')}.` : '';
      const words = c.density?.soft ? ` ~${c.density.soft} words per ${c.density.axis === 'item' ? 'item' : c.density.axis}.` : '';
      const blocks = c.authoring?.blocks || [];
      const missing = ['key-insight', 'below-note'].filter((b) => !blocks.includes(b));
      const noBlocks = missing.length ? ` No ${missing.map((b) => (b === 'key-insight' ? 'key insight' : 'below-note')).join(' or ')}.` : '';
      layoutRows.push(`- [\`${c.name}\`](./${COMPONENTS}/${c.name}.md): ${firstSentence(c.purpose || c.description)}${capacityNote(c)}${words}${variants}${noBlocks}`);
    }
    layoutRows.push('');
  }
  const listed = new Set(BUCKET_ORDER.map(([b]) => b));
  const stray = comps.filter((c) => !listed.has(c.bucket)).map((c) => c.name);
  if (stray.length) throw new Error(`build-agent-kit: start.md has no bucket heading for ${stray.join(', ')}. Add the bucket to BUCKET_ORDER.`);

  // Plus two charts: the solo list has none, and a data deck needs one. Without these a
  // model guessed a nested-list shape for a pie (the stand-in eval, 2026-11-19).
  const skeletons = [...SOLO_LAYOUTS, ...START_CHART_SKELETONS].flatMap((n) => [`### ${n}`, '', ...fenced(skeletonFor(cat, n)), '']);
  const uni = universalRows(files);
  const pluginRows = [];
  for (const [rel, buf] of [...files].filter(([k]) => /^plugins\/[^/]+\.md$/.test(k)).sort()) {
    const name = rel.slice('plugins/'.length, -3);
    const { lead, example, cls } = pluginSummary(buf.toString('utf8'));
    pluginRows.push(`- [\`${name}\`](./${rel}): ${lead}`);
    if (example) pluginRows.push(`  Example${cls ? ` (on a \`${cls}\` slide)` : ''}: ${example.includes('`') ? `\`\` ${example} \`\`` : `\`${example}\``}`);
  }
  if (!pluginRows.length) throw new Error('build-agent-kit: start.md found no plugins/*.md; pluginDocs() must run before startDoc().');
  return [
    '# Write a Lattice deck',
    '',
    'Lattice turns one Markdown file into a boardroom-ready deck: PDF, PowerPoint, images or',
    'a web player. Each slide picks a layout with `<!-- _class: NAME -->`, and a palette',
    'colors the whole deck. This file is everything you need to write a good one. Read it',
    'top to bottom once.',
    '',
    'Then, for each layout you use, open its file (each name below links to it): it gives',
    'how much the layout holds, its variants, and the mistakes reviewers flag. That is the',
    'difference between a deck that renders and one worth showing.',
    '',
    '## 1. The file',
    '',
    ...fenced(FRONT_MATTER.join('\n'), 'markdown'),
    '',
    '- `theme:` picks the palette. `indaco` is the default; `cuoio`, `onyx`, `carta`, `laguna`',
    '  and more ship with Lattice. Add `color-mode: dark` for the dark version.',
    '- `paginate: true` numbers the slides.',
    '- Separate slides with a line containing only `---`, with a blank line on each side.',
    '- Start every slide with one `<!-- _class: NAME -->` line. Use only names from section 5.',
    '',
    '## 2. What a good deck is',
    '',
    'This is the canon the Lattice Studio sends its own model on every turn.',
    '',
    DECK_CANON.trim(),
    '',
    '## 3. Rules for every slide',
    '',
    strip(`${AUTHORING}/rules.md`)
      .replace(/^These are the half[\s\S]*?\n\n/, '')
      .replace(/^> Where a rule says[\s\S]*?\n\n/m, ''),
    // Gaps a model writing from this file alone hit on 2026-11-19 (the no-spend stand-in eval,
    // engineering/decisions/2026-11-17-agent-pack.md §4.5): it was told to use speaker notes
    // with no syntax, and it wrote `{Off plan}` on a kpi row the layout colors as on plan.
    '- Speaker notes: a plain HTML comment on the slide, `<!-- Pause here for questions. -->`.',
    '  `<!-- say: … -->` holds the exact words to speak. Notes never show on the slide.',
    // The first real-model run (2026-11-19) then put `{Breaching}` on a row `kpi attention` draws
    // green with a check: the rule named no rows. These rows are kpi.styles.css's nth-child hooks,
    // pinned by test/unit/tools/agent-kit-structure.test.js.
    '- A `kpi` row\'s first pill takes its color from the row\'s POSITION, never its words:',
    '  plain `kpi` draws every row green with a check (on plan); `kpi attention` draws row 1 in',
    '  the warning color; `kpi ops` rows 1 and 3; `kpi compliance` row 3. Put an off-plan metric',
    '  on a warning row, or leave its pill off and say the miss in the context line. A second',
    '  pill on a row is a neutral tag.',
    // Measured 2026-11-19 by rendering every variant at 3 and 4 rows, with and without a `>`:
    // these clip in the export, and lint:deck does not see it (followups.d/3305-p2-kpi-fit-lint.md).
    '- A `kpi` key insight (`>`) fits only with 3 rows, and never on `kpi ops`; `kpi compliance`',
    '  holds 3 rows. Past that the export clips the slide: drop the `>` or split.',
    // Verified by render 2026-11-19: both draw a `##` above the hero, and lint takes it.
    '- `big-number` and `quote` take an optional `## ` claim above the number or the quotation;',
    '  their skeletons omit it. Write one, so the headings-only read keeps the beat.',
    `- A \`timeline-list\` status pill is one of ${chartStatus().length} words: ${chartStatus().map((w) => `\`${w}\``).join(' ')}.`,
    '  Any other word draws in the info color.',
    '',
    '## 4. Parts any slide can carry',
    '',
    'These work on almost every layout with no class: write the Markdown shape and the slide',
    'draws it. A layout line in section 5 says when it does not take a key insight or a',
    'below-note. Each name links to the full rule and examples.',
    '',
    ...uni.parts,
    '',
    '**Deck-wide settings (front matter).** Each key sets one thing for the whole deck:',
    '',
    ...uni.registers,
    // Not a register (lib/base/base.registers.docs.md does not list it), so it is added here:
    // §2's canon names `profile: teaching` and a model had no way to learn its key.
    `- \`profile:\` (\`${PROFILE_NAMES().join('` · `')}\`): the genre the checker judges the deck against; \`teaching\` allows denser slides`,
    '',
    `## 5. All ${comps.length} layouts`,
    '',
    'Pick by what the slide has to do. Each line gives the layout\'s job and how much it holds;',
    'past the maximum, split the slide or pick a roomier layout. If nothing fits, use',
    '`content` for prose or `list` for bullets. Never invent a name.',
    '',
    ...layoutRows,
    '## 6. Modifiers',
    '',
    strip(`${AUTHORING}/modifiers.md`).replace(/^## /gm, '### '),
    '',
    '## 7. Inline notation',
    '',
    'Plugins add small drawn things you write in inline code: pills, icons, word-sized charts,',
    'check marks, portraits, pictures. **The backticks are part of the notation**: `` `{On plan}` ``',
    'is a pill, while a bare {On plan} prints as text. Each name links to the full notation.',
    'Most work on any slide. Three do not: a callout works on the charts its file lists; the',
    '`[x]` shortcuts lead a list item only on layouts that read them (checklist, verdict-grid,',
    'pricing and a few more), though `` `[x]` `` as inline code draws anywhere; and an authored',
    '`@legend{…}` key is not drawn by any layout yet, since the charts draw their own keys.',
    '`lint:deck` warns when nothing on the slide reads a callout or legend.',
    '',
    ...pluginRows,
    '',
    `## 8. Skeletons for the ${SOLO_LAYOUTS.length} most-used layouts and ${START_CHART_SKELETONS.length} charts`,
    '',
    'Copy the shape exactly: heading levels, bullet nesting and the order of lines all',
    'matter. Every other layout\'s skeleton is in its own file.',
    '',
    ...skeletons,
    '## 9. Check and render',
    '',
    ...fenced(
      [
        'node review/check.mjs deck.md               # from the kit root: code, not a model',
        'npx @laticent/lattice deck.md deck.pdf      # or .pptx, .png, .html',
      ].join('\n'),
      'sh',
    ),
    '',
    'Reading this on lattice.style rather than from the kit? Fetch the checker and the catalog',
    'it reads, side by side as in the kit; without the catalog it skips the word budgets:',
    '',
    ...fenced(CHECKER_FETCH, 'sh'),
    '',
    'No command line? Open the file in the Lattice Studio at <https://lattice.style/studio>',
    `and export from there. More in [\`${RENDER}/lattice-render-a-deck.md\`](./${RENDER}/lattice-render-a-deck.md).`,
    '',
    '## 10. When you need more',
    '',
    '| To… | Read |',
    '|---|---|',
    `| Every universal part, with examples | [\`${AUTHORING}/universal.md\`](./${AUTHORING}/universal.md) |`,
    `| Every front-matter setting | [\`${AUTHORING}/registers.md\`](./${AUTHORING}/registers.md) |`,
    `| See a whole deck | [\`${EXAMPLES}/lattice-example-starter.md\`](./${EXAMPLES}/lattice-example-starter.md) |`,
    `| Edit or restructure an existing deck | [\`${SKILLS}/edit-deck.md\`](./${SKILLS}/edit-deck.md) |`,
    `| Change how a deck looks, not what it says | [\`${SKILLS}/restyle-deck.md\`](./${SKILLS}/restyle-deck.md) |`,
    `| Turn numbers into the right chart | [\`${SKILLS}/chart-from-data.md\`](./${SKILLS}/chart-from-data.md) |`,
    `| Write speaker notes | [\`${SKILLS}/speaker-notes.md\`](./${SKILLS}/speaker-notes.md) |`,
    `| Fix what the checker reported | [\`${SKILLS}/fix-findings.md\`](./${SKILLS}/fix-findings.md) |`,
    `| Every other task: a diagram, math, import, a theme | [\`${SKILLS}/README.md\`](./${SKILLS}/README.md) |`,
    `| Hand the deck to someone who uses Marp | [\`${RENDER}/lattice-export-to-marp.md\`](./${RENDER}/lattice-export-to-marp.md) |`,
    '',
  ].join('\n');
}

/**
 * The pack's gates (2026-11-17-agent-pack.md §4.4), run on the finished file map.
 *
 * 1. LINKS STAY IN THE PACK. Every relative Markdown link in every kit `.md` names a file
 *    the kit carries. The kit is served verbatim at lattice.style/agents/ and mirrored to
 *    dist-kits, so a link that resolves here resolves in both places. Code is skipped
 *    (a `![name](photo.jpg)` inside a skeleton is an example, not a link), and so are
 *    images, anchors and absolute URLs.
 * 2. MARP IS ONE PAGE. Wording that teaches Lattice as Marp appears only in the export
 *    page. This is the sentence-level check `tools/marp-inventory.mjs` cannot make: it
 *    sorted the whole generator into `export` and so approved "A Lattice deck is a Marp
 *    deck first". `skills/import.md` is exempt because importing a Marp deck is its job.
 */
const MARP_PAGE = 'render/lattice-export-to-marp.md';
// skills/import.md: importing a Marp deck is its job. plugins/video.md: its "where it works"
// list says how a video record behaves when a deck is exported to the Marp kit.
const MARP_EXEMPT = new Set([MARP_PAGE, 'skills/import.md', 'plugins/video.md']);
// The universal references note how a feature behaves in an exported Marp bundle or the VS Code
// preview. They may NAME marp-cli; they may still never write `marp: true` or call a deck a Marp deck.
const MARP_HOST_NOTES = new Set(['authoring/universal.md', 'authoring/registers.md']);
const MARP_FRAMING = [
  [/^\s*marp:\s*true\s*$/m, 'a `marp: true` front-matter line'],
  [/\bis a Marp deck\b|\bMarp deck first\b/i, 'calls a Lattice deck a Marp deck'],
  [/--theme-set\b/, 'a marp-cli `--theme-set` flag'],
  [/\bmarp-cli\b/i, 'names marp-cli as a renderer'],
  [/@marp-team\//, 'an @marp-team package'],
];

function assertPack(files) {
  const problems = [];
  const prose = (t) => t.replace(CODE_REGIONS, '');
  for (const [rel, buf] of files) {
    if (!rel.endsWith('.md')) continue;
    const text = buf.toString('utf8');
    for (const m of prose(text).matchAll(/(!?)\[[^\]]*\]\(([^)\s]+)\)/g)) {
      if (m[1] || /^(https?:|mailto:|#|sample:)/.test(m[2])) continue;
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(rel), m[2].split('#')[0]));
      const isDir = [...files.keys()].some((k) => k.startsWith(`${target.replace(/\/$/, '')}/`));
      if (!files.has(target) && !isDir) problems.push(`${rel}: link to ${m[2]} names a file the kit does not carry`);
    }
    if (MARP_EXEMPT.has(rel) || rel.startsWith(`${REFERENCE}/`)) continue;
    for (const [re, what] of MARP_FRAMING) {
      if (MARP_HOST_NOTES.has(rel) && /marp-cli|@marp-team|theme-set/.test(re.source)) continue;
      if (re.test(text)) problems.push(`${rel}: ${what} (Marp belongs only in ${MARP_PAGE})`);
    }
  }
  if (problems.length) {
    throw new Error(`build-agent-kit: the agent pack failed its gates (2026-11-17-agent-pack.md §4.4):\n  ${problems.join('\n  ')}`);
  }
}

/**
 * Fail the build when a paste text outgrows the box it has to fit in.
 *
 * This is the gate that makes the caps real. Two of the three limits truncate
 * SILENTLY on the platform that owns them — Windsurf at 6,000 chars, and a local
 * model's context window — so the failure mode without this check is not a
 * rejected paste, it is a text that looks fine, loses its own top, and produces
 * confidently wrong decks. A reviewer cannot see that in a diff; a byte count can.
 *
 * Characters, not bytes: every documented cap is stated in characters, and the
 * texts carry multi-byte punctuation, so `Buffer.byteLength` would over-count and
 * fail a text that actually fits.
 */
function assertBudgets(files) {
  const caps = [
    [`${PASTE}/lattice-instructions-standard.md`, PASTE_STANDARD_MAX, 'Windsurf global_rules.md truncates silently past this'],
    [`${PASTE}/lattice-instructions-max.md`, PASTE_MAX_MAX, 'OpenAI Custom GPT and M365 declarative agents both cap here'],
    [`${PASTE}/lattice-instructions-solo.md`, PASTE_SOLO_MAX, 'must also fit a 4k-token local context beside the deck it writes'],
  ];
  const over = [];
  for (const [name, cap, why] of caps) {
    const n = [...files.get(name).toString('utf8')].length;
    if (n > cap) over.push(`${name}: ${n} chars > ${cap} (${why})`);
  }
  if (over.length) {
    throw new Error(`build-agent-kit: paste text over budget —\n       ${over.join('\n       ')}`);
  }
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
    // Markdown catalogs get the same relocation as the component docs — the
    // pick list is generated for repo users and hands out a `lib/components/...`
    // path. JSON is machine input and is copied byte-for-byte.
    files.set(c.to, c.file.endsWith('.json') ? readFileSync(src) : Buffer.from(relocate(readFileSync(src, 'utf8')), 'utf8'));
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
  files.set(`${AUTHORING}/modifiers.md`, Buffer.from(modifiersDoc(), 'utf8'));
  files.set(`${REFERENCE}/studio-prompts.md`, Buffer.from(studioPromptsDoc(), 'utf8'));

  // The checker and its rubric. check.mjs is the only executable in the kit —
  // and the only reason the kit needs license files at all, since it inlines six
  // third-party packages whose notices the bundler strips.
  const checker = reviewBundle();
  files.set(`${REVIEW}/check.mjs`, checker);
  files.set(`${REVIEW}/rubric.md`, Buffer.from(rubricDoc(), 'utf8'));
  files.set('LICENSE', readFileSync(path.join(ROOT, 'LICENSE')));
  files.set('LICENSE-EXCEPTIONS', readFileSync(path.join(ROOT, 'LICENSE-EXCEPTIONS')));
  files.set('NOTICE.md', Buffer.from(noticeDoc(checker), 'utf8'));
  files.set('THIRD-PARTY-LICENSES.txt', Buffer.from(thirdPartyLicenses(checker), 'utf8'));

  const components = componentDocs();
  const componentCount = components.filter((c) => !c.family).length;
  if (componentCount !== layoutCount) {
    process.stderr.write(
      `[build-agent-kit] warning: ${layoutCount} layouts in the catalog but ${componentCount} component docs found.\n`,
    );
  }
  for (const c of components) files.set(`${COMPONENTS}/${c.name}.md`, c.body);
  const plugins = pluginDocs();
  for (const p of plugins) files.set(`plugins/${p.name}.md`, p.body);
  for (const u of universalDocs()) files.set(u.rel, Buffer.from(u.body, 'utf8'));

  // The skills ship VERBATIM and are byte-pinned. Their index does not:
  // the repo's own README is written for someone inside the repo, so the kit
  // generates its own, carrying the glossary that makes the skills' HARD RULE
  // citations legible to an outside reader.
  const skills = skillDocs();
  if (!skills.length) {
    throw new Error(
      `build-agent-kit: no skills found in ${SKILLS_DIR}. The kit ships them verbatim; an empty skills/ is a silently short kit.`,
    );
  }
  for (const s of skills) {
    if (s.name === 'README.md') continue;
    files.set(`${SKILLS}/${s.name}`, s.body);
  }
  files.set(`${SKILLS}/README.md`, Buffer.from(skillsReadme(skills), 'utf8'));

  // Local bootstraps. Order matters: each quotes sizes of files already set.
  files.set(`${COMPONENTS}/README.md`, Buffer.from(componentsReadme(components, files), 'utf8'));
  files.set(`${AUTHORING}/README.md`, Buffer.from(authoringReadme(files, layoutCount), 'utf8'));
  files.set(`${REFERENCE}/README.md`, Buffer.from(referenceReadme(files), 'utf8'));
  files.set(`${REVIEW}/README.md`, Buffer.from(reviewReadme(files), 'utf8'));

  // ── Editions ──────────────────────────────────────────────────────────────
  // Built AFTER the catalogs and the component docs, because every one of them
  // reads a skeleton, a size or a name out of what is already in `files`.
  const cat = catalogOf(files);
  const traps = reviewerTraps();
  files.set(`${PASTE}/lattice-instructions-solo.md`, Buffer.from(instructionsSolo(cat), 'utf8'));
  files.set(`${PASTE}/lattice-instructions-standard.md`, Buffer.from(instructionsStandard(), 'utf8'));
  files.set(
    `${PASTE}/lattice-instructions-max.md`,
    Buffer.from(traps.length ? instructionsMax(traps) : instructionsStandard(), 'utf8'),
  );
  assertBudgets(files);

  // render/ and examples/ — the two ends of the pipeline the kit was missing.
  files.set(`${RENDER}/lattice-render-a-deck.md`, Buffer.from(renderDoc(), 'utf8'));
  files.set(`${RENDER}/lattice-export-to-marp.md`, Buffer.from(exportToMarpDoc(), 'utf8'));
  const start = startDoc(files, cat);
  if (start.length > START_MAX) {
    throw new Error(`build-agent-kit: start.md is ${start.length} characters; its budget is ${START_MAX} (2026-11-17-agent-pack.md §4.1). Cut, do not raise.`);
  }
  files.set('start.md', Buffer.from(start, 'utf8'));
  files.set(`${EXAMPLES}/lattice-example-starter.md`, Buffer.from(starterDeck(), 'utf8'));
  const examples = exampleDecks();
  for (const e of examples) files.set(`${EXAMPLES}/${e.name}`, e.body);

  // start/ — one page per destination.
  for (const p of startPages()) files.set(`${START}/${p.name}`, Buffer.from(p.body, 'utf8'));

  // upload/ — the ten bundles. Built last of the content, because every one of
  // them re-projects a file already in the map.
  for (const b of uploadBundles(components, files, examples, layoutCount)) {
    files.set(`${UPLOAD}/${b.name}`, Buffer.from(b.body, 'utf8'));
  }

  // repo/ + plugin/ — the coding-agent lane. Both carry the SAME skill text; a
  // plugin is the packaging, not a second body of knowledge.
  const { agents, skill } = repoFiles(files.get(`${PASTE}/lattice-instructions-standard.md`).toString('utf8'), layoutCount);
  files.set(`${REPO}/AGENTS.md`, Buffer.from(agents, 'utf8'));
  files.set(`${REPO}/CLAUDE.md`, Buffer.from('@AGENTS.md\n', 'utf8'));
  files.set(
    `${REPO}/lattice.mdc`,
    Buffer.from(
      ['---', 'description: Authoring Lattice slide decks in Markdown', 'alwaysApply: false', '---', '', agents].join('\n'),
      'utf8',
    ),
  );
  files.set(`${REPO}/skills/lattice-decks/SKILL.md`, Buffer.from(skill, 'utf8'));
  for (const f of pluginFiles(skill)) files.set(`plugin/${f.name}`, Buffer.from(f.body, 'utf8'));
  // The skill's own references, under BOTH copies of it. A skill that names a
  // file it does not carry is a skill that fails on activation.
  for (const [name, body] of skillReferences(files)) {
    files.set(`${REPO}/skills/lattice-decks/references/${name}`, Buffer.from(body, 'utf8'));
    files.set(`plugin/skills/lattice-decks/references/${name}`, Buffer.from(body, 'utf8'));
  }

  files.set('README.md', Buffer.from(rootReadme(files, layoutCount, components), 'utf8'));
  assertPack(files);
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

export { buildKit, fenced, main, mdCell, OUT_DIR };
