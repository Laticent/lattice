/**
 * LAYER 2, on its own. The chain probe beside this proves the SERIALIZER fix stops the
 * terminator ever reaching the composed sheet. That leaves the sink guard untested by
 * that probe — a pass there would be the serializer's, not the frame's.
 *
 * So: hand the frame CSS that ALREADY carries `</style>` (as any future path putting
 * caller text into theme CSS would), and run it through the SHIPPED sanitizeStyleText.
 * Three arms in one browser, same assembly, so the difference is the guard alone.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import puppeteer from 'puppeteer';

mkdirSync('.scratch/surface', { recursive: true });
// The shipped kernel's source, evaluated in the page — the same bytes the docs bundle
// imports, not a re-implementation.
const KERNEL = readFileSync('lib/core/sanitize-style-text.mjs', 'utf8')
  .replace(/^export function/m, 'function')
  .replace(/\nexport default[\s\S]*$/, '\n');

const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage();
await page.setContent('<div id="host"></div>');

const rows = await page.evaluate(async ({ KERNEL }) => {
  // eslint-disable-next-line no-new-func
  const sanitizeStyleText = new Function(`${KERNEL}; return sanitizeStyleText;`)();

  const cases = {
    'raw </style> (guard OFF)': { css: 'section{color:red}</style><img src=x onerror="window.top.__SG=\'raw\'">', guard: false },
    'raw </style> (guard ON)': { css: 'section{color:red}</style><img src=x onerror="window.top.__SG=\'guarded\'">', guard: true },
    'inside a well-formed CSS comment (guard ON)': { css: 'section{color:red}/* palette </style><img src=x onerror="window.top.__SG=\'incomment\'"> */section{color:red}', guard: true },
    'inside a CSS string (guard ON)': { css: 'section{color:red}section::after{content:"</style><img src=x onerror=\'window.top.__SG=1\'>"}', guard: true },
    'uppercase </STYLE> (guard ON)': { css: 'section{color:red}</STYLE><img src=x onerror="window.top.__SG=\'upper\'">', guard: true },
  };

  const out = [];
  for (const [label, { css, guard }] of Object.entries(cases)) {
    delete window.__SG;
    const text = guard ? sanitizeStyleText(css) : css;
    const doc = `<!doctype html><html><head><meta charset="utf-8"><style id="lattice-theme">${text}</style></head><body><section>slide</section></body></html>`;
    document.getElementById('host').innerHTML = '';
    const fr = document.createElement('iframe');
    fr.srcdoc = doc;
    document.getElementById('host').appendChild(fr);
    await new Promise((r) => { fr.onload = r; setTimeout(r, 700); });
    await new Promise((r) => setTimeout(r, 200));
    const d = fr.contentDocument;
    out.push({
      case: label,
      guard,
      styleIntact: (d?.querySelector('#lattice-theme')?.textContent.length ?? -1) >= text.length,
      strayNodes: d ? d.querySelectorAll('img[src="x"]').length : -1,
      scriptRan: window.__SG || null,
      // The CSS still has to WORK — a guard that breaks the stylesheet is not a fix.
      ruleApplies: d ? getComputedStyle(d.querySelector('section')).color : '',
    });
  }
  return out;
}, { KERNEL });

console.log('| case | guard | style intact | stray nodes | SCRIPT RAN | section color |');
console.log('|---|---|---|---|---|---|');
for (const r of rows) {
  console.log(`| ${r.case} | ${r.guard ? 'ON' : 'OFF'} | ${r.styleIntact ? 'yes' : 'TRUNCATED'} | ${r.strayNodes} | ${r.scriptRan ? `**YES (${r.scriptRan})**` : 'no'} | ${r.ruleApplies} |`);
}
writeFileSync('.scratch/surface/sink-guard.json', JSON.stringify(rows, null, 2));
await browser.close();
