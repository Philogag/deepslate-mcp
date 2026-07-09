# DeepSlate MCP

> An MCP (Model Context Protocol) server that renders Minecraft structure
> files (NBT / Sponge schematic / Litematic) into PNG preview images using
> vanilla Minecraft resources.

`deepslate-mcp` wraps the [`misode/deepslate`](https://github.com/misode/deepslate)
rendering engine (MIT-licensed) inside a small MCP server, so any MCP-aware
agent — including [Hermes Agent](https://hermes-agent.nousresearch.com/) —
can call a tool and get a PNG back.

## Tools

| Tool | Description |
|------|-------------|
| `render_structure` | Load a `.nbt`/`.schem`/`.litematic` file from disk and render to PNG |
| `render_blocks` | Build a structure from a programmatic block list and render to PNG |
| `inspect_structure` | Read structure metadata (size, palette, block count) without rendering |
| `render_item` | Render a single Minecraft item/block as an icon |

Each tool supports configurable camera angles (isometric, top, front, side,
and custom rotation), background colour, output dimensions, and zoom level.

## At a glance

| | |
|---|---|
| **Language** | TypeScript / Node.js ≥ 20 |
| **License** | MIT (inherits upstream deepslate) |
| **Upstream** | [`misode/deepslate`](https://github.com/misode/deepslate) v0.26.0 |
| **Protocol** | MCP 2025-06-18 spec (stdio transport) |
| **Renderer** | headless WebGL via [`gl`](https://github.com/stackgl/headless-gl) |
| **Resources** | Vanilla Minecraft assets from Mojang's client.jar |
| **Tests** | [Vitest](https://vitest.dev/) — 65 unit + integration tests across 9 modules |

## Example call (from an MCP client)

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "render_structure",
    "arguments": {
      "nbt_path": "examples/fixtures/tiny_house.nbt",
      "angle": "isometric",
      "width": 1024,
      "height": 768
    }
  }
}
```

Response includes a text summary and an inline base64-encoded PNG image.

## Quick start

```bash
# Dependencies
npm install

# Build
npm run build

# Run (stdio MCP server)
node bin/deepslate-mcp.js

# Development (hot-reload via tsx)
npm run dev

# Smoke test (starts the server and exercises all tools)
npm run smoke

# Tests
npm test

# Lint (TypeScript strict check)
npm run lint
```

## System dependencies

On Linux, headless-gl requires Mesa libraries:

```bash
apt install libgl1-mesa-dev
```

The server expects an X display or virtual framebuffer (`Xvfb :99 -screen 0 1024x768x24`).

## Architecture

See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the full technical design.

M0 — Foundation (scaffold, build, basic MCP server)
M1 — Render core (headless WebGL, camera presets, PNG encoding)
M2 — Resource pipeline (Mojang client.jar extraction, blockstate/model/texture parsing)
M3 — Multi-format loaders (.nbt, .schem, .litematic)
M4 — MCP tools (4 tools wrapping the pipeline)
M5 — Hermes integration (MCP config, end-to-end tool calls from Hermes Agent)
M6 — Hardening (error UX, cache invalidation, progress reporting, unit tests, smoke test, lint, packaging, README polish)

All milestones complete — ready for v0.1.0 publication.

---

## 🏗️ Building Design Toolkit

This repository also includes a **Minecraft building design toolkit** as a
[Hermes Agent](https://hermes-agent.nousresearch.com/) skill —
[`minecraft-building-design`](./skill/minecraft-building-design/).

It provides:

- **Format specifications** for all three major Minecraft structure formats:
  Vanilla NBT, Create Mod schematic, and Litematica
- **Python generators** (zero external dependencies) to produce `.nbt`,
  `.litematic` files from code
- **Design helpers** (`fill_cuboid`, `hollow_cuboid`, mirror, rotate, etc.)
- **Example** — a modern villa generated in all three formats

To install:

```bash
# Via install script
bash skill/install.sh

# Or manually copy
cp -r skill/minecraft-building-design ~/.hermes/skills/creative/
```

Then in Hermes:
```
skill_view(name='minecraft-building-design')
```

The skill complements `deepslate-mcp` perfectly:
- **deepslate-mcp** renders existing `.nbt`/`.schem`/`.litematic` files to PNG
- **minecraft-building-design** builds those files from scratch

See [`skill/minecraft-building-design/SKILL.md`](./skill/minecraft-building-design/SKILL.md)
for full documentation.

## Resource caching

Vanilla resources (~3,500 blockstates, ~10,000 models, ~1,500 textures) are
extracted from Mojang's client.jar and cached to disk on first build.
Subsequent loads take ~0.2s instead of ~7s. Purge the cache with:

```bash
rm -rf ~/.cache/deepslate-mcp
```

## Environment variables

| Variable | Purpose |
|----------|---------|
| `DEEPSLATE_JAR_PATH` | Point to a pre-downloaded client.jar (skips network) |
| `DEEPSLATE_CACHE_DIR` | Override the cache directory (default: `~/.cache/deepslate-mcp`) |
| `DISPLAY` | X display for headless-gl (e.g. `:99`) |

## Credits

This project is built on top of
[`misode/deepslate`](https://github.com/misode/deepslate) by **Misode**,
licensed under MIT. See [`ATTRIBUTION.md`](./ATTRIBUTION.md) for full
upstream credits and license obligations.

Minecraft content and assets are © Mojang AB; this project never
distributes Mojang-owned assets — all resources are fetched at runtime
from official sources.

## License

MIT — see [`LICENSE`](./LICENSE).
