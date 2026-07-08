/**
 * M1 demo — build a small "house" structure programmatically, then
 * render it to a PNG via the headless WebGL pipeline.
 *
 * Run:
 *   npm run demo
 *
 * Output: examples/out/house.png
 *
 * The house consists of:
 *   - 4×4 oak_planks floor (y=0)
 *   - 4 corner oak_log pillars (y=0..2)
 *   - 4×4 cobblestone walls (y=1..2) with a door gap and a window
 *   - 4×4 oak_slab roof (y=3)
 *
 * With M1's stub resources, every block falls through to the
 * magenta/black "invalid" texture, so the demo image shows the
 * structure's geometry as a wireframe / checker — enough to prove
 * the pipeline produces a real PNG. M2 swaps in a real texture
 * pack and the same script will then render the house in colour.
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Structure } from 'deepslate';
import { renderStructureToPNG } from '../src/render/pipeline.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const blocks: Array<{ x: number; y: number; z: number; id: string; props?: Record<string, string> }> = [];

// Floor: 4x4 oak_planks at y=0
for (let x = 0; x < 4; x++) {
  for (let z = 0; z < 4; z++) {
    blocks.push({ x, y: 0, z, id: 'minecraft:oak_planks' });
  }
}

// 4 corner pillars: oak_log at (0,0),(0,3),(3,0),(3,3) for y=0..2
for (let y = 0; y <= 2; y++) {
  for (const [x, z] of [[0, 0], [0, 3], [3, 0], [3, 3]]) {
    blocks.push({ x: x as number, y, z: z as number, id: 'minecraft:oak_log' });
  }
}

// Walls: cobblestone, with a door gap at (1, 0, 1) and a window at (2, 0, 2)
for (let y = 1; y <= 2; y++) {
  for (let x = 0; x < 4; x++) {
    for (let z = 0; z < 4; z++) {
      const isEdge = x === 0 || x === 3 || z === 0 || z === 3;
      if (!isEdge) continue;
      // Front door gap: skip the block at (x=1, z=0, y=1)
      if (x === 1 && z === 0 && y === 1) continue;
      // Front window: glass at (x=2, z=0, y=2)
      if (x === 2 && z === 0 && y === 2) {
        blocks.push({ x, y, z, id: 'minecraft:glass' });
        continue;
      }
      // Side windows: glass at y=2, mid-x, z=1 or z=2
      if (y === 2 && (z === 1 || z === 2) && (x === 1 || x === 2)) {
        blocks.push({ x, y, z, id: 'minecraft:glass' });
        continue;
      }
      blocks.push({ x, y, z, id: 'minecraft:cobblestone' });
    }
  }
}

// Roof: 4x4 oak_slab at y=3
for (let x = 0; x < 4; x++) {
  for (let z = 0; z < 4; z++) {
    blocks.push({
      x,
      y: 3,
      z,
      id: 'minecraft:oak_slab',
      props: { type: 'top' },
    });
  }
}

// Compute bounding box
let minX = Infinity, minY = Infinity, minZ = Infinity;
let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
for (const b of blocks) {
  if (b.x < minX) minX = b.x;
  if (b.y < minY) minY = b.y;
  if (b.z < minZ) minZ = b.z;
  if (b.x > maxX) maxX = b.x;
  if (b.y > maxY) maxY = b.y;
  if (b.z > maxZ) maxZ = b.z;
}

const sizeX = maxX - minX + 1;
const sizeY = maxY - minY + 1;
const sizeZ = maxZ - minZ + 1;
const structure = new Structure([sizeX, sizeY, sizeZ]);

for (const b of blocks) {
  const lx = b.x - minX;
  const ly = b.y - minY;
  const lz = b.z - minZ;
  if (b.props) {
    structure.addBlock([lx, ly, lz], b.id, b.props);
  } else {
    structure.addBlock([lx, ly, lz], b.id);
  }
}

const outDir = resolve(__dirname, 'out');
await mkdir(outDir, { recursive: true });
const outPath = resolve(outDir, 'house.png');

const start = Date.now();
const result = await renderStructureToPNG(structure, {
  width: 1024,
  height: 768,
  angle: 'isometric',
  background: 'transparent',
});
await writeFile(outPath, result.png);
console.log(
  `Rendered to ${outPath} ` +
    `(${result.durationMs.toFixed(0)}ms, ${result.png.length} bytes, ` +
    `${result.width}x${result.height})`,
);
