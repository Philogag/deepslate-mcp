/**
 * M2 demo — Nova's Garden Courtyard.
 *
 * A Minecraft build showcasing:
 *   - 🧱 oak_fence (栅栏) perimeter with connection properties
 *   - 🚪 oak_fence_gate (栅栏门) at the entrance, left open
 *   - 🚧 oak_door (门) on the stone house
 *   - 🪟 glass (玻璃) windows
 *   - 🏮 lantern (灯笼) hanging inside + on fence posts
 *
 * Run:
 *   npx tsx examples/demo-garden.ts
 *
 * Output: examples/out/garden.png
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as deepslate from 'deepslate';
import { createHeadlessCanvas } from '../src/render/headless_canvas.js';
import { capturePNG } from '../src/render/encoder.js';
import { viewForAngle } from '../src/render/camera.js';
import { buildResources } from '../src/resources/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// =========================================================================
// BUILD: Nova's Garden Courtyard
// Size: 11 wide, 6 tall, 9 deep
// =========================================================================
const W = 11, H = 6, D = 9;
const blocks: Array<{ pos: [number, number, number]; id: string; props?: Record<string, string> }> = [];

type BlockArgs = [number, number, number, string] | [number, number, number, string, Record<string, string>];
const add = (...args: BlockArgs) => {
  const [x, y, z, id] = args;
  const props = args.length === 5 ? args[4] : undefined;
  blocks.push({ pos: [x, y, z], id, props });
};

// Helper: fence post with connection properties for the perimeter
const isPerimeter = (x: number, z: number) => x === 0 || x === W - 1 || z === 0 || z === D - 1;
const isGate = (x: number, z: number) => x === 5 && z === 0;
const isInsideHouse = (x: number, z: number) => x >= 3 && x <= 7 && z >= 4 && z <= 7;
const isHouseWall = (x: number, z: number) => {
  if (!isInsideHouse(x, z)) return false;
  return x === 3 || x === 7 || z === 4 || z === 7;
};
const isHouseInterior = (x: number, z: number) => isInsideHouse(x, z) && !isHouseWall(x, z);

function fenceConnections(x: number, z: number): Record<string, string> {
  return {
    north: z > 0 ? 'true' : 'false',
    south: z < D - 1 ? 'true' : 'false',
    east: x > 0 ? 'true' : 'false',
    west: x < W - 1 ? 'true' : 'false',
    waterlogged: 'false',
  };
}

// ==============================
// LAYER y=0: Ground & Foundation
// ==============================
for (let x = 0; x < W; x++) {
  for (let z = 0; z < D; z++) {
    if (isPerimeter(x, z)) {
      // Perimeter flower bed / path border
      add(x, 0, z, 'minecraft:dirt');
    } else if (z <= 1 && x >= 4 && x <= 6) {
      // Stone brick path from gate to door
      add(x, 0, z, 'minecraft:stone_bricks');
    } else if (z === 2 && x >= 3 && x <= 7) {
      add(x, 0, z, 'minecraft:stone_bricks');
    } else if (z === 3 && x >= 4 && x <= 6) {
      add(x, 0, z, 'minecraft:stone_bricks');
    } else if (isInsideHouse(x, z) && z >= 4 && z <= 7) {
      // House foundation
      add(x, 0, z, 'minecraft:stone_bricks');
    } else {
      add(x, 0, z, 'minecraft:grass_block');
    }
  }
}

// ============================================
// LAYER y=1: Fence + House Walls (lower) + Door
// ============================================
for (let x = 0; x < W; x++) {
  for (let z = 0; z < D; z++) {
    if (isPerimeter(x, z)) {
      if (isGate(x, z)) {
        // Fence gate: south side center — left open
        add(x, 1, z, 'minecraft:oak_fence_gate', {
          facing: 'north', in_wall: 'false', open: 'true', powered: 'false',
        });
      } else {
        add(x, 1, z, 'minecraft:oak_fence', fenceConnections(x, z));
      }
      continue;
    }

    if (isHouseWall(x, z)) {
      // Door on south wall (z=4, center x=5)
      if (z === 4 && x === 5) continue; // door opening

      // Glass windows on east/west walls
      if ((x === 3 || x === 7) && (z === 5 || z === 6)) {
        add(x, 1, z, 'minecraft:glass');
        continue;
      }
      // Glass window on north wall
      if (z === 7 && x === 5) {
        add(x, 1, z, 'minecraft:glass');
        continue;
      }
      add(x, 1, z, 'minecraft:stone_bricks');
      continue;
    }

    if (isHouseInterior(x, z)) {
      add(x, 1, z, 'minecraft:oak_planks');
      continue;
    }
  }
}

// Door lower half
add(5, 1, 4, 'minecraft:oak_door', {
  facing: 'south', half: 'lower', hinge: 'right', open: 'false', powered: 'false',
});

// ============================================
// LAYER y=2: House Walls (upper) + Door Upper
// ============================================
for (let x = 0; x < W; x++) {
  for (let z = 0; z < D; z++) {
    if (isPerimeter(x, z)) continue;

    if (isHouseWall(x, z)) {
      // Skip windows + door opening
      if (z === 4 && x === 5) {
        // Door upper half
        add(x, 2, z, 'minecraft:oak_door', {
          facing: 'south', half: 'upper', hinge: 'right', open: 'false', powered: 'false',
        });
        continue;
      }
      if ((x === 3 || x === 7) && (z === 5 || z === 6)) continue;
      if (z === 7 && x === 5) continue;
      add(x, 2, z, 'minecraft:stone_bricks');
      continue;
    }
  }
}

// ==============
// Lanterns
// ==============
// Hanging lantern inside house (center of ceiling)
add(5, 2, 5, 'minecraft:lantern', { hanging: 'true', waterlogged: 'false' });
// Standing lanterns at entrance gate posts
add(4, 1, 0, 'minecraft:lantern', { hanging: 'false', waterlogged: 'false' });
add(6, 1, 0, 'minecraft:lantern', { hanging: 'false', waterlogged: 'false' });

// =========================
// LAYER y=3: House Roof
// =========================
for (let x = 0; x < W; x++) {
  for (let z = 0; z < D; z++) {
    if (!isInsideHouse(x, z)) continue;

    // Roof edges = stairs facing outward
    if (x === 3 && z >= 4 && z <= 7) {
      add(x, 3, z, 'minecraft:stone_brick_stairs', {
        facing: 'west', half: 'bottom', shape: 'straight', waterlogged: 'false',
      });
    } else if (x === 7 && z >= 4 && z <= 7) {
      add(x, 3, z, 'minecraft:stone_brick_stairs', {
        facing: 'east', half: 'bottom', shape: 'straight', waterlogged: 'false',
      });
    } else if (z === 4 && x >= 3 && x <= 7) {
      add(x, 3, z, 'minecraft:stone_brick_stairs', {
        facing: 'south', half: 'bottom', shape: 'straight', waterlogged: 'false',
      });
    } else if (z === 7 && x >= 3 && x <= 7) {
      add(x, 3, z, 'minecraft:stone_brick_stairs', {
        facing: 'north', half: 'bottom', shape: 'straight', waterlogged: 'false',
      });
    } else {
      // Roof interior = slabs
      add(x, 3, z, 'minecraft:stone_brick_slab', {
        type: 'bottom', waterlogged: 'false',
      });
    }
  }
}

// =========================
// LAYER y=4: Roof top cap
// =========================
for (let x = 4; x <= 6; x++) {
  for (let z = 5; z <= 6; z++) {
    add(x, 4, z, 'minecraft:stone_brick_slab', {
      type: 'top', waterlogged: 'false',
    });
  }
}

// ==============================
// Compute bounding box & build
// ==============================
let minX = Infinity, minY = Infinity, minZ = Infinity;
let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
for (const b of blocks) {
  if (b.pos[0] < minX) minX = b.pos[0];
  if (b.pos[1] < minY) minY = b.pos[1];
  if (b.pos[2] < minZ) minZ = b.pos[2];
  if (b.pos[0] > maxX) maxX = b.pos[0];
  if (b.pos[1] > maxY) maxY = b.pos[1];
  if (b.pos[2] > maxZ) maxZ = b.pos[2];
}

const sizeX = maxX - minX + 1;
const sizeY = maxY - minY + 1;
const sizeZ = maxZ - minZ + 1;

const structure = new deepslate.Structure([sizeX, sizeY, sizeZ]);
for (const b of blocks) {
  const lx = b.pos[0] - minX;
  const ly = b.pos[1] - minY;
  const lz = b.pos[2] - minZ;
  if (b.props) {
    structure.addBlock([lx, ly, lz], b.id, b.props);
  } else {
    structure.addBlock([lx, ly, lz], b.id);
  }
}

const blockCount = blocks.length;
console.log(`🧱 Garden built: ${sizeX}×${sizeY}×${sizeZ}, ${blockCount} blocks`);

// ==============================
// Render to PNG via headless GL
// ==============================
const width = 1400;
const height = 980;

const t0 = Date.now();
const { canvas, gl } = createHeadlessCanvas(width, height);
console.log('⏳ Loading Minecraft textures...');

const resources = await buildResources(gl as any);
console.log('✅ Resources ready');

const renderer = new deepslate.StructureRenderer(gl as any, structure, resources);
const view = viewForAngle([sizeX, sizeY, sizeZ], 'isometric' as any);

gl.clearColor(10 / 255, 13 / 255, 18 / 255, 1); // dark navy
gl.clearDepth(1.0);
gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

renderer.drawStructure(view);
renderer.drawGrid(view);

const png = capturePNG(gl, width, height);

const outDir = resolve(__dirname, 'out');
await mkdir(outDir, { recursive: true });
const outPath = resolve(outDir, 'garden.png');
await writeFile(outPath, png);

const elapsed = Date.now() - t0;
console.log(`✅ Rendered to ${outPath} (${elapsed}ms, ${png.length} bytes, ${width}×${height})`);

// Also render top-down, front, and side views for a complete showcase
for (const [angle, suffix] of [
  ['top' as const, 'top'],
  ['front' as const, 'front'],
  ['side' as const, 'side'],
]) {
  const gl2 = createHeadlessCanvas(width, height).gl;
  gl2.clearColor(10 / 255, 13 / 255, 18 / 255, 1);
  gl2.clearDepth(1.0);
  gl2.clear(gl2.COLOR_BUFFER_BIT | gl2.DEPTH_BUFFER_BIT);

  const r2 = new deepslate.StructureRenderer(gl2 as any, structure, resources);
  const v2 = viewForAngle([sizeX, sizeY, sizeZ], angle);
  r2.drawStructure(v2);
  r2.drawGrid(v2);

  const png2 = capturePNG(gl2, width, height);
  const outPath2 = resolve(outDir, `garden-${suffix}.png`);
  await writeFile(outPath2, png2);
  console.log(`  ↳ garden-${suffix}.png (${png2.length} bytes)`);
}
