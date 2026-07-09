/**
 * Loader for Sponge Schematic `.schem` files.
 *
 * Top-level NbtCompound:
 *   - Width  (NbtShort) — size along X
 *   - Height (NbtShort) — size along Y
 *   - Length (NbtShort) — size along Z
 *   - Palette (NbtCompound) — keys are block-id strings
 *     (e.g. "minecraft:stone"), values are NbtInt palette indices
 *   - BlockData (NbtList<NbtByte> OR NbtList<NbtInt>) — block indices
 *     laid out in YZX order:
 *         index = (y * Length + z) * Width + x
 *   - BlockEntities (NbtList<NbtCompound>, optional)
 *   - Offset (NbtList<NbtInt>, optional) — [x, y, z] world origin
 *
 * We iterate `BlockData` in YZX order, map each palette index back
 * to its block-id via reverse-Palette, and call `structure.addBlock`
 * once per non-air block. Block entities are attached to the matching
 * block via the 4th argument of `addBlock` when present.
 */
import { readFile } from 'node:fs/promises';
import {
  NbtCompound,
  NbtFile,
  NbtList,
  Structure,
} from 'deepslate';

export async function loadSchemStructure(path: string): Promise<Structure> {
  const buf = await readFile(path);
  const nbt = NbtFile.read(new Uint8Array(buf));
  const root = nbt.root;

  const width = root.getNumber('Width');
  const height = root.getNumber('Height');
  const length = root.getNumber('Length');

  if (width <= 0 || height <= 0 || length <= 0) {
    throw new Error(
      `Invalid Sponge schematic dimensions: ${width}x${height}x${length} in ${path}`,
    );
  }

  // Palette: NbtCompound { "minecraft:stone": NbtInt(0), ... }
  // Reverse it to a number -> blockId lookup.
  const paletteNbt = root.getCompound('Palette');
  const indexToBlockId = new Map<number, string>();
  paletteNbt.forEach((key, value) => {
    const idx = value.getAsNumber();
    indexToBlockId.set(idx, key);
  });

  // BlockData is YZX-ordered. Element type varies by palette size
  // (NbtByte for ≤256 entries, NbtInt for larger).
  const blockData = root.get('BlockData');
  if (!(blockData instanceof NbtList)) {
    throw new Error(
      `Sponge schematic missing or invalid BlockData list in ${path}`,
    );
  }

  // Pre-build a map from (x, y, z) -> block-entity NbtCompound, so
  // we can attach it when we add the block. Vanilla schematics put
  // "Pos" as NbtList<NbtInt> with [x, y, z].
  const entityByPos = new Map<string, NbtCompound>();
  const blockEntities = root.get('BlockEntities');
  if (blockEntities instanceof NbtList) {
    for (let i = 0; i < blockEntities.length; i++) {
      const entry = blockEntities.get(i);
      if (!entry || !entry.isCompound()) continue;
      // Cast through unknown: NbtList<NbtCompound> types entries as
      // NbtTag, but we've just checked isCompound(). The deepslate
      // public API only exposes NbtList.get(i) returning NbtTag, so
      // the runtime check + cast is the documented escape hatch.
      const compound = entry as unknown as NbtCompound;
      const pos = compound.get('Pos');
      if (pos instanceof NbtList && pos.length === 3) {
        const px = pos.getNumber(0);
        const py = pos.getNumber(1);
        const pz = pos.getNumber(2);
        entityByPos.set(`${px},${py},${pz}`, compound);
      }
    }
  }

  const structure = new Structure([width, height, length]);

  const totalBlocks = width * height * length;
  const logThreshold = Math.max(1, Math.floor(totalBlocks / 10));
  let nextLog = logThreshold;

  for (let y = 0; y < height; y++) {
    for (let z = 0; z < length; z++) {
      for (let x = 0; x < width; x++) {
        const linearIndex = (y * length + z) * width + x;
        // Log progress every 10% for large structures
        if (linearIndex >= nextLog && totalBlocks > 100000) {
          const pct = Math.round((linearIndex / totalBlocks) * 100);
          console.error(`[schem] ${pct}% (${linearIndex}/${totalBlocks} blocks)`);
          nextLog = linearIndex + logThreshold;
        }
        const tag = blockData.get(linearIndex);
        if (tag === undefined) continue;
        const paletteIdx = tag.getAsNumber();
        // Vanilla schematics reserve 0 for "air"; skip it to keep
        // structures lean. (Spec: air is the default empty state.)
        if (paletteIdx === 0) continue;
        const blockId = indexToBlockId.get(paletteIdx);
        if (!blockId) continue;
        const entityNbt = entityByPos.get(`${x},${y},${z}`);
        if (entityNbt !== undefined) {
          // deepslate's addBlock takes an NbtCompound as 4th arg.
          // Our stored value is an NbtCompound; pass it through.
          structure.addBlock([x, y, z], blockId, undefined, entityNbt);
        } else {
          structure.addBlock([x, y, z], blockId);
        }
      }
    }
  }

  return structure;
}
