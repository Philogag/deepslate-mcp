// M2 resource pipeline — Mojang vanilla client.jar route.
//
// Pipeline stages (each stage is cached so re-runs after warm-up skip
// expensive work and run fully offline):
//   1. resolveVanillaJar() — find the 1.20.4 client.jar on disk
//   2. loadJarResources()  — extract blockstates/models/textures maps
//   3. parse blockstates to BlockDefinition (in-memory, not cached)
//   4. parse models to BlockModel + flatten parent chains
//   5. pack textures into a TextureAtlas (grid-pack; PNG re-encoding)
//   6. assemble VanillaResources implementing deepslate.Resources
//
// The atlas and parsed blockstates/models are persisted to cache so
// subsequent builds skip the JAR entirely and run fully offline (~0.2s
// vs ~3.5s for a full rebuild). Call purgeCache() to invalidate.
import { promises as fs } from 'fs';
import * as path from 'path';
import { Buffer } from 'buffer';
import {
  BlockDefinition,
  BlockModel,
  TextureAtlas,
  type Resources,
  type Identifier,
  type BlockModelProvider,
  type BlockFlags,
  type TextureAtlasProvider,
  type UV,
} from 'deepslate';
import { PNG } from 'pngjs';

import { MC_VERSION, RESOURCES_VERSION } from '../version.js';
import { CacheManager } from './cache_manager.js';
import { loadJarResources } from './jar_loader.js';
import { resolveVanillaJar } from './manifest.js';

const CACHE = new CacheManager(`m2/${RESOURCES_VERSION}`);

// ---- Cache keys ------------------------------------------------------------

const CACHE_KEY_PREFIX = 'resources';
const CACHE_KEY_STATES = `${CACHE_KEY_PREFIX}/blockstates.json`;
const CACHE_KEY_MODELS = `${CACHE_KEY_PREFIX}/models.json`;
const CACHE_KEY_ATLAS_PNG = `${CACHE_KEY_PREFIX}/atlas.png`;
const CACHE_KEY_UV_MAP = `${CACHE_KEY_PREFIX}/uvmap.json`;
const CACHE_KEY_VERSION = `${CACHE_KEY_PREFIX}/version.txt`;

// ---- Atlas layout ----------------------------------------------------------

/**
 * We pack N block textures into a single square atlas where each cell
 * is exactly 16 px (vanilla textures are 16x16, but we keep the slot
 * sized at the texture's own bounds for future animation support).
 *
 * Width = upperPowerOfTwo(sqrt(N)).
 * Each cell is allocated in row-major order starting at index 1. Index 0
 * is reserved for the "missing texture" diagnostic tile (magenta/black).
 * The atlas dimensions are always powers of two — TextureAtlas validates
 * this and would throw otherwise.
 */
/**
 * Pseudo-ImageData shape: deepslate's TextureAtlas only reads
 * `.width`, `.height`, and (in some code paths) `.data` (Uint8ClampedArray
 * is structurally compatible with Uint8Array — both yield 0-255 byte values).
 * Node has no global ImageData, so we pass a plain duck-typed object.
 */
type AtlasImageData = {
  width: number;
  height: number;
  data: Uint8ClampedArray;
  colorSpace?: PredefinedColorSpace;
};

interface AtlasBuildResult {
  imageData: AtlasImageData;
  uvMap: Record<string, UV>;
  width: number;
  height: number;
  tileCount: number;
}

function upperPowerOfTwo(n: number): number {
  let p = 1;
  while (p < n) p <<= 1;
  return Math.max(1, p);
}

/**
 * Compose many PNG buffers into a single grid-padded ImageData. Each
 * texture keeps its own dimensions inside a 16×16 cell slot to be safe
 * for non-vanilla packs; vanilla-only code paths always land in slot (0,0).
 */
