# Architecture

> Technical design for `deepslate-mcp`.

## 1. Goals & non-goals

### Goals

1. Wrap `misode/deepslate` behind an MCP `tools/*` interface so any
   MCP-aware agent can render a Minecraft structure to PNG.
2. Stay fully **offline-capable** after first run — vanilla resources
   cached locally.
3. Support the three common structure formats: **`.nbt`** (vanilla),
   **`.schem`** (Sponge schematic), **`.litematic`** (Litematica).
4. Headless rendering via [`gl`](https://github.com/stackgl/headless-gl)
   — no X server, no GPU required.
5. **MIT-compliant** distribution: deepslate is MIT, we ship MIT,
   we keep the original `LICENSE` and credit file.

### Non-goals

- Authoring/editing structures (only read & render).
- Real-time PBR shading (deepslate does flat + simple AO; that's enough).
- Bedrock world-level rendering (chunk-scale, not structure-scale).
- Server-mode multiplayer / collaborative editing.

## 2. Layered architecture

```
┌───────────────────────────────────────────────────────────┐
│  L5  MCP server   (@modelcontextprotocol/server, stdio)   │
│      • registerTool(render_structure, ...)               │
│      • input validation (zod)                             │
│      • returns { text + image/png } content               │
└──────────────────────────┬────────────────────────────────┘
                           │
┌──────────────────────────▼────────────────────────────────┐
│  L4  Tool implementations                                   │
│      • render_structure.ts                                 │
│      • render_blocks.ts                                    │
│      • inspect_structure.ts                                │
│      • render_item.ts                                      │
└──────────────────────────┬────────────────────────────────┘
                           │
┌──────────────────────────▼────────────────────────────────┐
│  L3  Render pipeline                                       │
│      • headless_canvas  — gl context from `gl` pkg         │
│      • camera           — view matrix presets              │
│      • encoder          — readPixels → PNG (pngjs)         │
└──────────────────────────┬────────────────────────────────┘
                           │
┌──────────────────────────▼────────────────────────────────┐
│  L2  deepslate engine                                      │
│      • StructureRenderer                                   │
│      • VoxelRenderer                                       │
│      • ItemRenderer                                        │
│      • BlockDefinition / BlockModel / TextureAtlas         │
└──────────────────────────┬────────────────────────────────┘
                           │
┌──────────────────────────▼────────────────────────────────┐
│  L1  Structure loaders                                     │
│      • nbt_loader      — .nbt (NbtFile.read)               │
│      • schem_loader    — .schem (Sponge format)            │
│      • litematic_loader — .litematic                       │
│      • builder         — programmatic blocks[]             │
└──────────────────────────┬────────────────────────────────┘
                           │
┌──────────────────────────▼────────────────────────────────┐
│  L0  Resource providers                                    │
│      • mcmeta_loader — fetch blockstates/models/atlas.json │
│      • jar_loader    — optional vanilla.jar overlay        │
│      • cache_manager — ~/.cache/deepslate-mcp/             │
└───────────────────────────────────────────────────────────┘
```

## 3. Data flow: a single render call

```
User / Agent
   │
   ▼  MCP call: render_structure({ nbt_path, angle, width, ... })
   │
L5  server validates input (zod) → resolves absolute paths
   │
L1  detect format (.nbt | .schem | .litematic) → load to `Structure`
   │
L0  ensure resources cached → build `Resources` provider
   │   (block defs, block models, texture atlas, item models)
   │
L3  create headless WebGL canvas (gl, width, height)
   │   with preserveDrawingBuffer: true  ← critical for readPixels
   │
L2  new StructureRenderer(gl, structure, resources)
   │   renderer.drawStructure(viewMatrix)
   │
L3  gl.readPixels(0, 0, w, h, RGBA, UNSIGNED_BYTE, buf)
   │   flip Y axis (WebGL origin is bottom-left)
   │   PNG.sync.write(PNG{width, height, data: buf})
   │
L5  return { content: [text, image/png base64] }
   ▼
Agent
```

## 4. Caching strategy

| Resource | Source | Cache location | Refresh policy |
|----------|--------|----------------|----------------|
| `data.min.json` blockstates | `misode/mcmeta@summary/assets/block_definition/` | `~/.cache/deepslate-mcp/mcmeta/` | on version bump |
| `data.min.json` models | `misode/mcmeta@summary/assets/model/` | same | on version bump |
| `atlas.png` + `data.min.json` UV map | `misode/mcmeta@atlas/all/` | same | on version bump |
| Vanilla client JAR (optional) | Mojang Piston API | `~/.cache/deepslate-mcp/jar/` | user-triggered |
| Custom resource pack ZIPs | user-provided path | not cached (read fresh each call) | n/a |

The cache is keyed by a content hash of the URL + the Minecraft
version pinned in `package.json`. A simple `CacheManager` exposes
`get(key)` / `put(key, Buffer)` / `purge(version?)`.

## 5. Headless WebGL notes

`gl` (headless-gl) gives us a real OpenGL context backed by
software-rasterization (`osmesa` on Linux, `cgl` on macOS, `wgl` on
Windows). Deepslate's `StructureRenderer` only uses WebGL 1 features,
so no extension negotiation is needed.

Two gotchas that bit us in earlier prototypes:

1. **`preserveDrawingBuffer: true`** — without it `readPixels` returns
   garbage because the framebuffer may be cleared between draw and read.
2. **Y-axis flip** — WebGL's origin is bottom-left; image encoders
   expect top-left. Flip in software (or use `gl.pixelStorei(UNPACK_FLIP_Y_WEBGL, true)` for texture uploads, but `readPixels` always reads bottom-up).

## 6. Why headless instead of pure CPU?

We considered a CPU-only path (rasterize each face, no GL):

| | headless WebGL | pure CPU |
|---|---|---|
| **Lines of code** | ~50 (canvas + flip) | ~2 000 (face rasterizer + UV mapping) |
| **Faithfulness** | identical to upstream deepslate | we'd have to reimplement model parsing |
| **Maintenance** | upstream tracks MC versions | we re-do it every release |
| **Perf (1024²)** | ~400 ms / structure | ~5–20 s / structure |

The headless path is the right call. Software rasterization is fine
for the structure sizes agents typically deal with (≤ 64³).

## 7. Module layout

```
src/
├── server.ts                  MCP entry (stdio)
├── tools/
│   ├── render_structure.ts
│   ├── render_blocks.ts
│   ├── inspect_structure.ts
│   └── render_item.ts
├── render/
│   ├── headless_canvas.ts     gl context wrapper
│   ├── camera.ts              view matrix presets
│   └── encoder.ts             PNG encoder
├── structures/
│   ├── nbt_loader.ts
│   ├── schem_loader.ts
│   ├── litematic_loader.ts
│   └── builder.ts
├── resources/
│   ├── mcmeta_loader.ts
│   ├── jar_loader.ts
│   └── cache_manager.ts
├── utils/
│   ├── logger.ts              stderr-only logger (don't pollute stdio)
│   └── paths.ts
└── version.ts                 MC version pin + cache key

bin/
└── deepslate-mcp.js           shebang → node --import tsx/esm src/server.ts

data/                          (gitignored, runtime cache mirror for tests)
```

## 8. Failure modes & UX

| Failure | Surface |
|---|---|
| File not found | tool returns `isError: true`, text content describes the path |
| Bad NBT | text content with parse error snippet |
| Network down on first run | text content asks user to pre-warm cache |
| Resource version mismatch | text content names required MC version |
| GL context failure | server exits non-zero on startup with hint to install `libgl1`/`mesa` |

All logs go to **stderr** — never stdout, because the MCP transport
treats stdout as protocol messages.

## 9. Future directions

- **HTTP transport** — alongside stdio, for multi-tenant setups.
- **Render-to-base64 without writing to disk** — for ephemeral previews.
- **Diff tool** — overlay two renders, highlight changed blocks.
- **Block-stat query tool** — `get_block_properties("minecraft:oak_door")`.
- **Bedrock world chunk sampler** — sample a chunk into a `Structure` and render.

These are tracked in [`ROADMAP.md`](./ROADMAP.md).