/**
 * `editRecord` — the generic Segno record writer behind the avatar and icon editors
 * (engineering/decisions/2026-10-21-compose-point-and-click.md §4).
 *
 * Its promise is the one `editPill` makes: an edit changes the words the author changed and no
 * others, and a result that is not the old span plus exactly that change is refused (null). So the
 * arms that matter run it over EVERY avatar and icon the repo ships, and over hand-written spans that
 * each pin one mechanism (quoting, alias, named, flag, delete, append, ambiguity).
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const avatarKernel = require('../../../lib/plugins/avatars/avatars.inline.js');
const iconKernel = require('../../../lib/plugins/icons/icons.inline.js');
const editors = require('../../../lib/authoring/inline-editors.js');
// The kernels as the engine ships them, plus the editor's writers from the authoring bundle.
const avatars = { ...avatarKernel, edit: editors.avatar.edit, written: (t) => editors.avatar.read(t)?.written ?? null };
const icons = { ...iconKernel, edit: editors.icon.edit };
const { editRecord } = require('../../../lib/core/segno-edit.js');
const { compileSlot } = require('../../../lib/core/segno-spec.js');

const ROOT = path.resolve(__dirname, '../../..');

function markdownIn(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.git' || e.name === 'dist') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) markdownIn(full, out);
    else if (e.name.endsWith('.md')) out.push(full);
  }
  return out;
}

/** The spans of one notation in the decks and galleries we ship, that its kernel reads. */
function shipped(re, kernel) {
  const files = [
    ...markdownIn(path.join(ROOT, 'examples')),
    ...markdownIn(path.join(ROOT, 'lib')).filter((f) => f.endsWith('.gallery.md')),
    ...markdownIn(path.join(ROOT, 'test/integration/baseline-decks')),
  ];
  const seen = new Set();
  for (const f of files) for (const m of fs.readFileSync(f, 'utf8').matchAll(re)) if (kernel.read(m[1])) seen.add(m[1]);
  return [...seen].sort();
}

const AVATARS = shipped(/(?<!`)`(!\{[^`\n]+\})`(?!`)/g, avatars);
const ICONS = shipped(/(?<!`)`(\^\{[^`\n]+\})`(?!`)/g, icons);

