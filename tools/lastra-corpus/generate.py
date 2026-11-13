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
import random
import shutil
import struct
import subprocess
import sys
import tempfile
import zlib

import numpy as np
from PIL import Image, ImageDraw, ImageFont, features

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from icc import ADOBE_RGB, DISPLAY_P3  # noqa: E402

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


def encode_png(arr, color_type, depth, interlace=0, plte=None, trns=None, filters='cycle', idat_split=0, before_idat=(), seed=0,
               trns_bytes=None, trns_where='after-plte', after_idat=(), extra_raw=b'', zlib_tail=b'', adler='good'):
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
    z = zlib.compress(bytes(raw) + extra_raw, 9)
    if adler == 'bad':
        z = z[:-1] + bytes([z[-1] ^ 0x5A])
    elif adler == 'none':
        z = z[:-4]
    z += zlib_tail
    written = bytes(trns_bytes) if trns_bytes is not None else (bytes(trns) if trns is not None else None)
    out = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, depth, color_type, 0, 0, interlace))
    for kind, data in before_idat:
        out += chunk(kind, data)
    if written is not None and trns_where == 'before-plte':
        out += chunk(b'tRNS', written)
    if plte is not None:
        out += chunk(b'PLTE', bytes(plte))
    if written is not None and trns_where in ('after-plte', 'twice'):
        out += chunk(b'tRNS', written)
    if trns_where == 'twice':
        out += chunk(b'tRNS', bytes(len(written)))
    step = idat_split or len(z)
    for i in range(0, len(z), step):
        out += chunk(b'IDAT', z[i:i + step])
    if written is not None and trns_where == 'after-idat':
        out += chunk(b'tRNS', written)
    for kind, data in after_idat:
        out += chunk(kind, data)
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
            key = ((trns[0] << 8) | trns[1]) & (0xFFFF if depth == 16 else (1 << depth) - 1)  # png_do_expand masks it
            out[..., 3] = np.where(a[..., 0] == key, 0, 255)
    elif color_type == 2:
        for c in range(3):
            out[..., c] = to8(a[..., c], depth)
        if trns is not None:
            k = [((trns[2 * i] << 8) | trns[2 * i + 1]) & (0xFFFF if depth == 16 else 0xFF) for i in range(3)]
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
    cases.append(('ct2-d8-ancillary', rgb, 2, 8, dict(before_idat=[(b'gAMA', gama), (b'sRGB', b'\x00'), (b'tEXt', b'Comment\x00made by lastra-corpus'), (b'pHYs', struct.pack('>IIB', 2835, 2835, 1))], tags=['gama', 'srgb'])))

    # libpng's tRNS policy (lastra's): a misplaced, repeated or wrongly sized tRNS is ignored, and a key is
    # masked to the bit depth. `trns` is what applies (the truth); `trns_bytes` is what the file says.
    pal2 = [255, 0, 0, 0, 255, 0]
    idx = np.array([[[(x + y) % 2] for x in range(4)] for y in range(2)])
    cases.append(('edge-trns-before-plte', idx, 3, 8, dict(plte=pal2, trns_bytes=[0, 0], trns_where='before-plte')))
    cases.append(('edge-trns-after-idat', idx, 3, 8, dict(plte=pal2, trns_bytes=[0, 0], trns_where='after-idat')))
    cases.append(('edge-trns-longer-than-plte', idx, 3, 8, dict(plte=pal2, trns_bytes=[0, 0, 0, 0])))
    cases.append(('edge-trns-twice', idx, 3, 8, dict(plte=pal2, trns=[0, 128], trns_where='twice')))
    g8 = np.array([[[v] for v in (0, 1, 2, 3)]])
    cases.append(('edge-gray8-trns-length3', g8, 0, 8, dict(trns_bytes=[0, 1, 9])))
    cases.append(('edge-gray8-key-0x0101', g8, 0, 8, dict(trns=[1, 1])))
    g2 = np.array([[[v] for v in (0, 1, 2, 3)]])
    cases.append(('edge-gray2-key-257', g2, 0, 2, dict(trns=[1, 1])))
    rgb2 = np.array([[[1, 2, 3], [4, 5, 6]]])
    cases.append(('edge-rgb8-key-masked', rgb2, 2, 8, dict(trns=[0x11, 4, 0x22, 5, 0x33, 6])))
    cases.append(('edge-rgba-with-trns', samples(6, 8, 3, 2), 6, 8, dict(trns_bytes=[0] * 6)))
    cases.append(('edge-plte-in-rgb', rgb2, 2, 8, dict(before_idat=[(b'PLTE', bytes(pal2))])))
    # Image data past what the header needs: extra scanline bytes, and bytes after the zlib stream.
    cases.append(('edge-extra-inflated', samples(2, 8, 9, 7), 2, 8, dict(extra_raw=bytes(range(200)))))
    cases.append(('edge-zlib-trailing-bytes', samples(2, 8, 9, 7), 2, 8, dict(zlib_tail=b'trailing bytes after the zlib stream')))
    # The Adler-32 wrong, and missing: the engines once disagreed on these through DecompressionStream.
    cases.append(('edge-zlib-bad-adler', samples(2, 8, 9, 7), 2, 8, dict(adler='bad', pillow=False)))
    cases.append(('edge-zlib-no-adler', samples(2, 8, 9, 7), 2, 8, dict(adler='none', pillow=False)))

    # Color-tagged files: the pixels decode as stored; the profile and the tags come back.
    photo_rgb = np.asarray(photo(48, 32, SEED + 30)).astype(np.int64)
    iccp = lambda name, prof: (b'iCCP', name + b'\x00\x00' + zlib.compress(prof, 9))
    cases.append(('tagged-display-p3-iccp', photo_rgb, 2, 8, dict(before_idat=[iccp(b'Display P3', DISPLAY_P3)], tags=['iccp'], icc=DISPLAY_P3)))
    cases.append(('tagged-adobe-rgb-iccp', photo_rgb, 2, 8, dict(before_idat=[iccp(b'Adobe RGB', ADOBE_RGB)], tags=['iccp'], icc=ADOBE_RGB)))
    chrm = struct.pack('>8I', 31270, 32900, 64000, 33000, 30000, 60000, 15000, 6000)
    cases.append(('tagged-srgb-gama-chrm', photo_rgb, 2, 8, dict(before_idat=[(b'sRGB', b'\x00'), (b'gAMA', struct.pack('>I', 45455)), (b'cHRM', chrm)], tags=['srgb', 'gama', 'chrm'])))
    cases.append(('tagged-p3-cicp', photo_rgb, 2, 8, dict(before_idat=[(b'cICP', bytes([12, 13, 0, 1]))], tags=['cicp'])))
    cases.append(('tagged-gama-only-1.0', photo_rgb, 2, 8, dict(before_idat=[(b'gAMA', struct.pack('>I', 100000))], tags=['gama'])))
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


