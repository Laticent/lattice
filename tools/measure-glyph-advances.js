#!/usr/bin/env node
/**
 * Re-measure the per-glyph advance table `GLYPH_UPPER` against the shipped
 * woff2s, in a real headless Chromium, at the labels' real CSS.
 *
 * WHY THIS EXISTS. `lib/components/chart/_chart-family/svg-label.js` carries
 * GLYPH_UPPER: a per-glyph advance table, two faces, that decides how wide an
 * uppercase tracked chart label paints. It is a claim about specific font
 * BYTES, frozen as literals — and until `checkFontMetricsPin` landed, bumping
 * `assets/fonts/outfit-700.woff2` moved the painted width while the table sat
 * still and every gate stayed green. That pin now fails the build when a
 * pinned face's digest moves; this tool is the other half — the thing that
 * makes "re-measure" a command rather than an archaeology project.
 *
 * WHAT IT IS NOT. It does NOT write a generated artifact and is deliberately
 * NOT a `npm run build` step. Two reasons, and both are about gate honesty:
 *
 *   · `npm run build` today has ZERO browser dependency — no step of it
 *     launches Chromium. `build:check` is a pure, deterministic byte-diff that
 *     runs on every PR. A browser measurement inside it would make artifact
 *     freshness depend on the Chromium + HarfBuzz build that happens to be
 *     installed, so a CI browser bump could redden the gate with nothing wrong
 *     in the tree. A gate that fails for environmental reasons is the sibling
 *     defect of one that cannot fail at all.
 *   · The table is not a pure function of the font files anyway. Which
 *     characters get mapped is curated, `GLYPH_UPPER_MAX` is explicitly NOT
 *     derivable from the table (see its comment), and the round-up rule has a
 *     judgment step. A generator would emit most of the artifact and leave the
 *     load-bearing rest hand-authored beside it.
 *
 * So this follows the `tools/calibrate-*` precedent — browser-measured, run on
 * demand, prints evidence a human reads — not the `tools/derive-*` one.
 *
 * THE MEASUREMENT, and the five traps it exists to have already solved:
 *   · The fonts are served over LOCAL HTTP and `dist/lattice.css` is loaded, so
 *     the `@font-face` `url()`s resolve. A `file://` page will not resolve them.
 *   · `document.fonts.ready` is awaited AND both faces are explicitly
 *     `document.fonts.load()`ed, then verified with `document.fonts.check()`
 *     and an against-the-fallback width comparison. Skip that and you silently
 *     measure the system sans.
 *   · SPACE cannot be measured as `' '.repeat(20)` — SVG collapses a run of
 *     spaces. It is measured BY DIFFERENCE: `'X '.repeat(20) + 'X'` minus
 *     `'X'.repeat(21)`, over 20.
 *   · `letter-spacing` is held at 0. Tracking is additive per character and the
 *     CALLER supplies it, which is what lets one table serve all four tracked
 *     rules (0.04 / 0.06 / 0.08em).
 *   · Weight is 700 — `.quadrant-label` says 700, not the 600 an early draft of
 *     the original work assumed.
 *
 * THE ROUNDING is `nextStepUp`: the next multiple of 0.05 STRICTLY GREATER than
 * the measurement. Strictly, not "ceiling" — a measurement that already lands
 * on an exact multiple (the em-quad dashes paint a flat 2.00em and 3.00em)
 * takes the next step anyway, because equal leaves no float margin and reads as
 * a hair short. That round-up is the entire basis of the never-under-counts
 * property the table is built on.
 *
 * WHAT COUNTS AS A FAILURE is narrower than "the number moved", and
 * deliberately so — see `diffFace`. Only an UNDER-count fails: that is the one
 * direction that breaks the property the table exists to hold. A value above
 * the tightest step is reported as `loose` and never fails, because a cushion
 * can be deliberate and the tool has no standing to overrule it.
 *
 * IT ALSO REPORTS COVERAGE, which is the thing measurement alone hides. Five
 * table entries (`―`, `⸺`, `⸻`, `→`, `　`) are in NEITHER woff2, so their
 * widths belong to the HOST and no digest in this repo pins them. Measured
 * here, only `→` actually comes from a real fallback FACE (system-ui, 0.838em);
 * `―` `⸺` `⸻` `　` measure identically under system-ui, `sans-serif` and a
 * family that cannot exist, which means they are last-resort boxes rather than
 * typography — their 1.00 / 2.00 / 3.00em are the notdef advance, not a
 * measurement of any face that has those glyphs. The report says which entries
 * are pinned and which are not, rather than presenting all 65 as equal.
 *
 * Usage:
 *   node tools/measure-glyph-advances.js            # measure + diff the table
 *   node tools/measure-glyph-advances.js --check    # exit 1 if anything UNDER-counts
 *   node tools/measure-glyph-advances.js --json     # machine-readable
 *   node tools/measure-glyph-advances.js --strings  # also re-measure the test's
 *                                                   # MEASURED array (painted
 *                                                   # per-character advances)
 *
 * Never writes. It prints the tightest table for a human to paste, because the
 * curated parts around it (which characters are mapped, `GLYPH_UPPER_MAX`) are
 * decisions a measurement cannot make.
 */

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const {
  GLYPH_UPPER, GLYPH_UPPER_FONTS, GLYPH_UPPER_MAX,
} = require('../lib/components/chart/_chart-family/svg-label');

