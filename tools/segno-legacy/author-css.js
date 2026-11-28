/**
 * author-css.js — the comment strip and the depth walk of lib/export/author-css.js (`packAuthorCss`'s `:root` token
 * copy) as they were before Segno P5b read them with the one CSS tokenizer.
 *
 * Frozen verbatim from lib/export/author-css.js at 3176d626. `tokenCopy` is the one line of `packAuthorCss` that read
 * them: `rootTokenCopy(text.replace(COMMENT_RE, ''))`. It is the ORACLE for
 * test/unit/export/author-css-differential.test.js. Nothing in lib/ may read it. Do not fix bugs here. Delete it when
 * nobody reads it.
 */
const COMMENT_RE = /\/\*[\s\S]*?\*\//g;

const ROOT_ARM_RE = /(^|[\s>+~(])(?:section)?:root\b/;

/** A declaration block's declarations, split on `;` outside quotes and parentheses. */
function declarations(body) {
  const out = [];
  let cur = '';
  let quote = null;
  let paren = 0;
  for (let k = 0; k < body.length; k++) {
    const c = body[k];
    if (quote) { cur += c; if (c === '\\') cur += body[++k] ?? ''; else if (c === quote) quote = null; continue; }
    if (c === '"' || c === "'") quote = c;
    else if (c === '(') paren++;
    else if (c === ')') paren = Math.max(0, paren - 1);
    else if (c === ';' && paren === 0) { out.push(cur.trim()); cur = ''; continue; }
    cur += c;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function rootTokenCopy(css) {
  let i = 0;
  const readBlock = () => {
    // at `{` already consumed; returns the text up to the matching `}` (consumed)
    const start = i;
    let depth = 1;
    let quote = null;
    for (; i < css.length; i++) {
      const c = css[i];
      if (quote) { if (c === '\\') i++; else if (c === quote) quote = null; continue; }
      if (c === '"' || c === "'") quote = c;
      else if (c === '{') depth++;
      else if (c === '}' && --depth === 0) { i++; return css.slice(start, i - 1); }
    }
    return css.slice(start);
  };
  const walk = (src) => {
    const saved = [css, i];
    css = src; i = 0;
    let out = '';
    let prelude = '';
    let quote = null;
    for (; i < css.length; i++) {
      const c = css[i];
      if (quote) { prelude += c; if (c === '\\') { prelude += css[++i] ?? ''; } else if (c === quote) quote = null; continue; }
      if (c === '"' || c === "'") { quote = c; prelude += c; continue; }
      if (c === ';') { prelude = ''; continue; }
      if (c !== '{') { prelude += c; continue; }
      i++;
      const body = readBlock();
      i--;
      const head = prelude.trim();
      prelude = '';
      if (head.startsWith('@')) {
        if (/^@(media|supports|container|layer|document)\b/i.test(head)) {
          const inner = walk(body);
          if (inner.trim()) out += `${head}{${inner}}`;
        }
        continue;
      }
      const arms = head.split(',').map((a) => a.trim()).filter((a) => ROOT_ARM_RE.test(a));
      const decls = declarations(body).filter((d) => /^--[\w-]+\s*:/.test(d));
      if (arms.length && decls.length) out += `${arms.join(', ')}{${decls.join(';')}}`;
    }
    [css, i] = saved;
    return out;
  };
  return walk(css);
}

function tokenCopy(css) {
  return rootTokenCopy(String(css ?? '').replace(COMMENT_RE, ''));
}

module.exports = { tokenCopy, rootTokenCopy };
