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
 *                            local image paths localized into assets/, runtime
 *                            <script> tags (mermaid + lattice-runtime) appended
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
 *
 * Fidelity: the baked `.md` + themes + fonts split, style, and TYPESET correctly
 * in ANY Marp tool. The generated marp.config.cjs sets `html: true` — without it
 * marp-core escapes the deck's trailing runtime <script> tags into visible text
 * and the runtime never loads, so Mermaid and every JS-driven structural
 * component (split panels, the chart family) come out as bare markdown. WITH it,
 * marp-cli's own headless browser runs the runtime while rendering, so `npm run
 * pdf` / `npm run html` are full fidelity. The marp-vscode PREVIEW pane is not:
 * its webview does not execute the deck's scripts, so it shows palette + CSS
 * layout only (documented in the generated README).
 * Exit 0 on success, 1 on usage/IO error.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { bakeSplits } = require('../lib/core/bake-splits');
const {
  STATIC_ASSETS, AGENT_ASSETS, fontAssetsFor, marpScopableCss, MARP_CONFIG_CJS, withRuntimeScripts, packageJson,
  vscodeSettings, readme, agentsMd,
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
 * Localize local image references into assets/ and rewrite their paths. Handles
 * Markdown images `![alt](path)` / `![bg ...](path)`; leaves remote URLs
 * (http/https/data:) untouched. Copies each unique local file into <dest>/assets.
 */
function localizeAssets(body, deckDir, destDir) {
  const assetsDir = path.join(destDir, 'assets');
  const copied = new Map(); // original resolved path -> assets/<base>
  const isRemote = (u) => /^(https?:|data:|\/\/)/i.test(u);
  const out = body.replace(/(!\[[^\]]*\]\()([^)\s]+)(\s*(?:"[^"]*")?\))/g, (full, pre, url, post) => {
    if (isRemote(url)) return full;
    const abs = path.resolve(deckDir, decodeURI(url));
    if (!fs.existsSync(abs)) return full; // leave dangling refs as-is (warned below)
    let rel = copied.get(abs);
    if (!rel) {
      fs.mkdirSync(assetsDir, { recursive: true });
      let base = path.basename(abs);
      while (fs.existsSync(path.join(assetsDir, base)) && [...copied.values()].indexOf(`assets/${base}`) < 0) {
        base = `_${base}`; // avoid clobbering a same-named different file
      }
      fs.copyFileSync(abs, path.join(assetsDir, base));
      rel = `assets/${base}`;
      copied.set(abs, rel);
    }
    return `${pre}${rel}${post}`;
  });
  return { body: out, count: copied.size };
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

function main(argv) {
  // The agent kit (AGENTS.md + the component catalog) ships by DEFAULT so a
  // recipient's AI agent can extend the deck; `--no-agent` produces a lean,
  // Marp-only bundle.
  const includeAgent = !argv.includes('--no-agent');
  const [deckPath, outArg, paletteArg] = argv.filter((a) => !a.startsWith('--'));
  if (!deckPath || !outArg) {
    die('usage: node tools/export-marp.js <deck.md> <out-dir-or-zip> [palette] [--no-agent]');
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
  const wantZip = /\.zip$/i.test(outArg);
  const workRoot = wantZip ? fs.mkdtempSync(path.join(require('os').tmpdir(), 'export-marp-')) : path.resolve(outArg);
  const dest = path.join(workRoot, name);
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });

  // 1) bake splits → literal `---`, then 2) localize local images.
  const baked = bakeSplits(src);
  const fmMatch = baked.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n/);
  const fm = fmMatch ? fmMatch[0] : '';
  const body = fmMatch ? baked.slice(fm.length) : baked;
  const localized = localizeAssets(body, path.dirname(path.resolve(deckPath)), dest);
  // Append the runtime scripts so diagrams + structural components render
  // client-side when the deck is opened as HTML in a browser.
  fs.writeFileSync(path.join(dest, `${name}.md`), withRuntimeScripts(fm + localized.body));

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
  fs.writeFileSync(path.join(dest, 'README.md'), readme({ name, palette, themes: themesList, agent: includeAgent }));

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
    execFileSync('zip', ['-rq', zipAbs, name], { cwd: workRoot });
    fs.rmSync(workRoot, { recursive: true, force: true });
    result = zipAbs;
  }
  console.log(`export-marp: wrote ${result}`);
  console.log(
    `  deck: ${name}.md (splits baked) · palette: ${palette} · assets: ${localized.count} · fonts: ${fontCount}`,
  );
  return 0;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));
module.exports = { localizeAssets, readTheme };
