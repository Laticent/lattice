/**
 * venue-capacity — how the docs surfaces print a component's per-venue budget.
 *
 * The numbers live in each manifest's `venueCapacity` (lib/components/manifest.schema.json),
 * measured by tools/calibrate-capacity.js at a wide @size. lint-core reads the same numbers
 * through lib/authoring/venue-capacity.generated.js, so the component docs, the pick list and
 * `lint:deck` state one budget. Record: engineering/decisions/2026-09-25-font-scale-fit.md,
 * Amendment 2026-09-27.
 *
 * Two formatters, one per surface: `venueDocsLine` for a component's `.docs.md` (a sentence an
 * author reads before writing), and `venuePickCell` for dist/docs/components.pick.md (four
 * numbers an agent scans while choosing).
 */

const VENUES = Object.freeze(['laptop', 'huddle', 'conference', 'hall']);

/** The venue row an author is told to write for: the longest measured element length, which is
 * the component's `density.soft` where it has one. */
function authoredRow(vc) {
  const lengths = Object.keys(vc.byWords).map(Number).sort((a, b) => a - b);
  const words = lengths[lengths.length - 1];
  return { words, row: vc.byWords[String(words)], lengths };
}

/**
 * The component's editorial ceiling at a wide @size — `capacity.hard`, tightened by
 * `adapt.capacity.wide.hard` the way lint-core's capacity loop tightens it. Past it,
 * `capacity-overflow` fires whatever the room, so a venue budget above it is not a budget an
 * author can use: `split-compare` measures 4 side by side at laptop, and holds 2 by design.
 */
function hardCap(m) {
  const caps = [m.capacity?.hard, m.adapt?.capacity?.wide?.hard].filter((n) => Number.isInteger(n));
  return caps.length ? Math.min(...caps) : null;
}

/** One cell: the measured count, capped by the component's own `hard`, with a `+` where the rig
 * never saw the component overflow (`atLeast`) and the cap did not bind. */
function count(vc, row, venue, cap) {
  if (cap != null && row[venue] >= cap) return String(cap);
  return `${row[venue]}${(vc.atLeast || []).includes(venue) ? '+' : ''}`;
}

/**
 * The `.docs.md` line. `noun` pluralizes the axis (the docs generator's own `axisNoun`), so the
 * line reads "items", "rows" or "lanes" the way the Capacity line above it does.
 */
function venueDocsLine(m, noun) {
  const vc = m.venueCapacity;
  if (!vc) return null;
  const how = 'Measured at a wide @size by `tools/calibrate-capacity.js`; see engineering/decisions/2026-09-25-font-scale-fit.md.';
  if (vc.none) return `**By venue** no count budget. ${vc.none}`;
  const past = 'Past the room\'s number, every slide that asked for that venue renders at the largest size they all fit, so the deck stays one size and the export\'s `↓ SCALE` line names the slide to trim; `lint:deck` flags it first (`capacity-scale`).';
  if (vc.lines) {
    const fmt = (r) => VENUES.map((v) => `${v} ~${r[v]}`).join(' · ');
    return `**By venue** the pane holds ${fmt(vc.lines.bare)} lines (${fmt(vc.lines.eyebrow)} under an eyebrow). ${past} ${how}`;
  }
  const { words, row, lengths } = authoredRow(vc);
  const cap = hardCap(m);
  const main = VENUES.map((v) => `${v} ~${count(vc, row, v, cap)}`).join(' · ');
  const short = lengths.length > 1
    ? ` At ~${lengths[0]} words each: ${VENUES.map((v) => count(vc, vc.byWords[String(lengths[0])], v, cap)).join(' · ')}.`
    : '';
  const floor = (vc.atLeast || []).some((v) => cap == null || row[v] < cap)
    ? ' A `+` means the rig tried that many and the slide still fit.'
    : '';
  const capped = cap != null && Object.values(vc.byWords).some((r) => VENUES.some((v) => r[v] > cap))
    ? ` No venue goes past the Capacity max of ${cap}, which holds in every room.`
    : '';
  return `**By venue** (\`venue:\`, ~${words} words each) it holds ${main} ${noun}.${short}${capped}${floor} ${past} ${how}`;
}

/** The pick-list cell: laptop/huddle/conference/hall at the authored length, capped by the
 * component's `hard`, or `—`. */
function venuePickCell(m) {
  const vc = m.venueCapacity;
  if (!vc || vc.none) return '—';
  if (vc.lines) return `${VENUES.map((v) => vc.lines.bare[v]).join('/')} lines`;
  const { row } = authoredRow(vc);
  const cap = hardCap(m);
  return VENUES.map((v) => count(vc, row, v, cap)).join('/');
}

module.exports = { VENUES, hardCap, venueDocsLine, venuePickCell };
