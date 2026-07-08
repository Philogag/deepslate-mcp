/**
 * Headless WebGL canvas — bridges `headless-gl` to anything that expects a
 * DOM `HTMLCanvasElement` + `WebGLRenderingContext` pair.
 *
 * `deepslate`'s `Renderer` constructor reads `gl.canvas.clientWidth` and
 * `gl.canvas.clientHeight` to compute the perspective projection, so we
 * must hand it a canvas-shaped object with those fields. We also expose
 * `getContext('webgl')` so any code that goes through the DOM-style API
 * still works.
 */
import createGl from 'gl';

/**
 * Minimal canvas surface — everything `deepslate` (and `gl` itself) needs
 * to treat this as a real HTMLCanvasElement. We don't try to be a full
 * DOM polyfill; just the surface area that touches rendering.
 */
export interface DeepslateCanvas {
  width: number;
  height: number;
  clientWidth: number;
  clientHeight: number;
  style: Record<string, string>;
  addEventListener: (...args: unknown[]) => void;
  removeEventListener: (...args: unknown[]) => void;
  getContext: (type: string) => WebGLRenderingContext | null;
}

export interface HeadlessCanvas {
  /** Canvas-shaped stand-in. Pass this to deepslate renderers. */
  canvas: DeepslateCanvas;
  /** Real headless WebGL rendering context. */
  gl: WebGLRenderingContext;
}

/**
 * Create a headless WebGL drawing buffer of the given size, paired with a
 * canvas-shaped object that satisfies deepslate's expectations.
 *
 * `preserveDrawingBuffer: true` is REQUIRED — without it, `readPixels`
 * after a draw call may return garbage because the framebuffer is allowed
 * to be discarded by the implementation.
 */
export function createHeadlessCanvas(
  width: number,
  height: number,
): HeadlessCanvas {
  if (!Number.isFinite(width) || width <= 0) {
    throw new Error(`createHeadlessCanvas: width must be > 0, got ${width}`);
  }
  if (!Number.isFinite(height) || height <= 0) {
    throw new Error(`createHeadlessCanvas: height must be > 0, got ${height}`);
  }

  // `gl(width, height, options)` — no DOM, no window. Options bag is the
  // standard WebGL context attributes; preserveDrawingBuffer is the
  // important one for our readPixels -> PNG pipeline.
  const gl = createGl(width, height, {
    preserveDrawingBuffer: true,
    // Prefer a software-renderer fallback on Linux when no hardware GL
    // is available — keeps the demo working in CI / containers.
    failIfMajorPerformanceCaveat: false,
  }) as unknown as WebGLRenderingContext & {
    canvas?: unknown;
    drawingBufferWidth?: number;
    drawingBufferHeight?: number;
  };

  if (!gl) {
    throw new Error(
      'createHeadlessCanvas: failed to create WebGL context. ' +
        'On Linux you may need `apt install libgl1-mesa-dev`. ' +
        'On other platforms see https://github.com/stackgl/headless-gl#system-dependencies',
    );
  }

  // headless-gl exposes the size via drawingBufferWidth/Height. Confirm
  // the context actually came up — if either is missing or 0, abort
  // with a clear error rather than crashing later inside deepslate.
  const actualW = (gl as { drawingBufferWidth?: number }).drawingBufferWidth ?? width;
  const actualH = (gl as { drawingBufferHeight?: number }).drawingBufferHeight ?? height;
  if (!actualW || !actualH) {
    throw new Error(
      `createHeadlessCanvas: GL context reported 0x0 drawing buffer (${actualW}x${actualH})`,
    );
  }

  let cachedContext: WebGLRenderingContext | null = null;
  const canvas: DeepslateCanvas = {
    width: actualW,
    height: actualH,
    // deepslate's `getPerspective()` reads these to compute aspect ratio.
    // If they're undefined, the perspective matrix collapses to NaN and
    // everything downstream silently fails.
    clientWidth: actualW,
    clientHeight: actualH,
    style: {},
    // Headless-gl doesn't have an event loop, but consumers occasionally
    // attach listeners — be a polite citizen and no-op rather than throw.
    addEventListener: () => {},
    removeEventListener: () => {},
    getContext: (type: string) => {
      // Cache so repeated calls return the same context (matches DOM
      // semantics). Anything other than 'webgl' returns null as a
      // standard HTMLCanvasElement would.
      if (type === 'webgl') {
        cachedContext ??= gl as unknown as WebGLRenderingContext;
        return cachedContext;
      }
      return null;
    },
  };

  // Some deepslate code paths reach for `gl.canvas` directly. headless-gl
  // sets `gl.canvas` to its internal surface object, which doesn't have
  // clientWidth/clientHeight. Override the property on the instance to
  // make it look like our richer canvas.
  try {
    Object.defineProperty(gl, 'canvas', {
      value: canvas,
      configurable: true,
      enumerable: true,
      writable: true,
    });
  } catch {
    // If the property is non-configurable, fall back to a plain
    // assignment; headless-gl's own canvas is a plain object so this
    // usually succeeds.
    (gl as unknown as { canvas: DeepslateCanvas }).canvas = canvas;
  }

  return { canvas, gl };
}