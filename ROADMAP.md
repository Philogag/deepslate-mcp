# Roadmap & Milestone Breakdown

> Goal-by-goal decomposition of the `deepslate-mcp` project.

## North-star goal

> Expose `misode/deepslate`'s rendering as MCP tools so any MCP-aware
> agent can render Minecraft structure files to PNG.

## Top-level milestones

| # | Milestone | Deliverable | Status |
|---|-----------|-------------|--------|
| **M0** | **Foundation** | TypeScript project, deps installed, hello-world MCP server | ⬜ |
| **M1** | **Render core** | headless-gl + deepslate bridge, CLI-style render to PNG | ⬜ |
| **M2** | **Resource pipeline** | mcmeta auto-fetch + local cache + version pin | ⬜ |
| **M3** | **Multi-format loaders** | `.nbt`, `.schem`, `.litematic` readers | ⬜ |
| **M4** | **MCP tools** | 4 tools exposed: render_structure / render_blocks / inspect_structure / render_item | ⬜ |
| **M5** | **Hermes integration** | `mcp_config.json`, end-to-end call from Nova | ⬜ |
| **M6** | **Hardening** | Error UX, tests, docs, packaging | ⬜ |

---

## M0 — Foundation

**Goal**: stand up a TypeScript Node.js project with a runnable
"hello MCP" server, on disk, committed.

### Tasks

- [ ] T0.1 `package.json` with deps:
  - `@modelcontextprotocol/server` ^1.29.0
  - `deepslate` ^0.26.0
  - `gl-matrix` ^3.3.0
  - `gl` ^8.0.0
  - `pngjs` ^7.0.0
  - `yauzl` ^3.0.0 (jar reader)
  - `zod` ^3.25
  - dev: `typescript`, `tsx`, `@types/node`, `@types/pngjs`
- [ ] T0.2 `tsconfig.json` (NodeNext modules, ESM, strict)
- [ ] T0.3 `bin/deepslate-mcp.js` shebang launcher
- [ ] T0.4 `src/server.ts` registering one dummy `echo` tool
- [ ] T0.5 `.gitignore` for `node_modules/`, `data/`, `dist/`, `*.log`
- [ ] T0.6 Smoke test: `npm install && npm run dev` boots without error

### Exit criteria

- `node bin/deepslate-mcp.js` listens on stdio.
- An MCP inspector (e.g. `mcp-inspector npx ...`) can list the `echo`
  tool and call it.
- Commit + push to `main`.

---

## M1 — Render core

**Goal**: prove the headless WebGL bridge works end-to-end with a
hand-built `Structure` (no file I/O yet).

### Tasks

- [ ] T1.1 `src/render/headless_canvas.ts`:
  - `createHeadlessCanvas(w, h)` returning `{ canvas, gl }`
  - `preserveDrawingBuffer: true` set
- [ ] T1.2 `src/render/encoder.ts`:
  - `capturePNG(gl, w, h): Buffer` using `pngjs`
  - Y-axis flip inside the same function
- [ ] T1.3 `src/render/camera.ts`:
  - `viewIsometric()`, `viewTop()`, `viewFront()`, `viewSide()`
  - uses `gl-matrix` `mat4`
- [ ] T1.4 `src/render/pipeline.ts`:
  - `renderStructureToPNG(structure, resources, options): Promise<Buffer>`
  - wires canvas + camera + StructureRenderer + encoder
- [ ] T1.5 `examples/demo-structure.ts`:
  - builds a 4×3×4 house from `Structure.addBlock(...)`
  - calls pipeline, writes to `examples/out/house.png`
- [ ] T1.6 Hardcode a stub `resources` provider with `opaque:false`
  for all blocks (will be replaced in M2)

### Exit criteria

- `npm run demo` produces a non-empty `examples/out/house.png`.
- File size > 1 KB, opens in any image viewer, shows ~10 distinguishable
  cube faces.

---