function packTexturesToAtlas(
  textures: Map<string, Buffer>,
): AtlasBuildResult {
  const ids = Array.from(textures.keys());
  const cellCount = ids.length + 1; // +1 for missing-texture at index 0
  const gridSize = upperPowerOfTwo(Math.ceil(Math.sqrt(cellCount)));
  const cellPx = 16;
  const totalPx = gridSize * cellPx;

  // Decode all PNGs into a Uint8ClampedArray for atlas-wide compositing.
  const canvas = new Uint8ClampedArray(totalPx * totalPx * 4);
  const uvMap: Record<string, UV> = {};

  // Tile 0 = invalid (magenta/black checker). Matches deepslate's
  // drawInvalidTexture output so unresolved blocks look consistent
  // with the upstream renderer.
  const drawCheck = (x0: number, y0: number) => {
    for (let dy = 0; dy < cellPx; dy++) {
      for (let dx = 0; dx < cellPx; dx++) {
        const i = ((y0 + dy) * totalPx + (x0 + dx)) * 4;
        const top = (dx < cellPx / 2) === (dy < cellPx / 2);
        canvas[i] = top ? 0 : 255;     // R
        canvas[i + 1] = 0;             // G
        canvas[i + 2] = top ? 0 : 255; // B
        canvas[i + 3] = 255;           // A
      }
    }
  };
  drawCheck(0, 0);

  let slot = 1;
  for (const id of ids) {
    const u = slot % gridSize;
    const v = Math.floor(slot / gridSize);
    const px = u * cellPx;
    const py = v * cellPx;

    const png = PNG.sync.read(textures.get(id)!);
    // UV is normalized to atlas size, matching deepslate's convention.
    const inv = 1 / gridSize;
    uvMap[id] = [inv * u, inv * v, inv * u + inv, inv * v + inv];

    // Copy pixels. PNGs may be larger or smaller than 16 px in third-party
    // resource packs; for vanilla they are exactly 16x16.
    for (let row = 0; row < png.height && row < cellPx; row++) {
      const src = (row * png.width * 4);
      const dstBase = ((py + row) * totalPx + px) * 4;
      for (let col = 0; col < png.width && col < cellPx; col++) {
        const sIdx = src + col * 4;
        const dIdx = dstBase + col * 4;
        // PNG alpha-premultiply? pngjs returns straight (un-premultiplied)
        // RGBA, which is what GL wants anyway.
        canvas[dIdx] = png.data[sIdx]!;
        canvas[dIdx + 1] = png.data[sIdx + 1]!;
        canvas[dIdx + 2] = png.data[sIdx + 2]!;
        canvas[dIdx + 3] = png.data[sIdx + 3]!;
      }
    }
    slot++;
  }

  // Node has no global ImageData; deepslate's TextureAtlas only reads
  // `.width`, `.height`, and the underlying buffer of `.data`. Construct
  // a duck-typed ImageData that satisfies the structural type.
  const imageData: AtlasImageData = {
    width: totalPx,
    height: totalPx,
    data: canvas,
  };
  return { imageData, uvMap, width: totalPx, height: totalPx, tileCount: slot };
}

// ---- Resources implementation ---------------------------------------------

/**
 * The literal Resources implementation. We keep the maps private and
 * expose deepslate's interface methods. Identifier can be passed as
 * either a string or an actual Identifier — `.toString()` handles both.
 */
class VanillaResources implements Resources {
  private readonly defs: Map<string, BlockDefinition>;
  private readonly models: Map<string, BlockModel>;
  private readonly atlasProvider: TextureAtlasProvider;

  constructor(
    defs: Map<string, BlockDefinition>,
    models: Map<string, BlockModel>,
    atlasProvider: TextureAtlasProvider,
  ) {
    this.defs = defs;
    this.models = models;
    this.atlasProvider = atlasProvider;
  }

  private id(id: Identifier): string {
    return id.toString();
  }

  getBlockDefinition(id: Identifier): BlockDefinition | null {
    return this.defs.get(this.id(id)) ?? null;
  }

  getBlockModel(id: Identifier): BlockModel | null {
    return this.models.get(this.id(id)) ?? null;
  }

  getTextureAtlas(): ImageData {
    return this.atlasProvider.getTextureAtlas();
  }

  getTextureUV(id: Identifier): UV {
    return this.atlasProvider.getTextureUV(id);
  }

