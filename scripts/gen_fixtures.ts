/**
 * Generate the three canonical structure fixtures under
 * `examples/fixtures/`, one per supported format.
 *
 * Usage:
 *   npx tsx scripts/gen_fixtures.ts
 *
 * Each fixture is small (≤ 64 blocks) but contains a recognizable
 * shape:
 *   - `tiny_house.nbt`     — vanilla structure: 4×3×4 wooden house
 *                            with a glass window and door opening
 *   - `door.schem`         — Sponge schematic: a 1×3×1 oak door
 *                            frame (half-block, door, half-block)
 *   - `tree.litematic`     — Litematica: a small 5×6×5 oak tree
 *                            (trunk + leaf canopy)
 *
 * The script is idempotent — running it twice produces byte-identical
 * fixtures, which is useful for regression tests.
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  NbtCompound,
  NbtFile,
  NbtInt,
  NbtList,
  NbtLongArray,
  NbtString,
  NbtType,
  Structure,
} from 'deepslate';
import { Builder } from '../src/structures/builder.js';
import type { BlockSpec } from '../src/structures/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = resolve(__dirname, '..', 'examples', 'fixtures');

/**
 * Smallest integer `bits` >= 2 such that (1 << bits) >= paletteSize.
 *
 * Vanilla Litematica uses `max(2, ceil(log2(paletteSize)))` (clamped
 * to a minimum of 2). For paletteSize=2 this gives 2 bits, not 32 —
 * the older `32 - floor(log2(paletteSize - 1))` formula is the
 * *reverse* of the litematica bit-extraction, not a writer formula.
 * We use the correct ceil(log2) variant.
 */
function bitsForPalette(paletteSize: number): number {
  if (paletteSize <= 1) return 2;
  return Math.max(2, Math.ceil(Math.log2(paletteSize)));
}

/* ------------------------------------------------------------------ */
/*  tiny_house — vanilla structure NBT                                */
/* ------------------------------------------------------------------ */

const tinyHouseBlocks: BlockSpec[] = [];

// Floor (y=0): 4x4 oak planks
for (let x = 0; x < 4; x++) {
  for (let z = 0; z < 4; z++) {
    tinyHouseBlocks.push({ x, y: 0, z, block_id: 'minecraft:oak_planks' });
  }
}

// Walls (y=1..2): 4x3x4 cobblestone, with a door and window cut out
for (let y = 1; y <= 2; y++) {
  for (let x = 0; x < 4; x++) {
    for (let z = 0; z < 4; z++) {
      const isEdge =
        x === 0 || x === 3 || z === 0 || z === 3;
      if (!isEdge) continue;
      // Front door (x=1, z=0): skip the bottom block
      if (x === 1 && z === 0 && y === 1) continue;
      // Front window (x=2, z=0, y=2): use glass
      if (x === 2 && z === 0 && y === 2) {
        tinyHouseBlocks.push({ x, y, z, block_id: 'minecraft:glass' });
        continue;
      }
      // Side windows (z=1 or z=2, y=2, mid-x): glass
      if (y === 2 && (z === 1 || z === 2) && (x === 1 || x === 2)) {
        tinyHouseBlocks.push({ x, y, z, block_id: 'minecraft:glass' });
        continue;
      }
      tinyHouseBlocks.push({ x, y, z, block_id: 'minecraft:cobblestone' });
    }
  }
}

// Roof (y=3): 4x4 oak slabs
for (let x = 0; x < 4; x++) {
  for (let z = 0; z < 4; z++) {
    tinyHouseBlocks.push({
      x,
      y: 3,
      z,
      block_id: 'minecraft:oak_slab',
      properties: { type: 'top' },
    });
  }
}

