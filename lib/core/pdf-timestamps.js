/**
 * Pin the wall-clock timestamps in a rendered PDF so that re-rendering an
 * unchanged deck produces byte-identical output.
 *
 * WHY. Rendering `examples/sketch.md` twice at the same commit yields two
 * ~1.5 MB files of identical length that differ in exactly FOUR bytes — all of
 * them digits inside `/CreationDate` and `/ModDate`. Nothing else moves: not the font
 * subsets, not the object order, not the xref offsets. But git cannot see
 * "four bytes"; a PDF is a binary blob, so a re-render with zero visual change
 * still writes a full new ~1.5 MB object into history. With 351 tracked PDFs
 * (67.5% of the tree) and one cross-cutting CSS commit re-blessing up to 150 of
 * them, that is 65.3% of recent history growth spent on pixels that did not
 * move. Pinning the clock makes an unchanged golden a NO-OP in git.
 * (engineering/decisions/2026-08-16-render-format-cost-assessment.md §5, L0.)
 *
 * THE CONSTRAINT THAT SHAPES EVERY LINE BELOW: a PDF's cross-reference table
 * stores ABSOLUTE BYTE OFFSETS into the file. Change the length of anything and
 * every offset after it is wrong — and a forgiving viewer will still open the
 * corrupt result, so the damage shows up somewhere else, later. So this rewrites
 * digits IN PLACE, in a Buffer, never through a string round-trip, and the
 * output is always exactly as long as the input. The two rewrites it performs:
 *
 *   D:20260816213743+00'00'   ->   D:19700101000000+00'00'
 *      ^^^^^^^^^^^^^^                 ^^^^^^^^^^^^^^         14 digits, in place
 *   D:20260816213743+05'30'   ->   D:19700101000000+00'00'
 *                    ^ ^^ ^^                       ^ ^^ ^^   offset zeroed, sign
 *                                                            forced '+'
 *
 * The offset is zeroed because pdf-lib writes the HOST's UTC offset, which would
 * otherwise make the bytes depend on the renderer's timezone. `Z`-suffixed and
 * offset-less dates are left as they are — their length is the producer's
 * choice, not the machine's, so they are already reproducible.
 *
 * SCOPE. Only values introduced by the `/CreationDate` and `/ModDate` KEYS are
 * touched. A bare hunt for `(D:` would also match a date that happens to sit in
 * an uncompressed content stream or an attached file, and rewriting a deck's
 * visible text is not this function's business.
 *
 * SOURCE_DATE_EPOCH (the reproducible-builds convention) overrides the pinned
 * instant, so a release can stamp a real, still-deterministic date.
 * <https://reproducible-builds.org/specs/source-date-epoch/>
 *
 * Pure and fs-free: the CLI's two write sites both call it (HARD RULE #1), and
 * it is unit-testable without rendering anything.
 */

/** The pinned instant when SOURCE_DATE_EPOCH is unset: 1970-01-01T00:00:00Z. */
const DEFAULT_EPOCH = 0;

const KEYS = ['/CreationDate', '/ModDate'];

const ZERO = '0'.charCodeAt(0);
const NINE = '9'.charCodeAt(0);
const PLUS = '+'.charCodeAt(0);
const MINUS = '-'.charCodeAt(0);
const QUOTE = "'".charCodeAt(0);

/** Latest instant `pdfDateDigits` can render in four year digits: 9999-12-31T23:59:59Z. */
const MAX_EPOCH = 253402300799;

const isDigit = (b) => b >= ZERO && b <= NINE;
// PDF whitespace (ISO 32000-1 Table 1) — what may sit between a key and its value.
const isSpace = (b) => b === 0x20 || b === 0x0a || b === 0x0d || b === 0x09 || b === 0x0c || b === 0x00;

