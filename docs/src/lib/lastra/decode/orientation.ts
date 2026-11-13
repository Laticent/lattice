/**
 * Turn decoded pixels upright by an EXIF orientation (1 to 8), as the camera meant them shown. The
 * reader reports the orientation; the decoders never apply it, so a caller chooses (browsers apply it
 * by default, `image-orientation: from-image`).
 *
 * The eight values are TIFF/EXIF's, the same mapping as Pillow's `ImageOps.exif_transpose`:
 * 1 as stored, 2 mirrored left-right, 3 turned 180 degrees, 4 mirrored top-bottom, 5 transposed (mirrored
 * across the top-left to bottom-right diagonal), 6 turned 90 degrees clockwise, 7 transversed (mirrored
 * across the other diagonal), 8 turned 90 degrees counter-clockwise. Orientations 5 to 8 swap the width
 * and height. Any other value returns the image as it is.
 */

import type { DecodedImage } from './types.js';

export function applyOrientation(image: DecodedImage, orientation: number): DecodedImage {
  if (!Number.isInteger(orientation) || orientation < 2 || orientation > 8) return image;
  const { width: w, height: h, data } = image;
  const swap = orientation >= 5;
  const ow = swap ? h : w;
  const oh = swap ? w : h;
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < oh; y++) {
    for (let x = 0; x < ow; x++) {
      let sx: number;
      let sy: number;
      switch (orientation) {
        case 2:
          sx = w - 1 - x;
          sy = y;
          break;
        case 3:
          sx = w - 1 - x;
          sy = h - 1 - y;
          break;
        case 4:
          sx = x;
          sy = h - 1 - y;
          break;
        case 5:
          sx = y;
          sy = x;
          break;
        case 6:
          sx = y;
          sy = h - 1 - x;
          break;
        case 7:
          sx = w - 1 - y;
          sy = h - 1 - x;
          break;
        default:
          sx = w - 1 - y;
          sy = x;
      }
      const s = (sy * w + sx) * 4;
      const d = (y * ow + x) * 4;
      out[d] = data[s];
      out[d + 1] = data[s + 1];
      out[d + 2] = data[s + 2];
      out[d + 3] = data[s + 3];
    }
  }
  return { width: ow, height: oh, data: out };
}
