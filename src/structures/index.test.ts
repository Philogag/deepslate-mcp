/**
 * Unit tests for structure dispatcher (loadStructure).
 */
import { describe, it, expect } from 'vitest';
import { loadStructure } from './index.js';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.resolve(__dirname, '..', '..', 'examples', 'fixtures');

describe('loadStructure (dispatcher)', () => {
  it('dispatches .nbt files to NBT loader', async () => {
    const structure = await loadStructure(path.join(FIXTURES, 'tiny_house.nbt'));
    const size = structure.getSize() as [number, number, number];
    expect(size).toEqual([4, 4, 4]);
  });

  it('dispatches .schem files to schem loader', async () => {
    const structure = await loadStructure(path.join(FIXTURES, 'door.schem'));
    const size = structure.getSize() as [number, number, number];
    expect(size).toEqual([1, 3, 1]);
  });

  it('dispatches .litematic files to litematic loader', async () => {
    const structure = await loadStructure(path.join(FIXTURES, 'tree.litematic'));
    const size = structure.getSize() as [number, number, number];
    expect(size).toEqual([5, 6, 5]);
  });

  it('accepts uppercase extensions in dispatcher (case-insensitive matching)', async () => {
    // The dispatcher converts extension to lowercase before matching,
    // so .NBT dispatches to NBT loader (ENOENT instead of "Unsupported")
    try {
      await loadStructure('/tmp/test.NBT');
      // Should not reach here - file doesn't exist
      expect(true).toBe(false);
    } catch (e: any) {
      // Should NOT be "Unsupported" error
      expect(e.message).not.toContain('Unsupported');
      expect(e.message).toContain('ENOENT');
    }
  });

  it('throws for unsupported extension', async () => {
    await expect(
      loadStructure('test.schematic'),
    ).rejects.toThrow('Unsupported');
  });

  it('throws for missing file', async () => {
    await expect(
      loadStructure('/nonexistent/file.nbt'),
    ).rejects.toThrow();
  });
});
