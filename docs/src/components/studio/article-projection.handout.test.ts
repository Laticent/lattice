import { describe, expect, it } from 'vitest';
import { projectSectionsToArticle, withHandouts } from './article-projection';

// The Reading view shows each slide's handout (`<!-- @handout{…} -->`, engineering/decisions/2026-11-20-four-notes.md)
// after its body. The engine leaves the handout as a comment, and the bake and the sanitizer delete comments, so
// `projectDeckArticle` reads it first and hands it to the projection as the hidden `aside.lattice-handout` the CLI and
// the player export carry. These run the real sanitizer and the real projection, so they pin that the aside survives
// the one and is read by the other.

const SLIDE = '<section><h2>Where the pipeline leaks.</h2><p>Activation to paid loses most.</p></section>';

describe('the handout in the Reading view', () => {
	it('reaches the article as `.lp-handout`, after the slide body, one paragraph per blank-line block', async () => {
		const [sec] = withHandouts([SLIDE], ['Measured over 30 days.\n\nThe cohort is in the appendix.']);
		const { articleHtml } = await projectSectionsToArticle([sec]);
		expect(articleHtml).toContain('<aside class="lp-handout"><p>Measured over 30 days.</p><p>The cohort is in the appendix.</p></aside>');
		expect(articleHtml.indexOf('lp-handout')).toBeGreaterThan(articleHtml.indexOf('Activation to paid'));
	});

	it('escapes the handout, so author text is never markup', async () => {
		const [sec] = withHandouts([SLIDE], ['<img src=x onerror=alert(1)> & $& more']);
		expect(sec).toContain('&lt;img src=x onerror=alert(1)&gt; &amp; $&amp; more');
		const { articleHtml } = await projectSectionsToArticle([sec]);
		expect(articleHtml).not.toContain('<img');
		expect(articleHtml).toContain('$&amp; more');
	});

	it('leaves a slide with no handout as it was, so the article gains nothing', async () => {
		expect(withHandouts([SLIDE, SLIDE], [null, ''])).toEqual([SLIDE, SLIDE]);
		const { articleHtml } = await projectSectionsToArticle([SLIDE]);
		expect(articleHtml).not.toContain('lp-handout');
	});
});
