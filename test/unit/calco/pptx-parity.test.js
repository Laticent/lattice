/**
 * Unit: Calco's native PPTX writer says what the pptxgenjs writer said (engineering/decisions/
 * 2026-11-13-native-pptx-writer.md §How it is proven, 3). Every parity deck (test/unit/calco/_parity-decks.js) is
 * written and read back (test/helpers/pptx-readback.js): each slide's objects in paint order with their groups,
 * frames, geometry, fills, outlines, shadows, pictures, alt text, placeholders and text run by run, the layout
 * behind each slide with its background, the notes, the document title and the embedded fonts. The record must
 * match `_pptx-parity.snapshot.json`.
 *
 * THE SNAPSHOT is frozen. It was read back from the pptxgenjs path at `e5dfcb1d` (origin/main on 2026-11-15:
 * `writePptx(PptxGenJS, deck, 'nodebuffer', JSZip)` for the editable decks, `lib/export/pptx-export.js` for the
 * picture decks), with this same reader. pptxgenjs left the tree in the same change, so it cannot be recorded
 * again; a deliberate change to what the writer says edits the snapshot by hand, and the diff is the review.
 *
 * WHAT IS COMPARED is what the reader reads (its header lists it); autofit, `lang`, the `ea`/`cs` faces, the master's
 * text styles, the theme and a picture's crop are not, so they can drift without a diff (the design note's §What shipped).
 *
 * What may differ, and why (`normalize`): frames and path points by rounding (pptxgenjs rounded every length to
 * 1/10,000 in, Calco converts px to EMU once), within 0.05 px; a layout's page-number stand-in (pptxgenjs wrote "1002"); pptxgenjs's roundRect corner past a half-round
 * (50016), which every reader clamps to 50000; the layout's title placeholder, which pptxgenjs named "Text 0"
 * (placeholders are compared by type, not name); and the empty notes pages pptxgenjs wrote for every slide.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const JSZip = require('jszip');
const { writePptx } = require('@laticent/calco');
const { writePptx: writePicturePptx } = require('../../../lib/export/pptx-export');
const { readPptx } = require('../../helpers/pptx-readback');
const { parityDecks } = require('./_parity-decks');

const SNAPSHOT = JSON.parse(fs.readFileSync(path.join(__dirname, '_pptx-parity.snapshot.json'), 'utf8'));
/** 0.05 px on a 1280px wide slide (9525 EMU per px), and an adjust value's rounding. */
const EMU_TOLERANCE = 500;
const ADJ_TOLERANCE = 50;

/** Every difference between two records, as `path: expected → actual`, with the tolerances above. */
function differences(expected, actual, at = '$', out = []) {
  if (typeof expected === 'number' && typeof actual === 'number') {
    const tol = /\.adj$/.test(at) ? ADJ_TOLERANCE : /\.(box|path|pathSize|inset)\b/.test(at) ? EMU_TOLERANCE : 0;
    if (Math.abs(expected - actual) > tol) out.push(`${at}: ${expected} → ${actual}`);
    return out;
  }
  if (Array.isArray(expected) || Array.isArray(actual)) {
    if (!Array.isArray(expected) || !Array.isArray(actual)) {
      out.push(`${at}: ${JSON.stringify(expected)} → ${JSON.stringify(actual)}`);
      return out;
    }
    if (expected.length !== actual.length) out.push(`${at}.length: ${expected.length} → ${actual.length}`);
    for (let i = 0; i < Math.min(expected.length, actual.length); i++) differences(expected[i], actual[i], `${at}[${i}]`, out);
    return out;
  }
  if (expected && actual && typeof expected === 'object' && typeof actual === 'object') {
    for (const k of new Set([...Object.keys(expected), ...Object.keys(actual)])) {
      if (expected[k] === undefined && actual[k] === undefined) continue;
      differences(expected[k], actual[k], `${at}.${k}`, out);
    }
    return out;
  }
  if (expected !== actual) out.push(`${at}: ${JSON.stringify(expected)} → ${JSON.stringify(actual)}`);
  return out;
}