const ROOT = path.join(__dirname, '..');

const argv = process.argv.slice(2);
const has = (f) => argv.includes(`--${f}`);
const CHECK = has('check');
const JSON_OUT = has('json');
const WITH_STRINGS = has('strings');

// The nominal size everything is measured at. Large enough that
// getComputedTextLength()'s subpixel result carries plenty of significant
// digits, and the result is divided back out so the number is size-free.
const FS = 200;
// The two faces, as they resolve in the real rules. `--font-body` is Outfit on
// every theme; `mode: sketch` re-points it at Shantell Sans, which is why the
// hand face measures the same rule with a different family.
const FACE_FAMILY = { clean: 'Outfit', hand: 'Shantell Sans' };
// The token each face's stack comes from, read out of base.tokens.css rather
// than restated here — see `faceStacks()`.
const FACE_TOKEN = { clean: 'font-body', hand: 'sketch-font-body' };
// A family that cannot exist. Substituted for OUR face at the head of the real
// stack, it measures what the REST of the stack paints — which is how a glyph
// our woff2 does not contain is told apart from one it does.
const SENTINEL_FAMILY = 'LatticeNoSuchFaceXYZ';

/**
 * THE STACK MUST BE THE PRODUCT'S, NOT THE BARE FAMILY. This cost a wrong
 * result during development and is the subtlest trap in the file, so it is
 * mechanized rather than restated: measuring `font-family: "Outfit"` alone
 * sends every glyph Outfit lacks to Chromium's LAST-RESORT font, while the
 * shipped rule says `var(--font-body)` — `'Outfit', system-ui, sans-serif, …`
 * — so it lands on system-ui instead. The two disagree: `→` is in neither
 * woff2 and paints 1.000em under the last resort but 0.838em under system-ui.
 * A bare-family measurement therefore reports the table's (correct) 0.90 arrow
 * as an 11% UNDER-count that does not exist.
 *
 * So the stacks are read from `lib/base/base.tokens.css`, not restated here:
 * a theme re-pointing either token cannot leave this tool measuring the old one.
 */
