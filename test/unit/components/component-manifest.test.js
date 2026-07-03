/**
 * Unit: lib/components/index.js — manifest schema, validator, loader.
 *
 * Covers:
 *   1. validate() rejects bad/missing fields with clear messages
 *   2. loadOne() reads and validates a single manifest file
 *   3. loadAll() returns every manifest in the directory, name-sorted,
 *      and rejects duplicates
 *   4. groupByFunction() partitions the catalog by family for the
 *      scaffolder --list output
 *   5. Every shipped manifest in lib/components/ passes validation
 *      (the "every committed manifest is well-formed" gate)
 */



const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  FUNCTIONS,
  BUCKETS,
  FORMS,
  SUBSTANCES,
  MIXED_SUBSTANCE,
  UNIVERSAL_GROUPS,
  UNIVERSAL_VARIANTS,
  SEMI_UNIVERSAL_VARIANTS,
  FAMILY_MODIFIERS,
  FAMILY_MODIFIER_TOKENS,
  familyModifiersFor,
  TAG_GROUPS,
  TAGS,
  TAGS_MIN,
  TAGS_MAX,
  STATEMENT_OL_LAYOUTS,
  validate,
  effectiveVariants,
  findInlineTitleBodyLine,
  findBoldOrderedStatement,
  loadOne,
  loadAll,
  groupByFunction,
  groupByBucket,
  manifestBucket,
} = require('../../../lib/components');

const GOOD = Object.freeze({
  name: 'cards-grid',
  function: 'inventory',
  form: 'grid',
  substance: 'structure',
  tags: ['overview', 'showcase', 'summary'],
  description: 'Cards in a grid.',
  skeleton: '<!-- _class: cards-grid -->\n\n## Heading.\n',
});

