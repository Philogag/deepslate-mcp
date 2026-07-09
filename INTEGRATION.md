# Hermes Integration

> How to configure Hermes Agent to call deepslate-mcp tools in a live
> conversation.

## Prerequisites

- **Hermes Agent** installed and running (v2.x+ with native MCP support)
- **deepslate-mcp** built (`npm run build` in the project root)
- **Xvfb** or equivalent virtual display (for headless WebGL rendering)
- **Node.js ≥ 20**

## Configure MCP Server

Add deepslate-mcp as an MCP server in Hermes:

```bash
# Using the hermes CLI (recommended):
hermes mcp add deepslate \
  --command node \
  --args /path/to/deepslate-mcp/bin/deepslate-mcp.js
```

Or add manually to `~/.hermes/config.yaml` (or the active profile's
`config.yaml`):

```yaml
mcp_servers:
  deepslate:
    command: node
    args:
      - /opt/data/profiles/meo/workspace/deepslate-mcp/bin/deepslate-mcp.js
    enabled: true
```

Restart Hermes (or start a new session). On startup Hermes will:

1. Connect to the deepslate-mcp stdio server
2. Discover 4 tools via `tools/list`
3. Register them with the `mcp_deepslate_*` prefix

## Available Tools

After configuration, these tools appear in every Hermes session:

| Hermes tool name | MCP tool | Description |
|---|---|---|
| `mcp_deepslate_render_structure` | `render_structure` | Load + render .nbt/.schem/.litematic to PNG |
| `mcp_deepslate_render_blocks` | `render_blocks` | Build from programmatic block list → PNG |
| `mcp_deepslate_inspect_structure` | `inspect_structure` | Read structure metadata without rendering |
| `mcp_deepslate_render_item` | `render_item` | Single item/block icon (e.g. diamond_sword) |

### Tool: `render_structure`

```json
{
  "nbt_path": "examples/fixtures/tiny_house.nbt",
  "angle": "isometric",
  "width": 1024,
  "height": 768
}
```

Returns: text summary + base64 PNG image.

### Tool: `render_blocks`

```json
{
  "size": [5, 5, 5],
  "blocks": [
    { "position": [0, 0, 0], "block_id": "minecraft:stone" },
    { "position": [1, 0, 0], "block_id": "minecraft:oak_planks" }
  ],
  "width": 512,
  "height": 512
}
```

### Tool: `inspect_structure`

```json
{ "nbt_path": "examples/fixtures/tiny_house.nbt" }
```

Returns: size, block count, palette summary.

### Tool: `render_item`

```json
{ "item_id": "minecraft:diamond_sword", "width": 256, "height": 256 }
```

## Using in Conversation

Once configured, just ask naturally:

> "Render the house at examples/fixtures/tiny_house.nbt"
> "Show me what a diamond sword looks like"
> "Inspect the structure at house.nbt"

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Tools not appearing | Server not connected | Check `hermes mcp list` or `/reload-mcp` |
| `mcp_deepslate_*` not found | MCP SDK not installed | `pip install mcp` |
| `DISPLAY` errors | Xvfb not running | Start with `Xvfb :99 -screen 0 1024x768x24 &` |
| "Failed to connect" | Build stale or command not found | Run `npm run build` |

## Verification

1. Config check: `hermes mcp list` should show `deepslate` with 4 tools
2. Start a new session: `/reset`
3. Ask: "Render examples/fixtures/tiny_house.nbt as a PNG"
