// inline — a state mark `[x]`, a pill `{LABEL}:mod:mod`, or an escape `\{…}` / `\[…]`.
// The grammar reads the shape; which words are legal modifiers is the incumbent's table.
Start
  = Escaped / Direct

Escaped
  = "\\" r:Direct &{ return r !== null; } { return { kind: 'escaped', text: text().slice(1) }; }

Direct
  = State / Pill / .* { return null; }

State
  // The marker set is the kernel's (MARKER_CLASS), read through options, never retyped.
  = "[" m:. &{ return options.h.STATE_MARKERS.includes(m); } "]" !. { return { kind: 'state', marker: m }; }

Pill
  = "{" v:$[^}]* "}" mods:(":" m:$[^:]* { return m; })* !. { return options.h.pill(v, mods); }
