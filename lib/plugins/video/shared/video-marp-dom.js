/**
 * lib/plugins/video/shared/video-marp-dom.js — a Marp render's `@video{…}` records, drawn by the runtime from the deck's MARKDOWN.
 *
 * THE ADDRESS RULE (spec/LPM.md §10) is why this is shaped the way it is. The runtime never turns text it finds on the page into
 * an address: a plugin's output lands as text, so drawing whatever `<code>@video{…}</code>` sits on a slide would publish what a
 * plugin wrote. On a Marp render there is no token path to read the record on, so the records arrive from the author's own
 * Markdown, by one of two channels and only those:
 *   · marp-cli: the config engine reads them from markdown-it's tokens and writes one data block (`RECORDS_TYPE`,
 *     ./video-marp-engine.js);
 *   · the VS Code preview: the runtime reads the saved deck file the preview's own base URL names (`recordSpans`, ./fences.js).
 *
 * THE PAGE SUPPLIES ONLY THE PLACE. A span is drawn when it stands where the engine draws one (`loneHost`: the whole of a
 * paragraph, or the first and only text of a tight list item, ahead of any nested list), outside every `[data-lattice-plugin]`
 * subtree, not stamped literal or off, not a span a component reads itself, AND its exact text is a record the Markdown holds, at
 * most as many times as the Markdown holds it, counting the figures already on the page (each carries `RECORD_ATTR`, so a second
 * pass over the same page draws nothing more). Both channels hand over EVERY span the author wrote, so this one rule decides for
 * marp-cli and VS Code alike, and they cannot disagree about a record. The figure is built
 * from that Markdown record, so every address drawn is one the author wrote. Paired by identity, not by line: in the VS Code
 * preview the page follows the unsaved buffer while the file lags it, so a line number moves under every edit above a record; the
 * record's own text does not. A record being typed (not yet in the saved file) stays code until it is saved.
 *
 * WHAT IT DRAWS is the engine's own output, by the plugin's own kernel: the figure (`read` + `figureHtml`, ../video.inline.js) in
 * the paragraph's place, inside a tight list's item as the engine nests it. It returns the slides that gained one, and the runtime
 * lays a `video` slide out with the layout's own composer, as the engine does on its HTML pass (a plugin does not reach into a
 * layout). Idempotent: a drawn record leaves no span to find.
 *
 * Reached through the plugin's services (../video.services.js), never imported from outside this folder.
 */

const { read, figureHtml } = require('../video.inline.js');
const { RECORDS_TYPE } = require('./video-marp-engine.js');

const RECORD_TEXT = /^\{[^\r\n]*\}$/;
const MAX_RECORDS = 1000;
// On each figure this module drew: the record it was drawn from, so the next pass counts it against the Markdown's tally.
const RECORD_ATTR = 'data-lattice-marp-record';

/** A record list, shape-checked: an array of `'{…}'` strings (the first MAX_RECORDS of them), else null. */
function validRecords(list) {
  if (!Array.isArray(list)) return null;
  const head = list.slice(0, MAX_RECORDS);
  return head.every((r) => typeof r === 'string' && RECORD_TEXT.test(r)) ? head : null;
}

/**
 * The records the marp-cli engine wrote into the page, or null when there is no block (every host but a marp-cli render of a
 * deck that holds a record). The FIRST block only: the engine writes one per render.
 * @param {Document} doc
 */
function readRecordBlock(doc) {
  const el = doc?.querySelector?.(`script[type="${RECORDS_TYPE}"]`);
  if (!el) return null;
  try {
    return validRecords(JSON.parse(el.textContent || ''));
  } catch (_e) {
    return null;
  }
}

/** One HTML string as nodes, through a `<template>` (inert: nothing in it loads or runs until it is inserted). */
function fragmentOf(doc, html) {
  const tpl = doc.createElement('template');
  tpl.innerHTML = html;
  return tpl.content;
}

/**
 * The element a span stands alone in, where the engine draws a record: a paragraph whose only content is the span, or a tight list
 * item whose text is the span alone (a nested list may follow it, as in the engine, where the item's own paragraph is the span).
 * Else null.
 */
function loneHost(code) {
  const host = code.parentElement;
  if (!host || (host.tagName !== 'P' && host.tagName !== 'LI')) return null;
  if (host.firstElementChild !== code) return null;
  let after = false;
  for (const n of host.childNodes) {
    if (n === code) { after = true; continue; }
    if (n.nodeType === 3) {
      if (n.nodeValue.trim() !== '') return null;
      continue;
    }
    // After the span, a tight list item may hold nested lists, and nothing else.
    if (host.tagName === 'LI' && after && n.nodeType === 1 && (n.tagName === 'UL' || n.tagName === 'OL')) continue;
    return null;
  }
  return host;
}

/**
 * Draw every lone span whose text is a record the Markdown holds.
 * @param {Document} doc
 * @param {string[]} records  `{…}` record texts from `readRecordBlock` or `drawnRecords`, never from the page
 * @param {{ ctx: object, skip?: (code: Element) => boolean }} opts
 *   `ctx`: the video plugin's host context (its provider matcher); `skip`: the runtime's own reasons to leave a span as code
 *   (a literal-code slide, a plugin switched off, a span a component reads itself), the engine's exceptions on this path
 * @returns {Element[]} the slides (`section`) that gained a figure, in page order; empty when it drew nothing
 */
function drawRecords(doc, records, { ctx, skip } = {}) {
  const list = validRecords(records);
  if (!list?.length || !doc?.querySelectorAll) return [];
  const owed = new Map();
  for (const r of list) owed.set(r, (owed.get(r) || 0) + 1);
  // What an earlier pass already drew counts against the tally (a host that re-renders writes the spans back, and takes the
  // figures with them, so there the tally starts full again).
  for (const fig of doc.querySelectorAll(`[${RECORD_ATTR}]`)) {
    if (fig.closest('[data-lattice-plugin]')) continue; // a plugin's forged marker must not use up the author's record
    const r = fig.getAttribute(RECORD_ATTR);
    if (owed.has(r)) owed.set(r, owed.get(r) - 1);
  }
  const drewIn = new Set();
  for (const code of doc.querySelectorAll('section code')) {
    const host = loneHost(code);
    if (!host || host.closest('[data-lattice-plugin]') || code.closest('pre')) continue;
    const text = code.textContent;
    if (!text.startsWith('@video{')) continue;
    const record = text.slice(6);
    const left = owed.get(record);
    if (!(left > 0)) continue;
    if (skip?.(code)) continue;
    const f = read(record, undefined, false, ctx);
    if (!f) continue;
    owed.set(record, left - 1);
    const section = host.closest('section');
    const figure = fragmentOf(doc, figureHtml(f));
    figure.firstElementChild?.setAttribute(RECORD_ATTR, record);
    if (host.tagName === 'LI') code.replaceWith(figure);
    else host.replaceWith(figure);
    if (section) drewIn.add(section);
  }
  return [...drewIn];
}

module.exports = { readRecordBlock, drawRecords, validRecords, loneHost, RECORDS_TYPE, RECORD_ATTR };