/** Drop what is allowed to differ (see the header), through a JSON round trip so `undefined` keys vanish. */
function normalize(record) {
  const out = JSON.parse(JSON.stringify(record));
  // A layout's page-number field is a stand-in a slide never shows: pptxgenjs wrote "1002", Calco writes "‹#›".
  for (const slide of out.slides) for (const o of slide.layout.objects) if (o.ph === 'sldNum') for (const p of o.text.paras) for (const r of p.runs) delete r.t;
  return out;
}

/**
 * The two things the native writer says DIFFERENTLY, on purpose, applied to the snapshot: pptxgenjs stamped
 * "PptxGenJS Presentation" as the subject of a deck that gave none (Calco writes no subject), and named the CLI's
 * slide picture "Image 0" on every slide (Calco names it "Slide N", as the editable export always has).
 */
function intended(record) {
  const out = JSON.parse(JSON.stringify(record));
  if (out.subject === 'PptxGenJS Presentation') delete out.subject;
  out.slides.forEach((slide, i) => {
    for (const o of slide.objects) if (o.kind === 'pic' && o.name === 'Image 0') o.name = `Slide ${i + 1}`;
  });
  return out;
}

async function written() {
  const decks = await parityDecks();
  const out = {};
  for (const [name, deck] of Object.entries(decks.editable)) out[name] = normalize(await readPptx(await writePptx(JSZip, deck, 'nodebuffer')));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'calco-parity-'));
  for (const [name, d] of Object.entries(decks.pictures)) {
    const file = path.join(tmp, `${name}.pptx`);
    await writePicturePptx(file, d.pngs, d.meta, d.notes, d.descriptions);
    out[`cli-${name}`] = normalize(await readPptx(fs.readFileSync(file)));
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  return out;
}

describe('calco pptx — parity with the pptxgenjs writer', () => {
  let actual;
  const get = async () => (actual ||= await written());

  for (const name of Object.keys(SNAPSHOT)) {
    test(`${name}: what a reader sees matches the snapshot`, async () => {
      assert.deepEqual(differences(normalize(intended(SNAPSHOT[name])), (await get())[name]), []);
    });
  }

  test('the snapshot covers every parity deck, and every feature the rich deck exercises', async () => {
    assert.deepEqual(Object.keys(await get()).sort(), Object.keys(SNAPSHOT).sort());
    const objects = SNAPSHOT.rich.slides.flatMap((s) => [...s.objects, ...s.layout.objects]);
    const seen = (pred) => objects.some(pred);
    assert.ok(seen((o) => o.group?.includes(' / ')), 'a group inside a group');
    assert.ok(seen((o) => o.fill?.gradient), 'a gradient');
    assert.ok(seen((o) => o.svg), 'an SVG picture');
    assert.ok(seen((o) => o.shadow), 'a shadow');
    assert.ok(seen((o) => o.line?.cap === 'rnd'), 'a round cap');
    assert.ok(seen((o) => o.ph === 'title'), 'a title placeholder');
    assert.ok(seen((o) => o.text?.paras.some((p) => p.runs.some((r) => r.field === 'slidenum'))), 'a page-number field');
    assert.ok(seen((o) => o.text?.paras.some((p) => p.runs.some((r) => r.cap === 'small'))), 'small caps');
    assert.ok(SNAPSHOT.fonts.fonts.length, 'embedded fonts');
  });

  test('ARM THAT FAILS: a writer that drops a note, an alt text, a run style or a group is caught', async () => {
    const base = normalize(SNAPSHOT.rich);
    const broken = (fn) => {
      const copy = JSON.parse(JSON.stringify(base));
      fn(copy);
      return differences(base, copy);
    };
    assert.ok(broken((r) => (r.slides[0].notes = '')).length, 'a lost note');
    assert.ok(broken((r) => delete r.slides[0].objects[0].descr).length, 'a lost alt text');
    assert.ok(broken((r) => (r.slides[0].objects.find((o) => o.text?.paras.some((p) => p.runs.some((x) => x.cap))).text.paras[0].runs[0].cap = undefined)).length, 'lost small caps');
    assert.ok(broken((r) => {
      for (const o of r.slides[0].objects) delete o.group;
    }).length, 'an ungrouped card');
    assert.ok(broken((r) => (r.slides[0].objects[1].box[0] += 1000)).length, 'a frame off by a tenth of a pixel');
    assert.deepEqual(broken(() => {}), [], 'and an unchanged record passes');
  });
});
