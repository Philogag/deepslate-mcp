// Non-full blocks: slabs, stairs, trapdoors, flower pots — real textures
import { writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as deepslate from 'deepslate';
import { createHeadlessCanvas } from '../src/render/headless_canvas.js';
import { capturePNG } from '../src/render/encoder.js';
import { viewForAngle } from '../src/render/camera.js';
import { buildResources } from '../src/resources/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Build a 5x3x5 display:
// y=0: stone floor (5x5)
// y=1: row of blocks
// y=2: some upper-half variants
const blocks: Array<{ pos: [number, number, number]; id: string; props?: Record<string, string> }> = [];

// Floor: 5x5 smooth_stone (clean texture for judging occlusion)
for (let x = 0; x < 5; x++)
  for (let z = 0; z < 5; z++)
    blocks.push({ pos: [x, 0, z], id: 'minecraft:smooth_stone' });

// Row 1 (z=1): oak stairs (facing east), placed as bottom half
blocks.push({ pos: [0, 1, 1], id: 'minecraft:oak_stairs', props: { facing: 'east', half: 'bottom', shape: 'straight' } });
// Row 1: stone brick slab (bottom half)
blocks.push({ pos: [1, 1, 1], id: 'minecraft:stone_brick_slab', props: { type: 'bottom' } });
// Row 1: stone brick slab (top half)
blocks.push({ pos: [2, 1, 1], id: 'minecraft:stone_brick_slab', props: { type: 'top' } });
// Row 1: double slab (full block made of two slabs)
blocks.push({ pos: [3, 1, 1], id: 'minecraft:stone_brick_slab', props: { type: 'double' } });
// Row 1: birch trapdoor (flat, bottom)
blocks.push({ pos: [4, 1, 1], id: 'minecraft:birch_trapdoor', props: { half: 'bottom', open: 'false', facing: 'north' } });

// Row 2 (z=2): more stairs + trapdoor variants
blocks.push({ pos: [0, 1, 2], id: 'minecraft:cobblestone_stairs', props: { facing: 'south', half: 'bottom', shape: 'straight' } });
// Oak stairs going up (north facing)
blocks.push({ pos: [1, 1, 2], id: 'minecraft:oak_stairs', props: { facing: 'north', half: 'bottom', shape: 'straight' } });
// Spruce trapdoor open (vertical, like a hatch)
blocks.push({ pos: [2, 1, 2], id: 'minecraft:spruce_trapdoor', props: { half: 'top', open: 'true', facing: 'north' } });
// Flower pot with a poppy
blocks.push({ pos: [3, 1, 2], id: 'minecraft:flower_pot', props: { flower: 'poppy' } });
// Brick stairs
blocks.push({ pos: [4, 1, 2], id: 'minecraft:brick_stairs', props: { facing: 'east', half: 'bottom', shape: 'straight' } });

// Row 3 (z=3): upper stair variants
blocks.push({ pos: [0, 1, 3], id: 'minecraft:oak_stairs', props: { facing: 'east', half: 'top', shape: 'straight' } });
blocks.push({ pos: [1, 1, 3], id: 'minecraft:nether_brick_stairs', props: { facing: 'west', half: 'bottom', shape: 'straight' } });
// Iron trapdoor (closed, flat)
blocks.push({ pos: [2, 1, 3], id: 'minecraft:iron_trapdoor', props: { half: 'bottom', open: 'false', facing: 'north' } });
// Cracked stone brick slab (top)
blocks.push({ pos: [3, 1, 3], id: 'minecraft:stone_brick_slab', props: { type: 'top' } });
// Oak trapdoor open (hatch)
blocks.push({ pos: [4, 1, 3], id: 'minecraft:oak_trapdoor', props: { half: 'bottom', open: 'true', facing: 'east' } });

// y=2: Trapdoor floating at top level (open = vertical)
blocks.push({ pos: [0, 2, 2], id: 'minecraft:oak_trapdoor', props: { half: 'top', open: 'true', facing: 'south' } });
// Flower pot (empty)
blocks.push({ pos: [1, 2, 2], id: 'minecraft:flower_pot', props: {} });

const structure = new deepslate.Structure([5, 3, 5]);
for (const b of blocks) {
  structure.addBlock(b.pos, b.id, b.props);
}

const width = 1024;
const height = 768;

const t0 = Date.now();
const { canvas, gl } = createHeadlessCanvas(width, height);
const resources = await buildResources();

const renderer = new deepslate.StructureRenderer(gl as any, structure, resources);
const view = viewForAngle([5, 3, 5], 'isometric' as any);

gl.clearColor(0, 0, 0, 0);
gl.clearDepth(1.0);
gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

renderer.drawStructure(view);
renderer.drawGrid(view);

const png = capturePNG(gl, width, height);

const outDir = resolve(__dirname, 'out');
await mkdir(outDir, { recursive: true });
const outPath = resolve(outDir, 'blocks-demo.png');
await writeFile(outPath, png);

console.log(`Rendered to ${outPath} (${Date.now() - t0}ms, ${png.length} bytes)`);