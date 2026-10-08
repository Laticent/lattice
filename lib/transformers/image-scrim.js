/**
 * image-scrim transformer — injects a `.image-scrim` div into an
 * `image statement` section so the dark scrim renders behind the editorial
 * title overlay.
 *
 * `statement` is the one composition that puts text directly on the photo, so
 * it's the only one that needs a scrim — `clean` / `split` / `gallery` carry
 * their own contrast (a card / matte / panel) and `spotlight` uses a SOLID card.
 * statement is opt-in (never auto-resolved), so it's always the author's
 * `statement` class — a static selector, no measurement needed.
 *
 * A real DOM element (not a `::before`) so the scrim is a normal,
 * always-rendered node in every render path. The injected node is `aria-hidden`
 * because it's decorative.
 *
 * Render paths: the runtime injects it via `applyToDom` (DOM walk, by class);
 * the engine/emulator inject it by class in `engineSlides` using the
 * `needsScrim` / `SCRIM_HTML` primitives exported below.
 */

const SCRIM_HTML = '<div class="image-scrim" aria-hidden="true"></div>';

function needsScrim(cls) {
  if (typeof cls !== 'string' || !cls) return false;
  if (!/\bimage\b/.test(cls)) return false;
  return /\bstatement\b/.test(cls);
}

// Runtime path (lattice-runtime DOM walk). The content section is identified by
// its `image.statement` class; the scrim sits behind the text overlay.
function applyToDom(root) {
  if (!root || typeof root.querySelectorAll !== 'function') return;
  const sections = root.querySelectorAll('section.image.statement');
  for (const section of sections) {
    if (section.querySelector(':scope > .image-scrim')) continue;
    const scrim = section.ownerDocument.createElement('div');
    scrim.className = 'image-scrim';
    scrim.setAttribute('aria-hidden', 'true');
    section.insertBefore(scrim, section.firstChild);
  }
}

module.exports = {
  name: 'image-scrim',
  layouts: ['image.statement'],
  selector: 'section.image.statement',
  applyToDom,
  // Primitives reused by the engine/emulator's engine-backed path, which injects
  // the scrim by class in engineSlides. See lattice.js.
  needsScrim,
  SCRIM_HTML,
};
