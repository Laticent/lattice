/**
 * lib/runtime/video-card.js — the `video` card around a figure the runtime drew on a Marp render (lib/runtime/index.js
 * `drawVideoRecords`), built by the layout's own composer (`renderSection`, lib/components/imagery/video/video.transform.js, the
 * engine's HTML-pass call), WITHOUT re-serializing the figure.
 *
 * WHY THE PLACEHOLDER. The composer reads markup, so the slide goes to it as a string. A browser that leaves `<` raw inside an
 * attribute when it serializes (Chromium before about 138, older Firefox, jsdom) would hand it a figure whose
 * `data-lattice-title` holds `x</figure><img onerror=…>`: the composer's `</figure>` search ends the figure inside the attribute,
 * and the rest of the title comes back as live markup (red team, 2026-11-10). So the figure goes in as a placeholder that carries
 * no author text, only the provider's watch URL, which the URL parser has percent-encoded (no `<`, `>` or `"`), because a `qr`
 * slide's code needs it; the composer regroups the slide around the placeholder, and the drawn figure NODE then takes its place,
 * with the QR code the composer added moved into it. Nothing the author wrote in the record is parsed twice.
 */
const { renderSection } = require('../components/imagery/video/video.transform.js');

const DRAWN = 'figure[data-lattice-marp-record]';
const SLOT = 'data-lattice-marp-slot';

/**
 * @param {Element} section  a `section.video` that holds a figure the runtime drew and no card yet
 */
function composeVideoCard(section) {
  const doc = section.ownerDocument;
  const real = section.querySelector(DRAWN);
  if (!real || section.querySelector('.video-card')) return;
  const ph = doc.createElement('figure');
  // The plugin's figure opening, attribute for attribute and in its order, which the composer finds by its exact bytes
  // (video.transform.js `FIGURE_OPEN`): the class, then the media kind.
  ph.className = 'video-embed lat-media';
  ph.setAttribute('data-lattice-media', 'video');
  ph.setAttribute('data-lattice-media-url', real.getAttribute('data-lattice-media-url') || '');
  ph.setAttribute(SLOT, '');
  const aside = doc.createElement('div');
  aside.className = 'video-aside';
  ph.append(aside);
  real.replaceWith(ph);
  section.innerHTML = renderSection(section.innerHTML, section.className);
  const slot = section.querySelector(`figure[${SLOT}]`);
  if (!slot) return;
  const realAside = real.querySelector('.video-aside');
  const added = slot.querySelector('.video-aside');
  if (realAside && added) realAside.prepend(...added.childNodes);
  slot.replaceWith(real);
}

module.exports = { composeVideoCard };
