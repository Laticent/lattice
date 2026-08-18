#!/usr/bin/env node
/**
 * Verify the Studio's derived syntax ink tier against the REAL built Studio — every
 * rendered token color compared for equality with its palette-mode's own emitted token.
 *
 * COMMITTED RATHER THAN LEFT IN .scratch/ because this is the THIRD attempt at verifying
 * this exact surface and the first that works: #1703's two earlier passes were both wrong
 * (the palette silently never switched, so every row resolved to cuoio). The four traps
 * below are what took the time, and none of them is guessable — the point of keeping this
 * is that the next person does not rediscover them. See engineering/capabilities.md.
 *
 * Not a harness and not jsdom: `astro preview` serving the actual built docs site, a real
 * Chromium, the real Fabricate → Component → "Component CSS" field (which is where
 * `studioHighlight` actually renders — see the note below), driven through the real topbar
 * Theme MENU and the real dark-mode button.
 *
 * WHERE studioHighlight ACTUALLY RENDERS, because I got this wrong first and it matters:
 * `CodeField` (CodeField.tsx:69), reached at Craft → Fabricate → Component. That is the
 * surface this file drives.
 *
 * UPDATED BY #1715: the deck editor renders it TOO, and did not when this was written.
 * `Editor.tsx` composed `markdown()` + `editorTheme` and NO `syntaxHighlighting(...)`
 * extension at all, so the deck source was bare text nodes with zero token spans — which is
 * how a verification pointed at it would have measured nothing while reporting a pass, and
 * is why this run asserts a span COUNT before it asserts any color. #1715 installed the
 * extension there (measured on the real built Studio: 7 token spans in 2 distinct colors,
 * headings on --syntax-keyword-ink and `_class:` directives on --text-muted). This file
 * still drives CodeField, because the equality comparisons below need a CSS document whose
 * token roles are unambiguous; the deck editor is Markdown and does not paint every role.
 *
 * WHY EVERY ASSERTION IS AN EQUALITY. "the string is some color" passes when the palette
 * never switched — the exact way a previous verification of this surface was wrong twice
 * (#1703). So for every palette x mode, each token span's COMPUTED color is compared to
 * that palette-mode's own emitted `--syntax-*-ink` value, parsed out of the committed
 * `lattice-tokens.generated.css` rather than recomputed with the producer's own function.
 * A palette that silently never switched makes 17 of 18 rows mismatch.
 *
 * `--bite` flips one expected value to prove the run can fail.
 *
 * THE FULL LOOP, because it needs a served build and nothing else will do:
 *
 *   cd docs && npm run build && npx astro preview --port 4321 --host 127.0.0.1 &
 *   node tools/verify-studio-syntax.js --shots
 *
 * Flags:
 *   --shots            write a PNG of the real field per palette-mode to .scratch/shots/
 *   --only <a,b,c>     restrict to named palettes (ids, e.g. `a11y-tritanopia`)
 *   --bite             flip one expected value; the run MUST then fail (self-test)
 *   STUDIO_URL=…       point at a different origin (default http://127.0.0.1:4321)
 */
const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer');
const { resolveChrome } = require('./lib/resolve-chrome');

const ROOT = path.join(__dirname, '..');
const BASE = process.env.STUDIO_URL || 'http://127.0.0.1:4321';
const argv = process.argv.slice(2);
const BITE = argv.includes('--bite');
const SHOTS = argv.includes('--shots');
// `--only` needs its argument. Bare `--only` used to read `undefined` and throw a TypeError at
// module load, before any of the setup below — an unhelpful crash for a plain typo.
const ONLY = argv.includes('--only') ? String(argv[argv.indexOf('--only') + 1] ?? '').split(',').map((x) => x.trim()).filter(Boolean) : null;
if (ONLY && !ONLY.length) {
  console.error('--only needs a comma-separated palette list, e.g. --only indaco,cuoio');
  process.exit(2);
}
const SHOT_DIR = path.join(ROOT, '.scratch', 'shots');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Expected values, parsed from the committed generated stylesheet. */
function expectedTokens() {
  const css = fs.readFileSync(path.join(ROOT, 'docs', 'src', 'styles', 'lattice-tokens.generated.css'), 'utf8');
  const out = {};
  for (const m of css.matchAll(/html\[data-palette="([^"]+)"\]\[data-mode="(light|dark)"\]\{([^}]*)\}/g)) {
    const set = {};
    for (const d of m[3].matchAll(/--([a-z0-9-]+):([^;]+);/g)) set[d[1]] = d[2].trim();
    out[`${m[1]}/${m[2]}`] = set;
  }
  return out;
}

