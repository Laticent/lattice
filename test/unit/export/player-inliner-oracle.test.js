// A differential check of the player inliner's tag reader against a real HTML parser (parse5, the one jsdom and
// browsers' spec tests use). The LEAK direction is the one that matters for HARD RULE #22: every position the parser
// loads as a picture (an <img src>, a style attribute, a <style> body) that names a file:// address must be one the
// inliner rewrites, or the author's local path ships in the shared file. Positions the reader reads that a browser
// ignores are allowed (the deck-folder limit bounds them) and are not asserted. Seeded, so a failure reproduces.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { inlineFileUrls } = require('../../../lib/export/html-player.js');

const photo = pathToFileURL(path.join(__dirname, '../../../lib/samples/photo-wide.jpg')).href;

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const WRAP = [
  ['', ''], ['<div>', '</div>'], ['<p>', ''], ['<svg>', '</svg>'], ['<svg><foreignObject>', '</foreignObject></svg>'], ['<svg width="1"><p>x</p>', ''],
  ['<math><mtext>', '</mtext></math>'], ['<template>', '</template>'], ['<table><tr><td>', '</td></tr></table>'], ['<noscript>', '</noscript>'],
  ['<textarea>a</textarea>', ''], ['<!-- c -->', ''], ['<h1>İİİİ</h1>', ''], ['<a "x>', '</a>'], ['<?bogus >', ''], ['<div title=\'a b\'>', '</div>'],
];

test('every file:// picture position parse5 loads is one the inliner rewrites (seeded corpus)', async () => {
  const parse5 = await import('parse5');
  const next = rng(20261018);
  let checked = 0;
  for (let n = 0; n < 400; n++) {
    let seq = 0;
    const url = () => `${photo}?n=${n}x${seq++}`;
    let html = '';
    const parts = 1 + Math.floor(next() * 4);
    for (let i = 0; i < parts; i++) {
      const [open, close] = WRAP[Math.floor(next() * WRAP.length)];
      const kind = Math.floor(next() * 4);
      const u = url();
      const payload = [`<img src="${u}">`, `<div style="background:url(&quot;${u}&quot;)"></div>`, `<style>.a{background:url("${u}")}</style>`, `<p style='background:url(${u})'></p>`][kind];
      html += open + payload + close;
    }
    // what a browser loads, by parse5's tree
    const doc = parse5.parse(html, { scriptingEnabled: true });
    const loaded = new Set();
    const walk = (node) => {
      for (const a of node.attrs ?? []) {
        if ((a.name === 'style' || (a.name === 'src' && node.nodeName === 'img')) && a.value.includes('file://')) for (const m of a.value.matchAll(/file:\/\/[^"')\s&]+/g)) loaded.add(m[0]);
      }
      if (node.nodeName === 'style') for (const c of node.childNodes ?? []) for (const m of (c.value ?? '').matchAll(/file:\/\/[^"')\s&]+/g)) loaded.add(m[0]);
      for (const c of node.childNodes ?? []) walk(c);
      if (node.content) walk(node.content);
    };
    walk(doc);
    const rewritten = inlineFileUrls(html);
    const left = [...loaded].filter((u) => rewritten.html.includes(u));
    assert.deepEqual(left, [], `leak in case ${n}: ${html}`);
    checked += loaded.size;
  }
  assert.ok(checked > 300, `only ${checked} positions compared`);
});
