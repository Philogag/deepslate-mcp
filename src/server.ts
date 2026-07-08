#!/usr/bin/env node
/**
 * deepslate-mcp — MCP server entrypoint (M0: hello-world).
 *
 * Registers a single dummy `echo` tool so we can validate the
 * stdio transport and the tool-call round-trip. Real render tools
 * land in M4.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

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

  // Hello-world tool: returns the text it was given. Sanity-check
  // for the MCP plumbing; will be replaced in M4.
  server.tool(
    'echo',
    'Echo back the provided text. Used as a hello-world smoke tool in M0.',
    {
      text: z.string().min(1).describe('The text to echo back.'),
    },
    async ({ text }: { text: string }) => {
      return {
        content: [
          {
            type: 'text',
            text: `echo: ${text}`,
          },
        ],
      };
    },
  );

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