/**
 * Unit tests for Litematica loader.
 */
import { describe, it, expect } from 'vitest';
import { loadLitematicStructure } from './litematic_loader.js';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.resolve(__dirname, '..', '..', 'examples', 'fixtures');

describe('loadLitematicStructure', () => {
  it('loads tree.litematic with correct dimensions', async () => {
    const structure = await loadLitematicStructure(path.join(FIXTURES, 'tree.litematic'));
    const size = structure.getSize() as [number, number, number];
    expect(size).toEqual([5, 6, 5]);
  });

  it('loads tree.litematic with correct block count', async () => {
    const structure = await loadLitematicStructure(path.join(FIXTURES, 'tree.litematic'));
    const blocks = structure.getBlocks();
    expect(blocks.length).toBe(49);
  });

  it('loads tree.litematic with correct palette', async () => {
    const structure = await loadLitematicStructure(path.join(FIXTURES, 'tree.litematic'));
    const blocks = structure.getBlocks();
    const palette = new Set(blocks.map(b => b.state.getName().toString()));
    expect(palette.has('minecraft:oak_log')).toBe(true);
    expect(palette.has('minecraft:oak_leaves')).toBe(true);
    expect(palette.size).toBe(2);
  });

  it('throws for file missing Regions compound', async () => {
    // A non-litematic NBT file should fail with a helpful error
    await expect(
      loadLitematicStructure(path.join(FIXTURES, 'tiny_house.nbt')),
    ).rejects.toThrow('Regions');
  });

  it('throws for non-existent file', async () => {
    await expect(
      loadLitematicStructure('/nonexistent.litematic'),
    ).rejects.toThrow();
  });
});
