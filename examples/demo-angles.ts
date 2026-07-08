// Front view of the blocks demo
import { writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as deepslate from 'deepslate';
import { createHeadlessCanvas } from '../src/render/headless_canvas.js';
import { capturePNG } from '../src/render/encoder.js';
import { viewForAngle } from '../src/render/camera.js';
import { buildResources } from '../src/resources/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

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

const { canvas, gl } = createHeadlessCanvas(1024, 768);
const resources = await buildResources();
const renderer = new deepslate.StructureRenderer(gl, structure, resources);
gl.clearColor(0, 0, 0, 0);
gl.clearDepth(1.0);
gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

// Render from FRONT view
const view = viewForAngle([5, 3, 5], 'front');
renderer.drawStructure(view);
renderer.drawGrid(view);

const png = capturePNG(gl, 1024, 768);
const outDir = resolve(__dirname, 'out');
await mkdir(outDir, { recursive: true });
const outPath = resolve(outDir, 'blocks-front.png');
await writeFile(outPath, png);
console.log(`Front view: ${outPath} (${png.length} bytes)`);

// Also render from TOP view
gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
const topView = viewForAngle([5, 3, 5], 'top');
renderer.drawStructure(topView);
renderer.drawGrid(topView);
const pngTop = capturePNG(gl, 1024, 768);
const outTop = resolve(outDir, 'blocks-top.png');
await writeFile(outTop, pngTop);
console.log(`Top view: ${outTop} (${pngTop.length} bytes)`);

// Also render from SIDE view
gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
const sideView = viewForAngle([5, 3, 5], 'side');
renderer.drawStructure(sideView);
renderer.drawGrid(sideView);
const pngSide = capturePNG(gl, 1024, 768);
const outSide = resolve(outDir, 'blocks-side.png');
await writeFile(outSide, pngSide);
console.log(`Side view: ${outSide} (${pngSide.length} bytes)`);