function structureToVanillaNbt(structure: Structure): NbtCompound {
  const size = structure.getSize();

  // Walk blocks; collect a deduplicated palette in insertion order.
  const placed = structure.getBlocks();
  const paletteIndex = new Map<string, number>();
  const palette: string[] = [];
  const blocks: { pos: [number, number, number]; state: number }[] = [];

  for (const block of placed) {
    const name = block.state.getName().toString();
    let idx = paletteIndex.get(name);
    if (idx === undefined) {
      idx = palette.length;
      paletteIndex.set(name, idx);
      palette.push(name);
    }
    const pos = block.pos as unknown as [number, number, number];
    blocks.push({ pos, state: idx });
  }

  const root = new NbtCompound();
  root.set('size', new NbtList([new NbtInt(size[0]), new NbtInt(size[1]), new NbtInt(size[2])]));

  const paletteList = new NbtList(undefined, NbtType.Compound);
  for (const name of palette) {
    const c = new NbtCompound();
    c.set('Name', new NbtString(name));
    paletteList.add(c);
  }
  root.set('palette', paletteList);

  const blocksList = new NbtList(undefined, NbtType.Compound);
  for (const b of blocks) {
    const c = new NbtCompound();
    c.set('pos', new NbtList([new NbtInt(b.pos[0]), new NbtInt(b.pos[1]), new NbtInt(b.pos[2])]));
    c.set('state', new NbtInt(b.state));
    blocksList.add(c);
  }
  root.set('blocks', blocksList);

  return root;
}

async function writeVanillaNbt(structure: Structure, path: string): Promise<void> {
  const root = structureToVanillaNbt(structure);
  // Vanilla structure NBT is uncompressed, big-endian Java.
  const file = new NbtFile('', root, 'gzip', false, undefined);
  await writeFile(path, file.write());
}

/* ------------------------------------------------------------------ */
/*  door — Sponge schematic                                            */
/* ------------------------------------------------------------------ */

const doorBlocks: BlockSpec[] = [
  // bottom half
  { x: 0, y: 0, z: 0, block_id: 'minecraft:oak_door', properties: { half: 'lower', hinge: 'left', facing: 'north', open: 'false' } },
  // top half
  { x: 0, y: 1, z: 0, block_id: 'minecraft:oak_door', properties: { half: 'upper', hinge: 'left', facing: 'north', open: 'false' } },
  // cap stone above
  { x: 0, y: 2, z: 0, block_id: 'minecraft:stone' },
];

async function writeSpongeSchem(blocks: BlockSpec[], path: string): Promise<void> {
  // Compute size
  let maxX = 0, maxY = 0, maxZ = 0;
  for (const b of blocks) {
    if (b.x > maxX) maxX = b.x;
    if (b.y > maxY) maxY = b.y;
    if (b.z > maxZ) maxZ = b.z;
  }
  const width = maxX + 1;
  const height = maxY + 1;
  const length = maxZ + 1;

  // Palette: 0 = air, then each unique block id in order.
  // Sponge stores Properties inline in the palette value, but most
  // loaders (including ours) only care about the block id. We do
  // include properties via a per-palette-entry NbtCompound value
  // for realism, then key the reverse-map on the block id.
  const paletteIndex = new Map<string, number>();
  const paletteList: NbtCompound[] = [];
  // Reserve 0 for air
  paletteIndex.set('minecraft:air', 0);
  const airCompound = new NbtCompound();
  airCompound.set('Name', new NbtString('minecraft:air'));
  paletteList.push(airCompound);

  for (const b of blocks) {
    if (paletteIndex.has(b.block_id)) continue;
    const idx = paletteList.length;
    paletteIndex.set(b.block_id, idx);
    const c = new NbtCompound();
    c.set('Name', new NbtString(b.block_id));
    if (b.properties) {
      const props = new NbtCompound();
      for (const [k, v] of Object.entries(b.properties)) {
        props.set(k, new NbtString(v));
      }
      c.set('Properties', props);
    }
    paletteList.push(c);
  }

  // Build BlockData as NbtList<NbtByte> (palette is tiny, fits in bytes).
  // YZX index: (y * length + z) * width + x
  const total = width * height * length;
  const dataItems: number[] = new Array(total).fill(0);
  for (const b of blocks) {
    const idx = paletteIndex.get(b.block_id) ?? 0;
    const li = (b.y * length + b.z) * width + b.x;
    dataItems[li] = idx;
  }
  // Sponge schematic uses Byte array when palette ≤ 256, Int array
  // otherwise. Our palette is tiny, so Byte is fine.
  // But NbtList<NbtByte> items must be NbtByte instances.
  // NbtByte constructor takes number | boolean; we build them.
  const NbtByteMod = (await import('deepslate')).NbtByte;
  const dataList = new NbtList(undefined, NbtType.Byte);
  for (const v of dataItems) {
    dataList.add(new NbtByteMod(v));
  }

  // Assemble root compound
  const root = new NbtCompound();
  root.set('Width', new NbtInt(width));
  root.set('Height', new NbtInt(height));
  root.set('Length', new NbtInt(length));
  // Palette is a NbtCompound in the Sponge v2 spec: keys are block-id
  // strings (e.g. "minecraft:stone"), values are NbtInt palette indices.
  // Our loader reverses this map (indexToBlockId).
  const paletteNbt = new NbtCompound();
  paletteNbt.set('minecraft:air', new NbtInt(0));
  for (let i = 1; i < paletteList.length; i++) {
    const c = paletteList[i];
    if (!c) continue;
    const nameNbt = c.get('Name');
    const blockId = nameNbt && typeof (nameNbt as { getAsString?: () => string }).getAsString === 'function'
      ? (nameNbt as { getAsString: () => string }).getAsString()
      : 'minecraft:air';
    paletteNbt.set(blockId, new NbtInt(i));
  }
  root.set('Palette', paletteNbt);
  root.set('BlockData', dataList);
  root.set('Version', new NbtInt(2));
  root.set('DataVersion', new NbtInt(3465)); // 1.20.4-ish
  root.set('Offset', new NbtList([new NbtInt(0), new NbtInt(0), new NbtInt(0)]));

  const file = new NbtFile('', root, 'gzip', false, undefined);
  await writeFile(path, file.write());
}