function faceStacks() {
  const css = fs.readFileSync(path.join(ROOT, 'lib', 'base', 'base.tokens.css'), 'utf8');
  const out = {};
  for (const [face, token] of Object.entries(FACE_TOKEN)) {
    // Anchored on the token's own start. Unanchored, `--font-body` also matches
    // inside `--sketch-font-body`, so reordering those two declarations would
    // silently make the clean face read the sketch stack. (The `includes` guard
    // below would then throw, so it fails closed — but the regex should not be
    // relying on a second check to be correct.)
    const m = css.match(new RegExp(`(?:^|[\\s;{])--${token}\\s*:\\s*([^;]+);`, 'm'));
    if (!m) throw new Error(`--${token} not found in lib/base/base.tokens.css — the ${face} face's stack is unknown`);
    out[face] = m[1].trim();
    if (!out[face].includes(FACE_FAMILY[face])) {
      throw new Error(`--${token} no longer leads with ${FACE_FAMILY[face]} — GLYPH_UPPER.${face} measures the wrong face`);
    }
  }
  return out;
}

// The strings the unit suite's MEASURED array pins. Kept here so `--strings`
// re-derives the same rows rather than a different vocabulary.
const MEASURED_STRINGS = [
  'Wide moat', 'Emerging challengers', 'Operational maturity', 'Quick Wins',
  'Workflow', 'Maximum', 'Commitment', 'Strategic Bets', 'Time Sinks',
  'Illinois filling', 'Il Ili', 'MMMMMMMMMM', 'WWWWWWWWWW',
];
// `.quadrant-label`'s tracking — the rule the MEASURED array was recorded at.
const STRING_TRACKING = 0.04;

/** The next multiple of 0.05 STRICTLY GREATER than `x`. See the header. */
function nextStepUp(x) {
  return ((Math.floor(x / 0.05 + 1e-9) + 1) * 0.05);
}
const r2 = (n) => Number(n.toFixed(2));
const r4 = (n) => Number(n.toFixed(4));

// Where the probe page is served from. It has to come off the SAME server as
// the woff2s, not out of `page.setContent`: a font fetch is CORS-checked, and a
// setContent document has a null origin, so every `@font-face` load fails with
// a bare NetworkError and the page silently paints the system sans. Same origin
// is the whole reason this tool runs an HTTP server at all.
const PROBE_PATH = '/__glyph-probe.html';

