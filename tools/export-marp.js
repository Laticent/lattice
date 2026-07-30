#!/usr/bin/env node
/**
 * export-marp — produce a portable, self-contained bundle of a Lattice deck for
 * use outside Lattice ("Marp is an export target, not a live render path").
 *
 * See engineering/decisions/2026-06-13-export-to-marp.md. The bundle is a
 * MARP-NATIVE artifact (rendered with marp-cli / the VS Code extension, NOT
 * Lattice's engine):
 *   <name>/
 *     <name>.md            — splits BAKED into literal `---` (lib/core/bake-splits.js),
 *                            local image + front-matter `logo:` paths localized into
 *                            assets/, runtime <script> tags (mermaid + lattice-runtime)
 *                            and the BAKED FRONT MATTER appended
 *                            (lib/core/deck-front-matter.js — the deck-wide registers
 *                            Marp strips and `fetch` can't recover over `file://`)
 *                            plus this export's OWN settings block
 *                            (lib/core/export-settings.js — today the overflow-marker
 *                            level; producer choices, not deck front matter)
 *     lattice.css          — the palette-blind engine stylesheet (minified)
 *     fonts/*.woff2        — every face lattice.css's @font-face srcs point at
 *     themes/<palette>.css — the deck's palette (+ -dark), minified (from dist/themes/)
 *     lattice-runtime.min.js,
 *     mermaid-v11.min.js   — render diagrams + components when opened as HTML
 *     .vscode/settings.json — registers the themes for the Marp VS Code preview
 *     marp.config.cjs      — registers the themeSet for `marp-cli`
 *     package.json         — pins @marp-team/marp-cli (the only dep)
 *     assets/              — every local image the deck references
 *     README.md            — VS Code + marp-cli quick start + the fidelity note
 *     AGENTS.md            — entrypoint for an AI agent (default; --no-agent omits)
 *     agent/components.json — the Lattice component catalog (capacity included)
 *
 * Usage:
 *   node tools/export-marp.js <deck.md> <out-dir-or-zip> [palette]
 *                             [--no-agent] [--overflow-marker=author|reader|off]
 *
 * `--overflow-marker` decides who the overflow signal in the rendered bundle is
 * addressed to — see lib/core/resolve-overflow-marker.js. It is an EXPORT setting,
 * never a deck key: the same source is previewed while authoring, exported for a
 * recipient, and printed to PDF, and those three want different answers. Resolution
 * is `--overflow-marker` (this export) → `LATTICE_OVERFLOW_MARKER` (every export
 * from this checkout) → `reader`. The console says which one won.
 *
 * The chosen level is recorded in the bundle's export-settings block, NOT in the
 * deck's front matter — so re-exporting a bundle's own `.md` starts from your
 * current inputs rather than inheriting the previous export's, and Lattice's own
 * render paths strip the block so a bundle-derived deck cannot inherit it either.
 *
 * Fidelity: the baked `.md` + themes + fonts split, style, and TYPESET correctly
 * in ANY Marp tool. The generated marp.config.cjs sets `html: true` — without it
 * marp-core escapes the deck's trailing runtime <script> tags into visible text
 * and the runtime never loads, so Mermaid and every JS-driven structural
 * component (split panels, the chart family) come out as bare markdown. WITH it,
 * marp-cli's own headless browser runs the runtime while rendering, so `npm run
 * pdf` / `npm run html` carry every component layout, the deck-wide registers, and
 * Mermaid — with the exceptions `lib/core/marp-fidelity.js` enumerates (printed
 * into the generated README; not counted here, since the count moves). The marp-vscode PREVIEW pane carries less still: its
 * webview does not execute the deck's scripts, so it shows palette + CSS layout
 * only (also documented in the generated README).
 * Exit 0 on success, 1 on usage/IO error.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { bakeSplits } = require('../lib/core/bake-splits');
const { liftImageBgImages } = require('../lib/core/bg-image');
const { appendAutoGlossary } = require('../lib/core/glossary-auto.mjs');
const { isKnownOverflowMarker } = require('../lib/core/resolve-overflow-marker');
const {
  STATIC_ASSETS, AGENT_ASSETS, fontAssetsFor, marpScopableCss, MARP_CONFIG_CJS, withRuntimeScripts, packageJson,
  safeName, vscodeSettings, readme, agentsMd, resolveExportOverflowMarker, OVERFLOW_MARKER_LEVELS,
} = require('../lib/core/marp-bundle');

const ROOT = path.join(__dirname, '..');

function die(msg) { console.error(`export-marp: ${msg}`); process.exit(1); }

/** Read the deck's `theme:` front-matter palette, or null. */
function readTheme(src) {
  const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!m) return null;
  const t = m[1].match(/^\s*theme:\s*["']?([A-Za-z0-9_-]+)["']?\s*$/m);
  return t ? t[1].trim() : null;
}

/**
 * Copy one local file reference into <dest>/assets and return its new relative
 * path, or null when there is nothing to copy (a remote URL, or a dangling ref —
 * left as authored). `copied` is the caller's dedupe map, shared across every
 * reference in the deck so the same file is copied once and a same-named
 * DIFFERENT file can't clobber it.
 */
function localizeOne(url, deckDir, destDir, copied) {
  if (/^(https?:|data:|\/\/)/i.test(url)) return null;
  // `decodeURI` THROWS on a lone `%` — and `logo: assets/logo-50%.png` is an
  // ordinary filename a designer produces. Unhandled, it killed the export with a
  // URIError after the bundle directory had already been created, leaving a
  // half-written bundle behind. An undecodable ref is treated as authored.
  let decoded;
  try { decoded = decodeURI(url); } catch (_e) { decoded = url; }
  const abs = path.resolve(deckDir, decoded);
  // `isFile` rather than `existsSync`: `logo: .` resolved to a DIRECTORY and
  // `copyFileSync` threw EISDIR, same half-written-bundle outcome.
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) return null;
  const existing = copied.get(abs);
  if (existing) return existing;
  const assetsDir = path.join(destDir, 'assets');
  fs.mkdirSync(assetsDir, { recursive: true });
  let base = path.basename(abs);
  while (fs.existsSync(path.join(assetsDir, base)) && [...copied.values()].indexOf(`assets/${base}`) < 0) {
    base = `_${base}`;
  }
  fs.copyFileSync(abs, path.join(assetsDir, base));
  const rel = `assets/${base}`;
  copied.set(abs, rel);
  // Name what was copied and WHERE IT CAME FROM. A deck's asset refs are paths,
  // and a path can point anywhere the exporting user can read — `logo:
  // ../.ssh/id_rsa` copies that file into a bundle they then forward. The
  // traversal predates front matter becoming a channel for it (a body
  // `![](../../secret)` did the same), and confining it would break the repo's own
  // decks, which legitimately reach out of their directory
  // (`logo: ../lib/base/_logo/acme-logo.svg`). What was missing is that the
  // summary said "assets: 1" and nothing else, so an unexpected file was
  // invisible. Now every copy is on stdout beside its resolved source.
  console.log(`  asset: ${path.relative(process.cwd(), abs)} → ${rel}`);
  return rel;
}