/**
 * Render an epoch-seconds instant as the 14 digits of a PDF date string
 * (`YYYYMMDDHHmmSS`), in UTC. Always exactly 14 characters — `padStart` pads but
 * never truncates, so an out-of-range instant is clamped to the default rather
 * than allowed to return a 15-digit year (or, for a non-finite input, the string
 * `0NaNNaNNaNNaNNaNNaN`, which `new Date(NaN)` yields and nothing throws over).
 */
function pdfDateDigits(epochSeconds) {
  const secs = inRange(epochSeconds) ? epochSeconds : DEFAULT_EPOCH;
  const d = new Date(secs * 1000);
  const p = (n, w) => String(n).padStart(w, '0');
  return (
    p(d.getUTCFullYear(), 4) +
    p(d.getUTCMonth() + 1, 2) +
    p(d.getUTCDate(), 2) +
    p(d.getUTCHours(), 2) +
    p(d.getUTCMinutes(), 2) +
    p(d.getUTCSeconds(), 2)
  );
}

/** Is this a whole-second instant a four-digit PDF year can represent? */
function inRange(n) {
  return Number.isFinite(n) && n >= 0 && n <= MAX_EPOCH;
}

/**
 * Read the pinned instant from an environment bag, honoring SOURCE_DATE_EPOCH.
 * A malformed value is ignored rather than throwing — a bad env var must never
 * cost someone their render.
 *
 * "Malformed" includes **milliseconds**, the classic mistake: `1755388800000` is
 * a perfectly finite positive number that lands in the year 57616, which needs
 * five year digits and so cannot be written into a PDF date at all. Anything past
 * 9999-12-31 falls back to the default instead of emitting a malformed stamp.
 */
function resolveEpoch(env = process.env) {
  const raw = env?.SOURCE_DATE_EPOCH;
  if (raw == null || raw === '') return DEFAULT_EPOCH;
  const n = Number(raw);
  return inRange(n) ? Math.floor(n) : DEFAULT_EPOCH;
}

/**
 * Overwrite, in place, the date value that starts at `at` (the byte index of
 * the `D` in `D:`). Returns true if anything was rewritten.
 *
 * Writes at most as many digits as it finds, so a truncated-but-legal date like
 * `D:2026` stays four characters long instead of growing to fourteen. A run
 * longer than the 14 a PDF date can hold is zero-filled past the fourteenth, so
 * even a malformed value lands on a constant rather than half-pinned.
 */
function pinDateAt(buf, at, digits) {
  let i = at + 2; // past 'D:'
  let n = 0;
  while (i < buf.length && isDigit(buf[i])) {
    buf[i] = n < 14 ? digits.charCodeAt(n) : ZERO;
    i++;
    n++;
  }
  if (n === 0) return false;
  // A trailing UTC offset is the HOST's timezone, so it is machine-dependent and
  // gets zeroed. Only the exact `+HH'mm'` / `-HH'mm'` shape is touched, verified
  // byte for byte before a single write: an earlier version zeroed six bytes
  // after the sign unconditionally, which walked straight out of a truncated
  // date and into whatever followed — `(D:20260816213743-)9 0 R` had its
  // indirect reference rewritten to `0 0 R`, same length, no complaint. A date
  // that does not match the shape is left exactly as found, sign included.
  // `Z`-suffixed and offset-less dates never enter here at all.
  if (
    i + 6 < buf.length &&
    (buf[i] === PLUS || buf[i] === MINUS) &&
    isDigit(buf[i + 1]) && isDigit(buf[i + 2]) && buf[i + 3] === QUOTE &&
    isDigit(buf[i + 4]) && isDigit(buf[i + 5]) && buf[i + 6] === QUOTE
  ) {
    buf[i] = PLUS;
    buf[i + 1] = ZERO;
    buf[i + 2] = ZERO;
    buf[i + 4] = ZERO;
    buf[i + 5] = ZERO;
  }
  return true;
}

