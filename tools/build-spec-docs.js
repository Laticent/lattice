#!/usr/bin/env node
/**
 * Publish the owned LFM standards (spec/*.md) onto the docs website as
 * Starlight content pages — generated, never hand-copied, so the website can
 * never drift from the canonical spec.
 *
 *   spec/LFM-1.0.md    → docs/src/content/docs/spec/lfm.md         (/spec/lfm/)
 *   spec/diagnostics.md → docs/src/content/docs/spec/diagnostics.md (/spec/diagnostics/)
 *
 * `spec/*.md` stays the single source of truth (it is what we license CC-BY-4.0
 * and ask a second implementation to follow). This generator only mirrors it
 * into the site, applying three site-specific transforms:
 *
 *   1. Strip the leading `# Title` — Starlight renders the front-matter title
 *      as the page <h1>; a body H1 would double it.
 *   2. Inject Starlight front-matter (title + description) and a "canonical
 *      source" note that links back to the repo file and to the plain-words
 *      teaching page (/spec/understanding-lfm/).
 *   3. Rewrite the repo-relative links so they resolve on the website:
 *        ./diagnostics.md / LFM-1.0.md → the sibling site routes
 *        ../README.md                  → /overview/ (the site's README analog)
 *        every other repo path         → the GitHub source (blob/main)
 *      Links inside fenced code blocks are left verbatim.
 *
 * The hand-authored front door of the Specification group —
 * docs/src/content/docs/spec/understanding-lfm.md — is NOT touched here; it is
 * prose (the non-technical register) and lives in the repo like every other
 * authored docs page.
 *
 * Usage:
 *   node tools/build-spec-docs.js            # regenerate the site spec pages
 *   node tools/build-spec-docs.js --check    # CI gate (stale = exit 1)
 *
 * Exit codes:
 *   0  success (or --check: up to date)
 *   1  --check: an output is stale relative to spec/
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'docs', 'src', 'content', 'docs', 'spec');
const GH_BLOB = 'https://github.com/Laticent/lattice/blob/main';

// Repo-relative spec file → site route, for cross-spec links.
const SITE_ROUTES = {
  'spec/LFM-1.0.md': '/spec/lfm/',
  'spec/diagnostics.md': '/spec/diagnostics/',
  'README.md': '/overview/',
};

// The specs to mirror. `source` is repo-relative; `out` is the file under
// OUT_DIR (its basename, sans .md, is the site slug → /spec/<slug>/).
const SPECS = [
  {
    source: 'spec/LFM-1.0.md',
    out: 'lfm.md',
    title: 'LFM 1.0 — the specification',
    description:
      'The normative specification for Lattice-Flavored Markdown: the extension set over CommonMark + GFM, how each construct degrades, and what makes a document conformant.',
  },
  {
    source: 'spec/diagnostics.md',
    out: 'diagnostics.md',
    title: 'LFM Diagnostic Protocol',
    description:
      'The stable contract a tooling vendor implements to give LFM authors inline findings and quick-fixes: the finding shape, the frozen rule registry, severities, and machine-applicable fixes.',
  },
];

// Split a markdown link target into [pathPart, hash]. The hash includes its `#`.
function splitHash(href) {
  const i = href.indexOf('#');
  return i === -1 ? [href, ''] : [href.slice(0, i), href.slice(i)];
}

// Rewrite one link target written relative to spec/ into one that resolves on
// the website. External URLs, anchors, and already-site-absolute links pass
// through untouched.
function rewriteHref(href) {
  if (/^(https?:|mailto:|tel:|#|\/\/)/.test(href) || href.startsWith('/')) return href;
  const [pathPart, hash] = splitHash(href);
  if (!pathPart) return href; // pure anchor handled above; bare hash safety
  // Resolve relative to the spec/ directory → a repo-root-relative path.
  const repoRel = path.posix.normalize(path.posix.join('spec', pathPart));
  if (SITE_ROUTES[repoRel]) return SITE_ROUTES[repoRel] + hash;
  return `${GH_BLOB}/${repoRel}${hash}`;
}

// Rewrite every inline `[text](href)` link outside fenced code blocks.
function rewriteLinks(markdown) {
  const lines = markdown.split('\n');
  let inFence = false;
  const linkRe = /(\[[^\]]*\]\()([^)]+)(\))/g;
  return lines
    .map((line) => {
      if (/^\s*(```|~~~)/.test(line)) {
        inFence = !inFence;
        return line;
      }
      if (inFence) return line;
      return line.replace(linkRe, (_m, open, href, close) => `${open}${rewriteHref(href)}${close}`);
    })
    .join('\n');
}

// Strip the first top-level `# H1` (Starlight supplies the title) and any blank
// lines immediately after it.
function stripLeadingH1(markdown) {
  const lines = markdown.split('\n');
  const i = lines.findIndex((l) => l.trim() !== '');
  if (i === -1 || !/^#\s+/.test(lines[i])) return markdown;
  let j = i + 1;
  while (j < lines.length && lines[j].trim() === '') j++;
  return lines.slice(j).join('\n');
}

function yamlQuote(s) {
  return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function render(spec) {
  const raw = fs.readFileSync(path.join(ROOT, spec.source), 'utf8');
  const body = rewriteLinks(stripLeadingH1(raw)).trimEnd();
  const note =
    `:::note[Canonical source]\n` +
    `This page is generated from [\`${spec.source}\`](${GH_BLOB}/${spec.source}) and ` +
    `published under [CC-BY-4.0](https://creativecommons.org/licenses/by/4.0/). ` +
    `New to LFM? Start with [Understanding LFM](/spec/understanding-lfm/).\n` +
    `:::`;
  return (
    `---\n` +
    `title: ${yamlQuote(spec.title)}\n` +
    `description: ${yamlQuote(spec.description)}\n` +
    `---\n\n` +
    `<!-- GENERATED by tools/build-spec-docs.js from ${spec.source} — do not edit; edit the spec. -->\n\n` +
    `${note}\n\n` +
    `${body}\n`
  );
}

function isStale(file, content) {
  const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  return current !== content;
}

function main(argv) {
  const check = argv.includes('--check');
  fs.mkdirSync(OUT_DIR, { recursive: true });
  let stale = 0;
  for (const spec of SPECS) {
    const out = path.join(OUT_DIR, spec.out);
    const label = path.relative(ROOT, out);
    const content = render(spec);
    if (isStale(out, content)) {
      if (check) {
        process.stderr.write(`stale: ${label} — run \`node tools/build-spec-docs.js\` to regenerate.\n`);
        stale++;
      } else {
        fs.writeFileSync(out, content);
        process.stdout.write(`wrote ${label} (from ${spec.source}).\n`);
      }
    } else if (!check) {
      process.stdout.write(`no changes (${label} up to date).\n`);
    }
  }
  if (check) {
    if (stale) return 1;
    process.stdout.write('spec docs up to date.\n');
  }
  return 0;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = { render, rewriteHref, SPECS, OUT_DIR };