/** #abc → #aabbcc, lowercased. `--text-heading` is `#000` on the a11y palettes, and a
 *  6-digit-only parser fails the COMPARISON rather than the product. */
function hex(v) {
  const s = String(v).trim().toLowerCase();
  const m = /^#([0-9a-f]{3})$/.exec(s);
  return m ? `#${m[1].split('').map((c) => c + c).join('')}` : s;
}
function rgbToHex(rgb) {
  const m = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/.exec(String(rgb));
  return m ? `#${[1, 2, 3].map((i) => Number(m[i]).toString(16).padStart(2, '0')).join('')}` : String(rgb);
}

// CSS exercising every role the tier owns, plus the neighbors it must stay clear of.
const PROBE = `section.ink-probe {
  /* a comment: de-emphasized on purpose */
  color: var(--accent);
  content: "a string literal";
  padding: 42px;
  opacity: 0.85;
}`;

const ROLES = [
  { name: 'string', token: 'syntax-string-ink', text: '"a string literal"' },
  // CSS lexes `42px` as ONE token (number + unit), which is why the predicate matches the
  // whole lexeme rather than `42` — the first cut looked for '42' and found nothing.
  { name: 'number', token: 'syntax-number-ink', text: '42px' },
  // THE KEYWORD INK NEEDS ITS OWN RENDERED ASSERTION, and the first cut had none — which
  // left the change's headline repair (mustard/light `--accent` 3.89 -> 4.65) verified only
  // as a CSS variable, never as a painted pixel. `section` is a CSS tagName, so it renders
  // through studioHighlight's `[t.tagName, t.heading]` row.
  { name: 'keyword', token: 'syntax-keyword-ink', text: 'section' },
  // NOT part of the tier, and measured for exactly that reason: a rendered comment is how we see
  // that the row this change deliberately LEAVES on `--text-muted` still resolves to
  // `--text-muted`. A `muted` role was added to the tier and reverted — see editor-theme.ts — so
  // this assertion is what stops it drifting back in unnoticed.
  { name: 'comment', token: 'text-muted', text: '/* a comment' },
];

/** The tier tokens whose DOCUMENT value is compared to the file, per palette-mode. */
const SYNTAX_TOKENS = ['syntax-string-ink', 'syntax-number-ink', 'syntax-keyword-ink'];

async function clickLabel(page, label, idx = 0) {
  const hs = await page.$$(`[aria-label="${label}"]`);
  const h = hs[idx];
  if (!h) return false;
  const bx = await h.boundingBox();
  if (!bx) return false;
  await page.mouse.click(bx.x + bx.width / 2, bx.y + bx.height / 2);
  await sleep(1400);
  return true;
}

/** THE THEME BUTTON IS AMBIGUOUS THREE WAYS, and getting it wrong is silent.
 *  `aria-label="Theme"` is carried by (a) the topbar palette MENU — the one we want,
 *  (b) Fabricate's own "Theme" TAB, and (c) the pre-paint skeleton's decoy, which opens
 *  nothing. The first cut clicked each in turn until a menu appeared; that clicked
 *  Fabricate's tab on the way, which navigates OFF the Component panel and destroys the
 *  CSS field being measured — the run then failed on the next palette with a misleading
 *  "decoy" message. So: pick by POSITION (the topbar sits at the top of the viewport),
 *  confirm a menu opened, and cache the coordinates once it has.
 */
