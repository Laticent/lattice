/**
 * lib/core/decl-value-safe.js — can a value written into a REAL inline-style declaration escape that declaration?
 *
 * The engine's slide-style sink (lib/engine/slides.js) writes an author's `color`, `backgroundColor`, `backgroundImage` and
 * friends only when this says the value is safe, and drops it otherwise. The placed-picture rule (lib/core/placed-picture.mjs)
 * asks it too: a `backgroundImage` the sink drops gives the slide no background photo, so it must not stop a lone picture from
 * being placed. A leaf module with no requires, so the Studio's dev server loads it as is.
 */
/** True when a REAL declaration's value cannot escape its declaration. */
function realDeclValueIsSafe(value) {
  const v = String(value).trim();
  // Exactly one url() token: the data-URI carve-out. No quotes, no nesting, no injection
  // characters inside, and nothing after the closing paren.
  //
  // THE NEWLINES IN THESE CLASSES ARE LOAD-BEARING, and their absence was a live hole. A
  // QUOTED url is tokenized as a function-token followed by a STRING, not as a url-token —
  // so a raw newline inside the quotes makes a bad-string-token, the `)` is swallowed into
  // the following string, the function block never closes, and parsing runs to EOF. That is
  // precisely the swallow the balance check below exists to stop, reached by walking around
  // it. `url("a<newline>b")` deleted four engine declarations in Chromium. No legitimate URL
  // contains a raw newline, so rejecting them costs nothing; the value then falls through to
  // the quote ban and is dropped whole.
  if (/^url\([^()"'\\{}<>\r\n\f]*\)$/i.test(v)) return true;                 // url(unquoted)
  if (/^url\(\s*"[^"'()\\{}<>\r\n\f]*"\s*\)$/i.test(v)) return true;           // url("quoted")
  if (/^url\(\s*'[^"'()\\{}<>\r\n\f]*'\s*\)$/i.test(v)) return true;           // url('quoted')
  if (/[;{}<>\\"']/.test(v)) return false;
  // A comment opener runs to the end of the attribute, deleting every declaration the engine
  // writes after this one. `/` alone is legal (URLs), so reject only the two-character forms.
  if (v.includes('/*') || v.includes('*/')) return false;
  // Balanced parens: an unclosed function block swallows every declaration after it, which
  // lets an author silently delete the engine's own later declarations.
  let depth = 0;
  for (const c of v) {
    if (c === '(') depth++;
    else if (c === ')' && --depth < 0) return false;
  }
  return depth === 0;
}

module.exports = realDeclValueIsSafe;