## M2 — Resource pipeline

**Goal**: replace the stub `resources` provider with the real
`misode/mcmeta` pipeline and cache assets locally.

### Tasks

- [ ] T2.1 `src/resources/cache_manager.ts`:
  - `get(key): Promise<Buffer | null>`, `put(key, Buffer)`, `purge()`
  - cache root from `DEEPSLATE_CACHE_DIR` env (default `~/.cache/deepslate-mcp/`)
- [ ] T2.2 `src/resources/mcmeta_loader.ts`:
  - `fetchBlockDefinitions()` → `Record<string, BlockDefinition>`
  - `fetchBlockModels()` → `Record<string, BlockModel>`
  - `fetchTextureAtlas()` → `{ image: ImageData, uvMap: Record<string, UV> }`
  - URLs from constants file, version pinned in `src/version.ts`
- [ ] T2.3 `src/resources/index.ts`:
  - `buildResources()` orchestrator
  - on first call: fetch all, cache, return
  - on subsequent calls: return from cache if version matches
- [ ] T2.4 Wire `buildResources()` into `pipeline.ts` from M1
- [ ] T2.5 Test: re-render the demo structure — should now show
  **correctly textured** blocks (oak planks, glass, cobblestone).

### Exit criteria

- Demo PNG visibly matches the texture atlas (wood planks show
  the plank pattern, glass shows the glass tint).
- Cache directory created and populated.
- Re-runs hit cache (no network).

---

## M3 — Multi-format loaders

**Goal**: read structures from real-world file formats, not just
in-memory builder.

### Tasks

- [ ] T3.1 `src/structures/nbt_loader.ts`:
  - `loadNbtStructure(path: string): Promise<Structure>`
  - handles vanilla `.nbt` structure blocks (uses `NbtFile.read`)
- [ ] T3.2 `src/structures/schem_loader.ts`:
  - `loadSchemStructure(path: string): Promise<Structure>`
  - Sponge format: `Width`, `Height`, `Length`, `Palette`, `BlockData`
  - uses `NbtFile.read` then maps palette indices
- [ ] T3.3 `src/structures/litematic_loader.ts`:
  - `loadLitematicStructure(path: string): Promise<Structure>`
  - Litematica format: regions with block states (SNBT compounds)
- [ ] T3.4 `src/structures/builder.ts`:
  - `Builder.fromBlocks(blocks: BlockSpec[]): Structure`
  - consolidates into a single `Structure` instance
- [ ] T3.5 `src/structures/index.ts`:
  - `loadStructure(path: string): Promise<Structure>` dispatcher
  - detects format from extension
- [ ] T3.6 Add 3 fixture files under `examples/fixtures/`:
  - `tiny_house.nbt`
  - `door.schem`
  - `tree.litematic`

### Exit criteria

- Each loader unit-tested with a real fixture.
- The dispatcher picks the right loader by extension.
- All three fixtures render to recognizable PNGs.

---

## M4 — MCP tools

**Goal**: wrap the loader + pipeline into MCP `tools/*` calls.

### Tasks

- [ ] T4.1 `src/tools/render_structure.ts`:
  - input (zod):
    - `nbt_path: string` (required)
    - `output_path?: string`
    - `angle: 'isometric'|'top'|'front'|'side'|'custom'` (default `isometric`)
    - `rotation_x?: number`, `rotation_y?: number` (radians, when `custom`)
    - `width?: number` (64–4096, default 1024)
    - `height?: number` (64–4096, default 768)
    - `background?: string` (CSS color or `"transparent"`)
  - returns: text summary + image/png content
- [ ] T4.2 `src/tools/render_blocks.ts`:
  - input: `blocks: Array<{x,y,z,block_id,properties?}>`, `size:[w,h,d]?`
  - builds `Structure` in-memory, renders, returns
- [ ] T4.3 `src/tools/inspect_structure.ts`:
  - returns structure size, palette summary, block counts, entity count
  - no rendering — pure metadata
