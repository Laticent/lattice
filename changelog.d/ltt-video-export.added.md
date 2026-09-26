- **Video export: `lattice video <narrated-export.html>`** renders a narrated HTML export to an
  MP4 (1920×1080, 30 fps, H.264 video, AAC audio, a WebVTT caption track) and a `.vtt` sidecar.
  The video is the export's own player, played on a clock the capture controls and captured frame
  by frame, so it shows exactly what the export shows; the audio is mixed from the export's own
  clips at the times the player started each sentence. It needs a Chromium whose WebCodecs encodes
  H.264 (Chrome or Chrome for Testing), and checks before capturing. AAC is encoded by FFmpeg's
  encoder compiled to WebAssembly (`@mediabunny/aac-encoder`) where the browser has none. The
  frame follows the deck's canvas (long side 1920 px), and a failed or interrupted run leaves no
  file behind. Playback outside Chromium (QuickTime, PowerPoint, Keynote) and the muxed caption
  track are not yet verified; the `.vtt` sidecar is the caption path known to work.
- **The exported player gains a render mode** (`window.__lpRender`, set only by the video
  capture), so a narrated HTML export's player script grows by a few hundred bytes; an export
  without narration is byte-identical. A viewer's browser never enters it.
