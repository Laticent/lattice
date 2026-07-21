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
  // NATIVE renderer output: roled marks (data-anima-role), NO ids (the ingest mints them).
  section.innerHTML =
    '<div class="funnel-figure"><svg class="funnel-svg" viewBox="0 0 320 180">' +
    '<polygon class="funnel-band" data-mark="0" data-anima-role="bar" data-value="10,000" points="85,16 235,16 184,46 136,46"/>' +
    '<polygon class="funnel-band" data-mark="1" data-anima-role="bar" data-value="3,200" points="136,58 184,58 168,88 152,88"/>' +
    '</svg></div>';
  doc.body.appendChild(section);
  return doc;
}

describe('createAnimaScenes — chart-anima wiring', () => {
  it('hydrates an opted-in chart section on rebind (mounts a live stage through the shared host)', () => {
    const doc = chartAnimaDoc();
    const scenes = createAnimaScenes({ getFrame: () => frameOf(doc) });
    scenes.rebind();
    expect(doc.querySelector('section.chart-anima .scene-live')).not.toBeNull();
    expect(doc.querySelector('section.chart-anima')?.getAttribute('data-scene-live')).toBe('1');
    scenes.destroy();
    expect(doc.querySelector('.scene-live')).toBeNull(); // torn down on destroy
    expect(doc.querySelector('section.chart-anima')?.getAttribute('data-scene-live')).toBeNull();
  });

  it('keeps a live chart RUNNING across a second rebind — the SAME stage node, not a dispose+remount', () => {
    const doc = chartAnimaDoc();
    const scenes = createAnimaScenes({ getFrame: () => frameOf(doc) });
    scenes.rebind();
    const stageA = doc.querySelector('.scene-live'); // capture the mounted node's identity
    expect(stageA).not.toBeNull();
    scenes.rebind();
    const stageB = doc.querySelector('.scene-live');
    expect(doc.querySelectorAll('.scene-live')).toHaveLength(1); // not doubled
    expect(stageB).toBe(stageA); // IDENTICAL node → it kept running (a remount would be a new node)
    scenes.destroy();
  });

  it('disposes a chart whose section left the DOM', () => {
    const doc = chartAnimaDoc();
    const scenes = createAnimaScenes({ getFrame: () => frameOf(doc) });
    scenes.rebind();
    doc.querySelector('section.chart-anima')?.remove(); // a re-render dropped the section
    scenes.rebind();
    expect(doc.querySelector('.scene-live')).toBeNull();
    scenes.destroy();
  });

  it('disposes a chart that OPTED OUT on a reused node (lost the class) — no leak, poster restored', () => {
    const doc = chartAnimaDoc();
    const scenes = createAnimaScenes({ getFrame: () => frameOf(doc) });
    scenes.rebind();
    const section = doc.querySelector('section.funnel') as HTMLElement;
    section.classList.remove('chart-anima'); // the author removed the opt-in; same node survives
    scenes.rebind();
    expect(doc.querySelector('.scene-live')).toBeNull(); // disposed — not stranded live
    expect(section.getAttribute('data-scene-live')).toBeNull();
    expect((section.querySelector('.funnel-svg') as SVGElement).style.display).toBe(''); // static chart restored
    scenes.destroy();
  });

  it('ignores a chart section WITHOUT the opt-in class', () => {
    const doc = chartAnimaDoc();
    doc.querySelector('section')?.classList.remove('chart-anima'); // opt out
    const scenes = createAnimaScenes({ getFrame: () => frameOf(doc) });
    scenes.rebind();
    expect(doc.querySelector('.scene-live')).toBeNull(); // not animated
    scenes.destroy();
  });
});