/** Serve the repo root, so `/dist/lattice.css` resolves its own `fonts/*.woff2`. */
function serveRepo() {
  const TYPES = {
    '.css': 'text/css', '.woff2': 'font/woff2', '.html': 'text/html',
    '.js': 'text/javascript', '.json': 'application/json',
  };
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    if (url === PROBE_PATH) {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(PAGE());
      return;
    }
    const abs = path.join(ROOT, url.replace(/^\/+/, ''));
    // Never serve outside the repo, even though this only ever binds to loopback.
    if (!abs.startsWith(ROOT) || !fs.existsSync(abs) || fs.statSync(abs).isDirectory()) {
      res.writeHead(404).end('not found');
      return;
    }
    res.writeHead(200, { 'content-type': TYPES[path.extname(abs)] || 'application/octet-stream' });
    res.end(fs.readFileSync(abs));
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

const PAGE = () => `<!doctype html><meta charset="utf-8">
<link rel="stylesheet" href="/dist/lattice.css">
<style>
  /* .quadrant-label's own CSS, minus the tracking the CALLER adds. */
  svg text { font-weight: 700; text-transform: uppercase; letter-spacing: 0; }
</style>
<svg xmlns="http://www.w3.org/2000/svg" width="8000" height="400">
  <text id="probe" x="0" y="300" font-size="${FS}"></text>
</svg>`;

async function measure() {
  const puppeteer = require('puppeteer');
  const { server, port } = await serveRepo();
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH || undefined,
    // `--proxy-bypass-list` because a sandbox that exports HTTPS_PROXY otherwise
    // sends Chromium's loopback fetches to the proxy, which cannot serve them.
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--proxy-bypass-list=<-loopback>'],
  });
  try {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${port}${PROBE_PATH}`, { waitUntil: 'load' });

    // BOTH faces, explicitly. `document.fonts.ready` alone resolves as soon as
    // no load is PENDING — and a face nothing has asked for is never pending,
    // so it settles instantly against a face that was never fetched.
    const loaded = await page.evaluate(async (families, fs_) => {
      for (const fam of families) await document.fonts.load(`700 ${fs_}px "${fam}"`);
      await document.fonts.ready;
      return families.map((fam) => document.fonts.check(`700 ${fs_}px "${fam}"`));
    }, Object.values(FACE_FAMILY), FS);
    Object.values(FACE_FAMILY).forEach((fam, i) => {
      if (!loaded[i]) throw new Error(`face "${fam}" did not load — measuring it would return the fallback`);
    });

    // One evaluate per face: the real stack, and the same stack with our face
    // swapped out, so every probe carries both readings.
    const stacks = faceStacks();
    const out = {};
    for (const [face, family] of Object.entries(FACE_FAMILY)) {
      const chars = Object.keys(GLYPH_UPPER[face]);
      const stack = stacks[face];
      // The SAME stack, our face replaced by one that cannot exist — so what it
      // paints is exactly what the rest of the stack would paint.
      const esc = family.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const without = stack.replace(new RegExp(`'?"?${esc}'?"?`), `'${SENTINEL_FAMILY}'`);
      // A replacement that silently did nothing would leave our face in BOTH
      // stacks, so every glyph would measure identically and be reported as
      // "ours" — the coverage report would be uniformly wrong and say nothing
      // about it. Fail loudly instead.
      if (without === stack) {
        throw new Error(`could not remove "${family}" from the ${face} stack (${stack}) — coverage would be meaningless`);
      }
      out[face] = await page.evaluate(async (real, sans, glyphs, strings, fs_) => {
        const probe = document.getElementById('probe');
        const width = (stk, text) => {
          probe.style.fontFamily = stk;
          probe.textContent = text;
          return probe.getComputedTextLength();
        };

        // FACE-LOADED GUARD, the second arm. `fonts.check()` says the face is
        // available; this says it is the one actually being PAINTED. A run of
        // letters every face has must measure differently with ours removed.
        if (Math.abs(width(real, 'MWIL') - width(sans, 'MWIL')) < 0.01) {
          return { fellBack: true };
        }

        const adv = {};
        const fromFallback = {};
        for (const ch of glyphs) {
          if (ch === ' ') {
            // SVG COLLAPSES a run of spaces, so `' '.repeat(20)` measures ~one
            // space. Take the difference between an alternating run and the
            // same glyph count with no spaces.
            adv[ch] = (width(real, `${'X '.repeat(20)}X`) - width(real, 'X'.repeat(21))) / 20 / fs_;
            fromFallback[ch] = false;
            continue;
          }
          const run = ch.repeat(20);
          const ours = width(real, run);
          adv[ch] = ours / 20 / fs_;
          // Identical with our face removed ⇒ this glyph never came from our
          // woff2. Its width is a property of the HOST's fonts, which no digest
          // in this repo pins — see the report.
          fromFallback[ch] = Math.abs(ours - width(sans, run)) < 0.01;
        }
        const perString = {};
        for (const s of strings) perString[s] = width(real, s.toUpperCase()) / s.length / fs_;
        return { fellBack: false, adv, fromFallback, perString };
      }, stack, without, chars, WITH_STRINGS ? MEASURED_STRINGS : [], FS);

      if (out[face].fellBack) {
        throw new Error(`face "${family}" measured identically to a stack without it — the page fell back`);
      }
      out[face].stack = stack;
    }
    return out;
  } finally {
    await browser.close();
    server.close();
  }
}

