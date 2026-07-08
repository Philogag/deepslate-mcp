/**
 * Plain-data types used by the structure loaders.
 *
 * These decouple MCP-tool input schemas and fixture-generation scripts
 * from the deepslate `Structure` class, so callers can describe
 * structures as simple JSON-friendly objects.
 */

/**
 * A single block placed at an absolute (or structure-relative, when
 * fed to `Builder.fromBlocks`) world coordinate.
 *
 * `block_id` is the namespaced identifier, e.g. `"minecraft:stone"`.
 * `properties` are block-state properties, e.g. `{ facing: "north" }`.
 */
export type BlockSpec = {
  x: number;
  y: number;
  z: number;
  block_id: string;
  properties?: Record<string, string>;
};

/**
 * Read-only metadata describing a loaded structure.
 *
 * Returned by `inspectStructure()` (M4 will add a tool for this) and
 * useful for sanity checks in tests.
 */
export type StructureMeta = {
  /** [sizeX, sizeY, sizeZ] in blocks. */
  size: [number, number, number];
  /** Total number of non-air blocks in the structure. */
  block_count: number;
  /** Map of block_id -> number of occurrences. */
  palette: Record<string, number>;
  /** Number of block-entity NBT payloads (chests, signs, ...). */
  entities: number;
};
