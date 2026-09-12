# Generates the prototype's finish rule block: every ENCODING and every REGISTER
# gets a body under every finish. Nothing is exempt — an exemption is what made
# 6 of 11 members render identically under all three finishes.
SLOTS = range(1, 9)
# tone: one hue, eight value steps (the ramp the tone key already publishes)
TONE = [92, 76, 61, 47, 34, 22, 14, 9]
# tone, compressed for a mark that CARRIES TEXT — same order, quiet enough to
# keep --text-body over it above 4.5:1. Verified by measure-finish-contrast.mjs.
TONE_TEXT = [30, 27, 24, 21, 18, 15, 12, 9]
TONE_TEXT_D = [35, 31, 28, 24, 21, 17, 14, 10]

F = {
  'pigment': dict(
    body=('82%', '82%'),          # full strength, flat
    backdrop=('40%', '46%'),      # quiet enough to carry text, still a real hue
    ramp=('16%', '0.54'),         # lo + --mix * k
    presence=('40%', '46%'),
    layered_alpha='0.55',
    edge=1, edge_backdrop=1, textured='1',
    tone=None),
  'etching': dict(
    body=('30%', '40%'),          # retreats to a whisper; the edge carries identity
    backdrop=('14%', '19%'),
    ramp=('6%', '0.24'),
    presence=('14%', '19%'),
    layered_alpha='0.18',
    edge=2, edge_backdrop=3, textured='0.42',
    tone=None),
  'tone': dict(
    body=None,                    # value, not hue — per-slot steps below
    backdrop=None,
    ramp=('10%', '0.82'),
    presence=None,
    layered_alpha='0.5',
    edge=1, edge_backdrop=2.5, textured='0.8',
    tone=True),
}

def ld(a, b):
    return f'light-dark({a},{b})' if a != b else a

def mix(hue, pct, base='var(--chart-cat-base)'):
    return f'color-mix(in oklab,{hue} {pct},{base})'

out = []
w = out.append

