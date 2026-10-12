/**
 * WHICH SLIDES A SHIPPED PASS REBUILDS FROM THEIR TEXT, read off the registry itself.
 *
 * A data plugin's fence (lib/packages/code-door-fence.mjs) must not draw on a slide a shipped
 * transformer rebuilds from the slide's own bullets. `video` turns a bullet into a poster and a
 * link, `contact` and `wifi` into QR cards, `qr` into a QR from a link; each does it in the engine's
 * HTML pass AND again in the runtime's DOM pass (`applyAllToDom`, lib/runtime/index.js), over the
 * finished page, plugin output included. A plugin that returned `<li>https://evil.example/…</li>`
 * on a `video` slide got that address written into a poster (the red team, then the checker on the
 * hardening, 2026-10-12). The door's own slot cannot prevent the DOM half, so the door does not draw
 * there: the fence stays the code block it is, and a warning says why.
 *
 * DERIVED, not listed by hand: every registry transformer names the section classes it acts on in
 * its `selector`, so a pass added next year denies its slides the day it is registered. A selector
 * alternative with no class (`section`, `li > code`, `section[data-focus]`) acts on every slide and
 * builds no address, so it denies nothing. `GENERIC` names the few class sets that only lay out or
 * frame a slide; everything else is denied.
 */
const { TRANSFORMERS } = require('./registry');

/** Class sets a pass keys on that only frame or lay out a slide: it reads no text into an address. */
const GENERIC = Object.freeze([['form'], ['image'], ['image', 'statement'], ['split-panel'], ['split-compare']].map((a) => a.join(' ')));

let memo = null;

/**
 * Every [pass, classes] a registry transformer acts on: a slide holding ALL of `classes` is rebuilt by
 * `pass` (`section.closing.qr` is `closing` AND `qr`; a plain `closing` is not).
 * @returns {Array<{ pass: string, classes: string[] }>}
 */
function rebuiltAlternatives() {
  if (memo) return memo;
  const out = [];
  for (const t of TRANSFORMERS) {
    for (const alt of String(t.selector || '').split(',')) {
      // The section's own classes: up to the first space (a descendant, `section.logo-wall img`, is still that slide's).
      const head = alt.trim().replace(/:not\([^)]*\)/g, '').split(/\s/)[0];
      const classes = [...head.matchAll(/\.([A-Za-z0-9_-]+)/g)].map((m) => m[1]);
      if (!classes.length || GENERIC.includes([...classes].sort().join(' ')) || GENERIC.includes(classes.join(' '))) continue;
      out.push({ pass: t.name, classes });
    }
  }
  memo = Object.freeze(out);
  return memo;
}

/** The first shipped pass that rebuilds a slide with these classes, or null. @param {Iterable<string>} slideClasses */
function rebuiltBy(slideClasses) {
  const have = new Set(slideClasses);
  const hit = rebuiltAlternatives().find((a) => a.classes.every((c) => have.has(c)));
  return hit ? hit.pass : null;
}

module.exports = { rebuiltAlternatives, rebuiltBy, GENERIC };
