/**
 * Integration: a list item's marker (bullet or number) survives the shared PDF writer.
 *
 * The writer (lib/core/pdf-compose) draws each word as real text and photographs the rest of
 * the slide with the drawn text hidden by `-webkit-text-fill-color: transparent`. A `::marker`
 * inherits that fill and Chromium does not let a `::marker` rule set it back (the property is
 * not on the marker's allowed list), so every bullet and number left the PDF: the words drew,
 * the markers did not, on every list item whose words the CLI drew. `hideDrawn` now hides a
 * marker-drawing item's words by `color: transparent` with its fill following the color, gives
 * `::marker` back its painted color (a property `::marker` does honor), and keeps everything else
 * the item and its descendants paint at the color it had.
 *
 * The check: `pdftotext -bbox` finds each item's first word, and the band to its left, where
 * an outside marker hangs, must hold ink. The band left of the heading's first word is the
 * control: nothing hangs there, so the probe cannot pass on background alone.
 *
 * The hide changes STYLES ONLY. A first cut wrapped the item's text in a span, which changed
 * what structural selectors match (`li > code:first-child` stopped matching once a span came
 * first), so the photo was laid out under different rules than the words drawn over it: a
 * strikethrough hung beside the bullet instead of through its word. Slide 3 pins that: the
 * strike must run through "Struck" where the word is drawn. Its last item has a red
 * `::first-letter`: a pseudo that sets its own color must still leave the photo, or the letter
 * paints twice (photo and drawn text), so the photo layer is read on its own for red there.
 *
 * Slide 4 pins three regressions a checker found in the first color hide: a first letter in
 * text the writer leaves in the photo (a fallback-font Greek word) must keep that letter; an
 * item's own `currentcolor` paint (emphasis dots) must stay; and a nested item under an
 * unbulleted parent must keep its bullet, which needs every item's paint read before any
 * item is hidden.
 *
 * Slide 5 pins the rollback: an item with its own `::first-line` color, and one whose author
 * `::before` rule beats the hide's, take the old fill hide whole, so their photo is `main`'s.
 *
 * Slide 6 pins two more a third checker found: a list item's drawn border must not come back into the
 * photo, and an item's `::before` text keeps its first letter.
 *
 * Slide 7 pins the fail-safe a fourth checker forced: an item whose author gives `::first-letter` a color,
 * or whose box paints a border image or a drop shadow, keeps `main`'s photo (and loses its marker as there).
 *
 * Slide 8 pins a fifth checker's finds: a currentcolor `-webkit-mask-box-image` (outside the first fail-safe
 * list) must not take the item out of the photo, and an inherited paint (emphasis dots, a text stroke) must
 * keep each child's own color, so the hide no longer pins inherited properties on the item.
 *
 * FALSIFIABLE: with the old fill-only hide in `hideDrawn`, every marker assertion fails; with
 * the span wrap, the slide 3 strike assertion fails; with the first color hide, the three slide 4
 * assertions and the slide 5 plus fail. Needs Chromium and poppler (pdftotext, pdftoppm).
 */

