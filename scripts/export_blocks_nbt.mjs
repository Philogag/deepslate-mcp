import { writeFile } from 'node:fs/promises';
import * as deepslate from 'deepslate';

const blocks = [];
// Floor: 5x5 smooth_stone
for (let x = 0; x < 5; x++)
  for (let z = 0; z < 5; z++)
    blocks.push({ pos: [x, 0, z], id: 'minecraft:smooth_stone' });

// Row 1
blocks.push({ pos: [0, 1, 1], id: 'minecraft:oak_stairs', props: { facing: 'east', half: 'bottom', shape: 'straight' } });
blocks.push({ pos: [1, 1, 1], id: 'minecraft:stone_brick_slab', props: { type: 'bottom' } });
blocks.push({ pos: [2, 1, 1], id: 'minecraft:stone_brick_slab', props: { type: 'top' } });
blocks.push({ pos: [3, 1, 1], id: 'minecraft:stone_brick_slab', props: { type: 'double' } });
blocks.push({ pos: [4, 1, 1], id: 'minecraft:birch_trapdoor', props: { half: 'bottom', open: 'false', facing: 'north' } });

// Row 2
blocks.push({ pos: [0, 1, 2], id: 'minecraft:cobblestone_stairs', props: { facing: 'south', half: 'bottom', shape: 'straight' } });
blocks.push({ pos: [1, 1, 2], id: 'minecraft:oak_stairs', props: { facing: 'north', half: 'bottom', shape: 'straight' } });
blocks.push({ pos: [2, 1, 2], id: 'minecraft:spruce_trapdoor', props: { half: 'top', open: 'true', facing: 'north' } });
blocks.push({ pos: [3, 1, 2], id: 'minecraft:flower_pot', props: { flower: 'poppy' } });
blocks.push({ pos: [4, 1, 2], id: 'minecraft:brick_stairs', props: { facing: 'east', half: 'bottom', shape: 'straight' } });

// Row 3
blocks.push({ pos: [0, 1, 3], id: 'minecraft:oak_stairs', props: { facing: 'east', half: 'top', shape: 'straight' } });
blocks.push({ pos: [1, 1, 3], id: 'minecraft:nether_brick_stairs', props: { facing: 'west', half: 'bottom', shape: 'straight' } });
blocks.push({ pos: [2, 1, 3], id: 'minecraft:iron_trapdoor', props: { half: 'bottom', open: 'false', facing: 'north' } });
blocks.push({ pos: [3, 1, 3], id: 'minecraft:stone_brick_slab', props: { type: 'top' } });
blocks.push({ pos: [4, 1, 3], id: 'minecraft:oak_trapdoor', props: { half: 'bottom', open: 'true', facing: 'east' } });

// y=2
blocks.push({ pos: [0, 2, 2], id: 'minecraft:oak_trapdoor', props: { half: 'top', open: 'true', facing: 'south' } });
blocks.push({ pos: [1, 2, 2], id: 'minecraft:flower_pot', props: {} });

const structure = new deepslate.Structure([5, 3, 5]);
for (const b of blocks) structure.addBlock(b.pos, b.id, b.props);

// Export as vanilla NBT
const size = structure.getSize();
const paletteIndex = new Map();
const palette = [];
const nbtBlocks = [];

for (const block of structure.getBlocks()) {
  const name = block.state.getName().toString();
  let idx = paletteIndex.get(name);
  if (idx === undefined) {
    idx = palette.length;
    paletteIndex.set(name, idx);
    palette.push(name);
  }
  const pos = block.pos;
  nbtBlocks.push({ pos, state: idx });
}

const root = new deepslate.NbtCompound();
root.set('size', new deepslate.NbtList([new deepslate.NbtInt(size[0]), new deepslate.NbtInt(size[1]), new deepslate.NbtInt(size[2])]));

const paletteList = new deepslate.NbtList(undefined, deepslate.NbtType.Compound);
for (const name of palette) {
  const c = new deepslate.NbtCompound();
  c.set('Name', new deepslate.NbtString(name));
  paletteList.add(c);
}
root.set('palette', paletteList);

const blocksList = new deepslate.NbtList(undefined, deepslate.NbtType.Compound);
for (const b of nbtBlocks) {
  const c = new deepslate.NbtCompound();
  c.set('pos', new deepslate.NbtList([new deepslate.NbtInt(b.pos[0]), new deepslate.NbtInt(b.pos[1]), new deepslate.NbtInt(b.pos[2])]));
  c.set('state', new deepslate.NbtInt(b.state));
  blocksList.add(c);
}
root.set('blocks', blocksList);

const file = new deepslate.NbtFile('', root, 'gzip', false, undefined);
await writeFile('/opt/data/profiles/meo/workspace/deepslate-mcp/examples/fixtures/blocks-demo.nbt', file.write());
console.log('done', palette.length, 'palette entries,', nbtBlocks.length, 'blocks');
