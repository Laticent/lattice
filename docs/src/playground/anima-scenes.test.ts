// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { createAnimaScenes } from './anima-scenes';

/** A fake frame whose contentDocument is a supplied jsdom document. */
function frameOf(doc: Document): HTMLIFrameElement {
  return { contentDocument: doc } as unknown as HTMLIFrameElement;
}

function chartAnimaDoc(): Document {
  const doc = document.implementation.createHTMLDocument('t');
  const section = doc.createElement('section');
  section.className = 'funnel chart-anima'; // the opt-in class
  section.innerHTML =
    '<div class="funnel-figure"><svg class="funnel-svg" viewBox="0 0 320 180">' +
    '<polygon class="funnel-band" data-mark="0" id="funnel-band-0" data-anima-role="bar" data-value="10,000" points="85,16 235,16 184,46 136,46"/>' +
    '<polygon class="funnel-band" data-mark="1" id="funnel-band-1" data-anima-role="bar" data-value="3,200" points="136,58 184,58 168,88 152,88"/>' +
    '</svg></div>';
  doc.body.appendChild(section);
  return doc;
}

describe('createAnimaScenes — chart-anima wiring', () => {
  it('hydrates an opted-in chart section on rebind (mounts a live stage)', () => {
    const doc = chartAnimaDoc();
    const scenes = createAnimaScenes({ getFrame: () => frameOf(doc) });
    scenes.rebind();
    expect(doc.querySelector('section.chart-anima .chart-scene-live')).not.toBeNull();
    scenes.destroy();
    expect(doc.querySelector('.chart-scene-live')).toBeNull(); // torn down on destroy
  });

  it('does not re-hydrate an already-live chart on a second rebind (stable, no restart)', () => {
    const doc = chartAnimaDoc();
    const scenes = createAnimaScenes({ getFrame: () => frameOf(doc) });
    scenes.rebind();
    scenes.rebind();
    expect(doc.querySelectorAll('.chart-scene-live')).toHaveLength(1); // exactly one, not doubled
    scenes.destroy();
  });

  it('disposes a chart whose section left the DOM', () => {
    const doc = chartAnimaDoc();
    const scenes = createAnimaScenes({ getFrame: () => frameOf(doc) });
    scenes.rebind();
    doc.querySelector('section.chart-anima')?.remove(); // a re-render dropped the section
    scenes.rebind();
    expect(doc.querySelector('.chart-scene-live')).toBeNull();
    scenes.destroy();
  });

  it('ignores a chart section WITHOUT the opt-in class', () => {
    const doc = chartAnimaDoc();
    doc.querySelector('section')?.classList.remove('chart-anima'); // opt out
    const scenes = createAnimaScenes({ getFrame: () => frameOf(doc) });
    scenes.rebind();
    expect(doc.querySelector('.chart-scene-live')).toBeNull(); // not animated
    scenes.destroy();
  });
});
