#!/usr/bin/env node
/**
 * tools/check-diagram-labels.js — #1674's verification harness.
 *
 * Answers the two questions the issue's acceptance criteria are written in, against a
 * REAL exported artifact rather than a fixture (HARD RULE #23):
 *
 *   1. WHAT FACE is each diagram label actually in?  `getComputedStyle().fontFamily`
 *      on every `text` / `tspan` / label element inside every `.mermaid-svg`.
 *   2. WAS IT MEASURED IN THE FACE IT IS PAINTED IN?  Mermaid sizes a label's
 *      `<foreignObject>` from the width it measures, then the deck paints the label
 *      inside it. When both happen in the same face those two widths are EQUAL — 0.00
 *      apart, not approximately. When the render page lacked the face, the box was sized
 *      against a fallback and the difference is non-zero in whichever direction that
 *      fallback happened to fall.
 *
 *      THE FIRST VERSION OF THIS CHECK WAS DEGENERATE and reported "0 clipped" for every
 *      deck ever run through it, including a deliberately broken one. It compared
 *      `scrollWidth` to `clientWidth` on the label — but mermaid's `.nodeLabel` is a
 *      `display: inline` span, where both are always 0. The adversarial trio's red team
 *      caught it. `getBoundingClientRect()` is the measure that works on an inline box.
 *
 *      Measured on the same flowchart, host page carrying the faces either way:
 *        fonts injected  → span 180.84 / fO 180.84 → 0.00, 0.00
 *        fonts suppressed → span 180.84 / fO 183.30 → 2.45, 4.33
 *
 *      Note the direction: with the full `--sketch-font-body` stack the un-injected
 *      fallback (system-ui) is WIDER than the hand face, so the box comes out slack
 *      rather than clipped. A bare family name with no fallback falls to a narrower
 *      default and clips instead ("Raw Signals" → "Raw Signa"). Which symptom you get
 *      depends on the render host's installed fonts, which is the real argument for the
 *      fix: the geometry was not wrong in a fixed direction, it was nondeterministic.
 *
 *   3. IS IT THE FACE THIS SLIDE ASKED FOR?  Added after `mode: sketch` was found
 *      reaching only some families: C4, journey, sequence and timeline carry their own
 *      `*FontFamily` config keys, defaulted to Open Sans / trebuchet ms, which the global
 *      `themeVariables.fontFamily` does not touch. A C4 slide on a sketch deck came back
 *      with 33 of 34 labels in Open Sans. The census had been printing that all along and
 *      it took a human reading the PDF to notice, so it is a failure now, not a line of
 *      output.
 *
 *      THE FIRST VERSION ASKED THE WRONG QUESTION. It matched each label against a
 *      hard-coded list of five Mermaid default face names, which can only catch a face
 *      that is FAMOUS — never one that is merely wrong. Turning the whole feature off
 *      (`mode: boardroom` on a deck built to be hand-drawn) produced `foreign-face: 0`
 *      and exit 0, and mermaid's own `sans-serif` presentation attribute on sequence
 *      autonumber bubbles was not on the list at all. So the question is now asked
 *      against the deck: read `--font-body` off the label's OWN `<section>` — the exact
 *      token the export baked into `themeVariables.fontFamily` for that slide — and
 *      require the painted face to be its first family. Per-slide, so a
 *      `_class: diagram boardroom` opt-out on a sketch deck is judged by what THAT slide
 *      asked for. A diagram whose author pinned a theme in the fence is exempt and says
 *      so in the markup (`data-author-theme`, stamped by the emulator): it stood down on
 *      purpose and wears Mermaid's stock type by design.
 *
 *   4. DID EVERY DIAGRAM RENDER AT ALL?  Added after the #1674 adversarial review, which
 *      found the first two questions structurally blind to the worst failure: a diagram
 *      that never rendered has no `.mermaid-svg` wrapper, so it is a MISSING ROW rather
 *      than a red one, and a harness that counts labels reports "0 clipped" for a deck
 *      that lost a diagram entirely. That is exactly how two dropped renderer
 *      registrations survived a green verification pass. `<pre class="mermaid-fallback">`
 *      is the engine's degradation marker; any of them is a failure.
 *
 *   5. WAS THERE ANYTHING TO CHECK?  A page with no diagrams at all answered every
 *      question above with a clean zero. "Nothing found" is now its own non-zero exit,
 *      because the one thing a verification harness must never do is report success for
 *      a run it did not perform.
 *
 * WHAT IS NOT CHECKED. Question 2 needs a box that was sized from the text, and only
 * `foreignObject` labels have one. A bare SVG `<text>` (sequence, gantt, pie, journey,
 * the legacy renderers) is censused for its FACE but carries `overflow: null` — its
 * geometry is unchecked here. That is a deliberate scope, not an oversight: the
 * measure/paint split question 2 exists to catch is caused by a face mismatch, and
 * question 3 now covers every label of both kinds.
 *
 * Usage:  node tools/check-diagram-labels.js <deck.html> [--json]
 *
 * Exits non-zero — in `--json` mode too — when a label overflows its box, a label is in
 * a face its slide did not ask for, a diagram degraded, or the page has no diagrams.
 */