for name, f in F.items():
    S = f'.pv-stage[data-finish="{name}"]'
    w(f'\n/* ══ {name.upper()} ' + '═' * (62 - len(name)) + ' */')

    w(f'\n/* textured marks keep the finish\'s alpha, never its body */')
    w(f'{S} [data-textured]{{fill-opacity:{f["textured"]}!important;}}')

    # ── HUE, register=mark ────────────────────────────────────────────────
    w(f'\n/* HUE / mark — the body a finish is named for */')
    for i in SLOTS:
        h, ink = f'var(--chart-cat-{i}-hue)', f'var(--chart-cat-{i}-ink)'
        if f['tone']:
            b = mix(f'var(--chart-cat-1-hue)', f'{TONE[i-1]}%')
            e = 'var(--chart-cat-1-ink)'
        else:
            b = ld(mix(h, f['body'][0]), mix(h, f['body'][1]))
            e = ink
        sel = f'{S} [data-slot="{i}"][data-fill="hue"]:not([data-textured]):not([data-register="backdrop"])'
        w(f'{sel}[data-paint="fill"]{{fill:{b}!important;stroke:{e}!important;stroke-width:{f["edge"]}!important;}}')
        w(f'{sel}[data-paint="bg"]{{background:{b}!important;border:{f["edge"]}px solid {e}!important;}}')
    # the status slot carries its own hue on the element
    b = mix('var(--chart-cat-1-hue)', f'{TONE[0]}%') if f['tone'] else ld(mix('var(--slot-hue)', f['body'][0]), mix('var(--slot-hue)', f['body'][1]))
    sel = f'{S} [data-slot="s"][data-fill="hue"]:not([data-textured]):not([data-register="backdrop"])'
    w(f'{sel}[data-paint="fill"]{{fill:{b}!important;stroke:var(--slot-hue)!important;stroke-width:{f["edge"]}!important;}}')
    w(f'{sel}[data-paint="bg"]{{background:{b}!important;border:{f["edge"]}px solid var(--slot-hue)!important;}}')

    # ── HUE, register=backdrop (a mark that CARRIES TEXT) ─────────────────
    w(f'\n/* HUE / backdrop — the mark carries text, so the body sits at the')
    w(f'   register\'s quiet level. It still MOVES with the finish: exempting it')
    w(f'   is what made gantt, progress and matrix-grid identical in all three. */')
    for i in SLOTS:
        h, ink = f'var(--chart-cat-{i}-hue)', f'var(--chart-cat-{i}-ink)'
        if f['tone']:
            b = ld(mix('var(--chart-cat-1-hue)', f'{TONE_TEXT[i-1]}%'), mix('var(--chart-cat-1-hue)', f'{TONE_TEXT_D[i-1]}%'))
            e = 'var(--chart-cat-1-ink)'
        else:
            b = ld(mix(h, f['backdrop'][0]), mix(h, f['backdrop'][1]))
            e = ink
        sel = f'{S} [data-slot="{i}"][data-register="backdrop"]:not([data-textured])'
        w(f'{sel}[data-paint="fill"]{{fill:{b}!important;stroke:{e}!important;stroke-width:{f["edge_backdrop"]}!important;}}')
        w(f'{sel}[data-paint="bg"]{{background:{b}!important;border:{f["edge_backdrop"]}px solid {e}!important;}}')
    # TONE: the body joins the one hue like every other mark; the STATUS stays
    # legible on the edge, which is its own semantic ink. Leaving the body on
    # --slot-hue made gantt and progress the only multi-hue cards under a finish
    # whose whole claim is one hue in shades.
    b = ld(mix('var(--chart-cat-1-hue)', f'{TONE_TEXT[0]}%'), mix('var(--chart-cat-1-hue)', f'{TONE_TEXT_D[0]}%')) if f['tone'] else ld(mix('var(--slot-hue)', f['backdrop'][0]), mix('var(--slot-hue)', f['backdrop'][1]))
    sel = f'{S} [data-slot="s"][data-register="backdrop"]:not([data-textured])'
    w(f'{sel}[data-paint="fill"]{{fill:{b}!important;stroke:var(--slot-hue)!important;stroke-width:{f["edge_backdrop"]}!important;}}')
    w(f'{sel}[data-paint="bg"]{{background:{b}!important;background-image:none!important;border:{f["edge_backdrop"]}px solid var(--slot-hue)!important;}}')

    # ── RAMP ──────────────────────────────────────────────────────────────
    lo, k = f['ramp']
    rh = 'var(--chart-cat-1-hue)'
    w(f'\n/* RAMP — a magnitude, so the finish SCALES the band rather than')
    w(f'   replacing it. --mix stays the datum; lo and the span are the finish. */')
    w(f'{S} [data-fill="ramp"][data-paint="fill"]{{fill:{mix(rh, f"calc({lo} + var(--mix) * {k})")}!important;'
      f'stroke:{"var(--bg)" if name != "etching" else "color-mix(in oklab,var(--chart-cat-1-ink) 75%,transparent)"}!important;'
      f'stroke-width:{0.6 if name != "etching" else 1}!important;}}')
    w(f'{S} [data-fill="ramp"][data-paint="bg"]{{background:{mix(rh, f"calc({lo} + var(--mix) * {k})")}!important;background-image:none!important;}}')

    # ── PRESENCE ──────────────────────────────────────────────────────────
    w(f'\n/* PRESENCE — on/off. The finish sets what "on" looks like; "off" is')
    w(f'   the edge alone under every finish, which is what makes it readable. */')
    for i in SLOTS:
        h, ink = f'var(--chart-cat-{i}-hue)', f'var(--chart-cat-{i}-ink)'
        if f['tone']:
            b = ld(mix('var(--chart-cat-1-hue)', f'{TONE_TEXT[i-1]}%'), mix('var(--chart-cat-1-hue)', f'{TONE_TEXT_D[i-1]}%'))
            e = 'var(--chart-cat-1-ink)'
        else:
            b = ld(mix(h, f['presence'][0]), mix(h, f['presence'][1]))
            e = ink
        sel = f'{S} [data-slot="{i}"][data-fill="presence"]'
        w(f'{sel}[data-paint="bg"]{{background:{b}!important;background-image:none!important;'
          f'border:{f["edge_backdrop"]}px solid {e}!important;}}')
        w(f'{sel}[data-paint="fill"]{{fill:{b}!important;stroke:{e}!important;stroke-width:{f["edge_backdrop"]}!important;}}')

    # ── LAYERED ───────────────────────────────────────────────────────────
    w(f'\n/* LAYERED — translucent and composited, so the body is a FLAT alpha of')
    w(f'   the series hue. A gradient here reads as a fourth colour where two')
    w(f'   polygons cross, which is the defect the layered register exists for. */')
    for i in SLOTS:
        h = 'var(--chart-cat-1-hue)' if f['tone'] else f'var(--chart-cat-{i}-hue)'
        a = f['layered_alpha']
        if f['tone']:
            src = mix(h, f'{TONE[i-1]}%')
            a = f'{round(0.20 + 0.40 * (TONE[i-1] / 92), 3)}'
        else:
            src = ld(mix(h, f['body'][0]), mix(h, f['body'][1]))
        w(f'{S} [data-slot="{i}"][data-fill="layered"]{{'
          f'fill:{src}!important;fill-opacity:{a}!important;'
          f'stroke:{"var(--chart-cat-1-ink)" if f["tone"] else f"var(--chart-cat-{i}-ink)"}!important;'
          f'stroke-width:{f["edge"] + (1 if name == "etching" else 0.5)}!important;}}')

    w(f'\n/* The quadrant ZONE tints are furniture, not marks — but they are')
    w(f'   coloured, so a finish that leaves them alone leaves four pastel')
    w(f'   rectangles behind whatever it just did to the dots. */')
    for c in range(8):
        if f['tone']:
            zb = mix('var(--chart-cat-1-hue)', f'{TONE[c]}%')
        else:
            zb = ld(mix(f'var(--chart-cat-{c+1}-hue)', f['presence'][0]), mix(f'var(--chart-cat-{c+1}-hue)', f['presence'][1]))
        w(f'{S} .quadrant-tint[data-cell="{c}"]{{fill:{zb}!important;fill-opacity:{".5" if not f["tone"] else ".38"}!important;}}')

    if f['tone']:
        w(f'\n/* A NAME CANNOT WEAR A VALUE STEP. Under tone the mark\'s LIGHTNESS is')
        w(f'   the identity, so a label cannot also carry one — its colour is spoken')
        w(f'   for by its contrast with the canvas. Every naming element goes neutral. */')
        w(f'{S} :is(.cart-series,.sbar-name,.slope-name,.chart-key-label){{fill:var(--text-body)!important;}}')
        for i in SLOTS:
            w(f'{S} .chart-key-swatch[data-cat="{i-1}"]{{fill:{mix("var(--chart-cat-1-hue)", f"{TONE[i-1]}%")}!important;'
              f'stroke:var(--chart-cat-1-ink)!important;}}')

print('\n'.join(out))
