/**
 * Loader for Litematica `.litematic` files.
 *
 * A litematic is a single NbtCompound with one mandatory top-level
 * key: `Regions`, a NbtList<NbtCompound>. Each region compound has:
 *
 *   - `Position` (NbtList<NbtInt>, length 3) — world origin offset
 *     for this region; we subtract this to produce structure-local
 *     coordinates.
 *   - `Size` (NbtList<NbtInt>, length 3) — [sizeX, sizeY, sizeZ] of
 *     the region in blocks.
 *   - `BlockStatePalette` (NbtList<NbtCompound>) — each entry is a
 *     BlockState (Name + optional Properties).
 *   - `BlockStates` (NbtLongArray) — bit-packed palette indices.
 *
 * Bit-packing:
 *   - `bits = max(2, ceil(log2(palette_size)))` (in practice, the
 *     real algorithm is `32 - floor(log2(palette_size - 1))`).
 *   - For each block i (0-based, in YXZ order:
 *       `linearIndex = y * sizeX * sizeZ + z * sizeX + x`
 *     ), read `bits` bits starting at bit offset `i * bits` in the
 *     packed long array. The array is big-endian-ish in the deepslate
 *     sense: each Long is a Java-style signed 64-bit int.
 *   - Cross-long reads are joined low|high when `i * bits` straddles
 *     a 64-bit boundary.
 *
 * YXZ indexing for litematic (vanilla `PackedIntegerArray`):
 *       linearIndex = y * sizeX * sizeZ + z * sizeX + x
 * i.e. x is innermost, then z, then y is outermost.
 *
 * We use deepslate's `NbtLongArray.getItems()` to get the long pairs,
 * convert each pair to a BigInt, and do all bit math in BigInt space.
 */
import { readFile } from 'node:fs/promises';
import {
  NbtFile,
  NbtList,
  Structure,
} from 'deepslate';

type BlockStateTag = {
  Name: string;
  Properties?: Record<string, string>;
};

function parseBlockState(nbt: unknown): BlockStateTag {
  // NbtCompound-like: must have getString('Name') and an optional
  // Properties compound. We duck-type because the deepslate TS types
  // on NbtList entries are NbtTag, not NbtCompound.
  const compound = nbt as {
    getString?: (k: string) => string;
    getCompound?: (k: string) => {
      forEach: (fn: (k: string, v: { getAsString: () => string }) => void) => void;
    };
  };
  const name = compound.getString?.('Name') ?? 'minecraft:air';
  const props: Record<string, string> = {};
  const propsNbt = compound.getCompound?.('Properties');
  if (propsNbt) {
    propsNbt.forEach((k, v) => {
      props[k] = v.getAsString();
    });
  }
  return { Name: name, Properties: props };
}

function packedBitsForPalette(paletteSize: number): number {
  if (paletteSize <= 1) return 2;
  // Vanilla Litematica stores blocks packed into a LongArray with the
  // smallest number of bits per entry that can hold the palette, with
  // a hard floor of 2 bits. So `bits = max(2, ceil(log2(paletteSize)))`.
  return Math.max(2, Math.ceil(Math.log2(paletteSize)));
}

function readBitRange(
  longs: bigint[],
  bitOffset: number,
  bits: number,
): number {
  // Read `bits` bits starting at `bitOffset` in the bit-packed array.
  // Each element of `longs` is one 64-bit slot. Java long is signed
  // two's-complement; deepslate stores pairs as [lo, hi] 32-bit ints.
  // We've converted to bigint, so bitwise ops work as unsigned.
  const arrIndex = Math.floor(bitOffset / 64);
  const inner = bitOffset % 64;
  const slot = longs[arrIndex] ?? 0n;
  if (inner + bits <= 64) {
    const mask = bits === 64 ? 0xffffffffffffffffn : ((1n << BigInt(bits)) - 1n);
    return Number((slot >> BigInt(inner)) & mask);
  }
  // Cross-boundary: low bits from slot, high bits from next slot.
  const low = slot >> BigInt(inner);
  const next = longs[arrIndex + 1] ?? 0n;
  const high = next & ((1n << BigInt(bits + inner - 64)) - 1n);
  const combined = (low | (high << BigInt(64 - inner))) & ((1n << BigInt(bits)) - 1n);
  return Number(combined);
}

