/**
 * Unit tests for CacheManager.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { CacheManager } from './cache_manager.js';
import { promises as fs } from 'fs';
import * as path from 'path';
import { Buffer } from 'buffer';

const TEST_CACHE_DIR = path.join(
  process.env.TEST_TMPDIR || '/tmp',
  'deepslate-mcp-test-cache-' + Date.now(),
);

// Override cache directory via env for testing
const ORIG_ENV = process.env.DEEPSLATE_CACHE_DIR;

describe('CacheManager', () => {
  let cache: CacheManager;

  beforeAll(() => {
    process.env.DEEPSLATE_CACHE_DIR = TEST_CACHE_DIR;
    cache = new CacheManager('test-ns');
  });

  afterAll(async () => {
    // Cleanup test cache
    try { await fs.rm(TEST_CACHE_DIR, { recursive: true, force: true }); } catch {}
    if (ORIG_ENV) process.env.DEEPSLATE_CACHE_DIR = ORIG_ENV;
    else delete process.env.DEEPSLATE_CACHE_DIR;
  });

  it('returns null for missing key', async () => {
    const result = await cache.get('nonexistent');
    expect(result).toBeNull();
  });

  it('returns null for missing JSON key', async () => {
    const result = await cache.getJson('nonexistent');
    expect(result).toBeNull();
  });

  it('stores and retrieves a Buffer', async () => {
    const data = Buffer.from('hello cache', 'utf8');
    await cache.put('my-key', data);

    const result = await cache.get('my-key');
    expect(result).toBeInstanceOf(Buffer);
    expect(result!.toString('utf8')).toBe('hello cache');
  });

  it('stores and retrieves a string', async () => {
    await cache.put('str-key', 'plain string');

    const result = await cache.get('str-key');
    expect(result!.toString('utf8')).toBe('plain string');
  });

  it('stores and retrieves JSON', async () => {
    const obj = { foo: 'bar', num: 42, nested: { a: [1, 2, 3] } };
    await cache.putJson('json-key', obj);

    const result = await cache.getJson<typeof obj>('json-key');
    expect(result).toEqual(obj);
  });

  it('reports exists for stored keys', async () => {
    await cache.put('exists-key', Buffer.from('yep'));
    expect(await cache.exists('exists-key')).toBe(true);
    expect(await cache.exists('does-not-exist')).toBe(false);
  });

  it('purges all cached data', async () => {
    await cache.put('purge-me', Buffer.from('bye'));
    expect(await cache.exists('purge-me')).toBe(true);

    await cache.purge();
    expect(await cache.get('purge-me')).toBeNull();
  });

  it('handles concurrent put/get correctly', async () => {
    const entries = Array.from({ length: 10 }, (_, i) => `concurrent-key-${i}`);
    await Promise.all(
      entries.map((k, i) => cache.put(k, Buffer.from(`value-${i}`))),
    );

    const results = await Promise.all(entries.map((k) => cache.get(k)));
    for (let i = 0; i < entries.length; i++) {
      expect(results[i]!.toString('utf8')).toBe(`value-${i}`);
    }
  });
});
