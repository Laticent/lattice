---
status: proposed
summary: >
  `contact` and `wifi` lose their QR code, phone and URL at huddle and above, and nothing warns,
  because their manifests say `venueCapacity: none` ("a fixed card, nothing to count") and the
  only venue check is a count budget. `npm run check:venue-conformance` renders every component at
  every venue and looks instead. It found 15 of the 45 components exempted with `none` failing at
  some venue, `contact` and `wifi` from huddle. A realistic vCard QR is 67 modules wide, 2.5 times a
  `tel:` code's 27, which is why the hall fix needs a lean payload as well as a bigger code.
  Four calls are the owner's (§6).
builds-on: 2026-09-29-one-reading-size-per-venue.md
---

# Venue conformance: render it, don't count it

**Status:** proposed 2026-10-22 · **Owner:** Sharmarke · **Code:** `tools/check-venue-conformance.js`
(the harness, shipped here); the `contact`/`wifi` fix is §4 and waits on §6.

## 1 · What was reported

The `contact` card does not suit a hall or a conference room, and it needs to support a telephone.

## 2 · What the audit found

**`contact` at hall** (a 3-line card with a realistic title and org, `venue: hall`): the name alone,
at `--fs-hero` × 1.5 = 129pt, fills the card. The QR code, the email, the phone and the URL are
pushed past the frame and clipped; the export prints "Content clipped". At laptop the same card
only just fits.

**Even the shipped sample fails.** `contact.manifest.json`'s own `sample` (a 2-line name, 132-byte
vCard) clips its URL at huddle (a TV in a small room), its email and caption at conference, and
all of it at hall. `wifi` fails the same way, from huddle. Both build on one kernel,
`lib/components/connect/_qr-card/`.

