#!/usr/bin/env node
// thin launcher: delegates to the compiled server in dist/
import('../dist/server.js').catch((err) => {
  console.error('[deepslate-mcp] failed to start:', err);
  process.exit(1);
});