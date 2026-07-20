// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { hydrateChart } from './chart-anima-hydrate';

// A minimal funnel section mirroring the renderer's native output (roled + id'd marks).
const FUNNEL_SECTION = () => {
  const section = document.createElement('section');
  section.className = 'funnel';
  section.innerHTML =
    '<div class="funnel-figure"><svg class="funnel-svg" viewBox="0 0 320 180">' +
    '<polygon class="funnel-band" data-mark="0" id="funnel-band-0" data-anima-role="bar" data-value="10,000" points="85,16 235,16 184,46 136,46"/>' +
    '<text class="funnel-label" id="funnel-label-0" data-anima-role="label" x="76" y="31">Visitors</text>' +
    '<polygon class="funnel-band" data-mark="1" id="funnel-band-1" data-anima-role="bar" data-value="3,200" points="136,58 184,58 168,88 152,88"/>' +
    '<text class="funnel-label" id="funnel-label-1" data-anima-role="label" x="76" y="73">Signups</text>' +
    '</svg></div>';
  return section;
};

describe('hydrateChart', () => {
  it('animates an opted-in chart section: mounts a live stage and hides the static svg', () => {
    const section = FUNNEL_SECTION();
    document.body.appendChild(section);
    const ctrl = hydrateChart(section, { reducedMotion: true }); // reduced → no rAF, one poster frame
    expect(ctrl).not.toBeNull();
    expect(section.querySelector('.chart-scene-live')).not.toBeNull(); // the animated copy mounted
    expect((section.querySelector('.funnel-svg') as SVGElement).style.visibility).toBe('hidden'); // static hidden
    ctrl?.dispose();
    expect(section.querySelector('.chart-scene-live')).toBeNull(); // torn down
    expect((section.querySelector('.funnel-svg') as SVGElement).style.visibility).toBe(''); // static restored
    section.remove();
  });

  it('reads the NATIVE data-anima-role (not class-guessing) — a section with roled marks hydrates', () => {
    // Strip the funnel-* classes so ONLY data-anima-role can supply the roles.
    const section = FUNNEL_SECTION();
    for (const el of Array.from(section.querySelectorAll('[data-anima-role]'))) el.removeAttribute('class');
    document.body.appendChild(section);
    const ctrl = hydrateChart(section, { reducedMotion: true });
    expect(ctrl).not.toBeNull(); // roles came from data-anima-role alone
    ctrl?.dispose();
    section.remove();
  });

  it('returns null on a section with no svg (nothing to animate)', () => {
    const section = document.createElement('section');
    section.className = 'funnel';
    section.textContent = 'no chart';
    expect(hydrateChart(section)).toBeNull();
  });
});
