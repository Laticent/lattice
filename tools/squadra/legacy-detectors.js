// lint-core's detectors for the rules that moved to Squadra, FROZEN as they were the day each moved, so
// the per-rule migration diff (tools/squadra-migration-diff.js, design §15.3) keeps something to compare
// the Squadra rule against after lib/authoring/lint-core.js loses the detector. Copied verbatim from
// lint-core at the commit before each rule's migration, with the helpers they read; nothing ships this
// file, and it goes with the diff when the last rule has moved.
//
// Each entry is `(source) => record[]`, the records the detector returned.

const { splitTopLevel } = require('../../lib/authoring/slide-split');
const { fmChunks } = require('../../lib/authoring/lint-core');
const { scanMetaSource } = require('../../lib/core/meta-scan.mjs');

// ── lint-core helpers the frozen detectors read ─────────────────────────────

function withoutCodeCommentMarkers(text) {
  const blank = (m) => m.replace(/<!--|--!?>/g, (s) => ' '.repeat(s.length));
  return String(text)
    .replace(/^[ \t]*```[\s\S]*?^[ \t]*```/gm, blank)
    .replace(/^[ \t]*~~~[\s\S]*?^[ \t]*~~~/gm, blank)
    .replace(/`[^`\n]*`/g, blank);
}

function commentKeyFindings(text, re, make) {
  const out = [];
  const fm = fmChunks(text);
  splitTopLevel(text).forEach((chunk, idx) => {
    if (idx < fm) return;
    for (const m of withoutCodeCommentMarkers(chunk).matchAll(re)) {
      const lines = m[0].split('\n');
      const line = (lines.find((l) => /(caption|say)\s*:/i.test(l)) || lines[0]).trim().slice(0, 80);
      out.push({ slide: Math.max(1, idx - fm + 1), line, ...make(m) });
    }
  });
  return out;
}

function slideClassDirectives(source) {
  return scanMetaSource(String(source ?? '')).slides.map(({ resolved }) => {
    const e = resolved.get('class');
    return e ? { payload: e.value, text: e.text, line: e.line, spot: e.spot } : { payload: '', text: '', line: 0, spot: false };
  });
}

// ── say-key-case (lint-core `findCapitalizedSayKey`, frozen 2026-11-13) ─────

const CAPITALIZED_SAY_COMMENT = /<!-{2,}\s*(?!say\s*:)[Ss][Aa][Yy]\s*:[\s\S]*?-{2,}!?>/g;

function findCapitalizedSayKey(source) {
  return commentKeyFindings(String(source == null ? '' : source), CAPITALIZED_SAY_COMMENT, () => ({
    rule: 'say-key-case',
    severity: 'warning',
    classToken: 'say',
    message: 'Only lowercase `say:` is spoken; this comment is a speaker note.',
    fix: 'To speak it, use `<!-- say: … -->`.',
  }));
}

// ── tag-alias (lint-core `findCardTagAliases`, frozen 2026-11-13) ───────────

function findCardTagAliases(source) {
  const findings = [];
  const slides = splitTopLevel(source);
  const directives = slideClassDirectives(source);
  const fm = fmChunks(source);
  slides.forEach((_slide, idx) => {
    if (idx < fm) return;
    const own = (directives[idx]?.payload || '').split(/\s+/).filter(Boolean);
    if (own.some((t) => /^tag-(corner|foot|notch|band|inline)$/.test(t))) return;
    const at = { slide: Math.max(1, idx - fm + 1), rule: 'tag-alias', severity: 'info', line: directives[idx]?.text || null };
    if (own.includes('banner-tag')) {
      findings.push({
        ...at,
        classToken: 'banner-tag',
        message: '`banner-tag` is an old name for `tag-band`.',
        fix: 'Replace it with `tag-band`.',
      });
    }
  });
  return findings;
}

const LEGACY = {
  'say-key-case': findCapitalizedSayKey,
  'tag-alias': findCardTagAliases,
};

module.exports = { LEGACY };
