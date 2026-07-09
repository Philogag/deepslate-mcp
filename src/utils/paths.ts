/**
 * Path resolution utilities for MCP tools.
 *
 * Relative paths are resolved against process.cwd() — the working
 * directory of the MCP server process. Absolute paths are used as-is.
 */
import * as path from 'node:path';
import * as os from 'node:os';

/**
 * Resolve a file path.
 * - Absolute paths (starting with '/') are returned as-is.
 * - Relative paths are resolved against the server's working directory.
 */
export function resolvePath(p: string): string {
  if (p.startsWith('/')) return p;
  return path.resolve(process.cwd(), p);
}

/**
 * Generate a temporary output file path in the system temp directory.
 * Files are named `deepslate-mcp-<timestamp><ext>` to avoid collisions.
 */
export function tempOutputPath(ext: string = '.png'): string {
  return path.join(os.tmpdir(), `deepslate-mcp-${Date.now()}${ext}`);
}

/**
 * Extract the base filename (without directory) from a path.
 * Useful for display labels in tool results.
 */
export function basename(p: string): string {
  return path.basename(p);
}
