// Resolve the location of the Mojang vanilla client.jar we want to read.
//
// Resolution order:
//   1. `DEEPSLATE_JAR_PATH` env var (lets users point at a pre-downloaded jar)
//   2. Cache manager "vanilla-jar-path" key (set by a previous successful resolution)
//   3. Mojang version_manifest_v2.json — fetch the 1.20.4 entry, follow the URL,
//      download to the cache dir, then cache the path
//
// We don't try to verify the SHA1 from the manifest against the file's
// actual hash here — CacheManager.purge() can wipe a bad copy, and the
// .jar_loader code path will surface any decode error loudly.
import { promises as fs } from 'fs';
import * as path from 'path';
import { Buffer } from 'buffer';
import { MC_VERSION } from '../version.js';
import { CacheManager } from './cache_manager.js';

const MOJANG_MANIFEST = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';
const MANIFEST_KEY = 'vanilla-jar-path';

interface VersionEntry {
  id: string;
  url: string;
}

interface ManifestV2 {
  versions: VersionEntry[];
}

interface VersionDetail {
  downloads: {
    client?: { url: string; sha1: string; size: number };
  };
}

/**
 * Look up the client.jar download URL for a specific MC version.
 * Throws if the version isn't in the manifest or has no client download.
 */
async function fetchClientJarUrl(version: string): Promise<string> {
  const res = await fetch(MOJANG_MANIFEST);
  if (!res.ok) throw new Error(`manifest HTTP ${res.status}: ${MOJANG_MANIFEST}`);
  const data = (await res.json()) as ManifestV2;
  const entry = data.versions.find((v) => v.id === version);
  if (!entry) throw new Error(`Mojang manifest has no entry for ${version}`);

  const detailRes = await fetch(entry.url);
  if (!detailRes.ok) throw new Error(`version detail HTTP ${detailRes.status}`);
  const detail = (await detailRes.json()) as VersionDetail;
  const client = detail.downloads.client;
  if (!client) throw new Error(`version ${version} has no client download`);
  return client.url;
}

/**
 * Download the URL to `destPath`, returning the same path on success.
 * Streams via fetch's body so we don't buffer the whole 24MB into V8.
 */
async function downloadTo(url: string, destPath: string): Promise<string> {
  await fs.mkdir(path.dirname(destPath), { recursive: true });
  const res = await fetch(url);
  if (!res.ok) throw new Error(`jar HTTP ${res.status}: ${url}`);
  if (!res.body) throw new Error('jar response missing body');
  const file = await fs.open(destPath, 'w');
  try {
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      await file.write(value, 0, value.length);
    }
  } finally {
    await file.close();
  }
  return destPath;
}

/**
 * Public entry point. Returns an absolute path to a vanilla client.jar
 * for `MC_VERSION`. Caches the resolved path so subsequent calls hit the
 * cache layer.
 */
export async function resolveVanillaJar(cache: CacheManager): Promise<string> {
  // 1. Hard override
  const envOverride = process.env.DEEPSLATE_JAR_PATH;
  if (envOverride) {
    if (!(await fs.stat(envOverride)).isFile()) {
      throw new Error(`DEEPSLATE_JAR_PATH points at non-file: ${envOverride}`);
    }
    return envOverride;
  }

  // 2. Previously-cached path
  const cached = await cache.get(MANIFEST_KEY);
  if (cached) {
    const p = cached.toString('utf8');
    try {
      if ((await fs.stat(p)).isFile()) return p;
    } catch {
      // Cached path no longer exists; fall through and re-resolve.
    }
  }

  // 3. Network fallback: ask Mojang where 1.20.4 lives, download it.
  const url = await fetchClientJarUrl(MC_VERSION);
  const cacheRoot = process.env.DEEPSLATE_CACHE_DIR
    || path.join(process.env.HOME || '~', '.cache', 'deepslate-mcp');
  const destPath = path.join(cacheRoot, 'client-' + MC_VERSION + '.jar');
  await downloadTo(url, destPath);
  // Record the resolved path so future calls skip the network.
  await cache.put(MANIFEST_KEY, Buffer.from(destPath, 'utf8'));
  return destPath;
}

// Re-exported for tests that want to point at a specific file.
export async function resolveSpecificJar(p: string): Promise<string> {
  if (!(await fs.stat(p)).isFile()) {
    throw new Error(`JAR not found: ${p}`);
  }
  return p;
}
