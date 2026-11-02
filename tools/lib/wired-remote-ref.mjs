#!/usr/bin/env node
/**
 * wired-remote-ref — lib/core/remote-ref.js with Segno R3 switched on, in a temporary folder, for the
 * gates that must measure the switch before it ships.
 *
 * R3 (engineering/decisions/2026-10-27-segno-reports-facts-callers-decide.md §"R3 built, not wired") is built and
 * held to its evidence, but remote-ref.js still reads markup with the hand-written `scanHtml`: the
 * generated parser puts the Studio's eager JavaScript past its route-budget ceiling, which is the owner's
 * to raise. This writes a copy of remote-ref.js whose `scanHtml` is the reader over the generated parser
 * (`risky` read from its `unsure` spans), with every sibling it requires, and returns its path.
 * tools/check-html-ref-spans.mjs loads it; `npm run fuzz:web-refs -- --scanner-file "$(node
 * tools/lib/wired-remote-ref.mjs)"` fuzzes it in three engines.
 *
 * Usage as a script: prints the path. As a module: `wiredRemoteRef()` returns it.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CORE = path.join(ROOT, 'lib', 'core');
const EXPORTS = /^module\.exports = \{/m;
// The switch, as it will read in remote-ref.js: the reader's `unsure` is what `risky` meant.
const SWITCH = [
  "const readHtmlR3 = require('./html-ref-reader.js').makeScanHtml(require('./html-ref.generated.js'));",
  'scanHtml = (html) => { const r = readHtmlR3(html); return { tags: r.tags, risky: r.unsure.length > 0, unsure: r.unsure }; };',
].join('\n');

export function wiredRemoteRef() {
  const src = fs.readFileSync(path.join(CORE, 'remote-ref.js'), 'utf8');
  if (!/^function scanHtml\(html\) \{/m.test(src) || !EXPORTS.test(src)) throw new Error('wired-remote-ref: remote-ref.js no longer declares `function scanHtml` before its exports; update the switch');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'remote-ref-r3-'));
  for (const f of fs.readdirSync(CORE)) if (f.endsWith('.js') && f !== 'remote-ref.js') fs.copyFileSync(path.join(CORE, f), path.join(dir, f));
  fs.writeFileSync(path.join(dir, 'remote-ref.js'), src.replace(EXPORTS, `${SWITCH}\nmodule.exports = { scanHtml, `));
  return path.join(dir, 'remote-ref.js');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) console.log(wiredRemoteRef());
