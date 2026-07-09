/**
 * MCP tool: inspect_structure
 *
 * Read structure metadata (size, block count, palette, entity count)
 * from a structure file without rendering. Useful for agents that need
 * to describe a structure before deciding how to render it.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { BlockState } from 'deepslate';
import { loadStructure } from '../structures/index.js';
import { resolvePath, basename } from '../utils/paths.js';

// ---- Schema ----

const inspectStructureSchema = z.object({
  nbt_path: z.string().describe('Path to a .nbt, .schem, or .litematic structure file'),
});

type InspectStructureArgs = z.infer<typeof inspectStructureSchema>;

// ---- Tool registration ----

export function registerInspectStructureTool(server: McpServer): void {
  server.tool(
    'inspect_structure',
    'Inspect structure file metadata without rendering',
    inspectStructureSchema.shape,
    async (args: InspectStructureArgs) => {
      try {
        const nbtPath = resolvePath(args.nbt_path);
        const structure = await loadStructure(nbtPath);

        const size = structure.getSize() as [number, number, number];
        const blocks = structure.getBlocks();

        // Count palette and non-air blocks
        const palette = new Map<string, number>();
        let blockCount = 0;
        let entityCount = 0;

        for (const block of blocks) {
          const name = block.state.getName().toString();

          // Count non-air blocks
          if (!block.state.is(BlockState.AIR)) {
            blockCount++;
            palette.set(name, (palette.get(name) ?? 0) + 1);
          }

          // Count blocks with NBT data (entities like chests, signs, etc.)
          if (block.nbt) {
            entityCount++;
          }
        }

        // Build palette lines, sorted by count descending
        const paletteLines: string[] = [];
        const sorted = [...palette.entries()].sort((a, b) => b[1] - a[1]);
        for (const [id, count] of sorted) {
          paletteLines.push(`     ${id} × ${count}`);
        }

        const paletteText = paletteLines.length > 0
          ? paletteLines.join('\n')
          : '     (air only)';

        const text = [
          `📦 Structure: ${basename(nbtPath)}`,
          `   size: ${size[0]} × ${size[1]} × ${size[2]} (W × H × D)`,
          `   blocks: ${blockCount}`,
          `   palette:`,
          paletteText,
          `   entities: ${entityCount}`,
        ].join('\n');

        return {
          content: [{ type: 'text', text }],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[inspect_structure] error:', msg);
        return {
          isError: true,
          content: [{ type: 'text', text: `❌ ${msg}` }],
        };
      }
    },
  );
}
