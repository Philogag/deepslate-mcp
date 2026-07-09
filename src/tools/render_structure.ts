/**
 * MCP tool: render_structure
 *
 * Load a Minecraft structure file (.nbt / .schem / .litematic) from disk
 * and render it to a PNG image. Returns a text summary + inline base64
 * image per the MCP image content type.
 *
 * Zoom support:
 *   The pipeline's `renderStructureToPNG` does not accept a zoom factor,
 *   so we implement our own render loop that passes a custom viewDist
 *   (computed as `(longest * 2.5) / zoom`) to `buildViewMatrix`.
 *
 * Background parsing re-implemented here (pipeline.ts keeps it private).
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { StructureRenderer, type Structure, type Resources } from 'deepslate';
import { loadStructure } from '../structures/index.js';
import { buildVanillaResources } from '../resources/index.js';
import { createHeadlessCanvas } from '../render/headless_canvas.js';
import { capturePNG } from '../render/encoder.js';
import { buildViewMatrix } from '../render/camera.js';
import { resolvePath, tempOutputPath } from '../utils/paths.js';
import * as fs from 'node:fs/promises';

// ---- Cached resources singleton ----

let cachedResources: Resources | null = null;
let resourcesBuildCounts: { blockstates: number; models: number; textures: number } | null = null;
let resourcesAtlasSize: [number, number] | null = null;

/**
 * Get (or build once) the vanilla resources. Subsequent calls reuse the
 * cached instance — the build is expensive (~3.5s) and doesn't change
 * within a single server lifetime.
 */
async function getResources(): Promise<{
  resources: Resources;
  counts: { blockstates: number; models: number; textures: number };
  atlasSize: [number, number];
}> {
  if (cachedResources) {
    return {
      resources: cachedResources,
      counts: resourcesBuildCounts!,
      atlasSize: resourcesAtlasSize!,
    };
  }
  const result = await buildVanillaResources();
  cachedResources = result.resources;
  resourcesBuildCounts = result.counts;
  resourcesAtlasSize = result.atlasSize;
  return result as unknown as {
    resources: Resources;
    counts: { blockstates: number; models: number; textures: number };
    atlasSize: [number, number];
  };
}

// ---- Background parser (mirrors pipeline.ts private function) ----

interface RGBA { r: number; g: number; b: number; a: number }

function parseBackground(input: string | undefined): RGBA {
  if (input === undefined || input === 'transparent') {
    return { r: 0, g: 0, b: 0, a: 0 };
  }
  const s = input.trim().toLowerCase();
  const hexMatch = /^#([0-9a-f]{6}|[0-9a-f]{8})$/.exec(s);
  if (hexMatch) {
    const hex = hexMatch[1]!;
    const r = parseInt(hex.slice(0, 2), 16) / 255;
    const g = parseInt(hex.slice(2, 4), 16) / 255;
    const b = parseInt(hex.slice(4, 6), 16) / 255;
    const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;
    return { r, g, b, a };
  }
  const fnMatch = /^rgba?\(\\s*([^)]+)\)$/.exec(s);
  if (fnMatch) {
    const parts = fnMatch[1]!.split(',').map((p: string) => p.trim());
    if (parts.length !== 3 && parts.length !== 4) {
      throw new Error(`Invalid background: ${input}`);
    }
    const nums = parts.map((p: string, i: number) => {
      if (i === 3) {
        const f = parseFloat(p);
        if (!Number.isFinite(f)) { throw new Error(`Invalid background alpha: ${input}`); }
        return f;
      }
      const n = parseInt(p, 10);
      if (!Number.isFinite(n) || n < 0 || n > 255) { throw new Error(`Invalid background channel: ${input}`); }
      return n / 255;
    });
    return { r: nums[0]!, g: nums[1]!, b: nums[2]!, a: nums[3] ?? 1 };
  }
  throw new Error(
    `Unsupported background value: ${input}. ` +
    'Use "transparent", "#RRGGBB", "#RRGGBBAA", "rgb(r,g,b)", or "rgba(r,g,b,a)".',
  );
}

// ---- Custom render with zoom support ----

/**
 * Render a Structure to a PNG buffer, with zoom support.
 *
 * Mirrors `renderStructureToPNG` from pipeline.ts but allows passing a
 * `zoom` factor that adjusts the camera distance inversely:
 *   viewDist = (longest * 2.5) / zoom
 */
