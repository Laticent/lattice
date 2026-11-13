/**
 * The runtime (DOM) half of every QR-card adapter (wifi.js, contact.js and gift-card.js beside this file): rebuild
 * each `section.<name>` from its own markup with `renderCard`, and WRITE ONLY WHEN THE ANSWER CHANGED. Assigning `innerHTML` replaces the children even when the string is the same,
 * and that childList mutation schedules the runtime's next content pass. Two inputs return their input unchanged and
 * so looped, a pass every ~150 ms for as long as the slide was open: a card already built (caught by the `.qr-card`
 * guard since the 117-slide gallery measurement) and a slide with NO fields yet, which `renderCard` leaves as authored
 * (an author mid-typing; measured in Chromium 2026-11-11, 21 passes in 3 s on one `wifi` slide where a `content`
 * slide ran 2). Comparing the answer covers both, and any later shape that returns its input.
 * @param {ParentNode} root
 * @param {string} name  the component class (`wifi`, `contact`, `gift-card`)
 * @param {(inner: string) => string} renderCard
 */
function rebuildCardsInDom(root, name, renderCard) {
  if (!root || typeof root.querySelectorAll !== 'function') return;
  for (const sec of root.querySelectorAll(`section.${name}`)) {
    // ANYWHERE in the section, not as a direct child: masthead-lift moves the card into `.cell-stage` on the first pass.
    if (sec.querySelector('.qr-card')) continue;
    const before = sec.innerHTML;
    const after = renderCard(before);
    if (after !== before) sec.innerHTML = after;
  }
}

module.exports = { rebuildCardsInDom };