/* ------------------------------------------------------------------ */
/*  tree — Litematica                                                  */
/* ------------------------------------------------------------------ */

type LitBlock = { x: number; y: number; z: number; id: string; props?: Record<string, string> };

const treeBlocks: LitBlock[] = [];

// Trunk: 1x4x1 oak log at y=0..3, x=2, z=2
for (let y = 0; y < 4; y++) {
  treeBlocks.push({ x: 2, y, z: 2, id: 'minecraft:oak_log', props: { axis: 'y' } });
}

// Leaf canopy: 5x2x5 at y=4..5, hollow inside
for (let y = 4; y <= 5; y++) {
  for (let x = 0; x < 5; x++) {
    for (let z = 0; z < 5; z++) {
      // Hollow the very top middle
      if (y === 5 && x === 2 && z === 2) continue;
      // Hollow the corners at top
      if (y === 5 && (x === 0 || x === 4) && (z === 0 || z === 4)) continue;
      treeBlocks.push({ x, y, z, id: 'minecraft:oak_leaves', props: { persistent: 'true' } });
    }
  }
}

function packLitematic(
  blocks: LitBlock[],
  size: [number, number, number],
): { palette: { Name: string; Properties?: Record<string, string> }[]; longs: bigint[]; bits: number } {
  // Build palette, with index 0 = air.
  const palette: { Name: string; Properties?: Record<string, string> }[] = [
    { Name: 'minecraft:air' },
  ];
  const idxOf = new Map<string, number>();
  const blockIndices: number[] = new Array(blocks.length).fill(0);
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (!b) continue;
    const key = JSON.stringify({ n: b.id, p: b.props ?? {} });
    let idx = idxOf.get(key);
    if (idx === undefined) {
      idx = palette.length;
      idxOf.set(key, idx);
      palette.push({ Name: b.id, Properties: b.props });
    }
    blockIndices[i] = idx;
  }

  // bits per entry: smallest integer bits >= 2 such that (1 << bits) >= palette.length
  const bits = bitsForPalette(palette.length);
  const mask = (1n << BigInt(bits)) - 1n;
  const totalLongBits = blocks.length * bits;
  const longsCount = Math.ceil(totalLongBits / 64);
  const longs: bigint[] = new Array(longsCount).fill(0n);
  for (let i = 0; i < blocks.length; i++) {
    const val = BigInt(blockIndices[i] ?? 0);
    const bitOff = i * bits;
    const arrIdx = Math.floor(bitOff / 64);
    const inner = bitOff % 64;
    if (inner + bits <= 64) {
      const slot = longs[arrIdx] ?? 0n;
      longs[arrIdx] = (slot | ((val & mask) << BigInt(inner))) as unknown as bigint;
    } else {
      // Cross-long
      const low = (longs[arrIdx] ?? 0n) | ((val & ((1n << BigInt(64 - inner)) - 1n)) << BigInt(inner));
      const high = (val >> BigInt(64 - inner));
      longs[arrIdx] = low;
      longs[arrIdx + 1] = ((longs[arrIdx + 1] ?? 0n) | high) as unknown as bigint;
    }
  }
  return { palette, longs, bits };
}

