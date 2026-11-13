// @vitest-environment node
// The Studio's source checks read `analysisText` (payload-elision.ts): the deck with each long base64 payload a short
// stand-in. Every reader of it must answer exactly what it answers on the whole deck. These readers ask yes/no and
// position questions (is there math, could the deck name a web image, which deck facts it trips, where a slide sits),
// so a stand-in should never change an answer; this pins it on every example deck, with a picture in every form. The
// head-to-head on PR #3153 found lint measuring stand-ins; this is the same oracle for the Studio's side.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { splitSlideChunks } from '../../../lib/core/slide-boundaries.mjs';
import { supplyablePosition } from '../../../lib/diagnostics/slice-equivalence-core.mjs';
import { sourceHasMath, sourceHasMathOutsideCode } from '../../../lib/plugins/math/math.syntax.mjs';
import { mayReferenceWebImage } from '../components/studio/web-image-hint';
import { deckDerivedFactsFor } from '../playground/single-slide-render';
import { analysisText } from './payload-elision';

const LONG = `${'QUJD'.repeat(1500)}iVBO+w0/Zg==`;
const FORMS = [
	`<!-- _class: image -->\n\n## Photo\n\n![bg](data:image/png;base64,${LONG})`,
	`## Inline\n\nAn inline ![a](data:image/jpeg;base64,${LONG}) in prose.`,
	`## Tag\n\n<img src="data:image/png;base64,${LONG}" alt="x">`,
	`## Styled\n\n<div style="background-image:url('data:image/png;base64,${LONG}')">S</div>`,
	`## Fence\n\n\`\`\`\n![bg](data:image/png;base64,${LONG})\n\`\`\``,
	`<!-- _class: decision -->\n\n## T\n\n- One &lt;img src=data:image/png;base64,${LONG}&gt;\n  - body\n- Two\n  - body`,
	`## Math\n\n$x$ and ![m](data:image/png;base64,${LONG})`,
];

/** Every answer the Studio's source checks take from the text, for one deck. */
function answers(text: string, slideCount: number) {
	return {
		web: mayReferenceWebImage(text),
		math: sourceHasMath(text),
		mathOutsideCode: sourceHasMathOutsideCode(text),
		facts: deckDerivedFactsFor(text),
		positions: Array.from({ length: slideCount }, (_, i) => supplyablePosition(text, i, slideCount, undefined)),
	};
}

describe('analysisText: every source check answers what the whole deck gives', () => {
	it('on every example deck, with a picture in every form', () => {
		const dir = fileURLToPath(new URL('../../../examples/', import.meta.url));
		const files = fs.readdirSync(dir).filter((f) => f.endsWith('.md')).sort();
		expect(files.length).toBeGreaterThan(300);
		const differ: string[] = [];
		for (const f of files) {
			const deck = `${fs.readFileSync(path.join(dir, f), 'utf8')}\n\n---\n\n${FORMS.join('\n\n---\n\n')}\n`;
			const scan = analysisText(deck);
			expect(scan.length, `${f}: the stand-ins took effect`).toBeLessThan(deck.length);
			const slideCount = splitSlideChunks(deck).chunks.length;
			expect(slideCount, `${f}: slides counted`).toBeGreaterThan(FORMS.length);
			if (JSON.stringify(answers(scan, slideCount)) !== JSON.stringify(answers(deck, slideCount))) differ.push(f);
		}
		expect(differ).toEqual([]);
	});
});
