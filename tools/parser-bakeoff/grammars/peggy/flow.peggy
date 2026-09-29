// flow — one flowchart row split into parts by arrows. An arrow starts only at a word
// start and ends at a word boundary: [<] shaft [label shaft] [> | shaft], shaft `-` or `=`;
// Mermaid's doubled shaft reads as the house form; `\` escapes one ASCII punctuation mark.
// Peggy rules take no parameters, so the shaft `c` is carried by nested labels and
// compared in predicates rather than passed to a sub-rule.
Row
  = a:Arrow? rest:(s:Sp b:Arrow? { return b ? [s, b] : [s]; } / Esc / Other)*
    { return options.build([a, ...rest.flat()].filter((x) => x !== null)); }

Sp    = c:[ \t\n\r] { return { t: c }; }
Esc   = "\\" c:[!-/:-@\[-`{-~] { return { t: c === '&' ? '\u0001' : c }; }
Other = c:. { return { t: c }; }

B = &([ \t\n\r] / !.)

Arrow
  = l:"<"? c:[\-=] r:(
      // A doubled or tripled shaft commits: it is a Mermaid arrow or nothing.
      &{ return input[offset()] === c; }
      x:$(s1:[\-=] &{ return s1 === c; } (s2:[\-=] &{ return s2 === c; })?)
      g:(">" B { return true; } / B { return false; })
        { return { label: '', mermaid: g || l !== null || x.length === 2, dir: g ? (l ? 'both' : 'out') : (l ? 'in' : 'none') }; }
    / ">" B
        { return { label: '', mermaid: false, dir: l ? 'both' : 'out' }; }
    / B &{ return l !== null; }
        { return { label: '', mermaid: false, dir: 'in' }; }
    / &{ return input[offset()] !== c; }
      lab:$([^ \t\n\r>] ([ \t\r]+ [^<>\n \t\r] / !(k:[\-=] &{ return k === c; } (">" B / B)) [^<>\n \t\r])*)
      &{ return lab.length <= 61; }
      k:(s:[\-=] &{ return s === c; } g:(">" B { return true; } / B { return false; }) { return g; })
        { return { label: lab, mermaid: false, dir: k ? (l ? 'both' : 'out') : (l ? 'in' : 'none') }; }
  )
  { return { a: { heavy: c === '=', label: r.label, dir: r.dir, mermaid: r.mermaid } }; }