export async function loadLitematicStructure(path: string): Promise<Structure> {
  const buf = await readFile(path);
  const nbt = NbtFile.read(new Uint8Array(buf));
  const root = nbt.root;

  // Top-level: `Metadata` (NbtCompound — name, author, size_total,
  // ..., `Regions` (NbtList<NbtCompound>))
  if (!root.has('Regions')) {
    throw new Error(
      `Litematic file ${path} is missing required 'Regions' compound`,
    );
  }
  const regionsList = root.get('Regions');
  if (!(regionsList instanceof NbtList)) {
    throw new Error(`Litematic 'Regions' in ${path} is not a list`);
  }

  // Compute the union bounding box of all regions, in world coords.
  // After we know the union, we shift every block into a single
  // global Structure with size = (maxX-minX+1, maxY-minY+1, maxZ-minZ+1).
  type Region = {
    name: string;
    posX: number;
    posY: number;
    posZ: number;
    sizeX: number;
    sizeY: number;
    sizeZ: number;
    palette: BlockStateTag[];
    longs: bigint[];
    bits: number;
  };
  const regions: Region[] = [];

  for (let r = 0; r < regionsList.length; r++) {
    const entry = regionsList.get(r);
    if (!entry || !entry.isCompound()) continue;
    const regionNbt = entry as unknown as {
      getString: (k: string) => string;
      getList: (k: string, t?: number) => NbtList;
      get: (k: string) => unknown;
    };
    const name = regionNbt.getString('Name') || `region_${r}`;
    const position = regionNbt.getList('Position', /* NbtType.Int */ 3);
    const size = regionNbt.getList('Size', 3);
    const sizeX = size.getNumber(0);
    const sizeY = size.getNumber(1);
    const sizeZ = size.getNumber(2);
    const posX = position.getNumber(0);
    const posY = position.getNumber(1);
    const posZ = position.getNumber(2);

    const paletteRaw = regionNbt.getList('BlockStatePalette', /* NbtType.Compound */ 10);
    const palette: BlockStateTag[] = [];
    for (let i = 0; i < paletteRaw.length; i++) {
      const pe = paletteRaw.get(i);
      if (!pe) {
        palette.push({ Name: 'minecraft:air' });
      } else {
        palette.push(parseBlockState(pe));
      }
    }

    const blockStates = regionNbt.get('BlockStates');
    if (!blockStates) {
      // Empty region (no blocks) — still record with empty longs.
      regions.push({
        name,
        posX,
        posY,
        posZ,
        sizeX,
        sizeY,
        sizeZ,
        palette,
        longs: [],
        bits: 2,
      });
      continue;
    }
    // Cast: the deepslate NbtLongArray stores its items as NbtLong,
    // each of which has getAsNumber/getAsPair. We use getAsPair so
    // we can build a BigInt without losing precision.
    const longArr = blockStates as unknown as {
      getItems: () => Array<{ getAsPair: () => [number, number] }>;
    };
    const items = longArr.getItems();
    const longs = items.map((it) => {
      const [lo, hi] = it.getAsPair();
      // BigInt from [lo, hi] (signed 32-bit each, two's complement).
      const loB = BigInt(lo) & 0xffffffffn;
      const hiB = BigInt(hi) & 0xffffffffn;
      return (hiB << 32n) | loB;
    });
    const bits = packedBitsForPalette(palette.length);

    regions.push({
      name,
      posX,
      posY,
      posZ,
      sizeX,
      sizeY,
      sizeZ,
      palette,
      longs,
      bits,
    });
  }

  if (regions.length === 0) {
    return new Structure([1, 1, 1]);
  }

  // Union bounding box.
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const r of regions) {
    minX = Math.min(minX, r.posX);
    minY = Math.min(minY, r.posY);
    minZ = Math.min(minZ, r.posZ);
    maxX = Math.max(maxX, r.posX + r.sizeX - 1);
    maxY = Math.max(maxY, r.posY + r.sizeY - 1);
    maxZ = Math.max(maxZ, r.posZ + r.sizeZ - 1);
  }
  const totalX = maxX - minX + 1;
  const totalY = maxY - minY + 1;
  const totalZ = maxZ - minZ + 1;
  const structure = new Structure([totalX, totalY, totalZ]);

  // For each region, iterate YXZ and add blocks.
  for (const r of regions) {
    const totalBlocks = r.sizeX * r.sizeY * r.sizeZ;
    for (let i = 0; i < totalBlocks; i++) {
      // YXZ index: x innermost, y outermost.
      const x = i % r.sizeX;
      const z = Math.floor(i / r.sizeX) % r.sizeZ;
      const y = Math.floor(i / (r.sizeX * r.sizeZ));
      // Read `bits` bits at offset i*bits.
      let paletteIdx: number;
      if (r.longs.length === 0) {
        paletteIdx = 0;
      } else {
        paletteIdx = readBitRange(r.longs, i * r.bits, r.bits);
      }
      const state = r.palette[paletteIdx] ?? { Name: 'minecraft:air' };
      if (state.Name === 'minecraft:air') continue;
      const wx = r.posX + x - minX;
      const wy = r.posY + y - minY;
      const wz = r.posZ + z - minZ;
      if (state.Properties) {
        structure.addBlock([wx, wy, wz], state.Name, state.Properties);
      } else {
        structure.addBlock([wx, wy, wz], state.Name);
      }
    }
  }

  return structure;
}
