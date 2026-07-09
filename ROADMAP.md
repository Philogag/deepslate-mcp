# Roadmap & Milestone Breakdown

> Goal-by-goal decomposition of the `deepslate-mcp` project.

## North-star goal

> Expose `misode/deepslate`'s rendering as MCP tools so any MCP-aware
> agent can render Minecraft structure files to PNG.

## Top-level milestones

| # | Milestone | Deliverable | Status |
|---|-----------|-------------|--------|
| **M0** | **Foundation** | TypeScript project, deps installed, hello-world MCP server | ✅ Done (f04250a) |
| **M1** | **Render core** | headless-gl + deepslate bridge, CLI-style render to PNG | ✅ Done (557ecfc) |
| **M2** | **Resource pipeline** | Mojang vanilla client.jar route + cache | ✅ Done (054218d) |
| **M3** | **Multi-format loaders** | `.nbt`, `.schem`, `.litematic` readers | ✅ Done (557ecfc) |
| **M4** | **MCP tools** | 4 tools exposed: render_structure / render_blocks / inspect_structure / render_item | ✅ Done (e9ea591) |
| **M5** | **Hermes integration** | `mcp_config.json`, end-to-end call from Nova | ✅ Done |
| **M6** | **Hardening** | Error UX, tests, docs, packaging | ✅ Done |

---

## M0 — Foundation ✅

**Goal**: stand up a TypeScript Node.js project with a runnable
"hello MCP" server, on disk, committed.

**Commit**: `f04250a`

### Tasks

- [x] T0.1 `package.json` with deps:
  - `@modelcontextprotocol/server` ^1.29.0
  - `deepslate` ^0.26.0
  - `gl-matrix` ^3.3.0
  - `gl` ^8.0.0
  - `pngjs` ^7.0.0
  - `yauzl` ^3.0.0 (jar reader)
  - `zod` ^3.25
  - dev: `typescript`, `tsx`, `@types/node`, `@types/pngjs`
- [x] T0.2 `tsconfig.json` (NodeNext modules, ESM, strict)
- [x] T0.3 `bin/deepslate-mcp.js` shebang launcher
- [x] T0.4 `src/server.ts` registering one dummy `echo` tool
- [x] T0.5 `.gitignore` for `node_modules/`, `data/`, `dist/`, `*.log`
- [x] T0.6 Smoke test: `npm install && npm run dev` boots without error

### Exit criteria

- ✅ `node bin/deepslate-mcp.js` listens on stdio.
- ✅ An MCP inspector can list the `echo` tool and call it.
- ✅ Commit + push to `main`.

---

## M1 — Render core ✅

**Goal**: prove the headless WebGL bridge works end-to-end with a
hand-built `Structure` (no file I/O yet).

**Commit**: `557ecfc` (merged into Wave 2)

### Tasks

- [x] T1.1 `src/render/headless_canvas.ts`:
  - `createHeadlessCanvas(w, h)` returning `{ canvas, gl }`
  - `preserveDrawingBuffer: true` set
- [x] T1.2 `src/render/encoder.ts`:
  - `capturePNG(gl, w, h): Buffer` using `pngjs`
  - Y-axis flip inside the same function
- [x] T1.3 `src/render/camera.ts`:
  - `viewIsometric()`, `viewTop()`, `viewFront()`, `viewSide()`
  - uses `gl-matrix` `mat4`
- [x] T1.4 `src/render/pipeline.ts`:
  - `renderStructureToPNG(structure, resources, options): Promise<Buffer>`
  - wires canvas + camera + StructureRenderer + encoder
- [x] T1.5 `examples/demo-structure.ts`:
  - builds a 4×3×4 house from `Structure.addBlock(...)`
  - calls pipeline, writes to `examples/out/house.png`
- [x] T1.6 Hardcode a stub `resources` provider with `opaque:false`
  for all blocks (will be replaced in M2)

### Exit criteria

- ✅ `npm run demo` produces a non-empty `examples/out/house.png`.
- ✅ File size > 1 KB, opens in any image viewer, shows ~10 distinguishable
  cube faces.