async function writeLitematic(blocks: LitBlock[], size: [number, number, number], path: string): Promise<void> {
  const packed = packLitematic(blocks, size);

  // Build the region compound
  const region = new NbtCompound();
  region.set('Position', new NbtList([new NbtInt(0), new NbtInt(0), new NbtInt(0)]));
  region.set('Size', new NbtList([new NbtInt(size[0]), new NbtInt(size[1]), new NbtInt(size[2])]));

  // BlockStatePalette: NbtList<NbtCompound>
  const paletteList = new NbtList(undefined, NbtType.Compound);
  for (const p of packed.palette) {
    const c = new NbtCompound();
    c.set('Name', new NbtString(p.Name));
    if (p.Properties) {
      const props = new NbtCompound();
      for (const [k, v] of Object.entries(p.Properties)) {
        props.set(k, new NbtString(v));
      }
      c.set('Properties', props);
    }
    paletteList.add(c);
  }
  region.set('BlockStatePalette', paletteList);

  // BlockStates: NbtLongArray. deepslate NbtLongArray accepts bigints.
  // Pre-check the bit count to be safe.
  region.set('BlockStates', new NbtLongArray(packed.longs));

  // Metadata
  const metadata = new NbtCompound();
  metadata.set('Name', new NbtString('tree'));
  metadata.set('Author', new NbtString('gen_fixtures'));
  metadata.set('Description', new NbtString('Auto-generated fixture'));
  metadata.set('Size', new NbtList([new NbtInt(size[0]), new NbtInt(size[1]), new NbtInt(size[2])]));
  metadata.set('Version', new NbtInt(6));
  metadata.set('TimeCreated', new NbtLongArray([0n]));
  metadata.set('TimeModified', new NbtLongArray([0n]));

  // Top-level: Metadata + Regions
  const root = new NbtCompound();
  root.set('Metadata', metadata);
  const regionsList = new NbtList(undefined, NbtType.Compound);
  regionsList.add(region);
  root.set('Regions', regionsList);

  const file = new NbtFile('', root, 'gzip', false, undefined);
  await writeFile(path, file.write());
}

/* ------------------------------------------------------------------ */
/*  main                                                               */
/* ------------------------------------------------------------------ */

async function main(): Promise<void> {
  await mkdir(FIXTURES_DIR, { recursive: true });

  // tiny_house.nbt — vanilla structure NBT
  {
    const struct = Builder.fromBlocks(tinyHouseBlocks);
    const out = resolve(FIXTURES_DIR, 'tiny_house.nbt');
    await writeVanillaNbt(struct, out);
    console.log(`wrote ${out} (${struct.getBlocks().length} blocks, size ${struct.getSize().join('x')})`);
  }

  // door.schem — Sponge schematic
  {
    const out = resolve(FIXTURES_DIR, 'door.schem');
    await writeSpongeSchem(doorBlocks, out);
    console.log(`wrote ${out} (${doorBlocks.length} blocks)`);
  }

  // tree.litematic — Litematica
  {
    const out = resolve(FIXTURES_DIR, 'tree.litematic');
    await writeLitematic(treeBlocks, [5, 6, 5], out);
    console.log(`wrote ${out} (${treeBlocks.length} blocks)`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
