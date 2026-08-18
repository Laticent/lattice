/**
 * `checkRuntimeMarkupSinks` — HARD RULE #22, the POST-SANITIZE INJECTION shape (#1246).
 *
 * WHY THIS GATE EXISTS. #22's three existing arms all guard the moment a preview
 * DOCUMENT is assembled: the builder sanitizes the slide markup, sanitizes the
 * stylesheet, and hands both to the frame. `lib/runtime` then runs INSIDE that frame and
 * writes more markup into it — after every one of those guards has already run. The
 * sanitizer is one step too early for anything the runtime injects, and no gate could see
 * it: `checkPreviewHtmlSinks` verifies a builder CALLS `sanitizeSlideHtml`, and the
 * builder does.
 *
 * The concrete instance is Mermaid: the runtime hands a diagram's source to a third-party
 * renderer and assigns the returned SVG to `innerHTML`. What contains that today is
 * Mermaid's own `securityLevel: 'strict'`, which is a behavioral property of a
 * floating dependency, not of this repo — so the durable requirement is not "sanitize the
 * SVG" (measured: DOMPurify deletes `<foreignObject>` and `<style>`, i.e. every node label
 * and every diagram's styling) but "a new injection point cannot land without someone
 * writing down where its markup comes from."
 *
 * So the gate is a CENSUS of markup sinks in `lib/runtime`, each with a declared
 * PROVENANCE. It fires on an undeclared sink, on a count that moved, and on a stale entry.
 *
 * WRITTEN FIRST, per the standing rule this repo has had violated five times: a gate in
 * `tools/check-ownership.js` gets its test before its implementation, because a gate with
 * no test is a claim rather than an enforcement.
 */
