// The readers the place oracle compares (place-oracle.test.js): each runs one corpus slide through one
// reader and returns the texts that reader called the chart row's record, in order, once each.
//
// The decision is wrapped BEFORE any reader loads, so each reader's destructured import is the wrapper.
// Require this module before the readers (the oracle test does).
const { JSDOM } = require('jsdom');
const MarkdownIt = require('markdown-it');

const rows = require('../../../lib/core/chart-rows.js');
let reader = null;
let log = [];
const decide = rows.ownsRecordSpan;
rows.ownsRecordSpan = function wrapped(classTokens, text, place) {
  const owned = decide.call(this, classTokens, text, place);
  if (reader) log.push({ reader, text, owned });
  return owned;
};

const engine = require('../../../lib/engine');
const { lintText } = require('../../../lib/authoring/lint.js');
const { isOwnedRecordElement } = require('../../../lib/core/resolve-inline-code.js');
const { deckOf } = require('./place-corpus.js');

const md = new MarkdownIt({ html: true });

/** Run `fn` as `name` and return the texts that reader called the record, in call order, once each. */
function owned(name, fn) {
  reader = name;
  log = [];
  try {
    fn();
  } finally {
    reader = null;
  }
  const seen = new Set();
  const out = [];
  for (const e of log) {
    if (e.owned && !seen.has(e.text)) {
      seen.add(e.text);
      out.push(e.text);
    }
  }
  return out;
}

/** The texts inside a fenced code block: never a record, and a reader that never looks at fences may still decide on them. */
function fencedTexts(body) {
  const out = new Set();
  let inFence = false;
  for (const line of body.replace(/\r/g, '').split('\n')) {
    if (/^\s*(?:```|~~~)/.test(line)) { inFence = !inFence; continue; }
    if (inFence) for (const m of line.matchAll(/\{[^{}`]*\}/g)) out.add(m[0]);
  }
  return out;
}

const READERS = {
  engine: (s) => owned('engine', () => engine.render(deckOf(s), {})),
  // bridgeLines calls the decision through its own module's binding, which the wrapper above cannot see, so
  // the narrator is read by what it did: the record texts the rewritten source no longer carries.
  narrator: (s) => {
    const src = `## A\n\n${s.body}\n`;
    const out = rows.bridgeRecordsSource(src, [s.chart]);
    const seen = new Set();
    // A record the narrator claimed was a single-backtick span in the input and is gone from the output.
    return [...src.matchAll(/(?<!`)`(\{[^{}`\n]*\})`(?!`)/g)].map((m) => m[1]).filter((t) => !seen.has(t) && seen.add(t) && !out.includes(`\`${t}\``));
  },
  lint: (s) => owned('lint', () => lintText(deckOf(s))),
  dom: (s) => {
    const dom = new JSDOM(`<!DOCTYPE html><html><body><section class="${s.chart}">${md.render(`## A\n\n${s.body}`)}</section></body></html>`);
    return owned('dom', () => {
      for (const code of dom.window.document.querySelectorAll('code')) isOwnedRecordElement(code);
    });
  },
};

module.exports = { READERS, fencedTexts, owned };
