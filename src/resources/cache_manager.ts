// Local file cache for resources. Keys are namespaced by version prefix
// so a version bump invalidates everything at once.
import { promises as fs } from 'fs';
import { createHash } from 'crypto';
import * as path from 'path';

const CACHE_ROOT = process.env.DEEPSLATE_CACHE_DIR
  || path.join(process.env.HOME || '~', '.cache', 'deepslate-mcp');

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

function keyToPath(key: string): string {
  // Avoid path traversal: only allow [A-Za-z0-9._/-]
  const safe = key.replace(/[^A-Za-z0-9._/-]/g, '_');
  const hash = createHash('sha1').update(key).digest('hex').slice(0, 8);
  // Two-level sharding by hash prefix to keep directory sizes bounded.
  return path.join(CACHE_ROOT, hash.slice(0, 2), hash.slice(2, 4), hash + '-' + path.basename(safe));
}

export class CacheManager {
  constructor(private readonly namespace: string) {}

  private prefixed(key: string): string {
    return `${this.namespace}/${key}`;
  }

  async get(key: string): Promise<Buffer | null> {
    const p = keyToPath(this.prefixed(key));
    try {
      return await fs.readFile(p);
    } catch (e: any) {
      if (e.code === 'ENOENT') return null;
      throw e;
    }
  }

  async getJson<T = unknown>(key: string): Promise<T | null> {
    const buf = await this.get(key + '.json');
    if (!buf) return null;
    try {
      return JSON.parse(buf.toString('utf8')) as T;
    } catch {
      return null;
    }
  }

  async put(key: string, data: Buffer | string): Promise<void> {
    const p = keyToPath(this.prefixed(key));
    await ensureDir(path.dirname(p));
    await fs.writeFile(p, data);
  }

  async putJson(key: string, data: unknown): Promise<void> {
    await this.put(key + '.json', JSON.stringify(data));
  }

  async exists(key: string): Promise<boolean> {
    const p = keyToPath(this.prefixed(key));
    try {
      await fs.access(p);
      return true;
    } catch {
      return false;
    }
  }

  async purge(): Promise<void> {
    await fs.rm(CACHE_ROOT, { recursive: true, force: true });
    await ensureDir(CACHE_ROOT);
  }
}