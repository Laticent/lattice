'use strict';

/**
 * Close a jsdom window that ran the lattice runtime without leaking a frame interval.
 *
 * jsdom's `window.close()` stops its timers and THEN empties `<body>`. That mutation wakes the runtime's
 * MutationObserver in a microtask, the observer asks for an animation frame, and jsdom starts a fresh 60 Hz
 * interval that nothing clears. The callback runs against the torn-down document and jsdom's
 * `reportException` reads `window.location`, which is null: an uncaught
 * `Cannot read properties of null (reading '_location')` in whichever test runs next. A real browser never
 * runs frame callbacks for a closed window, so this is jsdom only.
 *
 * Refusing frame requests before the close removes the leak. (These tests used to pass without it because the
 * Mermaid boot wait kept a frame callback outstanding in every document, so the interval `close()` cleared was
 * always the live one. That loop no longer runs in a document with no diagram, and nothing here depended on it.)
 *
 * @param {import('jsdom').DOMWindow} win
 */
function closeQuietly(win) {
  win.requestAnimationFrame = () => 0;
  win.close();
}

module.exports = { closeQuietly };