/**
 * Localize local image references into assets/ and rewrite their paths. Handles
 * Markdown images `![alt](path)` / `![bg ...](path)`; leaves remote URLs
 * (http/https/data:) untouched. Copies each unique local file into <dest>/assets.
 */
function localizeAssets(body, deckDir, destDir, copied = new Map()) {
  const out = body.replace(/(!\[[^\]]*\]\()([^)\s]+)(\s*(?:"[^"]*")?\))/g, (full, pre, url, post) => {
    const rel = localizeOne(url, deckDir, destDir, copied);
    return rel ? `${pre}${rel}${post}` : full;
  });
  return { body: out, count: copied.size };
}

/**
 * Localize the asset a FRONT-MATTER register points at — today just `logo:`.
 *
 * Markdown image refs were localized from the start; front matter was not, so a
 * deck with `logo: brand/mark.svg` exported a bundle whose logo was a broken
 * image on every slide. That was invisible while the register itself never
 * survived the export at all; now that the baked front matter carries it, the
 * file has to come along too.
 */
function localizeFrontMatter(fm, deckDir, destDir, copied) {
  // The bound here must not be TIGHTER than the readers', or the exporter skips a
  // ref the runtime then resolves — a 404 logo on every slide. Both
  // lib/runtime/index.js and the engine's `readDeckLogoFrontMatter` read
  // `^[ \t]*logo:[ \t]*["']?(.*?)["']?[ \t]*$`, so this matches the same shape,
  // including a value the reader would take verbatim (a trailing `# comment` is
  // part of the value to both, so it is left alone here too — and then simply
  // doesn't resolve, exactly as it doesn't for the reader).
  return fm.replace(/^([ \t]*logo:[ \t]*["']?)([^"'\r\n]+?)(["']?[ \t]*)$/m, (full, pre, url, post) => {
    const rel = localizeOne(url.trim(), deckDir, destDir, copied);
    return rel ? `${pre}${rel}${post}` : full;
  });
}

