/**
 * Integration tests: starts the MCP server and exercises all 4 tools.
 * These tests require Xvfb (:99) and the Minecraft JAR resource pipeline.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import * as path from 'path';
import * as fs from 'node:fs/promises';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_PATH = path.resolve(__dirname, '..', 'src', 'server.ts');
const TSX_PATH = path.resolve(__dirname, '..', 'node_modules', '.bin', 'tsx');
const FIXTURES = path.resolve(__dirname, '..', 'examples', 'fixtures');

let msgId = 0;
let proc: ChildProcess;
let stderrBuf = '';

function request(method: string, params: Record<string, unknown> = {}): string {
  return JSON.stringify({ jsonrpc: '2.0', id: ++msgId, method, params }) + '\n';
}

function connect(): Promise<void> {
  return new Promise((resolve, reject) => {
    proc = spawn(TSX_PATH, [SERVER_PATH], {
      env: { ...process.env, DISPLAY: ':99' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    proc.stderr!.on('data', (d: Buffer) => { stderrBuf += d.toString(); });
    proc.on('error', reject);

    // Wait for "starting on stdio" signal
    const maxWait = 30000;
    const startTime = Date.now();
    const check = setInterval(() => {
      if (stderrBuf.includes('starting on stdio')) {
        clearInterval(check);
        resolve();
      } else if (Date.now() - startTime > maxWait) {
        clearInterval(check);
        reject(new Error(`Server failed to start within ${maxWait}ms. Stderr so far: ${stderrBuf.slice(-200)}`));
      }
    }, 200);
  });
}

async function sendAndWait(method: string, params: Record<string, unknown> = {}, timeoutMs = 15000): Promise<any> {
  return new Promise((resolve, reject) => {
    const id = ++msgId;
    const req = JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n';

    let buf = '';
    const onData = (chunk: Buffer) => {
      buf += chunk.toString();
      let idx: number;
      while ((idx = buf.indexOf('\n')) !== -1) {
        const line = buf.slice(0, idx);
        buf = buf.slice(idx + 1);
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);
          if (msg.id === id) {
            proc.stdout!.removeListener('data', onData);
            clearTimeout(timer);
            resolve(msg);
            return;
          }
        } catch { /* partial JSON, keep buffering */ }
      }
    };

    const timer = setTimeout(() => {
      proc.stdout!.removeListener('data', onData);
      reject(new Error(`Timeout waiting for response to ${method} (id=${id})`));
    }, timeoutMs);

    proc.stdout!.on('data', onData);
    proc.stdin!.write(req);
  });
}

