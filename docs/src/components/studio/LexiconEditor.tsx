// The deck-scope "Lexicon" editor — a structured UI over the `lexicon:` front-matter, so an author
// fixes how a WORD or SYMBOL is read aloud without hand-writing YAML. Each row is a token → its
// spoken form (blank = silence it); committing writes the whole `lexicon:` block back into the deck
// source via `setFrontMatterBlock` (the reader, `lexiconMap`, picks it up reactively).
// Mirrors the TextRow discipline: local draft while typing, commit on blur/Enter, re-seed when the
// stored map changes underneath (deck switch / AI edit). See the Speech Symbol Commons ADR.

import { Plus, X } from 'lucide-react';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface Row {
  id: string;
  token: string;
  spoken: string;
}

let ROW_SEQ = 0;
const toRows = (lexicon: ReadonlyMap<string, string>): Row[] =>
  [...lexicon].map(([token, spoken]) => ({ id: `r${ROW_SEQ++}`, token, spoken }));

/** The `lexicon:` map as an ordered [token, spoken] list, blank-token rows dropped and duplicate
 *  tokens de-duped last-wins (an empty spoken is KEPT — it's the deliberate "silence" form). */
function toEntries(rows: readonly Row[]): [string, string][] {
  const seen = new Map<string, string>();
  for (const r of rows) {
    const t = r.token.trim();
    if (t) seen.set(t, r.spoken);
  }
  return [...seen];
}

export function LexiconEditor({
  lexicon,
  onChange,
}: {
  lexicon: ReadonlyMap<string, string>;
  /** Commit the whole map (writes the `lexicon:` block). Called on blur / add / remove. */
  onChange: (entries: [string, string][]) => void;
}) {
  const [rows, setRows] = React.useState<Row[]>(() => toRows(lexicon));
  // Re-seed from the stored map on a CONTENT change (deck switch, AI edit) — keyed on the content
  // signature, not the Map identity, so our own commit (same content back) doesn't fight typing.
  const sig = [...lexicon].map(([k, v]) => `${k} ${v}`).join('');
  const lastSig = React.useRef(sig);
  React.useEffect(() => {
    if (sig !== lastSig.current) {
      lastSig.current = sig;
      setRows(toRows(lexicon));
    }
  }, [sig, lexicon]);

  const commit = (next: Row[]) => {
    const entries = toEntries(next);
    lastSig.current = entries.map(([k, v]) => `${k} ${v}`).join('');
    onChange(entries);
  };

  const update = (id: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const remove = (id: string) => {
    setRows((rs) => {
      const next = rs.filter((r) => r.id !== id);
      commit(next);
      return next;
    });
  };
  const add = () => setRows((rs) => [...rs, { id: `r${ROW_SEQ++}`, token: '', spoken: '' }]);

  return (
    <div className="my-2">
      {rows.length === 0 ? (
        <p className="text-[11px] leading-snug text-muted-foreground">
          No entries yet — the built-in commons handles arrows, math, marks, and emoji. Add a row to teach a
          tricky word's pronunciation or to silence a symbol.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center gap-1.5">
              <Input
                aria-label="Word or symbol"
                value={r.token}
                placeholder="Kubernetes"
                onChange={(e) => update(r.id, { token: e.target.value })}
                onBlur={() => commit(rows)}
                onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                className="h-8 w-28 shrink-0 text-[13px]"
              />
              <span aria-hidden className="shrink-0 text-[12px] text-muted-foreground">→</span>
              <Input
                aria-label="Spoken form"
                value={r.spoken}
                placeholder="spoken form — blank is silent"
                onChange={(e) => update(r.id, { spoken: e.target.value })}
                onBlur={() => commit(rows)}
                onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                className="h-8 flex-1 text-[12.5px]"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Remove ${r.token || 'entry'}`}
                onClick={() => remove(r.id)}
                className="size-8 shrink-0 text-muted-foreground hover:text-foreground"
              >
                <X className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <Button type="button" variant="outline" size="sm" onClick={add} className="mt-2 h-8 gap-1.5 text-[12px]">
        <Plus className="size-3.5" /> Add entry
      </Button>
    </div>
  );
}
