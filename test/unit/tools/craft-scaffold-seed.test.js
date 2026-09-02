/**
 * Unit: the Craft track's scaffold seed matches the scaffold.
 *
 * `CSS_COMPONENT_STUB` in docs/src/components/craft/samples.ts is the only seed in
 * the Craft track that claims a BYTE-LEVEL match with a command the reader just ran
 * in their own terminal: `components/first-component.mdx` tells them to run
 * `npm run new:component`, and then opens a lab on "the scaffold's stub exactly as it
 * is written to disk". Every other seed is illustrative and can drift harmlessly.
 * This one cannot: a reader who diffs the lab against their new file and finds two
 * different things has been told something false at the exact moment they checked.
 *
 * It HAS been false. The seed shipped as two declarations on `> .cell-stage` while
 * the generator writes an empty rule on `section.<name>` — and the difference was not
 * cosmetic, because the real stub opens by breaking the rule
 * `components/css-rules.mdx` spends a page establishing (§3, "Not `section.takeaway`
 * directly"), which is the reader's first edit and the point of the exercise.
 *
 * Nothing else pins it. `samples.ts` is docs-site source, so no ownership gate reads
 * it; the seed's own docblock asks a human to keep it in sync, which is what every
 * un-gated invariant in this repo has asked before drifting. So: render the
 * generator's own template with this component's axes and compare.
 *
 * If this fails: `tools/new-component.js` changed its CSS template. Copy the new
 * output into `CSS_COMPONENT_STUB` verbatim (tabs included) and re-read the lab hint
 * in `components/first-component.mdx` — its numbered steps start from whatever this
 * stub contains, so a template change usually invalidates step 1.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..', '..');
const GENERATOR = path.join(ROOT, 'tools', 'new-component.js');
const SEEDS = path.join(ROOT, 'docs', 'src', 'components', 'craft', 'samples.ts');

// The axes `components/first-component.mdx` and `examples/component.mdx` both use.
const AXES = { name: 'takeaway', fn: 'statement', form: 'canvas', substance: 'structure' };

/** The generator's CSS template, rendered with the axes the docs use. */
function scaffoldOutput() {
	const src = fs.readFileSync(GENERATOR, 'utf8');
	const m = src.match(/const css = `([\s\S]*?)`;/);
	assert.ok(m, 'tools/new-component.js no longer has a `const css = ` template literal');
	return m[1].replace(/\$\{(\w+)\}/g, (_, k) => {
		assert.ok(k in AXES, `template interpolates \${${k}}, which this test does not model`);
		return AXES[k];
	});
}

/** The seed the Craft lab opens on, with its escapes resolved. */
function seedStub() {
	const src = fs.readFileSync(SEEDS, 'utf8');
	const m = src.match(/export const CSS_COMPONENT_STUB = `([\s\S]*?)`;/);
	assert.ok(m, 'CSS_COMPONENT_STUB is gone from docs/src/components/craft/samples.ts');
	return m[1];
}

describe('Craft scaffold seed', () => {
	test('CSS_COMPONENT_STUB is byte-identical to what new:component writes', () => {
		// Both sides carry `\t` as a two-character escape inside their own template
		// literal; resolve it on both so the comparison is over the emitted bytes.
		const real = scaffoldOutput().replace(/\\t/g, '\t');
		const seed = seedStub().replace(/\\t/g, '\t');
		assert.equal(
			seed,
			real,
			'the Craft lab opens on a stub that is not what `npm run new:component` writes — ' +
				'see this file\'s header for what to do',
		);
	});

	test('the stub anchors on the section, which is what makes step 1 of the lab a real edit', () => {
		// Not style policing: `components/first-component.mdx`'s hint opens with
		// "change the selector to section.takeaway > .cell-stage". If the generator
		// ever emits `> .cell-stage` itself, that step becomes a no-op and the hint
		// has to be rewritten — this asserts the premise the hint rests on.
		const real = scaffoldOutput();
		assert.match(real, /section\.takeaway\s*\{/, 'the scaffold no longer anchors on section.<name>');
		assert.ok(
			!/section\.takeaway\s*>\s*\.cell-stage/.test(real),
			'the scaffold now writes the `> .cell-stage` anchor itself, so step 1 of the ' +
				'first-component lab hint is a no-op and must be rewritten',
		);
	});
});
