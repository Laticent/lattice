/**
 * A seeded generator of Markdown that carries a Mermaid diagram naming a web address: the fence
 * spelled every way CommonMark allows, and inside it the three ways a diagram fetches on render
 * plus the links it follows on a click (engineering/decisions/2026-10-26-web-ref-fuzz.md §Mermaid:
 * an `img:` shape, an `<img>` in an HTML label, `themeCSS` with a `url()`, and `click … href`).
 *
 * The scanner (`blockWebImages`, `mermaidRemoteRefs` in lib/core/remote-ref.js) reads a diagram's
 * TEXT, and Mermaid draws it later, so the two can disagree about what the text names. This
 * generator writes the spellings of that text nobody listed: entity codes in HTML and in Mermaid's
 * own `#58;` form, tabs the URL parser drops, a scheme in capitals, a protocol-relative address,
 * and the fence itself (backticks or tildes, three to six of them, a language with attributes,
 * indented, in a quote, in a list, or no language at all, which nothing draws).
 *
 * `mermaidInputs(seed, count, base)` returns `{ name, kind: 'mermaid', fetch, text }` rows. `text`
 * is a Markdown document; `fetch` is the class (`img-shape`, `label-img`, `theme-css`, `click`).
 * Each input names `${base}/<name>`, and `name` is unique to it, so a request in the loopback
 * server's log names the input that made it. Same seed, count and base, same inputs everywhere.
 */
const { prng } = require('./web-ref-fuzz.js');

const DIAGRAM_CLASSES = ['img-shape', 'label-img', 'theme-css', 'click'];

function makeKit(next) {
  const int = (n) => Math.floor(next() * n);
  const chance = (p) => next() < p;
  const pick = (xs) => xs[int(xs.length)];

  /** The address as Mermaid text may spell it: each `:`, `/` and `.` sometimes an entity code. */
  function spelled(url) {
    const codes = {
      ':': ['&#58;', '&#x3a;', '#58;', '&colon;', '&#58'],
      '/': ['&#47;', '&#x2f;', '#47;', '&sol;'],
      '.': ['&#46;', '#46;', '&period;'],
    };
    let out = '';
    for (const c of url) out += codes[c] && chance(0.15) ? pick(codes[c]) : c;
    // A tab the URL parser drops, typed raw or as Mermaid's `#9;`, somewhere in the scheme.
    if (chance(0.15)) out = out.replace(/^(\w)(\w+)/, (_m, a, b) => `${a}${pick(['\t', '#9;', '&#9;'])}${b}`);
    return out;
  }

  /** A diagram body that names `url` through one fetch class. */
  function body(url, fetch) {
    const u = spelled(url);
    const q = pick(['"', '"', "'"]);
    const kind = pick(['flowchart LR', 'flowchart TD', 'graph LR']);
    switch (fetch) {
      case 'img-shape':
        return `${kind}\n  A@{ ${pick(['img', 'IMG', 'img '])}: ${q}${u}${q}, label: "x", pos: "t", w: 40, h: 40 }\n  A --> B`;
      case 'label-img':
        return `${kind}\n  A[${q === '"' ? "'" : '"'}<${pick(['img', 'IMG', 'img '])} src=${q}${u}${q}>${q === '"' ? "'" : '"'}] --> B`;
      case 'theme-css': {
        const css = `.node rect { fill: ${pick(['url', 'URL', 'u\\rl'])}(${u}) }`;
        return `%%{init: {"themeCSS": "${css.replace(/"/g, '\\"')}"}}%%\n${kind}\n  A --> B`;
      }
      default: {
        const how = pick([
          () => `${kind}\n  A --> B\n  click A href ${q}${u}${q}`,
          () => `${kind}\n  A --> B\n  click A ${q}${u}${q}`,
          () => `${kind}\n  A --> B\n  ${pick(['Click', 'CLICK', 'click'])} A href ${q}${u}${q} _self`,
          () => `classDiagram\n  class Report\n  click Report href ${q}${u}${q}`,
        ]);
        return how();
      }
    }
  }

  /** The fence around `inner`: its marker, its length, its info string and where it sits. */
  function fence(inner) {
    const mark = pick(['`', '`', '~']);
    const len = 3 + int(4);
    const open = mark.repeat(len);
    const info = pick(['mermaid', 'mermaid', 'mermaid', ' mermaid', 'mermaid {.x}', 'mermaid title="x"', '{.mermaid}', 'Mermaid', '']);
    const close = mark.repeat(len + (chance(0.3) ? int(3) : 0));
    const block = `${open}${info}\n${inner}\n${close}`;
    const where = pick(['top', 'top', 'top', 'indent', 'quote', 'list']);
    switch (where) {
      case 'indent': return block.split('\n').map((l) => `   ${l}`).join('\n');
      case 'quote': return block.split('\n').map((l) => `> ${l}`).join('\n');
      case 'list': return `- item\n\n${block.split('\n').map((l) => `  ${l}`).join('\n')}`;
      default: return block;
    }
  }

  return { int, chance, pick, body, fence };
}

/**
 * @param {number} seed
 * @param {number} count
 * @param {string} base  the origin each input names
 * @param {{ from?: number }} [opts]  input i depends only on (seed, i), so a failing index replays alone
 * @returns {Array<{ name: string, kind: 'mermaid', fetch: string, text: string }>}
 */
function mermaidInputs(seed, count, base, { from = 0 } = {}) {
  const out = [];
  for (let i = from; i < from + count; i++) {
    const kit = makeKit(prng((seed ^ Math.imul(i + 1, 0x85ebca6b)) >>> 0));
    const name = `m${(seed >>> 0).toString(36)}-${i}`;
    const fetch = kit.pick(DIAGRAM_CLASSES);
    const scheme = kit.pick(['http://', 'http://', 'http://', 'HTTP://', 'Http://', '//']);
    const url = `${base}/${name}`.replace(/^http:\/\//, scheme);
    out.push({ name, kind: 'mermaid', fetch, text: `# ${name}\n\n${kit.fence(kit.body(url, fetch))}\n` });
  }
  return out;
}

module.exports = { mermaidInputs, DIAGRAM_CLASSES };
