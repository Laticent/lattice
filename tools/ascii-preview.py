#!/usr/bin/env python3
"""
ASCII layout preview helper for engineering/templates.md (and friends).

Two modes:

  audit  — scan every ```text fenced block in a markdown file and report
           any block whose framed rows aren't all the same length, plus
           any rows whose outer-wall padding is asymmetric or smaller
           than the canonical 2 spaces.

  build  — programmatic builder for the canonical 43-wide preview blocks
           used in templates.md. Importable as a module, or runnable
           directly to print every standard layout to stdout for review.

Canonical geometry (templates.md):

    outer width:        43 chars   (┌─...─┐ / └─...─┘)
    outer wall pad:     2 spaces   (lead and trail inside the │ walls)
    inner content area: 37 chars   (between the 2-pad walls)
    2-card grid:        16-wide cards, 5-space gap   (16 + 5 + 16 = 37)
    comparison arrow:   "  →  "   sits in the same 5-space gap
    3-col table:        11-wide columns with shared edges (37 total)

Why this exists:

    These previews drift over time as authors hand-edit them. The result
    is mixed widths, asymmetric padding, and stray fence artifacts that
    only become visible in rendered preview. This script makes the
    geometry programmatic so any rebuild stays uniform.

Usage:

    python3 tools/ascii-preview.py audit engineering/templates.md
    python3 tools/ascii-preview.py build           # prints all canonical blocks

History note:

    Created 2026-05-07 after a sweep that unified 33 ASCII previews to
    43-wide / pad-2 / gap-5 geometry. Same pass also caught a renderer
    bug (an orphan ```text fence wrapping the bullet list and heading
    of the next template — see commit history for the full lesson).
"""

from __future__ import annotations
import argparse
import re
import sys
import unicodedata

# ----- display-width helpers ------------------------------------------------
#
# `len()` counts Unicode code points, but the visual alignment that matters
# for ASCII previews is cell count in a monospace font. Wide East Asian
# characters (W/F) and emoji render as 2 cells while reporting len()==1.
# The audit must use display_width() everywhere, otherwise blocks like the
# original `journey` (which had 😊/😐) pass code-point checks but render
# misaligned. Combining marks contribute 0 cells.

def char_cells(ch: str) -> int:
    """Display-cell width of a single character. 0 for combining marks,
    2 for East Asian Wide / Full-width, 1 otherwise."""
    if unicodedata.combining(ch):
        return 0
    ea = unicodedata.east_asian_width(ch)
    return 2 if ea in ('W', 'F') else 1


def display_width(s: str) -> int:
    """Total display width of a string in monospace cells."""
    return sum(char_cells(c) for c in s)

# ----- canonical geometry --------------------------------------------------

OUTER = 43            # full row width including walls
PAD = 2               # spaces between │ wall and content
INNER = OUTER - 2     # 41 chars between │…│
CONTENT = INNER - 2 * PAD  # 37 chars of content area

CARD_W = 16           # 2-card layout
GAP = 5               # 16 + 5 + 16 = 37 ✓
TABLE_COL = 11        # 11×3 with shared edges = 37


# ----- frame builders -------------------------------------------------------

def frame(rows: list[tuple]) -> str:
    """Build a 43-wide framed block from a row spec list.

    Row kinds:
      ('center', text)              — centered in the 37-char content area
      ('left',   text)              — left-anchored in the content area
      ('split',  left, right)       — left at start, right at end of content
      ('blank',)                    — fully blank inner row
      ('raw',    text37)            — text already exactly 37 cells wide

    Widths are measured in DISPLAY CELLS (display_width), not code points,
    so wide-cell chars (emoji, CJK) raise at build time instead of silently
    misaligning at render time.
    """
    out = ['┌' + '─' * INNER + '┐']
    for r in rows:
        kind = r[0]
        if kind == 'center':
            s = r[1]
            pad = CONTENT - display_width(s)
            if pad < 0:
                raise ValueError(f"center row exceeds {CONTENT} cells: {s!r}")
            l, rr = pad // 2, pad - pad // 2
            out.append('│' + ' ' * PAD + ' ' * l + s + ' ' * rr + ' ' * PAD + '│')
        elif kind == 'left':
            s = r[1]
            pad = CONTENT - display_width(s)
            if pad < 0:
                raise ValueError(f"left row exceeds {CONTENT} cells: {s!r}")
            out.append('│' + ' ' * PAD + s + ' ' * pad + ' ' * PAD + '│')
        elif kind == 'split':
            l, rr = r[1], r[2]
            mid = CONTENT - display_width(l) - display_width(rr)
            if mid < 0:
                raise ValueError(f"split row exceeds {CONTENT} cells: {l!r} + {rr!r}")
            out.append('│' + ' ' * PAD + l + ' ' * mid + rr + ' ' * PAD + '│')
        elif kind == 'blank':
            out.append('│' + ' ' * INNER + '│')
        elif kind == 'raw':
            s = r[1]
            dw = display_width(s)
            if dw != CONTENT:
                raise ValueError(
                    f"raw row must be {CONTENT} cells, got {dw} "
                    f"(codepoints={len(s)}): {s!r}"
                )
            out.append('│' + ' ' * PAD + s + ' ' * PAD + '│')
        else:
            raise ValueError(f"unknown row kind: {kind!r}")
    out.append('└' + '─' * INNER + '┘')
    return '\n'.join(out)


