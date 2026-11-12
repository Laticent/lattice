// Measure the chat-CRDT options of engineering/decisions/2026-11-12-chat-threads-crdt.md §4.
// usage (from docs/, where yjs and esbuild are installed): node ../engineering/decisions/2026-11-12-chat-threads-crdt/measure.mjs
// Prints the storage sizes of one 60-message thread as plain JSON, as purpose-built CRDT records and as a Yjs
// document (before and after 30 flag edits and a compaction), the time to load a Yjs thread, and Yjs's minified,
// gzipped bundle size.
import { createRequire } from 'node:module';
import zlib from 'node:zlib';

const require = createRequire(`${process.cwd()}/`);
const Y = require('yjs');
// A realistic thread: 60 messages, ~600 chars each (the storage bench's shape), every 4th reply with a proposal.
const msgs = Array.from({ length: 60 }, (_, k) => ({ role: k % 2 ? 'assistant' : 'user', content: 'x'.repeat(600) + k, ...(k % 4 === 3 ? { proposed: [{ label: 'Slide 1', slide: 1, action: 'replace', after: 'y'.repeat(200) }] } : {}) }));
const plain = JSON.stringify(msgs).length;
// Purpose-built: id + HLC stamp per message, per-field stamps for the few mutable fields.
const pb = msgs.map((m, i) => ({ ...m, id: `m${i.toString(36)}-abcdef12`, at: `1794700000000-0000-tabid123` }));
const pbLen = JSON.stringify(pb).length;
// Yjs: Y.Array of Y.Map, one per message.
const doc = new Y.Doc();
const arr = doc.getArray('m');
doc.transact(() => { for (const [i, m] of msgs.entries()) { const y = new Y.Map(); y.set('id', pb[i].id); for (const [k, v] of Object.entries(m)) y.set(k, v); arr.push([y]); } });
const y0 = Y.encodeStateAsUpdate(doc).length;
const fullDoc = new Y.Doc();
Y.applyUpdate(fullDoc, Y.encodeStateAsUpdate(doc));
// 30 flag edits (apply / discard), then a compaction as the Studio does it today (chat-compact.ts applyCompaction):
// drop the first 40 messages and set `compacted` (the briefing) on the first kept one.
for (let i = 0; i < 30; i++) arr.get(3 + (i % 15) * 4)?.set('applied', i % 2 === 0);
const briefing = { summary: 'briefing '.repeat(100), count: 40, saved: 9000 };
doc.transact(() => { arr.delete(0, 40); arr.get(0).set('compacted', briefing); });
const y1 = Y.encodeStateAsUpdate(doc).length;
// Load time: decode the full 60-message thread into a fresh document, 1000 times (the cost of opening a chat).
const full = Y.encodeStateAsUpdate(fullDoc);
const t0 = performance.now();
for (let i = 0; i < 1000; i++) Y.applyUpdate(new Y.Doc(), full);
const per = (performance.now() - t0) / 1000;
const esbuild = require('esbuild');
const built = await esbuild.build({ stdin: { contents: "import * as Y from 'yjs'; const d = new Y.Doc(); d.getArray('m').push([new Y.Map()]); Y.applyUpdate(new Y.Doc(), Y.encodeStateAsUpdate(d));", resolveDir: process.cwd(), loader: 'js' }, bundle: true, minify: true, format: 'esm', write: false });
const bundle = Buffer.from(built.outputFiles[0].contents);
console.log(JSON.stringify({ yjsMinifiedKB: +(bundle.length / 1024).toFixed(1), yjsGzKB: +(zlib.gzipSync(bundle).length / 1024).toFixed(1), plainJSON: plain, purposeBuilt: pbLen, purposeBuiltOverheadPct: +((pbLen / plain - 1) * 100).toFixed(1), yjsUpdate: y0, yjsAfterEditsAndCompaction: y1, plainAfterCompaction: JSON.stringify([{ ...msgs[40], compacted: briefing }, ...msgs.slice(41)]).length, yjsLoadMsPerThread: +per.toFixed(3) }, null, 1));
