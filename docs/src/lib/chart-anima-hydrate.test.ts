// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { hydrateChart, worstMarks } from './chart-anima-hydrate';

// A minimal funnel section mirroring the renderer's NATIVE output: roled marks (data-anima-role),
// NO ids (the ingest mints them), wrapped in the `.funnel-figure` the host mounts the live stage into.
const FUNNEL_SECTION = () => {
  const section = document.createElement('section');
  section.className = 'funnel chart-anima';
  section.innerHTML =
    '<div class="funnel-figure"><svg class="funnel-svg" viewBox="0 0 320 180">' +
    '<polygon class="funnel-band" data-mark="0" data-anima-role="bar" data-value="10,000" points="85,16 235,16 184,46 136,46"/>' +
    '<text class="funnel-label" data-anima-role="label" x="76" y="31">Visitors</text>' +
    '<polygon class="funnel-band" data-mark="1" data-anima-role="bar" data-value="3,200" points="136,58 184,58 168,88 152,88"/>' +
    '<text class="funnel-label" data-anima-role="label" x="76" y="73">Signups</text>' +
    '</svg></div>';
  return section;
};

describe('hydrateChart — chart on-ramp through the SHARED host', () => {
  it('animates an opted-in chart: mounts a live stage, hides the poster, and gives it the host control', () => {
    const section = FUNNEL_SECTION();
    document.body.appendChild(section);
    const figure = section.querySelector('.funnel-figure') as HTMLElement;
    const ctrl = hydrateChart(section, { style: 'build', eager: true });
    expect(ctrl).not.toBeNull();
    // The chart goes through the SAME host as a scene: a live stage, the poster hidden, the figure
    // marked `.anima-live` + `data-anima-state`, and the liveness flag — but NO playback control:
    // chart motion is a one-shot "play on enter" build (the replay control read as a gimmick).
    expect(figure.querySelector('.scene-live')).not.toBeNull();
    expect(figure.classList.contains('anima-live')).toBe(true);
    expect(figure.querySelector('.scene-control')).toBeNull(); // charts get NO control (chrome:false)
    expect(figure.getAttribute('data-anima-state')).toBe('playing'); // plays on mount
    expect((section.querySelector('.funnel-svg') as SVGElement).style.display).toBe('none'); // poster hidden
    expect(section.getAttribute('data-scene-live')).toBe('1');
    ctrl?.dispose();
    expect(figure.querySelector('.scene-live')).toBeNull(); // torn down
    expect(figure.classList.contains('anima-live')).toBe(false);
    expect((section.querySelector('.funnel-svg') as SVGElement).style.display).toBe(''); // poster restored
    expect(section.getAttribute('data-scene-live')).toBeNull();
    section.remove();
  });

  it('honors the reduced-motion FLOOR through the shared host — a reveal chart drops to the legible tier', () => {
    // A funnel uses reveal/highlight (not the vestibular spin/orbit), so under reduced motion the
    // shared host drops it to `legible` (safe) and still shows the build — the SAME accessibility
    // model as a scene, not a second forked one. It mounts (no throw) and disposes cleanly.
    const section = FUNNEL_SECTION();
    document.body.appendChild(section);
    const ctrl = hydrateChart(section, { style: 'build', reducedMotion: true, eager: true });
    expect(ctrl).not.toBeNull();
    expect(section.querySelector('.scene-live')).not.toBeNull();
    ctrl?.dispose();
    section.remove();
  });

  it('is idempotent — a second hydrate on an already-live section returns null (no double mount)', () => {
    const section = FUNNEL_SECTION();
    document.body.appendChild(section);
    const a = hydrateChart(section, { style: 'build', eager: true });
    const b = hydrateChart(section, { style: 'build', eager: true }); // already live → the shared marker guards it
    expect(a).not.toBeNull();
    expect(b).toBeNull();
    expect(section.querySelectorAll('.scene-live')).toHaveLength(1);
    a?.dispose();
    a?.dispose(); // dispose twice is safe (idempotent)
    section.remove();
  });

  it('returns null on a section with no svg (nothing to animate)', () => {
    const section = document.createElement('section');
    section.className = 'funnel chart-anima';
    section.textContent = 'no chart';
    expect(hydrateChart(section, { style: 'build' })).toBeNull();
  });
});

describe('worstMarks — the emphasis selector', () => {
  const svgWith = (values: string[]) => {
    const doc = new DOMParser().parseFromString(
      '<svg>' + values.map((v) => `<polygon class="funnel-band" data-value="${v}"/>`).join('') + '</svg>',
      'text/html',
    );
    return doc.querySelector('svg') as Element;
  };

  it('flags the band with the WORST outgoing conversion (the steepest drop)', () => {
    // 10,000 → 8,000 (80%) → 1,000 (12.5%, the leak) → 900 (90%). The worst step is index 1.
    expect(worstMarks(svgWith(['10,000', '8,000', '1,000', '900']))).toEqual([1]);
  });

  it('returns none when there is nothing to compare (fewer than two bands)', () => {
    expect(worstMarks(svgWith(['10,000']))).toEqual([]);
    expect(worstMarks(svgWith([]))).toEqual([]);
  });

  it('tolerates a zero/garbage numerator without dividing by zero', () => {
    // A leading 0 makes conv default to 1 (no false "worst"); the real drop 5,000→500 wins.
    expect(worstMarks(svgWith(['0', '5,000', '500']))).toEqual([1]);
  });
});
