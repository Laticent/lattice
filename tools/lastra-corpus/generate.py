#!/usr/bin/env python3
"""
Generate lastra's decoder corpus and its oracle (engineering/decisions/2026-11-13-image-library.md §4).

    python3 -I tools/lastra-corpus/generate.py            # write the fixtures and expected.json
    python3 -I tools/lastra-corpus/generate.py --check    # regenerate in memory, exit 1 if anything differs

Every picture is drawn here from a fixed seed (gradients, texture, hard edges, text-like detail), so the
corpus is ours to license: no third-party photo is in it. The tests read only the committed files; CI
never needs Python.

PNG: written by this file's own encoder (every color type and bit depth, Adam7, every filter type, tRNS,
split IDAT, ancillary chunks), so the expected pixels are the ground truth the encoder was given. Pillow
decodes each file too, and the tool stops if Pillow disagrees with the ground truth, which proves the
encoder wrote what it meant to.

JPEG: written by Pillow (its bundled libjpeg-turbo), plus three sampling layouts Pillow cannot write
(4:4:0, 4:1:1, a 2x2/2x1/2x1 split) from ImageMagick's `convert`, and three byte-level edits of Pillow's
output (YCCK, no Huffman tables, Adobe RGB). The oracle is Pillow's decode: the SHA-256 of its RGBA, and
its pixels as a raw RGBA reference for the large files where a hash alone would hide how far off a
decode is.

Requires numpy, Pillow (with libjpeg-turbo) and, for three files, ImageMagick's `convert`.
"""

import hashlib
import io
import json
import os
import shutil
import struct
import subprocess
import sys
import tempfile
import zlib

import numpy as np
from PIL import Image, ImageDraw, ImageFont, features

SEED = 20261113
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'docs', 'src', 'lib', 'lastra', 'decode', 'fixtures')


# ── Content ──────────────────────────────────────────────────────────────────────────────────────────