- [ ] T4.4 `src/tools/render_item.ts`:
  - input: `item_id: string`, `width?`, `height?`
  - uses `ItemRenderer` + same resources
- [ ] T4.5 `src/server.ts` registers all four tools
- [ ] T4.6 `src/utils/paths.ts`:
  - resolves relative paths against `cwd` or absolute path

### Exit criteria

- MCP inspector lists all 4 tools with their schemas.
- Each tool returns a valid response on a fixture input.
- Tool errors return `isError: true` with helpful text.

---

## M5 — Hermes integration

**Goal**: Nova (Hermes Agent) can call our tools in a real conversation.

### Tasks

- [ ] T5.1 Write `~/.hermes/profiles/meo/mcp_config.json`:
  - `deepslate-mcp` server entry pointing at our `bin/deepslate-mcp.js`
- [ ] T5.2 Restart the Hermes session — confirm `mcp__deepslate-mcp__*`
  tools appear in tool list.
- [ ] T5.3 End-to-end conversation test:
  - Ask Nova: "Render examples/fixtures/tiny_house.nbt to PNG"
  - Verify tool call → PNG written → response text delivered
- [ ] T5.4 Document in `INTEGRATION.md`:
  - exact config snippet
  - how to update after local rebuilds
  - how to read MCP logs (stderr of the server process)

### Exit criteria

- A natural-language request in chat triggers the tool call.
- The user receives the rendered PNG within the chat reply.

---

## M6 — Hardening

**Goal**: ship a v0.1 that's safe to publish to npm.

### Tasks

- [ ] T6.1 Error UX audit (every `throw` becomes a friendly message)
- [ ] T6.2 Cache invalidation policy (TTL, version mismatch)
- [ ] T6.3 Progress reporting for large structures (stderr progress,
  not stdout)
- [ ] T6.4 Unit tests for each loader (vitest)
- [ ] T6.5 Integration test: full M0–M4 smoke under `npm test`
- [ ] T6.6 `npm pack` dry-run — confirm only `dist/`, `README`,
  `LICENSE`, `package.json` are bundled
- [ ] T6.7 `npm run lint` (eslint + prettier)
- [ ] T6.8 Publish `deepslate-mcp@0.1.0` to npm (optional, can
  stay private to `philogag` org)

### Exit criteria

- All tests green.
- README "Quick Start" works on a fresh checkout.
- ATTRIBUTION.md reflects any new upstream dependencies.

---

## Stretch goals (post-v0.1)

- ⬜ HTTP/SSE transport alongside stdio
- ⬜ Bedrock `.mcworld` reader (via amulet-core, optional heavy dep)
- ⬜ Render-to-base64 (no disk write)
- ⬜ `compare_structures(a, b)` diff overlay
- ⬜ Custom Java resource-pack overlay (additive to vanilla)
- ⬜ Render queue / batch mode
- ⬜ Web UI demo that embeds the MCP server over HTTP

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| `headless-gl` fails to install on Linux without `libgl1` | medium | document `apt install libgl1-mesa-dev`; provide a CPU fallback in v0.2 |
| `misode/mcmeta` URL layout changes | low | pin version in `version.ts`; check upstream before bumping |
| Deepslate API churns (0.26 → 0.27) | medium | pin to `~0.26.0`; track upstream releases; upgrade in dedicated PR |
| MCP spec v2 lands mid-project | low | v1 SDK is LTS for 6+ months post-v2 |
| Hermes MCP transport bugs at our boundary | medium | keep `stdio` as primary; isolate Hermes-specific config in one file |

## Effort estimate

| Phase | Estimate |
|---|---|
| M0 | 0.5 day |
| M1 | 0.5 day |
| M2 | 1 day |
| M3 | 1 day |
| M4 | 1 day |
| M5 | 0.5 day |
| M6 | 1.5 day |
| **Total** | **~6 working days** |