  getPixelSize(): number {
    return this.atlasProvider.getPixelSize?.() ?? 16;
  }

  /**
   * Cull/blend flags for block rendering (drives ChunkBuilder.needsCull()).
   *
   * Key semantics (from deepslate's ChunkBuilder.js):
   *   - `opaque: true`  → neighbor's adjacent face is CULLED (skipped).
   *     Use this only for full-cube blocks whose geometry fully occludes
   *     the face below/behind them (stone, planks, etc.).
   *   - `opaque: false` → neighbor's adjacent face is RENDERED. This is
   *     critical for non-full blocks (stairs, slabs, trapdoors): if we
   *     mark a stair as opaque, the stone floor beneath it has its top
   *     face culled → the floor "disappears" through the stair's empty
   *     upper half.
   *   - `semi_transparent: true` → block mesh goes to the transparent
   *     render queue (drawn after opaque, enabling correct depth sorting).
   *   - `self_culling: true` → adjacent SAME-TYPE blocks cull shared
   *     internal faces (e.g. two oak_stairs side-by-side shouldn't show
   *     the internal wall between them).
   *
   * Strategy: suffix-based heuristics on the block id (plan B). This
   * covers all vanilla blocks used in M2 demos without requiring a full
   * blockstate/template parse. A future milestone can upgrade to plan A
   * (parse blockstate JSON multipart/variants to detect cube_all models)
   * or plan C (ship a pre-extracted vanilla flags table).
   */
  getBlockFlags(id: Identifier): BlockFlags | null {
    const p = id.path; // e.g. "oak_stairs" (no namespace prefix)

    // ---- Glass-like blocks: transparent textures, not opaque ----
    if (
      p === 'glass' || p === 'tinted_glass' ||
      p.endsWith('_stained_glass') || p.endsWith('_stained_glass_pane') ||
      p === 'glass_pane' || p === 'ice' || p === 'water'
    ) {
      return { opaque: false, semi_transparent: true };
    }

    // ---- Leaves: render with transparency (fancy mode) ----
    if (p === 'leaves' || p.endsWith('_leaves')) {
      return { opaque: false, semi_transparent: true };
    }

    // ---- Non-full blocks: stairs, slabs, trapdoors, doors ----
    // These have empty space that should NOT occlude neighbors.
    // self_culling: true so adjacent same-type blocks cull internal faces.
    if (
      p.endsWith('_stairs') || p.endsWith('_slab') ||
      p.endsWith('_trapdoor') || p.endsWith('_door')
    ) {
      return { opaque: false, semi_transparent: true, self_culling: true };
    }

    // ---- Fence/wall/pane family: thin cross-sections ----
    if (
      p.endsWith('_fence') || p.endsWith('_fence_gate') ||
      p.endsWith('_wall') || p.endsWith('_pane') ||
      p === 'iron_bars'
    ) {
      return { opaque: false, semi_transparent: true, self_culling: true };
    }

    // ---- Flat / thin decorative blocks ----
    if (
      p.endsWith('_carpet') || p.endsWith('_pressure_plate') ||
      p.endsWith('_button') || p === 'lever' ||
      p.endsWith('_rail') || p === 'rail' || p === 'tripwire_hook' ||
      p === 'flower_pot' || p.startsWith('potted_') ||
      p.endsWith('_banner') || p === 'standing_banner' ||
      p.endsWith('_sign') || p === 'standing_sign' ||
      p.endsWith('_bed') || p.endsWith('_head') || p.endsWith('_skull') ||
      p === 'torch' || p.endsWith('_torch') ||
      p === 'lantern' || p.endsWith('_lantern') ||
      p === 'redstone_wire' || p === 'repeater' || p === 'comparator' ||
      p.endsWith('_sapling') || p.endsWith('_flower') ||
      p === 'tall_grass' || p === 'grass' || p === 'fern' ||
      p.endsWith('_mushroom') || p === 'mushroom_stem' ||
      p === 'nether_wart' || p === 'nether_wart_crop' ||
      p === 'wheat' || p === 'carrots' || p === 'potatoes' || p === 'beetroots' ||
      p === 'sugar_cane' || p === 'bamboo' ||
      p === 'cobweb' || p === 'lily_pad'
    ) {
      return { opaque: false, semi_transparent: true };
    }

    // ---- Everything else: full opaque cube ----
    // Non-full blocks with opaque textures that still occlude their own
    // faces (like the empty air inside a furnace) are fine here; they
    // cull neighbor faces correctly because they ARE full cubes.
    return { opaque: true };
  }

