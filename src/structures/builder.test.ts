/**
 * Unit tests for the Builder (programmatic structure construction).
 */
import { describe, it, expect } from 'vitest';
import { Builder } from './builder.js';

describe('Builder.fromBlocks', () => {
  it('returns a 1x1x1 empty structure for empty input', () => {
    const structure = Builder.fromBlocks([]);
    const size = structure.getSize();
    expect(size[0]).toBe(1);
    expect(size[1]).toBe(1);
    expect(size[2]).toBe(1);
    // Empty structure: no blocks explicitly added (air is implicit)
    expect(structure.getBlocks().length).toBe(0);
  });

  it('builds a single-block structure', () => {
    const structure = Builder.fromBlocks([
      { x: 0, y: 0, z: 0, block_id: 'minecraft:stone' },
    ]);
    const size = structure.getSize();
    expect(size).toEqual([1, 1, 1]);
    const blocks = structure.getBlocks();
    expect(blocks.length).toBe(1);
    expect(blocks[0]!.state.getName().toString()).toBe('minecraft:stone');
  });

  it('handles negative coordinates by translating to origin', () => {
    const structure = Builder.fromBlocks([
      { x: -5, y: -5, z: -5, block_id: 'minecraft:dirt' },
    ]);
    const size = structure.getSize();
    expect(size).toEqual([1, 1, 1]); // single block, just translated
    const blocks = structure.getBlocks();
    expect(blocks.length).toBe(1);
    expect(blocks[0]!.state.getName().toString()).toBe('minecraft:dirt');
  });

  it('builds correct bounding box for multi-block structure', () => {
    const structure = Builder.fromBlocks([
      { x: 0, y: 0, z: 0, block_id: 'minecraft:stone' },
      { x: 5, y: 3, z: 2, block_id: 'minecraft:oak_planks' },
    ]);
    const size = structure.getSize();
    expect(size[0]).toBe(6); // 0..5 inclusive
    expect(size[1]).toBe(4); // 0..3 inclusive
    expect(size[2]).toBe(3); // 0..2 inclusive
  });

  it('passes block properties', () => {
    const structure = Builder.fromBlocks([
      {
        x: 0, y: 0, z: 0,
        block_id: 'minecraft:oak_log',
        properties: { axis: 'x' },
      },
    ]);
    const blocks = structure.getBlocks();
    expect(blocks.length).toBe(1);
    expect(blocks[0]!.state.getName().toString()).toBe('minecraft:oak_log');
  });

  it('handles multi-block with various block types', () => {
    const blocks = [
      { x: 0, y: 0, z: 0, block_id: 'minecraft:stone' },
      { x: 1, y: 0, z: 0, block_id: 'minecraft:dirt' },
      { x: 0, y: 1, z: 0, block_id: 'minecraft:grass_block' },
      { x: 0, y: 0, z: 1, block_id: 'minecraft:cobblestone' },
    ];
    const structure = Builder.fromBlocks(blocks);
    expect(structure.getSize()).toEqual([2, 2, 2]);
    const loaded = structure.getBlocks();
    expect(loaded.length).toBe(4);
  });
});
