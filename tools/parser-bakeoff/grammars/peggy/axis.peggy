// axis — a bracketed list of members; a member is bare (one part) or braced (its
// comma-separated parts, capped by the caller's maxParts). Quotes protect commas and open
// only at a part's start, and only when a partner ending a part exists further on.
{
  const h = options.h;
  const cap = options.maxParts || 0;
  let count = 0;                         // kept parts in the braced member being read
  const keep = (p) => { if (p) count++; return p; };
}

Outer
  = _ "[" inner:$((!("]" _ !.) .)*) "]" _ !. { return options.inner(inner); }

Inner
  = ms:Member* last:BarePart { return h.finalize([...ms, last ? [last] : []]); }

Member
  = Braced
  / p:BarePart "," { return p ? [p] : []; }

Braced
  = _ "{" &{ count = 0; return true; } first:BPart rest:("," p:BPart { return p; })* ("}" / !.) (_ ",")?
    { return [first, ...rest].filter(Boolean); }

// A part read once `cap - 1` parts are kept absorbs every later comma: a label is prose.
BPart
  = &{ return cap && count >= cap - 1; } _ q:Quoted? b:$[^}]* { return keep(h.part((q ?? '') + b, q !== null)); }
  / _ q:Quoted? b:$[^,}]* { return keep(h.part((q ?? '') + b, q !== null)); }

BarePart
  = _ q:Quoted? b:$[^,]* { return h.part((q ?? '') + b, q !== null); }

Quoted
  = "\"" &((!("\"" _ End) .)* "\"" _ End) b:$[^"]* "\"" { return `"${b}"`; }
  / "'" &((!("'" _ End) .)* "'" _ End) b:$[^']* "'" { return `'${b}'`; }

// `]` too: the incumbent reads a stray `]` inside the list as ending a part (its right-to-left
// scan seeds `next` with the closing bracket code and never tells the two apart). Found by fuzz.
End = "," / "}" / "]" / !. ;
_   = [\t-\r \u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]*