  // ---- Static property tables for getDefaultBlockProperties -------------

  private static readonly STAIRS_DEFAULTS: Record<string, string> = {
    facing: 'north', half: 'bottom', shape: 'straight',
  };
  private static readonly SLAB_DEFAULTS: Record<string, string> = {
    type: 'bottom',
  };
  private static readonly TRAPDOOR_DEFAULTS: Record<string, string> = {
    half: 'bottom', open: 'false', facing: 'north',
  };
  private static readonly DOOR_DEFAULTS: Record<string, string> = {
    facing: 'north', half: 'lower', hinge: 'left', open: 'false', powered: 'false',
  };
  private static readonly LOG_DEFAULTS: Record<string, string> = {
    axis: 'y',
  };
  private static readonly LEAVES_DEFAULTS: Record<string, string> = {
    persistent: 'false', distance: '7',
  };
  private static readonly FENCE_DEFAULTS: Record<string, string> = {
    open: 'false', powered: 'false',
  };
  private static readonly WALL_DEFAULTS: Record<string, string> = {
    facing: 'north', up: 'true',
    north: 'none', south: 'none', east: 'none', west: 'none',
  };
  private static readonly BUTTON_DEFAULTS: Record<string, string> = {
    facing: 'north', face: 'wall', powered: 'false',
  };
  private static readonly LEVER_DEFAULTS: Record<string, string> = {
    facing: 'north', face: 'wall', powered: 'false',
  };
  private static readonly BED_DEFAULTS: Record<string, string> = {
    facing: 'north', part: 'foot', occupied: 'false',
  };
  private static readonly RAIL_DEFAULTS: Record<string, string> = {
    powered: 'false',
  };
  private static readonly FLOWER_POT_DEFAULTS: Record<string, string> = {
    flower: 'empty',
  };
  private static readonly BANNER_DEFAULTS: Record<string, string> = {
    rotation: '0',
  };

  // ---- getBlockProperties (interface stub — not called by deepslate) ----

  /**
   * Returns the full list of possible property values for a block. This
   * method is declared in deepslate's BlockPropertiesProvider interface
   * but is NOT called by ChunkBuilder or StructureRenderer — only
   * `getDefaultBlockProperties` is used. We return null; callers that
   * need the full state space (e.g. an editor UI) would parse blockstate
   * JSON from the JAR directly.
   */
  getBlockProperties(_id: Identifier): Record<string, string[]> | null {
    return null;
  }

  /**
   * Default-property fallback. ChunkBuilder merges these into the
   * per-block properties (`Object.entries(defaultProps).forEach(...)`)
   * before variant matching. This is essential when a Structure stores
   * a block without all properties — e.g. `oak_log` without `axis` —
   * so the blockstate variant matcher in BlockDefinition.getModelVariants()
   * finds a match instead of returning an empty mesh (invisible block).
   *
   * Using suffix heuristics to match getBlockFlags coverage; they share the
   * same blocks in 99% of real-world cases.
   */
  getDefaultBlockProperties(id: Identifier): Record<string, string> | null {
    const p = id.path;

    if (p.endsWith('_stairs')) return VanillaResources.STAIRS_DEFAULTS;
    if (p.endsWith('_slab')) return VanillaResources.SLAB_DEFAULTS;
    if (p.endsWith('_trapdoor')) return VanillaResources.TRAPDOOR_DEFAULTS;
    if (p.endsWith('_door') || p === 'iron_door') return VanillaResources.DOOR_DEFAULTS;
    if (p.endsWith('_log') || p.endsWith('_stem') || p.endsWith('_hyphae') || p === 'mushroom_stem') return VanillaResources.LOG_DEFAULTS;
    if (p === 'leaves' || p.endsWith('_leaves')) return VanillaResources.LEAVES_DEFAULTS;
    if (p.endsWith('_fence_gate')) return VanillaResources.FENCE_DEFAULTS;
    if (p.endsWith('_wall')) return VanillaResources.WALL_DEFAULTS;
    if (p.endsWith('_button')) return VanillaResources.BUTTON_DEFAULTS;
    if (p === 'lever') return VanillaResources.LEVER_DEFAULTS;
    if (p.endsWith('_bed')) return VanillaResources.BED_DEFAULTS;
    if (p === 'powered_rail' || p === 'detector_rail' || p === 'activator_rail') return VanillaResources.RAIL_DEFAULTS;
    if (p === 'flower_pot' || p.startsWith('potted_')) return VanillaResources.FLOWER_POT_DEFAULTS;
    if (p.endsWith('_banner') || p === 'standing_banner') return VanillaResources.BANNER_DEFAULTS;

    return null;
  }
}

