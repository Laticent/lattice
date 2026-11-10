/**
 * lib/plugins/image/image.lint.js — THE IMAGE PLUGIN'S LINT RULES (`contributes.lint`): a role the host's linter
 * (lib/authoring/lint-core.js) runs through its generated table, pure and synchronous (HARD RULE #7, amended 2026-11-01).
 * The host hands each call a DECK VIEW (per content slide its `number`, `classes`, `lines`, `linesOutsideFences`; and
 * `inlineSpans(pick)`); a finding's `rule` must be one the manifest declares.
 *
 *   image-marp-keyword   Marp's `![bg …](…)` keywords are retired (§8 decision 2): a warning, with the record as its fix
 *   image-not-alone      a record that shares its line or its paragraph with text stays code (warning)
 *   image-extra-panel    a second record on one `image` slide: the layout seats one photo (warning)
 *   image-web-source     a picture from another site, which the preview replaces with a placeholder (warning; security spine S2)
 */
const { read, peel } = require('./image.inline.js');
const { migrateBgLine, classLineWith } = require('./shared/image-migrate.js');

const BG_START = /^\s*!\[bg(?:[\s\]])/;
const WHOLE_LINE = /^\s*`@image\{.*\}`\s*$/;
const CLASS_LINE = /^\s*<!--\s*_class\s*:/;

/** The record a whole-line span holds, or null. */
const recordOn = (line, ctx) => (WHOLE_LINE.test(line) ? read(peel(line.trim().slice(1, -1)), null, false, ctx) : null);

function marpKeywords(deck) {
  const findings = [];
  for (const slide of deck.slides) {
    const lines = slide.linesOutsideFences;
    const local = slide.lines.find((l) => CLASS_LINE.test(l));
    let classAsked = null;
    lines.forEach((line, i) => {
      if (!BG_START.test(line)) return;
      const m = migrateBgLine(slide.lines[i], slide.classes);
      const base = { slide: slide.number, rule: 'image-marp-keyword', severity: 'warning', classToken: slide.classes[0] || 'content', line: slide.lines[i].trim() };
      // The same finding with its machine fix (the record line, or the slide's class line).
      const fixable = { ...base, autofixable: true };
      if (!m) {
        findings.push({
          ...base,
          message: 'Marp\'s `![bg …](…)` keywords are retired: this line draws nothing. Placement belongs to the slide, and the picture is an `@image{…}` record.',
          fix: 'Put the picture on a line of its own as `@image{photo.jpg}`, and make the slide an `image` slide (its photo panel) or add `bleed` (its background).',
        });
        return;
      }
      // A line the kernel will not rewrite by machine, or a slide whose class line it cannot edit safely: the finding stays, the fix
      // is the author's (a half-applied fix would move the picture and lose its placement).
      const classFix = m.addClass && local ? classLineWith(local, m.addClass) : null;
      if (m.unsafe || (m.addClass && local && !classFix)) {
        findings.push({
          ...base,
          message: `Marp's \`![bg …](…)\` keywords are retired: a picture is an \`@image{…}\` record, and its placement belongs to the slide. This line is not rewritten by machine: ${m.unsafe || 'the slide\'s class comment holds more than one directive'}.`,
          fix: `Write \`${m.record.trim()}\` by hand${m.addClass ? ` and add \`${m.addClass}\` to the slide's class` : ''}.`,
        });
        return;
      }
      const moved = m.addClass === 'mirror' ? ' `left` becomes the slide\'s `mirror`.' : m.addClass === 'bleed' ? ' The picture was this slide\'s background, so the slide gains `bleed`.' : '';
      const gone = m.dropped.length ? ` Dropped, because they were never drawn: ${m.dropped.map((w) => `\`${w}\``).join(', ')}.` : '';
      // The class goes on the slide's own `_class` line when it has one; otherwise a `_class` line is written above the record.
      let replaceLine = m.record;
      if (m.addClass && !classAsked) {
        if (local) {
          classAsked = classFix;
          findings.push({ ...fixable, line: local.trim(), replaceLine: classAsked.trimStart(), message: `The slide takes \`${m.addClass}\`, which the retired \`![bg …]\` keyword below used to say.`, fix: `Add \`${m.addClass}\` to the slide's class.` });
        } else {
          classAsked = m.addClass;
          replaceLine = `<!-- _class: ${[...slide.classes, m.addClass].join(' ')} -->\n\n${m.record}`;
        }
      }
      findings.push({
        ...fixable,
        replaceLine,
        message: `Marp's \`![bg …](…)\` keywords are retired: a picture is an \`@image{…}\` record, and its placement belongs to the slide.${moved}${gone}`,
        fix: `Write \`${m.record.trim()}\`.`,
      });
    });
  }
  return findings;
}

function notAlone(deck, ctx) {
  return deck.inlineSpans((t) => (t.startsWith('@image{') && read(t, null, true, ctx) ? true : null))
    .filter(({ line, span }) => line.trim().replace(/^(?:>\s*)*(?:(?:[-*+]|\d+[.)])\s+)?/, '') !== span.raw)
    .map(({ slide, classToken, line, span }) => ({
      slide,
      rule: 'image-not-alone',
      severity: 'warning',
      classToken,
      line: line.trim(),
      span: span.raw,
      col: span.start,
      message: '`@image{…}` stays code here: a picture is a figure, and only a record on a line of its own is drawn. For a picture inside a sentence, write `![title](src)`.',
      fix: 'Move the record to a line of its own, with a blank line above and below it.',
    }));
}

function extraPanels(deck, ctx) {
  const findings = [];
  for (const slide of deck.slides) {
    const seat = slide.classes.includes('image') ? 'image' : slide.classes.includes('bleed') && !slide.classes.includes('collage') ? 'bleed' : null;
    if (!seat) continue;
    const drawn = slide.linesOutsideFences.map((l, i) => (recordOn(l, ctx) ? i : -1)).filter((i) => i >= 0);
    for (const i of drawn.slice(1)) {
      findings.push({
        slide: slide.number,
        rule: 'image-extra-panel',
        severity: 'warning',
        classToken: seat,
        line: slide.lines[i].trim(),
        message: seat === 'image' ? 'An `image` slide seats one photo. This second record becomes a second panel over the first.' : 'A `bleed` slide has one background. This second record becomes a second background over the first.',
        fix: 'Give each photo its own slide, or use `collage` for several.',
      });
    }
  }
  return findings;
}

function webSources(deck, ctx) {
  const findings = [];
  for (const slide of deck.slides) {
    slide.linesOutsideFences.forEach((l, i) => {
      const f = recordOn(l, ctx);
      const origin = f ? ctx.webOrigin(f.src) : null;
      if (!origin) return;
      findings.push({
        slide: slide.number,
        rule: 'image-web-source',
        severity: 'warning',
        classToken: slide.classes[0] || 'content',
        line: slide.lines[i].trim(),
        address: f.src,
        message: `This picture loads from another site (${origin}): the preview shows a placeholder in its place until the reader allows it, and loading it tells that site who opened the deck.`,
        fix: 'Save the picture beside the deck and name it by a relative path.',
      });
    });
  }
  return findings;
}

/** The role: a factory of the plugin's ctx, returning the deck check the linter calls. */
const lint = (ctx) => (deck) => [...notAlone(deck, ctx), ...extraPanels(deck, ctx), ...webSources(deck, ctx)];

module.exports = { lint, marpKeywords };
