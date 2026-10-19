// Test helper: run the player's local-file inliner on an HTML fragment the way the assembler does, on a parsed
// document, and hand back what a test asserts on (`html` is the body's markup after the bake).
const { JSDOM } = require('jsdom');
const { inlineDocAssets } = require('../../../lib/export/html-player.js');

function bake(fragment, opts = {}) {
  const dom = new JSDOM(`<!DOCTYPE html><html><head></head><body>${fragment}</body></html>`);
  const r = inlineDocAssets(dom.window.document, opts);
  return { ...r, doc: dom.window.document, html: dom.window.document.body.innerHTML };
}

module.exports = { bake };
