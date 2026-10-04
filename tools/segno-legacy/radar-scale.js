// Frozen copy of radar.transform.js `parseScale` from main before Segno phase 2 (see README.md).
// The codemod reads it to recognize a radar eyebrow that pinned the scale (`Scale · 0–100`).
function parseScale(text) {
  const t = String(text);
  let m = t.match(/(-?[\d.]+)\s*(?:[–—-]|to)\s*(-?[\d.]+)/);
  if (m) {
    const min = parseFloat(m[1]), max = parseFloat(m[2]);
    if (Number.isFinite(min) && Number.isFinite(max) && max > min) return { min, max };
  }
  m = t.match(/(?:^|\s)([\d.]+)\s*$/);
  if (m) {
    const max = parseFloat(m[1]);
    if (Number.isFinite(max) && max > 0) return { min: 0, max };
  }
  return null;
}

module.exports = { parseScale };