describe('component-manifest', () => {
  describe('validate', () => {
    test('accepts a minimal well-formed manifest', () => {
      assert.deepEqual(validate(GOOD), []);
    });

    test('stressSample: accepts a non-empty string, rejects empty', () => {
      assert.deepEqual(validate({ ...GOOD, stressSample: '<!-- _class: x -->\n\n## …\n' }), []);
      assert.ok(validate({ ...GOOD, stressSample: '' }).some((e) => /stressSample/.test(e)));
    });

    test('accepts optional fields when present and well-formed', () => {
      const m = {
        ...GOOD,
        purpose: 'Use for parallel options.',
        variants: ['mirror', 'four', 'three'],
        excludes: ['loose'],
        slots: {
          title: { selector: 'h2', required: true, description: 'Heading.' },
        },
        example: 'examples/snippets/cards-grid.md',
        anatomyBlock: 'T7-card-grid-2x2',
      };
      assert.deepEqual(validate(m), []);
    });

    // transform DSL — the manifest-boundary safety gate (§12.1). A `transform`
    // field is run through validateTransform at load; an unsafe construct rejects
    // the manifest. (The field is inert — not yet wired into the render pipeline.)
    describe('transform (DSL safety gate)', () => {
      const withTransform = (t) => ({ ...GOOD, transform: t });
      const safe = [
        { name: 'feature', match: { section: 'cards-grid' }, do: [
          { capability: 'panel-eyebrow' },
          { extract: { into: { element: 'div', class: 'panel-left' }, slots: ['h2', 'p'] } },
          { wrap: { target: 'rest', into: { element: 'div', class: 'panel-right' } } },
        ] },
      ];

      test('accepts a well-formed transform', () => {
        assert.deepEqual(validate(withTransform(safe)), []);
      });
      test('a manifest with no transform field is unaffected', () => {
        assert.deepEqual(validate(GOOD), []);
      });
      test('rejects a barred element and surfaces the DSL message', () => {
        const errs = validate(withTransform([{ do: [{ extract: { into: { element: 'script' }, slots: ['h2'] } }] }]));
        assert.ok(errs.some((e) => /transform:.*element "script"/.test(e)), errs.join(' | '));
      });
      test('rejects a barred attribute (style / on* / URL)', () => {
        const errs = validate(withTransform([{ do: [{ extract: { into: { element: 'div', attrs: { onclick: 'x' } }, slots: ['h2'] } }] }]));
        assert.ok(errs.some((e) => /transform:.*attribute "onclick"/.test(e)), errs.join(' | '));
      });
      test('rejects an unknown op and an unknown capability', () => {
        assert.ok(validate(withTransform([{ do: [{ frobnicate: {} }] }])).some((e) => /transform:.*unknown op/.test(e)));
        assert.ok(validate(withTransform([{ do: [{ capability: 'exfiltrate' }] }])).some((e) => /transform:.*closed registry/.test(e)));
      });
      test('rejects a prototype-pollution payload', () => {
        const poison = JSON.parse('[{"do":[{"extract":{"into":{"element":"div","__proto__":{"x":1}},"slots":["h2"]}}]}]');
        assert.ok(validate(withTransform(poison)).some((e) => /transform:.*prototype pollution/.test(e)));
      });
      test('rejects a non-array transform', () => {
        assert.ok(validate(withTransform({ not: 'an array' })).some((e) => /transform:.*must be an array/.test(e)));
      });
    });

    test('capacity: accepts a well-formed contract', () => {
      const m = {
        ...GOOD,
        focusAxes: ['item'],
        sample: '<!-- _class: cards-grid -->\n\n## H\n\n- A\n  - a\n- B\n  - b\n- C\n  - c\n',
        capacity: { axis: 'item', min: 2, sweet: 3, soft: 4, hard: 5, escalateTo: ['list-tabular', 'split across slides'], note: 'crowds past four' },
      };
      assert.deepEqual(validate(m), []);
    });
    test('capacity: rejects an inert axis the sample cannot measure', () => {
      // axis 'col' (pipe-table columns) on a layout whose sample is a list →
      // the counter always returns 0, so the rule could never fire.
      const m = { ...GOOD, sample: '<!-- _class: x -->\n\n## H\n\n- A\n- B\n', capacity: { axis: 'col', soft: 4, hard: 6 } };
      assert.ok(validate(m).some((e) => /is not measurable/.test(e)));
    });
    test('capacity: requires soft and hard', () => {
      assert.ok(validate({ ...GOOD, capacity: { axis: 'item' } }).some((e) => /capacity requires integer soft and hard/.test(e)));
    });
    test('capacity: rejects an unknown axis', () => {
      assert.ok(validate({ ...GOOD, capacity: { axis: 'blob', soft: 4, hard: 6 } }).some((e) => /capacity\.axis/.test(e)));
    });
    test('capacity: axis must be one of the layout focusAxes when declared', () => {
      const m = { ...GOOD, focusAxes: ['item'], capacity: { axis: 'row', soft: 4, hard: 6 } };
      assert.ok(validate(m).some((e) => /must be one of the layout's focusAxes/.test(e)));
    });
    test('capacity: rejects decreasing bounds', () => {
      assert.ok(validate({ ...GOOD, capacity: { axis: 'item', sweet: 5, soft: 4, hard: 6 } }).some((e) => /non-decreasing/.test(e)));
    });
    test('capacity: rejects an unknown key', () => {
      assert.ok(validate({ ...GOOD, capacity: { axis: 'item', soft: 4, hard: 6, bogus: 1 } }).some((e) => /unknown key 'bogus'/.test(e)));
    });
    test('capacity: rejects an empty escalateTo', () => {
      assert.ok(validate({ ...GOOD, capacity: { axis: 'item', soft: 4, hard: 6, escalateTo: [] } }).some((e) => /escalateTo/.test(e)));
    });

    // Prose-density budget (phase 2) — 2026-06-30-prose-density-budget.md.
    const WITH_ITEMS = { ...GOOD, sample: '<!-- _class: cards-grid -->\n\n## H\n\n- A\n  - body\n- B\n  - body\n' };
    test('density: accepts a well-formed block (axis inherited from capacity)', () => {
      const m = { ...WITH_ITEMS, capacity: { axis: 'item', soft: 4, hard: 6 }, density: { soft: 12, hard: 20, note: 'one clause' } };
      assert.deepEqual(validate(m), []);
    });
    test('density: requires soft and hard', () => {
      assert.ok(validate({ ...WITH_ITEMS, density: { axis: 'item' } }).some((e) => /density\.(soft|hard)/.test(e)));
    });
    test('density: rejects hard < soft', () => {
      assert.ok(validate({ ...WITH_ITEMS, density: { axis: 'item', soft: 20, hard: 12 } }).some((e) => /soft ≤ hard/.test(e)));
    });
    test('density: rejects an unknown key', () => {
      assert.ok(validate({ ...WITH_ITEMS, density: { axis: 'item', soft: 4, hard: 6, bogus: 1 } }).some((e) => /density has unknown key 'bogus'/.test(e)));
    });
    test('density: axis is NOT tied to focusAxes (focus highlighting ≠ word counting)', () => {
      // glossary's case: focusAxes ['row'] (the ledger highlights as table rows)
      // but authored as a bullet list, so the density axis is `item`. The only
      // axis guard is measurability — an item density on an item-authored sample
      // is valid regardless of focusAxes.
      const m = { ...WITH_ITEMS, focusAxes: ['row'], density: { axis: 'item', soft: 4, hard: 6 } };
      assert.deepEqual(validate(m), []);
    });
    test('density: needs an axis (no capacity to inherit from)', () => {
      assert.ok(validate({ ...WITH_ITEMS, density: { soft: 4, hard: 6 } }).some((e) => /density needs an axis/.test(e)));
    });
    test('density: rejects an axis not yet counted (col/cell/line)', () => {
      // col is a SUPPORTED_AXES member but elementWordCounts only does item/row,
      // so a col density block would validate yet never fire — reject it.
      const m = { ...GOOD, sample: '<!-- _class: x -->\n\n## H\n\n- A\n- B\n', density: { axis: 'col', soft: 4, hard: 6 } };
      assert.ok(validate(m).some((e) => /density\.axis 'col' is not yet counted/.test(e)));
    });
    test('density: rejects an inherited axis not yet counted', () => {
      const m = { ...GOOD, sample: '<!-- _class: x -->\n\n## H\n\n```\nline one\nline two\n```\n', capacity: { axis: 'line', soft: 4, hard: 6 }, density: { soft: 4, hard: 6 } };
      assert.ok(validate(m).some((e) => /is not yet counted/.test(e)));
    });

    test('rejects non-object input', () => {
      assert.ok(validate(null).length > 0);
      assert.ok(validate('not an object').length > 0);
      assert.ok(validate(42).length > 0);
    });

    test('rejects missing or empty name', () => {
      assert.match(validate({ ...GOOD, name: '' })[0], /name/);
      assert.match(validate({ ...GOOD, name: undefined })[0], /name/);
    });

    test('rejects non-kebab-case name', () => {
      assert.match(validate({ ...GOOD, name: 'CardsGrid' })[0], /kebab/);
      assert.match(validate({ ...GOOD, name: 'cards_grid' })[0], /kebab/);
      assert.match(validate({ ...GOOD, name: '1cards' })[0], /kebab/);
    });

    test('rejects unknown function', () => {
      const errors = validate({ ...GOOD, function: 'nonsense' });
      assert.match(errors[0], /function must be one of/);
    });

    test('rejects unknown form', () => {
      const errors = validate({ ...GOOD, form: 'spiral' });
      assert.match(errors[0], /form must be one of/);
    });

    test('rejects unknown substance', () => {
      const errors = validate({ ...GOOD, substance: 'magic' });
      assert.match(errors[0], /substance must be one of/);
    });

    test('accepts substance "mixed" on panel-form components', () => {
      const errors = validate({ ...GOOD, form: 'panel', substance: 'mixed' });
      assert.deepEqual(errors, []);
    });

    test('rejects substance "mixed" on non-panel forms', () => {
      const errors = validate({ ...GOOD, form: 'grid', substance: 'mixed' });
      assert.match(errors[0], /substance "mixed" is only allowed when form is "panel"/);
    });

    test('rejects missing description and skeleton', () => {
      const m = { ...GOOD };
      delete m.description;
      delete m.skeleton;
      const errors = validate(m);
      assert.ok(errors.some((e) => /description/.test(e)));
      assert.ok(errors.some((e) => /skeleton/.test(e)));
    });

    test('rejects non-array variants', () => {
      assert.match(validate({ ...GOOD, variants: 'mirror' })[0], /array/);
    });

    test('rejects variants with non-string entries', () => {
      assert.match(validate({ ...GOOD, variants: ['mirror', 7] })[0], /non-empty/);
    });

    test('rejects universal variants in variants array', () => {
      const errors = validate({ ...GOOD, variants: ['dark'] });
      assert.match(errors[0], /variant 'dark' is universal/);
    });

    test('rejects semi-universal variants in variants array', () => {
      const errors = validate({ ...GOOD, variants: ['compact'] });
      assert.match(errors[0], /variant 'compact' is semi-universal/);
      assert.match(errors[0], /excludes/);
    });

    test('accepts layout-specific variants', () => {
      assert.deepEqual(validate({ ...GOOD, variants: ['mirror', 'four'] }), []);
    });

    test('accepts well-formed excludes array', () => {
      assert.deepEqual(validate({ ...GOOD, excludes: ['compact', 'loose'] }), []);
    });

    test('rejects non-array excludes', () => {
      assert.match(validate({ ...GOOD, excludes: 'compact' })[0], /array/);
    });

    test('rejects excludes containing non-semi-universal values', () => {
      const errors = validate({ ...GOOD, excludes: ['dark'] });
      assert.match(errors[0], /must be one of the semi-universal variants/);
    });

    test('rejects malformed slots', () => {
      assert.match(validate({ ...GOOD, slots: [] })[0], /object/);
      const noSelector = validate({
        ...GOOD,
        slots: { title: { description: 'x' } },
      });
      assert.match(noSelector[0], /selector/);
    });

    test('prefixes error messages with source path when provided', () => {
      const errors = validate({ ...GOOD, name: '' }, 'lib/components/x.json');
      assert.match(errors[0], /^lib\/components\/x\.json:/);
    });

    test('card-style layouts reject inline `- **Title.** body` format in sample', () => {
      const m = {
        ...GOOD,
        name: 'cards-grid', // listed in CARD_STYLE_LAYOUTS
        sample: '<!-- _class: cards-grid -->\n\n## …\n\n- **Title.** body text on same line.\n',
      };
      const errors = validate(m);
      assert.ok(
        errors.some((e) => /inline.*Title.*body/.test(e)),
        'expected inline-format error, got: ' + JSON.stringify(errors),
      );
    });

    test('card-style layouts reject inline format in variantDocs[*].sample', () => {
      const m = {
        ...GOOD,
        name: 'cards-grid',
        variants: ['three'],
        variantDocs: {
          three: {
            caption: 'three-column variant',
            sample: '<!-- _class: cards-grid three -->\n\n- **Title.** body text.\n',
          },
        },
      };
      const errors = validate(m);
      assert.ok(
        errors.some((e) => /variantDocs.*three.*inline/.test(e)),
        'expected variantDocs inline-format error, got: ' + JSON.stringify(errors),
      );
    });

    test('card-style layouts accept nested-list format', () => {
      const m = {
        ...GOOD,
        name: 'cards-grid',
        sample: '<!-- _class: cards-grid -->\n\n## …\n\n- Title\n  - body text.\n',
      };
      const errors = validate(m);
      assert.deepEqual(errors, []);
    });

    test('statement-OL layouts reject `**bold**` in an ordered-list statement', () => {
      assert.ok(STATEMENT_OL_LAYOUTS.includes('principles'));
      const m = {
        ...GOOD,
        name: 'principles',
        sample: '<!-- _class: principles -->\n\n## …\n\n1. **Bold lead-in.** breaks the counter grid.\n',
      };
      const errors = validate(m);
      assert.ok(
        errors.some((e) => /ordered-list statement/.test(e)),
        'expected bold-in-OL error, got: ' + JSON.stringify(errors),
      );
    });

    test('statement-OL layouts accept plain ordered-list statements', () => {
      const m = {
        ...GOOD,
        name: 'principles',
        sample: '<!-- _class: principles -->\n\n## …\n\n1. Default to the cheaper-to-reverse choice.\n',
      };
      assert.ok(!validate(m).some((e) => /ordered-list statement/.test(e)));
    });

    test('non-card-style layouts permit inline format', () => {
      const m = {
        ...GOOD,
        name: 'actors', // NOT in CARD_STYLE_LAYOUTS — its li is one conceptual unit
        sample: '<!-- _class: actors -->\n\n- **Author.** Drafts the deck.\n',
      };
      const errors = validate(m);
      assert.deepEqual(errors, []);
    });
  });

  describe('tags', () => {
    test('accepts 3-5 in-vocabulary, complementary tags', () => {
      assert.deepEqual(validate({ ...GOOD, tags: ['overview', 'showcase', 'summary'] }), []);
      assert.deepEqual(validate({ ...GOOD, tags: ['overview', 'showcase', 'summary', 'takeaway', 'walkthrough'] }), []);
    });

    test('rejects a missing tags field (required)', () => {
      const m = { ...GOOD };
      delete m.tags;
      assert.match(validate(m).find((e) => /tags/.test(e)), /tags is required/);
    });

    test('rejects a non-array tags field', () => {
      assert.match(validate({ ...GOOD, tags: 'overview' }).find((e) => /tags/.test(e)), /must be an array/);
    });

    test('rejects fewer than 3 or more than 5 tags', () => {
      assert.match(validate({ ...GOOD, tags: ['overview', 'summary'] }).find((e) => /tags/.test(e)), /3-5 entries/);
      assert.match(
        validate({ ...GOOD, tags: ['overview', 'showcase', 'summary', 'takeaway', 'walkthrough', 'tradeoff'] }).find((e) => /tags/.test(e)),
        /3-5 entries/,
      );
    });

    test('rejects duplicate tags', () => {
      assert.match(validate({ ...GOOD, tags: ['overview', 'overview', 'summary'] }).find((e) => /tags/.test(e)), /unique/);
    });

    test('rejects a tag outside the controlled vocabulary', () => {
      const errors = validate({ ...GOOD, tags: ['overview', 'showcase', 'made-up-tag'] });
      assert.match(errors.find((e) => /made-up-tag/.test(e)), /not in the controlled vocabulary/);
    });

    test('rejects an in-vocabulary tag that duplicates the component name (complementary rule)', () => {
      // 'metric' IS a vocabulary tag; here it also equals the component name,
      // so only the complementary rule should fire (not the vocabulary rule).
      const errors = validate({ ...GOOD, name: 'metric', tags: ['metric', 'overview', 'summary'] });
      assert.ok(errors.some((e) => /complementary/.test(e)), JSON.stringify(errors));
      assert.ok(!errors.some((e) => /not in the controlled vocabulary/.test(e)), JSON.stringify(errors));
    });

    test('rejects a tag that duplicates the explicit bucket', () => {
      // 'chart' is a bucket value (not in the vocabulary), so both rules fire;
      // assert the complementary error is among them.
      const m = { ...GOOD, function: 'evidence', bucket: 'chart', tags: ['chart', 'metric', 'dashboard'] };
      assert.ok(validate(m).some((e) => /'chart'/.test(e) && /complementary/.test(e)));
    });
  });

  describe('tag vocabulary', () => {
    test('TAG_GROUPS has the four documented dimensions', () => {
      assert.deepEqual(Object.keys(TAG_GROUPS).sort(), ['idiom', 'material', 'occasion', 'task']);
    });

    test('TAGS is the flat union of the groups', () => {
      const expected = Object.values(TAG_GROUPS).flatMap((g) => [...g]);
      assert.deepEqual([...TAGS], expected);
    });

    test('TAGS has no duplicates across dimensions', () => {
      assert.equal(new Set(TAGS).size, TAGS.length);
    });

    test('TAGS_MIN / TAGS_MAX are 3 / 5', () => {
      assert.equal(TAGS_MIN, 3);
      assert.equal(TAGS_MAX, 5);
    });

    test('every shipped manifest carries 3-5 in-vocabulary, complementary tags', () => {
      const vocab = new Set(TAGS);
      for (const m of loadAll()) {
        assert.ok(Array.isArray(m.tags), `${m.name} has no tags`);
        assert.ok(m.tags.length >= TAGS_MIN && m.tags.length <= TAGS_MAX, `${m.name} has ${m.tags.length} tags`);
        const own = new Set([m.name, m.function, m.form, m.substance, manifestBucket(m)]);
        for (const t of m.tags) {
          assert.ok(vocab.has(t), `${m.name}: tag "${t}" not in vocabulary`);
          assert.ok(!own.has(t), `${m.name}: tag "${t}" duplicates an axis value`);
        }
      }
    });
  });

  describe('findInlineTitleBodyLine', () => {
    test('matches inline title+body on a bullet line', () => {
      const line = findInlineTitleBodyLine('- **Title.** body');
      assert.equal(line, '- **Title.** body');
    });
    test('findBoldOrderedStatement flags bold inside an ordered item, ignores plain', () => {
      assert.equal(findBoldOrderedStatement('1. **Bold.** body'), '1. **Bold.** body');
      assert.equal(findBoldOrderedStatement('1. Plain statement.'), null);
      assert.equal(findBoldOrderedStatement('- **Bold.** body'), null); // unordered: not flagged
    });

    test('matches inline title+body on any bullet (`-` or `*`)', () => {
      assert.ok(findInlineTitleBodyLine('* **Title.** body'));
    });
    test('returns null on nested-list format', () => {
      assert.equal(findInlineTitleBodyLine('- Title\n  - body'), null);
    });
    test('returns null when strong is alone on the line (no inline body)', () => {
      assert.equal(findInlineTitleBodyLine('- **Title only**'), null);
    });
    test('returns null on empty input', () => {
      assert.equal(findInlineTitleBodyLine(''), null);
      assert.equal(findInlineTitleBodyLine(null), null);
    });

    test('reports multiple errors at once', () => {
      const errors = validate({ name: '', function: 'x', form: 'y', substance: 'z' });
      // 4 explicit field errors + missing description + missing skeleton = 6
      assert.ok(errors.length >= 5, `expected ≥5 errors, got ${errors.length}`);
    });
  });

  describe('loadOne', () => {
    test('loads and validates a real manifest file', () => {
      // Bucket-nested layout (Phase 3+).
      const m = loadOne(path.join(__dirname, '..', '..', '..', 'lib', 'components', 'inventory', 'cards-grid', 'cards-grid.manifest.json'));
      assert.equal(m.name, 'cards-grid');
      assert.equal(m.function, 'inventory');
    });

    test('throws on invalid JSON', () => {
      const tmp = path.join(os.tmpdir(), `manifest-${process.pid}.json`);
      fs.writeFileSync(tmp, '{ not valid json');
      try {
        assert.throws(() => loadOne(tmp), /invalid JSON/);
      } finally {
        fs.unlinkSync(tmp);
      }
    });

    test('throws on validation failure with file path in the message', () => {
      const tmp = path.join(os.tmpdir(), `manifest-${process.pid}.json`);
      fs.writeFileSync(tmp, JSON.stringify({ name: 'x', function: 'nope' }));
      try {
        assert.throws(() => loadOne(tmp), /function must be one of/);
      } finally {
        fs.unlinkSync(tmp);
      }
    });
  });

  describe('loadAll', () => {
    test('reads the shipped lib/components directory', () => {
      const manifests = loadAll();
      assert.ok(manifests.length > 0, 'expected at least one manifest');
      // Every entry has a name
      for (const m of manifests) assert.ok(m.name, 'manifest has no name');
    });

    test('returns manifests sorted by name', () => {
      const manifests = loadAll();
      const names = manifests.map((m) => m.name);
      const sorted = [...names].sort();
      assert.deepEqual(names, sorted);
    });

    test('throws on duplicate names', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'manifests-'));
      const dup1 = path.join(tmpDir, 'a.json');
      const dup2 = path.join(tmpDir, 'b.json');
      const m = JSON.stringify({ ...GOOD, name: 'same-name' });
      fs.writeFileSync(dup1, m);
      fs.writeFileSync(dup2, m);
      try {
        assert.throws(() => loadAll(tmpDir), /duplicate manifest name/);
      } finally {
        fs.unlinkSync(dup1);
        fs.unlinkSync(dup2);
        fs.rmdirSync(tmpDir);
      }
    });

    test('ignores non-JSON files and underscore-prefixed JSON', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'manifests-'));
      fs.writeFileSync(path.join(tmpDir, 'README.md'), 'docs');
      fs.writeFileSync(path.join(tmpDir, '_schema.json'), '{"$schema": "x"}');
      fs.writeFileSync(path.join(tmpDir, 'real.json'), JSON.stringify(GOOD));
      try {
        const ms = loadAll(tmpDir);
        assert.equal(ms.length, 1);
        assert.equal(ms[0].name, 'cards-grid');
      } finally {
        for (const f of ['README.md', '_schema.json', 'real.json']) {
          fs.unlinkSync(path.join(tmpDir, f));
        }
        fs.rmdirSync(tmpDir);
      }
    });

    test('accepts folder-shape manifests at <name>/manifest.json', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'manifests-'));
      const sub = path.join(tmpDir, 'demo');
      fs.mkdirSync(sub);
      const folderManifest = { ...GOOD, name: 'demo' };
      fs.writeFileSync(path.join(sub, 'manifest.json'), JSON.stringify(folderManifest));
      try {
        const ms = loadAll(tmpDir);
        assert.equal(ms.length, 1);
        assert.equal(ms[0].name, 'demo');
      } finally {
        fs.unlinkSync(path.join(sub, 'manifest.json'));
        fs.rmdirSync(sub);
        fs.rmdirSync(tmpDir);
      }
    });

    test('handles a directory with no manifest.json (incomplete folder)', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'manifests-'));
      const sub = path.join(tmpDir, 'partial');
      fs.mkdirSync(sub);
      fs.writeFileSync(path.join(sub, 'styles.css'), '/* placeholder */');
      try {
        const ms = loadAll(tmpDir);
        assert.equal(ms.length, 0);
      } finally {
        fs.unlinkSync(path.join(sub, 'styles.css'));
        fs.rmdirSync(sub);
        fs.rmdirSync(tmpDir);
      }
    });

    test('flat + folder shapes for the same name are caught as duplicates', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'manifests-'));
      const flat = path.join(tmpDir, 'same.json');
      const sub = path.join(tmpDir, 'same');
      fs.mkdirSync(sub);
      const folderManifest = path.join(sub, 'manifest.json');
      const m = { ...GOOD, name: 'same' };
      fs.writeFileSync(flat, JSON.stringify(m));
      fs.writeFileSync(folderManifest, JSON.stringify(m));
      try {
        assert.throws(() => loadAll(tmpDir), /duplicate manifest name/);
      } finally {
        fs.unlinkSync(flat);
        fs.unlinkSync(folderManifest);
        fs.rmdirSync(sub);
        fs.rmdirSync(tmpDir);
      }
    });

    test('ignores index.js sibling at the loader root', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'manifests-'));
      fs.writeFileSync(path.join(tmpDir, 'index.js'), '// not a manifest');
      fs.writeFileSync(path.join(tmpDir, 'real.json'), JSON.stringify(GOOD));
      try {
        const ms = loadAll(tmpDir);
        assert.equal(ms.length, 1);
      } finally {
        fs.unlinkSync(path.join(tmpDir, 'index.js'));
        fs.unlinkSync(path.join(tmpDir, 'real.json'));
        fs.rmdirSync(tmpDir);
      }
    });
  });

  describe('groupByFunction', () => {
    test('partitions manifests by function family', () => {
      const ms = [
        { ...GOOD, name: 'a', function: 'inventory' },
        { ...GOOD, name: 'b', function: 'inventory' },
        { ...GOOD, name: 'c', function: 'comparison' },
      ];
      const g = groupByFunction(ms);
      assert.equal(g.inventory.length, 2);
      assert.equal(g.comparison.length, 1);
      assert.equal(g.evidence.length, 0);
    });

    test('returns every function family even when empty', () => {
      const g = groupByFunction([]);
      for (const fn of FUNCTIONS) {
        assert.ok(Array.isArray(g[fn]), `${fn} should be an array`);
      }
    });
  });

  describe('bucket field', () => {
    test('accepts a valid bucket value', () => {
      assert.deepEqual(validate({ ...GOOD, bucket: 'chart' }), []);
      assert.deepEqual(validate({ ...GOOD, bucket: 'diagram' }), []);
      assert.deepEqual(validate({ ...GOOD, bucket: 'inventory' }), []);
    });

    test('rejects an unknown bucket value', () => {
      const errors = validate({ ...GOOD, bucket: 'gallery' });
      assert.match(errors[0], /bucket must be one of/);
    });

    test('bucket is optional — manifests without it pass validation', () => {
      const m = { ...GOOD };
      assert.equal(m.bucket, undefined);
      assert.deepEqual(validate(m), []);
    });

    test('BUCKETS is FUNCTIONS plus chart, diagram, math, code, legal, and connect', () => {
      assert.deepEqual([...BUCKETS].sort(), [
        'anchor', 'chart', 'code', 'comparison', 'connect', 'diagram', 'evidence',
        'imagery', 'inventory', 'legal', 'math', 'progression', 'statement',
      ]);
      for (const fn of FUNCTIONS) assert.ok(BUCKETS.includes(fn));
    });

    test('BUCKETS is frozen', () => {
      assert.ok(Object.isFrozen(BUCKETS));
    });
  });

  describe('manifestBucket', () => {
    test('returns the explicit bucket when present', () => {
      assert.equal(manifestBucket({ function: 'evidence', bucket: 'chart' }), 'chart');
    });

    test('falls back to function when bucket is absent', () => {
      assert.equal(manifestBucket({ function: 'evidence' }), 'evidence');
    });

    test('falls back to function when bucket is empty string', () => {
      assert.equal(manifestBucket({ function: 'evidence', bucket: '' }), 'evidence');
    });

    test('returns undefined when neither is present', () => {
      assert.equal(manifestBucket({}), undefined);
      assert.equal(manifestBucket(null), undefined);
    });
  });

  describe('groupByBucket', () => {
    test('partitions manifests by disk bucket, honoring the explicit field', () => {
      const ms = [
        { ...GOOD, name: 'a', function: 'evidence' },                        // bucket=evidence
        { ...GOOD, name: 'b', function: 'evidence', bucket: 'chart' },       // overrides
        { ...GOOD, name: 'c', function: 'evidence', bucket: 'diagram' },     // overrides
      ];
      const g = groupByBucket(ms);
      assert.equal(g.evidence.length, 1);
      assert.equal(g.chart.length, 1);
      assert.equal(g.diagram.length, 1);
      assert.equal(g.evidence[0].name, 'a');
      assert.equal(g.chart[0].name, 'b');
      assert.equal(g.diagram[0].name, 'c');
    });

    test('returns every bucket even when empty', () => {
      const g = groupByBucket([]);
      for (const b of BUCKETS) {
        assert.ok(Array.isArray(g[b]), `${b} should be an array`);
      }
    });

    test('shipped manifests partition the 22 known bucket-divergent components correctly', () => {
      const ms = loadAll();
      const g = groupByBucket(ms);
      // chart = 13: funnel, gantt, journey, kanban, map, piechart, progress, quadrant, radar, roadmap, state-chart, timeline-list, word-cloud
      assert.equal(g.chart.length, 13, 'chart bucket has 13 components');
      assert.deepEqual(
        g.chart.map((m) => m.name).sort(),
        ['funnel', 'gantt', 'journey', 'kanban', 'map', 'piechart', 'progress', 'quadrant', 'radar', 'roadmap', 'state-chart', 'timeline-list', 'word-cloud'],
      );
      // diagram = 1: diagram
      assert.equal(g.diagram.length, 1, 'diagram bucket has 1 component');
      assert.equal(g.diagram[0].name, 'diagram');
      // math = 1: math (KaTeX-typeset content; substance-rendering pipeline)
      assert.equal(g.math.length, 1, 'math bucket has 1 component');
      assert.equal(g.math[0].name, 'math');
      // code = 2: code, compare-code (anything that uses syntax highlighting)
      assert.equal(g.code.length, 2, 'code bucket has 2 components');
      assert.deepEqual(g.code.map((m) => m.name).sort(), ['code', 'compare-code']);
      // legal = 5: statute-stack, regulatory-update, authority-chain, citation-card, obligation-matrix
      assert.equal(g.legal.length, 5, 'legal bucket has 5 components');
      assert.deepEqual(
        g.legal.map((m) => m.name).sort(),
        ['authority-chain', 'citation-card', 'obligation-matrix', 'regulatory-update', 'statute-stack'],
      );
    });

    test('the 22 bucket-divergent components keep their function field unchanged', () => {
      const ms = loadAll();
      const byName = Object.fromEntries(ms.map((m) => [m.name, m]));
      // Substance divergence — chart + diagram + math + code buckets,
      // all function = evidence (or progression for gantt/kanban, or
      // comparison for compare-code):
      const evidenceSubstanceBuckets = [
        'funnel', 'map', 'piechart', 'progress', 'quadrant', 'radar', 'timeline-list', 'word-cloud',
        'diagram', 'math', 'code',
      ];
      for (const n of evidenceSubstanceBuckets) {
        assert.equal(byName[n].function, 'evidence', `${n}.function stays "evidence"`);
      }
      assert.equal(byName.gantt.function, 'progression');
      assert.equal(byName.kanban.function, 'progression');
      assert.equal(byName['state-chart'].function, 'progression',
        'state-chart keeps progression function despite living in chart bucket');
      assert.equal(byName.journey.function, 'progression',
        'journey keeps progression function despite living in chart bucket');
      assert.equal(byName.roadmap.function, 'progression',
        'roadmap keeps progression function despite living in chart bucket');
      assert.equal(byName['compare-code'].function, 'comparison',
        'compare-code keeps comparison function despite living in code bucket');
      // Domain divergence (legal bucket — components span 4 different
      // function families, all kept):
      assert.equal(byName['statute-stack'].function, 'inventory');
      assert.equal(byName['regulatory-update'].function, 'progression');
      assert.equal(byName['authority-chain'].function, 'progression');
      assert.equal(byName['citation-card'].function, 'evidence');
      assert.equal(byName['obligation-matrix'].function, 'comparison');
    });
  });

  describe('loadAll with bucket-nested layout', () => {
    test('walks one level into bucket-named directories', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'manifests-'));
      // Mimic Phase 3 layout: <bucket>/<name>/<name>.manifest.json
      const bucketDir = path.join(tmpDir, 'chart');
      const compDir = path.join(bucketDir, 'demo-chart');
      fs.mkdirSync(compDir, { recursive: true });
      const m = { ...GOOD, name: 'demo-chart', bucket: 'chart' };
      const manifestPath = path.join(compDir, 'demo-chart.manifest.json');
      fs.writeFileSync(manifestPath, JSON.stringify(m));
      try {
        const ms = loadAll(tmpDir);
        assert.equal(ms.length, 1);
        assert.equal(ms[0].name, 'demo-chart');
      } finally {
        fs.unlinkSync(manifestPath);
        fs.rmdirSync(compDir);
        fs.rmdirSync(bucketDir);
        fs.rmdirSync(tmpDir);
      }
    });

    test('mixed flat + nested layouts coexist (migration tolerance)', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'manifests-'));
      // One flat component, one bucket-nested
      const flatDir = path.join(tmpDir, 'flat-comp');
      fs.mkdirSync(flatDir);
      fs.writeFileSync(
        path.join(flatDir, 'flat-comp.manifest.json'),
        JSON.stringify({ ...GOOD, name: 'flat-comp' }),
      );
      const bucketDir = path.join(tmpDir, 'chart');
      const nestedDir = path.join(bucketDir, 'nested-comp');
      fs.mkdirSync(nestedDir, { recursive: true });
      fs.writeFileSync(
        path.join(nestedDir, 'nested-comp.manifest.json'),
        JSON.stringify({ ...GOOD, name: 'nested-comp', bucket: 'chart' }),
      );
      try {
        const ms = loadAll(tmpDir);
        assert.equal(ms.length, 2);
        assert.deepEqual(ms.map((m) => m.name).sort(), ['flat-comp', 'nested-comp']);
      } finally {
        fs.unlinkSync(path.join(flatDir, 'flat-comp.manifest.json'));
        fs.unlinkSync(path.join(nestedDir, 'nested-comp.manifest.json'));
        fs.rmdirSync(flatDir);
        fs.rmdirSync(nestedDir);
        fs.rmdirSync(bucketDir);
        fs.rmdirSync(tmpDir);
      }
    });
  });

  describe('shipped manifests are all valid', () => {
    test('every file in lib/components/ passes validation', () => {
      // This is the gate that prevents a malformed manifest from
      // being committed without the test catching it.
      assert.doesNotThrow(() => loadAll());
    });
  });

  describe('vocabulary', () => {
    test('FUNCTIONS, FORMS, SUBSTANCES are non-empty frozen arrays', () => {
      for (const arr of [FUNCTIONS, FORMS, SUBSTANCES]) {
        assert.ok(arr.length > 0);
        assert.ok(Object.isFrozen(arr));
      }
    });

    test('FUNCTIONS has exactly the 7 families documented in design-system.md §3', () => {
      assert.deepEqual([...FUNCTIONS].sort(), [
        'anchor', 'comparison', 'evidence', 'imagery', 'inventory', 'progression', 'statement',
      ]);
    });

    test('SUBSTANCES has exactly the 4 plugin contracts documented in design-system.md §5', () => {
      assert.deepEqual([...SUBSTANCES].sort(), ['graph', 'prose', 'series', 'structure']);
    });

    test('MIXED_SUBSTANCE is "mixed" and is NOT a member of SUBSTANCES (it is a composition declaration, not a 5th plugin)', () => {
      assert.equal(MIXED_SUBSTANCE, 'mixed');
      assert.ok(!SUBSTANCES.includes(MIXED_SUBSTANCE));
    });

    test('UNIVERSAL_GROUPS has the eight documented categories', () => {
      assert.deepEqual(Object.keys(UNIVERSAL_GROUPS).sort(), [
        'chrome', 'claim', 'decoration', 'mood', 'social', 'state', 'tone', 'typography',
      ]);
    });

    test('UNIVERSAL_VARIANTS is the flat union of the groups, deduped', () => {
      const allGroupValues = Object.values(UNIVERSAL_GROUPS).flatMap((g) => [...g]);
      const expected = [...new Set(allGroupValues)];
      assert.deepEqual([...UNIVERSAL_VARIANTS], expected);
    });

    test('UNIVERSAL_VARIANTS and SEMI_UNIVERSAL_VARIANTS are disjoint', () => {
      const uni = new Set(UNIVERSAL_VARIANTS);
      const overlap = SEMI_UNIVERSAL_VARIANTS.filter((v) => uni.has(v));
      assert.deepEqual(overlap, []);
    });

    test('claim: quiet/hero (+framed marker) are universal; bleed is a semi-universal opt-out', () => {
      const uni = new Set(UNIVERSAL_VARIANTS);
      for (const t of ['claim-quiet', 'claim-hero', 'claim-framed']) {
        assert.ok(uni.has(t), `${t} should be universal`);
      }
      assert.ok(SEMI_UNIVERSAL_VARIANTS.includes('claim-bleed'), 'claim-bleed should be semi-universal (opt-out)');
      assert.ok(!uni.has('claim-bleed'), 'claim-bleed must not be universal (it is opt-out-able)');
    });

    test('FAMILY_MODIFIERS are scoped, not universal, and tokens are their flat union', () => {
      const expectedTokens = [...new Set(
        Object.values(FAMILY_MODIFIERS).flatMap((g) => [...g.modifiers]),
      )];
      assert.deepEqual([...FAMILY_MODIFIER_TOKENS], expectedTokens);
      // Family modifiers must NOT leak into the universal tier (they're scoped).
      const uni = new Set(UNIVERSAL_VARIANTS);
      const semi = new Set(SEMI_UNIVERSAL_VARIANTS);
      for (const t of FAMILY_MODIFIER_TOKENS) {
        assert.ok(!uni.has(t) && !semi.has(t), `family modifier '${t}' must not be universal/semi-universal`);
      }
    });

    test('familyModifiersFor scopes by manifest `families` (per-layout) + bucket', () => {
      const checks = ['checks-ringed', 'checks-knockout', 'checks-bold', 'checks-outline', 'checks-tonal', 'heat'];
      // state-markers membership is declared per-layout via `families`
      assert.deepEqual(familyModifiersFor({ name: 'checklist', function: 'inventory', families: ['state-markers'] }), checks);
      assert.deepEqual(familyModifiersFor({ name: 'verdict-grid', function: 'comparison', families: ['state-markers'] }), checks);
      // chart components get `canvas` by BUCKET (no manifest opt-in needed)
      assert.deepEqual(familyModifiersFor({ name: 'piechart', function: 'evidence', bucket: 'chart' }), ['canvas']);
      // roadmap is BOTH: declares state-markers AND is in the chart bucket
      assert.deepEqual(familyModifiersFor({ name: 'roadmap', function: 'progression', bucket: 'chart', families: ['state-markers'] }), [...checks, 'canvas']);
      // a layout that declares no family and isn't bucket-scoped gets nothing —
      // even if its name once matched the retired by-name list
      assert.deepEqual(familyModifiersFor({ name: 'checklist', function: 'inventory' }), []);
      assert.deepEqual(familyModifiersFor({ name: 'title', function: 'anchor' }), []);
    });

    test('every shipped manifest with family modifiers is in scope (no orphans)', () => {
      // Each component the build tags with familyModifiers must resolve cleanly.
      for (const m of loadAll()) {
        const fams = familyModifiersFor(m);
        for (const f of fams) assert.ok(FAMILY_MODIFIER_TOKENS.includes(f), `${m.name}: ${f} not a family token`);
      }
    });

    test('the state group has all 8 documented variants', () => {
      assert.deepEqual([...UNIVERSAL_GROUPS.state].sort(), [
        'archived', 'confidential', 'draft', 'pinned', 'redacted', 'revised', 'tbd', 'wip',
      ]);
    });

    test('the tone group has the 4 state-token tones', () => {
      assert.deepEqual([...UNIVERSAL_GROUPS.tone].sort(), [
        'tone-fail', 'tone-pass', 'tone-skip', 'tone-warn',
      ]);
    });

    test('chrome group has silent + the surgicals + form/no-form/no-progress', () => {
      assert.deepEqual([...UNIVERSAL_GROUPS.chrome].sort(), [
        'form', 'no-footer', 'no-form', 'no-header', 'no-paginate', 'no-progress', 'silent',
      ]);
    });
  });

  describe('effectiveVariants', () => {
    test('returns all universals + all semi-universals + layout-specific, sorted', () => {
      const m = { ...GOOD, variants: ['four', 'mirror'] };
      const vs = effectiveVariants(m);
      // Sorted
      assert.deepEqual(vs, [...vs].sort());
      // Includes universals
      for (const u of UNIVERSAL_VARIANTS) assert.ok(vs.includes(u), `missing universal ${u}`);
      // Includes semi-universals
      for (const s of SEMI_UNIVERSAL_VARIANTS) assert.ok(vs.includes(s), `missing semi ${s}`);
      // Includes layout-specific
      assert.ok(vs.includes('four'));
      assert.ok(vs.includes('mirror'));
    });

    test('respects excludes for semi-universals', () => {
      const m = { ...GOOD, excludes: ['compact', 'loose'] };
      const vs = effectiveVariants(m);
      assert.ok(!vs.includes('compact'));
      assert.ok(!vs.includes('loose'));
      // Universals still present
      assert.ok(vs.includes('dark'));
      // Non-excluded semi-universal still present
      assert.ok(vs.includes('accent'));
    });

    test('handles manifest with no variants and no excludes', () => {
      const vs = effectiveVariants(GOOD);
      // Just universals + all semi-universals
      const expected = [...new Set([...UNIVERSAL_VARIANTS, ...SEMI_UNIVERSAL_VARIANTS])].sort();
      assert.deepEqual(vs, expected);
    });

    test('deduplicates if a layout-specific variant happens to match a universal/semi', () => {
      // No-op test: validator should prevent this, but the function dedupes defensively.
      const m = { ...GOOD, variants: ['mirror', 'mirror'] };
      const vs = effectiveVariants(m);
      assert.equal(vs.filter((v) => v === 'mirror').length, 1);
    });
  });
});
