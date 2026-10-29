import { createRequire } from 'node:module';
import { files, MB } from './corpus.mjs';
import { md2 } from './lines-arm.mjs';
import { mdWithStage, parseLines, stageHand, stageSegno } from './staged.mjs';

const require = createRequire(new URL('../../../package.json', import.meta.url));
const MarkdownIt = require('markdown-it');
const base = new MarkdownIt('commonmark', { html: true, breaks: true }).enable(['table', 'strikethrough']);
base.core.ruler.disable(['inline', 'text_join']);
const sig = (toks) => toks.filter((t) => t.type !== 'inline').map((t) => `${t.type}${t.map ? t.map.join('-') : ''}${t.hidden ? 'h' : ''}${t.info || ''}`).join('|');
// the stage's arrays must equal the typed line index exactly (b, e, t, c) before parity is even asked
let arrBad = 0;
for (const x of files) { const h = stageHand(x.s), g = stageSegno(x.s); for (const k of ['b', 'e', 't', 'c', 'pipe', 'under', 'blank']) if (h[k].join() !== g[k].join()) { arrBad++; if (arrBad < 4) console.log('arrays differ', x.f, k); break; } }
console.log(`stage arrays, hand vs Segno: ${files.length - arrBad}/${files.length} identical`);
const arms = { 'markdown-it as shipped': base, 'M-lines (typed index)': md2, 'H-staged (hand stage + predicates)': mdWithStage(stageHand), 'S-staged (Segno stage + predicates)': mdWithStage(stageSegno) };
const want = files.map((x) => sig(base.parse(x.s, {})));
const best = (fn) => { for (let w = 0; w < 3; w++) fn(); let b = Infinity; for (let r = 0; r < 9; r++) { const t = process.hrtime.bigint(); fn(); b = Math.min(b, Number(process.hrtime.bigint() - t) / 1e9); } return b; };
let ref;
for (const [name, md] of Object.entries(arms)) {
  let ok = 0; files.forEach((x, i) => { if (sig(md.parse(x.s, {})) === want[i]) ok++; });
  const t = best(() => { for (const x of files) md.parse(x.s, {}); });
  ref ??= t;
  console.log(`${name.padEnd(38)} ${(MB / t).toFixed(1).padStart(6)} MB/s  ${(ref / t).toFixed(2)}x   parity ${ok}/${files.length}`);
}
const tH = best(() => { for (const x of files) stageHand(x.s); });
const tS = best(() => { for (const x of files) stageSegno(x.s); });
// The parse alone, so the stage's cost splits into the generated parser and the walk over its tape.
const tP = best(() => { for (const x of files) parseLines(x.s); });
console.log(`the stage alone: hand ${(MB / tH).toFixed(0)} MB/s, Segno ${(MB / tS).toFixed(0)} MB/s`);
console.log(`the Segno parse alone: ${(MB / tP).toFixed(0)} MB/s`);
