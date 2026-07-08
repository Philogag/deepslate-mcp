/**
 * Ambient module declarations for headless-gl, which ships without
 * TypeScript types.
 *
 * `headless-gl` returns a WebGLRenderingContext-shaped object — we
 * type the default export as the constructor that returns it, and
 * lean on lib.dom's WebGL types for the rest.
 */
declare module 'gl' {
  /** Real drawing-buffer width (set by gl(width, height, ...)). */
  export interface HeadlessGL extends WebGLRenderingContext {
    drawingBufferWidth: number;
    drawingBufferHeight: number;
  }
  /**
   * `gl(width, height, options?)` — create a headless WebGL context
   * with the given drawing buffer size.
   */
  function createGL(
    width: number,
    height: number,
    options?: WebGLContextAttributes,
  ): HeadlessGL;
  export default createGL;
}