---

## M2 — Resource pipeline ✅

**Goal**: replace the stub `resources` provider with the real
vanilla Minecraft client.jar resource pipeline and cache assets locally.

**Route change**: originally planned to use `misode/mcmeta`, but M2
pathfinding found mcmeta's data is not in the format deepslate needs.
Switched to the Mojang official vanilla client.jar route (more reliable).

**Commit**: `054218d` (initial impl), `fcfcdd7` (pipeline integration)

### Tasks

- [x] T2.1 `src/resources/cache_manager.ts`:
  - `get(key): Promise<Buffer | null>`, `put(key, Buffer)`, `purge()`
  - cache root from `DEEPSLATE_CACHE_DIR` env (default `~/.cache/deepslate-mcp/`)
- [x] T2.2 `src/resources/jar_loader.ts`:
  - Stream JAR via yauzl, extract blockstates/models/textures
- [x] T2.3 `src/resources/manifest.ts`:
  - `resolveVanillaJar()`: version manifest v2 → client.jar URL → download → cache
- [x] T2.4 `src/resources/index.ts`:
  - `buildResources()` orchestrator: parse blockstates → construct BlockModel → flatten parent chains → build TextureAtlas via deepslate
- [x] T2.5 Wire `buildResources()` into `pipeline.ts` from M1
- [x] T2.6 Test: re-render the demo structure — now shows
  **correctly textured** blocks (oak planks, glass, cobblestone).

### Exit criteria

- ✅ Demo PNG visibly matches the texture atlas (wood planks show
  the plank pattern, glass shows the glass tint).
- ✅ Cache directory created and populated.
- ✅ Re-runs hit cache (no network).

---

## M3 — Multi-format loaders ✅

**Goal**: read structures from real-world file formats, not just
in-memory builder.

**Commit**: `557ecfc` (merged into Wave 2)

### Tasks

- [x] T3.1 `src/structures/nbt_loader.ts`:
  - `loadNbtStructure(path: string): Promise<Structure>`
  - handles vanilla `.nbt` structure blocks (uses `NbtFile.read`)
- [x] T3.2 `src/structures/schem_loader.ts`:
  - `loadSchemStructure(path: string): Promise<Structure>`
  - Sponge format: `Width`, `Height`, `Length`, `Palette`, `BlockData`
  - uses `NbtFile.read` then maps palette indices
- [x] T3.3 `src/structures/litematic_loader.ts`:
  - `loadLitematicStructure(path: string): Promise<Structure>`
  - Litematica format: regions with block states (SNBT compounds)
- [x] T3.4 `src/structures/builder.ts`:
  - `Builder.fromBlocks(blocks: BlockSpec[]): Structure`
  - consolidates into a single `Structure` instance
- [x] T3.5 `src/structures/index.ts`:
  - `loadStructure(path: string): Promise<Structure>` dispatcher
  - detects format from extension
- [x] T3.6 Add 3 fixture files under `examples/fixtures/`:
  - `tiny_house.nbt`
  - `door.schem`
  - `tree.litematic`

### Exit criteria

- ✅ Each loader unit-tested with a real fixture.
- ✅ The dispatcher picks the right loader by extension.
- ✅ All three fixtures render to recognizable PNGs.

---

## M4 — MCP tools ✅

**Goal**: wrap the loader + pipeline into MCP `tools/*` calls.

**Commit**: `e9ea591`

### Tasks

- [x] T4.1 `src/tools/render_structure.ts`:
  - input (zod):
    - `nbt_path: string` (required)
    - `output_path?: string`
    - `angle: 'isometric'|'top'|'front'|'side'|'custom'` (default `isometric`)
    - `rotation_x?: number`, `rotation_y?: number` (radians, when `custom`)
    - `width?: number` (64–4096, default 1024)
    - `height?: number` (64–4096, default 768)
    - `background?: string` (CSS color or `"transparent"`)
  - returns: text summary + image/png content
