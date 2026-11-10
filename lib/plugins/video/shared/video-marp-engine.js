/**
 * lib/plugins/video/shared/video-marp-engine.js — the `@video{…}` records of a deck rendered by marp-cli, handed to the runtime.
 *
 * WHY THIS EXISTS. Marp runs none of Lattice's markdown-it rules, and the runtime never builds an address from text it finds on
 * the page (spec/LPM.md §10: a plugin's output lands as text, so a `<code>@video{https://attacker…}</code>` would otherwise be
 * published). So a record written in a hand-authored Marp deck printed as a line of code. marp-cli, unlike the VS Code preview,
 * runs a config `engine`, which sees markdown-it's TOKENS: the author's own content, before anything is drawn. This plugin reads
 * the records there and writes them into one inert data block the runtime reads, so every address the runtime draws is one the
 * Markdown holds. It draws nothing itself: the runtime parses each record with the video plugin's own kernel (`video.inline.js`)
 * and decides, with the checks the engine makes, whether it draws (lib/plugins/video/shared/video-marp-dom.js). In the VS Code
 * preview the same records come from the saved deck file instead (`recordSpans`, ./fences.js).
 *
 * WHAT IT COLLECTS. Every `@video{…}` inline-code span the author wrote, in document order: the record text only, `{…}`. It
 * does not decide which of them draws. The runtime does, by one rule on the page (a span that is the whole of a paragraph or of a
 * list item, `loneHost` in ./video-marp-dom.js), so marp-cli and the VS Code preview, whose list comes from the saved file through
 * `recordSpans` (./fences.js), can never disagree about a record: both hand over every span, and the same rule places them.
 *
 * THE DATA BLOCK. A custom token with its own renderer rule, not an `html_block`, so a bundle's HTML allowlist (which filters
 * raw HTML) has nothing to let through. JSON with every `<` escaped, so the payload cannot end the `<script>` element. It goes
 * AFTER the slides, outside every `<section>`: inside the last slide it sat after Marp's `<footer>`, and the `video` layout's
 * composer, which peels a footer only at the very end of a slide, then took the footer into the card (red team, 2026-11-10).
 * A `<script>` has no box, so outside the slides it adds no page to a PDF.
 *
 * SELF-CONTAINED: `latticeVideoRecords` names nothing outside its own body, because the Marp configs write it out as source
 * (`latticeVideoRecords.toString()`) where it runs with only marp-cli installed. Its tests call this same function.
 */

/** The data block's `type`: the runtime reads exactly this (video-marp-dom.js). */
const RECORDS_TYPE = 'application/lattice-video-records';

/**
 * A markdown-it plugin: `marp.use(latticeVideoRecords)`.
 * @param {import('markdown-it')} md
 */
function latticeVideoRecords(md) {
  const TYPE = 'application/lattice-video-records';
  // Both spellings of a video record, `@video{…}` and its short form `>{…}` (video.inline.js `RECORD_OPEN`, spelled here again
  // because this function runs as source inside marp.config.cjs, where nothing can be required).
  const RECORD = /^(?:@video|>)\{[^\r\n]*\}$/;
  md.core.ruler.push('lattice_video_records', (state) => {
    const tokens = state.tokens;
    const records = [];
    for (const t of tokens) {
      if (t.type !== 'inline') continue;
      for (const k of t.children || []) if (k.type === 'code_inline' && RECORD.test(k.content)) records.push(k.content.slice(k.content.indexOf('{')));
    }
    if (!records.length) return;
    const block = new state.Token('lattice_video_records', '', 0);
    block.content = JSON.stringify(records).replace(/</g, '\\u003c');
    tokens.push(block);
  });
  md.renderer.rules.lattice_video_records = (tokens, idx) => `<script type="${TYPE}">${tokens[idx].content}</script>\n`;
}

module.exports = { latticeVideoRecords, RECORDS_TYPE };
