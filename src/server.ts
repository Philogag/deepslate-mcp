#!/usr/bin/env node
/**
 * deepslate-mcp — MCP server entrypoint (M4).
 *
 * Registers four tools:
 *   1. render_structure   — load + render .nbt/.schem/.litematic to PNG
 *   2. render_blocks      — programmatic block-list → PNG
 *   3. inspect_structure  — metadata-only (no render)
 *   4. render_item        — single item/block icon
 *
 * Resources are built once (cached singleton) on first tool call.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { registerRenderStructureTool } from './tools/render_structure.js';
import { registerRenderBlocksTool } from './tools/render_blocks.js';
import { registerInspectStructureTool } from './tools/inspect_structure.js';
import { registerRenderItemTool } from './tools/render_item.js';

async function main(): Promise<void> {
  const server = new McpServer(
    {
      name: 'deepslate-mcp',
      version: '0.1.0',
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  // Register all M4 tools.
  registerRenderStructureTool(server);
  registerRenderBlocksTool(server);
  registerInspectStructureTool(server);
  registerRenderItemTool(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Use stderr — stdout is the MCP JSON-RPC channel and any
  // console.log here would corrupt the protocol stream.
  console.error('deepslate-mcp starting on stdio');
}

main().catch((err) => {
  console.error('[deepslate-mcp] fatal:', err);
  process.exit(1);
});