def photo(w, h, seed):
    """A photo-like RGB picture: smooth color fields, grain, hard-edged shapes, thin lines and text."""
    rng = np.random.default_rng(seed)
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float64)
    u = xx / max(w - 1, 1)
    v = yy / max(h - 1, 1)
    base = np.empty((h, w, 3))
    for c in range(3):
        f1, f2, p = rng.uniform(0.5, 2.5), rng.uniform(0.5, 2.5), rng.uniform(0, 6.28)
        base[..., c] = 0.5 + 0.35 * np.sin(u * f1 * 3.14 + p) * np.cos(v * f2 * 3.14 - p) + 0.15 * (u - v)
    # Grain: coarse noise smoothed by a bilinear upscale, plus fine per-pixel noise.
    coarse = rng.normal(0, 0.08, (max(h // 6, 2), max(w // 6, 2), 3))
    up = np.stack([np.asarray(Image.fromarray(((coarse[..., c] + 0.5) * 255).clip(0, 255).astype(np.uint8)).resize((w, h), Image.BILINEAR), np.float64) / 255 - 0.5 for c in range(3)], -1)
    base += up + rng.normal(0, 0.025, (h, w, 3))
    im = Image.fromarray((base.clip(0, 1) * 255).round().astype(np.uint8), 'RGB')
    d = ImageDraw.Draw(im)
    for _ in range(max(2, (w * h) // 25000)):
        x0, y0 = rng.integers(0, w), rng.integers(0, h)
        x1, y1 = x0 + rng.integers(1, max(w // 3, 2)), y0 + rng.integers(1, max(h // 3, 2))
        fill = tuple(int(t) for t in rng.integers(0, 256, 3))
        if rng.random() < 0.5:
            d.ellipse([x0, y0, x1, y1], fill=fill)
        else:
            d.rectangle([x0, y0, x1, y1], fill=fill, outline=(0, 0, 0))
    for _ in range(max(1, (w * h) // 40000)):
        d.line([tuple(int(t) for t in rng.integers(0, max(w, h), 2)), tuple(int(t) for t in rng.integers(0, max(w, h), 2))], fill=(250, 250, 250), width=1)
    font = ImageFont.load_default_imagefont()
    words = ['Lattice', 'lastra', 'Q3 revenue 12.4%', 'AaBbGg 0123456789', 'boardroom']
    for i in range(max(1, (w * h) // 15000)):
        d.text((int(rng.integers(0, max(w - 40, 1))), int(rng.integers(0, max(h - 10, 1)))), words[i % len(words)], fill=(0, 0, 0) if i % 2 else (255, 255, 255), font=font)
    return im


# ── PNG encoder (ground truth) ───────────────────────────────────────────────────────────────────────

ADAM7 = [(0, 0, 8, 8), (4, 0, 8, 8), (0, 4, 4, 8), (2, 0, 4, 4), (0, 2, 2, 4), (1, 0, 2, 2), (0, 1, 1, 2)]
CHANNELS = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}


def chunk(kind, data):
    return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data) & 0xFFFFFFFF)


def pack_row(samples, depth):
    """One row of samples (1-D uint array) to bytes."""
    if depth == 16:
        return samples.astype('>u2').tobytes()
    if depth == 8:
        return samples.astype(np.uint8).tobytes()
    per = 8 // depth
    out = bytearray((len(samples) + per - 1) // per)
    for i, s in enumerate(samples):
        out[i // per] |= int(s) << (8 - depth * (i % per + 1))
    return bytes(out)


def paeth(a, b, c):
    p = a + b - c
    pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
    return a if pa <= pb and pa <= pc else b if pb <= pc else c


def filter_row(kind, row, prev, bpp):
    out = bytearray(len(row))
    for i in range(len(row)):
        a = row[i - bpp] if i >= bpp else 0
        b = prev[i]
        c = prev[i - bpp] if i >= bpp else 0
        pred = [0, a, b, (a + b) >> 1, paeth(a, b, c)][kind]
        out[i] = (row[i] - pred) & 0xFF
    return bytes([kind]) + bytes(out)


def encode_png(arr, color_type, depth, interlace=0, plte=None, trns=None, filters='cycle', idat_split=0, before_idat=(), seed=0):
    """arr: (h, w, channels) samples. filters: 'cycle' (row % 5), 'none', 'paeth', or 'adaptive' (least sum)."""
    h, w, ch = arr.shape
    bpp = max(1, ch * depth // 8)
    raw = bytearray()
    passes = ADAM7 if interlace else [(0, 0, 1, 1)]
    row_no = 0
    for (x0, y0, dx, dy) in passes:
        sub = arr[y0::dy, x0::dx]
        if sub.shape[0] == 0 or sub.shape[1] == 0:
            continue
        prev = bytes(len(pack_row(sub[0].reshape(-1), depth)))
        for r in range(sub.shape[0]):
            row = pack_row(sub[r].reshape(-1), depth)
            if filters == 'none':
                kind = 0
            elif filters == 'paeth':
                kind = 4
            elif filters == 'cycle':
                kind = (row_no + seed) % 5
            else:
                kind = min(range(5), key=lambda k: sum(min(x, 256 - x) for x in filter_row(k, row, prev, bpp)[1:]))
            raw += filter_row(kind, row, prev, bpp)
            prev = row
            row_no += 1
    z = zlib.compress(bytes(raw), 9)
    out = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, depth, color_type, 0, 0, interlace))
    for kind, data in before_idat:
        out += chunk(kind, data)
    if plte is not None:
        out += chunk(b'PLTE', bytes(plte))
    if trns is not None:
        out += chunk(b'tRNS', bytes(trns))
    step = idat_split or len(z)
    for i in range(0, len(z), step):
        out += chunk(b'IDAT', z[i:i + step])
    return out + chunk(b'IEND', b'')


def to8(s, depth):
    if depth == 16:
        return s >> 8
    return s * (255 // ((1 << depth) - 1))


def truth_rgba(arr, color_type, depth, plte=None, trns=None):
    """The RGBA lastra must produce: 16-bit by high byte, low depths scaled, tRNS keys on full samples."""
    h, w, _ = arr.shape
    a = arr.astype(np.int64)
    out = np.zeros((h, w, 4), np.uint8)
    out[..., 3] = 255
    if color_type == 0:
        g = to8(a[..., 0], depth)
        out[..., 0] = out[..., 1] = out[..., 2] = g
        if trns is not None:
            key = (trns[0] << 8) | trns[1]
            out[..., 3] = np.where(a[..., 0] == key, 0, 255)
    elif color_type == 2:
        for c in range(3):
            out[..., c] = to8(a[..., c], depth)
        if trns is not None:
            k = [(trns[2 * i] << 8) | trns[2 * i + 1] for i in range(3)]
            hit = (a[..., 0] == k[0]) & (a[..., 1] == k[1]) & (a[..., 2] == k[2])
            out[..., 3] = np.where(hit, 0, 255)
    elif color_type == 3:
        pal = np.zeros((256, 4), np.uint8)
        n = len(plte) // 3
        pal[:n, :3] = np.array(plte, np.uint8).reshape(n, 3)
        pal[:, 3] = 255
        if trns is not None:
            pal[:len(trns), 3] = np.array(trns, np.uint8)
        out[...] = pal[a[..., 0]]
    elif color_type == 4:
        g = to8(a[..., 0], depth)
        out[..., 0] = out[..., 1] = out[..., 2] = g
        out[..., 3] = to8(a[..., 1], depth)
    else:
        for c in range(4):
            out[..., c] = to8(a[..., c], depth)
    return out


def pillow_samples_agree(data, arr, color_type, depth, name):
    """Pillow reads the file back to the samples the encoder was given (to the precision Pillow keeps)."""
    im = Image.open(io.BytesIO(data))
    im.load()
    got = np.asarray(im)
    a = arr.astype(np.int64)
    if color_type == 3:
        want = a[..., 0]
    elif color_type == 0 and depth == 16:
        want = a[..., 0]
    elif color_type == 0:
        want = to8(a[..., 0], depth)
        if im.mode == '1':
            got = got.astype(np.int64) * 255
    elif depth == 16:
        want = a >> 8
    else:
        want = a
    if color_type == 4 and got.ndim == 3 and got.shape[2] == 4:
        want = np.stack([want[..., 0], want[..., 0], want[..., 0], want[..., 1]], -1)  # Pillow reads 16-bit LA as RGBA
    want = want.reshape(got.shape)
    if not np.array_equal(got.astype(np.int64), want):
        raise SystemExit(f'{name}: Pillow decodes different samples than the encoder wrote ({im.mode})')


def png_cases():
    rng = np.random.default_rng(SEED + 1)
    src = np.asarray(photo(37, 29, SEED + 2)).astype(np.int64)  # 37x29: odd, not a multiple of 8
    cases = []

    def samples(ct, depth, w=37, h=29):
        """Content for a color type and depth, from the photo where it fits, noise for the low bits."""
        s = src[:h, :w]
        hi = (1 << depth) - 1
        if ct == 3:
            return (s[..., :1] * (hi + 1) // 256).clip(0, hi)
        if depth == 16:
            lo = rng.integers(0, 256, s.shape)
            full = s * 256 + lo
        else:
            full = s * (hi + 1) // 256
        gray = (full[..., 0] * 3 + full[..., 1] * 5 + full[..., 2] * 2) // 10
        alpha = (np.arange(w)[None, :] * hi // max(w - 1, 1) + np.zeros((h, 1), np.int64))
        alpha[h // 2:] = hi - alpha[h // 2:]
        if ct == 0:
            return gray[..., None]
        if ct == 2:
            return full
        if ct == 4:
            return np.stack([gray, alpha], -1)
        return np.concatenate([full, alpha[..., None]], -1)

    def palette(depth):
        n = min(256, 1 << depth)
        p = rng.integers(0, 256, n * 3).tolist()
        return p

    for ct, depths in [(0, [1, 2, 4, 8, 16]), (2, [8, 16]), (3, [1, 2, 4, 8]), (4, [8, 16]), (6, [8, 16])]:
        for depth in depths:
            for interlace in (0, 1):
                arr = samples(ct, depth)
                plte = palette(depth) if ct == 3 else None
                cases.append((f'ct{ct}-d{depth}{"-adam7" if interlace else ""}', arr, ct, depth, dict(interlace=interlace, plte=plte, seed=depth + ct)))

    # tRNS: a gray key, an RGB key (both depths), a palette with partial alpha shorter than the palette.
    g8 = samples(0, 8)
    cases.append(('ct0-d8-trns', g8, 0, 8, dict(trns=[0, int(g8[3, 5, 0])])))
    g16 = samples(0, 16)
    k16 = int(g16[7, 7, 0])
    cases.append(('ct0-d16-trns-adam7', g16, 0, 16, dict(interlace=1, trns=[k16 >> 8, k16 & 255])))
    g2 = samples(0, 2)
    cases.append(('ct0-d2-trns', g2, 0, 2, dict(trns=[0, 1])))
    c8 = samples(2, 8)
    cases.append(('ct2-d8-trns', c8, 2, 8, dict(trns=[0, int(c8[0, 0, 0]), 0, int(c8[0, 0, 1]), 0, int(c8[0, 0, 2])])))
    c16 = samples(2, 16)
    kk = [int(t) for t in c16[10, 10]]
    cases.append(('ct2-d16-trns', c16, 2, 16, dict(trns=[kk[0] >> 8, kk[0] & 255, kk[1] >> 8, kk[1] & 255, kk[2] >> 8, kk[2] & 255])))
    p8 = samples(3, 8)
    pal = palette(8)
    cases.append(('ct3-d8-trns-adam7', p8, 3, 8, dict(interlace=1, plte=pal, trns=[int(t) for t in rng.integers(0, 256, 100)])))
    # A palette shorter than the indices used: those pixels are opaque black.
    p4 = samples(3, 4)
    cases.append(('ct3-d4-short-palette', p4, 3, 4, dict(plte=palette(4)[:30])))
    # Tiny and degenerate sizes, where Adam7 has empty passes.
    for (w, h) in [(1, 1), (2, 1), (1, 3), (3, 5), (9, 1)]:
        for interlace in (0, 1):
            arr = samples(6, 8, w, h)
            cases.append((f'tiny-{w}x{h}{"-adam7" if interlace else ""}', arr, 6, 8, dict(interlace=interlace)))
    # Filters: none, adaptive; IDAT split into 64-byte pieces; ancillary chunks lastra ignores.
    rgb = samples(2, 8)
    cases.append(('ct2-d8-filter-none', rgb, 2, 8, dict(filters='none')))
    cases.append(('ct2-d8-filter-adaptive', rgb, 2, 8, dict(filters='adaptive')))
    cases.append(('ct6-d8-split-idat', samples(6, 8), 6, 8, dict(idat_split=64)))
    # Uniform noise: every predictor sees every relation between its neighbors, Paeth's ties included
    # (a smooth picture almost never puts the upper-left sample exactly between the other two).
    noise = rng.integers(0, 256, (48, 64, 4))
    cases.append(('ct2-d8-noise-paeth', noise[..., :3], 2, 8, dict(filters='paeth')))
    cases.append(('ct6-d8-noise-cycle', noise, 6, 8, dict()))
    gama = struct.pack('>I', 45455)
    cases.append(('ct2-d8-ancillary', rgb, 2, 8, dict(before_idat=[(b'gAMA', gama), (b'sRGB', b'\x00'), (b'tEXt', b'Comment\x00made by lastra-corpus'), (b'pHYs', struct.pack('>IIB', 2835, 2835, 1))])))
    return cases


# ── JPEG cases ───────────────────────────────────────────────────────────────────────────────────────

def save_jpeg(im, **kw):
    b = io.BytesIO()
    im.save(b, 'JPEG', **kw)
    return b.getvalue()


def magick_jpeg(im, sampling, quality, progressive=False):
    exe = shutil.which('convert')
    if not exe:
        raise SystemExit('ImageMagick convert is required for the 4:4:0, 4:1:1 and 2x2/2x1/2x1 fixtures')
    with tempfile.TemporaryDirectory() as tmp:
        src = os.path.join(tmp, 'in.png')
        dst = os.path.join(tmp, 'out.jpg')
        im.save(src)
        args = [exe, src, '-strip', '-sampling-factor', sampling, '-quality', str(quality)]
        if progressive:
            args += ['-interlace', 'JPEG']
        subprocess.run(args + [dst], check=True)
        return open(dst, 'rb').read()


def segments(data):
    """(marker, start, end) for each marker segment before the first SOS."""
    out = []
    i = 2
    while i < len(data):
        m = data[i + 1]
        n = (data[i + 2] << 8) | data[i + 3]
        out.append((m, i, i + 2 + n))
        if m == 0xDA:
            break
        i += 2 + n
    return out


def strip_dht(data):
    out = bytearray(data[:2])
    last = 2
    for m, s, e in segments(data):
        if m == 0xC4:
            out += data[last:s]
            last = e
    return bytes(out + data[last:])


def set_adobe_transform(data, transform):
    for m, s, e in segments(data):
        if m == 0xEE and data[s + 4:s + 9] == b'Adobe':
            b = bytearray(data)
            b[s + 4 + 11] = transform
            return bytes(b)
    raise SystemExit('no Adobe segment to edit')


def jpeg_cases():
    big = photo(1001, 667, SEED + 10)
    mid = photo(257, 193, SEED + 11)
    odd = photo(7, 13, SEED + 12)
    one = photo(1, 1, SEED + 13)
    even = photo(64, 48, SEED + 14)
    cases = []
    add = lambda name, data: cases.append((name, data))
    for sub in ('4:4:4', '4:2:2', '4:2:0'):
        tag = sub.replace(':', '')
        add(f'mid-base-{tag}-q75', save_jpeg(mid, quality=75, subsampling=sub))
        add(f'mid-prog-{tag}-q75', save_jpeg(mid, quality=75, subsampling=sub, progressive=True))
        add(f'odd-base-{tag}', save_jpeg(odd, quality=80, subsampling=sub))
        add(f'one-base-{tag}', save_jpeg(one, quality=80, subsampling=sub))
    add('odd-prog-420', save_jpeg(odd, quality=80, subsampling='4:2:0', progressive=True))
    # Even sizes: the last column (and row) an upsampler writes is inside the picture, where an odd
    # size crops it away.
    add('even-base-420', save_jpeg(even, quality=80, subsampling='4:2:0'))
    add('even-base-422', save_jpeg(even, quality=80, subsampling='4:2:2'))
    add('even-prog-420', save_jpeg(even, quality=80, subsampling='4:2:0', progressive=True))
    add('even-base-440', magick_jpeg(even, '1x2', 80))
    add('one-prog-420', save_jpeg(one, quality=80, subsampling='4:2:0', progressive=True))
    for q in (30, 95):
        add(f'mid-base-420-q{q}', save_jpeg(mid, quality=q, subsampling='4:2:0'))
        add(f'mid-prog-420-q{q}', save_jpeg(mid, quality=q, subsampling='4:2:0', progressive=True))
    add('mid-base-420-optimized', save_jpeg(mid, quality=75, subsampling='4:2:0', optimize=True))
    add('mid-base-420-restart-mcu5', save_jpeg(mid, quality=75, subsampling='4:2:0', restart_marker_blocks=5))
    add('mid-prog-420-restart-row', save_jpeg(mid, quality=75, subsampling='4:2:0', progressive=True, restart_marker_rows=1))
    add('mid-base-444-restart-mcu1', save_jpeg(mid, quality=75, subsampling='4:4:4', restart_marker_blocks=1))
    gray = mid.convert('L')
    add('mid-gray-base', save_jpeg(gray, quality=75))
    add('mid-gray-prog', save_jpeg(gray, quality=75, progressive=True))
    add('odd-gray-base', save_jpeg(odd.convert('L'), quality=75))
    add('one-gray-prog', save_jpeg(one.convert('L'), quality=75, progressive=True))
    add('mid-base-440-q75', magick_jpeg(mid, '1x2', 75))
    add('odd-base-440', magick_jpeg(odd, '1x2', 80))
    add('mid-prog-440-q75', magick_jpeg(mid, '1x2', 75, progressive=True))
    add('mid-base-411-q75', magick_jpeg(mid, '4x1', 75))
    add('mid-base-y22-c21-q75', magick_jpeg(mid, '2x2,2x1,2x1', 75))
    add('mid-rgb-adobe0', save_jpeg(mid, quality=90, keep_rgb=True))
    cmyk = mid.convert('CMYK')
    add('mid-cmyk', save_jpeg(cmyk, quality=85))
    add('mid-ycck', set_adobe_transform(save_jpeg(cmyk, quality=85), 2))
    add('mid-base-420-no-dht', strip_dht(save_jpeg(mid, quality=75, subsampling='4:2:0')))
    add('big-base-420-q75', save_jpeg(big, quality=75, subsampling='4:2:0'))
    add('big-prog-444-q90', save_jpeg(big, quality=90, subsampling='4:4:4', progressive=True))
    return cases


def pillow_rgba(data):
    im = Image.open(io.BytesIO(data))
    im.load()
    mode = im.mode
    rgba = im.convert('RGB').convert('RGBA') if mode == 'CMYK' else im.convert('RGBA')
    return mode, np.asarray(rgba)


def sha(a):
    return hashlib.sha256(np.ascontiguousarray(a, np.uint8).tobytes()).hexdigest()


# ── Main ─────────────────────────────────────────────────────────────────────────────────────────────

def build():
    files = {}
    expected = {
        'generator': 'tools/lastra-corpus/generate.py',
        'seed': SEED,
        'pillow': Image.__version__,
        'libjpegTurbo': features.version('libjpeg_turbo'),
        'png': {},
        'jpeg': {},
    }
    for name, arr, ct, depth, kw in png_cases():
        data = encode_png(arr, ct, depth, **kw)
        pillow_samples_agree(data, arr, ct, depth, name)
        truth = truth_rgba(arr, ct, depth, kw.get('plte'), kw.get('trns'))
        files[f'png/{name}.png'] = data
        expected['png'][f'{name}.png'] = {'width': arr.shape[1], 'height': arr.shape[0], 'rgbaSha256': sha(truth)}
    for name, data in jpeg_cases():
        mode, rgba = pillow_rgba(data)
        files[f'jpeg/{name}.jpg'] = data
        entry = {'width': rgba.shape[1], 'height': rgba.shape[0], 'pillowMode': mode, 'rgbaSha256': sha(rgba)}
        expected['jpeg'][f'{name}.jpg'] = entry
    files['expected.json'] = (json.dumps(expected, indent=2) + '\n').encode()
    return files


def main():
    check = '--check' in sys.argv
    files = build()
    drift = []
    for rel, data in sorted(files.items()):
        path = os.path.join(OUT, rel)
        old = open(path, 'rb').read() if os.path.exists(path) else None
        if old != data:
            drift.append(rel)
            if not check:
                os.makedirs(os.path.dirname(path), exist_ok=True)
                with open(path, 'wb') as f:
                    f.write(data)
    total = sum(len(d) for d in files.values())
    print(f'{len(files)} files, {total} bytes; {len(drift)} {"differ" if check else "written"}')
    for rel in drift:
        print('  ' + rel)
    if check and drift:
        sys.exit(1)


if __name__ == '__main__':
    main()