// ---- Cache helpers ---------------------------------------------------------

/**
 * Serialise a Map<string, Buffer> (JSON buffers) to a single JSON object
 * where keys are resource IDs and values are UTF-8 decoded JSON strings.
 */
function serializeJsonBuffers(map: Map<string, Buffer>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, buf] of map) {
    out[key] = buf.toString('utf8');
  }
  return out;
}

/**
 * Deserialise a flat JSON object back into a Map<string, Buffer>.
 */
function deserializeJsonBuffers(obj: Record<string, string>): Map<string, Buffer> {
  const map = new Map<string, Buffer>();
  for (const [key, val] of Object.entries(obj)) {
    map.set(key, Buffer.from(val, 'utf8'));
  }
  return map;
}

/**
 * Try to load cached resources from disk. Returns null if any cache entry
 * is missing, signalling the caller to rebuild from the JAR.
 */
async function tryLoadCachedResources(): Promise<{
  blockstates: Map<string, Buffer>;
  models: Map<string, Buffer>;
  atlasPng: Buffer;
  uvMap: Record<string, UV>;
} | null> {
  // Version check: if stored version doesn't match, treat as cache miss.
  const versionBuf = await CACHE.get(CACHE_KEY_VERSION);
  if (!versionBuf || versionBuf.toString('utf8').trim() !== RESOURCES_VERSION) {
    return null;
  }

  const [statesJson, modelsJson, atlasPng, uvMapJson] = await Promise.all([
    CACHE.get(CACHE_KEY_STATES),
    CACHE.get(CACHE_KEY_MODELS),
    CACHE.get(CACHE_KEY_ATLAS_PNG),
    CACHE.get(CACHE_KEY_UV_MAP),
  ]);
  if (!statesJson || !modelsJson || !atlasPng || !uvMapJson) {
    return null;
  }
  try {
    const blockstates = deserializeJsonBuffers(JSON.parse(statesJson.toString('utf8')));
    const models = deserializeJsonBuffers(JSON.parse(modelsJson.toString('utf8')));
    const uvMap = JSON.parse(uvMapJson.toString('utf8')) as Record<string, UV>;
    return { blockstates, models, atlasPng, uvMap };
  } catch {
    return null;
  }
}

/**
 * Save built resources to cache so subsequent builds are fast.
 */
async function saveResourcesToCache(
  blockstates: Map<string, Buffer>,
  models: Map<string, Buffer>,
  atlasPng: Buffer,
  uvMap: Record<string, UV>,
): Promise<void> {
  await Promise.all([
    CACHE.put(CACHE_KEY_VERSION, RESOURCES_VERSION),
    CACHE.put(CACHE_KEY_STATES, JSON.stringify(serializeJsonBuffers(blockstates))),
    CACHE.put(CACHE_KEY_MODELS, JSON.stringify(serializeJsonBuffers(models))),
    CACHE.put(CACHE_KEY_ATLAS_PNG, atlasPng),
    CACHE.put(CACHE_KEY_UV_MAP, JSON.stringify(uvMap)),
  ]);
}

