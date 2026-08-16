/**
 * Unit: pinning the clock in a rendered PDF (lib/core/pdf-timestamps.js).
 *
 * The whole point of the kernel is that git can then see an unchanged golden as
 * unchanged. Two properties carry that, and both are load-bearing enough that
 * breaking either is worse than not having the feature at all:
 *
 *   1. THE OUTPUT IS EXACTLY AS LONG AS THE INPUT. A PDF's xref table holds
 *      absolute byte offsets; shift one byte and every offset past it points at
 *      the wrong object. A forgiving viewer still opens the result, so a
 *      length bug does not announce itself — it corrupts quietly, elsewhere.
 *      Every case here asserts the length.
 *   2. IT ONLY TOUCHES DATES IT WAS ASKED TO. A blanket hunt for `(D:` would
 *      also rewrite a date sitting in a deck's own visible text.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const {
  pinPdfTimestamps,
  pdfDateDigits,
  resolveEpoch,
  DEFAULT_EPOCH,
} = require('../../../lib/core/pdf-timestamps');

/** Shorthand: pin a latin1 string, get a latin1 string back. */
const pin = (s, opts) => {
  const { bytes, pinned } = pinPdfTimestamps(Buffer.from(s, 'latin1'), opts);
  assert.equal(bytes.length, Buffer.byteLength(s, 'latin1'), 'length must never change');
  return { out: bytes.toString('latin1'), pinned };
};

describe('pinPdfTimestamps', () => {
  test('pins /CreationDate and /ModDate to the epoch', () => {
    const { out, pinned } = pin("/CreationDate (D:20260816213743+00'00')\n/ModDate (D:20260816213751+00'00')");
    assert.equal(pinned, 2);
    assert.match(out, /\/CreationDate \(D:19700101000000\+00'00'\)/);
    assert.match(out, /\/ModDate \(D:19700101000000\+00'00'\)/);
  });

  test('two documents rendered a second apart become byte-identical', () => {
    const at = (t) => `%PDF-1.7\n1 0 obj<</CreationDate (D:${t}+00'00')/ModDate (D:${t}+00'00')>>endobj`;
    const a = pinPdfTimestamps(Buffer.from(at('20260816213743'), 'latin1')).bytes;
    const b = pinPdfTimestamps(Buffer.from(at('20260816213751'), 'latin1')).bytes;
    assert.ok(a.equals(b), 'the churn this kernel exists to stop');
  });

  test('a timezone offset is zeroed, so the bytes do not follow the host clock', () => {
    // pdf-lib writes the HOST's UTC offset. Same instant, two machines, two
    // byte sequences — unless the offset is normalized too. Length-preserving:
    // the sign and the quote marks stay exactly where they were.
    const west = pin("/ModDate (D:20260816170000-05'00')").out;
    const east = pin("/ModDate (D:20260816220000+05'30')").out;
    assert.equal(west, east);
    assert.match(west, /\(D:19700101000000\+00'00'\)/);
  });

  test('a Z-suffixed or offset-less date keeps its shape', () => {
    // Length here is the PRODUCER's choice, not the machine's, so these are
    // already reproducible; padding them to a canonical form would only risk
    // the offset table.
    assert.match(pin('/ModDate (D:20260816213743Z)').out, /\(D:19700101000000Z\)/);
    assert.match(pin('/ModDate (D:20260816213743)').out, /\(D:19700101000000\)/);
  });

  test('a truncated but legal date stays truncated rather than growing', () => {
    const { out } = pin('/CreationDate (D:2026)');
    assert.match(out, /\(D:1970\)/);
  });

  test('leaves a date in the document body alone', () => {
    // The deck's own words are not this function's business — only values
    // introduced by the two keys are.
    const body = 'BT (Reported D:20260816213743 in Q3) Tj ET';
    const { out, pinned } = pin(body);
    assert.equal(pinned, 0);
    assert.equal(out, body);
  });

  test('ignores a key that does not introduce a literal date', () => {
    // `/ModDate 7 0 R` is an indirect reference; there is nothing to pin, and
    // guessing would corrupt the reference.
    const { pinned } = pin('/ModDate 7 0 R\n/CreationDate /None');
    assert.equal(pinned, 0);
  });

  test('pins every occurrence, not just the first', () => {
    const { pinned } = pin(
      "/CreationDate (D:20260101000000+00'00')/ModDate (D:20260102000000+00'00')" +
        "/CreationDate (D:20260103000000+00'00')"
    );
    assert.equal(pinned, 3);
  });

  test('does not mutate the caller\'s buffer', () => {
    const src = Buffer.from("/ModDate (D:20260816213743+00'00')", 'latin1');
    const before = Buffer.from(src);
    pinPdfTimestamps(src);
    assert.ok(src.equals(before), 'pdf-lib holds views onto the buffer it handed us');
  });

  test('survives binary stream bytes around the date', () => {
    // The real input is 1.5 MB of Flate streams; a UTF-8 round-trip would
    // mangle them. Bracket the date with every byte value and check they
    // all come back.
    const noise = Buffer.from(Array.from({ length: 256 }, (_, i) => i));
    const src = Buffer.concat([noise, Buffer.from("/ModDate (D:20260816213743+00'00')", 'latin1'), noise]);
    const { bytes } = pinPdfTimestamps(src);
    assert.equal(bytes.length, src.length);
    assert.ok(bytes.subarray(0, 256).equals(noise), 'leading bytes must be untouched');
    assert.ok(bytes.subarray(bytes.length - 256).equals(noise), 'trailing bytes must be untouched');
  });
});

