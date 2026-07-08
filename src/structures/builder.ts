/**
 * Build a `deepslate.Structure` from a list of `BlockSpec`s.
 *
 * Used by:
 *   - The `render_blocks` MCP tool (M4)
 *   - The fixture-generation script (`scripts/gen_fixtures.ts`)
 *
 * The structure is always axis-aligned, with the bounding box of all
 * input blocks translated so that the minimum corner sits at (0, 0, 0).
 * Block coordinates are taken relative to that box.
 */
import { Structure } from 'deepslate';
import type { BlockSpec } from './types.js';

export const Builder = {
  /**
   * Build a Structure containing exactly the given blocks.
   *
   * If `blocks` is empty, returns a 1×1×1 empty structure (deepslate
   * does not allow zero-size structures).
   */
  fromBlocks(blocks: BlockSpec[]): Structure {
    if (blocks.length === 0) {
      return new Structure([1, 1, 1]);
    }

    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (const b of blocks) {
      if (b.x < minX) minX = b.x;
      if (b.y < minY) minY = b.y;
      if (b.z < minZ) minZ = b.z;
      if (b.x > maxX) maxX = b.x;
      if (b.y > maxY) maxY = b.y;
      if (b.z > maxZ) maxZ = b.z;
    }
    const sizeX = maxX - minX + 1;
    const sizeY = maxY - minY + 1;
    const sizeZ = maxZ - minZ + 1;

    const structure = new Structure([sizeX, sizeY, sizeZ]);
    for (const b of blocks) {
      const lx = b.x - minX;
      const ly = b.y - minY;
      const lz = b.z - minZ;
      if (b.properties) {
        structure.addBlock([lx, ly, lz], b.block_id, b.properties);
      } else {
        structure.addBlock([lx, ly, lz], b.block_id);
      }
    }
    return structure;
  },
} as const;