describe('editRecord — avatars', () => {
  test('the corpus is real, not a vacuous empty loop', () => {
    assert.ok(AVATARS.length >= 5, `only ${AVATARS.length} readable avatars found`);
  });

  test('an empty edit returns the span byte for byte', () => {
    for (const t of AVATARS) assert.equal(avatars.edit(t, {}), t, t);
  });

  test('setting a parameter to what it already says returns the span byte for byte', () => {
    for (const t of AVATARS) {
      const w = avatars.written(t);
      for (const [k, v] of Object.entries(w)) {
        const out = avatars.edit(t, { [k]: k === 'color' || k === 'border' ? `c${v}` : v });
        assert.equal(out, t, `${t}: ${k}`);
      }
    }
  });

  test('every trait value lands exactly and changes no other field', () => {
    for (const t of AVATARS) {
      const before = avatars.written(t);
      for (const trait of avatars.TRAIT_ORDER) {
        for (const v of avatars.SPEC.params[trait].values) {
          const out = avatars.edit(t, { [trait]: v });
          assert.notEqual(out, null, `${t}: ${trait}=${v} refused`);
          const after = avatars.written(out);
          assert.equal(after[trait], v, `${t} -> ${out}`);
          for (const k of Object.keys({ ...before, ...after })) if (k !== trait) assert.equal(after[k], before[k], `${t} -> ${out}: ${k} changed`);
        }
      }
    }
  });

  test('clearing a written word removes only that word', () => {
    const t = '!{Ada Okafor, hair=coily, c3, sm}';
    assert.equal(avatars.edit(t, { hair: null }), '!{Ada Okafor, c3, sm}');
    assert.equal(avatars.edit(t, { size: null }), '!{Ada Okafor, hair=coily, c3}');
    assert.equal(avatars.edit(t, { color: null }), '!{Ada Okafor, hair=coily, sm}');
  });

  test('a new word is appended, a named trait as name=value and a bare word bare', () => {
    assert.equal(avatars.edit('!{Ada}', { hair: 'bob' }), '!{Ada, hair=bob}');
    assert.equal(avatars.edit('!{Ada}', { shape: 'square' }), '!{Ada, square}');
    assert.equal(avatars.edit('!{Ada}', { color: 'c5' }), '!{Ada, c5}');
    assert.equal(avatars.edit('!{Ada}', { color: 7 }), '!{Ada, c7}');
    assert.equal(avatars.edit('!{Ada}', { border: 'c2' }), '!{Ada, border=c2}');
  });

  test('the author\'s spelling of every other word survives (case, spacing, order)', () => {
    assert.equal(avatars.edit('!{Ada Okafor,  Hair=Coily , c3}', { size: 'lg' }), '!{Ada Okafor,  Hair=Coily , c3, lg}');
    assert.equal(avatars.edit('!{Ada Okafor, c3, hair=coily}', { hair: 'bob' }), '!{Ada Okafor, c3, hair=bob}');
  });

  test('the name is replaced in place, quoted when it holds a reserved character, and never removed', () => {
    assert.equal(avatars.edit('!{Ada, c3}', { name: 'Grace Hopper' }), '!{Grace Hopper, c3}');
    assert.equal(avatars.edit('!{Ada, c3}', { name: 'Hopper, Grace' }), '!{"Hopper, Grace", c3}');
    assert.equal(avatars.edit('!{Ada, c3}', { name: '   ' }), null);
    assert.equal(avatars.edit('!{Ada, c3}', { name: null }), null);
  });

  test('a name written by name is renamed in place, keeping `name=`', () => {
    assert.equal(avatars.edit('!{name=Ada}', { name: 'Bob' }), '!{name=Bob}');
    assert.equal(avatars.edit('!{name=Ada}', { name: 'Ada' }), '!{name=Ada}');
  });

  test('a control character in a name or label is refused: it would not survive a reload', () => {
    assert.equal(avatars.edit('!{Ada}', { name: 'x\u0000y' }), null);
    assert.equal(avatars.edit('!{Ada}', { label: 'x\u0007y' }), null);
    assert.equal(avatars.edit('!{Ada}', { name: 'x\u2028y' }), null);
  });

  test('a label with a comma is quoted and reads back whole', () => {
    const out = avatars.edit('!{Ada}', { label: 'Ada, the engineer' });
    assert.equal(out, '!{Ada, label="Ada, the engineer"}');
    assert.equal(avatars.read(out).label, 'Ada, the engineer');
  });

  test('a value outside the vocabulary, an unknown parameter and a bad index are refused', () => {
    assert.equal(avatars.edit('!{Ada}', { hair: 'neon' }), null);
    assert.equal(avatars.edit('!{Ada}', { wings: 'big' }), null);
    assert.equal(avatars.edit('!{Ada}', { color: 'c13' }), null);
    assert.equal(avatars.edit('!{Ada}', { color: 'c0' }), null);
  });

  test('a span that is not an avatar is refused, and so is one with two words for one parameter', () => {
    assert.equal(avatars.edit('{SHIPPED, c2}', { hair: 'bob' }), null);
    assert.equal(avatars.edit('!{Ada, hair=bob, hair=long}', { hair: 'none' }), null);
    assert.equal(avatars.edit('!{Ada, sm, lg}', { size: 'md' }), null);
  });

  test('a refused edit in a batch writes nothing from the batch', () => {
    assert.equal(avatars.edit('!{Ada}', { hair: 'bob', beard: 'nope' }), null);
  });

  test('a batch applies every change', () => {
    assert.equal(avatars.edit('!{Ada}', { hair: 'bob', color: 'c4', size: 'lg' }), '!{Ada, hair=bob, c4, lg}');
  });
});

