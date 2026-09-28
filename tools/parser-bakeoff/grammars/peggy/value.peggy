// value — a WHOLLY numeric pill: optional sign or `(`, up to three symbol characters, an
// optional inner sign, a digit run, an optional unit, an optional `)`. The number it
// carries is the incumbent's separator + magnitude policy (shared.mjs), unchanged.
Pill
  = _ [(+\-\u2212]? _ Sym|0..3| _ [\-\u2212]? [0-9] [0-9,.]* _ Unit? _ ")"? _ !. { return options.h.numberOf(text().trim()); }

Unit = "%" / "\u2030" / [A-Za-z]|1..6| ;
Sym  = [^0-9A-Za-z_\t-\r \u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff] ;
_    = [\t-\r \u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]*
