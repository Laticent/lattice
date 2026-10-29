// The bridge (decision 2026-10-26-squadra-lint-library, design.md §15.4): lint-core's fixable findings
// go through Squadra's one fix driver, so "Fix all", the Playground and `lint:deck --fix` get the
// driver's checks before any rule has moved out of lint-core.
//
// Three parts, all temporary: each goes when the last rule has migrated (design §15.3).
//   · A deck language that knows only what the driver checks: the slides (counted the way
//     lint-core numbers them), the front matter, and the code fences (read by `fencedLines`, the
//     reader lint-core's rules use), which are inert. It is NOT
//     `lattice-deck` (M1b, on the Segno deck pipeline); it parses nothing else, so no rule can run
//     on it.
//   · A producer that turns lint-core's findings into Squadra findings with spans. A finding's span
//     is the line `applyFix` would edit, found by the same walk (`fixLineIndex`), so the span and
//     the fix can never name different lines.
//   · The `lattice-line` engine (lattice-line.js), which is `applyFix` itself.
//
// The registration refusals of design §8 do not apply to these findings: nothing registers them.
// They gain those refusals one rule at a time, as each rule migrates (design §15.4).
//
// Pure and fs-free like lint-core, because the Studio bundles it. Everything it reads from Lattice
// arrives as `deps` from lint-core: lint-core's own functions (lint-core loads this file), and the
// slide split and the fence reader. Requiring those here would make them modules shared between
// lint-core and this on-demand chunk, which a code-splitting bundler moves into a chunk of their
// own; that extra chunk cost the Studio's lint core 1.7 KB gzipped (`lintCoreGz`), measured.

const { fix, rulesetOf } = require('@laticent/squadra/driver');
const { latticeLineEngine } = require('./lattice-line');

const LANGUAGE = 'lattice-deck-bridge';
// The front-matter block, spelled as lint-core and slide-split spell it.
const FRONT_MATTER = /^---\r?\n[\s\S]*?\r?\n---[ \t]*(\r?\n|$)/;
// Passes, not fixes: the driver applies every non-overlapping fix in one pass. But lint-core reports
// several rules once per slide per lint (the card rules flag the first offending item), so a slide
// with sixty such items needs sixty passes. The cap stays where the old loop had it, 500.
const MAX_PASSES = 500;

/** Every place the deck holds a line break, so an offset becomes a line index in O(log lines). */
function lineStarts(text) {
  const starts = [0];
  for (let i = text.indexOf('\n'); i >= 0; i = text.indexOf('\n', i + 1)) starts.push(i + 1);
  return starts;
}

/** The deck as the driver checks it. The tree holds the front matter and the fences, nothing else.
 *  `deps` supplies `splitTopLevel` and `fencedLines`. */
function deckLanguage(deps) {
  const { splitTopLevel, fencedLines } = deps;
  return {
    id: LANGUAGE,
    version: '1',
    kinds: ['deck', 'front-matter', 'fence'],
    parse(source) {
      const text = source.text;
      const fm = FRONT_MATTER.exec(text);
      const header = fm ? { from: 0, to: fm[0].length } : null;
      // Runs of fenced lines, read by the same reader lint-core's rules use (`fencedLines`), so a line
      // a rule reads as live is never one the driver refuses as fenced. A fence that opens inside the
      // front matter is YAML text, not code.
      const fences = [];
      const lines = text.split('\n');
      const fenced = fencedLines(text);
      let pos = 0;
      let open = -1;
      for (let i = 0; i <= lines.length; i++) {
        const inRun = i < lines.length && fenced[i] && (!header || pos >= header.to);
        if (inRun && open < 0) open = pos;
        if (!inRun && open >= 0) {
          fences.push({ kind: 'fence', from: open, to: pos - 1, kids: [] });
          open = -1;
        }
        if (i < lines.length) pos += lines[i].length + 1;
      }
      const kids = header ? [{ kind: 'front-matter', from: header.from, to: header.to, kids: [] }, ...fences] : fences;
      return { tree: { kind: 'deck', from: 0, to: text.length, kids, header, fences }, errors: [] };
    },
    inert(tree) {
      return tree.fences.map((f) => ({ from: f.from, to: f.to }));
    },
    shape(tree, source) {
      // Slides counted as lint-core numbers them: the chunks after the front matter's two.
      const chunks = splitTopLevel(source.text).length;
      return { units: chunks - (tree.header ? 2 : 0), header: tree.header, inert: tree.fences.map((f) => source.text.slice(f.from, f.to)) };
    },
  };
}