function copyInto(srcAbs, destAbs) {
  fs.mkdirSync(path.dirname(destAbs), { recursive: true });
  fs.copyFileSync(srcAbs, destAbs);
}

/**
 * Copy a stylesheet through `marpScopableCss` — the leading-`:is()` distribution
 * marp-core's scoper needs (see lib/core/marp-bundle.js). Every CSS file in the
 * bundle goes through it: lattice.css AND each palette, since a palette can lead
 * a rule with the same dual-surface head.
 */
function copyCssInto(srcAbs, destAbs) {
  fs.mkdirSync(path.dirname(destAbs), { recursive: true });
  fs.writeFileSync(destAbs, marpScopableCss(fs.readFileSync(srcAbs, 'utf8')));
}

/**
 * Say — on the author's console, every export — which overflow policy the bundle
 * ships with and how to find out whether it will actually fire.
 *
 * WHY A DISCLOSURE AND NOT A MEASUREMENT. export-marp never renders: it bakes
 * source transforms and copies files, which is why it finishes in about a second.
 * Measuring overflow needs a real layout in a real browser, and the tool that
 * does that already exists — `lattice-emulator.js` prints the
 * "⚠ OVERFLOW — N slides … CLIPPED … pages X, Y" line from the same probe
 * (lib/core/overflow-probe.js) the runtime uses. So this line states what the
 * export KNOWS (the policy it just wrote) and names the command that knows the
 * rest, rather than implying a check it did not run (HARD RULE #23).
 *
 * `off` gets a louder line than the other two, because it is the only level where
 * the artifact itself will not tell anyone: a clipped slide looks finished.
 */
function printOverflowPolicy(marker, source, deckPath) {
  const WHAT = {
    author: 'the red ring, an "Overflows" tab, per-cell "Fix Me" overlays, and the type-floor alarm',
    reader: 'a calm "Content clipped" pill — the loss is stated plainly, with no QA chrome',
    off: 'nothing — a clipped slide will look finished',
  };
  console.log(`  overflow marker: ${marker} (${source}) — a reader sees ${WHAT[marker]}.`);
  if (marker === 'off') {
    console.warn('  ⚠ With `off`, this console is the ONLY channel that can tell you a slide clips,');
    console.warn('    and this export did not render, so it did not check.');
  }
  // Quoted: an unquoted `Q3 Board Review.md` printed a command that fails on its
  // first argument — the exact bug lib/core/marp-bundle.js's `safeName` records.
  console.log(`    export-marp does not render, so it cannot measure overflow. To check: `
    + `\`node lattice-emulator.js "${deckPath}" /tmp/check.pdf\` — it prints the clipped pages.`);
}

