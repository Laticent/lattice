/**
 * The size of every picture in Lattice's sample-art folder (lib/samples/), so a `sample:` picture's box is known before its
 * bytes on EVERY host: the CLI could read the file, but the Studio, the Playground and an export in the browser cannot read a
 * header synchronously (media note §4.11, "the box before the bytes"). The table is the files' own header sizes;
 * test/unit/engine/sample-sizes.test.js reads every file in the folder and fails when a row is missing, stale or extra.
 */
const SAMPLE_SIZES = Object.freeze({
  'logo-acme-mark.svg': [240, 160],
  'logo-acme.svg': [240, 80],
  'logo-cobalt.svg': [240, 80],
  'logo-globex.svg': [240, 80],
  'logo-helios.svg': [240, 80],
  'logo-initech.svg': [240, 80],
  'logo-keystone.svg': [120, 120],
  'logo-lumen.svg': [240, 80],
  'logo-meridian.svg': [240, 80],
  'logo-northwind.svg': [240, 80],
  'logo-pinnacle.svg': [320, 80],
  'logo-quanta.svg': [240, 80],
  'logo-sable.svg': [240, 80],
  'logo-spire.svg': [80, 160],
  'logo-umbra.svg': [240, 80],
  'logo-vantage.svg': [240, 80],
  'photo-column.svg': [600, 1500],
  'photo-pano.jpg': [3200, 1200],
  'photo-pano.svg': [2400, 900],
  'photo-square.jpg': [2000, 2000],
  'photo-square.svg': [1000, 1000],
  'photo-tall-rotated.jpg': [1600, 2400],
  'photo-tall.jpg': [1600, 2400],
  'photo-tall.svg': [800, 1200],
  'photo-wide.jpg': [3200, 2000],
  'photo-wide.svg': [1600, 1000],
  'portrait-ada.svg': [100, 100],
  'portrait-jonah.svg': [100, 100],
  'portrait-kenji.svg': [100, 100],
  'portrait-marcus.svg': [100, 100],
  'portrait-nia.svg': [100, 100],
  'portrait-priya.svg': [100, 100],
  'portrait-sofia.svg': [100, 100],
  'portrait-tomas.svg': [100, 100],
  'video-poster.svg': [640, 360],
});

/** `{ w, h }` for a reference the author wrote as `sample:<name>`, or null for anything else. */
function sampleSize(ref) {
  const raw = String(ref ?? '').trim();
  if (!raw.startsWith('sample:')) return null;
  const row = Object.hasOwn(SAMPLE_SIZES, raw.slice(7)) ? SAMPLE_SIZES[raw.slice(7)] : null;
  return row ? { w: row[0], h: row[1] } : null;
}

module.exports = { SAMPLE_SIZES, sampleSize };
