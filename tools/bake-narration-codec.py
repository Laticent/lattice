#!/usr/bin/env python3
"""Offline codec bake-off for narration audio: size, encode speed, quality (PESQ wideband) and added length.

Reproduces the offline table in engineering/decisions/2026-11-17-narration-codec-bakeoff.md. The browser half (encode
time in a worker pool, page stalls) is tools/bench-narration-codec.mjs; the iPhone half is the ios-safari-codec-support
platform suite.

Source: lossless speech at 24 kHz mono, one or more .wav files in <src_dir> (the bake-off used Kokoro sentences;
docs/scripts/ios-safari/codec-fixtures/speech.wav is one). Each candidate is encoded with ffmpeg's reference encoders
(libopus, libmp3lame, the native AAC encoder, libvorbis, flac), decoded back to 24 kHz 16-bit and compared with the
source. PESQ wideband (ITU-T P.862.2) runs at 16 kHz, so both sides are resampled there for the score only.

Needs ffmpeg on PATH and, in a virtualenv: pip install numpy scipy soundfile pesq
Usage: python3 -I tools/bake-narration-codec.py <src_dir> <work_dir>    # prints one JSON row per candidate
"""
import json
import os
import subprocess
import sys
import time

import numpy as np
import soundfile as sf
from pesq import pesq
from scipy.signal import resample_poly

SRC, WORK = sys.argv[1], sys.argv[2]
os.makedirs(WORK, exist_ok=True)

# (label, container extension, ffmpeg encoder args)
CANDIDATES = [
    ('wav (baseline)', 'wav', ['-c:a', 'pcm_s16le']),
    ('flac lossless', 'flac', ['-c:a', 'flac', '-sample_fmt', 's16', '-compression_level', '5']),
    ('opus 16k voip', 'ogg', ['-c:a', 'libopus', '-b:a', '16k', '-application', 'voip']),
    ('opus 24k voip', 'ogg', ['-c:a', 'libopus', '-b:a', '24k', '-application', 'voip']),
    ('opus 32k audio', 'ogg', ['-c:a', 'libopus', '-b:a', '32k', '-application', 'audio']),
    ('opus 48k audio', 'ogg', ['-c:a', 'libopus', '-b:a', '48k', '-application', 'audio']),
    ('aac-lc 32k', 'm4a', ['-c:a', 'aac', '-b:a', '32k']),
    ('aac-lc 48k', 'm4a', ['-c:a', 'aac', '-b:a', '48k']),
    ('aac-lc 64k', 'm4a', ['-c:a', 'aac', '-b:a', '64k']),
    ('mp3 32k', 'mp3', ['-c:a', 'libmp3lame', '-b:a', '32k']),
    ('mp3 48k', 'mp3', ['-c:a', 'libmp3lame', '-b:a', '48k']),
    ('mp3 64k', 'mp3', ['-c:a', 'libmp3lame', '-b:a', '64k']),
    ('vorbis q0 (~40k)', 'ogg', ['-c:a', 'libvorbis', '-q:a', '0']),
    ('vorbis q2 (~56k)', 'ogg', ['-c:a', 'libvorbis', '-q:a', '2']),
]


def run(args):
    subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', *args], check=True)


def mono16(path):
    data, sr = sf.read(path, dtype='float32', always_2d=True)
    return data.mean(axis=1), sr


sources = sorted(f for f in os.listdir(SRC) if f.endswith('.wav'))
if not sources:
    sys.exit(f'{SRC}: no .wav sources')
rows = []
for label, ext, enc in CANDIDATES:
    total_bytes = total_secs = enc_secs = 0.0
    scores, extra_ms = [], []
    for name in sources:
        src = os.path.join(SRC, name)
        ref, sr = mono16(src)
        if sr != 24000:
            sys.exit(f'{src}: {sr} Hz; the 16 kHz PESQ resample below assumes a 24 kHz source')
        secs = len(ref) / sr
        slug = label.split(' (')[0].replace(' ', '-')
        out = os.path.join(WORK, f'{os.path.splitext(name)[0]}.{slug}.{ext}')
        back = out + '.decoded.wav'
        t0 = time.perf_counter()
        run(['-i', src, '-ac', '1', *enc, out])
        enc_secs += time.perf_counter() - t0
        # Decode back at the source rate. A decoder that honors gapless metadata trims the codec's padding here.
        run(['-i', out, '-ac', '1', '-ar', str(sr), '-c:a', 'pcm_s16le', back])
        dec, _ = mono16(back)
        total_bytes += os.path.getsize(out)
        total_secs += secs
        extra_ms.append((len(dec) - len(ref)) / sr * 1000)
        n = min(len(ref), len(dec))
        r16 = resample_poly(ref[:n], 2, 3)
        d16 = resample_poly(dec[:n], 2, 3)
        scores.append(pesq(16000, r16, d16, 'wb'))
    rows.append({
        'codec': label,
        'kbps': round(total_bytes * 8 / total_secs / 1000, 1),
        'kb_per_min': round(total_bytes / total_secs * 60 / 1024),
        'pesq_wb': round(float(np.mean(scores)), 2),
        'pesq_min': round(float(np.min(scores)), 2),
        'extra_ms': round(float(np.mean(extra_ms)), 1),
        'encode_x_realtime': round(total_secs / enc_secs, 1),
    })

print(json.dumps(rows, indent=1))
