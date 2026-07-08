# MCP Tools Reference

> Complete reference for the tools exposed by the `deepslate-mcp` server.
> Schema validated with `zod` v3.25+.

## Conventions

- All paths are resolved against the server process's `cwd` unless
  absolute.
- All angles are in **radians** (multiply degrees by `π/180` if needed).
- All sizes are in **pixels**; structures are in **Minecraft blocks**.
- `transparent` is the default background; any CSS color string
  (`"#87CEEB"`, `"skyblue"`, etc.) is accepted.
- Errors are surfaced as `isError: true` with a human-readable text
  content — never as a thrown exception.

---

## 1. `render_structure`

Render a Minecraft structure file (NBT, Sponge schematic, or Litematic)
to a PNG image.

### Input schema

```ts
{
  nbt_path: string,                              // required, .nbt | .schem | .litematic
  output_path?: string,                          // default: $TMPDIR/deepslate-mcp-<hash>.png
  angle?: 'isometric' | 'top' | 'front' | 'side' | 'custom',
                                                // default: 'isometric'
  rotation_x?: number,                           // radians, only when angle='custom'
  rotation_y?: number,                           // radians, only when angle='custom'
  rotation_z?: number,                           // radians, default 0
  width?: number,                                // 64..4096, default 1024
  height?: number,                               // 64..4096, default 768
  background?: string,                           // CSS color or 'transparent', default 'transparent'
  show_grid?: boolean,                           // draw 1-block grid overlay, default false
  show_outline?: boolean,                        // draw structure bounding box, default true
  resource_pack?: string[],                      // additional .zip resource pack paths
  zoom?: number,                                 // multiplier on auto-fit, default 1.0
}
```

### Returns

```ts
{
  content: [
    {
      type: 'text',
      text: '✅ Rendered in 412 ms\n'
           + '📁 /path/to/output.png\n'
           + '📐 1024×768, isometric',
    },
    {
      type: 'image',
      mimeType: 'image/png',
      data: '<base64-encoded PNG>',
    },
  ],
}
```

On error:

```ts
{
  isError: true,
  content: [{ type: 'text', text: '❌ Failed to parse /path/to/foo.nbt: <reason>' }],
}
```

### Examples

```jsonc
// Basic isometric render
{ "nbt_path": "examples/tiny_house.nbt" }

// Top-down view at 2048×2048
{
  "nbt_path": "examples/tiny_house.nbt",
  "angle": "top",
  "width": 2048,
  "height": 2048
}

// Custom angle with grid
{
  "nbt_path": "examples/castle.schem",
  "angle": "custom",
  "rotation_x": 0.5,
  "rotation_y": 0.8,
  "show_grid": true,
  "background": "#87CEEB"
}
```

---

## 2. `render_blocks`

Build a structure from a block list (no file I/O) and render it.
Useful for procedurally generating previews.

### Input schema

```ts
{
  size: [number, number, number],                // [width, height, depth] in blocks
  blocks: Array<{
    position: [number, number, number],
    block_id: string,                            // e.g. 'minecraft:oak_planks'
    properties?: Record<string, string>,         // e.g. { "axis": "y" }
  }>,
  output_path?: string,
  angle?: 'isometric' | 'top' | 'front' | 'side' | 'custom',
  rotation_x?: number,
  rotation_y?: number,
  width?: number,
  height?: number,
  background?: string,
}
```

### Example

```json
{
  "size": [5, 5, 5],
  "blocks": [
    { "position": [0, 0, 0], "block_id": "minecraft:stone" },
    { "position": [1, 0, 0], "block_id": "minecraft:stone" },
    { "position": [0, 0, 0], "block_id": "minecraft:oak_door",
      "properties": { "facing": "east", "half": "bottom", "hinge": "left" } }
  ],
  "angle": "isometric",
  "width": 512,
  "height": 512
}
```

---

## 3. `inspect_structure`

Read structure metadata without rendering. Use this when the agent
needs to *describe* a structure before deciding how to render it
(e.g. pick an angle based on aspect ratio).

### Input schema

```ts
{ nbt_path: string }
```

### Returns

```ts
{
  content: [{
    type: 'text',
    text: '📦 Structure: tiny_house.nbt\n'
         + '   size: 12 × 8 × 10 (W × H × D)\n'
         + '   blocks: 234\n'
         + '   palette:\n'
         + '     minecraft:oak_planks × 120\n'
         + '     minecraft:glass × 18\n'
         + '     minecraft:cobblestone × 96\n'
         + '   entities: 0',
  }],
}
```

---

## 4. `render_item`

Render a single block or item as an isometric icon. Uses the same
`ItemRenderer` that deepslate's web demo uses.

### Input schema

```ts
{
  item_id: string,                               // e.g. 'minecraft:oak_door', 'minecraft:diamond_sword'
  width?: number,                                // default 128
  height?: number,                               // default 128
  background?: string,                           // default 'transparent'
}
```

### Example

```json
{ "item_id": "minecraft:enchanting_table", "width": 256, "height": 256 }
```

---

## Resources (read-only)

The server also exposes a few read-only `resources/*` URIs (planned,
not in v0.1):

| URI | Content |
|---|---|
| `deepslate-mcp://cache/info` | Cache size, MC version, last refresh |
| `deepslate-mcp://block/{id}` | JSON of `BlockDefinition` + model variant count |
| `deepslate-mcp://atlas/preview` | The full atlas PNG as an image resource |

These let agents inspect the resource layer without re-fetching.

---

## Prompts (planned)

| Name | Description |
|---|---|
| `structure_analysis` | Prompt template asking the agent to describe what it sees in a rendered preview |
| `schematic_authoring` | Prompt template for generating `.schem` content from a textual description |

These wrap `prompts/*` registrations and are optional.

---

## Versioning

The tool schemas follow the project's `package.json` version. Breaking
schema changes will bump the minor version (0.1 → 0.2) and ship a
migration note in `CHANGELOG.md`.