// gantt — a span `start..end` or a single point; each side is an ISO date, a quarter or a
// month, optionally year-qualified. `..` is the one delimiter; the first one splits.
{{ const WS = /[\t-\r \u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]/; }}

Span
  = a:$(!".." .)* ".." b:$(.*) { return { start: options.point(a), end: options.point(b) }; }
  / p:$(.*) { return { point: options.point(p) }; }

Point
  = _ p:(Date / Quarter / Month) _ !. { return p; }

Date
  = y:$(D D D D) "-" m:$(D D) "-" d:$(D D) &(_ !.) { return options.h.date(+y, +m, +d); }

Quarter
  = y:Year? "Q"i q:[1-4] { return options.h.quarter(y ?? null, q); }

Month
  = y:Year? w:$[A-Za-z]+ &(_ !.) &{ return options.h.month(y ?? null, w) !== null; } { return options.h.month(y ?? null, w); }

Year
  = y:$(D D D D) _ { return +y; }

D = [0-9] ;
_ = [\t-\r \u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]*