# ----- card primitives ------------------------------------------------------

def card_top() -> str:
    return '┌' + '─' * (CARD_W - 2) + '┐'


def card_bot() -> str:
    return '└' + '─' * (CARD_W - 2) + '┘'


def card_row(text: str) -> str:
    body = CARD_W - 2
    return '│ ' + text + ' ' * (body - 1 - len(text)) + '│'


def two_cards(L: str, R: str) -> tuple:
    return ('raw', L + ' ' * GAP + R)


def two_cards_arrow(L: str, R: str) -> tuple:
    """Like two_cards but with '  →  ' (5 chars) in the gap."""
    return ('raw', L + '  →  ' + R)


# ----- table primitives -----------------------------------------------------

def table_top() -> str:
    c = TABLE_COL
    return '┌' + '─' * c + '┬' + '─' * c + '┬' + '─' * c + '┐'


def table_sep() -> str:
    c = TABLE_COL
    return '├' + '─' * c + '┼' + '─' * c + '┼' + '─' * c + '┤'


def table_bot() -> str:
    c = TABLE_COL
    return '└' + '─' * c + '┴' + '─' * c + '┴' + '─' * c + '┘'


def _cell(t: str) -> str:
    return ' ' + t + ' ' * (TABLE_COL - 1 - len(t))


def table_row(a: str, b: str, c: str) -> tuple:
    return ('raw', '│' + _cell(a) + '│' + _cell(b) + '│' + _cell(c) + '│')


# ----- panel primitives (split-panel etc.) --------------------------------

PANEL_W = 14           # left accent panel width including walls
PANEL_GAP = 2          # space between panel and right column
RIGHT_W = CONTENT - PANEL_W - PANEL_GAP  # 37 - 14 - 2 = 21


def panel_top() -> str:
    return '┌' + '─' * (PANEL_W - 2) + '┐'


def panel_bot() -> str:
    return '└' + '─' * (PANEL_W - 2) + '┘'


def panel_row(text: str) -> str:
    body = PANEL_W - 2
    return '│ ' + text + ' ' * (body - 1 - len(text)) + '│'


def panel_right(panel_text: str, right_text: str) -> tuple:
    """Combine a PANEL_W-wide panel string with right-column text (≤RIGHT_W)."""
    if len(right_text) > RIGHT_W:
        raise ValueError(f"right text exceeds {RIGHT_W} chars: {right_text!r}")
    right = right_text + ' ' * (RIGHT_W - len(right_text))
    return ('raw', panel_text + ' ' * PANEL_GAP + right)


# ----- wide-card primitives (cards-stack, decision, code, citation) -

def wide_card_top() -> str:
    return '┌' + '─' * (CONTENT - 2) + '┐'


def wide_card_bot() -> str:
    return '└' + '─' * (CONTENT - 2) + '┘'


def wide_card_row(text: str) -> str:
    body = CONTENT - 2
    return '│ ' + text + ' ' * (body - 1 - len(text)) + '│'


# ----- three-column primitives (T6 stats, kanban) --

THREECOL_W = (CONTENT - 2 * 2) // 3  # 11 wide cells, two 2-space gaps -> 33+4=37


def three_cells(a: str, b: str, c: str) -> tuple:
    """Three text cells across the content area, separated by 2 spaces."""
    cells = []
    for s in (a, b, c):
        if len(s) > THREECOL_W:
            raise ValueError(f"three_cells: {s!r} > {THREECOL_W} chars")
        cells.append(s + ' ' * (THREECOL_W - len(s)))
    return ('raw', cells[0] + '  ' + cells[1] + '  ' + cells[2])


def three_card_top() -> str:
    return '┌' + '─' * (THREECOL_W - 2) + '┐'


def three_card_bot() -> str:
    return '└' + '─' * (THREECOL_W - 2) + '┘'


def three_card_row(text: str) -> str:
    body = THREECOL_W - 2
    if len(text) > body - 1:
        text = text[:body - 1]
    return '│ ' + text + ' ' * (body - 1 - len(text)) + '│'


# ----- node primitives (T39 timeline, journey, kanban) ----------------------

def node(text: str, w: int = 7) -> str:
    """Small bracketed node like '[Foo]'. Pads to fixed width w."""
    inner = text + ' ' * (w - 2 - len(text))
    return '[' + inner + ']'


