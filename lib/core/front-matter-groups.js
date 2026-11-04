/**
 * lib/core/front-matter-groups.js — a front-matter body read as its top-level key groups, and the
 * class tokens a `class:` group names. The smallest shared piece of the settings block: the fold
 * (settings-block-fold.js, in the engine's boot bundle) needs only this, the merge and the DOM
 * reader (settings-block.js) build on it.
 */

/**
 * Split a YAML front-matter body into its top-level key groups, in order: each group
 * is the key's own line plus every indented line after it (a block scalar, a nested
 * map, a list). Blank lines and column-0 comments WAIT to see what follows them: if the
 * next real line is indented they are inside the current key (a comment between two
 * entries of a nested map), otherwise they lead into the next key (or the tail).
 * Joining every group's `text`, then `tail`, with '\n' gives the input back, with CRLF
 * read as LF.
 * @returns {{ groups: Array<{ key: string, text: string }>, tail: string }}
 */
function keyGroups(yaml) {
  const groups = [];
  let pending = [];
  let current = null;
  for (const line of String(yaml || '').split(/\r?\n/)) {
    const m = /^([A-Za-z_$][\w$.-]*)[ \t]*:/.exec(line);
    if (m) {
      current = { key: m[1], lines: [...pending, line] };
      groups.push(current);
      pending = [];
    } else if (line.trim() === '' || line.startsWith('#')) {
      pending.push(line);
    } else if (current && /^[ \t]/.test(line)) {
      current.lines.push(...pending, line);
      pending = [];
    } else {
      pending.push(line);
    }
  }
  return { groups: groups.map((g) => ({ key: g.key, text: g.lines.join('\n') })), tail: pending.join('\n') };
}

/**
 * The class tokens a `class:` group names — a string, a YAML list (block or flow), a block
 * scalar (`>-`), quoted or not. A comment starts at a `#` after whitespace (YAML's rule, so a
 * `#` inside a token is kept); a group may lead with its own comment lines.
 */
function classTokensOf(groupText) {
  const value = String(groupText).replace(/^[\s\S]*?^class[ \t]*:/m, '');
  return value.replace(/(^|[ \t])#.*$/gm, '$1')
    .replace(/^[ \t]*[|>][-+0-9]*[ \t]*$/m, '')
    .replace(/^[ \t]*-[ \t]+/gm, ' ')
    .split(/[\s,[\]"']+/).filter(Boolean);
}

module.exports = { keyGroups, classTokensOf };
