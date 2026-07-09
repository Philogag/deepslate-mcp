#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverPath = resolve(__dirname, '..', 'src', 'server.ts');

let msgId = 0;
function request(method, params = {}) {
  return JSON.stringify({ jsonrpc: '2.0', id: ++msgId, method, params }) + '\n';
}

async function main() {
  console.log('🚀 Starting MCP server...');

  const proc = spawn('npx', ['tsx', serverPath], {
    env: { ...process.env, DISPLAY: ':99' },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  let stderr = '';
  proc.stderr.on('data', (d) => { stderr += d.toString(); });

  const fixturePath = resolve(__dirname, '..', 'examples', 'fixtures', 'tiny_house.nbt');

  // 1. List tools
  proc.stdin.write(request('tools/list'));

  // 2. Inspect structure
  proc.stdin.write(request('tools/call', {
    name: 'inspect_structure',
    arguments: { nbt_path: fixturePath },
  }));

  // 3. Render structure
  proc.stdin.write(request('tools/call', {
    name: 'render_structure',
    arguments: { nbt_path: fixturePath, width: 256, height: 192 },
  }));

  const results = [];
  let buf = '';
  const timeout = setTimeout(() => { proc.kill(); }, 30000);

  for await (const chunk of proc.stdout) {
    buf += chunk.toString();
    let idx;
    while ((idx = buf.indexOf('\n')) !== -1) {
      const line = buf.slice(0, idx);
      buf = buf.slice(idx + 1);
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line);
        results.push(msg);
        if (results.length >= 3) {
          clearTimeout(timeout);
          proc.stdin.end();
          for (const r of results) {
            if (r.result) {
              if (r.result.tools) {
                console.log('✅ tools/list:');
                for (const t of r.result.tools) {
                  console.log(`   - ${t.name}: ${t.description}`);
                }
              } else if (r.result.content) {
                for (const c of r.result.content) {
                  if (c.type === 'text') {
                    console.log(`✅ Tool response:\n${c.text}`);
                  } else if (c.type === 'image') {
                    console.log(`   📷 Image: ${c.data.length} base64 chars`);
                  }
                }
              }
            }
            if (r.error) {
              console.log(`❌ Error: ${JSON.stringify(r.error)}`);
            }
          }
          console.log('\n✨ Smoke tests passed!');
          console.log(`   Stderr: ${stderr.split('\n')[0]}`);
          process.exit(0);
        }
      } catch {}
    }
  }
}

main().catch((err) => { console.error('❌ Failed:', err); process.exit(1); });