describe('editRecord — icons', () => {
  test('the corpus is real, not a vacuous empty loop', () => {
    assert.ok(ICONS.length >= 5, `only ${ICONS.length} readable icons found`);
  });

  test('an empty edit, and an edit to what it already says, return the span byte for byte', () => {
    for (const t of ICONS) {
      assert.equal(icons.edit(t, {}), t, t);
      const r = icons.read(t);
      assert.equal(icons.edit(t, { name: r.name }), t, `${t} name`);
      if (r.c) assert.equal(icons.edit(t, { color: r.c }), t, `${t} color`);
      assert.equal(icons.edit(t, { size: r.size === 'md' && !/\bmd\b/.test(t) ? null : r.size }), t, `${t} size`);
    }
  });

  test('every icon name lands, and an alias the author wrote is kept when the name already means it', () => {
    for (const t of ICONS) {
      for (const name of icons.NAMES.slice(0, 25)) {
        const out = icons.edit(t, { name });
        assert.notEqual(out, null, `${t}: name=${name} refused`);
        assert.equal(icons.read(out).name, name, out);
      }
    }
    // `db` is an alias of `database`: saying `database` again is not a change.
    assert.equal(icons.canonical('db'), 'database');
    assert.equal(icons.edit('^{db, c3}', { name: 'database' }), '^{db, c3}');
    assert.equal(icons.edit('^{db, c3}', { name: 'server' }), '^{server, c3}');
  });

  test('an alias typed as the new name is written as the icon it means', () => {
    assert.equal(icons.edit('^{server}', { name: 'db' }), '^{database}');
  });

  test('options are added, replaced and removed one word at a time', () => {
    assert.equal(icons.edit('^{database}', { color: 'c3', size: 'lg' }), '^{database, c3, lg}');
    assert.equal(icons.edit('^{database, c3, lg}', { size: 'sm' }), '^{database, c3, sm}');
    assert.equal(icons.edit('^{database, c3, lg}', { color: null }), '^{database, lg}');
    assert.equal(icons.edit('^{database}', { look: 'etch', frame: 'bare', corners: 'rounded' }), '^{database, etch, bare, rounded}');
  });

  test('an unknown name and a non-icon are refused', () => {
    assert.equal(icons.edit('^{database}', { name: 'not-an-icon' }), null);
    assert.equal(icons.edit('~{1 2 3}', { size: 'lg' }), null);
  });
});

describe('editRecord — the read-back backstop', () => {
  const avatarSlot = compileSlot(avatars.SPEC, 'test.avatar');

  test('a write the slot does not read back as asked is refused, not written', () => {
    // A slot that reads the new word as something else: the editor must say "I would rather not", never write it.
    const lying = {
      read: (t) => {
        const r = avatarSlot.read(t);
        return r.ok && t.includes('hair=bob') ? { ...r, value: { ...r.value, hair: 'long' } } : r;
      },
    };
    assert.equal(editRecord('!{Ada}', lying, avatars.SPEC, { hair: 'bob' }), null);
    assert.equal(editRecord('!{Ada}', avatarSlot, avatars.SPEC, { hair: 'bob' }), '!{Ada, hair=bob}');
  });

  test('a write that changes a field nobody asked about is refused', () => {
    const drifting = {
      read: (t) => {
        const r = avatarSlot.read(t);
        return r.ok && t.includes('c5') ? { ...r, value: { ...r.value, size: 'xl' } } : r;
      },
    };
    assert.equal(editRecord('!{Ada}', drifting, avatars.SPEC, { color: 'c5' }), null);
  });
});

describe('editRecord — the generic mechanism on a spec of its own', () => {
  const spec = {
    label: 'a widget',
    positional: [{ name: 'title', type: 'text' }],
    params: {
      tone: { type: 'oneOf', values: ['calm', 'loud'] },
      count: { type: 'number', named: true },
      pinned: { type: 'flag', word: 'pinned' },
    },
  };
  const slot = compileSlot(spec, 'test.widget');

  test('a number and a flag are written and cleared', () => {
    assert.equal(editRecord('{Hi}', slot, spec, { count: 3 }), '{Hi, count=3}');
    assert.equal(editRecord('{Hi, count=3}', slot, spec, { count: 4.5 }), '{Hi, count=4.5}');
    assert.equal(editRecord('{Hi}', slot, spec, { pinned: true }), '{Hi, pinned}');
    assert.equal(editRecord('{Hi, pinned}', slot, spec, { pinned: false }), '{Hi}');
    assert.equal(editRecord('{Hi}', slot, spec, { count: 'x' }), null);
  });

  test('a record cannot be emptied of its first value', () => {
    assert.equal(editRecord('{Hi}', slot, spec, { title: null }), null);
  });
});
