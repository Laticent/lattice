/**
 * chart-places — the ONE reading of where a code span sits in a slide, from markdown-it tokens.
 *
 * Whether a span is a chart row's data record is one decision, `ownsRecordSpan` (chart-rows.js). Its
 * inputs are a span's PLACE: how deep in the list, last in its row, in the slide's first list or table,
 * inside a quote, what code came before it, what the rows above it hold. Before this module the engine's
 * pill pass and lint each counted those from the same tokens in their own loop, and the narrator, lint's
 * line walker, the browser and Compose counted them again from source lines, the DOM and a ProseMirror doc.
 * Every review round of the chart row record found its defects in that counting, never in the decision
 * (followups.d/2690-p1-chart-model-phase-2-reader.md), and place-oracle.test.js holds each reader to the
 * engine's answer. This module is the token-side counting, once. The engine's `inlinePills` and the lint
 * rules that read markdown-it tokens call it; the DOM and ProseMirror readers keep their own adapters and
 * are held to the same answers by the oracle.
 *
 * Pure: no fs, no DOM, and no markdown-it import (it reads the tokens it is handed), so it rides in the
 * authoring and read-along bundles at no cost.
 *
 * `ownedRecordSites` (chart-sites.js) is the line-addressed form of the same counting, for the readers that rewrite or skip
 * source lines (the narrator, lint). It lives apart so the engine's route budget does not pay for it.
 *
 * Use: `reset(true)` at each slide; `enter(tokens, i)` for EVERY token in order (it keeps the counters);
 * `inline(token)` on EVERY inline token, then `placeOf(child)` per code child. Not only the tokens that hold code:
 * `inline()` is what marks a list item's lead as seen, so a caller that skips a code-less first paragraph makes
 * the item's SECOND paragraph its lead, and a record there reads as the row's value
 * (`- EMEA` / blank / `  \`{1.5}\``: the engine does not claim it, a caller that skips does).
 */

const { rawBlockCounts, RAW_SCAN_BUDGET } = require('./chart-rows');

