/**
 * lib/plugins/video/video.lint.js — THE VIDEO PLUGIN'S LINT RULES (`contributes.lint`): a role the host's linter
 * (lib/authoring/lint-core.js) runs through its generated table, pure and synchronous (HARD RULE #7, amended
 * 2026-11-01; engineering/decisions/2026-11-01-charts-one-plugin.md §7).
 *
 * The host hands each call a DECK VIEW, not the source: per content slide its human `number` (front matter excluded,
 * as every finding counts), its own `classes`, its `lines`, and `linesOutsideFences` (with every fence the renderer
 * certainly draws as code blanked out); plus `inlineSpans(pick)`, the host's reading of where inline code is drawn.
 * A finding's `rule` must be one the manifest declares.
 *
 *   video-not-alone      a record that touches a line of text stays code (warning)
 *   video-bullet         a `video` slide with no record draws no clip; a bullet address gets the record as its fix (error)
 *   video-slide-class    a lone record off a `video` slide draws neither its layout nor its poster (warning)
 *   video-extra-record   a second record on one `video` slide runs off the slide (warning)
 */
const { migrateSlideLines, drawnRecordLines } = require('./shared/migrate.js');
const { read } = require('./video.inline.js');

/** The video record a whole-line span holds (`@video{…}` with its backticks), or null. */
const recordOn = (line, ctx) => read(line.replace(/^[^`]*`/, '').replace(/`\s*$/, '').slice(6), null, false, ctx);

function notAloneAndBullets(deck, ctx) {
  const findings = [];
  for (const slide of deck.slides) {
    if (!slide.classes.includes('video')) continue;
    // Outside fences: a fenced record or bullet is a quoted example, and the slide draws no clip from it.
    // Only a fence the renderer certainly draws as code, so a misread fence never hides a live record.
    const lines = slide.linesOutsideFences;
    // A record on the line right under a paragraph line is that paragraph's lazy continuation: it stays code, and no video is drawn.
    lines.forEach((l, i) => {
      if (i === 0 || !/^\s*`@video\{.*\}`\s*$/.test(l)) return;
      const above = lines[i - 1];
      // A blank line, a heading, a comment that ends on the line, a fence line, or a rule leaves the record a paragraph of its own; any other
      // line above (a list item, a quote, a table row, an indented line, plain text) makes it that block's lazy continuation.
      const aboveText = above.trim().replace(/^(?:>\s*)+/, '');
      const closedComment = aboveText.endsWith('-->');
      const below = (lines[i + 1] || '').trim();
      // Below, plain text (or a setext underline) continues the paragraph; a blank line, heading, fence, quote, list, rule or HTML starts a new block.
      const belowContinues = below !== '' && !/^(?:#{1,6}(?:\s|$)|```|~~~|<|>|[-*+]\s|\d+[.)]\s|(?:-\s*){3,}$|(?:\*\s*){3,}$|(?:_\s*){3,}$)/.test(below);
      const aboveEnds = aboveText === '' || closedComment || /^(?:#{1,6}(?:\s|$)|```|~~~|(?:-\s*){3,}$|(?:\*\s*){3,}$|(?:_\s*){3,}$)/.test(aboveText);
      if (aboveEnds && !belowContinues) return;
      findings.push({
        slide: slide.number,
        rule: 'video-not-alone',
        severity: 'warning',
        classToken: 'video',
        line: l.trim(),
        message: '`@video{…}` stays code here: it touches a line of text above or below, so it is part of that paragraph, and only a record in a paragraph of its own is drawn.',
        fix: 'Put a blank line between the record and the text.',
      });
    });
    if (lines.some((l) => /@video\{/.test(l))) continue;
    const r = migrateSlideLines(lines, ctx.provider);
    if (!r) {
      // No bullet this slide could be migrated from, and no record: the slide draws no clip, whatever shape the author tried.
      findings.push({
        slide: slide.number,
        rule: 'video-bullet',
        severity: 'error',
        classToken: 'video',
        line: (lines.find((l) => /^\s*[-*+]\s/.test(l)) || '').trim(),
        message: 'This `video` slide has no `@video{…}` record, so it draws no clip. A bullet that names the clip no longer counts.',
        fix: 'Write `@video{"https://…"}` on a line of its own, quoting the address (a `=` or `,` in it needs the quotes).',
      });
      continue;
    }
    findings.push({
      slide: slide.number,
      rule: 'video-bullet',
      severity: 'error',
      classToken: 'video',
      line: r.before[0].trim(),
      message: 'This `video` slide names its clip as a bullet. That form is gone: the video comes only from your own `@video{…}` record, so the slide draws no clip.',
      fix: `Write ${r.record} on a line of its own.`,
      // A line fix is a one-line swap (`replaceToken`); a clip with `caption`/`poster` bullets spans lines, and `lint:deck --fix` leaves
      // those to the author. The single-line fix puts the record on its own paragraph, with a blank line either side.
      ...(r.before.length === 1 ? { autofixable: true, replace: { from: r.before[0], to: `\n${r.record}\n` } } : {}),
    });
  }
  // A record in running text stays code: a video is a figure, and only a line of its own can hold one.
  findings.push(...deck.inlineSpans((t) => (/^@video\{/.test(t) && read(t.slice(6), null, false, ctx) ? true : null)).filter(({ line, span }) => line.trim().replace(/^(?:>\s*)*(?:(?:[-*+]|\d+[.)])\s+)?/, '') !== span.raw).map(({ slide, classToken, line, span }) => ({
    slide,
    rule: 'video-not-alone',
    severity: 'warning',
    classToken,
    line: line.trim(),
    span: span.raw,
    col: span.start,
    message: '`@video{…}` stays code here: a video is a figure, and only a record on a line of its own is drawn.',
    fix: 'Move the record to a line of its own, with a blank line above and below it.',
  })));
  return findings;
}

function slideClass(deck, ctx) {
  const findings = [];
  for (const slide of deck.slides) {
    if (slide.classes.includes('video')) continue;
    const { lines } = slide;
    const at = drawnRecordLines(lines).find((i) => recordOn(lines[i], ctx));
    if (at === undefined) continue;
    findings.push({
      slide: slide.number,
      rule: 'video-slide-class',
      severity: 'warning',
      classToken: slide.classes[0] || 'content',
      line: lines[at].trim(),
      message: '`@video{…}` draws its poster and layout only on a `video` slide. Here it is a plain text link: the layout and the poster picture both belong to the `video` class.',
      fix: 'Add `<!-- _class: video -->` above the heading (or `video companion`, `video gallery`), or move the record to a `video` slide.',
    });
  }
  return findings;
}

function extraRecords(deck, ctx) {
  const findings = [];
  for (const slide of deck.slides) {
    if (!slide.classes.includes('video')) continue;
    const { lines } = slide;
    const drawn = drawnRecordLines(lines).filter((i) => recordOn(lines[i], ctx));
    for (const i of drawn.slice(1)) {
      findings.push({
        slide: slide.number,
        rule: 'video-extra-record',
        severity: 'warning',
        classToken: 'video',
        line: lines[i].trim(),
        message: 'A `video` slide seats one clip. This second `@video{…}` record is drawn below the first and runs off the slide.',
        fix: 'Move it to a slide of its own.',
      });
    }
  }
  return findings;
}

/** The role: a factory of the plugin's ctx, returning the deck check the linter calls. */
const lint = (ctx) => (deck) => [...notAloneAndBullets(deck, ctx), ...slideClass(deck, ctx), ...extraRecords(deck, ctx)];

module.exports = { lint };
