# DeepSlate MCP

> An MCP (Model Context Protocol) server that renders Minecraft structure
> files (NBT / Sponge schematic / Litematic) into PNG preview images using
> vanilla Minecraft resources.

`deepslate-mcp` wraps the [`misode/deepslate`](https://github.com/misode/deepslate)
rendering engine (MIT-licensed) inside a small MCP server, so any MCP-aware
agent — including [Hermes Agent](https://hermes-agent.nousresearch.com/) —
can call a `render_structure` tool and get a PNG back.

## At a glance

| | |
|---|---|
| **Language** | TypeScript / Node.js ≥ 18 |
| **License** | MIT (inherits upstream deepslate) |
| **Upstream** | [`misode/deepslate`](https://github.com/misode/deepslate) v0.26.0 |
| **Protocol** | MCP 2025-06-18 spec |
| **Transport** | stdio (HTTP planned) |
| **Renderer** | headless WebGL via [`gl`](https://github.com/stackgl/headless-gl) |
| **Resources** | Vanilla Minecraft assets (auto-fetched from `misode/mcmeta`) |

## Why?

Minecraft has rich block-state data: thousands of variants, model-driven
geometry, biome-colored foliage, transparent overlays, animated textures.
Writing a faithful renderer from scratch is ~5 000–10 000 LOC. `misode/deepslate`
already does this and is used by the official Minecraft Wiki to generate
block preview images.

We stand on its shoulders and expose the capability through MCP so any
LLM-driven agent can produce accurate structure previews on demand.

## Example call (from an MCP client)

```json
{
  "tool": "render_structure",
  "arguments": {
    "nbt_path": "examples/house.nbt",
    "angle": "isometric",
    "width": 1024,
    "height": 768
  }
}
```

Response:

```json
{
  "content": [
    { "type": "text", "text": "✅ Rendered in 412 ms → /tmp/house.png" },
    { "type": "image", "mimeType": "image/png", "data": "<base64>" }
  ]
}
```

## Status

**Phase 0 — planning.** See [`ROADMAP.md`](./ROADMAP.md) for the full
milestone breakdown and [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the
technical design.

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