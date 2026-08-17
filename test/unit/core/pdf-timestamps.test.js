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

  // A maker-checker finding (2026-08-17). The offset zeroing used to fire on a
  // bare `+`/`-` and blank six bytes unconditionally, which walked out of a
  // truncated date and into the next object — same length, so nothing complained.
  // These are the exact byte strings that corrupted.
  describe('a malformed offset never reaches past the date', () => {
    test('an indirect reference after a truncated date is untouched', () => {
      const { out } = pin("/ModDate (D:20260816213743-)9 0 R");
      assert.equal(out, "/ModDate (D:19700101000000-)9 0 R", 'the 9 0 R reference must survive');
    });

    test('an unrelated number after a truncated date is untouched', () => {
      const { out } = pin('/ModDate (D:2026-) 123456 more');
      assert.equal(out, '/ModDate (D:1970-) 123456 more');
    });

    test('a hyphenated date is not mistaken for an offset', () => {
      const { out } = pin('/ModDate (D:2026-05-05)');
      assert.equal(out, '/ModDate (D:1970-05-05)');
    });

    test('a well-formed offset is still normalized', () => {
      assert.match(pin("/ModDate (D:20260816213743-05'30')").out, /\(D:19700101000000\+00'00'\)/);
    });
  });

  test('a digit run longer than a PDF date zero-fills instead of half-pinning', () => {
    // Leaving the tail unpinned would leave exactly the churn this kernel exists
    // to remove. Length is preserved either way.
    const { out } = pin('/ModDate (D:2026081621374399999)');
    assert.equal(out, '/ModDate (D:1970010100000000000)');
  });

  test('the "(" and "D:" guards each hold on their own', () => {
    // Mutation testing showed each guard was covered only by the other.
    assert.equal(pin('/ModDate D:20260816213743').pinned, 0, 'no opening paren');
    assert.equal(pin('/ModDate (20260816213743)').pinned, 0, 'no D: prefix');
    assert.equal(pin('/ModDate (Date 2026)').pinned, 0, 'D not followed by :');
  });

  test('any PDF whitespace may sit between the key and its value', () => {
    for (const ws of [' ', '\n', '\r', '\t', '\f', '\0', '  \n\t']) {
      const { pinned } = pin(`/ModDate${ws}(D:20260816213743+00'00')`);
      assert.equal(pinned, 1, `whitespace ${JSON.stringify(ws)} should not hide the value`);
    }
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

  test('does not mutate a raw ArrayBuffer either', () => {
    // `Buffer.from` copies a view but SHARES a raw ArrayBuffer, so this input
    // shape would have been edited in place. The one plausible future caller —
    // the Studio's `pdf.output('arraybuffer')` — produces exactly this.
    const src = Buffer.from("/ModDate (D:20260816213743+00'00')", 'latin1');
    const ab = src.buffer.slice(src.byteOffset, src.byteOffset + src.length);
    const before = Buffer.from(new Uint8Array(ab));
    const { pinned } = pinPdfTimestamps(ab);
    assert.equal(pinned, 1, 'an ArrayBuffer should still be readable');
    assert.ok(Buffer.from(new Uint8Array(ab)).equals(before), "the caller's ArrayBuffer must be untouched");
  });

  test('honors a typed-array view with a non-zero byteOffset', () => {
    const padded = Buffer.concat([Buffer.alloc(8, 0xff), Buffer.from("/ModDate (D:20260816213743+00'00')", 'latin1')]);
    const view = new Uint8Array(padded.buffer, padded.byteOffset + 8, padded.length - 8);
    const { bytes, pinned } = pinPdfTimestamps(view);
    assert.equal(pinned, 1);
    assert.equal(bytes.length, view.length, 'the offset must not drag in the padding');
    assert.match(bytes.toString('latin1'), /^\/ModDate \(D:19700101000000\+00'00'\)$/);
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

  test('rejects a MILLISECOND epoch rather than stamping the year 57616', () => {
    // The classic mistake, and a finite positive number, so the old guard let it
    // through — into a 5-digit year that cannot be written as a PDF date at all.
    assert.equal(resolveEpoch({ SOURCE_DATE_EPOCH: '1755388800000' }), DEFAULT_EPOCH);
    assert.equal(resolveEpoch({ SOURCE_DATE_EPOCH: '9999999999999999999' }), DEFAULT_EPOCH);
    // The boundary itself (9999-12-31T23:59:59Z) is still honored.
    assert.equal(resolveEpoch({ SOURCE_DATE_EPOCH: '253402300799' }), 253402300799);
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
    assert.equal(pdfDateDigits(253402300799), '99991231235959', 'the four-digit-year ceiling');
    for (const e of [1, 59, 86399, 951782400, 4102444800]) {
      assert.match(pdfDateDigits(e), /^\d{14}$/, `epoch ${e}`);
    }
  });

  test('clamps an instant that would not fit in 14 digits', () => {
    // `padStart` pads but never truncates, so without a clamp these return 15
    // and 19 characters — and a 19-char run would overwrite five bytes of
    // whatever follows the date.
    for (const e of [1e15, 1000000000000, Number.NaN, Number.POSITIVE_INFINITY, -1]) {
      assert.match(pdfDateDigits(e), /^\d{14}$/, `epoch ${e} must still be 14 digits`);
    }
    assert.equal(pdfDateDigits(Number.NaN), '19700101000000');
  });
});
