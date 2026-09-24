// Guardrail G1 (2026-09-24-lattice-timing-track.md §8): the LTT JSON Schema has ONE source, the
// TypeScript types, and the generator refuses what it cannot translate faithfully.

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Ajv2020 = require('ajv/dist/2020').default;
const { buildTrack } = require('@laticent/cadenza');
const { validateLtt } = require('@laticent/ltt');
const { generate, render, OUT } = require('../../../tools/build-ltt-schema.js');

const schema = JSON.parse(fs.readFileSync(OUT, 'utf8'));
const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema);
const H = `sha256:${'cd'.repeat(32)}`;

function deck() {
  return {
    format: 'ltt',
    version: '1.0',
    source: { kind: 'deck', id: 'board.md' },
    inputs: { engine: H, pace: 'moderate', deckPace: 'natural' },
    seekable: true,
    segments: [
      { id: 'd1', kind: 'slide', at: { slide: 1 }, hash: H, basis: 'estimate', holdMs: 0, track: buildTrack('Revenue grew 18% to $4.2M.', { emphasis: [{ start: 0, end: 7, weight: 2 }] }), tailMs: 620 },
      { id: 'd2', kind: 'hold', at: { slide: 2 }, holdMs: 1400 },
    ],
  };
}

function tour() {
  return {
    format: 'ltt',
    version: '1.0',
    source: { kind: 'tour', id: 'demo' },
    inputs: { engine: H, pace: 'fast', viewport: { w: 390, h: 844 }, motion: 'legible', stagePace: 1.5 },
    seekable: true,
    segments: [
      {
        id: 's1', kind: 'stretch', at: { beats: [0, 1] }, after: 'awaitUser', waitedMs: 1200, hash: H, basis: 'measured',
        track: buildTrack('Now click Publish.'),
        audio: { src: 'audio/s1.mp3', clip: H, voice: { model: 'hexgrad/kokoro-82m', voice: 'af_heart', speed: 1 }, measuredMs: 1300, leadMs: 46 },
        actions: [{ cue: 0, word: 2, match: 'publish', verb: 'click', target: '#publish', arrive: 'on-word' }],
      },
    ],
  };
}

describe('the committed schema is generated from types.ts', () => {
  test('regenerating reproduces the committed file byte for byte', () => {
    assert.equal(render(generate()), fs.readFileSync(OUT, 'utf8'));
  });

  test('ajv compiles it in strict mode', () => {
    assert.equal(typeof validate, 'function');
  });
});

describe('the schema and validateLtt agree', () => {
  test('a deck and a tour carrying every layer pass both', () => {
    for (const l of [deck(), tour()]) {
      assert.ok(validate(l), JSON.stringify(validate.errors));
      assert.deepEqual(validateLtt(l), []);
    }
  });

  // Structural breaks — the part the schema CAN say. Each must fail both checkers.
  const breaks = {
    'a missing spoken form': (l) => { delete l.segments[0].track.cues[0].words[0].spoken; },
    'an undeclared key in the closed core': (l) => { l.segments[0].track.cues[0].words[0].pitch = 1; },
    'a malformed hash': (l) => { l.inputs.engine = 'md5:00'; },
    'a fractional time': (l) => { l.segments[0].track.cues[0].startMs = 0.5; },
    'an unknown segment kind': (l) => { l.segments[1].kind = 'pause'; },
    'an unknown basis': (l) => { l.segments[0].basis = 'guessed'; },
    'the wrong version': (l) => { l.version = '1.1'; },
    'a negative voice speed': (l) => { l.segments[0].audio = { src: 'a.mp3', clip: H, voice: { model: 'm', voice: 'v', speed: -1 }, measuredMs: 900 }; },
    'a slide without its tail breath': (l) => { delete l.segments[0].tailMs; },
  };
  for (const [name, edit] of Object.entries(breaks)) {
    test(`both reject ${name}`, () => {
      const l = deck();
      edit(l);
      assert.equal(validate(l), false, 'the schema accepted it');
      assert.ok(validateLtt(l).length > 0, 'validateLtt accepted it');
    });
  }

  test('both accept a layer neither has heard of — a reader skips it', () => {
    const l = deck();
    l.segments[0].subtitlesInKlingon = [1];
    l.futureTopLevel = true;
    assert.ok(validate(l), JSON.stringify(validate.errors));
    assert.deepEqual(validateLtt(l), []);
  });
});

describe('the generator reads what it is given exactly', () => {
  test('a tag on the same line as the previous token is kept, not dropped', () => {
    const $defs = generate('export interface Ltt { /** @integer */ a: number; b: string; /** @integer */ c: number }').$defs;
    assert.equal($defs.Ltt.properties.a.type, 'integer');
    assert.equal($defs.Ltt.properties.c.type, 'integer');
  });
  test('a quoted property name is the key itself', () => {
    assert.deepEqual(Object.keys(generate('export interface Ltt { "a-b": string }').$defs.Ltt.properties), ['a-b']);
  });
  test('@integer caps at the largest safe integer, as validateLtt does', () => {
    assert.equal(generate('export interface Ltt {\n  /** @integer */\n  a: number;\n}').$defs.Ltt.properties.a.maximum, Number.MAX_SAFE_INTEGER);
  });
});

describe('the generator refuses what it cannot translate faithfully', () => {
  const refuse = {
    'a type from outside the file': 'export interface Ltt { at: Date }',
    'a generic': 'export interface Ltt { p: Partial<Ltt> }',
    'a value declaration': 'export interface Ltt { a: string }\nexport const X = 1;',
    'an unknown doc tag': 'export interface Ltt {\n  /** @format date-time */\n  a: string;\n}',
    '`extends`': 'interface B { a: string }\nexport interface Ltt extends B { b: string }',
    'an optional tuple element': 'export interface Ltt { a: [number, number?] }',
    '@integer on a string': 'export interface Ltt {\n  /** @integer */\n  a: string;\n}',
    'a method': 'export interface Ltt { f(): void }',
    // The red team's six silent mistranslations (PR #2347): each used to produce a WRONG schema.
    'prose after a tag, which became the tag\'s value': 'export interface Ltt {\n  /** @pattern ^x$ the id */\n  a: string;\n}',
    'an overlapping union': 'export interface Ltt { a: string | "x" }',
    'a type declared twice (declaration merging)': 'export interface Ltt { a: string }\nexport interface Ltt { b: string }',
    '@closed on a type alias': '/** @closed */\nexport type X = string;\nexport interface Ltt { a: X }',
    '@minimum on a string': 'export interface Ltt {\n  /** @minimum 0 */\n  a: string;\n}',
  };
  for (const [name, src] of Object.entries(refuse)) {
    test(`refuses ${name}`, () => {
      assert.throws(() => generate(src));
    });
  }
});