def mpo(primary, second, icc=None):
    b = io.BytesIO()
    kw = {'icc_profile': icc} if icc else {}
    primary.save(b, 'MPO', save_all=True, append_images=[second], quality=90, **kw)
    return b.getvalue()


ULTRA_HDR_XMP_PRIMARY = (
    '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">'
    '<rdf:Description xmlns:Container="http://ns.google.com/photos/1.0/container/" '
    'xmlns:Item="http://ns.google.com/photos/1.0/container/item/" xmlns:hdrgm="http://ns.adobe.com/hdr-gain-map/1.0/" '
    'hdrgm:Version="1.0"><Container:Directory><rdf:Seq>'
    '<rdf:li rdf:parseType="Resource"><Container:Item Item:Semantic="Primary" Item:Mime="image/jpeg"/></rdf:li>'
    '<rdf:li rdf:parseType="Resource"><Container:Item Item:Semantic="GainMap" Item:Mime="image/jpeg" Item:Length="0"/></rdf:li>'
    '</rdf:Seq></Container:Directory></rdf:Description></rdf:RDF></x:xmpmeta>'
)
ULTRA_HDR_XMP_GAIN = (
    '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">'
    '<rdf:Description xmlns:hdrgm="http://ns.adobe.com/hdr-gain-map/1.0/" hdrgm:Version="1.0" '
    'hdrgm:GainMapMin="0" hdrgm:GainMapMax="2.0" hdrgm:Gamma="1" hdrgm:OffsetSDR="0.015625" '
    'hdrgm:OffsetHDR="0.015625" hdrgm:HDRCapacityMin="0" hdrgm:HDRCapacityMax="2.0" hdrgm:BaseRenditionIsHDR="False"/>'
    '</rdf:RDF></x:xmpmeta>'
)