/**
 * Pin every `/CreationDate` and `/ModDate` in `bytes`.
 *
 * @param {Uint8Array|Buffer} bytes  A complete PDF document.
 * @param {{epoch?: number, env?: object}} [opts]
 *   `epoch` — pinned instant in epoch SECONDS, overriding SOURCE_DATE_EPOCH.
 * @returns {{bytes: Buffer, pinned: number}} A new Buffer of EXACTLY the input
 *   length, and how many date values were rewritten.
 */
function pinPdfTimestamps(bytes, opts = {}) {
  // Copy: the caller's buffer (and pdf-lib's internal view onto it) is not ours
  // to mutate, and a same-length copy keeps every xref offset valid by
  // construction.
  //
  // The `ArrayBuffer` wrap is load-bearing, not defensive noise: `Buffer.from`
  // COPIES a Buffer or a typed-array view (honoring `byteOffset`), but SHARES
  // memory when handed a raw ArrayBuffer — which would edit the caller's bytes
  // out from under it while this function claims not to. The nearest plausible
  // future caller produces exactly that shape (`docs/src/components/studio/
  // export/pdf-export-worker.js` ends in `pdf.output('arraybuffer')`).
  const buf = Buffer.from(ArrayBuffer.isView(bytes) ? bytes : new Uint8Array(bytes));
  const epoch = opts.epoch != null ? opts.epoch : resolveEpoch(opts.env);
  const digits = pdfDateDigits(epoch);
  let pinned = 0;

  for (const key of KEYS) {
    const needle = Buffer.from(key, 'latin1');
    let from = 0;
    for (;;) {
      const at = buf.indexOf(needle, from);
      if (at === -1) break;
      from = at + needle.length;
      // The key must actually be followed by a literal date string. Anything
      // else — a `/ModDate` naming an indirect reference, or the byte sequence
      // turning up by chance inside a compressed stream — is left untouched.
      let i = from;
      while (i < buf.length && isSpace(buf[i])) i++;
      if (buf[i] !== 0x28 /* ( */) continue;
      i++;
      if (buf[i] !== 0x44 /* D */ || buf[i + 1] !== 0x3a /* : */) continue;
      if (pinDateAt(buf, i, digits)) pinned++;
    }
  }

  return { bytes: buf, pinned };
}

/**
 * Pin the dates on a pdf-lib `PDFDocument`, to be called immediately before
 * `doc.save()`.
 *
 * WHY THIS EXISTS ALONGSIDE THE BYTE PIN, which looks like duplication and is
 * not: `pinPdfTimestamps` above can only see dates it can READ, and pdf-lib's
 * `save()` defaults to `useObjectStreams: true` — which packs the Info
 * dictionary into a Flate-compressed object stream. The timestamp is still in
 * there, just deflated, so a byte-level scan finds nothing to pin. Worse, the
 * compressed length depends on the bytes going in, so a one-second difference
 * in the clock changed the FILE LENGTH: measured across two `--embed-source`
 * renders, 2,903 bytes differed and the files were 28,194 vs 28,195 bytes.
 *
 * So each of the four pdf-lib post-passes pins here, where the date is still a
 * live object; the byte pin then covers the Skia-only path, whose dates are
 * written in the clear.
 *
 * `PDFDocument.load` also stamps ModDate itself (its `updateMetadata` option
 * defaults to true), which is exactly why a post-pass that only reads and
 * re-saves still churned.
 *
 * @param {import('pdf-lib').PDFDocument} doc
 * @param {{epoch?: number, env?: object}} [opts]
 * @returns the same document, for chaining into `.save()`.
 */
function pinPdfLibDates(doc, opts = {}) {
  const epoch = opts.epoch != null ? opts.epoch : resolveEpoch(opts.env);
  const at = new Date(epoch * 1000);
  doc.setCreationDate(at);
  doc.setModificationDate(at);
  return doc;
}

module.exports = { pinPdfTimestamps, pinPdfLibDates, pdfDateDigits, resolveEpoch, DEFAULT_EPOCH };