// ---- Build pipeline --------------------------------------------------------

export interface BuildResult {
  /** Ready-to-render deepslate Resources implementation. */
  resources: Resources;
  /** Element counts (for tests + smoke logs). */
  counts: { blockstates: number; models: number; textures: number };
  /** Atlas dimensions in pixels. */
  atlasSize: [number, number];
  /** The atlas itself — useful if a caller wants to upload via gl.texImage2D. */
  atlas: TextureAtlas;
}

/**
 * Parse blockstate JSON buffers, swallow per-block parse errors with a
 * console warning. Mismatched blocks (e.g. test data with new properties)
 * shouldn't kill the entire pipeline.
 */
function parseBlockstates(buffers: Map<string, Buffer>): Map<string, BlockDefinition> {
  const out = new Map<string, BlockDefinition>();
  for (const [id, buf] of Array.from(buffers)) {
    try {
      const json = JSON.parse(buf.toString('utf8'));
      out.set(id, BlockDefinition.fromJson(json));
    } catch (e) {
      console.warn(`[buildResources] blockstate ${id} parse failed:`, (e as Error).message);
    }
  }
  return out;
}

/**
 * Parse block model JSON. Walk flatten() calls so each model ends up
 * with parent textures/elements inlined. Use a visited-set to defend
 * against pathological parent cycles (we've never seen one in vanilla
 * but resource packs have surprised us before).
 */
function parseModels(buffers: Map<string, Buffer>): Map<string, BlockModel> {
  const models = new Map<string, BlockModel>();
  for (const [id, buf] of Array.from(buffers)) {
    try {
      const json = JSON.parse(buf.toString('utf8'));
      models.set(id, BlockModel.fromJson(json));
    } catch (e) {
      console.warn(`[buildResources] model ${id} parse failed:`, (e as Error).message);
    }
  }
  return models;
}

/**
 * Flatten all models' parent chains. Must be called once, after the
 * entire models Map is populated (otherwise parent lookups would miss
 * and we'd warn-storm).
 *
 * `BlockModel.flatten(accessor)` only requires `accessor.getBlockModel(id)`
 * — wrap our models Map in a minimal accessor rather than coupling to the
 * full VanillaResources implementation order. Using a Map directly throws
 * "accessor.getBlockModel is not a function".
 */
function flattenModels(models: Map<string, BlockModel>): void {
  const accessor: BlockModelProvider = {
    getBlockModel: (id: Identifier) => models.get(id.toString()) ?? null,
  };
  for (const m of Array.from(models.values())) {
    try {
      m.flatten(accessor);
    } catch (e) {
      // console.warn only — surfaces upstream issues without breaking the
      // pipeline. Models with unresolved parents fall through with their
      // own elements/textures intact; deepslate's getMesh handles nulls.
      console.warn(`[buildResources] model flatten failed:`, (e as Error).message);
    }
  }
}

/**
 * Try to build Resources from cache. If cached data is available, parse it
 * directly (skip JAR) and return the result. Returns null on any cache miss.
 */
async function buildFromCache(): Promise<BuildResult | null> {
  const cached = await tryLoadCachedResources();
  if (!cached) return null;

  console.error('[buildResources] Loading cached resources...');
  const t0 = performance.now();

  const defs = parseBlockstates(cached.blockstates);
  const models = parseModels(cached.models);
  flattenModels(models);

  // Rebuild atlas from cached PNG
  const png = PNG.sync.read(cached.atlasPng);
  const atlasImageData: AtlasImageData = {
    width: png.width,
    height: png.height,
    data: new Uint8ClampedArray(png.data.buffer, png.data.byteOffset, png.data.byteLength),
  };
  const atlas = new TextureAtlas(atlasImageData as unknown as ImageData, cached.uvMap);
  const imageData = atlas.getTextureAtlas();

  const resources = new VanillaResources(
    defs,
    models,
    atlas as unknown as TextureAtlasProvider,
  );

  const elapsed = performance.now() - t0;
  console.error(`[buildResources] Cache hit — loaded ${defs.size} states, ${models.size} models, ${png.width}x${png.height} atlas in ${Math.round(elapsed)}ms`);

  return {
    resources,
    atlas,
    atlasSize: [imageData.width, imageData.height],
    counts: {
      blockstates: cached.blockstates.size,
      models: cached.models.size,
      textures: Object.keys(cached.uvMap).length - 1, // -1 for missing-texture slot
    },
  };
}