const { test, describe, afterEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { checkRuntimeMarkupSinks, SANCTIONED_RUNTIME_MARKUP_SINKS } = require('../../../tools/check-ownership.js');

// Probes live in a TEMP tree, never in the real one: `node --test` runs files
// concurrently, so a probe written into `lib/runtime` is seen by check-ownership.test.js
// scanning the same tree, and a crash between write and cleanup leaves a file that fails
// `build:check`. That has happened here before, as a 1-in-6589 flake during a push.
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-runtime-sink-'));
fs.mkdirSync(path.join(TMP, 'lib', 'runtime'), { recursive: true });
const NAME = 'probe.js';
const PROBE_ABS = path.join(TMP, 'lib', 'runtime', NAME);
const PROBE_REL = 'lib/runtime/probe.js';

afterEach(() => fs.rmSync(PROBE_ABS, { force: true }));
after(() => fs.rmSync(TMP, { recursive: true, force: true }));

/** Run the real gate over the temp tree with `src` as its only runtime file. */
function gate(src, sanctions = []) {
	fs.writeFileSync(PROBE_ABS, src);
	const errors = [];
	checkRuntimeMarkupSinks(errors, sanctions, TMP);
	return errors;
}

/** The census entry shape, for brevity in the arms below. */
const entry = (sink, count, provenance = 'probe') => ({ file: PROBE_REL, sink, count, provenance });

describe('checkRuntimeMarkupSinks — sinks that MUST be declared', () => {
	test('an undeclared innerHTML assignment fires', () => {
		const errors = gate('function f(target, svg) { target.innerHTML = svg; }');
		assert.equal(errors.length, 1);
		assert.match(errors[0], /target\.innerHTML/);
		assert.match(errors[0], /provenance/i);
	});

	test('a declared innerHTML assignment at the declared count passes', () => {
		assert.deepEqual(gate('function f(target, svg) { target.innerHTML = svg; }', [entry('target.innerHTML', 1)]), []);
	});

	test('outerHTML, insertAdjacentHTML, srcdoc, document.write and createContextualFragment all count', () => {
		// Each is a way to turn a string into live DOM. A gate that knew only `innerHTML`
		// would be trivially side-stepped by the next author reaching for any of the others,
		// which is precisely the failure mode #1246 is about.
		const shapes = [
			['el.outerHTML = s;', 'el.outerHTML'],
			['host.insertAdjacentHTML("beforeend", s);', 'host.insertAdjacentHTML'],
			['frame.srcdoc = s;', 'frame.srcdoc'],
			['document.write(s);', 'document.write'],
			['range.createContextualFragment(s);', 'range.createContextualFragment'],
		];
		for (const [code, sink] of shapes) {
			const errors = gate(`function f(el, host, frame, range, s) { ${code} }`);
			assert.equal(errors.length, 1, `${sink} was not seen as a markup sink`);
			assert.match(errors[0], new RegExp(sink.replace('.', '\\.')));
			assert.deepEqual(gate(`function f(el, host, frame, range, s) { ${code} }`, [entry(sink, 1)]), [], `${sink} declared should pass`);
		}
	});

	test('a SECOND sink of an already-declared shape fires — the count is the pin', () => {
		// The whole point: `target.innerHTML` is already legitimate somewhere in the runtime,
		// so a file-scoped "is this sink mentioned" rule would certify a NEW injection point
		// hiding behind the old one. That is finding 7 of #1731, in a different channel.
		const src = 'function f(target, a, b) { target.innerHTML = a; target.innerHTML = b; }';
		const errors = gate(src, [entry('target.innerHTML', 1)]);
		assert.equal(errors.length, 1);
		assert.match(errors[0], /2 .*declares 1|declares 1.*2/);
	});
});

describe('checkRuntimeMarkupSinks — shapes that must NOT fire', () => {
	test('reading innerHTML is not a sink', () => {
		assert.deepEqual(gate('function f(el) { return el.innerHTML; }'), []);
	});

	test('a sink named only inside a comment does not count', () => {
		// A comment mention satisfying a text matcher is a MEASURED evasion in this repo
		// (#1731 §9.8), so it is pinned here rather than left to the implementation.
		assert.deepEqual(gate('// target.innerHTML = svg is what we do NOT do\n/* el.outerHTML = x; */\nfunction f() {}'), []);
	});

	test('a file with no markup sink at all is silent', () => {
		assert.deepEqual(gate('export function add(a, b) { return a + b; }'), []);
	});

	test('textContent is not a markup sink — it does not parse markup', () => {
		assert.deepEqual(gate('function f(el, s) { el.textContent = s; }'), []);
	});
});

describe('checkRuntimeMarkupSinks — the allowlist stays honest', () => {
	test('a declared sink that no longer exists is reported STALE', () => {
		const errors = gate('export function nothing() {}', [entry('gone.innerHTML', 1)]);
		assert.equal(errors.length, 1);
		assert.match(errors[0], /stale/i);
	});

	test('a declared sink whose count DROPPED is reported too', () => {
		const errors = gate('function f(target, a) { target.innerHTML = a; }', [entry('target.innerHTML', 2)]);
		assert.equal(errors.length, 1);
		assert.match(errors[0], /1 .*declares 2|declares 2.*1/);
	});
});

describe('checkRuntimeMarkupSinks — against the REAL tree', () => {
	// Anti-vacuity. Every arm above runs over a temp tree, so all of them would still pass
	// if the gate walked a directory that does not exist. This asserts the committed
	// allowlist actually describes `lib/runtime` as it stands.
	test('the committed allowlist matches the real runtime with no errors', () => {
		const errors = [];
		checkRuntimeMarkupSinks(errors);
		assert.deepEqual(errors, []);
	});

	test('the allowlist is non-empty and names the Mermaid injection points', () => {
		// The two sites #1246 is about: the fresh render and the CACHE REPLAY of the same
		// third-party SVG. The issue named only the first; a fix that forgot the second
		// would have left an identical injection point open.
		assert.ok(SANCTIONED_RUNTIME_MARKUP_SINKS.length > 0, 'an empty allowlist would make the real-tree arm vacuous');
		const mermaid = SANCTIONED_RUNTIME_MARKUP_SINKS.filter((s) => /mermaid/i.test(s.provenance));
		assert.ok(mermaid.length >= 1, 'no entry declares mermaid provenance — the injection points #1246 is about');
		const total = mermaid.reduce((n, s) => n + s.count, 0);
		assert.ok(total >= 2, `expected at least 2 mermaid-sourced injections (render + cache replay), found ${total}`);
	});

	test('every entry states a provenance, and third-party provenance is called out as such', () => {
		for (const s of SANCTIONED_RUNTIME_MARKUP_SINKS) {
			assert.ok(s.file && s.sink && Number.isInteger(s.count) && s.count > 0, `malformed entry: ${JSON.stringify(s)}`);
			assert.ok(
				typeof s.provenance === 'string' && s.provenance.length > 30,
				`${s.file} ${s.sink}: provenance must say where the markup comes from, not just that it exists`,
			);
		}
	});
});