**Why nothing warned.** The venue system's only fit check is a count budget
(`venueCapacity`, `lint:deck`'s `capacity-scale`). `contact` and `wifi` opted out with
`venueCapacity.none`, a free-text sentence saying there is nothing to count. Nothing checked the
sentence. The card has nothing to count and still clips, because the size of its parts is not a
count.

**The same hole, catalog-wide.** `check:venue-conformance` (V1 engine marks the slide clipped, V2
anything visible sits outside the slide or its clipping ancestor, V3 QR too small) over all 79
components, bare and per variant, four venues (a 53-second run):

| Class | Components | Failing at some venue | Covered by a lint warning? |
|---|---|---|---|
| `venueCapacity.none` (45) | 45 | **15**: big-number@hall, citation-card@huddle, collage@hall, columns@conference, contact@huddle, gantt@conference, image@hall, journey@conference, logo-wall@huddle, math@hall, matrix-grid@huddle, progress@hall, redline@hall, rows@huddle, wifi@huddle | **No** |
| has a count budget (34) | 34 | 22 (a sample sized for laptop is over its hall budget) | Yes, by design |

The engine's own export warning independently confirms `big-number` at hall, `citation-card` and
`rows` at huddle. **Not yet verified by eye:** the other 12 in the `none` row, and the 22 budgeted
ones (their clipping is expected, since the sample was sized at laptop). The charts in the
`none` row (`gantt`, `journey`, `matrix-grid`, `math`, `progress`) may be probe noise at a chart
edge; each needs a look before anyone fixes it. 40 laptop rows also fail (for example
`agenda cards`, `authority-chain branching`, `kpi compliance`); they predate venues and are
unexamined.

## 3 · Why `contact` fails: four causes

1. **The name is display text with no ceiling.** `.qr-name` is `--fs-hero`, and a venue multiplies
   every role (§8 of the one-reading-size note: titles scale too). Hero at hall is 129pt.
2. **The card is built for one shape.** A two-column flex row with 2.9em padding; the 58% identity
   column wins the space, so the QR column is squeezed or pushed out.
3. **The ledger reads at the support size** (`--fs-body-compact`, 23pt at hall) and the QR tile is a
   fixed `8em`. Both are fine at laptop and wrong across a room.
4. **The code is dense.** Measured with the shipped encoder: a realistic vCard (name, title, org,
   email, phone, URL) is 218 bytes and a **67 × 67 module** QR; the sample's 132 bytes is 55 × 55.
   A `tel:` payload is **27 × 27** and a short URL 35 × 35. At the same printed width a module of
   the `tel:` code is 2.5 times larger, so it scans from about 2.5 times further. Making the dense
   code big enough for a hall costs more width than the slide has.

## 4 · Proposed fix for `contact` and `wifi` (one kernel, HARD RULE #1)

**A. A venue-aware card in `_qr-card`.**
- **The name stops using hero.** At conference and hall it takes a role that is sized to fit
  (`--fs-h1`, or a clamp to the card width), so it cannot push the rest out. Measured target: all
  five lines of the sample card in frame at every venue.
- **Stack below the name at conference and hall:** identity on top, QR and ledger in a row below,
  so the QR keeps a share of the slide width set by `SCAN_MIN`.
- **The ledger reads at `--fs-body`** at conference and hall, not the support size.
- **The QR tile is a share of the slide, not `8em`**, floored by `SCAN_MIN[venue]`.

**B. A lean QR mode** (`qr: vcard | tel | url`, a card-level key, default `vcard`). A hall deck
picks `tel` or `url` and gets a 27- or 35-module code. A vCard remains available and is the right
choice at a desk.

**C. Telephone as a first-class field.**
- Today `phone` is accepted (`phone|tel|mobile`) and appears in the ledger and the vCard's `TEL`.
  It is one field, untyped, shown as plain text in the smallest ledger role. There is no way to
  list a mobile and an office line, or to make the QR dial.
- Proposed: `mobile`, `office`/`work` and `phone` become distinct keys, each a `TEL;TYPE=` line in the
  vCard (`CELL`, `WORK`, `VOICE`); the card shows up to two and leads with the first; the `tel:`
  QR mode dials the first one, with the number normalized for the code (spaces and punctuation
  stripped, `+` kept) while the slide shows it as authored.

## 5 · The harness, and what it does not do yet

`npm run check:venue-conformance` (`tools/check-venue-conformance.js`, built on
`audit-reading-size`'s render rig, which now exports `probeDeck`, `render`, `splitSample`). A
report by default; `--strict` fails on an unnamed failure or a stale `KNOWN` entry.

- It is **not wired into CI**. 643 failing rows today would fail it on day one, and adding a CI
  step is the owner's call (§6).
- `SCAN_MIN` (10 / 12 / 16 / 22% of slide width) is **my proposal**, derived from "a phone reads a
  code from about ten times its width" and the room table in `typography.md` §7. It is a number
  the owner sets.
- It checks the sample, not a trimmed or worst-case deck: a component that fits its sample and
  clips its longest realistic content is not caught. For `contact` the realistic-content case was
  found by hand (§2); a longer-content probe (the `check:jank` content sweep applies here) is the
  next step.
- Its V2 can over-report at a chart's edge, where marks legitimately overshoot a clip box.

## 6 · Calls for the owner

1. **Fix shape for `contact`/`wifi`.** Recommended: **A + B + C**. A alone fixes the clipping but
   leaves the hall code too dense to scan from the back (§3.4). B adds a lean code, costing a new
   authoring key. C is the telephone request.
2. **`SCAN_MIN` numbers** (§5). Recommended as proposed; they are the first thing a venue-testing
   session should measure on a real projector.
3. **Wiring the harness.** Options: (a) leave on-demand (cost 0, catches nothing unprompted);
   (b) a nightly workflow that posts the failing-row count; (c) a ratcheted CI step like
   `overflow:check`, with a committed baseline that may only go down. Recommended: (c), in a
   follow-up PR after the 15 `none` failures are triaged, so the baseline starts near zero. Adding
   a CI step changes the CI contract, so this is yours.
4. **What `venueCapacity.none` means.** Recommended: a `none` justification stays free text but
   the manifest schema requires the component to pass `check:venue-conformance` at all four
   venues, so the sentence is verified instead of trusted. Today it is not.
5. **Scope of the follow-up.** The other 13 `none` components that fail (§2) are separate fixes
   after a visual check of each; I did not touch them.
