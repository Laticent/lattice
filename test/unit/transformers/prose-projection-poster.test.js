// Segno R4, the narrator: the video card's poster is read from the embed's inline style by
// `posterInStyle` (lib/transformers/prose-projection.mjs), which reads the CSS with `cssRefSpans`. It
// replaced a regex, frozen in tools/segno-legacy/poster-in-style.js.
//
// 1. Every rendered deck and gallery in the repo: the same poster as the regex, for every `style`.
// 2. Picked cases whose expected value is what Chromium's `style.backgroundImage` paints (recorded
//    2026-11-03 by a seeded run in a real Chromium; see the decision note's "R4: the narrator").
// 3. The failing arm: the frozen regex is wrong on those cases, so the cases can tell them apart.
const { describe, test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { legacyPosterInStyle } = require('../../../tools/segno-legacy/poster-in-style.js');
const remoteRef = require('../../../lib/core/remote-ref.js');

const ROOT = path.join(__dirname, '../../..');
let posterInStyle;
before(async () => {
  ({ posterInStyle } = await import('../../../lib/transformers/prose-projection.mjs'));
});

// [style, the poster Chromium paints]. Chromium applies the last valid declaration, honors
// `!important`, decodes escapes in the property name and the url, and drops an invalid value.
const CHROMIUM = [
  ["background-image:url('https://v.test/a.jpg')", 'https://v.test/a.jpg'],
  ['background-image:u\\72l(b.jpg)', 'b.jpg'],
  ['BACKGROUND-IMAGE:URL(c.jpg)', 'c.jpg'],
  ['background-image:/*x*/url(d.jpg)', 'd.jpg'],
  ['background-image:url("e;f).jpg")', 'e;f).jpg'],
  ['background-image:url(g.jpg);background-image:url(h.jpg)', 'h.jpg'],
  ['background-image:url(i.jpg) !important;background-image:url(j.jpg)', 'i.jpg'],
  ['background-image:url(k.jpg);background-image:red', 'k.jpg'],
  ['background-image:url(l.jpg);background-image:none', ''],
  ['background:url(m.jpg) center / cover', 'm.jpg'],
  ['backgr\\6f und-image:url(n.jpg)', 'n.jpg'],
  ['background-image:url(o\\29 .jpg)', 'o).jpg'],
  ['background-image:url(p q.jpg)', ''],
  ['background-image:linear-gradient(red, blue), url(r.jpg)', 'r.jpg'],
  ['--poster:url(s.jpg)', ''],
  ['background-image:url(t.jpg);background:', 't.jpg'],
  ['color:red', ''],
  ['', ''],
];

describe('the narrator reads a video poster with cssRefSpans (Segno R4)', () => {
  test('every rendered deck and gallery: the same poster as the frozen regex, for every style attribute', () => {
    const engine = require('../../../lib/engine/index.js').createEngine();
    const files = execFileSync('git', ['ls-files', '*.md'], { cwd: ROOT, encoding: 'utf8' })
      .split('\n')
      .filter((f) => /\.gallery\.md$|(?:^|\/)gallery\.md$|^examples\/|^test\/integration\/baseline-decks\/|\.fixtures\.md$/.test(f));
    assert.ok(files.length > 400, `only ${files.length} files`);
    let styles = 0;
    let videoPosters = 0;
    const bad = [];
    for (const f of files) {
      const { html } = engine.render(fs.readFileSync(path.join(ROOT, f), 'utf8'), undefined, { samplesUrl: 'https://studio.test/lattice/samples/' });
      for (const t of remoteRef.scanHtml(html).tags) {
        for (const a of t.attrs) {
          if (a.name !== 'style' || a.vq == null) continue;
          const style = remoteRef.decodeEntities(html.slice(a.vFrom, a.vTo), { attribute: true });
          styles++;
          const was = legacyPosterInStyle(style) ?? '';
          const now = posterInStyle(style);
          if (now && t.name === 'a') videoPosters++;
          if (was !== now) bad.push(`${f} <${t.name} style="${style.slice(0, 80)}">: regex ${JSON.stringify(was)}, now ${JSON.stringify(now)}`);
        }
      }
    }
    assert.ok(styles > 10_000, `only ${styles} style attributes`);
    // A video embed's poster is the one `<a>` with a background in the engine's output, so this counts video cards.
    assert.ok(videoPosters >= 10, `only ${videoPosters} posters on an <a>: the corpus no longer holds video embeds`);
    assert.deepEqual(bad.slice(0, 10), [], `${bad.length} style attributes read differently`);
  });

  test('the poster Chromium paints, on spellings the regex misread', () => {
    for (const [style, painted] of CHROMIUM) assert.equal(posterInStyle(style), painted, JSON.stringify(style));
  });

  test('FAILING ARM: the frozen regex gets those cases wrong, so they can tell the two apart', () => {
    const wrong = CHROMIUM.filter(([style, painted]) => (legacyPosterInStyle(style) ?? '') !== painted);
    assert.ok(wrong.length >= 9, `the regex was wrong on only ${wrong.length} cases`);
  });

  test('floods read in well under a second', () => {
    // A run of hex escapes in a bad url: the url-token check once took seconds on ten of them.
    for (const tail of ['"x)', "'x)"]) {
      const t0 = Date.now();
      assert.equal(posterInStyle(`background-image:url(${'\\aaaaaa'.repeat(2000)}${tail}`), '');
      assert.ok(Date.now() - t0 < 1000, `escapes, ${Date.now() - t0} ms`);
    }
    // Many declarations: each is read once, not once per span.
    const many = Array.from({ length: 32_000 }, (_, i) => `background:url(a${i}.png)`).join(';');
    const t1 = Date.now();
    assert.equal(posterInStyle(many), 'a31999.png');
    assert.ok(Date.now() - t1 < 1000, `declarations, ${Date.now() - t1} ms`);
  });

  test('a 64 KB style reads in well under a second', () => {
    const style = `${'color:red;'.repeat(3000)}background-image:url(${'a'.repeat(30_000)}.jpg)`;
    const t0 = Date.now();
    assert.equal(posterInStyle(style), `${'a'.repeat(30_000)}.jpg`);
    assert.ok(Date.now() - t0 < 1000, `${Date.now() - t0} ms`);
  });
});
