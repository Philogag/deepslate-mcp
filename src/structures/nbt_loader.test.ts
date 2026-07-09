/**
 * Unit tests for NBT structure loader.
 */
import { describe, it, expect } from 'vitest';
import { loadNbtStructure } from './nbt_loader.js';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.resolve(__dirname, '..', '..', 'examples', 'fixtures');

describe('loadNbtStructure', () => {
  it('loads tiny_house.nbt with correct dimensions', async () => {
    const structure = await loadNbtStructure(path.join(FIXTURES, 'tiny_house.nbt'));
    const size = structure.getSize() as [number, number, number];
    expect(size).toEqual([4, 4, 4]);
  });

  it('loads tiny_house.nbt with correct block count', async () => {
    const structure = await loadNbtStructure(path.join(FIXTURES, 'tiny_house.nbt'));
    const blocks = structure.getBlocks();
    expect(blocks.length).toBe(55);
  });

  it('loads tiny_house.nbt with correct palette entries', async () => {
    const structure = await loadNbtStructure(path.join(FIXTURES, 'tiny_house.nbt'));
    const blocks = structure.getBlocks();
    const palette = new Set(blocks.map(b => b.state.getName().toString()));
    expect(palette.has('minecraft:cobblestone')).toBe(true);
    expect(palette.has('minecraft:oak_planks')).toBe(true);
    expect(palette.has('minecraft:oak_slab')).toBe(true);
    expect(palette.has('minecraft:glass')).toBe(true);
    expect(palette.size).toBe(4);
  });

  it('loads blocks-demo.nbt', async () => {
    const structure = await loadNbtStructure(path.join(FIXTURES, 'blocks-demo.nbt'));
    const size = structure.getSize() as [number, number, number];
    expect(size).toEqual([5, 3, 5]);
    const blocks = structure.getBlocks();
    expect(blocks.length).toBe(42);
  });

  it('throws a helpful error for non-existent file', async () => {
    await expect(
      loadNbtStructure('/nonexistent/path.nbt'),
    ).rejects.toThrow();
  });
});
