// The Drawing Board — the Coach console (deterministic, no chat). Phase 3.
//
// Replaces a fake chat composer in the deterministic flow with ACTION CHIPS that
// return structured result cards, computed by coach-actions.js from the deck +
// the live assessment. Honest, instant, private — it only offers what it can
// answer. The conversational surface lives in the separate "Converse" mode (a
// real model). See the Coach-vs-Converse design decision doc.

import { pacing, structureCheck, theAsk, topFixes, weakestSlide } from '../components/studio/coach/coach-actions.js';

const CHIPS = [
  { id: 'fixes', label: 'Top fixes', run: (c) => topFixes(c.assessment) },
  { id: 'weak', label: 'Weakest slide', run: (c) => weakestSlide(c.assessment) },
  { id: 'structure', label: 'Structure check', run: (c) => structureCheck(c.source) },
  { id: 'ask', label: 'The ask', run: (c) => theAsk(c.source) },
  { id: 'pacing', label: 'Pacing', run: (c) => pacing(c.source, c.minutes) },
];

// 1-based source line where each REAL slide begins, indexed by the HUMAN slide
// number (front matter skipped) — mirrors the architect's mapping so "Go to
// slide N" lands where a finding's Reveal does. `starts[0]` = 1 (deck top).
function chunkStartLines(src) {
  const lines = (src || '').split('\n');
  let i = 0;
  if (/^---\r?\n/.test(src || '') && lines[0].trim() === '---') {
    i = 1;
    while (i < lines.length && lines[i].trim() !== '---') i++;
    i++; // step past the closing front-matter delimiter
  }
  const starts = [1, i + 1]; // [deck top, slide 1]
  for (; i < lines.length; i++) if (lines[i] === '---') starts.push(i + 2);
  return starts;
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

export function createCoachConsole({ chipsHost, cardHost, introHost, getAssessment, getSource, reveal }) {
  if (!chipsHost || !cardHost) return { render() {}, intro() {}, clearIntro() {} };
  let minutes = null;
  let active = null;

  // The Architect's onboarding "talk back" lands HERE — in Coach, the default
  // mode — not in the Converse thread (hidden under Coach, so a greeting posted
  // there is never seen). It's a one-shot: cleared once the user engages a chip
  // or moves to another deck.
  function intro(text) { if (introHost) introHost.textContent = text || ''; }
  function clearIntro() { if (introHost) introHost.textContent = ''; }

  const ctx = () => ({ assessment: (getAssessment?.()) || {}, source: (getSource?.()) || '', minutes });

  function renderCard(chip) {
    active = chip;
    const card = chip.run(ctx());
    cardHost.innerHTML = '';
    const wrap = el('div', 'db-coach-result');
    wrap.appendChild(el('div', 'db-coach-result-title', card.title));
    for (const line of card.body) {
      const lineEl = el('div', 'db-coach-result-line');
      const m = /^([✓✗~])\s+/.exec(line);
      if (m) {
        const cls = m[1] === '✓' ? 'ico-check' : m[1] === '✗' ? 'ico-x' : 'ico-minus';
        const mark = el('span', `ico ${cls} db-coach-mark`);
        mark.setAttribute('aria-hidden', 'true');
        lineEl.append(mark, ' ' + line.slice(m[0].length));
      } else {
        lineEl.textContent = line;
      }
      wrap.appendChild(lineEl);
    }

    if (card.needMinutes) {
      const form = el('form', 'db-coach-minutes');
      const input = el('input');
      input.type = 'number'; input.min = '1'; input.max = '180'; input.placeholder = 'min'; input.setAttribute('aria-label', 'Talk length in minutes');
      const go = el('button', 'db-btn db-btn-primary', 'Check'); go.type = 'submit';
      form.append(input, el('span', 'db-coach-min', 'min'), go);
      form.addEventListener('submit', (e) => { e.preventDefault(); minutes = Math.max(1, Number(input.value) || 10); renderCard(chip); });
      wrap.appendChild(form);
      setTimeout(() => input.focus(), 0);
    }
    if (card.jump) {
      const j = el('button', 'db-coach-jump'); j.innerHTML = `Go to slide ${card.jump} <span class="ico ico-arrow-right" aria-hidden="true"></span>`;
      j.type = 'button';
      j.addEventListener('click', () => reveal?.(chunkStartLines(ctx().source)[card.jump] || 1));
      wrap.appendChild(j);
    }
    cardHost.appendChild(wrap);
  }

  function renderChips() {
    chipsHost.innerHTML = '';
    for (const chip of CHIPS) {
      const b = el('button', 'db-coach-chip', chip.label);
      b.type = 'button';
      if (active && active.id === chip.id) b.classList.add('is-active');
      b.addEventListener('click', () => { clearIntro(); renderChips(); renderCard(chip); paintActive(chip); });
      chipsHost.appendChild(b);
    }
  }
  function paintActive(chip) {
    for (const b of chipsHost.children) b.classList.toggle('is-active', b.textContent === chip.label);
  }

  renderChips();
  return { render: renderChips, intro, clearIntro };
}
