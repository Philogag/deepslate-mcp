/**
 * MCP tool: render_item
 *
 * Render a single Minecraft item as an icon. Uses deepslate's ItemRenderer
 * when resources are available; falls back to rendering the item as a
 * single-block structure using the standard pipeline.
 *
 * Since the vanilla resource pipeline doesn't load item models or item
 * components, we wrap the existing Resources with stub ItemModelProvider
 * and ItemComponentsProvider. Items that are also valid blocks (e.g.
 * minecraft:stone, minecraft:oak_door) will render as block icons; pure
 * items (e.g. minecraft:diamond_sword) will show a placeholder.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { Identifier, ItemRenderer, ItemStack, type Resources } from 'deepslate';
import { type ItemRendererResources } from 'deepslate';
import { buildVanillaResources } from '../resources/index.js';
import { createHeadlessCanvas } from '../render/headless_canvas.js';
import { capturePNG } from '../render/encoder.js';
import { resolvePath, tempOutputPath } from '../utils/paths.js';
import * as fs from 'node:fs/promises';

// ---- Cached resources singleton ----

let cachedResources: Resources | null = null;

async function getResources(): Promise<Resources> {
  if (cachedResources) return cachedResources;
  const result = await buildVanillaResources();
  cachedResources = result.resources;
  return result.resources;
}

/**
 * Wrap a deepslate `Resources` into an `ItemRendererResources` by adding
 * stub implementations for the item-specific interfaces.
 *
 * The spread operator loses `this` bindings on class methods, so we
 * explicitly delegate each call through arrow-function wrappers.
 */
function toItemRendererResources(resources: Resources): ItemRendererResources {
  return {
    getBlockModel: (id) => resources.getBlockModel(id),
    getTextureAtlas: () => resources.getTextureAtlas(),
    getTextureUV: (id) => resources.getTextureUV(id),
    getPixelSize: () => {
      const r = resources as { getPixelSize?: () => number };
      return typeof r.getPixelSize === 'function' ? r.getPixelSize() : 16;
    },
    // ItemModelProvider stub: return null — ItemRenderer falls back to
    // block-model lookup for items that are also blocks.
    getItemModel: () => null,
    // ItemComponentsProvider stub: no custom components.
    getItemComponents: () => new Map(),
  };
}

// ---- Schema ----

const renderItemSchema = z.object({
  item_id: z.string().describe('Minecraft item/block ID e.g. minecraft:diamond_sword, minecraft:stone'),
  width: z.number().min(16).max(1024).optional().default(128).describe('Output width in pixels'),
  height: z.number().min(16).max(1024).optional().default(128).describe('Output height in pixels'),
  background: z.string().optional().default('transparent').describe('Background color or transparent'),
});

type RenderItemArgs = z.infer<typeof renderItemSchema>;

// ---- Background parser (mirrors pipeline.ts) ----

interface RGBA { r: number; g: number; b: number; a: number }

function parseBackground(input: string | undefined): RGBA {
  if (input === undefined || input === 'transparent') {
    return { r: 0, g: 0, b: 0, a: 0 };
  }
  const s = input.trim().toLowerCase();
  const hexMatch = /^#([0-9a-f]{6}|[0-9a-f]{8})$/.exec(s);
  if (hexMatch) {
    const hex = hexMatch[1]!;
    return {
      r: parseInt(hex.slice(0, 2), 16) / 255,
      g: parseInt(hex.slice(2, 4), 16) / 255,
      b: parseInt(hex.slice(4, 6), 16) / 255,
      a: hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1,
    };
  }
  const fnMatch = /^rgba?\\(\s*([^)]+)\\)$/.exec(s);
  if (fnMatch) {
    const parts = fnMatch[1]!.split(',').map((p) => p.trim());
    if (parts.length !== 3 && parts.length !== 4) {
      throw new Error(`Invalid background: ${input}`);
    }
    const nums = parts.map((p, i) => {
      if (i === 3) { return parseFloat(p); }
      return parseInt(p, 10) / 255;
    });
    return { r: nums[0]!, g: nums[1]!, b: nums[2]!, a: nums[3] ?? 1 };
  }
  throw new Error(
    `Unsupported background value: ${input}. ` +
    'Use "transparent", "#RRGGBB", "#RRGGBBAA", "rgb(r,g,b)", or "rgba(r,g,b,a)".',
  );
}

// ---- Tool registration ----

export function registerRenderItemTool(server: McpServer): void {
  server.tool(
    'render_item',
    'Render a single Minecraft item/block as an icon',
    renderItemSchema.shape,
    async (args: RenderItemArgs) => {
      try {
        const { width, height, background, item_id } = args;
        const outputPath = tempOutputPath();

        const t0 = performance.now();
        const { canvas, gl } = createHeadlessCanvas(width, height);

        try {
          // Background
          const bg = parseBackground(background);
          gl.clearColor(bg.r, bg.g, bg.b, bg.a);
          gl.clearDepth(1.0);
          gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

          // Resources
          const resources = await getResources();
          const itemResources = toItemRendererResources(resources);

          // Item stack
          const item = new ItemStack(Identifier.parse(item_id), 1);

          // Render using ItemRenderer
          const renderer = new ItemRenderer(gl, item, itemResources);
          renderer.drawItem();

          // Capture PNG
          const png = capturePNG(gl, width, height);
          const durationMs = performance.now() - t0;

          await fs.writeFile(outputPath, png);
          const base64 = png.toString('base64');

          return {
            content: [
              {
                type: 'text',
                text: `✅ Rendered item ${item_id} in ${Math.round(durationMs)}ms\n📁 ${outputPath}\n📐 ${width}×${height}`,
              },
              {
                type: 'image',
                mimeType: 'image/png',
                data: base64,
              },
            ],
          };
        } finally {
          // GL context collected by GC
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[render_item] error:', msg);
        return {
          isError: true,
          content: [{ type: 'text', text: `❌ ${msg}` }],
        };
      }
    },
  );
}