describe('MCP server integration', () => {
  beforeAll(async () => {
    await connect();
  }, 15000);

  afterAll(() => {
    if (proc && !proc.killed) {
      proc.stdin!.end();
      proc.kill();
    }
  });

  it('responds to tools/list with 4 tools', async () => {
    const msg = await sendAndWait('tools/list');
    expect(msg.result).toBeDefined();
    expect(msg.result.tools).toBeInstanceOf(Array);
    expect(msg.result.tools.length).toBe(4);

    const names = msg.result.tools.map((t: any) => t.name).sort();
    expect(names).toEqual([
      'inspect_structure',
      'render_blocks',
      'render_item',
      'render_structure',
    ]);
  });

  it('inspect_structure returns metadata for tiny_house.nbt', async () => {
    const msg = await sendAndWait('tools/call', {
      name: 'inspect_structure',
      arguments: { nbt_path: path.join(FIXTURES, 'tiny_house.nbt') },
    });
    expect(msg.result).toBeDefined();
    expect(msg.result.isError).toBeFalsy();
    const text = msg.result.content[0].text;
    expect(text).toContain('4 × 4 × 4');
    expect(text).toContain('blocks: 55');
    expect(text).toContain('minecraft:cobblestone');
    expect(text).toContain('minecraft:oak_planks');
    expect(text).toContain('minecraft:oak_slab');
    expect(text).toContain('minecraft:glass');
  });

  it('inspect_structure returns metadata for door.schem', async () => {
    const msg = await sendAndWait('tools/call', {
      name: 'inspect_structure',
      arguments: { nbt_path: path.join(FIXTURES, 'door.schem') },
    });
    expect(msg.result).toBeDefined();
    expect(msg.result.isError).toBeFalsy();
    const text = msg.result.content[0].text;
    expect(text).toContain('1 × 3 × 1');
    expect(text).toContain('blocks: 3');
  });

  it('inspect_structure returns metadata for tree.litematic', async () => {
    const msg = await sendAndWait('tools/call', {
      name: 'inspect_structure',
      arguments: { nbt_path: path.join(FIXTURES, 'tree.litematic') },
    });
    expect(msg.result).toBeDefined();
    expect(msg.result.isError).toBeFalsy();
    const text = msg.result.content[0].text;
    expect(text).toContain('5 × 6 × 5');
    expect(text).toContain('blocks: 49');
  });

  it('render_structure produces a valid PNG for tiny_house.nbt', async () => {
    const msg = await sendAndWait('tools/call', {
      name: 'render_structure',
      arguments: {
        nbt_path: path.join(FIXTURES, 'tiny_house.nbt'),
        width: 256,
        height: 192,
      },
    }, 60000);
    expect(msg.result).toBeDefined();
    expect(msg.result.isError).toBeFalsy();
    const textContent = msg.result.content.find((c: any) => c.type === 'text');
    const imageContent = msg.result.content.find((c: any) => c.type === 'image');
    expect(textContent).toBeDefined();
    expect(textContent.text).toContain('Rendered');
    expect(imageContent).toBeDefined();
    expect(imageContent.mimeType).toBe('image/png');
    expect(imageContent.data.length).toBeGreaterThan(1000);
  }, 120000);

  it('render_blocks produces a valid PNG for a simple block list', async () => {
    const msg = await sendAndWait('tools/call', {
      name: 'render_blocks',
      arguments: {
        size: [2, 2, 2],
        blocks: [
          { position: [0, 0, 0], block_id: 'minecraft:stone' },
          { position: [0, 1, 0], block_id: 'minecraft:diamond_block' },
        ],
        width: 128,
        height: 128,
      },
    }, 60000);
    expect(msg.result).toBeDefined();
    expect(msg.result.isError).toBeFalsy();
    const textContent = msg.result.content.find((c: any) => c.type === 'text');
    const imageContent = msg.result.content.find((c: any) => c.type === 'image');
    expect(textContent).toBeDefined();
    expect(textContent.text).toContain('Rendered');
    expect(imageContent).toBeDefined();
    expect(imageContent.mimeType).toBe('image/png');
    expect(imageContent.data.length).toBeGreaterThan(1000);
  }, 120000);

  it('render_item produces a valid PNG for a block item', async () => {
    const msg = await sendAndWait('tools/call', {
      name: 'render_item',
      arguments: {
        item_id: 'minecraft:stone',
        width: 64,
        height: 64,
      },
    }, 60000);
    expect(msg.result).toBeDefined();
    expect(msg.result.isError).toBeFalsy();
    const textContent = msg.result.content.find((c: any) => c.type === 'text');
    const imageContent = msg.result.content.find((c: any) => c.type === 'image');
    expect(textContent).toBeDefined();
    expect(textContent.text).toContain('Rendered');
    expect(imageContent).toBeDefined();
    expect(imageContent.mimeType).toBe('image/png');
  }, 120000);

  it('returns isError for non-existent file', async () => {
    const msg = await sendAndWait('tools/call', {
      name: 'render_structure',
      arguments: { nbt_path: '/nonexistent/file.nbt' },
    });
    expect(msg.result).toBeDefined();
    expect(msg.result.isError).toBe(true);
  });
});