def nodes_arrow_row(items: list[str], w: int = 7) -> tuple:
    """Three nodes joined by ' → ' arrows, centered in content area."""
    parts = [node(t, w) for t in items]
    s = ' → '.join(parts)
    pad = CONTENT - len(s)
    l = pad // 2
    r = pad - l
    return ('raw', ' ' * l + s + ' ' * r)


# ----- big-number / boxed-value primitives ----------------------------------

def boxed_value(text: str) -> list[tuple]:
    """A small 3-line box centered in the content area, value text inside.
    Returns three rows (top, value, bot) ready to feed into frame()."""
    body = len(text) + 2  # padding inside box walls
    top = '┌' + '─' * body + '┐'
    val = '│ ' + text + ' │'
    bot = '└' + '─' * body + '┘'
    rows = []
    for s in (top, val, bot):
        pad = CONTENT - len(s)
        l = pad // 2
        r = pad - l
        rows.append(('raw', ' ' * l + s + ' ' * r))
    return rows


# ----- bar primitives (T47 progress, gantt) ---------------------------------

def progress_bar(label: str, filled: int, total: int = 20, pct: str = '') -> tuple:
    """Label + filled/empty bar + optional pct marker, fits in CONTENT."""
    bar = '▓' * filled + '░' * (total - filled)
    # Layout: "label  bar  pct" — total must equal CONTENT (37).
    fixed = len(bar) + len(pct) + 4  # bar + pct + 2 gaps of 2-space each
    label_w = CONTENT - fixed
    if len(label) > label_w:
        label = label[:label_w]
    label_padded = label + ' ' * (label_w - len(label))
    pct_padded = (' ' + pct) if pct else ''
    s = label_padded + '  ' + bar + pct_padded
    # Final width check
    if len(s) != CONTENT:
        s = s + ' ' * (CONTENT - len(s)) if len(s) < CONTENT else s[:CONTENT]
    return ('raw', s)


# ----- audit ----------------------------------------------------------------

def audit(path: str) -> int:
    """Walk every ```text block in a markdown file, report any anomalies.
    Returns the number of issues found.
    """
    issues: list[str] = []
    blocks = 0
    in_block = False
    buf: list[tuple[int, str]] = []
    start = 0

    with open(path, encoding='utf-8') as f:
        for i, raw in enumerate(f, 1):
            line = raw.rstrip('\n')
            if line == '```text':
                in_block = True
                buf = []
                start = i
                continue
            if in_block and line.startswith('```'):
                in_block = False
                blocks += 1
                widths = {display_width(l) for _, l in buf if l.strip()}
                if widths and widths != {OUTER}:
                    issues.append(
                        f"L{start}: widths {sorted(widths)} (expected {{{OUTER}}}) — check for wide-cell chars (emoji, CJK)"
                    )
                    # Per-row breakdown helps locate the offender.
                    for li, l in buf:
                        dw = display_width(l)
                        if l.strip() and dw != OUTER:
                            issues.append(f"  L{li}: width={dw} (codepoints={len(l)}): {l}")
                for li, l in buf:
                    if display_width(l) != OUTER or not (l.startswith('│') and l.endswith('│')):
                        continue
                    inner = l[1:-1]
                    if not inner.strip():
                        continue
                    if any(c in inner for c in '┌└├┬┴┤'):
                        continue
                    lead = len(inner) - len(inner.lstrip(' '))
                    trail = len(inner) - len(inner.rstrip(' '))
                    if lead < PAD or trail < PAD:
                        issues.append(
                            f"L{li}: lead={lead} trail={trail} (expected ≥{PAD}): {l}"
                        )
                continue
            if in_block:
                buf.append((i, line))

    print(f"{blocks} ```text blocks scanned, {len(issues)} issue(s)")
    for x in issues:
        print(f"  {x}")
    return len(issues)


# ----- build (demo / library entry point) -----------------------------------