const path = require('node:path');
const url = require('node:url');

async function main() {
  const file = process.argv[2];
  const asJson = process.argv.includes('--json');
  if (!file) { console.error('usage: check-diagram-labels.js <deck.html> [--json]'); process.exit(2); }
  const puppeteer = require('puppeteer');
  const launch = { args: ['--no-sandbox', '--disable-setuid-sandbox'] };
  if (process.env.CHROME_PATH) launch.executablePath = process.env.CHROME_PATH;
  const browser = await puppeteer.launch(launch);
  try {
    const page = await browser.newPage();
    await page.goto(url.pathToFileURL(path.resolve(file)).href, { waitUntil: 'networkidle0' });
    await page.evaluate(() => document.fonts.ready);
    const degraded = await page.evaluate(() =>
      [...document.querySelectorAll('pre.mermaid-fallback')]
        .map((el) => (el.textContent || '').trim().split('\n')[0].slice(0, 60)));
    const rows = await page.evaluate(() => {
      const out = [];
      /** First family of a font stack, unquoted and trimmed — the comparable part. */
      const head = (stack) => String(stack || '').split(',')[0].replace(/["']/g, '').trim();
      document.querySelectorAll('.mermaid-svg').forEach((wrap, di) => {
        const svg = wrap.querySelector('svg');
        if (!svg) return;
        // WHAT THIS SLIDE ASKED FOR. `--font-body` on the label's own <section> is the
        // token the export read to bake `themeVariables.fontFamily` for this diagram, so
        // it is the answer by construction — including on a slide that opted out of the
        // deck's finish, which is why it is read per-section and not once per deck.
        const section = wrap.closest('section');
        const want = section ? head(getComputedStyle(section).getPropertyValue('--font-body')) : '';
        // A fence whose author pinned a theme opted out of the deck's palette AND its
        // type. Judging it against the deck's face would report the feature working
        // correctly as a defect.
        const optedOut = wrap.hasAttribute('data-author-theme');
        // HTML labels (foreignObject) — the flowchart/state/class/ER default.
        wrap.querySelectorAll('foreignObject .nodeLabel, foreignObject .edgeLabel').forEach((el) => {
          const text = (el.textContent || '').trim();
          if (!text) return;
          const fo = el.closest('foreignObject');
          // getBoundingClientRect, NOT scrollWidth/clientWidth — see the header. An
          // inline span reports 0 for both, which made this check vacuous.
          const painted = el.getBoundingClientRect().width;
          const box = fo ? fo.getBoundingClientRect().width : 0;
          // TWO KINDS OF BOX, and only one is sized from the text. A class diagram's
          // CARDINALITY markers ("1", "0..*") live under `g.edgeTerminals`, and mermaid
          // does not size those from the text at all: `setTerminalWidth` overrides the
          // box to `value.length * 9` px, character-counted and font-independent
          // (mermaid/dist/chunks/mermaid.core/chunk-ENJZ2VHE.mjs). Measured: "1" gets
          // attr width 4.59 and `style="width: 9px"`; "0..*" gets 36px. So equality
          // cannot hold there and demanding it reports a defect that is not one.
          //
          // They get an OVERFLOW-only test. THE TRADE THAT MAKES: because the box is
          // character-counted, `Math.max(0, painted - box)` suppresses the box-WIDER-than-
          // paint direction — which is the direction the #1674 bug produced. On cardinality
          // markers only, question 2 is therefore blind to a face mismatch; question 3
          // still sees them. The alternative is a permanent false red on every class
          // diagram, so this is the right trade, but it is a trade.
          //
          // `g.edgeTerminals`, not `g.inner`: the class is exactly coextensive with the
          // 9px/char boxes (it is created only where `setTerminalWidth` is then called),
          // and only some of them carry the intervening `g.inner`, so keying on that left
          // half the markers still flagged.
          const padded = !!el.closest('g.edgeTerminals');
          const delta = padded
            ? Math.max(0, painted - box)   // slack is mermaid's padding, not our bug
            : Math.abs(painted - box);     // sized from the text: any gap is a face mismatch
          out.push({
            diagram: di, kind: padded ? 'html-padded' : 'html', text,
            font: getComputedStyle(el).fontFamily,
            got: head(getComputedStyle(el).fontFamily), want, optedOut,
            content: +painted.toFixed(2), box: +box.toFixed(2),
            overflow: +delta.toFixed(2),
          });
        });
        // SVG <text> labels — sequence, gantt, pie, journey, the legacy renderers.
        svg.querySelectorAll('text').forEach((el) => {
          const text = (el.textContent || '').trim();
          if (!text || el.closest('foreignObject')) return;
          let len = 0;
          try { len = el.getComputedTextLength(); } catch (_e) { return; }
          out.push({
            diagram: di, kind: 'svg', text,
            font: getComputedStyle(el).fontFamily,
            got: head(getComputedStyle(el).fontFamily), want, optedOut,
            content: +len.toFixed(2), box: null, overflow: null,
          });
        });
      });
      return out;
    });
    const diagramCount = await page.evaluate(() => document.querySelectorAll('.mermaid-svg').length);

    // A FACE THE SLIDE NEVER ASKED FOR is the failure `mode: sketch` is supposed to make
    // impossible, and it hid behind the census for a whole review round: C4 and journey
    // carry their own `*FontFamily` config keys defaulted to Open Sans / trebuchet ms, so
    // 33 of 34 labels on a C4 slide rendered in Open Sans while every other word on the
    // slide was hand-drawn. Compare against the slide's own `--font-body`, so a face that
    // is merely wrong fails exactly like a face that is famously wrong.
    const foreign = rows.filter((r) => !r.optedOut && r.want && r.got && r.got !== r.want);
    // An unresolvable `--font-body` is its own defect and must not read as "nothing to
    // compare": that is precisely the shape of the preview's custom-property cycle.
    const unknownWant = rows.filter((r) => !r.optedOut && !r.want);
    const clippedRows = rows.filter((r) => r.overflow !== null && r.overflow > 0.5);
    const nothingToCheck = diagramCount === 0 && degraded.length === 0;
    const failed = clippedRows.length || degraded.length || foreign.length
      || unknownWant.length || nothingToCheck;

    if (asJson) {
      console.log(JSON.stringify({
        labels: rows, degraded, diagrams: diagramCount,
        mismeasured: clippedRows.length, foreignFace: foreign.length,
        unknownExpectedFace: unknownWant.length,
      }, null, 2));
    } else {
      const faces = new Map();
      for (const r of rows) faces.set(r.font, (faces.get(r.font) || 0) + 1);
      for (const r of clippedRows) {
        console.log(`  MISMEASURED  d${r.diagram} "${r.text}" painted=${r.content} box=${r.box} off by ${r.overflow}`);
      }
      for (const d of degraded) console.log(`  DEGRADED  a diagram did not render: ${d}…`);
      const byFace = new Map();
      for (const r of foreign) byFace.set(`${r.got} (slide asked for ${r.want})`,
        (byFace.get(`${r.got} (slide asked for ${r.want})`) || 0) + 1);
      for (const [face, n] of byFace) console.log(`  FOREIGN FACE  ${n} label(s) in ${face}`);
      if (unknownWant.length) {
        console.log(`  NO EXPECTED FACE  ${unknownWant.length} label(s) on a slide whose --font-body `
          + 'does not resolve — the token itself is broken, so nothing can be compared');
      }
      if (nothingToCheck) console.log('  NOTHING TO CHECK  the page contains no .mermaid-svg diagrams');
      console.log(`diagrams: ${diagramCount}   degraded: ${degraded.length}   labels: ${rows.length}   `
        + `mismeasured: ${clippedRows.length}   foreign-face: ${foreign.length}`);
      for (const [f, n] of [...faces].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${f}`);
    }
    // Set in BOTH modes. `--json` used to report a degraded deck with exit 0, which makes
    // it useless to a caller that scripts it.
    if (failed) process.exitCode = 1;
  } finally { await browser.close(); }
}
main();
