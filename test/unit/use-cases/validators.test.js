/**
 * The use cases' generated input validators (tools/build-use-cases.js, use-case-layer.md §7): one standalone
 * ajv validator per manifest, which the dispatcher runs before the handler. No network, no ajv at runtime.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '../../..');
const { generateValidators, validatorSchema, readManifests } = require(path.join(ROOT, 'tools/build-use-cases.js'));
const { VALIDATORS } = require(path.join(ROOT, 'lib/use-cases/validators.generated.mjs'));

const manifests = readManifests();
const { checkUseCaseValidators } = require(path.join(ROOT, 'tools/check-ownership.js'));
const os = require('node:os');

/** A use-case folder in a temp dir, never the live tree (a probe in lib/ is read by every parallel walk of it). */
function tree({ ids = ['a', 'b'], validators = ids, index = ids.map((id) => `./${id}/${id}.validate.mjs`), body = 'export const validate = (d) => true;' } = {}) {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-validators-'));
	for (const id of new Set([...ids, ...validators])) fs.mkdirSync(path.join(root, 'lib/use-cases', id), { recursive: true });
	for (const id of ids) fs.writeFileSync(path.join(root, 'lib/use-cases', id, `${id}.use-case.json`), '{}');
	for (const id of validators) fs.writeFileSync(path.join(root, 'lib/use-cases', id, `${id}.validate.mjs`), `// GENERATED\n${typeof body === 'function' ? body(id) : body}\n`);
	fs.writeFileSync(path.join(root, 'lib/use-cases/validators.generated.mjs'), index.map((s, i) => `import v${i} from '${s}';`).join('\n'));
	return root;
}
const gate = (opts) => {
	const errors = [];
	checkUseCaseValidators(errors, { root: tree(opts) });
	return errors;
};


test('every use case has a validator, and the index lists exactly the use cases', () => {
	assert.deepEqual(Object.keys(VALIDATORS).sort(), manifests.map((m) => m.id).sort());
	for (const m of manifests) {
		assert.ok(fs.existsSync(path.join(ROOT, 'lib/use-cases', m.id, `${m.id}.validate.mjs`)), m.id);
		assert.equal(typeof VALIDATORS[m.id], 'function', m.id);
	}
});

test('the committed validators are what the generator makes now', () => {
	for (const [file, text] of Object.entries(generateValidators())) {
		assert.equal(fs.readFileSync(file, 'utf8'), text, `${path.relative(ROOT, file)} is stale: run npm run build`);
	}
});

test('a generated validator imports nothing, from ajv or anywhere else', () => {
	for (const m of manifests) {
		const src = fs.readFileSync(path.join(ROOT, 'lib/use-cases', m.id, `${m.id}.validate.mjs`), 'utf8');
		assert.doesNotMatch(src, /\bimport\s*[\s{*("'`]|\brequire\s*\(/, m.id);
	}
});

test('a runtime-valued keyword is left to the handler, and named; descriptions never reach the validator', () => {
	const { schema, dropped } = validatorSchema({
		type: 'object',
		description: 'text for the model',
		properties: {
			name: { type: 'string', enum: ['none', '{{...finishes}}'], description: 'x' },
			topic: { type: 'string', enum: '{{=guides}}' },
			names: { type: 'array', items: { type: 'string' }, maxItems: '{{=MAX_VIEWS_PER_TURN}}' },
			// A field may be called `description`: it is a property name, not the keyword.
			description: { type: 'string', enum: ['a', 'b'] },
		},
	});
	assert.deepEqual(dropped, ['/properties/name/enum', '/properties/topic/enum', '/properties/names/maxItems']);
	assert.deepEqual(schema, {
		type: 'object',
		properties: {
			name: { type: 'string' },
			topic: { type: 'string' },
			names: { type: 'array', items: { type: 'string' } },
			description: { type: 'string', enum: ['a', 'b'] },
		},
	});
	// The five manifests that name a runtime value say which keyword they left out.
	const left = manifests.filter((m) => validatorSchema(m.input).dropped.length).map((m) => m.id);
	assert.deepEqual(left.sort(), ['chart_from_data', 'read_guide', 'set_finish', 'set_theme', 'view_asset']);
});

test('the gate passes the live tree, and a clean probe tree', () => {
	const errors = [];
	checkUseCaseValidators(errors);
	assert.deepEqual(errors, []);
	assert.deepEqual(gate(), []);
});

test('the gate refuses a manifest without a validator, and a validator without a manifest', () => {
	assert.match(gate({ validators: ['a'] }).join('\n'), /b\.use-case\.json has no validator/);
	assert.match(gate({ validators: ['a', 'b', 'c'] }).join('\n'), /c\.validate\.mjs has no manifest/);
});

test('the gate refuses a validator that imports anything, in any spelling; a comment that says "import" is fine', () => {
	for (const body of ["import ucs2length from 'ajv/dist/runtime/ucs2length';", 'const equal = require("ajv/dist/runtime/equal").default;', "import { x } from './helper.mjs';", "export { y } from './other.mjs';", 'import("./late.mjs");']) {
		assert.match(gate({ body }).join('\n'), /imports a module/, body);
	}
	assert.deepEqual(gate({ body: '// this file imports nothing\nexport const validate = () => true;' }), []);
});

test('the gate refuses an index that misses a validator or imports anything else', () => {
	assert.match(gate({ index: ['./a/a.validate.mjs'] }).join('\n'), /missing \.\/b\/b\.validate\.mjs/);
	assert.match(gate({ index: ['./a/a.validate.mjs', './b/b.validate.mjs', 'ajv'] }).join('\n'), /unexpected ajv/);
});