function createPlaceTracker() {
  let records = false; // the slide's chart reads `{…}` row records
  let itemDepth = 0;
  let topLists = 0; // top-level lists opened on this slide so far
  let rawLists = 0; // top-level lists in raw HTML so far: ahead of a chart's list they make it the second
  let tables = 0; // tables opened on this slide so far (raw ones too): only the first is a grid chart's
  let quoteDepth = 0; // `>` quotes open around the token: a row's description, not its data
  let inCell = false;
  let inHeadCell = false; // a header cell holds no record, but a raw table in it nests like one in a body cell
  let leads = []; // the open list items: { spans, seen, ok } — the code spans of each one's lead, for a detail row's ancestors
  let rawBudget = { left: RAW_SCAN_BUDGET }; // characters of raw HTML this slide may have scanned tag by tag

  function reset(readsRecords) {
    records = Boolean(readsRecords);
    itemDepth = 0;
    topLists = 0;
    rawLists = 0;
    tables = 0;
    quoteDepth = 0;
    inCell = false;
    inHeadCell = false;
    leads = [];
    rawBudget = { left: RAW_SCAN_BUDGET };
  }

  /** Count token `i` of `tokens`. Call for every token of the slide, in order, before asking about it. */
  function enter(tokens, i) {
    const token = tokens[i];
    if ((token.type === 'bullet_list_open' || token.type === 'ordered_list_open') && itemDepth === 0) topLists++;
    if (token.type === 'list_item_open') {
      itemDepth++;
      // The item's lead is the paragraph or heading its first block opens with (lint reads it the same way).
      const first = tokens[i + 1];
      leads.push({ spans: [], seen: false, ok: first?.type === 'paragraph_open' || first?.type === 'heading_open' });
    } else if (token.type === 'list_item_close') {
      itemDepth--;
      leads.pop();
    } else if (token.type === 'blockquote_open') quoteDepth++;
    else if (token.type === 'blockquote_close') quoteDepth--;
    else if (token.type === 'table_open') tables++;
    else if (token.type === 'inline' && records && itemDepth === 0 && token.children) {
      // Raw HTML inside a paragraph (`Intro <ul>…</ul>`) is a list or table ahead too: the HTML bridge counts every such tag.
      const html = token.children.filter((c) => c.type === 'html_inline').map((c) => c.content).join('');
      const raw = rawBlockCounts(html, rawBudget);
      rawLists += raw.lists; // not `topLists`: a row owner (hub-spoke) reads Markdown lists, and a raw one is none of its
      if (inCell || inHeadCell) {
        // A raw `<table>` the cell CLOSES again is nested in the table being read, not ahead of it (the DOM's first table is
        // still the outer one). One left OPEN is not: the browser nests the rest of the row, and the rows after it, inside it.
        tables += Math.max(0, raw.tables - raw.closedTables);
      } else tables += raw.tables;
    } else if (token.type === 'html_block' && records) {
      // A raw `<ul>` or `<table>` ahead of the chart's own makes the chart's the second one, as the HTML bridge counts it.
      const raw = rawBlockCounts(token.content, rawBudget);
      if (itemDepth === 0) rawLists += raw.lists;
      tables += raw.tables;
    } else if (token.type === 'td_open') inCell = true;
    else if (token.type === 'td_close') inCell = false;
    else if (token.type === 'th_open') inHeadCell = true;
    else if (token.type === 'th_close') inHeadCell = false;
  }

  /**
   * The places of an inline token's code children, or null when the slide's chart reads no record here (the
   * token is outside a list item and a table cell). Call once per inline token, BEFORE resolving any child:
   * "after another code span" and a row's lead spans are facts about the source, so they are read now, and
   * the answer cannot depend on the order the children are visited.
   * @returns {null | { placeOf(child: object): (object | null) }}
   */
  function inline(token) {
    if (!records || !(inCell || itemDepth > 0) || !token.children) return null;
    // The kids that carry something: a row's data record is the last of them (chart-rows.js `ownsRecordSpan`).
    const solid = token.children.filter((c) => c.type !== 'softbreak' && !(c.type === 'text' && !c.content.trim()));
    // What each kid WAS before the pill pass turned an earlier span into a pill.
    const wasCode = solid.map((c) => c.type === 'code_inline');
    // The item's lead is its first block's inline; its code spans are what a nested row sits under.
    const item = !inCell && quoteDepth === 0 ? leads[leads.length - 1] : null;
    const isLead = Boolean(item?.ok && !item.seen);
    const ancestors = item ? leads.slice(0, -1).map((l) => l.spans) : null;
    const leadKids = isLead ? solid.filter((c) => c.type === 'code_inline') : [];
    const leadSpans = leadKids.map((c) => c.content);
    // Each kid's index, once: a row of many spans stays linear.
    const solidAt = new Map(solid.map((c, i) => [c, i]));
    const leadAt = new Map(leadKids.map((c, i) => [c, i]));
    if (item && !item.seen) {
      item.seen = true;
      item.spans = leadSpans;
    }
    // The counters as they stand NOW: the caller may visit children after later tokens moved them.
    const cell = inCell;
    const depth = itemDepth;
    const quoted = quoteDepth > 0;
    const firstTable = tables === 1;
    const firstList = topLists + rawLists === 1;
    return {
      placeOf(child) {
        const at = solidAt.has(child) ? solidAt.get(child) : -1;
        if (at < 0) return null;
        if (cell) return { cell: true, lastInRow: solid.length === 1, quoted, firstList: firstTable };
        return {
          depth, lastInRow: at === solid.length - 1,
          afterCode: at > 0 && wasCode[at - 1], quoted,
          firstList, ancestors: ancestors || [], lead: isLead, leadSpans,
          at: leadAt.has(child) ? leadAt.get(child) : -1,
        };
      },
    };
  }

  return {
    reset, enter, inline,
    /** The list-item depth at the token last entered (0 outside any list). */
    get itemDepth() { return itemDepth; },
    /** Top-level Markdown lists opened on this slide so far, raw HTML ones not counted. */
    get topLists() { return topLists; },
  };
}

module.exports = { createPlaceTracker };
