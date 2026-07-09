/**
 * Unit tests for path resolution utilities.
 */
import { describe, it, expect } from 'vitest';
import { resolvePath, tempOutputPath, basename } from './paths.js';

describe('resolvePath', () => {
  it('returns absolute paths unchanged', () => {
    expect(resolvePath('/tmp/foo.nbt')).toBe('/tmp/foo.nbt');
  });

  it('resolves relative paths', () => {
    const result = resolvePath('foo.nbt');
    expect(result).toContain('foo.nbt');
    expect(result.startsWith('/')).toBe(true); // absolute
  });

  it('handles paths with parent dirs', () => {
    const result = resolvePath('../foo.nbt');
    expect(result).toContain('foo.nbt');
    expect(result.startsWith('/')).toBe(true);
  });
});

describe('tempOutputPath', () => {
  it('returns a path in the system tmp directory', () => {
    const result = tempOutputPath();
    expect(result).toContain('/tmp/');
    expect(result).toContain('deepslate-mcp-');
    expect(result.endsWith('.png')).toBe(true);
  });

  it('uses custom extension', () => {
    const result = tempOutputPath('.nbt');
    expect(result.endsWith('.nbt')).toBe(true);
  });

  it('generates unique paths on successive calls', async () => {
    const a = tempOutputPath();
    // Ensure a different timestamp by waiting 1ms
    await new Promise(r => setTimeout(r, 1));
    const b = tempOutputPath();
    expect(a).not.toBe(b);
  });
});

describe('basename', () => {
  it('extracts filename from absolute path', () => {
    expect(basename('/path/to/file.nbt')).toBe('file.nbt');
  });

  it('extracts filename from relative path', () => {
    expect(basename('dir/file.nbt')).toBe('file.nbt');
  });

  it('returns the name for a bare filename', () => {
    expect(basename('file.nbt')).toBe('file.nbt');
  });
});
