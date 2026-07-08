// Export blocks-demo as litematic with correct YXZ packing
import { writeFile } from 'node:fs/promises';
import * as deepslate from 'deepslate';
const { NbtFile, NbtCompound, NbtInt, NbtList, NbtString, NbtLongArray, NbtType } = deepslate;

// Build structure first, then read back in YXZ order
const structure = new deepslate.Structure([5, 3, 5]);
const add = (x, y, z, id, props) => structure.addBlock([x, y, z], id, props);

for (let x = 0; x < 5; x++) for (let z = 0; z < 5; z++) add(x, 0, z, 'minecraft:smooth_stone');
add(0, 1, 1, 'minecraft:oak_stairs', { facing: 'east', half: 'bottom', shape: 'straight' });
add(1, 1, 1, 'minecraft:stone_brick_slab', { type: 'bottom' });
add(2, 1, 1, 'minecraft:stone_brick_slab', { type: 'top' });
add(3, 1, 1, 'minecraft:stone_brick_slab', { type: 'double' });
add(4, 1, 1, 'minecraft:birch_trapdoor', { half: 'bottom', open: 'false', facing: 'north' });
add(0, 1, 2, 'minecraft:cobblestone_stairs', { facing: 'south', half: 'bottom', shape: 'straight' });
add(1, 1, 2, 'minecraft:oak_stairs', { facing: 'north', half: 'bottom', shape: 'straight' });
add(2, 1, 2, 'minecraft:spruce_trapdoor', { half: 'top', open: 'true', facing: 'north' });
add(3, 1, 2, 'minecraft:flower_pot', { flower: 'poppy' });
add(4, 1, 2, 'minecraft:brick_stairs', { facing: 'east', half: 'bottom', shape: 'straight' });
add(0, 1, 3, 'minecraft:oak_stairs', { facing: 'east', half: 'top', shape: 'straight' });
add(1, 1, 3, 'minecraft:nether_brick_stairs', { facing: 'west', half: 'bottom', shape: 'straight' });
add(2, 1, 3, 'minecraft:iron_trapdoor', { half: 'bottom', open: 'false', facing: 'north' });
add(3, 1, 3, 'minecraft:stone_brick_slab', { type: 'top' });
add(4, 1, 3, 'minecraft:oak_trapdoor', { half: 'bottom', open: 'true', facing: 'east' });
add(0, 2, 2, 'minecraft:oak_trapdoor', { half: 'top', open: 'true', facing: 'south' });
add(1, 2, 2, 'minecraft:flower_pot', {});

const [sx, sy, sz] = structure.getSize();
const total = sx * sy * sz;

// Build palette from structure blocks in YXZ order for correct packing
const idxOf = new Map();
const palette = [{ Name: 'minecraft:air' }];
const blockIndices = [];

for (let i = 0; i < total; i++) {
  const x = i % sx;
  const z = Math.floor(i / sx) % sz;
  const y = Math.floor(i / (sx * sz));
  const block = structure.getBlock([x, y, z]);
  if (!block || !block.state || block.state.is(deepslate.BlockState.AIR)) {
    blockIndices.push(0); // air
    continue;
  }
  const name = block.state.getName().toString();
  const props = block.state.getProperties();
  const key = JSON.stringify({ n: name, p: props });
  let idx = idxOf.get(key);
  if (idx === undefined) {
    idx = palette.length;
    idxOf.set(key, idx);
    palette.push({ Name: name, Properties: Object.keys(props).length > 0 ? props : undefined });
  }
  blockIndices.push(idx);
}

console.log('palette size:', palette.length, 'total blocks:', total, 'non-air:', blockIndices.filter(i => i !== 0).length);

// Bit-pack
const bits = Math.max(2, Math.ceil(Math.log2(palette.length)));
const longsCount = Math.ceil((total * bits) / 64);
const longs = new Array(longsCount).fill(0n);
const mask = (1n << BigInt(bits)) - 1n;

for (let i = 0; i < total; i++) {
  const val = BigInt(blockIndices[i]);
  const bitOff = i * bits;
  const arrIdx = Math.floor(bitOff / 64);
  const inner = bitOff % 64;
  longs[arrIdx] = (longs[arrIdx] | ((val & mask) << BigInt(inner)));
  if (inner + bits > 64) {
    longs[arrIdx + 1] = (longs[arrIdx + 1] | (val >> BigInt(64 - inner)));
  }
}

// Assemble litematic NBT
const region = new NbtCompound();
region.set('Position', new NbtList([new NbtInt(0), new NbtInt(0), new NbtInt(0)]));
region.set('Size', new NbtList([new NbtInt(sx), new NbtInt(sy), new NbtInt(sz)]));

const paletteNbt = new NbtList(undefined, NbtType.Compound);
for (const p of palette) {
  const c = new NbtCompound();
  c.set('Name', new NbtString(p.Name));
  if (p.Properties) {
    const props = new NbtCompound();
    for (const [k, v] of Object.entries(p.Properties)) props.set(k, new NbtString(v));
    c.set('Properties', props);
  }
  paletteNbt.add(c);
}
region.set('BlockStatePalette', paletteNbt);
region.set('BlockStates', new NbtLongArray(longs));

const regionsList = new NbtList(undefined, NbtType.Compound);
regionsList.add(region);

const root = new NbtCompound();
root.set('MinecraftDataVersion', new NbtInt(3465));
root.set('Version', new NbtInt(6));
root.set('Regions', regionsList);

const metadata = new deepslate.NbtCompound();
metadata.set('Name', new deepslate.NbtString('blocks-demo'));
metadata.set('Author', new deepslate.NbtString('Nova'));
metadata.set('Description', new deepslate.NbtString('Non-full blocks test'));
metadata.set('EnclosingSize', new deepslate.NbtList([new NbtInt(sx), new NbtInt(sy), new NbtInt(sz)]));
metadata.set('RegionCount', new deepslate.NbtInt(1));
metadata.set('TotalBlocks', new deepslate.NbtInt(blockIndices.filter(i => i !== 0).length));
metadata.set('TotalVolume', new deepslate.NbtInt(total));
metadata.set('TimeCreated', new deepslate.NbtLong([0, 0]));
metadata.set('TimeModified', new deepslate.NbtLong([0, 0]));

root.set('Metadata', metadata);

const file = new NbtFile('', root, 'gzip', false, undefined);
await writeFile('examples/fixtures/blocks-demo.litematic.txt', file.write());
console.log('done', bits, 'bits', longsCount, 'longs');