const { test, describe, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync, execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..', '..');
const EMULATOR = path.join(ROOT, 'lattice.js');
const FIXTURE = path.join(ROOT, 'test', 'fixtures', 'pdf-list-markers.md');
const DPI = 96;
const PX = DPI / 72;

/** A binary PGM (P5) as { w, h, px }. */
function readPgm(file) {
  const buf = fs.readFileSync(file);
  const head = buf.toString('latin1', 0, 64).match(/^P5\s+(\d+)\s+(\d+)\s+(\d+)\s/);
  return { w: Number(head[1]), h: Number(head[2]), px: buf.subarray(head[0].length) };
}

/**
 * The longest run of ink in any row across a word box, as a fraction of its width (a line
 * through the word is one unbroken row; letters alone never are).
 */
function longestRowRun(img, box) {
  const x0 = Math.ceil(box.xMin * PX), x1 = Math.floor(box.xMax * PX);
  const y0 = Math.floor(box.yMin * PX), y1 = Math.ceil(box.yMax * PX);
  const bg = img.px[Math.max(0, y0 - 2) * img.w + x0];
  let best = 0;
  for (let y = y0; y <= y1 && y < img.h; y++) {
    let run = 0;
    for (let x = x0; x <= x1; x++) {
      run = Math.abs(img.px[y * img.w + x] - bg) > 60 ? run + 1 : 0;
      best = Math.max(best, run);
    }
  }
  return best / (x1 - x0 + 1);
}

/** A binary PPM (P6) as { w, h, px } (RGB). */
function readPpm(file) {
  const buf = fs.readFileSync(file);
  const head = buf.toString('latin1', 0, 64).match(/^P6\s+(\d+)\s+(\d+)\s+(\d+)\s/);
  return { w: Number(head[1]), h: Number(head[2]), px: buf.subarray(head[0].length) };
}

/**
 * Pixels in the band left of a word box (one word-height wide, the word's own rows) that
 * differ from the background, read just above the band.
 */
function inkLeftOf(img, box) {
  const h = (box.yMax - box.yMin) * PX;
  const x1 = Math.floor(box.xMin * PX) - 2, x0 = Math.max(0, Math.floor(x1 - 1.6 * h));
  const y0 = Math.floor(box.yMin * PX), y1 = Math.ceil(box.yMax * PX);
  const bg = img.px[Math.max(0, y0 - 3) * img.w + x0];
  let ink = 0;
  for (let y = y0; y <= y1 && y < img.h; y++) {
    for (let x = x0; x <= x1; x++) if (Math.abs(img.px[y * img.w + x] - bg) > 60) ink++;
  }
  return ink;
}

describe('pdf-list-markers', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-markers-'));
  const pdf = path.join(dir, 'deck.pdf');
  const reportFile = path.join(dir, 'report.json');
  const r = spawnSync(process.execPath, [EMULATOR, FIXTURE, pdf, '--quiet'], { cwd: ROOT, encoding: 'utf8', timeout: 120000, env: { ...process.env, LATTICE_PDF_REPORT: reportFile } });
  /** The writer's account of the markers (tried, kept, and what refused the rest), for a failure message. */
  const markerReport = () => { try { return JSON.stringify(JSON.parse(fs.readFileSync(reportFile, 'utf8')).markers); } catch { return '(no report)'; } };
  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  test('the CLI renders the fixture', () => {
    assert.equal(r.status, 0, `emulator failed: ${r.stderr}`);
  });

  /** Every word box with its 1-based page, in reading order. */
  const allWords = () => {
    const xml = execFileSync('pdftotext', ['-bbox', pdf, '-'], { encoding: 'utf8' });
    const out = [];
    xml.split(/<page /).slice(1).forEach((pg, i) => {
      for (const m of pg.matchAll(/<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]+)<\/word>/g)) {
        out.push({ text: m[5], page: i + 1, xMin: +m[1], yMin: +m[2], xMax: +m[3], yMax: +m[4] });
      }
    });
    return out;
  };
  /** Each word's box and 1-based page, first occurrence wins. */
  const words = () => {
    const out = {};
    for (const b of allWords()) if (!out[b.text]) out[b.text] = b;
    return out;
  };
  /** Pixels unlike the background inside a box given in PDF points. */
  const inkIn = (img, x0, y0, x1, y1) => {
    const X0 = Math.floor(x0 * PX), X1 = Math.ceil(x1 * PX), Y0 = Math.floor(y0 * PX), Y1 = Math.ceil(y1 * PX);
    const bg = img.px[Math.max(0, Y0 - 3) * img.w + X1];
    let ink = 0;
    for (let y = Y0; y <= Y1 && y < img.h; y++) for (let x = X0; x <= X1; x++) if (Math.abs(img.px[y * img.w + x] - bg) > 60) ink++;
    return ink;
  };
  const pages = {};
  const page = (n) => {
    if (pages[n]) return pages[n];
    const base = path.join(dir, `p${n}`);
    execFileSync('pdftoppm', ['-gray', '-r', String(DPI), '-f', String(n), '-l', String(n), '-singlefile', pdf, base]);
    pages[n] = readPgm(`${base}.pgm`);
    return pages[n];
  };
  const marked = (w, word) => {
    assert.ok(w[word], `"${word}" is real text in the PDF`);
    return inkLeftOf(page(w[word].page), w[word]);
  };
  /** Assert a marker beside a word, saying in the failure what the writer did with the markers. */
  const hasMarker = (w, word, what) => assert.ok(marked(w, word) > 6, `${what} beside "${word}"; markers: ${markerReport()}`);

  test('a bullet is in the PDF beside every unordered item, prose-with-code and nested included', () => {
    const w = words();
    for (const word of ['Alpha', 'Bravo', 'Delta']) hasMarker(w, word, 'a bullet');
    // An item whose only text sits in <strong> was never hidden itself; it must keep its bullet too.
    assert.ok(marked(w, 'Charlie') > 6, 'a bullet beside "Charlie"');
  });

  test('a number is in the PDF beside every ordered item', () => {
    const w = words();
    for (const word of ['Echo', 'Foxtrot']) hasMarker(w, word, 'a number');
  });

  test('markers survive on a dark slide', () => {
    const w = words();
    for (const word of ['Golf', 'Hotel', 'India']) hasMarker(w, word, 'a marker');
  });

  test('a structural author selector lays the photo out as the words were read', () => {
    const w = words();
    for (const word of ['Kilo', 'Struck']) assert.ok(marked(w, word) > 6, `a bullet beside "${word}"`);
    assert.ok(longestRowRun(page(w.Struck.page), w.Struck) > 0.95, 'the strike runs through "Struck" where it is drawn');
    assert.ok(longestRowRun(page(w['Lima.'].page), w['Lima.']) < 0.6, 'control: "Lima" has no such row');
  });

  /** Red pixels in the PHOTO layer of page `n` (the picture under the drawn text), inside a box in PDF points. */
  const redInPhoto = (n, x0, y0, x1, y1) => {
    const sub = path.join(dir, `photo${n}`);
    fs.mkdirSync(sub, { recursive: true });
    execFileSync('pdfimages', ['-f', String(n), '-l', String(n), pdf, path.join(sub, 'img')]);
    const photo = readPpm(fs.readdirSync(sub).filter((f) => f.endsWith('.ppm')).map((f) => path.join(sub, f))
      .sort((a, b) => fs.statSync(b).size - fs.statSync(a).size)[0]);
    const pageW = Number(execFileSync('pdfinfo', ['-f', String(n), '-l', String(n), pdf], { encoding: 'utf8' })
      .match(/Page\s+\d+\s+size:\s+([\d.]+)/)[1]);
    const s = photo.w / pageW;
    let red = 0;
    for (let y = Math.floor(y0 * s); y <= Math.ceil(y1 * s); y++) {
      for (let x = Math.floor(x0 * s); x <= Math.ceil(x1 * s); x++) {
        const i = (y * photo.w + x) * 3;
        if (photo.px[i] > 150 && photo.px[i + 1] < 90 && photo.px[i + 2] < 90) red++;
      }
    }
    return red;
  };

  test('a first letter with its own color leaves the photo with its word', () => {
    const w = words();
    // A reader may take the first letter as a word of its own ("M", then "ike"); its box is the M's either way.
    const mike = w.Mike || w.M;
    assert.ok(mike, '"Mike" is real text in the PDF');
    assert.equal(redInPhoto(mike.page, mike.xMin, mike.yMin, mike.xMax, mike.yMax), 0, 'no red first letter left in the photo under the drawn "Mike"');
  });

  test('an item with its own ::first-line color rolls back and keeps that color on its photo-only words', () => {
    // The small-caps "Refused" is left in the photo; the item's ::first-line paints it red on screen. A
    // descendant pinned to its plain color would lose the red, so the item takes the old hide instead.
    const w = words();
    const sierra = w.Sierra;
    const edge = w.A;
    assert.ok(sierra && edge, '"Sierra" and the heading are real text on slide 5');
    const red = redInPhoto(sierra.page, edge.xMin, sierra.yMin, sierra.xMin - 1, sierra.yMax);
    assert.ok(red > 20, `the photo keeps "Refused" red (${red} px)`);
  });

  test('an author rule that beats ours on ::before rolls the item back, and its ::before stays', () => {
    // `li::before { content: "+ "; color: inherit !important }` outranks the hide's own ::before rule, so the
    // color hide would leave the plus transparent; the check after the hide rolls the item back.
    const w = words();
    const t = w.Tango;
    assert.ok(t, '"Tango" is real text on slide 5');
    const h = t.yMax - t.yMin;
    assert.ok(inkIn(page(t.page), t.xMin - 0.8 * h, t.yMin, t.xMin - 1, t.yMax) > 6, 'the author\'s plus is in the photo');
  });

  test('a nested item that rolled back keeps its color when its parent is hidden after it', () => {
    // Raw HTML puts the parent's own words after its nested list, so the nested item (whose author ::before
    // outranks the hide's rule) is hidden and rolled back FIRST, and its parent is color-hidden after it. The
    // nested item must come out as `main` drew it. (`hideDrawn` also forgets what a rolled-back attempt set,
    // so the parent cannot skip pinning it; with list markup the <ul> between them is pinned anyway, so this
    // checks the two paths together rather than that bookkeeping alone.)
    const w = words();
    const v = w.Victor;
    assert.ok(v && w.Uniform, '"Victor" and "Uniform" are real text on slide 5');
    const h = v.yMax - v.yMin;
    assert.ok(inkIn(page(v.page), v.xMin - 0.8 * h, v.yMin, v.xMin - 1, v.yMax) > 6, 'the nested item\'s plus is in the photo');
  });

  test('a word left in the photo keeps its first letter inside a list item', () => {
    // The Greek word is in a fallback font, so the writer leaves it in the photo; the same word opens
    // the item ("… opens Nova.") and a paragraph ("… opens Romeo."). Measured back from the drawn
    // "opens", by the width the paragraph's Greek word takes from the content edge, both regions hold
    // the same word, so they hold the same ink. The first color hide made the item's first letter
    // transparent and the item's region came up a letter short.
    const all = allWords();
    const opens = all.filter((b) => b.text === 'opens' && b.page === 4);
    const edge = all.find((b) => b.text === 'Photo-only');
    assert.equal(opens.length, 2, 'both "opens" are real text on slide 4');
    const [item, para] = opens;
    const width = para.xMin - edge.xMin;
    const inkItem = inkIn(page(4), item.xMin - width, item.yMin, item.xMin - 1, item.yMax);
    const inkPara = inkIn(page(4), para.xMin - width, para.yMin, para.xMin - 1, para.yMax);
    assert.ok(inkPara > 50, 'control: the paragraph\'s Greek word is in the photo');
    assert.ok(inkItem / inkPara > 0.95, `the item's Greek word has all its ink (${inkItem} vs ${inkPara})`);
  });

  test('an item keeps what it paints in its own color: emphasis dots', () => {
    const w = words();
    const o = w.Oscar;
    assert.ok(o, '"Oscar" is real text in the PDF');
    const h = o.yMax - o.yMin;
    // `text-emphasis` dots sit over the line, in the gap above the word box: the band stops short of
    // the box (glyph tops) and of the line above (its descenders end well before 0.6 of a line up).
    const dots = inkIn(page(o.page), o.xMin, o.yMin - 0.6 * h, o.xMax, o.yMin - 1);
    assert.ok(dots > 6, `emphasis dots around "Oscar" (${dots} px)`);
  });

  test('a nested item under an unbulleted parent keeps its bullet', () => {
    assert.ok(marked(words(), 'Quebec') > 6, 'a bullet beside "Quebec"');
  });

  test('a list item\'s drawn border stays out of the photo', () => {
    // The PDF draws Whiskey's red underline as a vector; the photo must not carry it too. The border step
    // sets the `border-color` shorthand and the item's pin checked the longhands, so it painted it back.
    const w = words();
    const k = w.Whiskey;
    assert.ok(k, '"Whiskey" is real text on slide 6');
    // Right of the word only: the border spans the item, and the next item's red "W" sits at the far left.
    const red = redInPhoto(k.page, k.xMax + 2, k.yMin, 900, k.yMax + 20);
    assert.equal(red, 0, `no red border in the photo under "Whiskey" (${red} px)`);
  });

  test('an item\'s ::before text keeps its first letter', () => {
    // With `::before` text, CSS gives ::first-letter to that text, which is never drawn: the hide's
    // first-letter rule must not apply, or the author's "W" is in neither layer.
    const w = words();
    const x = w.Xray;
    assert.ok(x, '"Xray" is real text on slide 6');
    const h = x.yMax - x.yMin;
    const red = redInPhoto(x.page, x.xMin - 1.2 * h, x.yMin, x.xMin - 1, x.yMax);
    assert.ok(red > 20, `the author's red "W" is in the photo (${red} px)`);
  });

  /** Pixels of one channel-dominant hue in the photo layer: 'red' or 'green'. */
  const hueInPhoto = (n, hue, x0, y0, x1, y1) => {
    if (hue === 'red') return redInPhoto(n, x0, y0, x1, y1);
    const sub = path.join(dir, `photo${n}`);
    fs.mkdirSync(sub, { recursive: true });
    if (!fs.readdirSync(sub).some((f) => f.endsWith('.ppm'))) execFileSync('pdfimages', ['-f', String(n), '-l', String(n), pdf, path.join(sub, 'img')]);
    const photo = readPpm(fs.readdirSync(sub).filter((f) => f.endsWith('.ppm')).map((f) => path.join(sub, f))
      .sort((a, b) => fs.statSync(b).size - fs.statSync(a).size)[0]);
    const pageW = Number(execFileSync('pdfinfo', ['-f', String(n), '-l', String(n), pdf], { encoding: 'utf8' })
      .match(/Page\s+\d+\s+size:\s+([\d.]+)/)[1]);
    const s = photo.w / pageW;
    let n2 = 0;
    for (let y = Math.floor(y0 * s); y <= Math.ceil(y1 * s); y++) {
      for (let x = Math.floor(x0 * s); x <= Math.ceil(x1 * s); x++) {
        const i = (y * photo.w + x) * 3;
        if (photo.px[i + 1] > 150 && photo.px[i] < 90 && photo.px[i + 2] < 90) n2++;
      }
    }
    return n2;
  };

  test('an author ::first-letter color with an empty ::before is not painted under the drawn letter', () => {
    // The empty ::before leaves the first letter in the item's own (drawn) text; its green must not reach
    // the photo, or the letter paints twice. The item takes the fill hide whole, as on main.
    const y = words().Yankee;
    assert.ok(y, '"Yankee" is real text on slide 7');
    assert.equal(hueInPhoto(y.page, 'green', y.xMin - 2, y.yMin, y.xMax, y.yMax), 0, 'no green first letter in the photo');
  });

  test('an item\'s currentcolor border image stays in the photo', () => {
    const z = words().Zulu;
    assert.ok(z, '"Zulu" is real text on slide 7');
    const red = redInPhoto(z.page, 0, z.yMin, z.xMin - 1, z.yMax);
    assert.ok(red > 40, `the red border-image bar is in the photo (${red} px)`);
  });

  test('an item\'s drop shadow stays in the photo', () => {
    const x = words().Xenon;
    assert.ok(x, '"Xenon" is real text on slide 7');
    const green = hueInPhoto(x.page, 'green', 0, x.yMax, 960, x.yMax + 30);
    assert.ok(green > 40, `the green drop shadow of the black border is in the photo (${green} px)`);
  });

  /** Pixels of a yellow (R and G high, B low) in the photo layer of page `n`, inside a box in PDF points. */
  const yellowInPhoto = (n, x0, y0, x1, y1) => {
    const sub = path.join(dir, `photo${n}`);
    fs.mkdirSync(sub, { recursive: true });
    if (!fs.readdirSync(sub).some((f) => f.endsWith('.ppm'))) execFileSync('pdfimages', ['-f', String(n), '-l', String(n), pdf, path.join(sub, 'img')]);
    const photo = readPpm(fs.readdirSync(sub).filter((f) => f.endsWith('.ppm')).map((f) => path.join(sub, f))
      .sort((a, b) => fs.statSync(b).size - fs.statSync(a).size)[0]);
    const pageW = Number(execFileSync('pdfinfo', ['-f', String(n), '-l', String(n), pdf], { encoding: 'utf8' })
      .match(/Page\s+\d+\s+size:\s+([\d.]+)/)[1]);
    const s = photo.w / pageW;
    let k = 0;
    for (let y = Math.floor(y0 * s); y <= Math.ceil(y1 * s); y++) {
      for (let x = Math.floor(x0 * s); x <= Math.ceil(x1 * s); x++) {
        const i = (y * photo.w + x) * 3;
        if (photo.px[i] > 200 && photo.px[i + 1] > 150 && photo.px[i + 2] < 90) k++;
      }
    }
    return k;
  };

  test('an item masked by a currentcolor -webkit-mask-box-image keeps its band in the photo', () => {
    // The mask follows the item's color; hidden by color, the mask went transparent and took the whole box with it.
    const a = allWords().find((b) => b.text === 'Alfa' && b.page === 8);
    assert.ok(a, '"Alfa" is real text on slide 8');
    const yellow = yellowInPhoto(a.page, a.xMax + 2, a.yMin, 900, a.yMax);
    assert.ok(yellow > 200, `the yellow band is in the photo (${yellow} px)`);
  });

  test('a red child keeps red emphasis dots inside an item that draws emphasis', () => {
    // A pinned (inherited) text-emphasis-color on the item turned the child's dots the item's navy.
    const r = allWords().find((b) => b.text === 'red' && b.page === 8);
    assert.ok(r, '"red" is real text on slide 8');
    const h = r.yMax - r.yMin;
    const red = redInPhoto(r.page, r.xMin, r.yMin - 0.6 * h, r.xMax, r.yMin - 1);
    assert.ok(red > 6, `red emphasis dots over "red" (${red} px)`);
  });

  test('a stroked child left in the photo keeps its own stroke color', () => {
    // A pinned (inherited) -webkit-text-stroke-color on the item stroked the red child in navy.
    const all = allWords();
    const c = all.find((b) => b.text === 'Charlie' && b.page === 8);
    const has = all.find((b) => b.text === 'has' && b.page === 8);
    assert.ok(c && has, '"Charlie has" is real text on slide 8');
    const word = all.find((b) => b.text === 'a' && b.page === 8 && b.xMin > has.xMax);
    const x0 = (word ? word.xMax : has.xMax) + 2;
    const navy = (() => {
      const sub = path.join(dir, 'photo8');
      const photo = readPpm(fs.readdirSync(sub).filter((f) => f.endsWith('.ppm')).map((f) => path.join(sub, f))
        .sort((a, b) => fs.statSync(b).size - fs.statSync(a).size)[0]);
      const pageW = Number(execFileSync('pdfinfo', ['-f', '8', '-l', '8', pdf], { encoding: 'utf8' }).match(/Page\s+\d+\s+size:\s+([\d.]+)/)[1]);
      const s = photo.w / pageW;
      let k = 0;
      for (let y = Math.floor(c.yMin * s); y <= Math.ceil(c.yMax * s); y++) {
        for (let x = Math.floor(x0 * s); x <= Math.ceil((x0 + 90) * s); x++) {
          const i = (y * photo.w + x) * 3;
          if (photo.px[i + 2] > 60 && photo.px[i] < 70 && photo.px[i + 2] - photo.px[i] > 25) k++;
        }
      }
      return k;
    })();
    const red = redInPhoto(c.page, x0, c.yMin, x0 + 90, c.yMax);
    assert.ok(red > 40, `the stroked word is red in the photo (${red} px)`);
    assert.ok(navy < red / 10, `no navy stroke around it (${navy} navy vs ${red} red px)`);
  });

  test('card list items on a split-compare slide keep their bullets', () => {
    // The camera copies each <style> element's text into the clone it photographs; marker rules added with
    // insertRule were not in that text, so a card's item photographed with no marker.
    const all = allWords();
    for (const word of ['Delta', 'Echo', 'Foxtrot', 'Golf']) {
      const b = all.find((x) => x.text === word && x.page === 9);
      assert.ok(b, `"${word}" is real text on slide 9`);
      assert.ok(inkLeftOf(page(9), b) > 6, `a bullet beside "${word}"`);
    }
  });

  test('a currentcolor background on an item\'s first letter or first line stays in the photo', () => {
    // After the switch that background computes to transparent, so judging "paints nothing" on the new value alone
    // let it through and the badge and the bar left the photo (the red team). Both must stay red.
    const all = allWords();
    for (const word of ['Hotel', 'Juliett']) {
      const b = all.find((x) => x.text === word && x.page === 10);
      assert.ok(b, `"${word}" is real text on slide 10`);
      const red = redInPhoto(b.page, b.xMin - 4, b.yMin, b.xMax, b.yMax);
      assert.ok(red > 40, `the red background under "${word}" is in the photo (${red} px); markers: ${markerReport()}`);
    }
  });

  test('control: no ink left of the heading, where nothing hangs', () => {
    const w = words();
    assert.equal(marked(w, 'Markers'), 0, 'the probe reads background left of the heading');
  });
});
