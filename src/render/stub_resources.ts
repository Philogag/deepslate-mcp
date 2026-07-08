/**
 * Stub `Resources` provider for M1.
 *
 * Every block resolves to `null` so deepslate's renderer falls back to its
 * "invalid block" path: solid magenta/black checker textures via the atlas
 * plus `drawInvisibleBlocks()` wireframe outlines. That's the deliberate
 * visual signal during M1 — it proves the render pipeline is wired up
 * end-to-end without us having to ship real block models yet. M2 will
 * replace this with a real mcmeta-driven `Resources`.
 *
 * Two non-null bits we DO need to provide, because the renderer will
 * call them in its constructor:
 *   1. `getTextureAtlas()` — a 1×1 transparent `ImageData`-shaped object.
 *      We can't use `TextureAtlas.empty()` because that calls
 *      `document.createElement('canvas')`, which doesn't exist in Node.
 *      The renderer passes this straight to `gl.texImage2D`, which
 *      happily accepts `{ width, height, data }` — so we build that
 *      directly.
 *   2. `getBlockFlags` / `getBlockProperties` — both return empty objects
 *      so the chunk builder's per-block queries don't crash.
 */
import type {
  BlockDefinition,
  BlockModel,
  Identifier,
  Resources,
  TextureAtlasProvider,
  UV,
} from 'deepslate';

/**
 * The shape that `gl.texImage2D(target, level, internalFormat, format,
 * type, source)` accepts when `source` is not an `HTMLImageElement` /
 * `HTMLCanvasElement` / `ImageData`. headless-gl only needs `width`,
 * `height`, and a `data: Uint8Array`.
 */
export interface ImageDataLike {
  width: number;
  height: number;
  data: Uint8Array;
  /** Optional — `ImageData` has it, but texImage2D doesn't require it. */
  colorSpace?: 'srgb' | 'display-p3';
}

/**
 * Build a minimal `Resources` whose every block lookup returns `null`
 * and whose texture atlas is a 1×1 transparent pixel.
 *
 * The `gl` argument is accepted for parity with future real-resource
 * providers (they may need a GL context to upload textures). For the
 * stub we don't use it — we hand back a plain typed array.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function createStubResources(_gl: WebGLRenderingContext): Resources {
  /**
   * Single transparent pixel. `RGBA = (0, 0, 0, 0)` so any draw that
   * samples this atlas contributes zero alpha. The chunk builder will
   * still try to render block faces using this texture, but they'll
   * show up as transparent quads — the visible "checker" you actually
   * see on screen is the chunk builder's invalid-block fallback, not
   * the atlas pixel itself.
   */
  const transparentAtlas: ImageDataLike = {
    width: 1,
    height: 1,
    data: new Uint8Array([0, 0, 0, 0]),
  };

  const atlasProvider: TextureAtlasProvider = {
    getTextureAtlas: () =>
      // `Renderer.createAtlasTexture` only reads `width`, `height`, and
      // `data`, so returning our ImageDataLike here is safe. Cast to
      // `ImageData` because that's the signature `Resources` enforces.
      transparentAtlas as unknown as ImageData,
    getTextureUV: (_id: Identifier): UV => [0, 0, 1, 1],
    getPixelSize: () => 16,
  };

  return {
    // BlockDefinitionProvider — null means "unknown block, fall back to
    // invalid-texture path". The renderer draws the purple/black checker
    // for these.
    getBlockDefinition: (_id: Identifier): BlockDefinition | null => null,

    // BlockModelProvider — same idea. Returning null means the renderer
    // doesn't try to instantiate a model for this block.
    getBlockModel: (_id: Identifier): BlockModel | null => null,

    // TextureAtlasProvider — the only non-null thing in this stub.
    getTextureAtlas: atlasProvider.getTextureAtlas,
    getTextureUV: atlasProvider.getTextureUV,
    getPixelSize: atlasProvider.getPixelSize,

    // BlockFlagsProvider — every block treated as opaque. This drives
    // culling decisions inside the chunk builder. With our null block
    // definitions, the builder never actually asks, but the renderer
    // still queries it during mesh construction so we have to satisfy
    // the interface.
    getBlockFlags: (_id: Identifier) => ({}),

    // BlockPropertiesProvider — no per-block properties (no fence
    // connections, no rotation states, etc.).
    getBlockProperties: (_id: Identifier) => ({}),
    getDefaultBlockProperties: (_id: Identifier) => ({}),
  };
}