describe('SOURCE_DATE_EPOCH', () => {
  test('overrides the pinned instant', () => {
    const { out } = pin("/ModDate (D:20260816213743+00'00')", { env: { SOURCE_DATE_EPOCH: '1750000000' } });
    assert.match(out, /\(D:20250615150640\+00'00'\)/);
  });

  test('falls back to the default when unset, empty, or nonsense', () => {
    // A bad env var must never cost someone their render.
    for (const env of [{}, { SOURCE_DATE_EPOCH: '' }, { SOURCE_DATE_EPOCH: 'yesterday' }, { SOURCE_DATE_EPOCH: '-5' }]) {
      assert.equal(resolveEpoch(env), DEFAULT_EPOCH, `unexpected epoch for ${JSON.stringify(env)}`);
    }
  });

  test('an explicit epoch beats the environment', () => {
    const { out } = pin("/ModDate (D:20260816213743+00'00')", { epoch: 0, env: { SOURCE_DATE_EPOCH: '1750000000' } });
    assert.match(out, /\(D:19700101000000\+00'00'\)/);
  });
});

describe('pinPdfLibDates', () => {
  // The byte pin cannot reach these: pdf-lib's `save()` packs the Info dict into
  // a Flate-compressed object stream, so the date is in the file but not
  // greppable — and the compressed length moves with it, so the FILE LENGTH
  // changes too. That is the half of the bug the vector path never showed.
  const { PDFDocument } = require('pdf-lib');
  const { pinPdfLibDates } = require('../../../lib/core/pdf-timestamps');

  /** A minimal one-page document stamped with `when`. */
  async function docAt(when) {
    const doc = await PDFDocument.create();
    doc.addPage([100, 100]);
    doc.setCreationDate(when);
    doc.setModificationDate(when);
    return doc;
  }

  test('two documents stamped years apart save to identical bytes', async () => {
    const a = await docAt(new Date('2026-08-16T21:37:43Z'));
    const b = await docAt(new Date('2020-05-05T05:05:05Z'));
    const [ab, bb] = [await pinPdfLibDates(a).save(), await pinPdfLibDates(b).save()];
    assert.equal(ab.length, bb.length, 'compressed length must not follow the clock');
    assert.ok(Buffer.from(ab).equals(Buffer.from(bb)));
  });

  test('the pinned document still parses, at the epoch', async () => {
    const doc = await docAt(new Date('2026-08-16T21:37:43Z'));
    const reloaded = await PDFDocument.load(await pinPdfLibDates(doc).save());
    assert.equal(reloaded.getCreationDate().getTime(), 0);
    assert.equal(reloaded.getPageCount(), 1);
  });

  test('honors SOURCE_DATE_EPOCH', async () => {
    const doc = await docAt(new Date('2026-08-16T21:37:43Z'));
    pinPdfLibDates(doc, { env: { SOURCE_DATE_EPOCH: '1750000000' } });
    assert.equal(doc.getCreationDate().getTime(), 1750000000 * 1000);
  });
});

describe('pdfDateDigits', () => {
  test('is always 14 digits, in UTC', () => {
    assert.equal(pdfDateDigits(0), '19700101000000');
    assert.equal(pdfDateDigits(1750000000), '20250615150640');
    assert.match(pdfDateDigits(1), /^\d{14}$/);
  });
});
