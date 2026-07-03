// The Kokoro synthesis worker — a SAME-ORIGIN module worker (emitted by Vite via
// `new Worker(new URL('./kokoro-worker.js', import.meta.url), { type: 'module' })`),
// NOT a `blob:` worker. This origin distinction is the whole fix for iOS:
//
//   A `blob:` worker has an opaque origin, and Safari/iOS REFUSES a cross-origin
//   dynamic `import()` from an opaque-origin worker. The old blob-worker build
//   therefore always threw on `import('https://esm.run/kokoro-js')`, fell back to
//   loading onnxruntime-web + the ~80 MB model ON THE MAIN THREAD, and the memory
//   spike reloaded the phone tab (kicking the user out of Practice). A same-origin
//   worker is allowed the cross-origin import (esm.run sends permissive CORS), so
//   the model loads OFF the main thread and the tab survives.
//
// kokoro-js stays CDN-loaded at runtime (no npm dep) — the `/* @vite-ignore */`
// keeps Vite from trying to bundle the CDN URL; it's a runtime dynamic import,
// exactly like architect-model's main-thread fallback.
//
// It posts raw Float32 PCM back (transferable) so the main thread encodes the WAV
// — no dependency on a particular RawAudio.toBlob() shape. Mirrors voice-model's
// rung contract; docs-only (the Drawing Board), touches no engine render path.

let tts = null;

self.onmessage = async (e) => {
  const d = e.data || {};
  try {
    if (d.type === 'load') {
      const mod = await import(/* @vite-ignore */ d.url);
      const KokoroTTS = mod.KokoroTTS || (mod.default && mod.default.KokoroTTS);
      tts = await KokoroTTS.from_pretrained(d.model, {
        dtype: d.dtype,
        device: d.device,
        progress_callback: (p) => self.postMessage({ type: 'progress', progress: (p && p.progress) || 0, file: p && p.file, status: p && p.status }),
      });
      self.postMessage({ type: 'loaded' });
    } else if (d.type === 'generate') {
      const audio = await tts.generate(d.text, { voice: d.voice });
      const samples = audio.audio;
      const rate = audio.sampling_rate;
      self.postMessage({ type: 'audio', id: d.id, samples, rate }, [samples.buffer]);
    }
  } catch (err) {
    self.postMessage({ type: d.type === 'load' ? 'load-error' : 'gen-error', id: d.id, error: String((err && err.message) || err) });
  }
};
