/**
 * PNG encoder — `gl.readPixels` -> `pngjs` -> `Buffer`.
 *
 * Two important details:
 *   1. **Y-axis flip**: WebGL puts the origin at the bottom-left of the
 *      drawing buffer, while PNG/image APIs assume top-left. We flip
 *      in-place in software rather than relying on
 *      `pixelStorei(UNPACK_FLIP_Y_WEBGL, ...)` because that flag only
 *      affects texture *uploads*, not `readPixels` output.
 *   2. **Background compositing**: When the caller wants a solid
 *      background (sky blue / white / etc.), the renderer was issued a
 *      `gl.clearColor` + `gl.clear` before any draws — so the raw RGBA
 *      buffer already has the background as the "empty" pixels and we
 *      just write them out as-is. For `transparent`, we leave the
 *      existing alpha values intact.
 */
import { PNG } from 'pngjs';

/**
 * Read the current GL drawing buffer and encode it as a PNG.
 *
 * @param gl   WebGL context (must have been created with
 *             `preserveDrawingBuffer: true`, otherwise the contents may
 *             already have been discarded).
 * @param width  Drawing buffer width in pixels.
 * @param height Drawing buffer height in pixels.
 * @returns A `Buffer` containing the encoded PNG bytes.
 */
export function capturePNG(
  gl: WebGLRenderingContext,
  width: number,
  height: number,
): Buffer {
  if (!Number.isFinite(width) || width <= 0) {
    throw new Error(`capturePNG: width must be > 0, got ${width}`);
  }
  if (!Number.isFinite(height) || height <= 0) {
    throw new Error(`capturePNG: height must be > 0, got ${height}`);
  }

  // RGBA8 readback. headless-gl returns a Uint8Array; the WebGL spec
  // accepts any TypedArray / DataView here.
  const pixels = new Uint8Array(width * height * 4);
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

  // Flip rows in place. PNG rows go top-to-bottom; GL gives us
  // bottom-to-top. We swap row `r` with row `height - 1 - r`, which is
  // an in-place transposition and avoids allocating a second buffer.
  const stride = width * 4;
  const row = new Uint8Array(stride);
  for (let y = 0; y < height / 2; y++) {
    const top = y * stride;
    const bottom = (height - 1 - y) * stride;
    row.set(pixels.subarray(top, top + stride));
    pixels.copyWithin(top, bottom, bottom + stride);
    pixels.set(row, bottom);
  }

  // pngjs expects an `ImageData`-shaped object: { width, height, data }.
  // PNG.sync.write returns a Buffer directly — no async overhead, no
  // need to keep the PNG instance around.
  const png = new PNG({ width, height });
  png.data = Buffer.from(pixels.buffer, pixels.byteOffset, pixels.byteLength);
  return PNG.sync.write(png);
}