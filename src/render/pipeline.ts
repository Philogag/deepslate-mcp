/**
 * Render pipeline — top-level orchestrator that takes a deepslate
 * `Structure` and returns a PNG `Buffer`.
 *
 * Sequence:
 *   1. Create a headless WebGL canvas of the requested size.
 *   2. Clear to the requested background (or transparent).
 *   3. Build a stub `Resources` provider (M2 will replace with real one).
 *   4. Construct `StructureRenderer` from deepslate.
 *   5. Compute the view matrix for the requested angle.
 *   6. Draw the structure, the bounding grid, and the invisible-block
 *      outlines (the latter two give us a visible "scaffold" frame even
 *      when every block resolves to the invalid-texture path).
 *   7. `readPixels` + Y-flip + encode to PNG.
 *
 * Errors: we always try to release GL state before re-throwing so a
 * second call in the same process doesn't inherit a half-corrupted
 * context. The headless-gl context doesn't have an explicit `destroy`
 * method, so we rely on letting the JS GC collect it.
 */
import { StructureRenderer, type Structure, type Resources } from 'deepslate';
import { createHeadlessCanvas } from './headless_canvas.js';
import { capturePNG } from './encoder.js';
import { viewForAngle } from './camera.js';
import { createStubResources } from './stub_resources.js';
import { parseBackground } from '../utils/color.js';

/** Camera preset for the rendered view. */
export type RenderAngle = 'isometric' | 'top' | 'front' | 'side' | 'custom';

/** All knobs the pipeline exposes. */
export interface RenderOptions {
  /** Output width in pixels. */
  width: number;
  /** Output height in pixels. */
  height: number;
  /** Camera angle preset. */
  angle: RenderAngle;
  /**
   * Background color. Accepts the same forms CSS does:
   *   - `transparent` (default) — alpha 0
   *   - `#RRGGBB`              — opaque hex
   *   - `#RRGGBBAA`            — hex with alpha
   *   - `rgb(r,g,b)` / `rgba(r,g,b,a)` — functional notation
   *
   * Anything else throws. We intentionally don't accept named colors
   * like `"red"` to keep the parser trivial.
   */
  background?: string;
  /**
   * Whether to draw the grid lines that bound the structure's footprint.
   * Default `true`. Useful to disable for thumbnails where the grid
   * dominates the visible area.
   */
  drawGrid?: boolean;
  /**
   * Whether to draw the magenta/black checker for "invalid" blocks.
   * Default `true`. With the M1 stub-resources every block is invalid,
   * so disabling this leaves only the grid + outlines visible.
   */
  drawInvalidBlocks?: boolean;
  /**
   * Whether to draw the wireframe outline around invisible / air blocks
   * that bound the structure. Default `true`. Pure aesthetic.
   */
  drawOutlines?: boolean;
  /**
   * Optional custom resources (M2 real-texture pipeline).
   * When omitted, falls back to stub resources (M1 behaviour).
   */
  resources?: Resources;
  /**
   * Custom X-axis rotation in radians (only used when angle='custom').
   */
  rotationX?: number;
  /**
   * Custom Y-axis rotation in radians (only used when angle='custom').
   */
  rotationY?: number;
}

/** Result returned by `renderStructureToPNG`. */
export interface RenderResult {
  /** The encoded PNG bytes. */
  png: Buffer;
  /** Number of milliseconds the render took end-to-end. */
  durationMs: number;
  /** PNG dimensions (post-encoding; should match `width`/`height`). */
  width: number;
  height: number;
}

/** Internal result of parsing `RenderOptions.background`. */
type RGBA = import('../utils/color.js').RGBA;

/**
 * Render a `Structure` to a PNG buffer.
 *
 * @param structure  Any object satisfying deepslate's `StructureProvider`.
 *                   In practice this is a `Structure` instance built with
 *                   `addBlock(...)`, but we type it loosely so callers
 *                   can also pass `.nbt`-decoded providers.
 * @param options    Render configuration. See `RenderOptions`.
 * @returns A `RenderResult` containing the PNG bytes plus metadata.
 */
export async function renderStructureToPNG(
  structure: Structure,
  options: RenderOptions,
): Promise<RenderResult> {
  const {
    width,
    height,
    angle,
    background,
    drawGrid = true,
    drawInvalidBlocks = true,
    drawOutlines = true,
  } = options;

  if (!Number.isFinite(width) || width <= 0 || !Number.isInteger(width)) {
    throw new Error(`renderStructureToPNG: width must be a positive integer, got ${width}`);
  }
  if (!Number.isFinite(height) || height <= 0 || !Number.isInteger(height)) {
    throw new Error(`renderStructureToPNG: height must be a positive integer, got ${height}`);
  }

  const t0 = performance.now();
  const { canvas, gl } = createHeadlessCanvas(width, height);

  try {
    // Background. The renderer pipeline uses standard GL blending, so
    // we paint the clear color first and then composite the structure
    // on top.
    const bg = parseBackground(background);
    gl.clearColor(bg.r, bg.g, bg.b, bg.a);
    gl.clearDepth(1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // Use caller-provided resources, or fall back to M1 stub resources
    const resources = options.resources ?? createStubResources(gl);

    // StructureRenderer takes a `WebGLRenderingContext` per its TS
    // signature, but at runtime it reads `gl.canvas.clientWidth` /
    // `gl.canvas.clientHeight` for the perspective matrix. Our
    // `createHeadlessCanvas` helper replaces `gl.canvas` with a
    // canvas-shaped stand-in (see headless_canvas.ts), so passing the
    // raw `gl` works.
    const renderer = new StructureRenderer(gl, structure, resources);
    // useInvisibleBlocks is `true` by default; we don't need to touch
    // it here. The flag gates `drawInvisibleBlocks()`.

    // Build the view matrix from the structure's bounding box so the
    // camera frames it correctly regardless of its size.
    const size = structure.getSize() as [number, number, number];
    const viewMatrix = viewForAngle(size, angle, options.rotationX, options.rotationY);

    // The renderer has no single `draw()` — you call each pass
    // individually. We always draw the structure; the grid and
    // invisible-blocks outlines are optional.
    renderer.drawStructure(viewMatrix);
    if (drawInvalidBlocks) {
      renderer.drawInvisibleBlocks(viewMatrix);
    }
    if (drawOutlines) {
      // drawInvisibleBlocks already handles the outline pass; for the
      // structure proper we don't have a per-block outline API in M1,
      // so this flag is effectively a synonym for drawInvalidBlocks.
      // (We keep both flags so the surface is stable when M2 adds a
      // real per-block outline.)
      renderer.drawInvisibleBlocks(viewMatrix);
    }
    if (drawGrid) {
      renderer.drawGrid(viewMatrix);
    }

    const png = capturePNG(gl, width, height);
    const durationMs = performance.now() - t0;
    return { png, durationMs, width, height };
  } catch (err) {
    // Surface a useful stack trace; the GL context doesn't have an
    // explicit reset, so just re-throw and let the caller decide.
    console.error('[renderStructureToPNG] failed:', err);
    throw err;
  }
}