- [x] T4.2 `src/tools/render_blocks.ts`:
  - input: `blocks: Array<{x,y,z,block_id,properties?}>`, `size:[w,h,d]?`
  - builds `Structure` in-memory, renders, returns
- [x] T4.3 `src/tools/inspect_structure.ts`:
  - returns structure size, palette summary, block counts, entity count
  - no rendering — pure metadata
- [x] T4.4 `src/tools/render_item.ts`:
  - input: `item_id: string`, `width?`, `height?`
  - uses `ItemRenderer` + same resources
- [x] T4.5 `src/server.ts` registers all four tools
- [x] T4.6 `src/utils/paths.ts`:
  - resolves relative paths against `cwd` or absolute path

### Exit criteria

- ✅ MCP inspector lists all 4 tools with their schemas.
- ✅ Each tool returns a valid response on a fixture input.
- ✅ Tool errors return `isError: true` with helpful text.

---

## M5 — Hermes integration ✅

**Goal**: Nova (Hermes Agent) can call our tools in a real conversation.

**Commit**: (Hermes config — no code change needed)

### Tasks

- [x] T5.1 Write `~/.hermes/profiles/meo/mcp_config.json`:
  - `deepslate-mcp` server entry pointing at our `bin/deepslate-mcp.js`
- [x] T5.2 Restart the Hermes session — confirm `mcp__deepslate-mcp__*`
  tools appear in tool list.
- [x] T5.3 End-to-end conversation test:
  - Ask Nova: "Render examples/fixtures/tiny_house.nbt to PNG"
  - Verify tool call → PNG written → response text delivered
- [x] T5.4 Document in `INTEGRATION.md`:
  - exact config snippet
  - how to update after local rebuilds
  - how to read MCP logs (stderr of the server process)

### Exit criteria

- A natural-language request in chat triggers the tool call.
- The user receives the rendered PNG within the chat reply.

---

## M6 — Hardening ✅

**Goal**: ship a v0.1 that's safe to publish to npm.

### Tasks

- [x] T6.1 Error UX audit (every `throw` becomes a friendly message)
  → All tool handlers wrap errors in `isError: true` with `❌` prefix
- [x] T6.2 Cache invalidation (TTL, version mismatch)
  → Version metadata stored alongside cached resources; stale version = rebuild
- [x] T6.3 Progress reporting for large structures
  → 10% progress logs on stderr for schem (>100k blocks) and litematic (>100k blocks)
- [x] T6.4 Unit tests for each loader (vitest)
  → Added 17 tests across nbt_loader, schem_loader, litematic_loader, index dispatcher
- [x] T6.5 Integration test: full M0–M4 smoke under `npm test`
  → 8 integration tests (tools/list, all 4 tools, error handling) — 65 total tests
- [x] T6.6 `npm pack` dry-run — confirm only `dist/`, `README`,
  `LICENSE`, `package.json` are bundled
  → Debug files excluded from tsconfig; dist verified clean
- [x] T6.7 `npm run lint` + `npm run lint:strict` — both pass clean
- [x] T6.8 README + ROADMAP updated to reflect M6 completion

### Exit criteria

- All 65 tests green.
- README "Quick Start" works on a fresh checkout.
- ATTRIBUTION.md reflects any new upstream dependencies (none added).

---

## Stretch goals (post-v0.1)

- ⬜ HTTP/SSE transport alongside stdio
- ⬜ Bedrock `.mcworld` reader (via amulet-core, optional heavy dep)
- ⬜ Render-to-base64 (no disk write)
- ⬜ `compare_structures(a, b)` diff overlay
- ⬜ Custom Java resource-pack overlay (additive to vanilla)
- ⬜ Render queue / batch mode
- ⬜ Web UI demo that embeds the MCP server over HTTP
- ⬜ **`minecraft-building-design` skill** — a Hermes skill for authoring
  structure files from code (Vanilla NBT / Create schematic / Litematica).
  Included as [`skill/minecraft-building-design/`](./skill/minecraft-building-design/);
  see its [SKILL.md](./skill/minecraft-building-design/SKILL.md) for details.

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