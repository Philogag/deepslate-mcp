// 2x2x2 cube: iron, gold, diamond, copper — with REAL vanilla textures
import { writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as deepslate from 'deepslate';
import { createHeadlessCanvas } from '../src/render/headless_canvas.js';
import { capturePNG } from '../src/render/encoder.js';
import { viewForAngle } from '../src/render/camera.js';
import { buildResources } from '../src/resources/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// 2x2x2: iron, gold, diamond, copper
const blocks: Array<{ pos: [number, number, number]; id: string }> = [
  // y=0
  { pos: [0, 0, 0], id: 'minecraft:iron_block' },
  { pos: [1, 0, 0], id: 'minecraft:gold_block' },
  { pos: [0, 0, 1], id: 'minecraft:diamond_block' },
  { pos: [1, 0, 1], id: 'minecraft:copper_block' },
  // y=1
  { pos: [0, 1, 0], id: 'minecraft:iron_block' },
  { pos: [1, 1, 0], id: 'minecraft:gold_block' },
  { pos: [0, 1, 1], id: 'minecraft:diamond_block' },
  { pos: [1, 1, 1], id: 'minecraft:copper_block' },
];

const structure = new deepslate.Structure([2, 2, 2]);
for (const b of blocks) structure.addBlock(b.pos, b.id);

const width = 1024;
const height = 768;

const t0 = Date.now();
const { canvas, gl } = createHeadlessCanvas(width, height);
const resources = await buildResources();

const renderer = new deepslate.StructureRenderer(gl as any, structure, resources);
const view = viewForAngle([2, 2, 2], 'isometric' as any);

gl.clearColor(0, 0, 0, 0);
gl.clearDepth(1.0);
gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

renderer.drawStructure(view);
renderer.drawGrid(view);

const png = capturePNG(gl, width, height);

const outDir = resolve(__dirname, 'out');
await mkdir(outDir, { recursive: true });
const outPath = resolve(outDir, 'cube-2x2x2.png');
await writeFile(outPath, png);

console.log(`Rendered to ${outPath} (${Date.now() - t0}ms, ${png.length} bytes)`);