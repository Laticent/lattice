/**
 * The use-case generator's placeholder grammar (tools/build-use-cases.js), pinned to exactly four forms.
 * A fifth form is a decision, not an edit (lib/use-cases/README.md): this test is where that shows.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { emitString, sampleValue, CHAT_VARS } = require(path.join(__dirname, '../../../tools/build-use-cases.js'));

test('the four forms, and plain text', () => {
	assert.equal(emitString('plain `text`', 't'), JSON.stringify('plain `text`'));
	assert.equal(emitString('up to {{FIND_MAX_CHARS}} chars', 't'), '`up to ${v.FIND_MAX_CHARS} chars`');
	assert.equal(emitString('Topics: {{guides|join}}.', 't'), "`Topics: ${v.guides.join(', ')}.`");
	assert.equal(emitString('{{=MAX_VIEWS_PER_TURN}}', 't'), 'v.MAX_VIEWS_PER_TURN');
	assert.deepEqual(sampleValue(['none', '{{...finishes}}']), ['none', 'x']);
});

test('text that looks like template syntax stays text', () => {
	assert.equal(emitString('a `b` ${c} \\d {{FIND_MAX_CHARS}}', 't'), '`a \\`b\\` \\${c} \\\\d ${v.FIND_MAX_CHARS}`');
});

test('refuses what would change bytes silently or print the wrong thing', () => {
	assert.throws(() => emitString('a\r\nb {{FIND_MAX_CHARS}}', 't'), /carriage return/);
	assert.throws(() => emitString('{{guides}} x', 't'), /needs \|join/);
	assert.throws(() => emitString('{{FIND_MAX_CHARS|join}}', 't'), /only for a list/);
	assert.throws(() => emitString('{{NOPE}}', 't'), /unknown placeholder/);
	assert.throws(() => emitString('{{ FIND_MAX_CHARS }}', 't'), /malformed placeholder/);
	assert.throws(() => emitString('{{guides|upper}}', 't'), /malformed placeholder/);
});

test('every runtime value is a number or a list of strings', () => {
	for (const [name, type] of Object.entries(CHAT_VARS)) assert.ok(type === 'number' || type === 'readonly string[]', name);
});
