/**
 * MCP tool: render_blocks
 *
 * Build a structure from a programmatic block list (no file I/O) and render
 * it to PNG. This is useful for procedurally generating previews of small
 * structures described by an agent.
 *
 * Reuses the same render pipeline as render_structure (with zoom support).
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { StructureRenderer, type Structure, type Resources } from 'deepslate';
import { Builder, type BlockSpec } from '../structures/index.js';
import { buildVanillaResources } from '../resources/index.js';
import { createHeadlessCanvas } from '../render/headless_canvas.js';
import { capturePNG } from '../render/encoder.js';
import { buildViewMatrix } from '../render/camera.js';
import { resolvePath, tempOutputPath } from '../utils/paths.js';
import { parseBackground } from '../utils/color.js';
import * as fs from 'node:fs/promises';

// ---- Angle schema (shared with render_structure) ----

const angleSchema = z.enum(['isometric', 'top', 'front', 'side', 'custom']);

// ---- Cached resources singleton ----

let cachedResources: Resources | null = null;

async function getResources(): Promise<Resources> {
  if (cachedResources) return cachedResources;
  const result = await buildVanillaResources();
  cachedResources = result.resources;
  return result.resources;
}

// ---- Schema ----

const renderBlocksSchema = z.object({
  size: z.tuple([z.number(), z.number(), z.number()]).describe('Structure dimensions [width, height, depth]'),
  blocks: z.array(
    z.object({
      position: z.tuple([z.number(), z.number(), z.number()]).describe('Block position [x, y, z]'),
      block_id: z.string().describe('Namespaced block ID e.g. minecraft:stone'),
      properties: z.record(z.string(), z.string()).optional().describe('Block state properties'),
    }),
  ).describe('Array of blocks to place'),
  output_path: z.string().optional().describe('Path to write the PNG (default: temp file)'),
  angle: angleSchema.optional().default('isometric').describe('Camera angle preset'),
  rotation_x: z.number().optional().describe('Custom X rotation in radians (only when angle=custom)'),
  rotation_y: z.number().optional().describe('Custom Y rotation in radians (only when angle=custom)'),
  width: z.number().min(64).max(4096).optional().default(1024).describe('Output width in pixels'),
  height: z.number().min(64).max(4096).optional().default(768).describe('Output height in pixels'),
  background: z.string().optional().default('transparent').describe('Background color or transparent'),
});

type RenderBlocksArgs = z.infer<typeof renderBlocksSchema>;

// ---- Tool registration ----

export function registerRenderBlocksTool(server: McpServer): void {
  server.tool(
    'render_blocks',
    'Render a structure from a programmatic block list to PNG',
    renderBlocksSchema.shape,
    async (args: RenderBlocksArgs) => {
      try {
        // Convert input blocks to BlockSpec[]
        const specs: BlockSpec[] = args.blocks.map((b) => ({
          x: b.position[0],
          y: b.position[1],
          z: b.position[2],
          block_id: b.block_id,
          properties: b.properties,
        }));

        // Build Structure via Builder (auto-translates negative coords)
        const structure = Builder.fromBlocks(specs);
        const size = structure.getSize() as [number, number, number];

        const outputPath = args.output_path ? resolvePath(args.output_path) : tempOutputPath();

        // Render
        const t0 = performance.now();
        const { canvas, gl } = createHeadlessCanvas(args.width, args.height);

        try {
          const bg = parseBackground(args.background);
          gl.clearColor(bg.r, bg.g, bg.b, bg.a);
          gl.clearDepth(1.0);
          gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

          const resources = await getResources();
          const renderer = new StructureRenderer(gl, structure, resources);

          // View matrix
          const longest = Math.max(size[0], size[1], size[2]);
          const viewDist = longest * 2.5;
          const DEG = Math.PI / 180;

          let viewMatrix: ReturnType<typeof buildViewMatrix>;
          switch (args.angle) {
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
              viewMatrix = buildViewMatrix(size, args.rotation_x ?? 0, args.rotation_y ?? 0, viewDist);
              break;
            default:
              viewMatrix = buildViewMatrix(size, Math.atan(1 / Math.sqrt(2)), 45 * DEG, viewDist);
          }

          renderer.drawStructure(viewMatrix);
          renderer.drawInvisibleBlocks(viewMatrix);

          const png = capturePNG(gl, args.width, args.height);
          const durationMs = performance.now() - t0;

          await fs.writeFile(outputPath, png);
          const base64 = png.toString('base64');

          return {
            content: [
              {
                type: 'text',
                text: `✅ Rendered ${specs.length} blocks in ${Math.round(durationMs)}ms\n📁 ${outputPath}\n📐 ${args.width}×${args.height}, ${args.angle}`,
              },
              {
                type: 'image',
                mimeType: 'image/png',
                data: base64,
              },
            ],
          };
        } finally {
          // Let GC collect the GL context
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[render_blocks] error:', msg);
        return {
          isError: true,
          content: [{ type: 'text', text: `❌ ${msg}` }],
        };
      }
    },
  );
}