def demo_blocks() -> dict[str, str]:
    """Return a dict of canonical templates.md ASCII blocks, keyed by id."""
    blocks: dict[str, str] = {}

    blocks['T1-title-bookend'] = frame([
        ('center', '[dark background]'),
        ('blank',),
        ('center', 'EYEBROW LABEL'),
        ('blank',),
        ('center', 'Display Title Here'),
        ('center', 'Subtitle or tagline'),
        ('blank',),
    ])

    blocks['funnel'] = frame([
        ('left', 'header'),
        ('center', 'Where the pipeline leaks.'),
        ('blank',),
        ('center', 'Visitors    [============]   12,000'),
        ('center', '  62%        [========]      4,800'),
        ('center', 'Activated    [=====]         2,160'),
        ('center', '  40%        [==]              864'),
        ('center', 'Paid         [=]               670'),
        ('blank',),
        ('split', 'footer', '1/19'),
    ])

    blocks['pricing'] = frame([
        ('left', 'header'),
        ('center', 'Pick the plan that fits.'),
        ('blank',),
        ('center', 'Starter    Growth*    Enterprise'),
        ('center', '$0         $49         Custom'),
        ('center', '[x x /]    [x x x]     [x x x]'),
        ('center', 'one team   scaling     procurement'),
        ('blank',),
        ('split', 'footer', '1/19'),
    ])

    blocks['logo-wall'] = frame([
        ('left', 'header'),
        ('center', 'TRUSTED BY'),
        ('center', 'The teams that run on us.'),
        ('blank',),
        ('center', '[Acme]   [Globex]   [Initech]'),
        ('center', 'Acme      Globex     Initech'),
        ('center', '(SeriesB) (Public)   (Seed)'),
        ('blank',),
        ('split', 'footer', '1/19'),
    ])

    blocks['q-and-a'] = frame([
        ('left', 'header'),
        ('center', 'What we expect to be asked.'),
        ('blank',),
        ('left', 'Q  Why not wait two quarters?'),
        ('left', 'A  The window closes in Q3.'),
        ('blank',),
        ('left', 'Q  What if pricing shifts?'),
        ('left', 'A  Contracts lock 2026 rates.'),
        ('blank',),
        ('split', 'footer', '1/19'),
    ])

    blocks['T7-card-grid-2x2'] = frame([
        ('left', 'header'),
        ('center', 'LABEL'),
        ('center', 'Grid Title'),
        ('blank',),
        two_cards(card_top(), card_top()),
        two_cards(card_row('Card Title 1'), card_row('Card Title 2')),
        two_cards(card_row('content'), card_row('content')),
        two_cards(card_bot(), card_bot()),
        two_cards(card_top(), card_top()),
        two_cards(card_row('Card Title 3'), card_row('Card Title 4')),
        two_cards(card_row('content'), card_row('content')),
        two_cards(card_bot(), card_bot()),
        ('split', 'footer', '1/19'),
    ])

    blocks['T11-comparison'] = frame([
        ('left', 'header'),
        ('center', 'LABEL'),
        ('center', 'Comparison Title'),
        ('blank',),
        two_cards(card_top(), card_top()),
        two_cards_arrow(card_row('Before /'), card_row('After /')),
        two_cards(card_row('Option A'), card_row('Option B')),
        two_cards(card_row(''), card_row('')),
        two_cards(card_bot(), card_bot()),
        ('blank',),
        ('split', 'footer', '1/19'),
    ])

    blocks['T22-compare-table'] = frame([
        ('left', 'header'),
        ('left', 'LABEL'),
        ('left', 'Here are the numbers side by side.'),
        ('blank',),
        ('raw', table_top()),
        table_row('', 'Option A', 'Option B'),
        ('raw', table_sep()),
        table_row('Row 1', '✓', '✕'),
        table_row('Row 2', '✕', '✓'),
        table_row('Row 3', '✓', '✓'),
        table_row('Row 4', '⚠', '✓'),
        ('raw', table_bot()),
        ('left', 'Footnote text for scope caveats.'),
        ('split', 'footer', '11/19'),
    ])

    # ----- ANCHOR family (bookend chrome) -----------------------------------

    blocks['divider-bookend'] = frame([
        ('center', '[dark background]'),
        ('blank',),
        ('center', 'SECTION 02'),
        ('blank',),
        ('center', 'Section headline'),
        ('blank',),
        ('blank',),
        ('blank',),
    ])

    blocks['closing-bookend'] = frame([
        ('center', '[dark background]'),
        ('blank',),
        ('center', 'CLOSING'),
        ('blank',),
        ('center', 'Take this away'),
        ('blank',),
        ('blank',),
        ('blank',),
    ])

    # ----- STATEMENT family -------------------------------------------------

    blocks['content-canvas'] = frame([
        ('left', 'header'),
        ('left', 'EYEBROW'),
        ('left', 'Single-idea heading.'),
        ('blank',),
        ('left', 'Paragraph carries the slide.'),
        ('left', 'One idea expanded into prose,'),
        ('left', 'no lists, no chrome.'),
        ('blank',),
        ('split', 'footer', '1/19'),
    ])

    blocks['quote-canvas'] = frame([
        ('left', 'header'),
        ('blank',),
        ('center', '"A pulled quote that fills'),
        ('center', 'the centre of the slide."'),
        ('blank',),
        ('center', '— Attribution, source'),
        ('blank',),
        ('split', 'footer', '1/19'),
    ])

    blocks['big-number-canvas'] = frame([
        ('left', 'header'),
        ('left', 'EYEBROW'),
        ('blank',),
        *boxed_value('42×'),
        ('blank',),
        ('center', 'Caption explains the number.'),
        ('split', 'footer', '1/19'),
    ])

    blocks['split-panel'] = frame([
        ('left', 'header'),
        panel_right(panel_top(), 'FINDINGS'),
        panel_right(panel_row('BRIEF'), '│ Finding title'),
        panel_right(panel_row('heading'), '│ body detail'),
        panel_right(panel_row('+ lede'), '│ Finding title'),
        panel_right(panel_row(''), '│ body detail'),
        panel_right(panel_bot(), ''),
        ('split', 'footer', '1/19'),
    ])

    # ----- INVENTORY family -------------------------------------------------

    blocks['cards-stack'] = frame([
        ('left', 'header'),
        ('left', 'Stacked-cards heading.'),
        ('blank',),
        ('raw', wide_card_top()),
        ('raw', wide_card_row('Card title 1 — claim or label')),
        ('raw', wide_card_row('body text fills the wide row')),
        ('raw', wide_card_bot()),
        ('raw', wide_card_top()),
        ('raw', wide_card_row('Card title 2 — claim or label')),
        ('raw', wide_card_bot()),
        ('split', 'footer', '1/19'),
    ])


    blocks['list'] = frame([
        ('left', 'header'),
        ('left', 'List heading.'),
        ('blank',),
        ('left', '- First bulleted item'),
        ('left', '- Second bulleted item'),
        ('left', '- Third bulleted item'),
        ('left', '- Fourth bulleted item'),
        ('blank',),
        ('split', 'footer', '1/19'),
    ])

    blocks['list-tabular'] = frame([
        ('left', 'header'),
        ('left', 'Ledger heading.'),
        ('blank',),
        ('left', '01  Term      value     metadata'),
        ('left', '02  Term      value     metadata'),
        ('left', '03  Term      value     metadata'),
        ('left', '04  Term      value     metadata'),
        ('blank',),
        ('split', 'footer', '1/19'),
    ])

    blocks['checklist'] = frame([
        ('left', 'header'),
        ('left', 'Checklist heading.'),
        ('blank',),
        ('left', '[x] Completed item — green tint'),
        ('left', '[-] Partial item — amber tint'),
        ('left', '[ ] Open item — red tint'),
        ('left', '[x] Another completed item'),
        ('blank',),
        ('split', 'footer', '1/19'),
    ])

    blocks['glossary'] = frame([
        ('left', 'header'),
        ('left', 'Glossary heading.            A–Z'),
        ('blank',),
        ('left', 'TERM      DEFINITION'),
        ('left', 'Term A    Definition or gloss.'),
        ('left', 'Term B    Definition or gloss.'),
        ('left', 'Term C    Definition or gloss.'),
        ('left', 'Term D    Definition or gloss.'),
        ('blank',),
        ('split', 'footer', '1/19'),
    ])

    blocks['actors'] = frame([
        ('left', 'header'),
        ('left', 'Actors heading.'),
        ('blank',),
        ('left', 'Role A    Owner name'),
        ('left', '          - responsibility one'),
        ('left', 'Role B    Owner name'),
        ('left', '          - responsibility two'),
        ('blank',),
        ('split', 'footer', '1/19'),
    ])

    blocks['agenda'] = frame([
        ('left', 'header'),
        ('left', 'Agenda heading.'),
        ('blank',),
        ('left', '01  First section topic'),
        ('left', '02  Second section topic'),
        ('left', '03  Third section topic'),
        ('left', '04  Fourth section topic'),
        ('blank',),
        ('split', 'footer', '1/19'),
    ])

    blocks['principles'] = frame([
        ('left', 'header'),
        ('left', 'Principles heading.'),
        ('blank',),
        ('left', '01  First principle, stated.'),
        ('left', '02  Second principle, stated.'),
        ('left', '03  Third principle, stated.'),
        ('blank',),
        ('split', 'footer', '1/19'),
    ])

    blocks['statute-stack'] = frame([
        ('left', 'header'),
        ('left', 'Statute stack heading.'),
        ('blank',),
        ('raw', wide_card_top()),
        ('raw', wide_card_row('FEDERAL · cite        [in effect]')),
        ('raw', wide_card_row('Obligation prose for tier.')),
        ('raw', wide_card_bot()),
        ('raw', wide_card_top()),
        ('raw', wide_card_row('STATE · cite          [pending]')),
        ('raw', wide_card_bot()),
        ('split', 'footer', '1/19'),
    ])

    # ----- COMPARISON family ------------------------------------------------

    blocks['compare-code'] = frame([
        ('left', 'header'),
        ('left', 'Code comparison heading.'),
        ('blank',),
        two_cards(card_top(), card_top()),
        two_cards(card_row('// before'), card_row('// after')),
        two_cards(card_row('foo();'), card_row('bar();')),
        two_cards(card_row('baz();'), card_row('qux();')),
        two_cards(card_bot(), card_bot()),
        ('split', 'footer', '1/19'),
    ])

    blocks['decision'] = frame([
        ('left', 'header'),
        ('center', 'Decision heading.'),
        ('blank',),
        ('raw', three_card_top() + '  ' + three_card_top() + '  ' + three_card_top()),
        three_cells('CHOSEN', 'Option B', 'Option C'),
        three_cells('rationale', 'rationale', 'rationale'),
        ('raw', three_card_bot() + '  ' + three_card_bot() + '  ' + three_card_bot()),
        ('blank',),
        ('split', 'footer', '1/19'),
    ])

    blocks['matrix-2x2'] = frame([
        ('left', 'header'),
        ('center', '2×2 matrix heading'),
        ('blank',),
        two_cards(card_top(), card_top()),
        two_cards(card_row('Q1: top L'), card_row('Q2: top R')),
        two_cards(card_row('axis y+'), card_row('axis y+')),
        two_cards(card_bot(), card_bot()),
        two_cards(card_top(), card_top()),
        two_cards(card_row('Q3: bot L'), card_row('Q4: bot R')),
        two_cards(card_bot(), card_bot()),
        ('split', 'footer', '1/19'),
    ])

    blocks['obligation-matrix'] = frame([
        ('left', 'header'),
        ('left', 'Regulation × duty heading.'),
        ('blank',),
        ('raw', table_top()),
        table_row('', 'Duty A', 'Duty B'),
        ('raw', table_sep()),
        table_row('Reg 1', '✓', '✕'),
        table_row('Reg 2', '✓', '✓'),
        table_row('Reg 3', '⚠', '✓'),
        ('raw', table_bot()),
        ('split', 'footer', '1/19'),
    ])

    blocks['matrix-grid'] = frame([
        ('left', 'header'),
        ('left', 'Verb × reach heading.'),
        ('blank',),
        ('raw', table_top()),
        table_row('', 'Self', 'Team'),
        ('raw', table_sep()),
        table_row('Create', '·', '◇'),
        table_row('Apply', '◇', '■'),
        table_row('Remember', '■', '◇'),
        ('raw', table_bot()),
        ('split', 'footer', '1/19'),
    ])

    blocks['premise'] = frame([
        panel_right('The claim,    ', '01 Term  clause  note'),
        panel_right('why the       ', '02 Term  clause  note'),
        panel_right('order matters.', '03 Term  clause  note'),
        panel_right('              ', '04 Term  clause  note'),
        panel_right('              ', '05 Term  clause  note'),
        panel_right('              ', '06 Term  clause  note'),
    ])

    blocks['redline'] = frame([
        ('left', 'header'),
        ('left', 'Clause diff heading.'),
        ('blank',),
        ('left', 'The original clause text with'),
        ('left', '~~struck-through removals~~ and'),
        ('left', '__underlined insertions__ shown'),
        ('left', 'inline in the prose stream.'),
        ('blank',),
        ('split', 'footer', '1/19'),
    ])

    blocks['split-compare'] = frame([
        ('left', 'header'),
        panel_right(panel_top(), '┌──────────────────┐'),
        panel_right(panel_row('OPTION'), '│ Choice A         │'),
        panel_right(panel_row('A vs B'), '└──────────────────┘'),
        panel_right(panel_row(''), '┌──────────────────┐'),
        panel_right(panel_row('verdict'), '│ Choice B         │'),
        panel_right(panel_bot(), '└──────────────────┘'),
        ('split', 'footer', '1/19'),
    ])

    blocks['verdict-grid'] = frame([
        ('left', 'header'),
        ('left', 'Verdict grid heading.'),
        ('blank',),
        two_cards(card_top(), card_top()),
        two_cards(card_row('Option A [x]'), card_row('Option B [-]')),
        two_cards(card_row('rationale'), card_row('rationale')),
        two_cards(card_bot(), card_bot()),
        two_cards(card_top(), card_top()),
        two_cards(card_row('Option C [ ]'), card_row('Option D [x]')),
        two_cards(card_bot(), card_bot()),
        ('split', 'footer', '1/19'),
    ])

    # ----- PROGRESSION family -----------------------------------------------

    blocks['list-criteria'] = frame([
        ('left', 'header'),
        ('left', 'Criteria heading.'),
        ('blank',),
        ('left', '01  First criterion — gloss'),
        ('left', '02  Second criterion — gloss'),
        ('left', '03  Third criterion — gloss'),
        ('left', '04  Fourth criterion — gloss'),
        ('blank',),
        ('split', 'footer', '1/19'),
    ])

    blocks['list-steps'] = frame([
        ('left', 'header'),
        ('left', 'Step-by-step heading (horizontal).'),
        ('blank',),
        ('raw', three_card_top() + '  ' + three_card_top() + '  ' + three_card_top()),
        three_cells('STEP 01', 'STEP 02', 'STEP 03'),
        three_cells('label', 'label', 'label'),
        three_cells('body', 'body', 'body'),
        ('raw', three_card_bot() + '  ' + three_card_bot() + '  ' + three_card_bot()),
        ('split', 'footer', '1/19'),
    ])

    blocks['timeline'] = frame([
        ('left', 'header'),
        ('center', 'Timeline heading'),
        ('blank',),
        nodes_arrow_row(['Q1', 'Q2', 'Q3'], w=7),
        ('blank',),
        ('left', '  signal  →  decision  →  outcome'),
        ('blank',),
        ('split', 'footer', '1/19'),
    ])

    blocks['timeline-list'] = frame([
        ('left', 'header'),
        ('center', 'Dated milestones heading'),
        ('blank',),
        ('center', '●─────────●─────────●'),
        ('center', '2024-01    2024-03    2024-05'),
        ('center', 'Event one  Event two  Event three'),
        ('blank',),
        ('split', 'footer', '1/19'),
    ])

    blocks['gantt'] = frame([
        ('left', 'header'),
        ('left', 'Gantt chart heading.'),
        ('blank',),
        progress_bar('Task A', 14, 20, ''),
        progress_bar('Task B', 8, 20, ''),
        progress_bar('Task C', 18, 20, ''),
        progress_bar('Task D', 6, 20, ''),
        ('blank',),
        ('split', 'footer', '1/19'),
    ])

    blocks['kanban'] = frame([
        ('left', 'header'),
        ('left', 'Kanban heading.'),
        ('blank',),
        three_cells('TODO', 'DOING', 'DONE'),
        three_cells('[card 1]', '[card 4]', '[card 7]'),
        three_cells('[card 2]', '[card 5]', '[card 8]'),
        three_cells('[card 3]', '[card 6]', ''),
        ('blank',),
        ('split', 'footer', '1/19'),
    ])

    blocks['journey'] = frame([
        ('left', 'header'),
        ('center', 'User journey heading'),
        ('blank',),
        nodes_arrow_row(['Awar', 'Sign', 'Use'], w=6),
        ('blank',),
        ('center', '  :)        :|        :)  '),
        ('center', '(satisfaction track)'),
        ('split', 'footer', '1/19'),
    ])

    blocks['roadmap'] = frame([
        ('left', 'header'),
        ('left', 'Phased roadmap heading.'),
        ('blank',),
        ('raw', table_top()),
        table_row('', 'Q1', 'Q2'),
        ('raw', table_sep()),
        table_row('Track A', '[x] done', '[-] wip'),
        table_row('Track B', '[ ] plan', '[/] skip'),
        ('raw', table_bot()),
        ('split', 'footer', '1/19'),
    ])

    blocks['authority-chain'] = frame([
        ('left', 'header'),
        ('left', 'Authority descent heading.'),
        ('blank',),
        panel_right(panel_top(), ''),
        panel_right(panel_row('TIER 1'), '§ Statute — citation'),
        panel_right(panel_row('TIER 2'), '  Regulation — cite'),
        panel_right(panel_row('TIER 3'), '  Case law — cite'),
        panel_right(panel_bot(), ''),
        ('split', 'footer', '1/19'),
    ])

    blocks['regulatory-update'] = frame([
        ('left', 'header'),
        ('left', 'Regulatory update heading.'),
        ('blank',),
        ('left', '01  Name   §cite   gloss   [eff]'),
        ('left', '02  Name   §cite   gloss   [eff]'),
        ('left', '03  Name   §cite   gloss   [eff]'),
        ('blank',),
        ('split', 'footer', '1/19'),
    ])

    # ----- EVIDENCE family --------------------------------------------------

    blocks['stats'] = frame([
        ('left', 'header'),
        ('center', 'Stats row heading'),
        ('blank',),
        three_cells('  42×  ', '  87%  ', '  3.2k '),
        three_cells(' growth', 'uptake ', ' users '),
        ('blank',),
        ('blank',),
        ('split', 'footer', '1/19'),
    ])

    blocks['kpi'] = frame([
        ('left', 'header'),
        panel_right(panel_top(), 'SUPPORTING KPIS'),
        panel_right(panel_row('$2.4B'), '42%  margin     ✓'),
        panel_right(panel_row('hero'), '$1.1B cash      ✓'),
        panel_right(panel_row('metric'), '+18% YoY        ✓'),
        panel_right(panel_bot(), ''),
        ('split', 'footer', '1/19'),
    ])

    blocks['code-canvas'] = frame([
        ('left', 'header'),
        ('left', 'Code block heading.'),
        ('blank',),
        ('raw', wide_card_top()),
        ('raw', wide_card_row('function example() {')),
        ('raw', wide_card_row("  return 'syntax highlighted';")),
        ('raw', wide_card_row('}')),
        ('raw', wide_card_bot()),
        ('blank',),
        ('split', 'footer', '1/19'),
    ])

    blocks['diagram-canvas'] = frame([
        ('left', 'header'),
        ('left', 'Diagram heading.'),
        ('blank',),
        ('center', '┌────┐    ┌────┐    ┌────┐'),
        ('center', '│ A  │ →  │ B  │ →  │ C  │'),
        ('center', '└────┘    └────┘    └────┘'),
        ('blank',),
        ('center', '(Mermaid rendered as SVG)'),
        ('split', 'footer', '1/19'),
    ])

    blocks['piechart-canvas'] = frame([
        ('left', 'header'),
        ('center', 'Distribution heading'),
        ('blank',),
        ('center', '   ╭──────╮'),
        ('center', '  │▓▓▓░░░░│'),
        ('center', '  │▓▓░░░░░│  ◆ 40%'),
        ('center', '  │░░░▓▓▓░│  ◇ 35%'),
        ('center', '   ╰──────╯   ○ 25%'),
        ('split', 'footer', '1/19'),
    ])

    blocks['progress-canvas'] = frame([
        ('left', 'header'),
        ('left', 'Progress heading.'),
        ('blank',),
        ('left', 'Goal A   ▓▓▓▓▓▓▓▓▓▓▓▓▓▓70%░░░░░░'),
        ('left', 'Goal B   ▓▓▓▓▓▓▓▓▓▓50%░░░░░░░░░░'),
        ('left', 'Goal C   ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓90%░'),
        ('blank',),
        ('split', 'footer', '1/19'),
    ])

    blocks['state-chart'] = frame([
        ('left', 'header'),
        ('center', 'State machine heading'),
        ('blank',),
        nodes_arrow_row(['Draft', 'Review', 'Pub'], w=8),
        ('blank',),
        ('center', '(back-edge: Review → Draft)'),
        ('blank',),
        ('split', 'footer', '1/19'),
    ])

    blocks['quadrant'] = frame([
        ('left', 'header'),
        ('center', 'Quadrant chart heading'),
        ('blank',),
        ('left', '  high ▲    ◆       ◆      '),
        ('left', '       │ ◆    ●           '),
        ('left', '       │       ●  ◆       '),
        ('left', '       │  ●         ●     '),
        ('left', '   low └──────────────►   '),
        ('left', '         low        high  '),
        ('split', 'footer', '1/19'),
    ])

    blocks['radar-canvas'] = frame([
        ('left', 'header'),
        ('center', 'Radar chart heading'),
        ('blank',),
        ('center', '       A          '),
        ('center', '      /·\\         '),
        ('center', '   E ●───● B      '),
        ('center', '     │   │         '),
        ('center', '   D ●───● C      '),
        ('split', 'footer', '1/19'),
    ])

    blocks['word-cloud-canvas'] = frame([
        ('left', 'header'),
        ('center', 'Weighted words heading'),
        ('blank',),
        ('center', ' alpha   BIG_TERM   beta '),
        ('center', '  emergent   HUGE        '),
        ('center', '    minor   medium       '),
        ('center', '  tiny      LARGE   keyword'),
        ('split', 'footer', '1/19'),
    ])

    blocks['math-canvas'] = frame([
        ('left', 'header'),
        ('left', 'Equation heading.'),
        ('blank',),
        ('left', 'E = m c²    │  WHERE'),
        ('left', '            │  E = energy'),
        ('left', '            │  m = mass'),
        ('left', '            │  c = speed of light'),
        ('split', 'footer', '1/19'),
    ])

    blocks['citation-card'] = frame([
        ('left', 'header'),
        ('left', 'Single authority heading.'),
        ('blank',),
        ('raw', wide_card_top()),
        ('raw', wide_card_row('§ Citation reference here')),
        ('raw', wide_card_row('— full title of authority')),
        ('raw', wide_card_row('Holding or principle gloss')),
        ('raw', wide_card_bot()),
        ('split', 'footer', '1/19'),
    ])

    # ----- IMAGERY family ---------------------------------------------------

    blocks['image-canvas'] = frame([
        ('left', 'header'),
        ('blank',),
        ('raw', 'Text slot on     ┌──────────────────┐'),
        ('raw', 'the left, with   │                  │'),
        ('raw', 'optional         │   [image area]   │'),
        ('raw', 'caption.         │                  │'),
        ('raw', '                 └──────────────────┘'),
        ('blank',),
        ('split', 'footer', '1/19'),
    ])

    return blocks


# ----- cli ------------------------------------------------------------------

def main(argv: list[str]) -> int:
    p = argparse.ArgumentParser(description=__doc__.splitlines()[1])
    sub = p.add_subparsers(dest='cmd', required=True)

    pa = sub.add_parser('audit', help='audit a markdown file for off-spec blocks')
    pa.add_argument('path', help='markdown file with ```text preview blocks')

    sub.add_parser('build', help='print canonical demo blocks to stdout')

    args = p.parse_args(argv)

    if args.cmd == 'audit':
        return 0 if audit(args.path) == 0 else 1
    if args.cmd == 'build':
        for name, body in demo_blocks().items():
            print(f"=== {name} ===")
            print(body)
            print()
        return 0
    return 2


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
