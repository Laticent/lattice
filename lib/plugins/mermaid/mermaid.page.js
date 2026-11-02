/**
 * lib/plugins/mermaid/mermaid.page.js — Mermaid's PAGE role: what the plugin does inside the page the HOST opens for its
 * bake (lib/plugins/host-page-worker.js, reached through the bake ctx's `runPage`; 2026-11-01-plugin-contract-hollywood.md
 * §2). The host launches the sandbox, serves the locked origin and calls `draw`; this file names the page's files by key
 * (`assets`) and draws the batch in it (`draw`). It launches and confines nothing.
 */
const { assets, drawInPage } = require('./shared/render-worker.js');

module.exports = { assets, draw: drawInPage };