def ultra_hdr(primary, icc, exif):
    """An Ultra HDR-shaped JPEG: XMP with the hdrgm container, MPF, a gray gain map as the second picture."""
    gain = primary.convert('L').resize((primary.width // 4, primary.height // 4))
    b = io.BytesIO()
    primary.save(b, 'MPO', save_all=True, append_images=[gain], quality=90, icc_profile=icc, exif=exif, xmp=ULTRA_HDR_XMP_PRIMARY.encode())
    data = b.getvalue()
    # Put the gain map's own XMP on the second picture, after its SOI, and grow picture 2's size in the
    # MPF index by the inserted bytes (its offset does not move).
    first_eoi = data.index(b'\xff\xd8', 2)
    seg = b'http://ns.adobe.com/xap/1.0/\x00' + ULTRA_HDR_XMP_GAIN.encode()
    app1 = b'\xff\xe1' + struct.pack('>H', len(seg) + 2) + seg
    out = bytearray(data[:first_eoi + 2] + app1 + data[first_eoi + 2:])
    mpf = out.index(b'MPF\x00') + 4
    big = out[mpf:mpf + 2] == b'MM'
    u16 = lambda o: struct.unpack('>H' if big else '<H', out[mpf + o:mpf + o + 2])[0]
    u32 = lambda o: struct.unpack('>I' if big else '<I', out[mpf + o:mpf + o + 4])[0]
    ifd = u32(4)
    for i in range(u16(ifd)):
        e = ifd + 2 + 12 * i
        if u16(e) == 0xB002:
            entry2 = u32(e + 8) + 16
            out[mpf + entry2 + 4:mpf + entry2 + 8] = struct.pack('>I' if big else '<I', u32(entry2 + 4) + len(app1))
    return bytes(out)


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


def damaged_jpeg_cases():
    """
    Damaged and partial files, each with the oracle that applies (the third item):
    - 'pillow': Pillow's decode, as for every other fixture.
    - 'pillow-with-eoi': the file ends early without EOI. Pillow refuses every such file; libjpeg (and
      lastra, once a scan is whole) reads the end of the file as EOI, so the oracle is Pillow's decode of
      the same bytes with FF D9 appended.
    - 'pillow-c': libjpeg-turbo's C code (Pillow run with JSIMD_FORCENONE=1). Used where the dequantized
      coefficients pass 16 bits, which the SIMD code (Pillow's default, and the browsers') handles
      differently from the C reference lastra follows.
    """
    mid = photo(96, 64, SEED + 40)
    out = []
    rst_file = save_jpeg(mid, quality=80, subsampling='4:2:0', restart_marker_blocks=2)
    sos_end = [e for m, s_, e in segments(rst_file) if m == 0xDA][0]
    rst = [j for j in range(sos_end, len(rst_file) - 1) if rst_file[j] == 0xFF and 0xD0 <= rst_file[j + 1] <= 0xD7]
    a, b2 = rst[3], rst[4]
    out.append(('damaged-rst-dropped', rst_file[:a] + rst_file[b2:], 'pillow'))  # one RST and its interval gone
    out.append(('damaged-rst-doubled', rst_file[:a] + rst_file[a:a + 2] + rst_file[a:], 'pillow'))
    behind = bytearray(rst_file)
    behind[a + 1] = 0xD0 + ((behind[a + 1] - 0xD0 - 2) & 7)
    out.append(('damaged-rst-two-behind', bytes(behind), 'pillow'))
    ahead = bytearray(rst_file)
    ahead[a + 1] = 0xD0 + ((ahead[a + 1] - 0xD0 + 1) & 7)
    out.append(('damaged-rst-one-ahead', bytes(ahead), 'pillow'))
    far = bytearray(rst_file)
    far[a + 1] = 0xD0 + ((far[a + 1] - 0xD0 + 4) & 7)
    out.append(('damaged-rst-four-ahead', bytes(far), 'pillow'))
    out.append(('damaged-junk-before-rst', rst_file[:a] + bytes([0x12, 0x34, 0x56]) + rst_file[a:], 'pillow'))
    out.append(('damaged-interval-short', rst_file[:a - 6] + rst_file[a:], 'pillow'))
    # Bytes that match no Huffman code (all ones), inside the first interval: libjpeg consumes 17 bits each.
    # Runs of one-bits (stuffed FF 00 pairs) match no Huffman code: libjpeg consumes 17 bits for each.
    bad = rst_file[:sos_end + 8] + b'\xff\x00' * 4 + rst_file[sos_end + 8:]
    out.append(('damaged-bad-huffman-codes', bad, 'pillow'))
    # A baseline scan cut by an EOI in the middle: the rest of the scan stays mid-gray.
    base = save_jpeg(mid, quality=80, subsampling='4:2:0')
    sos_b = [e for m, s_, e in segments(base) if m == 0xDA][0]
    out.append(('damaged-eoi-mid-scan', base[:sos_b + (len(base) - sos_b) // 2] + b'\xff\xd9', 'pillow'))
    # Progressive files whose last scans never came (EOI kept): libjpeg's block smoothing fills them in.
    prog = save_jpeg(mid, quality=80, subsampling='4:2:0', progressive=True)
    starts = [j for j in range(len(prog) - 1) if prog[j] == 0xFF and prog[j + 1] == 0xDA]
    for keep in (1, 3, 6, 9):
        out.append((f'partial-prog-keep{keep}of{len(starts)}', prog[:starts[keep]] + b'\xff\xd9', 'pillow'))
    gray = save_jpeg(mid.convert('L'), quality=80, progressive=True)
    gs = [j for j in range(len(gray) - 1) if gray[j] == 0xFF and gray[j + 1] == 0xDA]
    out.append((f'partial-gray-keep2of{len(gs)}', gray[:gs[2]] + b'\xff\xd9', 'pillow'))
    # Files that end with no EOI: at a scan boundary, and inside a later scan.
    out.append(('cut-prog-at-scan-boundary', prog[:starts[5]], 'pillow-with-eoi'))
    out.append(('cut-prog-inside-scan', prog[:starts[5] + (starts[6] - starts[5]) // 2], 'pillow-with-eoi'))
    out.append(('cut-base-no-eoi-only', base[:-2], 'pillow-with-eoi'))
    # A quantization table redefined before the first scan with values that push coefficients past 16 bits.
    dqt = b'\xff\xdb\x00\x43\x00' + bytes([99] * 64) + b'\xff\xdb\x00\x43\x01' + bytes([3] * 64)
    out.append(('overflow-dqt-before-first-scan', prog[:starts[0]] + dqt + prog[starts[0]:], 'pillow-c'))
    # 16-bit tables over 32767: libjpeg-turbo stores them as `short` (they turn negative), and the IDCT's
    # sums pass 2^31, where its 64-bit JLONG keeps what 32 bits would lose.
    dqt16 = b'\xff\xdb\x00\x83\x10' + struct.pack('>64H', *([40000] * 6 + [65000] * 10 + [30000] * 48)) + b'\xff\xdb\x00\x83\x11' + struct.pack('>64H', *([50000] * 64))
    out.append(('overflow-dqt16-large-values', insert_before_sof(base, dqt16), 'pillow-c'))
    return out


def insert_before_sof(data, extra):
    sof = [st for m, st, e in segments(data) if m in (0xC0, 0xC1, 0xC2)][0]
    return data[:sof] + extra + data[sof:]


def pillow_c_rgba(data):
    """Pillow's decode through libjpeg-turbo's C code: a subprocess with SIMD switched off."""
    code = 'import sys,io;from PIL import Image;im=Image.open(io.BytesIO(sys.stdin.buffer.read()));im.load();sys.stdout.buffer.write(im.convert("RGBA").tobytes())'
    env = dict(os.environ, JSIMD_FORCENONE='1')
    raw = subprocess.run([sys.executable, '-I', '-c', code], input=data, capture_output=True, check=True, env=env).stdout
    im = Image.open(io.BytesIO(data))
    return np.frombuffer(raw, np.uint8).reshape(im.height, im.width, 4)


def jpegtran(src, script):
    """Re-encode `src` losslessly with a custom progressive scan script (jpegtran -scans)."""
    exe = shutil.which('jpegtran')
    if not exe:
        raise SystemExit('jpegtran (libjpeg-turbo-progs) is required for the custom-scan fixtures')
    with tempfile.TemporaryDirectory() as tmp:
        a, sf, out = (os.path.join(tmp, n) for n in ('in.jpg', 'scans.txt', 'out.jpg'))
        open(a, 'wb').write(src)
        open(sf, 'w').write(script)
        subprocess.run([exe, '-scans', sf, '-outfile', out, a], check=True)
        return open(out, 'rb').read()


def jpegtran_cases():
    """Legal progressive files from stock jpegtran scan scripts with many scans: each must decode."""
    gray = save_jpeg(photo(160, 120, SEED + 60).convert('L'), quality=90)
    color = save_jpeg(photo(160, 120, SEED + 61), quality=90, subsampling='4:4:4')
    per_coef = '0: 0 0 0 0;\n' + ''.join(f'0: {k} {k} 0 0;\n' for k in range(1, 64))
    pairs = '0,1,2: 0 0 0 0;\n' + ''.join(f'{c}: {k} {min(k + 1, 63)} 0 0;\n' for c in range(3) for k in range(1, 64, 2))
    band_sa = ('0: 0 0 0 0;\n' + ''.join(f'0: {b} {b + 3} 0 3;\n' for b in range(1, 61, 4)) + '0: 61 63 0 3;\n'
               + ''.join(f'0: {b} {b + 3} {a} {a - 1};\n' for a in (3, 2, 1) for b in range(1, 61, 4)) + ''.join(f'0: 61 63 {a} {a - 1};\n' for a in (3, 2, 1)))
    # jpegtran takes at most 100 scans: the 32 lowest coefficients alone, each refined once, the rest as a band.
    deep = ('0: 0 0 0 2;\n0: 0 0 2 1;\n0: 0 0 1 0;\n' + ''.join(f'0: {k} {k} 0 1;\n' for k in range(1, 33)) + '0: 33 63 0 1;\n'
            + ''.join(f'0: {k} {k} 1 0;\n' for k in range(1, 33)) + '0: 33 63 1 0;\n')
    return [
        ('jpegtran-gray-64-scans-one-coefficient', jpegtran(gray, per_coef)),
        ('jpegtran-444-97-scans-pairs', jpegtran(color, pairs)),
        ('jpegtran-gray-65-scans-bands-refined', jpegtran(gray, band_sa)),
        ('jpegtran-gray-69-scans-refined', jpegtran(gray, deep)),
    ]


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
    # Phone-shaped files: wide-gamut profiles, an EXIF rotation, an MPF second picture, an Ultra HDR
    # gain map. lastra decodes the primary picture as stored and returns the profile.
    phone = photo(96, 64, SEED + 31)
    exif = Image.Exif()
    exif[0x0112] = 6
    exif[0x010F] = 'lastra-corpus'
    add('phone-display-p3', save_jpeg(phone, quality=90, subsampling='4:2:0', icc_profile=DISPLAY_P3))
    add('phone-adobe-rgb', save_jpeg(phone, quality=90, subsampling='4:2:0', icc_profile=ADOBE_RGB))
    add('phone-exif-orientation-6', save_jpeg(phone, quality=90, subsampling='4:2:0', exif=exif.tobytes()))
    add('phone-mpf-two-pictures', mpo(phone, phone.resize((48, 32)).convert('RGB'), icc=DISPLAY_P3))
    add('phone-ultra-hdr-gain-map', ultra_hdr(phone, DISPLAY_P3, exif.tobytes()))
    big_icc = (DISPLAY_P3 + bytes(70000))[:70000]  # a profile over one APP2 segment (65,519 bytes) splits in two
    add('phone-icc-two-segments', save_jpeg(phone, quality=90, icc_profile=big_icc))
    for name, data in jpegtran_cases():
        add(name, data)
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

# ── zlib streams (the in-tree inflate's oracle) ─────────────────────────────────────────────────────

def zlib_reference(stream):
    """What Python's zlib makes of a stream, fed a byte at a time so its output up to an error survives:
    (output, verdict), verdict one of 'ok', 'adler' (all data out, the check failed), 'error', 'truncated'."""
    d = zlib.decompressobj()
    out = bytearray()
    for i in range(len(stream)):
        try:
            out += d.decompress(stream[i:i + 1])
        except zlib.error as e:
            return bytes(out), 'adler' if 'incorrect data check' in str(e) else 'error'
        if d.eof:
            return bytes(out), 'ok'
    return bytes(out), 'truncated'


def zlib_cases():
    """Streams from every zlib setting a PNG encoder uses, and seeded mutations of a few of them."""
    rng = random.Random(SEED + 50)
    text = (' '.join(rng.choice(['image', 'lastra', 'deflate', 'window', 'Huffman', 'block', '0123', 'stored']) for _ in range(8000))).encode()
    noise = bytes(rng.randrange(256) for _ in range(12000))
    ramp = bytes((i * 7 + (i >> 9)) & 255 for i in range(40000))  # repeats past the 32 KB window
    far = noise[:200] + bytes(32000) + noise[:200] + text[:3000] + noise[:200]  # a match 32 KB back
    sources = {'text': text, 'noise': noise, 'ramp': ramp, 'far': far, 'empty': b'', 'one': b'x'}
    cases = []
    for name, data in sources.items():
        for level in (0, 1, 6, 9):
            cases.append((f'{name}-l{level}', zlib.compress(data, level)))
    for strategy, tag in ((zlib.Z_FILTERED, 'filtered'), (zlib.Z_HUFFMAN_ONLY, 'huffman'), (zlib.Z_RLE, 'rle'), (zlib.Z_FIXED, 'fixed')):
        c = zlib.compressobj(9, zlib.DEFLATED, 15, 9, strategy)
        cases.append((f'text-{tag}', c.compress(text) + c.flush()))
    for wbits in (9, 12):
        c = zlib.compressobj(6, zlib.DEFLATED, wbits)
        cases.append((f'ramp-window{wbits}', c.compress(ramp) + c.flush()))
    c = zlib.compressobj(6)
    flushed = c.compress(text[:5000]) + c.flush(zlib.Z_SYNC_FLUSH) + c.compress(noise[:3000]) + c.flush(zlib.Z_FULL_FLUSH) + c.compress(text[5000:9000]) + c.flush()
    cases.append(('text-sync-full-flush', flushed))
    # Empty stored blocks after compressed data at every bit alignment: a stored block must start from the
    # whole bytes the reader has already buffered, not past them.
    for n in range(1, 17):
        c = zlib.compressobj(9, zlib.DEFLATED, 15, 9, zlib.Z_FIXED)
        cases.append((f'stored-after-fixed-{n:02d}', c.compress(text[:n]) + c.flush(zlib.Z_SYNC_FLUSH) + c.compress(text[n:n + 40]) + c.flush()))
    files = []
    for name, stream in cases:
        out, verdict = zlib_reference(stream)
        assert verdict == 'ok' and len(out) >= 0, name
        files.append((name, stream, out, verdict))
    # Seeded damage on small streams: flipped bytes, cut ends, a bad Adler-32, trailing bytes.
    small = {'text': zlib.compress(text[:6000], 9), 'fixed': files[[n for n, *_ in files].index('text-fixed')][1][:0] or zlib.compressobj(9, zlib.DEFLATED, 15, 9, zlib.Z_FIXED).compress(text[:4000]), 'noise': zlib.compress(noise[:3000], 0)}
    c = zlib.compressobj(9, zlib.DEFLATED, 15, 9, zlib.Z_FIXED)
    small['fixed'] = c.compress(text[:4000]) + c.flush()
    for base_name, base in small.items():
        for k in range(12):
            b = bytearray(base)
            kind = k % 4
            if kind == 0:
                for _ in range(1 + rng.randrange(3)):
                    b[2 + rng.randrange(len(b) - 2)] ^= 1 << rng.randrange(8)
            elif kind == 1:
                b = b[:rng.randrange(2, len(b))]
            elif kind == 2:
                b[-1] ^= 0x5A
            else:
                b += bytes(rng.randrange(256) for _ in range(1 + rng.randrange(8)))
            out, verdict = zlib_reference(bytes(b))
            files.append((f'damaged-{base_name}-{k:02d}', bytes(b), out, verdict))
    return files


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
        tags = kw.pop('tags', [])
        icc = kw.pop('icc', None)
        check = kw.pop('pillow', True)  # Pillow refuses a bad or missing Adler-32; the encoder's truth stands
        data = encode_png(arr, ct, depth, **kw)
        if check:
            pillow_samples_agree(data, arr, ct, depth, name)
        truth = truth_rgba(arr, ct, depth, kw.get('plte'), kw.get('trns'))
        files[f'png/{name}.png'] = data
        expected['png'][f'{name}.png'] = {
            'width': arr.shape[1],
            'height': arr.shape[0],
            'rgbaSha256': sha(truth),
            'iccSha256': hashlib.sha256(icc).hexdigest() if icc else None,
            'tags': sorted(tags),
        }
    for name, data in jpeg_cases():
        mode, rgba = pillow_rgba(data)
        im = Image.open(io.BytesIO(data))
        icc = im.info.get('icc_profile')
        files[f'jpeg/{name}.jpg'] = data
        entry = {
            'width': rgba.shape[1],
            'height': rgba.shape[0],
            'pillowMode': mode,
            'rgbaSha256': sha(rgba),
            'iccSha256': hashlib.sha256(icc).hexdigest() if icc else None,
            'exifOrientation': im.getexif().get(0x0112),
        }
        expected['jpeg'][f'{name}.jpg'] = entry
    for name, data, oracle in damaged_jpeg_cases():
        if oracle == 'pillow-c':
            rgba = pillow_c_rgba(data)
            simd = pillow_rgba(data)[1]
            assert not np.array_equal(rgba, simd), f'{name} no longer separates the C and SIMD decodes'
        else:
            rgba = pillow_rgba(data + b'\xff\xd9' if oracle == 'pillow-with-eoi' else data)[1]
        files[f'jpeg/{name}.jpg'] = data
        expected['jpeg'][f'{name}.jpg'] = {
            'width': rgba.shape[1],
            'height': rgba.shape[0],
            'pillowMode': Image.open(io.BytesIO(data)).mode,
            'rgbaSha256': sha(rgba),
            'iccSha256': None,
            'exifOrientation': None,
            'oracle': oracle,
        }
    expected['zlib'] = {}
    for name, stream, out, verdict in zlib_cases():
        files[f'zlib/{name}.z'] = stream
        if verdict != 'ok':
            files[f'zlib/{name}.out'] = out  # zlib's output up to where it stopped: the prefix lastra must match
        expected['zlib'][f'{name}.z'] = {'outputLength': len(out), 'outputSha256': hashlib.sha256(out).hexdigest(), 'zlibVerdict': verdict}
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