async function renderWithZoom(
  structure: Structure,
  options: {
    width: number;
    height: number;
    angle: 'isometric' | 'top' | 'front' | 'side' | 'custom';
    rotationX?: number;
    rotationY?: number;
    zoom: number;
    background?: string;
    drawGrid?: boolean;
    drawOutlines?: boolean;
  },
): Promise<{ png: Buffer; durationMs: number }> {
  const {
    width, height, angle, rotationX, rotationY, zoom,
    background, drawGrid = false, drawOutlines = true,
  } = options;

  const t0 = performance.now();
  const { canvas, gl } = createHeadlessCanvas(width, height);

  try {
    // Background
    const bg = parseBackground(background);
    gl.clearColor(bg.r, bg.g, bg.b, bg.a);
    gl.clearDepth(1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // Resources (cached singleton)
    const { resources } = await getResources();

    // StructureRenderer
    const renderer = new StructureRenderer(gl, structure, resources);

    // Build view matrix with zoom-adjusted distance
    const size = structure.getSize() as [number, number, number];
    const longest = Math.max(size[0], size[1], size[2]);
    const defaultDist = longest * 2.5;
    const viewDist = defaultDist / Math.max(zoom, 0.01);

    let viewMatrix: ReturnType<typeof buildViewMatrix>;
    const DEG = Math.PI / 180;
    switch (angle) {
      case 'isometric':
        viewMatrix = buildViewMatrix(size, Math.atan(1 / Math.sqrt(2)), 45 * DEG, viewDist);
        break;
      case 'top':
        viewMatrix = buildViewMatrix(size, Math.PI / 2, -45 * DEG, viewDist);
        break;
      case 'front':
        viewMatrix = buildViewMatrix(size, 0, 0, viewDist);
        break;
      case 'side':
        viewMatrix = buildViewMatrix(size, 0, 90 * DEG, viewDist);
        break;
      case 'custom':
        viewMatrix = buildViewMatrix(size, rotationX ?? 0, rotationY ?? 0, viewDist);
        break;
      default:
        viewMatrix = buildViewMatrix(size, Math.atan(1 / Math.sqrt(2)), 45 * DEG, viewDist);
    }

    // Draw passes
    renderer.drawStructure(viewMatrix);
    renderer.drawInvisibleBlocks(viewMatrix);
    if (drawOutlines) {
      renderer.drawInvisibleBlocks(viewMatrix);
    }
    if (drawGrid) {
      renderer.drawGrid(viewMatrix);
    }

    const png = capturePNG(gl, width, height);
    const durationMs = performance.now() - t0;
    return { png, durationMs };
  } catch (err) {
    console.error('[renderWithZoom] failed:', err);
    throw err;
  }
}

// ---- Zod schema ----

const angleSchema = z.enum(['isometric', 'top', 'front', 'side', 'custom']);

const RenderStructureInput = z.object({
  nbt_path: z.string().describe('Path to a .nbt, .schem, or .litematic structure file'),
  output_path: z.string().optional().describe('Path to write the PNG (default: temp file)'),
  angle: angleSchema.optional().default('isometric').describe('Camera angle preset'),
  rotation_x: z.number().optional().describe('Custom X rotation in radians (only when angle=custom)'),
  rotation_y: z.number().optional().describe('Custom Y rotation in radians (only when angle=custom)'),
  rotation_z: z.number().optional().describe('Z rotation (currently unsupported, ignored)'),
  width: z.number().min(64).max(4096).optional().default(1024).describe('Output width in pixels'),
  height: z.number().min(64).max(4096).optional().default(768).describe('Output height in pixels'),
  background: z.string().optional().default('transparent').describe('Background color or transparent'),
  show_grid: z.boolean().optional().default(false).describe('Draw a 1-block grid overlay'),
  show_outline: z.boolean().optional().default(true).describe('Draw structure bounding-box wireframe'),
  zoom: z.number().optional().default(1.0).describe('Zoom factor, larger zooms in'),
});

// ---- Tool registration ----

export function registerRenderStructureTool(server: McpServer): void {
  server.tool(
    'render_structure',
    'Render a Minecraft structure file (.nbt/.schem/.litematic) to PNG',
    RenderStructureInput.shape,
    async (args: z.infer<typeof RenderStructureInput>) => {
      try {
        const nbtPath = resolvePath(args.nbt_path);
        const outputPath = args.output_path ? resolvePath(args.output_path) : tempOutputPath();

        // Load the structure
        const structure = await loadStructure(nbtPath);

        // Render with zoom support
        const { png, durationMs } = await renderWithZoom(structure, {
          width: args.width,
          height: args.height,
          angle: args.angle,
          rotationX: args.rotation_x,
          rotationY: args.rotation_y,
          zoom: args.zoom,
          background: args.background,
          drawGrid: args.show_grid,
          drawOutlines: args.show_outline,
        });

        // Write to disk
        await fs.writeFile(outputPath, png);

        // Base64 for inline image
        const base64 = png.toString('base64');

        return {
          content: [
            {
              type: 'text',
              text: `✅ Rendered in ${Math.round(durationMs)}ms\n📁 ${outputPath}\n📐 ${args.width}x${args.height}, ${args.angle}`,
            },
            {
              type: 'image',
              mimeType: 'image/png',
              data: base64,
            },
          ],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[render_structure] error:', msg);
        return {
          isError: true,
          content: [{ type: 'text', text: `❌ ${msg}` }],
        };
      }
    },
  );
}
