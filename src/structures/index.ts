/**
 * Public entry point for the structure-loading module.
 *
 * Exposes:
 *   - `loadStructure(path)` — extension-based dispatch to the right
 *     format-specific loader.
 *   - `loadNbtStructure`, `loadSchemStructure`, `loadLitematicStructure`
 *     — direct format-specific loaders.
 *   - `Builder` — programmatic block-list construction.
 *   - `BlockSpec`, `StructureMeta` — plain-data types.
 */
import { Structure } from 'deepslate';
import { loadLitematicStructure } from './litematic_loader.js';
import { loadNbtStructure } from './nbt_loader.js';
import { loadSchemStructure } from './schem_loader.js';

export { loadLitematicStructure, loadNbtStructure, loadSchemStructure };
export { Builder } from './builder.js';
export type { BlockSpec, StructureMeta } from './types.js';

/**
 * Load a structure from disk, dispatching by file extension.
 *
 * Supported: `.nbt`, `.schem`, `.litematic`. Other extensions throw
 * with a helpful message (case-insensitive).
 */
export async function loadStructure(path: string): Promise<Structure> {
  const lower = path.toLowerCase();
  if (lower.endsWith('.nbt')) {
    return loadNbtStructure(path);
  }
  if (lower.endsWith('.schem')) {
    return loadSchemStructure(path);
  }
  if (lower.endsWith('.litematic')) {
    return loadLitematicStructure(path);
  }
  throw new Error(
    `Unsupported structure file extension: ${path} ` +
    `(expected .nbt, .schem, or .litematic)`,
  );
}