/**
 * Compare a face's fresh measurements against the committed table.
 *
 * THE THREE GRADES ARE NOT THE SAME DEFECT, so they are not one "drift" count:
 *
 *   under — the table bills LESS than the glyph paints. This is the only real
 *           failure. It breaks the never-short property outright: the line runs
 *           past the width it was measured against, and `deCollideLabels` gets
 *           handed a box narrower than the painted glyphs, so a neighboring
 *           label is routed straight through it.
 *   loose — the table is above the painted width but above the TIGHTEST 0.05
 *           step too. Safe direction, and sometimes a deliberate cushion, so it
 *           is reported and never fails. (Over-counting is not free — an
 *           inflated box can push `placeLabels` into dropping a name — but it
 *           is a judgment call the tool has no standing to make.)
 *   ok    — the table sits in `[painted, nextStepUp(painted)]`: at or above what
 *           the glyph paints, and no looser than the tightest step. (A value
 *           exactly EQUAL to the painted width lands here too. That is one hair
 *           short of the module's own "strictly greater" rounding rule and
 *           essentially unreachable with real floats, so it is not worth a
 *           fourth grade — but it is not the same as "exactly the tightest
 *           step", which is what this said before.)
 */
function diffFace(face, adv, fromFallback) {
  const table = GLYPH_UPPER[face];
  const rows = [];
  for (const [ch, painted] of Object.entries(adv)) {
    const want = r2(nextStepUp(painted));
    const have = table[ch];
    const status = have < painted ? 'under' : (have > want ? 'loose' : 'ok');
    rows.push({
      ch, painted: r4(painted), have, want, status,
      // A glyph NEITHER woff2 contains — it came from the rest of the stack
      // (system-ui). Its width belongs to the HOST's fonts, so no digest here
      // pins it and this reading does not travel to another machine. Mapping it
      // is still right where the host width EXCEEDS the unmapped fallback (the
      // em-quad dashes at 2 and 3em, which is the whole reason they are listed);
      // below that the entry only narrows a bound the fallback already covers.
      unpinned: Boolean(fromFallback?.[ch]),
    });
  }
  return rows;
}

/**
 * The pasteable row.
 *
 * QUOTING: a bare identifier where the source uses one, otherwise a JS string
 * literal. It must NOT be `JSON.stringify(ch).replace(/"/g, "'")` — that turns
 * the apostrophe entry into `''': 0.30`, which is a syntax error, and this is
 * the one output the gate's error message tells a human to paste.
 *
 * UNPINNED GLYPHS KEEP THEIR COMMITTED VALUE. This is the part that matters.
 * Five entries are in NEITHER woff2 (see the header), so their measurement is a
 * reading of THIS machine's fonts. Emitting the tightest step for those would
 * hand the pasting developer a table narrowed to one host — on this container
 * `→` reads 0.838 and would be re-billed from 0.90 down to 0.85, which is an
 * UNDER-count the moment a host paints it wider. So an unpinned glyph is emitted
 * unchanged and listed separately: the tool re-measures what it can pin, and
 * declines to overwrite what it cannot.
 */
function formatTable(face, rows) {
  const q = (ch) => (/^[A-Za-z0-9]$/.test(ch) ? ch : `'${ch.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`);
  const line = rows.map((r) => `${q(r.ch)}: ${(r.unpinned ? r.have : r.want).toFixed(2)}`).join(', ');
  const held = rows.filter((r) => r.unpinned).map((r) => q(r.ch));
  return `  ${face}: { ${line} },`
    + (held.length ? `\n  // ${held.join(' ')} held at their committed values — unpinned, see below.` : '');
}