function main(argv) {
  // The agent kit (AGENTS.md + the component catalog) ships by DEFAULT so a
  // recipient's AI agent can extend the deck; `--no-agent` produces a lean,
  // Marp-only bundle.
  const includeAgent = !argv.includes('--no-agent');
  // `--overflow-marker=<level>` — this export's answer. `LATTICE_OVERFLOW_MARKER`
  // below is the standing one for this checkout. Neither reads the deck.
  const markerArgs = argv.filter((a) => a === '--overflow-marker' || a.startsWith('--overflow-marker='));
  const strayMarker = argv.find((a) => a.startsWith('--overflow-marker') && !markerArgs.includes(a));
  if (strayMarker) die(`unknown flag '${strayMarker}' (did you mean --overflow-marker=…?)`);
  if (markerArgs.length > 1) die('--overflow-marker given more than once');
  const markerFlag = markerArgs.length
    ? markerArgs[0].slice('--overflow-marker'.length).replace(/^=/, '')
    : null;
  const [deckPath, outArg, paletteArg] = argv.filter((a) => !a.startsWith('--'));
  if (!deckPath || !outArg) {
    die('usage: node tools/export-marp.js <deck.md> <out-dir-or-zip> [palette] [--no-agent] '
      + `[--overflow-marker=${OVERFLOW_MARKER_LEVELS.join('|')}]`);
  }
  if (markerFlag !== null && !isKnownOverflowMarker(markerFlag)) {
    die(`--overflow-marker must be one of ${OVERFLOW_MARKER_LEVELS.join(', ')} (got '${markerFlag}')`);
  }
  // The CLI's WORKSPACE-level answer — the standing choice for every export from
  // this checkout, where the Studio has a settings toggle beside `pdfPages`. An env
  // var rather than a config file: there is no lattice config format to add a key
  // to, and inventing one for a single setting is the larger change. A stale value
  // here falls back rather than dying (unlike the flag, which you just typed).
  const resolvedMarker = resolveExportOverflowMarker({
    chosen: markerFlag,
    workspace: process.env.LATTICE_OVERFLOW_MARKER ?? null,
  });
  const marker = resolvedMarker.marker;
  // Name the INPUT, not the abstract tier. `resolveExportOverflowMarker` speaks in
  // tiers because the Studio shares it, but the CLI has no "workspace" — printing
  // that word sent a reader looking for a setting this tool does not have.
  const markerSource = { 'this export': '--overflow-marker', 'workspace setting': 'LATTICE_OVERFLOW_MARKER' }[resolvedMarker.source]
    || resolvedMarker.source;
  for (const bad of resolvedMarker.ignored) {
    const where = bad.tier === 'this export' ? '--overflow-marker' : 'LATTICE_OVERFLOW_MARKER';
    console.warn(`  ⚠ ${where}='${bad.value}' ignored — ${bad.reason || `not one of ${OVERFLOW_MARKER_LEVELS.join(', ')}`}.`);
  }
  if (!fs.existsSync(deckPath)) die(`deck not found: ${deckPath}`);
  // Validate the agent-kit inputs UP FRONT (before writing anything), so a
  // missing catalog can't leave an orphaned bundle whose README/AGENTS.md
  // advertise an `agent/components.json` that was never written.
  if (includeAgent) {
    for (const { from } of AGENT_ASSETS) {
      if (!fs.existsSync(path.join(ROOT, from))) {
        die(`agent kit needs ${from} — run \`npm run build\` (or pass --no-agent)`);
      }
    }
  }

  const src = fs.readFileSync(deckPath, 'utf8');
  const palette = (paletteArg || readTheme(src) || 'indaco').toLowerCase();
  const name = path.basename(deckPath).replace(/\.md$/i, '');
  // Every PATH in the bundle — the directory, the deck file, and the commands the
  // generated package.json/README name it with — uses the sanitized slug, so a
  // deck title with a space can't produce a `marp My Deck.md …` script that fails
  // on its first argument. The raw `name` survives in README/AGENTS prose only.
  const file = safeName(name);
  const wantZip = /\.zip$/i.test(outArg);
  const workRoot = wantZip ? fs.mkdtempSync(path.join(require('os').tmpdir(), 'export-marp-')) : path.resolve(outArg);
  const dest = path.join(workRoot, file);
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });

  // 1) bake the SOURCE transforms the recipient's Marp will never run — the
  //    auto-glossary's generated slide first (it appends a whole slide and
  //    strips its own `glossary:` trigger, so it must precede the split bake),
  //    then splits → literal `---`. Both are idempotent and self-contained, so
  //    the emitted `.md` renders identically on any Marp tool and stays editable.
  //    Without the glossary bake the exported deck silently lost the generated
  //    Glossary slide while the slide before it still announced it (#1256).
  const glossed = appendAutoGlossary(src);
  const glossedFm = glossed.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n/);
  const deckDir = path.dirname(path.resolve(deckPath));
  const copied = new Map(); // one dedupe map across body + front-matter refs
  const rawBody = glossedFm ? glossed.slice(glossedFm[0].length) : glossed;
  const localized = localizeAssets(rawBody, deckDir, dest, copied);
  // 2) the imagery bucket's `![bg]` → `.lattice-bg` panel, on the UNSPLIT body — the
  //    exact position the engine lifts at (lib/engine/index.js, before parsing).
  //    Ordering is load-bearing in BOTH directions:
  //      · AFTER localization, so the URL it embeds is the bundle's own `assets/…`
  //        path rather than the author's (a panel pointing at a file the bundle
  //        doesn't carry is the same defect as an un-localized `logo:`).
  //      · BEFORE bakeSplits, because the lift needs the `_class: …image…` comment
  //        and the `![bg]` in the SAME slide part. Once heading boundaries are
  //        literal `---`, an image slide with TWO top-level headings has its
  //        `_class` in the first part and its `![bg]` in the second — so the lift
  //        silently skipped it and Marp's advanced-background machinery took the
  //        image: photo full-bleed, prose unscrimmed on top, i.e. exactly the defect
  //        this bake exists to prevent, on the deck shape most likely to hit it.
  const withImagePanels = liftImageBgImages(localized.body, undefined);
  // 3) splits → literal `---`, LAST of the source bakes, so it sees the final body.
  //    (The glossary bake had to precede it too: it appends a whole slide and strips
  //    its own `glossary:` trigger.) Both are idempotent and self-contained, so the
  //    emitted `.md` renders identically on any Marp tool and stays editable.
  const baked = bakeSplits((glossedFm ? glossedFm[0] : '') + withImagePanels);
  const fmMatch = baked.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n/);
  const localizedFm = fmMatch ? localizeFrontMatter(fmMatch[0], deckDir, dest, copied) : '';
  const bakedBody = fmMatch ? baked.slice(fmMatch[0].length) : baked;
  const fm = localizedFm;
  // Append the runtime scripts + the baked front matter (the deck-wide registers
  // Marp strips and `fetch` can't recover over `file://`), so diagrams,
  // structural components, and the deck's own color mode / logo / meta all render
  // client-side when the deck is opened as HTML in a browser.
  fs.writeFileSync(
    path.join(dest, `${file}.md`),
    withRuntimeScripts(fm + bakedBody, { overflowMarker: marker }),
  );

  // 3) the deck's palette (+ -dark) under themes/, MINIFIED (from dist/themes/),
  //    under the readable `<palette>.css` name marp/VS Code register by @theme.
  const themeFiles = [`${palette}.css`, `${palette}-dark.css`];
  const bundledThemes = [];
  for (const f of themeFiles) {
    const min = path.join(ROOT, 'dist', 'themes', f.replace(/\.css$/, '.min.css'));
    if (fs.existsSync(min)) { copyCssInto(min, path.join(dest, 'themes', f)); bundledThemes.push(`themes/${f}`); }
  }
  if (!bundledThemes.length) die(`unknown palette '${palette}' — no dist/themes/${palette}.min.css (run \`npm run build\`)`);
  const themesList = ['lattice.css', ...bundledThemes];

  // 4) the shared static assets — minified stylesheet (→ lattice.css), runtime,
  //    and mermaid. No engine: the bundle is rendered with Marp, not Lattice.
  for (const { from, to } of STATIC_ASSETS) {
    const abs = path.join(ROOT, from);
    if (!fs.existsSync(abs)) continue;
    if (to.endsWith('.css')) copyCssInto(abs, path.join(dest, to));
    else copyInto(abs, path.join(dest, to));
  }

  // 4b) the font supply — every `url(fonts/<file>)` the bundled stylesheet
  //     references, copied to fonts/ beside it. Derived from the stylesheet we
  //     just wrote (fontAssetsFor) rather than a second list, so it cannot drift
  //     from what the CSS actually asks for. Without it the @font-face srcs 404
  //     and the deck falls back to system serif/sans on every slide.
  const bundledCss = path.join(dest, 'lattice.css');
  let fontCount = 0;
  if (fs.existsSync(bundledCss)) {
    for (const { from, to } of fontAssetsFor(fs.readFileSync(bundledCss, 'utf8'))) {
      const abs = path.join(ROOT, from);
      if (fs.existsSync(abs)) { copyInto(abs, path.join(dest, to)); fontCount += 1; }
    }
  }

  // 5) generated text files (from the shared bundle spec): marp-cli config,
  //    package.json, .vscode/settings.json (Marp VS Code theme registration),
  //    and the README.
  fs.writeFileSync(path.join(dest, 'marp.config.cjs'), MARP_CONFIG_CJS);
  fs.writeFileSync(path.join(dest, 'package.json'), JSON.stringify(packageJson(name), null, 2) + '\n');
  fs.mkdirSync(path.join(dest, '.vscode'), { recursive: true });
  fs.writeFileSync(path.join(dest, '.vscode', 'settings.json'), vscodeSettings(themesList));
  fs.writeFileSync(path.join(dest, 'README.md'), readme({ name, palette, themes: themesList, agent: includeAgent, overflowMarker: marker }));

  // 6) the agent kit (default on): a bundle-tailored AGENTS.md at the root +
  //    the component catalog under agent/, so a recipient's AI agent can extend
  //    the deck with full Lattice knowledge (capacity included).
  if (includeAgent) {
    let version;
    try { version = require(path.join(ROOT, 'package.json')).version; } catch { version = undefined; }
    fs.writeFileSync(path.join(dest, 'AGENTS.md'), agentsMd({ name, version }));
    // Inputs were validated up front, so every entry exists here.
    for (const { from, to } of AGENT_ASSETS) copyInto(path.join(ROOT, from), path.join(dest, to));
  }

  let result = dest;
  if (wantZip) {
    const zipAbs = path.resolve(outArg);
    fs.rmSync(zipAbs, { force: true });
    fs.mkdirSync(path.dirname(zipAbs), { recursive: true });
    execFileSync('zip', ['-rq', zipAbs, file], { cwd: workRoot });
    fs.rmSync(workRoot, { recursive: true, force: true });
    result = zipAbs;
  }
  console.log(`export-marp: wrote ${result}`);
  console.log(
    `  deck: ${file}.md (splits baked) · palette: ${palette} · assets: ${localized.count} · fonts: ${fontCount}`,
  );
  printOverflowPolicy(marker, markerSource, deckPath);
  return 0;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));
module.exports = { localizeAssets, localizeFrontMatter, readTheme };
