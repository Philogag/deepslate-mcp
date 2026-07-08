// Read entries from a Mojang vanilla client.jar.
//
// Vanilla layout (1.20.4 client.jar):
//   assets/minecraft/blockstates/<name>.json     — block state definitions
//   assets/minecraft/models/block/<name>.json    — block models
//   assets/minecraft/textures/block/<name>.png   — block textures (16x16 typically)
//   assets/minecraft/textures/item/<name>.png    — item textures (ItemRenderer later)
//
// We use yauzl in `lazyEntries: true` mode: emit 'entry', then call
// readEntry() to advance to the next one. Pending reads are collected in
// an array and awaited when the 'end' event fires. NEVER substitute
// async/await for the event callback — yauzl is strictly event-driven
// when lazyEntries is enabled.
import * as yauzl from 'yauzl';
import { Buffer } from 'buffer';
import { promises as fs } from 'fs';
import * as path from 'path';

export type JarEntries = {
  /** "minecraft:stone" -> raw blockstate JSON bytes */
  blockstates: Map<string, Buffer>;
  /** "minecraft:block/cube_all" -> raw block model JSON bytes */
  models: Map<string, Buffer>;
  /** "minecraft:block/stone" -> raw PNG bytes (16x16 usually) */
  textures: Map<string, Buffer>;
};

type ZipFile = yauzl.ZipFile;
type Entry = yauzl.Entry;

function readEntry(zip: ZipFile, entry: Entry): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    zip.openReadStream(entry, (err: Error | null, stream: NodeJS.ReadableStream) => {
      if (err) return reject(err);
      const chunks: Buffer[] = [];
      stream.on('data', (c: Buffer | string) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    });
  });
}

/**
 * Stream all matching entries out of the JAR in a single yauzl open.
 *
 * Why a single open: yauzl emits 'entry' in central-directory order and
 * we capture the entry references asynchronously for readEntry(); if we
 * opened the jar per-entry we'd burn file handles and miss the streaming
 * benefit. The `pending` array accumulates in-flight reads; we resolve
 * only after all of them settle.
 */
async function readAllMatchingEntries(
  jarPath: string,
  match: (fileName: string) => 'blockstate' | 'model' | 'texture' | null,
): Promise<{ kind: string; base: string; buf: Buffer }[]> {
  return new Promise((resolve, reject) => {
    yauzl.open(jarPath, { lazyEntries: true }, (err: Error | null, zip: ZipFile) => {
      if (err) return reject(err);

      // Each matched entry produces a (kind, base, buf) tuple, kept in a
      // single ordered array so callers can iterate without index
      // misalignment between kind-specific arrays and the names list.
      const entries: { kind: string; base: string; buf: Buffer }[] = [];
      const pending: Promise<void>[] = [];

      zip.on('entry', (entry: Entry) => {
        const kind = match(entry.fileName);
        if (kind === null) {
          zip.readEntry();
          return;
        }
        const base = path.basename(entry.fileName, path.extname(entry.fileName));
        pending.push(
          readEntry(zip, entry).then((buf) => {
            entries.push({ kind, base, buf });
          }),
        );
        // CRITICAL: must advance the iterator even for matched entries —
        // otherwise `zip` hangs waiting for the next readEntry() call.
        zip.readEntry();
      });

      zip.on('end', () => {
        Promise.all(pending)
          .then(() => resolve(entries))
          .catch(reject);
      });
      zip.on('error', reject);
      zip.readEntry();
    });
  });
}

/**
 * Blockstates: nested under `blockstates/`. We namespace by
 * `minecraft:` so they match deepslate's Identifier convention.
 */
function blockstateMatcher(fileName: string): 'blockstate' | null {
  if (fileName.startsWith('assets/minecraft/blockstates/') && fileName.endsWith('.json')) {
    return 'blockstate';
  }
  return null;
}

/**
 * Block models: under `models/block/`. Keyed as `minecraft:block/<name>`
 * matching how deepslate resolves block model ids.
 */
function modelMatcher(fileName: string): 'model' | null {
  if (fileName.startsWith('assets/minecraft/models/block/') && fileName.endsWith('.json')) {
    return 'model';
  }
  return null;
}

/**
 * Block textures: under `textures/block/`, 16x16 PNGs in vanilla JAR.
 */
function textureMatcher(fileName: string): 'texture' | null {
  if (fileName.startsWith('assets/minecraft/textures/block/') && fileName.endsWith('.png')) {
    return 'texture';
  }
  return null;
}

/** Read all blockstates from a vanilla client.jar into a Map. */
export async function loadBlockstates(jarPath: string): Promise<Map<string, Buffer>> {
  if (!(await fs.stat(jarPath)).isFile()) {
    throw new Error(`JAR not found: ${jarPath}`);
  }
  const out = new Map<string, Buffer>();
  const entries = await readAllMatchingEntries(jarPath, blockstateMatcher);
  for (const { base, buf } of entries) {
    out.set(`minecraft:${base}`, buf);
  }
  return out;
}

/** Read all block models from a vanilla client.jar into a Map. */
export async function loadBlockModels(jarPath: string): Promise<Map<string, Buffer>> {
  if (!(await fs.stat(jarPath)).isFile()) {
    throw new Error(`JAR not found: ${jarPath}`);
  }
  const out = new Map<string, Buffer>();
  const entries = await readAllMatchingEntries(jarPath, modelMatcher);
  for (const { base, buf } of entries) {
    out.set(`minecraft:block/${base}`, buf);
  }
  return out;
}

/** Read all block textures from a vanilla client.jar into a Map. */
export async function loadBlockTextures(jarPath: string): Promise<Map<string, Buffer>> {
  if (!(await fs.stat(jarPath)).isFile()) {
    throw new Error(`JAR not found: ${jarPath}`);
  }
  const out = new Map<string, Buffer>();
  const entries = await readAllMatchingEntries(jarPath, textureMatcher);
  for (const { base, buf } of entries) {
    out.set(`minecraft:block/${base}`, buf);
  }
  return out;
}

/**
 * Composite load: reads all three categories in a single archive pass to
 * minimize `yauzl.open` cost on the 24MB JAR.
 */
export function jarEntryMatcher(fileName: string): 'blockstate' | 'model' | 'texture' | null {
  return blockstateMatcher(fileName) ?? modelMatcher(fileName) ?? textureMatcher(fileName);
}

export async function loadJarResources(jarPath: string): Promise<JarEntries> {
  if (!(await fs.stat(jarPath)).isFile()) {
    throw new Error(`JAR not found: ${jarPath}`);
  }
  const blockstates = new Map<string, Buffer>();
  const models = new Map<string, Buffer>();
  const textures = new Map<string, Buffer>();

  // Compose all three matchers into one pass; each entry has its own buf.
  const entries = await readAllMatchingEntries(jarPath, jarEntryMatcher);
  for (const { kind, base, buf } of entries) {
    if (kind === 'blockstate') blockstates.set(`minecraft:${base}`, buf);
    else if (kind === 'model') models.set(`minecraft:block/${base}`, buf);
    else textures.set(`minecraft:block/${base}`, buf);
  }

  return { blockstates, models, textures };
}