async function main() {
  const measured = await measure();
  const faces = Object.keys(GLYPH_UPPER);
  const report = {};
  let under = 0;
  let loose = 0;
  for (const face of faces) {
    const rows = diffFace(face, measured[face].adv, measured[face].fromFallback);
    report[face] = rows;
    under += rows.filter((r) => r.status === 'under').length;
    loose += rows.filter((r) => r.status === 'loose').length;
  }

  const strings = {};
  if (WITH_STRINGS) {
    for (const s of MEASURED_STRINGS) {
      strings[s] = Object.fromEntries(
        faces.map((f) => [f, r4(measured[f].perString[s] + STRING_TRACKING)]),
      );
    }
  }

  if (JSON_OUT) {
    process.stdout.write(`${JSON.stringify({
      ok: under === 0, under, loose, fonts: GLYPH_UPPER_FONTS, max: GLYPH_UPPER_MAX,
      faces: report, strings: WITH_STRINGS ? strings : undefined,
    }, null, 2)}\n`);
    return under === 0 || !CHECK ? 0 : 1;
  }

  for (const face of faces) {
    const rows = report[face];
    const bad = rows.filter((r) => r.status !== 'ok');
    const unpinned = rows.filter((r) => r.unpinned);
    process.stdout.write(
      `\n── ${face} — ${rows.length} glyphs against ${GLYPH_UPPER_FONTS[face].sources.map((s) => s.file).join(' + ')}\n`
      + `   stack ${measured[face].stack}\n`
      + `   ${rows.filter((r) => r.status === 'under').length} under · `
      + `${rows.filter((r) => r.status === 'loose').length} loose · ${unpinned.length} unpinned\n`,
    );
    for (const r of bad) {
      process.stdout.write(
        `  ${r.status.toUpperCase().padEnd(5)} ${JSON.stringify(r.ch).padEnd(8)} `
        + `painted ${r.painted.toFixed(4)}  table ${r.have}  tightest ${r.want.toFixed(2)}`
        + `${r.unpinned ? '  (unpinned — host font)' : ''}\n`,
      );
    }
    if (unpinned.length) {
      process.stdout.write(
        `  unpinned (in NEITHER woff2 — the HOST's fonts decide, so these readings do not travel; `
        + `held at their committed values in the row above): `
        + `${unpinned.map((r) => `${JSON.stringify(r.ch)} paints ${r.painted.toFixed(3)}, table ${r.have}`).join(', ')}\n`,
      );
      const pointless = unpinned.filter((r) => r.have < GLYPH_UPPER_MAX[face]);
      if (pointless.length) {
        process.stdout.write(
          `  NOTE: ${pointless.map((r) => JSON.stringify(r.ch)).join(', ')} sit BELOW `
          + `GLYPH_UPPER_MAX (${GLYPH_UPPER_MAX[face]}). An unpinned glyph mapped below the `
          + 'fallback narrows a bound the fallback already covered — on a host whose fonts '
          + 'paint it wider, the mapping is what under-counts. Consider dropping the entry.\n',
        );
      }
    }
    if (bad.length) process.stdout.write(`\n  tightest row:\n${formatTable(face, rows)}\n`);
  }

  if (WITH_STRINGS) {
    process.stdout.write(`\n── painted per-character advance at tracking ${STRING_TRACKING} `
      + '(the unit suite\'s MEASURED array)\n');
    for (const [s, v] of Object.entries(strings)) {
      process.stdout.write(`  ['${s}', ${v.clean.toFixed(3)}, ${v.hand.toFixed(3)}],\n`);
    }
  }

  if (!under) {
    process.stdout.write(
      `\nglyph metrics OK — no entry under-counts${loose ? `; ${loose} ${loose === 1 ? 'carries' : 'carry'} slack above the tightest step` : ''}.\n`,
    );
    return 0;
  }
  process.stdout.write(
    `\n${under} entr(ies) UNDER-count — the clipping direction, and the property the table exists `
    + 'to hold. Paste the tightest rows into GLYPH_UPPER, re-run the unit suite, and update the '
    + 'sha256 pins in GLYPH_UPPER_FONTS if the faces themselves changed.\n',
  );
  return CHECK ? 1 : 0;
}

if (require.main === module) {
  main().then((code) => process.exit(code)).catch((err) => {
    process.stderr.write(`measure-glyph-advances FAILED — ${err.stack || err.message}\n`);
    process.exit(1);
  });
}

module.exports = { nextStepUp, MEASURED_STRINGS };