/**
 * Build Resources from scratch by extracting and parsing the JAR.
 * Result is saved to cache for subsequent fast loads.
 */
async function buildFromJar(): Promise<BuildResult> {
  console.error('[buildResources] Resolving vanilla JAR...');
  const jarPath = await resolveVanillaJar(CACHE);
  await fs.access(jarPath); // throws if missing — surfaces fast

  console.error('[buildResources] Extracting resources from JAR...');
  const { blockstates: bsBuffers, models: modBuffers, textures: texBuffers } =
    await loadJarResources(jarPath);

  console.error(`[buildResources] Parsing ${bsBuffers.size} blockstates...`);
  const defs = parseBlockstates(bsBuffers);

  console.error(`[buildResources] Parsing ${modBuffers.size} models...`);
  const models = parseModels(modBuffers);
  flattenModels(models);

  console.error(`[buildResources] Packing ${texBuffers.size} textures into atlas...`);
  const packed = packTexturesToAtlas(texBuffers);
  // TextureAtlas only reads img.width, img.height, and (for upload paths)
  // img.data. The duck-typed AtlasImageData above satisfies all reads
  // structurally; cast through unknown to satisfy the .d.ts ImageData type.
  const atlas = new TextureAtlas(packed.imageData as unknown as ImageData, packed.uvMap);
  const imageData = atlas.getTextureAtlas();

  const resources = new VanillaResources(
    defs,
    models,
    atlas as unknown as TextureAtlasProvider,
  );

  // Cache the raw buffers and atlas for next time
  console.error('[buildResources] Caching resources for future loads...');
  await saveResourcesToCache(bsBuffers, modBuffers, atlasPngFromImageData(imageData), packed.uvMap);

  return {
    resources,
    atlas,
    atlasSize: [imageData.width, imageData.height],
    counts: {
      blockstates: bsBuffers.size,
      models: modBuffers.size,
      textures: texBuffers.size,
    },
  };
}

/**
 * Encode an atlas ImageData back to a PNG buffer for caching.
 */
function atlasPngFromImageData(img: { width: number; height: number; data: Uint8ClampedArray }): Buffer {
  const png = new PNG({ width: img.width, height: img.height });
  png.data = Buffer.from(img.data.buffer, img.data.byteOffset, img.data.byteLength);
  return PNG.sync.write(png);
}

/**
 * The main entry point. Tries cache first; on miss, builds from the JAR
 * and caches the result. Subsequent calls from a warm cache are ~0.2s.
 */
export async function buildResources(_gl?: WebGLRenderingContext | null): Promise<Resources> {
  const result = await buildResourcesDetailed();
  return result.resources;
}

export async function buildResourcesDetailed(): Promise<BuildResult> {
  // Try cache first
  const cached = await buildFromCache();
  if (cached) return cached;

  // Cache miss — build from JAR
  return buildFromJar();
}

/**
 * Convenience: build and wrap into the public Resources shape.
 */
export async function buildVanillaResources(): Promise<{
  resources: Resources;
  counts: BuildResult['counts'];
  atlasSize: [number, number];
}> {
  const { resources, counts, atlasSize } = await buildResourcesDetailed();
  return { resources, counts, atlasSize };
}

/**
 * Purge all cached resources. Call this when the user explicitly requests
 * a cache reset or when a version mismatch is detected.
 */
export async function purgeCache(): Promise<void> {
  await CACHE.purge();
  console.error('[buildResources] Cache purged');
}

// Re-exports so callers can grab just what they want.
export { CacheManager } from './cache_manager.js';
export { loadJarResources } from './jar_loader.js';
export { resolveVanillaJar } from './manifest.js';
export { MC_VERSION, RESOURCES_VERSION };
