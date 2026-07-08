#!/usr/bin/env node
/**
 * M0 smoke test: spawn the MCP server over stdio, send a minimal
 * `initialize` request, and confirm we get a well-formed response
 * with serverInfo.
 *
 * Exit codes:
 *   0  — initialize handshake succeeded
 *   1  — anything else (timeout, parse error, missing fields)
 *
 * Protocol note: MCP stdio transport uses newline-delimited JSON
 * (the SDK reads messages terminated by '\n'). Not LSP-style
 * Content-Length framing.
 */

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..');
const SERVER_BIN = resolve(PROJECT_ROOT, 'bin', 'deepslate-mcp.js');

const INIT_REQUEST = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: {
      name: 'smoke',
      version: '0.0.1',
    },
  },
};

const INITIALIZED_NOTIFICATION = {
  jsonrpc: '2.0',
  method: 'notifications/initialized',
};

const TIMEOUT_MS = 5000;

function encode(obj) {
  return JSON.stringify(obj) + '\n';
}

function main() {
  return new Promise((resolve) => {
    const child = spawn('node', [SERVER_BIN], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: PROJECT_ROOT,
    });

    let stdoutBuf = '';
    let stderrBuf = '';
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { child.kill('SIGKILL'); } catch {}
      console.error('[smoke] timeout: no initialize response within', TIMEOUT_MS, 'ms');
      console.error('[smoke] stderr so far:\n' + stderrBuf);
      console.error('[smoke] stdout so far:\n' + JSON.stringify(stdoutBuf));
      resolve(1);
    }, TIMEOUT_MS);

    child.stderr.on('data', (chunk) => {
      stderrBuf += chunk.toString('utf8');
    });

    child.stdout.on('data', (chunk) => {
      if (settled) return;
      stdoutBuf += chunk.toString('utf8');

      // Drain complete newline-delimited JSON messages.
      let nlIdx;
      while ((nlIdx = stdoutBuf.indexOf('\n')) !== -1) {
        const line = stdoutBuf.slice(0, nlIdx).trim();
        stdoutBuf = stdoutBuf.slice(nlIdx + 1);
        if (!line) continue;

        let parsed;
        try {
          parsed = JSON.parse(line);
        } catch (err) {
          settled = true;
          clearTimeout(timer);
          try { child.kill('SIGKILL'); } catch {}
          console.error('[smoke] failed to parse response line:', line);
          console.error('[smoke] parse error:', err);
          resolve(1);
          return;
        }

        // Expect a JSON-RPC response to id=1 with result.serverInfo.
        const ok =
          parsed &&
          parsed.jsonrpc === '2.0' &&
          parsed.id === 1 &&
          parsed.result &&
          parsed.result.serverInfo &&
          typeof parsed.result.serverInfo.name === 'string';

        settled = true;
        clearTimeout(timer);
        try { child.kill('SIGKILL'); } catch {}

        if (ok) {
          console.log('[smoke] OK — initialize handshake succeeded');
          console.log('[smoke] serverInfo:', JSON.stringify(parsed.result.serverInfo));
          console.log('[smoke] server stderr:\n' + stderrBuf.trim());
          resolve(0);
          return;
        } else {
          console.error('[smoke] handshake response missing serverInfo');
          console.error('[smoke] parsed:', JSON.stringify(parsed, null, 2));
          resolve(1);
          return;
        }
      }
    });

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      console.error('[smoke] failed to spawn server:', err);
      resolve(1);
    });

    child.on('close', (code, signal) => {
      if (settled) return;
      // Server exited before we got a response — probably fatal error.
      settled = true;
      clearTimeout(timer);
      console.error(`[smoke] server exited early (code=${code}, signal=${signal})`);
      console.error('[smoke] stderr:\n' + stderrBuf);
      console.error('[smoke] stdout:\n' + JSON.stringify(stdoutBuf));
      resolve(1);
    });

    // Drive the protocol: initialize, then notify "initialized".
    child.stdin.write(encode(INIT_REQUEST));
    child.stdin.write(encode(INITIALIZED_NOTIFICATION));
  });
}

main().then((code) => {
  process.exit(code);
});