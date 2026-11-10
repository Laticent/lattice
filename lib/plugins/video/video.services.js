/**
 * lib/plugins/video/video.services.js — what the video plugin offers code outside it, by name (lib/core/plugin-services.js).
 *
 * A MARP RENDER'S RECORDS (./shared/video-marp-*.js). Marp runs none of Lattice's rules, and the runtime never builds an address
 * from the page (spec/LPM.md §10), so a record reaches a Marp render from the deck's Markdown instead:
 *   · `marpEngineSource` — the source of the markdown-it plugin a Marp config installs as its `engine`: it reads the records from
 *     the tokens and writes them into one data block. The kit (tools/build-marp-kit.js) and the export bundle
 *     (lib/export/marp-bundle.js) write it into their `marp.config.cjs`.
 *   · `readMarpRecordBlock` — the runtime reads that block (a marp-cli render);
 *   · `marpRecords` — or the saved deck's text (the VS Code preview): every record span it holds;
 *   · `drawMarpRecords` — and draws each lone span whose text is one of those records, with this plugin's ctx (its provider table).
 * Required inside each function, not at the top: the generated services table requires THIS file.
 */
const services = (ctx) => Object.freeze({
  marpEngineSource: () => require('./shared/video-marp-engine.js').latticeVideoRecords.toString(),
  readMarpRecordBlock: (doc) => require('./shared/video-marp-dom.js').readRecordBlock(doc),
  marpRecords: (markdown) => require('./shared/fences.js').recordSpans(markdown),
  drawMarpRecords: (doc, records, skip) => require('./shared/video-marp-dom.js').drawRecords(doc, records, { ctx, skip }),
});

module.exports = { services };