let themeAt = null;
async function openThemeMenu(page) {
  if (themeAt) {
    await page.mouse.click(themeAt.x, themeAt.y);
    await sleep(450);
    if (await page.evaluate(() => document.querySelectorAll('[role="menuitem"]').length > 0)) return true;
    themeAt = null; // layout moved — fall through and re-find
  }
  const candidates = await page.evaluate(() =>
    [...document.querySelectorAll('[aria-label="Theme"]')]
      .map((el) => { const b = el.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })
      .filter((c) => c.y > 0 && c.y < 120)          // topbar only — never Fabricate's tab
      .sort((a, b) => a.y - b.y));
  for (const c of candidates) {
    await page.mouse.click(c.x, c.y);
    await sleep(450);
    if (await page.evaluate(() => document.querySelectorAll('[role="menuitem"]').length > 0)) { themeAt = c; return true; }
  }
  return false;
}

async function main() {
  const expected = expectedTokens();
  let palettes = [...new Set(Object.keys(expected).map((k) => k.split('/')[0]))];
  if (palettes.length < 18) throw new Error(`parsed only ${palettes.length} palettes — broken parse of the generated CSS`);
  if (ONLY) {
    const unknown = ONLY.filter((p) => !palettes.includes(p));
    if (unknown.length) throw new Error(`--only names ${unknown.length} palette(s) that do not exist: ${unknown.join(', ')}`);
    palettes = palettes.filter((p) => ONLY.includes(p));
  }

  const browser = await puppeteer.launch({
    executablePath: resolveChrome(),
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
    defaultViewport: { width: 1600, height: 1000 },
  });
  const page = await browser.newPage();

  await page.goto(`${BASE}/studio/`, { waitUntil: 'networkidle2', timeout: 90_000 });
  await page.waitForSelector('.cm-content', { timeout: 90_000 });
  await sleep(12_000); // React hydration — the skeleton's controls are decoys until this lands

  // Craft exposes the real topbar Theme menu + mode button (Write mode hides both).
  if (!(await clickLabel(page, 'Craft — every panel'))) throw new Error('no Craft tab — the topbar never hydrated');

  // Fabricate → Component → the CodeField that studioHighlight actually paints.
  await page.keyboard.down('Control'); await page.keyboard.press('KeyK'); await page.keyboard.up('Control');
  await sleep(1300);
  const fab = await page.evaluate(() => {
    const h = [...document.querySelectorAll('[cmdk-item],[role="option"]')].find((e) => /Fabricate/i.test(e.textContent || ''));
    if (!h) return null;
    const b = h.getBoundingClientRect();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  });
  if (!fab) throw new Error('no Fabricate entry in the command menu');
  await page.mouse.click(fab.x, fab.y);
  await sleep(3000);
  if (!(await clickLabel(page, 'Component'))) throw new Error('no Component tab in Fabricate');
  await sleep(2000);

  const field = await page.$('[aria-label="Component CSS"]');
  if (!field) throw new Error('no "Component CSS" field — studioHighlight has no live surface to measure');
  await field.click();
  await page.keyboard.down('Control'); await page.keyboard.press('KeyA'); await page.keyboard.up('Control');
  await page.keyboard.press('Backspace');
  await page.type('[aria-label="Component CSS"]', PROBE, { delay: 0 });
  await sleep(1500);

  // A run that measures unhighlighted text cannot fail honestly. Prove the spans exist
  // BEFORE trusting any computed color.
  const spans = await page.evaluate(() => {
    const host = document.querySelector('[aria-label="Component CSS"]');
    return host ? host.querySelectorAll('span').length : -1;
  });
  if (spans < 5) throw new Error(`the CSS field produced ${spans} token spans — nothing was highlighted`);
  console.log(`probe tokenized: ${spans} spans in the real CodeField`);

  const rows = [];
  const failures = [];
  let rendered = 0;   // computed color of a real painted span vs the file
  let declared = 0;   // the document's own custom-property value vs the file

  for (const palette of palettes) {
    if (!(await openThemeMenu(page))) throw new Error(`the Theme MENU never opened (at ${palette}) — a decoy control was clicked`);
    // The menu shows DISPLAY names, not palette ids: `a11y-deuteranopia` is listed as
    // "Deuteranopia". An exact-id match silently found nothing for all four a11y palettes,
    // and the run reported "no menuitem for it" rather than measuring them — a hole that
    // would have left the one group whose seed choice this change is really about UNVERIFIED.
    const item = await page.evaluate((name) => {
      const want = name.replace(/^a11y-/, '').toLowerCase();
      const hit = [...document.querySelectorAll('[role="menuitem"]')]
        .find((el) => (el.textContent || '').trim().toLowerCase() === want);
      if (!hit) return null;
      const b = hit.getBoundingClientRect();
      return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    }, palette);
    if (!item) { await page.keyboard.press('Escape'); failures.push(`${palette}: no menuitem for it`); continue; }
    await page.mouse.click(item.x, item.y);
    await sleep(600);

    const applied = await page.evaluate(() => document.documentElement.getAttribute('data-palette'));
    if (applied !== palette) throw new Error(`palette did not switch: asked ${palette}, document says ${applied}`);

    for (const mode of ['light', 'dark']) {
      // The REAL mode button, not an attribute poke — its label flips with state.
      const now = await page.evaluate(() => document.documentElement.getAttribute('data-mode'));
      if (now !== mode) {
        const wanted = mode === 'dark' ? 'Switch to dark mode' : 'Switch to light mode';
        if (!(await clickLabel(page, wanted))) throw new Error(`no "${wanted}" button`);
        await sleep(500);
        const after = await page.evaluate(() => document.documentElement.getAttribute('data-mode'));
        if (after !== mode) throw new Error(`mode did not switch to ${mode} (document says ${after})`);
      }

      const key = `${palette}/${mode}`;
      const want = expected[key];
      if (!want) throw new Error(`no expected block for ${key}`);

      // The field must still be mounted. A stray click that navigates off the Component
      // panel would otherwise turn every later comparison into "the span never rendered",
      // which reads as a product failure instead of a harness one.
      if (!(await page.$('[aria-label="Component CSS"]'))) throw new Error(`${key}: the Component CSS field is gone — the harness navigated away`);
      const got = await page.evaluate(() => {
        const host = document.querySelector('[aria-label="Component CSS"]');
        const spans = [...host.querySelectorAll('span')];
        const pick = (pred) => { const el = spans.find(pred); return el ? getComputedStyle(el).color : null; };
        const cs = getComputedStyle(document.documentElement);
        return {
          string: pick((el) => el.textContent === '"a string literal"'),
          number: pick((el) => /^(42px|42|0\.85)$/.test(el.textContent || '')),
          keyword: pick((el) => el.textContent === 'section'),
          comment: pick((el) => (el.textContent || '').startsWith('/* a comment')),
          tokens: {
            'syntax-string-ink': cs.getPropertyValue('--syntax-string-ink').trim(),
            'syntax-number-ink': cs.getPropertyValue('--syntax-number-ink').trim(),
            'syntax-keyword-ink': cs.getPropertyValue('--syntax-keyword-ink').trim(),
          },
          bg: cs.getPropertyValue('--bg').trim(),
        };
      });

      for (const role of ROLES) {
        if (!got[role.name]) { failures.push(`${key} ${role.name}: the span never rendered`); continue; }
        let wantHex = hex(want[role.token]);
            // Bite EVERY role, not just the first: a self-test that only covers `string` proves
        // nothing about the keyword or number predicates, and a predicate that matches no
        // element is exactly the failure mode this run exists to rule out.
        if (BITE && palette === palettes[0] && mode === 'light') wantHex = '#010203';
        rendered += 1;
        const gotHex = hex(rgbToHex(got[role.name]));
        if (gotHex !== wantHex) failures.push(`${key} ${role.name}: rendered ${gotHex} != --${role.token} ${wantHex}`);
      }
      // The document's own token values must equal the committed file — catches a stale sheet.
      for (const tok of SYNTAX_TOKENS) {
        declared += 1;
        if (hex(got.tokens[tok]) !== hex(want[tok])) failures.push(`${key} --${tok}: document ${got.tokens[tok]} != file ${want[tok]}`);
      }
      rows.push({ key, bg: got.bg, ...got.tokens });

      if (SHOTS) {
        fs.mkdirSync(SHOT_DIR, { recursive: true });
        const el = await page.$('[aria-label="Component CSS"]');
        if (el) await el.screenshot({ path: path.join(SHOT_DIR, `syntax-${palette}-${mode}.png`) }).catch(() => {});
      }
    }
  }

  await browser.close();

  const checked = rendered + declared;
  console.log(
    `\n${checked} equality comparisons across ${rows.length} palette-modes on the real CodeField — ` +
      `${rendered} against the COMPUTED COLOR of a painted span, ${declared} against the document's own ` +
      `custom-property values. Both are compared to the committed generated stylesheet.\n`,
  );
  console.log(`${'palette/mode'.padEnd(27)} ${'--bg'.padEnd(9)} ${'string'.padEnd(9)} ${'number'.padEnd(9)} keyword`);
  for (const r of rows) {
    console.log(`${r.key.padEnd(27)} ${r.bg.padEnd(9)} ${r['syntax-string-ink'].padEnd(9)} ${r['syntax-number-ink'].padEnd(9)} ${r['syntax-keyword-ink']}`);
  }
  if (failures.length) {
    console.error(`\nFAIL — ${failures.length}:\n  ${failures.slice(0, 24).join('\n  ')}`);
    process.exit(1);
  }
  // ANTI-VACUOUS FLOOR — TWO ARMS, because one was not enough and the first cut had only the
  // weaker one.
  //
  // (a) A run that compared NOTHING is never a pass, whatever was asked for. `--only` with a
  //     name that is not a palette filtered `palettes` to [], the whole loop was skipped, and
  //     because the floor below was scoped to full runs the harness printed
  //     "PASS … (0 comparisons)" and exited 0. A typo was indistinguishable from a green run.
  // (b) A FULL run must make close to its whole expected count, and the threshold is derived
  //     rather than hardcoded. A literal decays: 200 was 93% of the then-expected 216 and
  //     silently became 79% when the run grew to 252, so losing a fifth of the DOM grip would
  //     have passed. `EXPECTED_FULL` is computed from what this run actually intends to
  //     compare, and one whole role's predicate matching nothing on every palette drops below
  //     it instead of coasting over.
  const PER_MODE = ROLES.length + SYNTAX_TOKENS.length;
  const EXPECTED_FULL = palettes.length * 2 * PER_MODE;
  if (checked === 0) {
    console.error('\nFAIL — 0 comparisons. Nothing was measured, so this is not a pass.');
    process.exit(1);
  }
  if (!ONLY && checked < EXPECTED_FULL) {
    console.error(`\nFAIL — a full run made only ${checked} of the expected ${EXPECTED_FULL} comparisons; that is a broken run, not a pass.`);
    process.exit(1);
  }
  console.log(
    `\nPASS — every rendered token color equals its own palette-mode's emitted token value ` +
      `(${checked} comparisons${ONLY ? `, SUBSET: ${ONLY.join(',')} — not a full run` : ''}).`,
  );
}

if (require.main === module) {
  main().catch((e) => {
    console.error('ERROR:', e.message);
    process.exit(1);
  });
}
module.exports = { deriveExpected: expectedTokens, hex, rgbToHex, main };