/**
 * lint-core's findings as Squadra findings. Every finding is reported, fixable or not, so the
 * driver's resolution check sees a fix's finding come back. A fixable finding gets one
 * `lattice-line` fix, graded `safe`: "Fix all" applied every one of them before the bridge, and the
 * grade keeps that. A fix on a front-matter line may empty the block, and lint-core then drops the
 * block (`dropEmptiedFrontMatter`, PR #2947), so it declares that one shape change.
 */
function legacyProducer(deps, vocab) {
  return {
    id: 'lint-core',
    produce(source) {
      const text = source.text;
      const findings = deps.lintTextWith(text, vocab);
      if (!findings.length) return [];
      const lines = text.split('\n');
      const starts = lineStarts(text);
      const seps = deps.separatorLines(lines);
      const fm = deps.fmChunks(text);
      const fenced = deps.fencedLines(text);
      const header = FRONT_MATTER.exec(text);
      const out = [];
      for (const f of findings) {
        const i = f.line == null ? -1 : deps.fixLineIndex(lines, seps, fm, f, fenced);
        let span = { from: 0, to: 0 };
        if (i >= 0) {
          const from = starts[i];
          const body = lines[i].endsWith('\r') ? lines[i].length - 1 : lines[i].length;
          span = { from, to: from + body };
        }
        const fixable = f.autofixable && i >= 0;
        const inHeader = !!header && i >= 0 && starts[i] < header[0].length;
        out.push({
          rule: f.rule,
          legacy: f.rule,
          severity: f.severity === 'error' || f.severity === 'warning' || f.severity === 'info' ? f.severity : 'suggestion',
          span,
          message: f.message,
          ...(f.fix ? { hint: f.fix } : {}),
          fixes: fixable ? [{ engine: 'lattice-line', safety: 'safe', description: f.didYouMean ? `Use '${f.didYouMean}'.` : 'Apply the fix.', payload: f }] : [],
          ...(inHeader ? { changes: ['front-matter'] } : {}),
          data: { slide: f.slide },
        });
      }
      return out;
    },
  };
}

/**
 * Fix every machine-fixable finding in `text` through the driver. Returns `{ text, applied,
 * skipped, passes }`; `applied` and `skipped` carry the legacy rule ids and the slide each
 * finding was on.
 */
function fixDeck(text, deps) {
  const rules = rulesetOf({ name: 'deck', languages: [deckLanguage(deps)], engines: [latticeLineEngine(deps)] });
  const res = fix(rules, { path: 'deck.md', text, language: LANGUAGE }, { producers: [legacyProducer(deps, deps.vocab)], maxPasses: MAX_PASSES });
  // Each finding carries lint-core's own slide number in its `data`, read on the text of the pass
  // that found it, so a fix in a later pass names the right slide after earlier fixes moved lines.
  const slideOf = (x) => (typeof x.data?.slide === 'number' ? x.data.slide : 0);
  return {
    text: res.text,
    applied: res.applied.map((a) => ({ rule: a.rule, slide: slideOf(a), pass: a.pass })),
    skipped: res.skipped.map((s) => ({ rule: s.rule, slide: slideOf(s), reason: s.reason, ...(s.detail ? { detail: s.detail } : {}) })),
    passes: res.passes,
  };
}

module.exports = { fixDeck, deckLanguage, legacyProducer, LANGUAGE };
